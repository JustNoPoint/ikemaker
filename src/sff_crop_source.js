'use strict';

const crypto = require('crypto');
const { readIndexedPng8 } = require('./sff_png8_source');
const { indexedSourcePng } = require('./sff_reader');

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex').toUpperCase(); }

function visibleBounds(decoded) {
  let left = decoded.width, top = decoded.height, right = -1, bottom = -1, visiblePixels = 0;
  for (let y = 0; y < decoded.height; y += 1) for (let x = 0; x < decoded.width; x += 1) {
    const index = decoded.indices[y * decoded.width + x];
    if (decoded.colors[index][3] === 0) continue;
    visiblePixels += 1; left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (!visiblePixels) return Object.freeze({ empty: true, x: 0, y: 0, width: 0, height: 0, visiblePixels: 0 });
  return Object.freeze({ empty: false, x: left, y: top, width: right - left + 1, height: bottom - top + 1, visiblePixels });
}

function inspectIndexedCrop(buffer) {
  const decoded = readIndexedPng8(buffer), bounds = visibleBounds(decoded);
  return Object.freeze({ width: decoded.width, height: decoded.height, bounds, changed: !bounds.empty && (bounds.x !== 0 || bounds.y !== 0 || bounds.width !== decoded.width || bounds.height !== decoded.height), decodedHash: decoded.decodedHash });
}

function cropIndexedPng8(buffer) {
  const decoded = readIndexedPng8(buffer), bounds = visibleBounds(decoded);
  if (bounds.empty) throw new Error('The indexed sprite is fully transparent, so a reviewed crop rectangle cannot be derived.');
  if (bounds.x === 0 && bounds.y === 0 && bounds.width === decoded.width && bounds.height === decoded.height) return Object.freeze({ buffer: Buffer.from(buffer), bounds, changed: false, sourceByteHash: sha256(buffer), outputByteHash: sha256(buffer), decodedHash: decoded.decodedHash, paletteHash: sha256(Buffer.from(decoded.colors.flat())) });
  const indices = Buffer.alloc(bounds.width * bounds.height);
  for (let row = 0; row < bounds.height; row += 1) decoded.indices.copy(indices, row * bounds.width, (bounds.y + row) * decoded.width + bounds.x, (bounds.y + row) * decoded.width + bounds.x + bounds.width);
  const output = indexedSourcePng(bounds.width, bounds.height, indices, decoded.colors);
  return Object.freeze({ buffer: output, bounds, changed: true, sourceByteHash: sha256(buffer), outputByteHash: sha256(output), decodedHash: sha256(indices), paletteHash: sha256(Buffer.from(decoded.colors.flat())) });
}

module.exports = { visibleBounds, inspectIndexedCrop, cropIndexedPng8 };
