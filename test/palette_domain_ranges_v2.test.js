'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const model = require('../src/palette_domain_model');
const { PaletteDomainRegistry } = require('../src/palette_domain_registry');

const hashA = 'a'.repeat(64), hashB = 'b'.repeat(64);
const exact = model.parseRemapPalRange('1,1 - 1,70 -> 2,1 - 2,70');
assert.deepStrictEqual(exact, { source: { group: 1, startNumber: 1, endNumber: 70 }, destination: { group: 2, startNumber: 1, endNumber: 70 }, correspondence: 'same-number' });
const expanded = model.expandRemapPalRange(exact); assert.strictEqual(expanded.length, 70); assert.deepStrictEqual(expanded[0], { source: { group: 1, number: 1 }, destination: { group: 2, number: 1 } }); assert.deepStrictEqual(expanded.at(-1), { source: { group: 1, number: 70 }, destination: { group: 2, number: 70 } });
assert.throws(() => model.normalizeRemapPalRange({ source: { group: 1, startNumber: 1, endNumber: 3 }, destination: { group: 2, startNumber: 1, endNumber: 2 } }), /equal lengths/);
assert.throws(() => model.parseRemapPalRange('1,1-1,3 -> 2,2-2,4'), /retain corresponding palette numbers/);
assert.throws(() => model.parseRemapPalRange('1,1-2,3 -> 3,1-3,3'), /stay within one palette group/);

const mapped = model.normalizeArchive({ remapPalGroups: [{ id: 'remap-0001', name: 'Forms with holes', reviewedInventoryHash: hashA, rangeMappings: ['1,1-1,3 -> 2,1-2,3', '1,8-1,9 -> 2,8-2,9'] }] });
const mappedGroup = mapped.remapPalGroups[0]; assert.strictEqual(mappedGroup.mappingStatus, 'mapped-ranges'); assert.strictEqual(mappedGroup.rangeMappings.length, 2); assert.deepStrictEqual(mappedGroup.paletteIds.map(value => `${value.group},${value.number}`), ['1,1','2,1','1,2','2,2','1,3','2,3','1,8','2,8','1,9','2,9']);

const legacyDocument = { schema: model.SCHEMA, version: 1, revision: 7, conventions: { rules: [] }, archives: { 'hero.sff': { remapPalGroups: [{ id: 'remap-0002', name: 'Old membership', paletteIds: [{ group: 1, number: 1 }, { group: 2, number: 1 }] }] } } };
const upgraded = model.normalizeRegistry(legacyDocument), legacyGroup = upgraded.archives['hero.sff'].remapPalGroups[0];
assert.strictEqual(upgraded.version, 2); assert.strictEqual(upgraded.revision, 7); assert.strictEqual(legacyGroup.mappingStatus, 'unmapped-membership'); assert.strictEqual(legacyGroup.importedFromVersion, 1); assert.deepStrictEqual(legacyGroup.legacyPaletteIds, legacyDocument.archives['hero.sff'].remapPalGroups[0].paletteIds); assert.deepStrictEqual(legacyGroup.paletteIds, legacyGroup.legacyPaletteIds); assert.deepStrictEqual(legacyGroup.rangeMappings, []);
assert(model.remapPalMappingDiagnostics(upgraded.archives['hero.sff'].remapPalGroups).some(item => item.code === 'unmapped-membership'));

const overlapArchive = model.normalizeArchive({ remapPalGroups: [
  { id: 'remap-0010', name: 'First', rangeMappings: ['1,1-1,2 -> 2,1-2,2'] },
  { id: 'remap-0011', name: 'Same source elsewhere', rangeMappings: ['1,1-1,1 -> 3,1-3,1'] },
  { id: 'remap-0012', name: 'Same destination elsewhere', rangeMappings: ['4,1-4,1 -> 2,1-2,1'] },
  { id: 'remap-0013', name: 'Exact duplicate', rangeMappings: ['1,2-1,2 -> 2,2-2,2'] }
] });
const overlap = model.remapPalMappingDiagnostics(overlapArchive.remapPalGroups); assert(overlap.some(item => item.code === 'conflicting-source-overlap' && item.severity === 'error')); assert(overlap.some(item => item.code === 'conflicting-destination-overlap' && item.severity === 'error')); assert(overlap.some(item => item.code === 'duplicate-mapping' && item.severity === 'information'));

const reconciled = model.reconcileArchive(mapped, { inventoryHash: hashB, palettes: [
  { physicalIndex: 0, group: 1, number: 1 }, { physicalIndex: 1, group: 1, number: 1 }, { physicalIndex: 2, group: 2, number: 1 },
  { physicalIndex: 3, group: 1, number: 2 }, { physicalIndex: 4, group: 1, number: 3 }, { physicalIndex: 5, group: 2, number: 3 },
  { physicalIndex: 6, group: 1, number: 8 }, { physicalIndex: 7, group: 2, number: 8 }, { physicalIndex: 8, group: 1, number: 9 }, { physicalIndex: 9, group: 2, number: 9 }
] });
const pair1 = reconciled.remapPalMappings.find(item => item.rangeIndex === 0 && item.pairOffset === 0), pair2 = reconciled.remapPalMappings.find(item => item.rangeIndex === 0 && item.pairOffset === 1);
assert.strictEqual(pair1.sourceAmbiguous, true); assert.strictEqual(pair1.resolved, false); assert.strictEqual(pair1.inventoryStale, true); assert.strictEqual(pair2.destinationMissing, true); assert.strictEqual(pair2.resolved, false); assert(reconciled.remapPalMappings.every(item => item.inventoryStale), 'changed inventory must stale every mapping reviewed against the prior inventory');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-domain-v1-upgrade-')), sff = path.join(root, 'hero.sff'); fs.writeFileSync(sff, 'SFF');
try {
  const filename = path.join(root, '.ikemen-tools', 'palette-workspace', 'domains.json'); fs.mkdirSync(path.dirname(filename), { recursive: true }); fs.writeFileSync(filename, `${JSON.stringify(legacyDocument, null, 2)}\n`);
  const before = fs.readFileSync(filename), registry = new PaletteDomainRegistry(root), snapshot = registry.snapshot(sff); assert.strictEqual(snapshot.document.version, 2); assert(fs.readFileSync(filename).equals(before), 'reading v1 metadata must not rewrite it');
  const saved = registry.update(sff, { byteHash: snapshot.byteHash, revision: snapshot.document.revision }, { kind: 'putPaletteName', coordinate: { group: 1, number: 1 }, value: { name: 'Main' } }); assert.strictEqual(saved.document.version, 2); assert.strictEqual(saved.archive.remapPalGroups[0].mappingStatus, 'unmapped-membership'); assert.deepStrictEqual(saved.archive.remapPalGroups[0].legacyPaletteIds, legacyGroup.legacyPaletteIds);
  assert.throws(() => registry.update(sff, { byteHash: snapshot.byteHash, revision: snapshot.document.revision }, { kind: 'putPaletteName', coordinate: { group: 1, number: 2 }, value: { name: 'Stale' } }), /changed after review/);
} finally { fs.rmSync(root, { recursive: true, force: true }); }

console.log('Palette domain schema v2 range mapping, legacy preservation, overlap, reconciliation, and drift tests passed');
