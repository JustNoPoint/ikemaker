'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { readPalettePlan, stagePalette, stagePaletteAlias, stagePaletteInsertion, paletteInsertionPreview, applyPaletteShifts, removeStagedPalette, stagePaletteDeletion, removeStagedPaletteDeletion, verifyPalettePlan } = require('../src/palette_plan');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemen-palette-plan-')), chars = path.join(root, 'chars', 'Test'); fs.mkdirSync(chars, { recursive: true }); fs.writeFileSync(path.join(root, 'Ikemen_GO.exe'), '');
const sff = path.join(chars, 'Test.sff'), palette = path.join(root, 'new.act'); fs.writeFileSync(sff, 'sff'); fs.writeFileSync(palette, Buffer.alloc(768, 4));
const digest=filename=>crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
assert.strictEqual(readPalettePlan(sff).palettes.length, 0);
const staged = stagePalette(sff, palette, 1, 3, ['1,0', '1,1'], { tableOrder: 'reversed', name: 'Bank B custom name',expectedSourceHash:digest(palette),expectedSffHash:digest(sff) }); assert.strictEqual(staged.plan.palettes[0].number, 3); assert.strictEqual(staged.plan.palettes[0].tableOrder, 'reversed');assert.strictEqual(staged.plan.palettes[0].name,'Bank B custom name');assert.strictEqual(staged.plan.palettes[0].reviewedSourceSffSHA256,digest(sff).toUpperCase());
const changedSource=path.join(root,'changed.act');fs.writeFileSync(changedSource,Buffer.alloc(768,5));const reviewedSourceHash=digest(changedSource);fs.appendFileSync(changedSource,'changed');assert.throws(()=>stagePalette(sff,changedSource,8,1,[],{expectedSourceHash:reviewedSourceHash,expectedSffHash:digest(sff)}),/source changed after it was reviewed/);
const reviewedSffHash=digest(sff);fs.appendFileSync(sff,'changed');assert.throws(()=>stagePalette(sff,palette,8,2,[],{expectedSourceHash:digest(palette),expectedSffHash:reviewedSffHash}),/source SFF changed/);fs.writeFileSync(sff,'sff');
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
assert.throws(() => stagePaletteDeletion(sff, { group: 5, number: 1, index: 4 }, { spriteCount: 1 }), /still use/);
const deletion = stagePaletteDeletion(sff, { group: 5, number: 1, index: 4 }, { lifecycleId: 'temporary-five-one' });
assert.strictEqual(deletion.plan.deletions[0].lifecycleId, 'temporary-five-one');
assert.strictEqual(removeStagedPaletteDeletion(sff, 5, 1).removed, true);
const raceSff=path.join(chars,'Race.sff'),racePalette=path.join(root,'race.act'),firstRace=Buffer.alloc(768,6),secondRace=Buffer.alloc(768,7);fs.writeFileSync(raceSff,'race-sff');fs.writeFileSync(racePalette,firstRace);
const firstRaceHash=crypto.createHash('sha256').update(firstRace).digest('hex'),raceSffHash=digest(raceSff),originalRead=fs.readFileSync;let raceReads=0;
fs.readFileSync=function(filename,...args){if(path.resolve(String(filename))===path.resolve(racePalette)){raceReads+=1;return raceReads===1?firstRace:secondRace;}return originalRead.call(this,filename,...args);};
try{const race=stagePalette(raceSff,racePalette,4,1,[],{expectedSourceHash:firstRaceHash,expectedSffHash:raceSffHash});assert.strictEqual(raceReads,1,'staging must validate and record one exact palette byte snapshot');assert.strictEqual(race.plan.palettes[0].sourceSHA256,firstRaceHash.toUpperCase());}finally{fs.readFileSync=originalRead;}
fs.appendFileSync(palette, 'changed'); assert.throws(() => verifyPalettePlan(sff), /changed after approval/);
assert.strictEqual(removeStagedPalette(sff, 1, 3).removed, true);
fs.rmSync(root, { recursive: true, force: true });

console.log('palette plan tests passed');
