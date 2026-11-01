'use strict';

const crypto = require('crypto');
const { decodePng } = require('./palette_index_organizer_model');

function renderedPixelHash(png) {
  const decoded = decodePng(png), rgba = Buffer.from(decoded.rgba);
  for (let at = 0; at < rgba.length; at += 4) if (rgba[at + 3] === 0) rgba.fill(0, at, at + 3);
  const dimensions = Buffer.allocUnsafe(8); dimensions.writeUInt32LE(decoded.width, 0); dimensions.writeUInt32LE(decoded.height, 4);
  return crypto.createHash('sha256').update(dimensions).update(rgba).digest('hex');
}

function selectByEvidence(archive, mode, current, references = new Map(), renderedHashes = new Map()) {
  const sprites = archive?.sprites || [];
  if (!current) return [];
  if (mode === 'palette') return sprites.filter(sprite => sprite.paletteIndex === current.paletteIndex);
  if (mode === 'dimensions') return sprites.filter(sprite => sprite.width === current.width && sprite.height === current.height);
  if (mode === 'format') return sprites.filter(sprite => sprite.format === current.format && sprite.colorDepth === current.colorDepth);
  if (mode === 'referenced' || mode === 'unreferenced') return sprites.filter(sprite => Boolean((references.get(`${sprite.group},${sprite.number}`) || []).length) === (mode === 'referenced'));
  const sets = new Map();
  for (const sprite of sprites) {
    const digest = renderedHashes.get(sprite.index);
    if (!digest) throw new Error(`Exact rendered-pixel evidence is missing for sprite ${sprite.group},${sprite.number}.`);
    if (!sets.has(digest)) sets.set(digest, []);
    sets.get(digest).push(sprite);
  }
  if (mode === 'duplicate-current') {
    const result = sets.get(renderedHashes.get(current.index)) || [];
    return result.length > 1 ? result : [];
  }
  if (mode === 'duplicate-all') return [...sets.values()].filter(items => items.length > 1).flat().sort((a, b) => a.index - b.index);
  throw new Error(`Unknown SFF selection evidence rule ${mode}.`);
}

module.exports = { renderedPixelHash, selectByEvidence };
