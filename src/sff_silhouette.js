'use strict';
const { resolvedSprite, spriteIndexPlane, spritePng } = require('./sff_reader');
const { alphaMaskFromPng } = require('./image_alpha_mask');
// Palette alpha is preview metadata. SFF indexed silhouettes always reserve index 0.
function spriteSilhouette(archive, sprite, png = null, options = {}) {
  const alphaThreshold = options.alphaThreshold === undefined ? 1 : Number(options.alphaThreshold);
  if (!Number.isSafeInteger(alphaThreshold) || alphaThreshold < 1 || alphaThreshold > 255) throw new Error('Alpha cutoff must be a whole number from 1 to 255.');
  const source = resolvedSprite(archive, sprite);
  if ([5, 8].includes(Number(source.colorDepth))) {
    const plane = spriteIndexPlane(archive, sprite);
    return { width: plane.width, height: plane.height, mask: Uint8Array.from(plane.indices, index => index === 0 ? 0 : 1), hasAlpha: true, reason: '', transparencyBasis: 'index-zero', sourcePhysicalIndex: plane.sourcePhysicalIndex };
  }
  const image = alphaMaskFromPng(png || spritePng(archive, sprite), alphaThreshold);
  const hasAlpha = Number(source.colorDepth) !== 24;
  return { ...image, hasAlpha, reason: hasAlpha ? '' : 'RGB24 has no alpha silhouette; the full image rectangle is only a low-confidence guide.', transparencyBasis: hasAlpha ? 'pixel-alpha' : 'opaque-rgb24', sourcePhysicalIndex: source.index };
}
module.exports = { spriteSilhouette };
