'use strict';
const assert = require('assert');
const { INDEX_ORDER, REVERSED_ORDER, readAct, writeAct, colorsForOrder } = require('../src/act_palette_order');

const colors = Array.from({ length: 256 }, (_, index) => [index, (index + 17) & 255, 255 - index, index === 0 ? 0 : 255]);
const direct = writeAct(colors, INDEX_ORDER);
assert.deepStrictEqual([...direct.subarray(0, 3)], colors[0].slice(0, 3));
assert.deepStrictEqual([...direct.subarray(765, 768)], colors[255].slice(0, 3));
const reversed = writeAct(colors, REVERSED_ORDER);
assert.deepStrictEqual([...reversed.subarray(0, 3)], colors[255].slice(0, 3));
assert.deepStrictEqual([...reversed.subarray(765, 768)], colors[0].slice(0, 3));
assert.deepStrictEqual(readAct(reversed, REVERSED_ORDER), colors, 'matching explicit import/export conventions round-trip exactly');
assert.strictEqual(colorsForOrder(colors, REVERSED_ORDER)[0][3], 0, 'SFF transparency remains attached to destination index 0');
const adobe = Buffer.concat([direct, Buffer.from([1, 0, 0, 200])]);
assert.deepStrictEqual(readAct(adobe, INDEX_ORDER)[200], [...colors[200].slice(0, 3), 0], '772-byte Adobe transparency metadata is decoded');
assert.throws(() => readAct(Buffer.alloc(767), INDEX_ORDER), /768 bytes/);
console.log('ACT palette order, reversal, transparency and round-trip tests passed');
