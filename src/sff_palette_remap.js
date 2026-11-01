'use strict';

const zlib = require('zlib');
const { decodePng } = require('./palette_index_organizer_model');
const { crc32 } = require('./sff_png8_source');

function chunk(type, data) {
  const name = Buffer.from(type), result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0); name.copy(result, 4); data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8); return result;
}

function encodeIndexed(width, height, indices, colors) {
  const padded = colors.map(color => color.map(channel => Math.max(0, Math.min(255, Math.round(Number(channel) || 0)))));
  if (padded.length !== 256 || padded.some(color => color.length !== 4)) throw new Error('Target SFF palette must contain exactly 256 RGBA colors.');
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) { const at = y * (width + 1); raw[at] = 0; indices.copy(raw, at + 1, y * width, (y + 1) * width); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 3;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('PLTE', Buffer.from(padded.flatMap(color => color.slice(0, 3)))), chunk('tRNS', Buffer.from(padded.map(color => color[3]))), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function key(color) { return color.join(','); }
function distanceSquared(left, right) {
  const dr = left[0] - right[0], dg = left[1] - right[1], db = left[2] - right[2], da = left[3] - right[3];
  return dr * dr + dg * dg + db * db + da * da * 2;
}

function remapPngToPalette(buffer, targetColors) {
  if (!Array.isArray(targetColors) || targetColors.length !== 256 || targetColors.some(color => !Array.isArray(color) || color.length !== 4)) throw new Error('Target SFF palette must contain exactly 256 RGBA colors.');
  const decoded = decodePng(buffer), exact = new Map();
  targetColors.forEach((color, index) => { const id = key(color); if (!exact.has(id)) exact.set(id, index); });
  const cache = new Map(), indices = Buffer.alloc(decoded.width * decoded.height), changedColors = new Map();
  let changedPixels = 0, visibleChangedPixels = 0, totalDistance = 0, maximumDistance = 0, transparentChanged = 0;
  for (let at = 0, pixel = 0; at < decoded.rgba.length; at += 4, pixel += 1) {
    const rgba = [...decoded.rgba.subarray(at, at + 4)], id = key(rgba);
    let target = exact.get(id), distance = 0;
    if (target === undefined) {
      const cached = cache.get(id);
      if (cached) ({ target, distance } = cached);
      else {
        target = 0; distance = Infinity;
        for (let index = 0; index < targetColors.length; index += 1) {
          const candidate = targetColors[index], candidateDistance = distanceSquared(rgba, candidate);
          if (candidateDistance < distance) { distance = candidateDistance; target = index; if (!distance) break; }
        }
        cache.set(id, { target, distance }); changedColors.set(id, { source: rgba, targetIndex: target, target: targetColors[target], distance: Math.sqrt(distance) });
      }
      changedPixels += 1; totalDistance += Math.sqrt(distance); maximumDistance = Math.max(maximumDistance, Math.sqrt(distance));
      if ((rgba[3] === 0) !== (targetColors[target][3] === 0)) transparentChanged += 1;
      if (rgba[3] !== 0 || targetColors[target][3] !== 0) visibleChangedPixels += 1;
    }
    indices[pixel] = target;
  }
  return {
    buffer: encodeIndexed(decoded.width, decoded.height, indices, targetColors), width: decoded.width, height: decoded.height,
    lossless: changedPixels === 0, visuallyLossless: visibleChangedPixels === 0 && transparentChanged === 0,
    changedPixels, visibleChangedPixels, totalPixels: indices.length, changedColorCount: changedColors.size,
    averageDistance: changedPixels ? totalDistance / changedPixels : 0, maximumDistance, transparentChanged,
    changes: [...changedColors.values()].sort((left, right) => right.distance - left.distance)
  };
}

module.exports = { encodeIndexed, distanceSquared, remapPngToPalette };
