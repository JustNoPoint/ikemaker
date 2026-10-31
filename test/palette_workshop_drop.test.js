'use strict';

const assert = require('assert');
const { writeAct } = require('../src/act_palette_order');
const { encodeIndexedPng } = require('../src/palette_indexed_png');
const drop = require('../src/palette_workshop_drop');

const colors = Array.from({ length: 256 }, (_, index) => [index, 255 - index, index % 17, index ? 255 : 0]);
const act = drop.decodeDroppedPalette({ name: 'player.act', bytes: writeAct(colors) });
assert.strictEqual(act.kind, 'palette');
assert.deepStrictEqual(act.colors, colors);

const indices = Buffer.from([0, 1, 2, 3]);
const png = encodeIndexedPng({ width: 2, height: 2 }, indices, colors, { bitDepth: 8 });
const indexed = drop.decodeDroppedPalette({ name: 'player.png', bytes: png });
assert.strictEqual(indexed.kind, 'palette');
assert.strictEqual(indexed.entryCount, 256);

const trueColorHeader = Buffer.from(png);
trueColorHeader[25] = 6;
const repair = drop.decodeDroppedPalette({ name: 'art.png', bytes: trueColorHeader });
assert.strictEqual(repair.kind, 'repair-required');
assert.match(repair.reason, /repair path/);
assert.strictEqual(drop.decodeDroppedPalette({ name: 'art.psd', bytes: Buffer.from('8BPS') }).kind, 'repair-required');
assert.throws(() => drop.decodeDroppedPalette({ name: 'colors.gpl', bytes: Buffer.from('GIMP Palette') }), /accept ACT, indexed PNG/);

assert.strictEqual(drop.dropPlacement(1, 0, 16), 'insert-before');
assert.strictEqual(drop.dropPlacement(8, 0, 16), 'replace');
assert.strictEqual(drop.dropPlacement(15, 0, 16), 'insert-after');

const incoming = colors.map((color) => color.slice()).reverse();
const replaced = drop.placeColors(colors, incoming, 250, 'replace', 3);
assert.deepStrictEqual(replaced.range, [250, 252]);
assert.deepStrictEqual(replaced.colors[250], incoming[0]);
assert.deepStrictEqual(replaced.colors[253], colors[253]);
const inserted = drop.placeColors(colors, incoming, 10, 'insert-before', 2);
assert.deepStrictEqual(inserted.range, [10, 11]);
assert.deepStrictEqual(inserted.colors.slice(10, 12), incoming.slice(0, 2));
assert.deepStrictEqual(inserted.colors[12], colors[10]);
assert.strictEqual(inserted.colors.length, 256);
const one = drop.placeColors(colors, [[9, 8, 7, 255]], 20, 'replace');
assert.deepStrictEqual(one.colors[20], [9, 8, 7, 255]);
assert.throws(() => drop.placeColors(colors, incoming, 0, 'replace', 1), /index 0/);

console.log('palette_workshop_drop.test.js passed');
