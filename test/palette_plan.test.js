'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readPalettePlan, stagePalette, stagePaletteAlias, stagePaletteInsertion, paletteInsertionPreview, applyPaletteShifts, removeStagedPalette, verifyPalettePlan } = require('../src/palette_plan');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemen-palette-plan-')), chars = path.join(root, 'chars', 'Test'); fs.mkdirSync(chars, { recursive: true }); fs.writeFileSync(path.join(root, 'Ikemen_GO.exe'), '');
const sff = path.join(chars, 'Test.sff'), palette = path.join(root, 'new.act'); fs.writeFileSync(sff, 'sff'); fs.writeFileSync(palette, Buffer.alloc(768, 4));
assert.strictEqual(readPalettePlan(sff).palettes.length, 0);
const staged = stagePalette(sff, palette, 1, 3, ['1,0', '1,1'], { tableOrder: 'reversed' }); assert.strictEqual(staged.plan.palettes[0].number, 3); assert.strictEqual(staged.plan.palettes[0].tableOrder, 'reversed');
assert.throws(() => stagePalette(sff, palette, 1, 3), /already/);
const alias = stagePaletteAlias(sff, 2, 3, 1, 3, ['1,0', '1,1']);
assert.strictEqual(alias.plan.palettes[1].kind, 'alias');
assert.strictEqual(alias.plan.palettes[1].targetGroup, 1);
assert.strictEqual(verifyPalettePlan(sff).palettes.length, 2);
const insertionPreview=paletteInsertionPreview(sff,1,1,['1,0','1,1']);assert.deepStrictEqual(insertionPreview.shifted.map(x=>[x.from.number,x.to.number]),[[3,4],[1,2]]);
const inserted=stagePaletteInsertion(sff,palette,1,1,['1,0','1,1']);assert.strictEqual(inserted.plan.shifts.length,1);assert.deepStrictEqual(applyPaletteShifts(1,1,inserted.plan.shifts),{group:1,number:2});assert.ok(inserted.plan.palettes.some(entry=>entry.inserted&&entry.number===1));assert.ok(inserted.plan.palettes.some(entry=>entry.number===4));assert.strictEqual(verifyPalettePlan(sff,['1,0','1,1']).palettes.length,3);
assert.strictEqual(removeStagedPalette(sff,1,1).removed,true);assert.strictEqual(readPalettePlan(sff).shifts.length,0);assert.ok(readPalettePlan(sff).palettes.some(entry=>entry.number===3));
assert.throws(() => stagePaletteAlias(sff, 3, 3, 9, 9), /does not exist/);
assert.throws(() => stagePaletteAlias(sff, 3, 3, 3, 3), /itself/);
fs.appendFileSync(palette, 'changed'); assert.throws(() => verifyPalettePlan(sff), /changed after approval/);
assert.strictEqual(removeStagedPalette(sff, 1, 3).removed, true);
fs.rmSync(root, { recursive: true, force: true });

console.log('palette plan tests passed');
