'use strict';

const crypto = require('crypto');
const path = require('path');
const { readIndexedPng8 } = require('./sff_png8_source');
const { encodeIndexed } = require('./sff_palette_remap');

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function normalizeSprMake2IndexedPng(buffer, filename = 'indexed PNG') {
  const decoded = readIndexedPng8(buffer), partialAlphaIndexes = [];
  decoded.colors.forEach((color, index) => { if (color[3] !== 0 && color[3] !== 255) partialAlphaIndexes.push(index); });
  if (partialAlphaIndexes.length) return {
    bytes: buffer, normalized: false, compatible: false, partialAlphaIndexes,
    reason: `${path.basename(filename)} uses ${partialAlphaIndexes.length} partially transparent palette entr${partialAlphaIndexes.length === 1 ? 'y' : 'ies'} that SprMake2 cannot preserve through indexed-PNG palette intake.`
  };
  const bytes = encodeIndexed(decoded.width, decoded.height, decoded.indices, decoded.colors);
  return {
    bytes, normalized: !bytes.equals(buffer), compatible: true, partialAlphaIndexes: [],
    decodedHash: decoded.decodedHash, paletteHash: sha256(Buffer.from(decoded.colors.flat()))
  };
}

module.exports = { normalizeSprMake2IndexedPng };
