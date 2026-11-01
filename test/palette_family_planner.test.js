'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const planner = require('../src/palette_family_planner');

const archiveHash = 'a'.repeat(64), colorHash = 'c'.repeat(64);
function makeInventory(palettes, overrides = {}) { return planner.normalizeInventory({ schema: planner.INVENTORY_SCHEMA, version: 1, archive: { filename: path.resolve('family-test.sff'), byteHash: overrides.archiveHash || archiveHash, byteLength: 100, sffVersion: overrides.sffVersion || '2.1' }, palettes: palettes.map((item, physicalIndex) => ({ physicalIndex, coordinate: { group: item.group, number: item.number }, link: item.link ?? null, dataSize: item.link == null ? 1024 : 0, effectiveOwnerPhysicalIndex: item.owner ?? physicalIndex, colorsHash: item.colorsHash || colorHash, usedIndexes: item.usedIndexes || [0, 1], partialAlphaIndexes: item.partialAlphaIndexes || [], indexedSpriteCount: 1, truecolorSpriteCount: 0, unavailable: item.unavailable || '' })) }); }
const archiveColors = Array.from({length:256}, (_, index) => [index, index, index, index === 0 ? 0 : 255]), archiveInventory = planner.inventoryFromArchive({ header:{version:[2,0,1,0]}, buffer:Buffer.alloc(0), sprites:[], palettes:[{index:0,group:1,number:1,link:0,dataSize:1024,colorsRgba:archiveColors},{index:1,group:2,number:1,link:0,dataSize:0}] }, {filename:path.resolve('archive-evidence.sff'),byteHash:archiveHash,byteLength:100});
assert.strictEqual(archiveInventory.palettes[1].effectiveOwnerPhysicalIndex, 0); assert.strictEqual(archiveInventory.palettes[1].link, 0); assert.strictEqual(archiveInventory.palettes[1].colorsHash, archiveInventory.palettes[0].colorsHash);
const familyPalettes = [];
for (let number = 1; number <= 70; number++) familyPalettes.push({ group: 1, number });
for (let number = 1; number <= 70; number++) familyPalettes.push({ group: 2, number });
const inventory = makeInventory(familyPalettes), mapping = { id: 'remap-main-0001', name: 'Main to transformation', enabled: true, reviewedInventoryHash: inventory.inventoryHash, rangeMappings: ['1,1-1,70 -> 2,1-2,70'] }, metadata = { remapPalGroups: [mapping] };
for (const [scope, expected] of [['source', 70], ['destination', 70], ['both', 140]]) { const plan = planner.planPaletteFamily({ inventory, archiveMetadata: metadata, metadataRevision: 8, namedMappingIds: [mapping.id], scope }); assert.strictEqual(plan.selections.length, expected, `${scope} selects exact physical palettes`); assert.strictEqual(plan.blockers.length, 0); assert.strictEqual(plan.readOnly, true); assert.strictEqual(plan.activeSffChanged, false); planner.verifyPlanBinding(plan, { inventory, archiveMetadata: metadata, metadataRevision: 8 }); }

const holesInventory = makeInventory([{group:1,number:1},{group:2,number:1},{group:1,number:5},{group:2,number:5}]);
const holes = planner.planPaletteFamily({ inventory: holesInventory, archiveMetadata: {}, metadataRevision: 0, explicitRangeMappings: ['1,1-1,1 -> 2,1-2,1','1,5-1,5 -> 2,5-2,5'], scope: 'both' }); assert.strictEqual(holes.selections.length, 4); assert.strictEqual(holes.blockers.length, 0);
const duplicate = planner.planPaletteFamily({ inventory: holesInventory, archiveMetadata: {}, metadataRevision: 0, explicitRangeMappings: ['1,1-1,1 -> 2,1-2,1','1,1-1,1 -> 2,1-2,1'], scope: 'both' }); assert.strictEqual(duplicate.selections.length, 2); assert.strictEqual(duplicate.deduplicatedOverlaps.length, 2); assert(duplicate.warnings.some(item => item.code === 'DUPLICATE_MAPPING'));

const conflictInventory = makeInventory([{group:1,number:1},{group:2,number:1},{group:3,number:1},{group:4,number:1}]);
const conflict = planner.planPaletteFamily({ inventory: conflictInventory, archiveMetadata: {}, metadataRevision: 0, explicitRangeMappings: ['1,1-1,1 -> 2,1-2,1','1,1-1,1 -> 3,1-3,1','4,1-4,1 -> 2,1-2,1'], scope: 'both' }); assert(conflict.blockers.some(item => item.code === 'CONFLICTING_SOURCE_OVERLAP')); assert(conflict.blockers.some(item => item.code === 'CONFLICTING_DESTINATION_OVERLAP')); assert.strictEqual(conflict.canProceedToTopologyReview, false);

