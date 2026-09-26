'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { characterPaletteContext, libraryRoot, listUserPalettes, userPaletteWrites, safeUserPalette } = require('../src/user_palette_library');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemen-user-palettes-'));
const character = path.join(root, 'chars', 'Ryu'), files = path.join(character, 'files');
fs.mkdirSync(path.join(character, 'colors'), { recursive: true }); fs.mkdirSync(files, { recursive: true });
const sff = path.join(files, 'Ryu.sff'); fs.writeFileSync(sff, 'placeholder');
fs.writeFileSync(path.join(character, 'Ryu.def'), '[Info]\nname = "Ryu"\ndisplayname = "Ryu"\n\n[Files]\nsprite = files/Ryu.sff\npal1 = colors/1.act\npal7 = colors/custom.act\n');
fs.writeFileSync(path.join(character, 'colors', '1.act'), Buffer.alloc(768, 1)); fs.writeFileSync(path.join(character, 'colors', 'custom.act'), Buffer.alloc(768, 7));

const context = characterPaletteContext(sff, root);
assert.strictEqual(context.characterId, 'Ryu');
assert.strictEqual(context.displayName, 'Ryu');
assert.strictEqual(context.runtimeSlots.length, 1);
assert.strictEqual(context.runtimeSlots[0].number, 7);
assert.strictEqual(context.defaultAct, path.join(character, 'colors', '1.act'));
assert.strictEqual(libraryRoot(root, 'Ryu'), path.join(root, 'save', 'palettes', 'Ryu'));

const colors = Array.from({ length: 256 }, (_, index) => [index, 255 - index, index % 32, index === 0 ? 0 : 255]);
const prepared = userPaletteWrites({ gameRoot: root, characterId: 'Ryu', name: 'White Headband', colors, parent: '1,1', runtime: { defPalette: 7, path: 'colors/custom.act' }, now: new Date('2026-09-05T12:00:00.000Z') });
for (const [filename, data] of prepared.writes) { fs.mkdirSync(path.dirname(filename), { recursive: true }); fs.writeFileSync(filename, data); }
const listed = listUserPalettes(root, 'Ryu');
assert.strictEqual(listed.length, 1);
assert.strictEqual(listed[0].name, 'White Headband');
assert.strictEqual(listed[0].parent, '1,1');
assert.strictEqual(fs.statSync(listed[0].actPath).size, 768);
assert.strictEqual(safeUserPalette(root, 'Ryu', 'White-Headband').actPath, listed[0].actPath);
assert.throws(() => safeUserPalette(root, 'Ryu', '../outside'), /no longer exists|outside/);

fs.rmSync(root, { recursive: true, force: true });
console.log('user palette library tests passed');
