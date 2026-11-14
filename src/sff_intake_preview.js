'use strict';

function sourcePreview(bytes, decoded = require('./palette_index_organizer_model').decodePng(bytes), bounds = {x:0,y:0,width:decoded.width,height:decoded.height}) {
  const scale = Math.min(1, 140 / Math.max(bounds.width, bounds.height));
  const width = Math.max(1, Math.round(bounds.width * scale)), height = Math.max(1, Math.round(bounds.height * scale));
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const from = ((bounds.y + Math.min(bounds.height - 1, Math.floor(y / scale))) * decoded.width + (bounds.x + Math.min(bounds.width - 1, Math.floor(x / scale)))) * 4;
    decoded.rgba.copy(pixels, (y * width + x) * 4, from, from + 4);
  }
  return 'data:image/png;base64,' + require('./sff_reader').rgbaPng(width, height, pixels).toString('base64');
}

function installIntakePreview(prefix, sources, anchor, offsetX, offsetY, paletteChoice, palettes, cropMode = 'none') {
  const field = document.getElementById(prefix === 'sffAdd' ? 'sffAddCrop' : 'offsetY');
  if (!field || !document.createElement || typeof field.closest !== 'function') return;
  const id = prefix + 'RegistrationPreview';
  let root = document.getElementById(id);
  if (!root) {
    root = document.createElement('div'); root.id = id;
    root.innerHTML = '<p><b>Registration and palette preview</b> · Source pixels; palette choice is reviewed before writing.</p><select aria-label="Preview source image"></select><div style="position:relative;width:220px;height:180px;overflow:hidden;background:repeating-conic-gradient(#484848 0% 25%,#363636 0% 50%) 0 0/16px 16px"><img alt="Source image registration preview" style="position:absolute;image-rendering:pixelated"><span style="position:absolute;left:109px;top:20px;width:1px;height:160px;background:#ffca52"></span><span style="position:absolute;left:10px;top:139px;width:200px;height:1px;background:#ffca52"></span></div><output style="display:block"></output><div aria-label="Chosen palette colors" style="display:flex;flex-wrap:wrap;max-width:400px"></div>';
    field.closest('section').append(root);
  }
  const list = root.querySelector('select'), prior = list.value;
  list.replaceChildren(...sources.filter(item => item.previewImage).map(item => new Option(item.name, item.id)));
  if ([...list.options].some(item => item.value === prior)) list.value = prior;
  const draw = () => {
    const source = sources.find(item => item.id === list.value), image = root.querySelector('img');
    image.hidden = !source; list.hidden = list.options.length < 2;
    const output = root.querySelector('output');
    root.querySelector('[aria-label="Chosen palette colors"]').replaceChildren();
    if (!source) { output.textContent = sources.length ? 'Preview is limited to the first 32 small compatible images. Import eligibility is unchanged.' : 'Choose images to preview registration.'; return; }
    const bounds=source.previewBounds||{x:0,y:0,width:source.width,height:source.height},cropped=cropMode!=='none'&&source.previewCroppedImage;
    const w=cropped?bounds.width:source.width,h=cropped?bounds.height:source.height,axisWidth=cropMode==='before-axis'?w:source.width,axisHeight=cropMode==='before-axis'?h:source.height;
    const ax = anchor.endsWith('left') ? 0 : anchor.endsWith('right') ? axisWidth : Math.floor(axisWidth/2);
    const ay = anchor.startsWith('top') ? 0 : anchor.startsWith('bottom') ? axisHeight : Math.floor(axisHeight/2);
    const x=ax+Number(offsetX||0)-(cropMode==='after-axis'?bounds.x:0),y=ay+Number(offsetY||0)-(cropMode==='after-axis'?bounds.y:0),scale=Math.min(1,140/Math.max(w,h));
    image.src=cropped?source.previewCroppedImage:source.previewImage;image.style.width=w*scale+'px';image.style.height=h*scale+'px';image.style.left=110-x*scale+'px';image.style.top=140-y*scale+'px';
  const swatches = root.querySelector('[aria-label="Chosen palette colors"]'); swatches.replaceChildren();
  const chosen = palettes?.find(item => 'master:' + item.id === paletteChoice || 'target:' + item.id === paletteChoice);
  for (const color of (chosen?.colors || (paletteChoice === 'image' ? sources.find(item => item.id === list.value)?.previewColors : []) || [])) { const swatch = document.createElement('span'); swatch.style.cssText = 'width:12px;height:12px;background:rgba(' + color.slice(0,3).concat((color[3] ?? 255)/255).join(',') + ')'; swatch.title = color.join(', '); swatches.append(swatch); }
    const exactMaster=paletteChoice.startsWith('master:'), used = source.previewUsedColors || source.previewColors || [], matches = new Set((chosen?.colors || []).filter((color,index)=>index&&color[3]>0).map(color=>color.join(','))), missing = chosen&&exactMaster ? used.filter(color=>color[3]>0&&!matches.has(color.join(','))).length : 0;
    output.textContent = (cropMode==='before-axis'&&bounds.empty?'Cannot crop an empty image before computing its axis. ':'') + (chosen&&!exactMaster?'Matching-index palette: exact source table must match before writing. ':chosen ? (missing ? 'Cannot commit: '+missing+' source color(s) do not exactly match this palette. ' : 'Exact palette mapping preserves these source colors. ') : '') + source.width + '×' + source.height + ' · ' + anchor + ' · '+(cropped?'saved cropped axis':'source axis')+' ' + x + ', ' + y + ' · Palette: ' + paletteChoice;
  };
  list.onchange = draw; draw();

}

// Optional previews must never reject otherwise admitted artwork. Limit decompression work
// independently from import; only small thumbnails and at most 257 colors leave this call.
function previewData(bytes) {
  try {
    if(bytes.length > 4*1024*1024 || bytes.readUInt32BE(16)*bytes.readUInt32BE(20) > 4000000) return {previewUnavailable:true};
    const decoded = require('./palette_index_organizer_model').decodePng(bytes,{maximumPixels:4000000});
    const colors = [], seen = new Set();
    let left = decoded.width, top = decoded.height, right = -1, bottom = -1;
    for (let y = 0; y < decoded.height; y++) {
      for (let x = 0; x < decoded.width; x++) {
        const at = (y * decoded.width + x) * 4;
        if (!decoded.rgba[at + 3]) continue;
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
        if (colors.length > 256) continue;
        const key = decoded.rgba.readUInt32BE(at);
        if (seen.has(key)) continue;
        seen.add(key);
        colors.push(Array.from(decoded.rgba.subarray(at, at + 4)));
      }
    }
    const bounds = right < 0 ? {x:0, y:0, width:decoded.width, height:decoded.height, empty:true}
      : {x:left, y:top, width:right-left+1, height:bottom-top+1};
    const previewImage = sourcePreview(bytes, decoded);
    const fullImage = bounds.width === decoded.width && bounds.height === decoded.height;
    return {
      previewBounds: bounds, previewImage, previewColors: colors, previewUsedColors: colors,
      previewCroppedImage: fullImage ? previewImage : sourcePreview(bytes, decoded, bounds)
    };
  } catch (_) { return {previewUnavailable:true}; }
}

function clientScript() { return installIntakePreview.toString(); }
module.exports = {sourcePreview, previewData, clientScript};
