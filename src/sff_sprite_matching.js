'use strict';

const { spritePng, resolvedSprite } = require('./sff_reader');
const { spriteSilhouette } = require('./sff_silhouette');
const { decodePng } = require('./palette_index_organizer_model');
const { analyzeMask } = require('./sff_auto_axis_model');
const MAX_PIXELS = 1000000;

function spriteAppearance(archive, sprite, png = null) {
  const source = resolvedSprite(archive, sprite);
  if (source.width * source.height > MAX_PIXELS) throw new Error('Sprite matching is limited to one million pixels per image.');
  const bytes = png || spritePng(archive, sprite), shape = spriteSilhouette(archive, sprite, bytes);
  const image = decodePng(bytes, { maximumDimension: 8192, maximumPixels: MAX_PIXELS });
  const rgba = Buffer.from(image.rgba);
  for (let pixel = 0; pixel < shape.mask.length; pixel++) {
    // Match authored nonzero indexes even if preview palette alpha is zero.
    if (!shape.mask[pixel]) rgba.fill(0, pixel * 4, pixel * 4 + 4);
    else if (shape.transparencyBasis === 'index-zero') rgba[pixel * 4 + 3] = 255;
  }
  return { ...shape, rgba, bounds: analyzeMask(shape).bounds };
}

function appearanceSignature(image) {
  const size = 32, mask = new Uint8Array(size * size), rgb = new Uint8Array(size * size * 3), bounds = image.bounds;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = bounds.left + Math.min(bounds.width - 1, Math.floor((x + .5) * bounds.width / size));
      const sy = bounds.top + Math.min(bounds.height - 1, Math.floor((y + .5) * bounds.height / size));
      const from = sy * image.width + sx, to = y * size + x;
      mask[to] = image.mask[from];
      if (mask[to]) rgb.set(image.rgba.subarray(from * 4, from * 4 + 3), to * 3);
    }
  }
  return { mask, rgb, ratio: bounds.width / bounds.height };
}

function similarity(a, b) {
  let union = 0, intersection = 0, color = 0;
  for (let index = 0; index < a.mask.length; index++) {
    if (a.mask[index] || b.mask[index]) union++;
    if (a.mask[index] && b.mask[index]) {
      intersection++;
      color += 1 - (Math.abs(a.rgb[index * 3] - b.rgb[index * 3]) +
        Math.abs(a.rgb[index * 3 + 1] - b.rgb[index * 3 + 1]) +
        Math.abs(a.rgb[index * 3 + 2] - b.rgb[index * 3 + 2])) / 765;
    }
  }
  const shape = union ? intersection / union : 0, colors = intersection ? color / intersection : 0;
  const aspect = Math.min(a.ratio, b.ratio) / Math.max(a.ratio, b.ratio);
  return Math.max(0, Math.min(100, 100 * shape * (.5 + .5 * colors) * aspect));
}

async function findSimilarSprites(archive, sourceIndex, options = {}, services = {}) {
  const source = archive.sprites[sourceIndex], threshold = Number(options.threshold ?? 80);
  if (!source) throw new Error('Select an existing sprite before searching.');
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) throw new Error('Similarity threshold must be from 0 through 100 percent.');
  const appearance = services.appearance || spriteAppearance, sourceImage = appearance(archive, source);
  const signature = appearanceSignature(sourceImage), rows = [], skipped = [];
  let pixels = sourceImage.width * sourceImage.height, scanned = 0;
  const maximumSprites = 4096, maximumPixels = 16000000;
  for (const sprite of archive.sprites) {
    if (services.cancelled?.()) throw new Error('Sprite search was superseded or the archive changed.');
    if (sprite.index === sourceIndex || options.samePalette && sprite.paletteIndex !== source.paletteIndex) continue;
    if (scanned >= maximumSprites) {
      skipped.push({ index: sprite.index, reason: '4096-sprite scan limit' }); continue;
    }
    const resolved = resolvedSprite(archive, sprite), count = resolved.width * resolved.height;
    if (count > MAX_PIXELS || pixels + count > maximumPixels) {
      skipped.push({ index: sprite.index, reason: 'image or 16-million-pixel scan limit' }); continue;
    }
    scanned++; pixels += count;
    try {
      const image = appearance(archive, sprite), score = similarity(signature, appearanceSignature(image));
      if (score + 1e-8 >= threshold) {
        rows.push({ index: sprite.index, group: sprite.group, number: sprite.number, score: Math.round(score * 100) / 100,
          width: sprite.width, height: sprite.height, paletteIndex: sprite.paletteIndex });
      }
    } catch (error) { skipped.push({ index: sprite.index, reason: error.message }); }
    if (scanned % 16 === 0) await new Promise(resolve => setImmediate(resolve));
  }
  rows.sort((a, b) => b.score - a.score || a.index - b.index);
  return {
    source: { index: source.index, group: source.group, number: source.number }, threshold,
    samePalette: Boolean(options.samePalette), scanned, totalMatches: rows.length, rows: rows.slice(0, 100), skipped,
    limited: rows.length > 100 || skipped.length > 0, limits: { maximumSprites, maximumPixels, resultLimit: 100 },
    warning: sourceImage.reason
  };
}

module.exports = { spriteAppearance, appearanceSignature, similarity, findSimilarSprites, MAX_PIXELS };
