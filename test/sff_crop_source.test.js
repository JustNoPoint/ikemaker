'use strict';

const assert = require('assert');
const { indexedSourcePng } = require('../src/sff_reader');
const { readIndexedPng8 } = require('../src/sff_png8_source');
const { inspectIndexedCrop, cropIndexedPng8 } = require('../src/sff_crop_source');

const colors = Array.from({ length: 256 }, (_, index) => [index, index ^ 80, 255 - index, index ? 255 : 0]);
const source = indexedSourcePng(5, 4, Buffer.from([
  0, 0, 0, 0, 0,
  0, 3, 4, 0, 0,
  0, 5, 6, 0, 0,
  0, 0, 0, 0, 0
]), colors);
const inspection = inspectIndexedCrop(source);
assert.deepStrictEqual({ ...inspection.bounds }, { empty: false, x: 1, y: 1, width: 2, height: 2, visiblePixels: 4 });
assert.strictEqual(inspection.changed, true);
const cropped = cropIndexedPng8(source), decoded = readIndexedPng8(cropped.buffer);
assert.deepStrictEqual([decoded.width, decoded.height], [2, 2]);
assert.deepStrictEqual([...decoded.indices], [3, 4, 5, 6]);
assert.deepStrictEqual(decoded.colors, colors, 'before-axis crop must preserve the complete indexed palette');
assert.strictEqual(cropped.sourceByteHash.length, 64); assert.strictEqual(cropped.outputByteHash.length, 64);
const full = indexedSourcePng(2, 2, Buffer.from([1, 2, 3, 4]), colors);
assert.strictEqual(cropIndexedPng8(full).changed, false, 'an already tight source remains byte-identical');
const empty = indexedSourcePng(2, 2, Buffer.alloc(4), colors);
assert.throws(() => cropIndexedPng8(empty), /fully transparent/);

console.log('SFF indexed crop preparation preserves pixels, palette, bounds, hashes, and transparent-source safety');
