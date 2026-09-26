'use strict';

const assert = require('assert');
const { imageDimensions, sheetCells, provisionalName, suggestedAssignment, manifestRows, recipe } = require('../src/artist_intake_model');

const png = Buffer.alloc(24); png.write('PNG', 1, 'ascii'); png.writeUInt32BE(320, 16); png.writeUInt32BE(240, 20);
assert.deepStrictEqual(imageDimensions(png), { width: 320, height: 240, format: 'png' });
const gif = Buffer.alloc(10); gif.write('GIF89a', 0, 'ascii'); gif.writeUInt16LE(160, 6); gif.writeUInt16LE(96, 8);
assert.deepStrictEqual(imageDimensions(gif), { width: 160, height: 96, format: 'gif' });

assert.strictEqual(sheetCells({ width: 68, height: 35 }, { cellWidth: 32, cellHeight: 16, spacingX: 2, spacingY: 3 }).length, 4);
assert.deepStrictEqual(sheetCells({ width: 20, height: 20 }, { cellWidth: 10, cellHeight: 10, order: 'column' }).map((cell) => [cell.row, cell.column]), [[0, 0], [1, 0], [0, 1], [1, 1]]);
assert.strictEqual(provisionalName('Special', 2), 'Special 02');
assert.deepStrictEqual(suggestedAssignment('Special', 2), { category: 'Special', sequence: 2, name: 'Special 02', group: 1020, startIndex: 0 });

const rows = manifestRows([{ filename: 'frame.png', delayMs: 83 }], { category: 'Hyper', sequence: 1, group: 3000, startIndex: 5, axisX: 10, axisY: 20, artistSource: 'Morrigan.gif' });
assert.strictEqual(rows[0].ComputedGroup, 3000);
assert.strictEqual(rows[0].ImageIndex, 5);
assert.ok(!Object.prototype.hasOwnProperty.call(rows[0], 'TimingAuthority'));
assert.match(rows[0].ReviewReason, /verify identity/i);
assert.strictEqual(recipe({ sourceType: 'sheet', sheet: { cellWidth: 64 } }).sheet.cellWidth, 64);

console.log('artist_intake_model tests passed');
