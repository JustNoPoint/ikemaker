'use strict';

const assert = require('assert');
const { rgbaPng } = require('../src/sff_reader');
const { renderedPixelHash, selectByEvidence } = require('../src/sff_selection_evidence');

const transparentRed = rgbaPng(1, 1, Buffer.from([255, 0, 0, 0]));
const transparentBlue = rgbaPng(1, 1, Buffer.from([0, 0, 255, 0]));
const visibleRed = rgbaPng(1, 1, Buffer.from([255, 0, 0, 255]));
assert.strictEqual(renderedPixelHash(transparentRed), renderedPixelHash(transparentBlue), 'invisible RGB differences are not rendered-pixel differences');
assert.notStrictEqual(renderedPixelHash(transparentRed), renderedPixelHash(visibleRed));

const sprites = [
  { index: 0, group: 1, number: 0, width: 10, height: 20, format: 10, colorDepth: 8, paletteIndex: 0 },
  { index: 1, group: 1, number: 1, width: 10, height: 20, format: 10, colorDepth: 8, paletteIndex: 0 },
  { index: 2, group: 2, number: 0, width: 30, height: 20, format: 11, colorDepth: 32, paletteIndex: 1 }
];
const archive = { sprites }, references = new Map([['1,0', ['a.air:10']]]), hashes = new Map([[0, 'same'], [1, 'same'], [2, 'other']]);
assert.deepStrictEqual(selectByEvidence(archive, 'palette', sprites[0], references, hashes).map(item => item.index), [0, 1]);
assert.deepStrictEqual(selectByEvidence(archive, 'dimensions', sprites[0], references, hashes).map(item => item.index), [0, 1]);
assert.deepStrictEqual(selectByEvidence(archive, 'referenced', sprites[0], references, hashes).map(item => item.index), [0]);
assert.deepStrictEqual(selectByEvidence(archive, 'unreferenced', sprites[0], references, hashes).map(item => item.index), [1, 2]);
assert.deepStrictEqual(selectByEvidence(archive, 'duplicate-current', sprites[0], references, hashes).map(item => item.index), [0, 1]);
assert.deepStrictEqual(selectByEvidence(archive, 'duplicate-all', sprites[2], references, hashes).map(item => item.index), [0, 1]);
assert.throws(() => selectByEvidence(archive, 'duplicate-all', sprites[0], references, new Map()), /evidence is missing/);

console.log('SFF reviewed selection evidence distinguishes metadata, AIR use, and exact rendered duplicate pixels');
