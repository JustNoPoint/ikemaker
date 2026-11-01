'use strict';

const path = require('path');
const { readAct, INDEX_ORDER, REVERSED_ORDER } = require('./act_palette_order');
const { readIndexedPng } = require('./palette_indexed_png');

const LIMITS = Object.freeze({ maximumFiles: 32, maximumActBytes: 4096, maximumImageBytes: 64 * 1024 * 1024 });
const REPAIR_IMAGE_EXTENSIONS = new Set(['.bmp', '.gif', '.jpeg', '.jpg', '.pcx', '.psd', '.tga', '.webp']);

function exactColors(colors) {
  if (!Array.isArray(colors) || colors.length !== 256) throw new Error('A dropped palette must resolve to exactly 256 RGBA indexes.');
  return colors.map((color, index) => {
    if (!Array.isArray(color) || color.length !== 4 || color.some(value => !Number.isInteger(value) || value < 0 || value > 255)) throw new Error(`Dropped palette index ${index} is not exact RGBA.`);
    return color.slice();
  });
}

function exactColorList(colors) {
  if (!Array.isArray(colors) || !colors.length || colors.length > 256) throw new Error('Dropped colors must contain from 1 through 256 RGBA entries.');
  return colors.map((color, index) => {
    if (!Array.isArray(color) || color.length !== 4 || color.some(value => !Number.isInteger(value) || value < 0 || value > 255)) throw new Error(`Dropped color ${index} is not exact RGBA.`);
    return color.slice();
  });
}

function pngColorType(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error('The dropped PNG has no valid PNG/IHDR header.');
  return bytes[25];
}

function decodeDroppedPalette(file, options = {}) {
  const name = path.basename(String(file?.name || '')), extension = path.extname(name).toLowerCase(), bytes = Buffer.isBuffer(file?.bytes) ? file.bytes : Buffer.from(file?.bytes || '', 'base64');
  if (!name || !bytes.length) throw new Error('The dropped palette file is empty or unnamed.');
  if (extension === '.act') {
    if (bytes.length > LIMITS.maximumActBytes) throw new Error('The dropped ACT exceeds the bounded palette-file size.');
    const order = options.actOrder === REVERSED_ORDER ? REVERSED_ORDER : INDEX_ORDER;
    return { kind: 'palette', format: 'act', name, colors: exactColors(readAct(bytes, order)), entryCount: 256 };
  }
  if (extension === '.png') {
    if (bytes.length > LIMITS.maximumImageBytes) throw new Error('The dropped PNG exceeds the bounded image-file size.');
    if (pngColorType(bytes) !== 3) return { kind: 'repair-required', format: 'png', name, reason: 'True-color PNGs must enter the indexed-image repair path before their colors can be placed in Bank B.' };
    const decoded = readIndexedPng(bytes);
    return { kind: 'palette', format: 'indexed-png', name, colors: exactColors(decoded.colors), entryCount: decoded.entries, width: decoded.width, height: decoded.height };
  }
  if (REPAIR_IMAGE_EXTENSIONS.has(extension)) {
    if (bytes.length > LIMITS.maximumImageBytes) throw new Error('The dropped image exceeds the bounded image-file size.');
    return { kind: 'repair-required', format: extension.slice(1), name, reason: `${extension.slice(1).toUpperCase()} must enter the image repair/indexing path before it can supply Bank B colors.` };
  }
  throw new Error('Palette Workshop drops accept ACT, indexed PNG, or a supported image that can be sent to repair.');
}

function dropPlacement(clientX, left, width) {
  const ratio = width > 0 ? (Number(clientX) - Number(left)) / Number(width) : .5;
  if (ratio <= .25) return 'insert-before';
  if (ratio >= .75) return 'insert-after';
  return 'replace';
}

function placeColors(colors, incoming, destination, mode = 'replace', requestedCount) {
  const current = exactColors(colors), source = exactColorList(incoming), at = Number(destination);
  if (!Number.isInteger(at) || at < 1 || at > 255) throw new Error('Transparent index 0 is protected and cannot be a drop destination.');
  const count = Math.min(256, Math.max(1, Number(requestedCount) || source.length));
  const selected = source.slice(0, count);
  if (mode === 'replace') {
    const usable = selected.slice(0, 256 - at);
    usable.forEach((color, offset) => { current[at + offset] = color.slice(); });
    return { colors: current, range: [at, at + usable.length - 1], mode: 'replace' };
  }
  const insertion = mode === 'insert-after' ? at + 1 : at;
  if (insertion < 1 || insertion > 256) throw new Error('The dropped colors do not fit at that insertion point.');
  const usable = selected.slice(0, 256 - insertion), result = current.slice(0, insertion).concat(usable, current.slice(insertion));
  result.length = 256;
  return { colors: result, range: [insertion, insertion + usable.length - 1], mode: 'insert' };
}

module.exports = { LIMITS, REPAIR_IMAGE_EXTENSIONS, decodeDroppedPalette, dropPlacement, placeColors, exactColors, exactColorList, pngColorType };
