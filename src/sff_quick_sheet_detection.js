'use strict';

const { rgbaPng } = require('./sff_reader');
const LIMITS = Object.freeze({ maximumPixels: 16_000_000, maximumRuns: 262144, maximumComponents: 4096 });

function createUnion(width, height, rule) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > LIMITS.maximumPixels) throw new Error('Automatic sheet detection is limited to 16 million pixels. Choose Exact grid for larger sheets.');
  if (!['alpha','top-left-color','palette-index'].includes(rule?.mode) || rule.mode === 'palette-index' && (!Number.isInteger(rule.index) || rule.index < 0 || rule.index > 255)) throw new Error('Choose an explicit alpha, top-left color, or palette-index background rule.');
  const mask = Buffer.alloc(width * height), preview = Buffer.alloc(width * height * 4), pages = [];
  function add(image, pageOrdinal) {
    if (image.width !== width || image.height !== height) throw new Error('Selected layers must share one exact detection canvas.');
    if (rule.mode === 'palette-index' && !image.indices) throw new Error('A palette-index background requires every selected layer to be indexed. Choose alpha or top-left color instead.');
    const indices = image.indices, table = indices && Buffer.from(image.colors.flat()), rgba = image.rgba;
    const base = indices ? table.subarray(indices[0] * 4, indices[0] * 4 + 4) : rgba.subarray(0,4);
    pages.push({ pageOrdinal, topLeftRgba: [...base] });
    for (let pixel = 0, out = 0; pixel < mask.length; pixel++, out += 4) {
      const from = indices ? indices[pixel] * 4 : out, plane = indices ? table : rgba;
      const r = plane[from], g = plane[from + 1], b = plane[from + 2], alpha = plane[from + 3];
      if (alpha && !(rule.mode === 'palette-index' && indices[pixel] === rule.index) && !(rule.mode === 'top-left-color' && r === base[0] && g === base[1] && b === base[2] && alpha === base[3])) mask[pixel] = 1;
      // The detection key never hides opaque source artwork in review. A user
      // can include matching pixels manually even when no initial cuts exist.
      if (!alpha) continue;
      if (alpha === 255) { preview[out]=r;preview[out+1]=g;preview[out+2]=b;preview[out+3]=255;continue; }
      const destAlpha = preview[out + 3], combined = alpha + destAlpha * (255 - alpha) / 255;
      preview[out] = Math.round((r * alpha + preview[out] * destAlpha * (255 - alpha) / 255) / combined);
      preview[out + 1] = Math.round((g * alpha + preview[out + 1] * destAlpha * (255 - alpha) / 255) / combined);
      preview[out + 2] = Math.round((b * alpha + preview[out + 2] * destAlpha * (255 - alpha) / 255) / combined);
      preview[out + 3] = Math.round(combined);
    }
  }
  return { add, result() { return { ...connectedRectangles(mask, width, height), previewPng: rgbaPng(width,height,preview), background: { ...rule, pages }, width,height }; } };
}

// Scanline components keep work bounded even on alternating/noisy artwork.
// Only the prior row is searched, and union-find avoids repeated flood fills.
function connectedRectangles(mask, width, height) {
  const cap = LIMITS.maximumRuns, parent = new Int32Array(cap), left = new Int32Array(cap), top = new Int32Array(cap), right = new Int32Array(cap), bottom = new Int32Array(cap);
  let used = 0, previous = [];
  const root = id => { let current = id; while (parent[current] !== current) current = parent[current]; while (parent[id] !== id) { const next = parent[id]; parent[id] = current; id = next; } return current; };
  const join = (a,b) => { a = root(a); b = root(b); if (a === b) return; if (a > b) [a,b] = [b,a]; parent[b] = a; left[a] = Math.min(left[a],left[b]); right[a] = Math.max(right[a],right[b]); top[a] = Math.min(top[a],top[b]); bottom[a] = Math.max(bottom[a],bottom[b]); };
  for (let y = 0; y < height; y++) {
    const current = []; let prior = 0;
    for (let x = 0; x < width;) {
      if (!mask[y * width + x]) { x++; continue; }
      const start = x; while (++x < width && mask[y * width + x]) {}
      if (used >= cap) return { rectangles: [], warnings: ['The sheet exceeds the bounded component-run limit. Draw the intended cuts manually in review.'], limited: true };
      const id = used++; parent[id] = id; left[id] = start; right[id] = x; top[id] = y; bottom[id] = y + 1;
      while (prior < previous.length && previous[prior].right < start) prior++;
      for (let at = prior; at < previous.length && previous[at].left <= x; at++) join(id,previous[at].id);
      current.push({ id,left:start,right:x });
    }
    previous = current;
  }
  const rectangles = [];
  for (let id = 0; id < used; id++) if (root(id) === id) {
    if (rectangles.length >= LIMITS.maximumComponents) return { rectangles: [], warnings: ['More than 4096 disconnected pieces were found. Draw or group the intended sprites manually in review.'], limited: true };
    rectangles.push({ x:left[id],y:top[id],width:right[id]-left[id],height:bottom[id]-top[id] });
  }
  rectangles.sort((a,b)=>a.y-b.y||a.x-b.x);
  return { rectangles,warnings:rectangles.length ? ['Disconnected artwork pieces are proposed separately. Adjust or group their cuts before approving.'] : ['No foreground was found with this background rule. Add cuts manually or cancel and choose another rule.'],limited:false };
}

module.exports = { LIMITS, createUnion };
