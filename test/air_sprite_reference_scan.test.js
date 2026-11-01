'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { scanAirSpriteReferences } = require('../src/air_sprite_reference_scan');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-air-sprite-refs-')), sff = path.join(root, 'hero.sff');
fs.writeFileSync(sff, 'fixture');
fs.writeFileSync(path.join(root, 'hero.air'), '[Begin Action 0]\n10, 1, 0, 0, 4\n10,2, 0,0,4 ; comment\n\n[Begin Action 5]\n10,1,0,0,3\n');
fs.writeFileSync(path.join(root, 'extra.air'), '[Begin Action 20]\r\n20,0,0,0,1\r\n');
const result = scanAirSpriteReferences(sff);
assert.strictEqual(result.status, 'folder-only-incomplete');
assert(/character DEF assigned AIR/.test(result.scopeNote));
assert.deepStrictEqual(result.references['10,1'], ['hero.air:2 · Action 0', 'hero.air:6 · Action 5']);
assert.deepStrictEqual(result.references['20,0'], ['extra.air:2 · Action 20']);
assert(Object.isFrozen(result) && Object.isFrozen(result.references['10,1']));
const bounded = scanAirSpriteReferences(sff, { maxFiles: 1 });
assert.strictEqual(bounded.status, 'folder-only-incomplete');
assert.strictEqual(bounded.skipped.length, 1);
fs.rmSync(root, { recursive: true, force: true });
console.log('AIR sprite reference scan is bounded and reports exact action locations.');
