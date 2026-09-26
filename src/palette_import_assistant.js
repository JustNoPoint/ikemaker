'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pngPaletteRgba } = require('./palette_library');

function pngInfo(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 33 || buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Not a valid PNG image.');
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') throw new Error('PNG is missing its IHDR header.');
  const colorType = buffer[25], indexed = colorType === 3;
  let colors = null, transparentIndex = null;
  if (indexed) {
    colors = pngPaletteRgba(buffer);
    transparentIndex = colors.findIndex((color) => color[3] === 0);
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), bitDepth: buffer[24], colorType, indexed, colors, transparentIndex };
}

function fingerprint(colors) { return colors ? crypto.createHash('sha256').update(Buffer.from(colors.flat())).digest('hex').toUpperCase() : ''; }

function inspectImages(files) {
  return files.map((filename) => {
    try {
      const info = pngInfo(fs.readFileSync(filename));
      return { filename, name: path.basename(filename), ...info, paletteSize: info.colors?.length || 0, paletteFingerprint: fingerprint(info.colors), state: info.indexed ? info.transparentIndex === 0 ? 'ready' : 'review' : 'conversion-required', detail: info.indexed ? info.transparentIndex === 0 ? 'Indexed PNG with transparent index 0.' : `Indexed PNG; transparent index is ${info.transparentIndex < 0 ? 'not declared' : info.transparentIndex}.` : 'True-color PNG must be indexed against a reviewed master palette before SFF import.' };
    } catch (error) { return { filename, name: path.basename(filename), state: 'error', detail: error.message, indexed: false }; }
  });
}

function batchSummary(items) {
  const fingerprints = new Set(items.filter((item) => item.paletteFingerprint).map((item) => item.paletteFingerprint));
  const states = Object.fromEntries(['ready', 'review', 'conversion-required', 'error'].map((state) => [state, items.filter((item) => item.state === state).length]));
  const safeToStage = items.length > 0 && states['conversion-required'] === 0 && states.error === 0 && states.review === 0 && fingerprints.size <= 1;
  const title = !items.length ? 'No sprites selected' : safeToStage ? `${items.length} sprite${items.length === 1 ? '' : 's'} ready for reviewed import` : `${items.length} sprite${items.length === 1 ? '' : 's'} need review`;
  const detail = !items.length ? 'Choose PNG files to inspect their indexing and transparency.' : `${states.ready} ready · ${states.review} transparency review · ${states['conversion-required']} need indexing · ${states.error} unreadable · ${fingerprints.size} distinct indexed palette${fingerprints.size === 1 ? '' : 's'}.`;
  return { ...states, title, detail, sharedPalette: fingerprints.size <= 1 && items.some((item) => item.indexed), paletteCount: fingerprints.size, safeToStage };
}

module.exports = { pngInfo, fingerprint, inspectImages, batchSummary };
