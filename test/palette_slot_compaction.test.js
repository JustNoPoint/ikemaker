'use strict';

const assert = require('assert');
const { compactPaletteSlots } = require('../src/palette_slot_compaction');

function palette(index, group, number, linked = false, link = null) { return { index, group, number, dataSize: linked ? 0 : 1024, link }; }

{
  const plan = compactPaletteSlots({ palettes: [palette(0,1,5), palette(1,1,8,true,0), palette(2,2,4)], group: 1, start: 5, end: 8 });
  assert.deepStrictEqual(plan.rows.map(row => [row.from.number,row.to.number]), [[5,5],[8,6]]);
  assert.strictEqual(plan.proposals.length, 1);
  assert.strictEqual(plan.proposals[0].physicalIndex, 1);
  assert.strictEqual(plan.rows[1].linked, true);
  assert.strictEqual(plan.paletteCount, 3);
}

{
  const plan = compactPaletteSlots({ palettes: [palette(0,1,5), palette(1,1,8), palette(2,1,10)], group: 1, start: 5, end: 10, reservedNumbers: [6,7] });
  assert.deepStrictEqual(plan.rows.map(row => [row.from.number,row.to.number]), [[5,5],[8,8],[10,9]]);
  assert.deepStrictEqual(plan.reservedNumbers, [6,7]);
}

{
  const plan = compactPaletteSlots({ palettes: [palette(0,1,5), palette(1,1,7), palette(2,1,9)], group: 1, start: 5, end: 9, reservedNumbers: [7] });
  assert.deepStrictEqual(plan.rows.map(row => [row.from.number,row.to.number,row.status]), [[5,5,'unchanged'],[7,7,'reserved'],[9,8,'move']]);
}

{
  const plan = compactPaletteSlots({ palettes: [palette(0,1,5), palette(1,1,9,true,0)], group: 1, start: 5, end: 9, reservedNumbers: [7] });
  assert.deepStrictEqual(plan.rows.map(row => [row.from.number,row.to.number]), [[5,5],[9,8]], 'an empty preserved gap is also an order barrier');
  assert.strictEqual(plan.rows[1].linked,true);
}

assert.throws(() => compactPaletteSlots({ palettes: [palette(0,1,5), palette(1,1,5)], group: 1, start: 0, end: 10 }), /ambiguous/);
assert.throws(() => compactPaletteSlots({ palettes: [], group: 1, start: 10, end: 9 }), /reversed/);
assert.throws(() => compactPaletteSlots({ palettes: [], group: 1, start: 0, end: 4096 }), /at most 4096/i);
assert.throws(() => compactPaletteSlots({ palettes: [], group: 1, start: 5, end: 8, reservedNumbers: [9] }), /outside/);

console.log('palette slot compaction tests passed');
