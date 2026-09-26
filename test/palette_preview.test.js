'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { characterDefForSff, assignedDefault, previewPreferences, savePreviewPreference, clearGroupPreviewPreference } = require('../src/palette_preview');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemen-palette-preview-'));
const files = path.join(root, 'files'); fs.mkdirSync(files);
const sff = path.join(files, 'Ryu.sff'); fs.writeFileSync(sff, 'fixture');
const def = path.join(root, 'Ryu.def'); fs.writeFileSync(def, '[Info]\npal.defaults = 1,2,3\n[Files]\nsprite = files/Ryu.sff\n', 'utf8');
const archive = { palettes: [{ index: 0, group: 1, number: 0 }, { index: 1, group: 1, number: 1 }, { index: 2, group: 1, number: 2 }] };

assert.strictEqual(characterDefForSff(sff).filename, def);
assert.deepStrictEqual(assignedDefault(archive, sff), { index: 1, group: 1, number: 1, defPath: def });
let prefs = previewPreferences(archive, sff, 'sff');
assert.strictEqual(prefs.screenPaletteIndex, 1);
prefs = savePreviewPreference(archive, sff, 'sff', 'screen', 2);
assert.strictEqual(prefs.screenPaletteIndex, 2);
prefs = savePreviewPreference(archive, sff, 'sff', 'group', 1, 200);
assert.strictEqual(prefs.groupPaletteIndices['200'], 1);
assert.strictEqual(previewPreferences(archive, sff, 'air').groupPaletteIndices['200'], 1, 'group preview choices are shared across viewer screens');
prefs = clearGroupPreviewPreference(archive, sff, 'sff', 200);
assert.strictEqual(Object.hasOwn(prefs.groupPaletteIndices, '200'), false);

fs.rmSync(root, { recursive: true, force: true });
console.log('Palette preview preference tests passed');
