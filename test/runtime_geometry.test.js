'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseRuntimeDefaults, setRuntimeEntry, removeRuntimeEntry, readRuntimePlan, controllerSnippet } = require('../src/runtime_geometry');

const parsed = parseRuntimeDefaults(`[Size]
attack.dist.width = 90, 12
attack.dist.height = 140, 30
attack.dist.depth = 6, 7
proj.attack.dist.width = 110, 5
depth = 3, 4
attack.depth = 8, 9
`);
assert.deepStrictEqual(parsed.guardWidth, [90, 12]);
assert.deepStrictEqual(parsed.guardHeight, [140, 30]);
assert.deepStrictEqual(parsed.guardDepth, [6, 7]);
assert.deepStrictEqual(parsed.playerDepth, [3, 4]);
assert.deepStrictEqual(parsed.attackDepth, [8, 9]);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemen-runtime-'));
fs.writeFileSync(path.join(root, 'Ikemen_GO.exe'), '');
const air = path.join(root, 'chars', 'Test', 'Test.air'); fs.mkdirSync(path.dirname(air), { recursive: true }); fs.writeFileSync(air, '');
setRuntimeEntry(air, { action: 200, element: 3, kind: 'guarddist', values: [80, 5, 120, 20, 4, 4] });
setRuntimeEntry(air, { action: 200, element: 3, kind: 'overrideclsn', group: 'Clsn2', index: 0, rect: [-10, -70, 16, 0] });
assert.strictEqual(readRuntimePlan(air).entries.length, 2);
assert.match(controllerSnippet(readRuntimePlan(air).entries[0]), /attackDist\{width: 80, 5; height: 120, 20; depth: 4, 4\}/);
assert.match(controllerSnippet(readRuntimePlan(air).entries[1]), /overrideClsn\{group: Clsn2; index: 0; rect: -10, -70, 16, 0\}/);
assert.strictEqual(removeRuntimeEntry(air, 200, 3, 'guarddist').removed, true);
assert.strictEqual(readRuntimePlan(air).entries.length, 1);
fs.rmSync(root, { recursive: true, force: true });
console.log('Runtime geometry tests passed');
