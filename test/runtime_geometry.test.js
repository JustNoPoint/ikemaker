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
proj.attack.dist.height = 210, 15
proj.attack.dist.depth = 8, 9
pushfactor = 0.75
weight = 120
xscale = 1.25
yscale = 0.9
depth = 3, 4
attack.depth = 8, 9
`);
assert.deepStrictEqual(parsed.guardWidth, [90, 12]);
assert.deepStrictEqual(parsed.guardHeight, [140, 30]);
assert.deepStrictEqual(parsed.guardDepth, [6, 7]);
assert.deepStrictEqual(parsed.projectileGuardWidth, [110, 5]);
assert.deepStrictEqual(parsed.projectileGuardHeight, [210, 15]);
assert.deepStrictEqual(parsed.projectileGuardDepth, [8, 9]);
assert.strictEqual(parsed.pushFactor, 0.75);
assert.strictEqual(parsed.weight, 120);
assert.strictEqual(parsed.xscale, 1.25);
assert.strictEqual(parsed.yscale, 0.9);
assert.deepStrictEqual(parsed.playerDepth, [3, 4]);
assert.deepStrictEqual(parsed.attackDepth, [8, 9]);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemen-runtime-'));
fs.writeFileSync(path.join(root, 'Ikemen_GO.exe'), '');
const air = path.join(root, 'chars', 'Test', 'Test.air'); fs.mkdirSync(path.dirname(air), { recursive: true }); fs.writeFileSync(air, '');
setRuntimeEntry(air, { action: 200, element: 3, kind: 'guarddist', values: [80, 5, 120, 20, 4, 4] });
setRuntimeEntry(air, { action: 200, element: 3, kind: 'overrideclsn', group: 'Clsn2', index: 0, rect: [-10, -70, 16, 0] });
setRuntimeEntry(air, { action: 200, element: 3, kind: 'transformclsn', group: 'Clsn2', index: 7, scale: [1.2, 0.8], angle: 15, pivot: [0, -35] });
setRuntimeEntry(air, { action: 200, element: 3, kind: 'transformclsn', group: 'Clsn2', index: 8, scale: [0.9, 1.1], angle: -5, pivot: [0, 0] });
assert.strictEqual(readRuntimePlan(air).version, 2);
assert.strictEqual(readRuntimePlan(air).entries.length, 4, 'separate indexed TransformClsn plans coexist on one frame');
assert.match(controllerSnippet(readRuntimePlan(air).entries[0]), /attackDist\{width: 80, 5; height: 120, 20; depth: 4, 4\}/);
assert.match(controllerSnippet(readRuntimePlan(air).entries[1]), /overrideClsn\{group: Clsn2; index: 0; rect: -10, -70, 16, 0\}/);
const indexedTransform = readRuntimePlan(air).entries.find((item) => item.kind === 'transformclsn' && item.index === 7);
assert.match(controllerSnippet(indexedTransform), /transformClsn\{group: Clsn2; index: 7; scale: 1.2, 0.8; angle: 15; pivot: 0, -35\}/);
assert.match(controllerSnippet({ ...indexedTransform, index: -1, pivot: [0, 0] }, { allowIndexed: false, allowPivot: false }), /transformClsn\{group: Clsn2; scale: 1.2, 0.8; angle: 15\}/);
assert.throws(() => setRuntimeEntry(air, { action: 200, element: 4, kind: 'transformclsn', group: 'Clsn2', index: 1, scale: [1, 1], angle: 0, pivot: [0, 0] }, { allowIndexed: false }), /verified supporting engine target/);
assert.throws(() => setRuntimeEntry(air, { action: 200, element: 4, kind: 'overrideclsn', group: 'Dummy', index: 0, rect: [-20, -80, 20, 0] }), /Nightly engine target/);
const dummy = setRuntimeEntry(air, { action: 200, element: 4, kind: 'overrideclsn', group: 'Dummy', index: 0, rect: [-20, -80, 20, 0] }, { allowDummy: true });
assert.match(controllerSnippet(dummy.entry, { allowDummy: true }), /overrideClsn\{group: Dummy; index: 0; rect: -20, -80, 20, 0\}/);
assert.strictEqual(removeRuntimeEntry(air, 200, 3, 'guarddist').removed, true);
assert.strictEqual(removeRuntimeEntry(air, 200, 3, 'transformclsn', 'Clsn2', 8).removed, true, 'one indexed transform can be removed without deleting its neighbor');
assert.strictEqual(readRuntimePlan(air).entries.length, 3);

const legacyAir = path.join(root, 'chars', 'Test', 'Legacy.air'); fs.writeFileSync(legacyAir, '');
const legacyPlan = path.join(root, '.ikemen-tools', 'air-runtime-geometry', 'chars', 'Test', 'Legacy.json'); fs.mkdirSync(path.dirname(legacyPlan), { recursive: true });
fs.writeFileSync(legacyPlan, JSON.stringify({ version: 1, sourceAir: legacyAir, entries: [{ action: 1, element: 1, kind: 'transformclsn', values: [1, 1, 5] }] }));
const migrated = readRuntimePlan(legacyAir);
assert.strictEqual(migrated.version, 2);
assert.strictEqual(migrated.entries[0].needsReview, true, 'legacy unscoped transforms remain visibly untrusted');
assert.throws(() => controllerSnippet(migrated.entries[0]), /must be reviewed/, 'legacy transforms cannot generate falsely precise code');
const evidenced = setRuntimeEntry(air, { action: 300, element: 1, kind: 'width', values: [2, 3] }, { sourceFingerprint: 'source-a', capabilityFingerprint: 'cap-a', targetBuildId: 'nightly-a' }).entry;
assert.strictEqual(evidenced.sourceFingerprint, 'source-a');
assert.strictEqual(evidenced.targetBuildId, 'nightly-a');
assert.throws(() => controllerSnippet(evidenced, { sourceFingerprint: 'source-b', capabilityFingerprint: 'cap-a' }), /AIR source changed/);
assert.throws(() => controllerSnippet(evidenced, { sourceFingerprint: 'source-a', capabilityFingerprint: 'cap-b' }), /engine target or collision capabilities changed/);
fs.rmSync(root, { recursive: true, force: true });
console.log('Runtime geometry tests passed');
