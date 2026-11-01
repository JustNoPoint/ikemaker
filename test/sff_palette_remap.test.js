'use strict';

const assert = require('assert');
const { encodeIndexed, remapPngToPalette } = require('../src/sff_palette_remap');
const { readIndexedPng8 } = require('../src/sff_png8_source');

const sourceColors = Array.from({ length: 256 }, (_, index) => [index, index, index, index === 0 ? 0 : 255]);
sourceColors[2] = [250, 10, 10, 255];
const targetColors = sourceColors.map(color => [...color]); targetColors[2] = [248, 8, 8, 255];
const source = encodeIndexed(2, 2, Buffer.from([0, 1, 2, 2]), sourceColors);
let result = remapPngToPalette(source, sourceColors);
assert.strictEqual(result.lossless, true); assert.deepStrictEqual([...readIndexedPng8(result.buffer).indices], [0, 1, 2, 2]);
result = remapPngToPalette(source, targetColors);
assert.strictEqual(result.lossless, false); assert.strictEqual(result.changedPixels, 2); assert.strictEqual(result.changedColorCount, 1); assert.strictEqual(result.transparentChanged, 0);
assert.deepStrictEqual([...readIndexedPng8(result.buffer).indices], [0, 1, 2, 2]);
const noTransparent = targetColors.map(color => [...color]); noTransparent[0][3] = 255;
result = remapPngToPalette(source, noTransparent); assert.strictEqual(result.transparentChanged, 1);
console.log('SFF palette remap reports exact/lossy conversion and transparency changes before indexed output');