const missing = planner.planPaletteFamily({ inventory: makeInventory([{group:1,number:1}]), archiveMetadata: {}, metadataRevision: 0, explicitRangeMappings: ['1,1-1,2 -> 2,1-2,2'], scope: 'both' }); assert(missing.blockers.filter(item => item.code === 'PALETTE_COORDINATE_MISSING').length >= 3);
const ambiguous = planner.planPaletteFamily({ inventory: makeInventory([{group:1,number:1},{group:1,number:1},{group:2,number:1}]), archiveMetadata: {}, metadataRevision: 0, explicitRangeMappings: ['1,1-1,1 -> 2,1-2,1'], scope: 'both' }); assert(ambiguous.blockers.some(item => item.code === 'PALETTE_COORDINATE_AMBIGUOUS' && item.physicalIndexes.length === 2));
assert.throws(() => planner.planPaletteFamily({ inventory, archiveMetadata: {}, metadataRevision: 0, explicitRangeMappings: [{ source: { group:1,startNumber:1,endNumber:3 }, destination: { group:2,startNumber:1,endNumber:2 } }] }), /equal lengths/);

const stale = planner.planPaletteFamily({ inventory, archiveMetadata: { remapPalGroups: [{ ...mapping, reviewedInventoryHash: 'b'.repeat(64) }] }, metadataRevision: 8, namedMappingIds: [mapping.id] }); assert(stale.blockers.some(item => item.code === 'STALE_MAPPING_EVIDENCE'));
const unreviewed = planner.planPaletteFamily({ inventory, archiveMetadata: { remapPalGroups: [{ ...mapping, reviewedInventoryHash: '' }] }, metadataRevision: 8, namedMappingIds: [mapping.id] }); assert(unreviewed.blockers.some(item => item.code === 'MAPPING_NOT_REVIEWED'));

const aliasInventory = makeInventory([{group:1,number:1},{group:2,number:1,link:0,owner:0}]), aliasMetadata = { remapPalGroups: [{ id:'remap-alias-01',name:'Alias',enabled:true,reviewedInventoryHash:aliasInventory.inventoryHash,rangeMappings:['1,1-1,1 -> 2,1-2,1']}] };
const aliasPlan = planner.planPaletteFamily({ inventory: aliasInventory, archiveMetadata: aliasMetadata, metadataRevision: 2, namedMappingIds: ['remap-alias-01'], scope: 'both' }); const alias = aliasPlan.selections.find(item => item.coordinate.group === 2); assert.strictEqual(alias.linked, true); assert.strictEqual(alias.effectiveOwnerPhysicalIndex, 0); assert(aliasPlan.reviewItems.some(item => item.code === 'LINKED_OWNER_DECISION_REQUIRED')); assert.strictEqual(aliasPlan.canProceedToTopologyReview, false, 'linked ownership remains surfaced rather than silently resolved');

const full = Array.from({length:256}, (_, index) => index), capacityInventory = makeInventory([{group:1,number:1,usedIndexes:full},{group:2,number:1,usedIndexes:full}]);
const capacity = planner.planPaletteFamily({ inventory: capacityInventory, archiveMetadata: {}, metadataRevision: 0, explicitRangeMappings: ['1,1-1,1 -> 2,1-2,1'], requiredNewSlots: 1 }); assert(capacity.blockers.some(item => item.code === 'PALETTE_CAPACITY'));
const alphaInventory = makeInventory([{group:1,number:1,partialAlphaIndexes:[5]},{group:2,number:1,partialAlphaIndexes:[5]}]);
const profile = planner.planPaletteFamily({ inventory: alphaInventory, archiveMetadata: {}, metadataRevision: 0, explicitRangeMappings: ['1,1-1,1 -> 2,1-2,1'], profile: { id:'binary-alpha', allowPartialAlpha:false } }); assert(profile.blockers.some(item => item.code === 'PROFILE_PARTIAL_ALPHA'));

const exactPlan = planner.planPaletteFamily({ inventory: holesInventory, archiveMetadata: {}, metadataRevision: 4, explicitRangeMappings: ['1,1-1,1 -> 2,1-2,1'] });
assert.throws(() => planner.verifyPlanBinding(exactPlan, { inventory: makeInventory([{group:1,number:1},{group:2,number:1}], {archiveHash:'d'.repeat(64)}), archiveMetadata: {}, metadataRevision: 4 }), /inventory changed/);
assert.throws(() => planner.verifyPlanBinding(exactPlan, { inventory: holesInventory, archiveMetadata: {}, metadataRevision: 5 }), /metadata changed/);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-family-cancel-')), marker = path.join(root, 'active.sff'); fs.writeFileSync(marker, 'unchanged');
try { const cancelled = planner.planPaletteFamily({ cancelled: true }); assert.strictEqual(cancelled.cancelled, true); assert.strictEqual(cancelled.activeSffChanged, false); assert.strictEqual(fs.readFileSync(marker, 'utf8'), 'unchanged'); } finally { fs.rmSync(root, { recursive: true, force: true }); }

console.log('Palette-family read-only expansion, scope, overlap, alias, drift, profile, capacity, and cancel tests passed');
