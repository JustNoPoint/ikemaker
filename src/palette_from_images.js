'use strict';
const {
    decodePng
} = require('./palette_index_organizer_model');
const {
    pcx8
} = require('./sff_reader');
const LIMITS = {
    files: 32,
    bytes: 32 * 1024 * 1024,
    pixels: 4000000,
    colors: 65536
};

function decodeImage(bytes, name, options = {}) {
    if (/\.png$/i.test(name)) {
        return decodePng(bytes, {
            maximumFileBytes: LIMITS.bytes,
            maximumPixels: LIMITS.pixels
        });
    }
    if (!/\.pcx$/i.test(name) || bytes.length < 128 || bytes[0] !== 10 ||
        bytes[3] !== 8 || ![1, 3].includes(bytes[65]) || ![0, 1].includes(bytes[2])) {
        throw Error('Choose PNG or 8-bit indexed / RGB PCX images.');
    }
    const width = bytes.readUInt16LE(8) - bytes.readUInt16LE(4) + 1;
    const height = bytes.readUInt16LE(10) - bytes.readUInt16LE(6) + 1;
    const stride = bytes.readUInt16LE(66),
        planes = bytes[65];
    if (width < 1 || height < 1 || width * height > LIMITS.pixels ||
        stride < width || stride * height * planes > LIMITS.pixels * 6) {
        throw Error('PCX dimensions exceed the image limit.');
    }
    const indexed = planes === 1;
    if (indexed && (bytes.length < 897 || bytes[bytes.length - 769] !== 12)) {
        throw Error('Indexed PCX is missing its 256-color palette.');
    }
    const end = indexed ? bytes.length - 769 : bytes.length;
    const data = pcx8(bytes.subarray(128, end), stride * planes, height, stride * planes, bytes[2] === 1);
    const table = indexed ? bytes.subarray(bytes.length - 768) : null;
    const rgba = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const at = (y * width + x) * 4,
                row = y * stride * planes;
            if (indexed) {
                const index = data[row + x];
                table.copy(rgba, at, index * 3, index * 3 + 3);
            } else {
                for (let channel = 0; channel < 3; channel++) rgba[at + channel] = data[row + channel * stride + x];
            }
            rgba[at + 3] = indexed && options.pcxTransparentZero !== false && data[row + x] === 0 ? 0 : 255;
        }
    }
    return {
        width,
        height,
        rgba
    };
}

function buildWorkingPalette(files, options = {}) {
    if (!Array.isArray(files) || !files.length || files.length > LIMITS.files) throw Error('Choose 1 through 32 images.');
    let bytes = 0,
        pixels = 0,
        transparentPixels = 0,
        partialAlphaPixels = 0;
    const histogram = new Map(),
        sources = [];
    for (const file of files) {
        bytes += file.bytes.length;
        if (bytes > LIMITS.bytes) throw Error('Combined image files exceed 32 MB.');
        const image = decodeImage(file.bytes, file.name, options);
        pixels += image.width * image.height;
        if (pixels > LIMITS.pixels) throw Error('Combined images exceed 4 million pixels.');
        sources.push({
            name: file.name,
            width: image.width,
            height: image.height
        });
        for (let i = 0; i < image.rgba.length; i += 4) {
            const alpha = image.rgba[i + 3];
            if (!alpha) {
                transparentPixels++;
                continue
            }
            if (alpha < 255) partialAlphaPixels++;
            const id = image.rgba[i] * 0x1000000 + (image.rgba[i + 1] << 16) + (image.rgba[i + 2] << 8) + alpha;
            const item = histogram.get(id);
            if (item) { item.count++; continue; }
            histogram.set(id, {color:[image.rgba[i], image.rgba[i+1], image.rgba[i+2], alpha], count:1});
            if (histogram.size > LIMITS.colors) throw Error('Images exceed the 65,536-color review limit.');
        }
    }
    const maximum = options.maximum === undefined ? 255 : Number(options.maximum);
    if (!Number.isInteger(maximum) || maximum < 1 || maximum > 255) throw new Error('Choose 1 through 255 nontransparent colors.');
    const reduction = options.reduction === 'median' ? 'median' : 'nearest';
    const ranked = [...histogram.values()].sort((a, b) => b.count - a.count || a.color.join(',').localeCompare(b.color.join(',')));
    let kept = ranked.slice(0, maximum);
    let merges;
    if (reduction === 'median' && ranked.length > maximum) {
        const reduced = require('./palette_merge').reduceGrouped([[0, 0, 0, 0], ...ranked.map(item => item.color)], [0, ...ranked.map(item => item.count)], maximum);
        kept = reduced.colors.slice(1).map(color => ({ color, count: 0 }));
        const rows = ranked.map((item, index) => {
            const target = reduced.groups[index + 1];
            kept[target - 1].count += item.count;
            return { ...item, index: target, to: kept[target - 1].color };
        });
        const order = kept.map((item, index) => ({ ...item, original: index })).sort((left, right) => right.count - left.count || left.original - right.original);
        const destination = new Map(order.map((item, index) => [item.original + 1, index + 1]));
        kept = order;
        merges = rows.filter(item => item.color.some((channel, index) => channel !== item.to[index])).map(item => ({ ...item, index: destination.get(item.index) }));
    } else merges = ranked.slice(maximum).map(item => {
            let target = 0,
                distance = Infinity;
            kept.forEach((candidate, index) => {
                const d = candidate.color.reduce((sum, c, n) => sum + (c - item.color[n]) ** 2 * (n === 3 ? 2 : 1), 0);
                if (d < distance) {
                    distance = d;
                    target = index
                }
            });
            return {
                ...item,
                index: target + 1,
                to: kept[target].color
            }
        });
    const colors = [
            [0, 0, 0, 0], ...kept.map(item => item.color)
        ];
    while (colors.length < 256) colors.push([0, 0, 0, 255]);
    return {
        sources,
        pixels,
        transparentPixels,
        partialAlphaPixels,
        maximum,
        reduction,
        pcxTransparentZero: options.pcxTransparentZero !== false,
        hasIndexedPcx: files.some(file => /\.pcx$/i.test(file.name) && file.bytes[65] === 1),
        changedPixels: merges.reduce((sum, row) => sum + row.count, 0),
        paddedSlots: 255 - kept.length,
        originalColors: histogram.size + (transparentPixels ? 1 : 0),
        resultColors: kept.length,
        ranked: kept,
        merges,
        colors
    };
}

