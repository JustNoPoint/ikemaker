'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { batchPalettePreflight, stagePaletteBatch, readPalettePlan, palettePlanLocation, duplicatePaletteClusters, stagedPaletteColorInventory, stagePalette, stagePaletteAlias, removeStagedBatch, removeStagedPalette } = require('../src/palette_plan');

function fixture(name = 'batch') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `ikemen-palette-${name}-`));
  fs.writeFileSync(path.join(root, 'Ikemen_GO.exe'), '');
  const dir = path.join(root, 'chars', 'Test'); fs.mkdirSync(dir, { recursive: true });
  const sff = path.join(dir, 'Test.sff'); fs.writeFileSync(sff, Buffer.from('stable-sff'));
  const source = (number, byte = number) => { const file = path.join(root, `${number}.act`); fs.writeFileSync(file, Buffer.alloc(768, byte)); return file; };
  return { root, sff, source };
}

{
  const f = fixture('staged-duplicate');
  try {
    const source = f.source(9, 9); stagePalette(f.sff, source, 1, 1, []); stagePaletteAlias(f.sff, 1, 2, 1, 1, []); stagePaletteAlias(f.sff, 1, 3, 1, 2, []);
    const inventory = stagedPaletteColorInventory(readPalettePlan(f.sff), []), incoming = [{ label: 'incoming', group: 1, number: 4, colors: inventory[0].colors }], clusters = duplicatePaletteClusters(inventory, incoming);
    assert.strictEqual(inventory.length, 3, 'staged source and recursively resolved aliases must all enter duplicate inventory');
    assert.strictEqual(clusters.length, 1);
    assert.strictEqual(clusters[0].length, 4);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
}

function colors(value, alpha = 255) { return Array.from({ length: 256 }, (_, index) => [value, value, value, index === 0 ? 0 : alpha]); }
function chunk(type, data) { const output = Buffer.alloc(data.length + 12); output.writeUInt32BE(data.length, 0); output.write(type, 4, 4, 'ascii'); data.copy(output, 8); return output; }

{
  const f = fixture('thirty');
  try {
    const incoming = Array.from({ length: 30 }, (_, index) => ({ source: f.source(index + 1), colors: colors(index + 1) }));
    const preview = batchPalettePreflight(f.sff, { mode: 'insert', group: 1, beforeNumber: 2, incoming, occupiedIds: ['1,1', '1,2', '1,5', '2,2'] });
    assert.deepStrictEqual(preview.assigned.map((entry) => entry.number), Array.from({ length: 30 }, (_, index) => index + 2));
    assert.deepStrictEqual(preview.shifted.map((entry) => [entry.from.group, entry.from.number, entry.to.number]), [[1, 2, 32], [1, 5, 35]]);
    const result = stagePaletteBatch(f.sff, preview);
    assert.strictEqual(result.plan.shifts[0].amount, 30);
    assert.strictEqual(result.plan.palettes.length, 30);
    assert.strictEqual(result.plan.palettes[29].number, 31);
    assert.throws(() => removeStagedPalette(f.sff, 1, 2), /entire batch/);
    assert.strictEqual(removeStagedBatch(f.sff, result.plan.shifts[0].id).removed, 30);
    assert.deepStrictEqual(readPalettePlan(f.sff).shifts, []);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
}

{
  const f = fixture('mixed-order');
  try {
    const act = f.source(1), png = path.join(f.root, 'indexed.png'), table = Buffer.alloc(768); table[0] = 11; table[1] = 22; table[2] = 33; table[765] = 44; table[766] = 55; table[767] = 66;
    fs.writeFileSync(png, Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('PLTE', table), chunk('tRNS', Buffer.from([0])), chunk('IEND', Buffer.alloc(0))]));
    const preview = batchPalettePreflight(f.sff, { mode: 'append', group: 1, incoming: [{ source: act, tableOrder: 'reversed' }, { source: png, tableOrder: 'reversed' }], occupiedIds: [] });
    assert.deepStrictEqual(preview.assigned.map((entry) => entry.tableOrder), ['reversed', 'index'], 'ACT reversal must never reverse an indexed PNG implicitly');
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
}

{
  const f = fixture('append');
  try {
    const incoming = [1, 2].map((number) => ({ source: f.source(number), colors: colors(number) }));
    const preview = batchPalettePreflight(f.sff, { mode: 'append', group: 7, incoming, occupiedIds: ['7,1', '7,40', '8,90'] });
    assert.deepStrictEqual(preview.assigned.map((entry) => `${entry.group},${entry.number}`), ['7,41', '7,42']);
    assert.deepStrictEqual(preview.shifted, []);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
}

{
  const f = fixture('stale');
  try {
    const source = f.source(1), preview = batchPalettePreflight(f.sff, { mode: 'append', group: 1, incoming: [{ source, colors: colors(1) }], occupiedIds: [] });
    const planFile = palettePlanLocation(f.sff), before = fs.existsSync(planFile) ? fs.readFileSync(planFile) : null;
    fs.appendFileSync(source, 'changed');
    assert.throws(() => stagePaletteBatch(f.sff, preview), /changed after batch review/);
    assert.strictEqual(fs.existsSync(planFile), Boolean(before));
    if (before) assert.deepStrictEqual(fs.readFileSync(planFile), before);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
}

{
  const exact = duplicatePaletteClusters([{ label: 'existing', group: 1, number: 1, colors: colors(9) }], [{ label: 'incoming', group: 1, number: 2, colors: colors(9) }]);
  assert.strictEqual(exact.length, 1);
  const alphaDiffers = duplicatePaletteClusters([{ label: 'existing', group: 1, number: 1, colors: colors(9) }], [{ label: 'incoming', group: 1, number: 2, colors: colors(9, 254) }]);
  assert.strictEqual(alphaDiffers.length, 0);
  const otherGroup = duplicatePaletteClusters([{ label: 'existing', group: 2, number: 1, colors: colors(9) }], [{ label: 'incoming', group: 1, number: 2, colors: colors(9) }]);
  assert.strictEqual(otherGroup.length, 0);
}

{
  const f = fixture('skip-recalculates');
  try {
    const all = [1, 2, 3].map((number) => ({ source: f.source(number), colors: colors(number) }));
    const before = batchPalettePreflight(f.sff, { mode: 'insert', group: 4, beforeNumber: 8, incoming: all, occupiedIds: ['4,8'] });
    const after = batchPalettePreflight(f.sff, { mode: 'insert', group: 4, beforeNumber: 8, incoming: [all[0], all[2]], occupiedIds: ['4,8'] });
    assert.deepStrictEqual([before.amount, before.shifted[0].to.number], [3, 11]);
    assert.deepStrictEqual([after.amount, after.shifted[0].to.number], [2, 10]);
    assert.deepStrictEqual(after.assigned.map((entry) => entry.number), [8, 9]);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
}

{
  const f = fixture('overflow');
  try {
    const incoming = [{ source: f.source(1), colors: colors(1) }, { source: f.source(2), colors: colors(2) }];
    assert.throws(() => batchPalettePreflight(f.sff, { mode: 'insert', group: 3, beforeNumber: 65535, incoming, occupiedIds: [] }), /does not fit/);
    assert.deepStrictEqual(readPalettePlan(f.sff).palettes, []);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
}

console.log('palette batch plan tests passed');