function baseReviewHtml(review, page) {
    const pageSize = 512, pages = Math.max(1, Math.ceil(review.merges.length / pageSize));
    const current = Math.min(Math.max(0, Number.isSafeInteger(page) ? page : 0), pages - 1);
    const start = current * pageSize, end = Math.min(start + pageSize, review.merges.length);
    const paging = pages > 1 ? `<p>Changes ${start+1}–${end} of ${review.merges.length}</p><button data-page="${current-1}" ${current===0?'disabled':''}>Previous changes</button> <button data-page="${current+1}" ${current===pages-1?'disabled':''}>Next changes</button>` : '';
    const escape = value => String(value).replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    } [c]));
    const swatch = c => `<span style="display:inline-block;width:24px;height:24px;box-sizing:border-box;border:1px solid #8888;background:rgba(${c.slice(0,3).join(',')},${c[3]/255})" title="${c.join(',')}"></span>`;
    return `<!doctype html><html><body style="font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background)"><h1>Create From Images · Review</h1><p>${review.sources.map(x=>escape(x.name)).join(' · ')}</p><p>${review.originalColors} original colors → ${review.resultColors} resulting nontransparent swatches. ${review.transparentPixels} transparent pixels share locked index 0. RGB PCX is opaque. ${review.partialAlphaPixels} partial-alpha pixels retain their alpha unless merged. ${review.paddedSlots} unused draft slots are padded black; these are not extracted swatches. ${review.changedPixels} source pixels would change through merges.</p>${review.hasIndexedPcx?`<label><input id="pcxZero" type="checkbox" ${review.pcxTransparentZero?'checked':''}>Treat indexed PCX palette entry 0 as transparent</label>`:''}<p>Colors ranked by combined pixel usage. Excess colors merge into the nearest retained RGBA color.</p><div style="display:grid;grid-template-columns:repeat(16,24px);gap:2px">${review.ranked.map(x=>swatch(x.color)).join('')}</div><details ${Number.isSafeInteger(page) ? 'open' : ''}><summary>${review.merges.length} colors would merge</summary>${paging}<ul>${review.merges.slice(start,end).map(x=>`<li>${swatch(x.color)} RGBA ${x.color.join(',')} (${x.count} ${x.count===1?'pixel':'pixels'}) → index ${x.index} ${swatch(x.to)} RGBA ${x.to.join(',')}</li>`).join('')}</ul></details><p>Creating a working draft leaves all images and sprites unchanged. Inspect and edit the draft before using Add to SFF plan.</p><button id="create">Create working palette</button><script>const vscode=acquireVsCodeApi();for(const button of document.querySelectorAll('[data-page]'))button.onclick=()=>vscode.postMessage({type:'mergePage',page:Number(button.dataset.page)});const pcxZero=document.getElementById('pcxZero');if(pcxZero)pcxZero.onchange=()=>vscode.postMessage({type:'pcxTransparency',transparentZero:pcxZero.checked});document.getElementById('create').onclick=()=>vscode.postMessage({type:'createWorkingPalette'});</script></body></html>`;
}
function reviewHtml(review, page) {
    const controls = `<label>Reduction <select id="reduction"><option value="median" ${review.reduction === 'median' ? 'selected' : ''}>Frequency-weighted median cut</option><option value="nearest" ${review.reduction === 'nearest' ? 'selected' : ''}>Keep most used; nearest RGBA</option></select></label> <label>Maximum nontransparent colors <input id="maximum" type="number" min="1" max="255" value="${review.maximum}"></label><button id="reviewReduction">Review reduction</button>`;
    return baseReviewHtml(review, page)
        .replace('<p>Colors ranked by combined pixel usage. Excess colors merge into the nearest retained RGBA color.</p>', `<p>${review.reduction === 'median' ? 'Frequency-weighted median cut uses integer RGBA centroids, ranked by combined usage. Every changed input color is listed below.' : 'Colors ranked by combined pixel usage. Excess colors merge into the nearest retained RGBA color.'}</p>${controls}`)
        .replace("document.getElementById('create').onclick", "document.getElementById('reviewReduction').onclick=()=>vscode.postMessage({type:'reviewReduction',reduction:document.getElementById('reduction').value,maximum:Number(document.getElementById('maximum').value)});document.getElementById('create').onclick");
}

module.exports = {
    LIMITS,
    decodeImage,
    buildWorkingPalette,
    reviewHtml
};
