'use strict';

const assert = require('assert');
const { createAirCollisionInspection } = require('../src/air_collision_inspection_model');
const { createAirCollisionEditImpact } = require('../src/air_collision_edit_impact_model');
const { MAX_SOURCE_BYTES, createAirCollisionEditPlan } = require('../src/air_collision_edit_plan');

const capability = 'C'.repeat(64);
const stable = { target: { channel: 'stable', version: '1.0' }, allocationDecision: { enabled: false, status: 'unsupported', capabilityFingerprint: capability }, capabilityFingerprint: capability };
const nightly = { target: { channel: 'nightly', buildId: 'verified' }, allocationDecision: { capability: { id: 'collision.air-index-allocation' }, enabled: true, status: 'supported', capabilityFingerprint: capability }, capabilityFingerprint: capability };
function evidence(text, elementIndex, groupKey, slot, operation, indexed = false) {
  const options = indexed && typeof indexed === 'object' ? indexed : indexed ? nightly : stable, inspection = createAirCollisionInspection({ text, action: 100, actionOccurrence: 0, elementIndex, ...options }), intent = { kind: operation.kind, ...(operation.rect ? { rect: operation.rect } : {}) }, impact = createAirCollisionEditImpact({ text, inspection, capabilityFingerprint: capability, action: 100, actionOccurrence: 0, elementIndex, groupKey, slot, intent });
  return { text, inspection, impact, capabilityFingerprint: capability, action: 100, actionOccurrence: 0, elementIndex, groupKey, slot, operation };
}
function plan(...args) { return createAirCollisionEditPlan(evidence(...args)); }
function apply(text, result) { assert.strictEqual(text.slice(result.patch.start, result.patch.end), result.patch.before); return text.slice(0, result.patch.start) + result.patch.replacement + text.slice(result.patch.end); }

const source = `[Begin Action 100]
Clsn1Default: 2 ; shared attack
  Clsn1[0] = -10, -20, 10, 20 ; torso
  ; keep between
  Clsn1[1] = -5, -8, 5, 8
Clsn2Default: 1
Clsn2[0] = -8, -18, 8, 18
100,0,0,0,1
100,1,0,0,1
Clsn1: 1 ; local
Clsn1[0] = -2, -3, 2, 3 ; local box
100,2,0,0,1
Clsn1Default: 1 ; replacement
Clsn1[0] = -20,-30,20,30
100,3,0,0,1
100,4,0,0,1`;

const defaultEdit = plan(source, 0, 'clsn1', 0, { kind: 'edit', rect: [11, 21, -11, -21] });
assert.strictEqual(defaultEdit.status, 'ready', defaultEdit.reason); assert.strictEqual(defaultEdit.ownership.kind, 'default-owner'); assert.match(defaultEdit.impact, /1 owner and 1 inheritor/); assert.strictEqual(defaultEdit.patch.before.trim(), '-10, -20, 10, 20'); assert.strictEqual(defaultEdit.patch.replacement, '-11, -21, 11, 21');
assert.deepStrictEqual(defaultEdit.selection.operation, { kind: 'edit', rect: [-11, -21, 11, 21] }, 'the plan-hashed operation stores normalized coordinates');
const changedCoordinate = plan(source, 0, 'clsn1', 0, { kind: 'edit', rect: [11, 21, -12, -21] }); assert.notStrictEqual(changedCoordinate.planHash, defaultEdit.planHash, 'changing one normalized coordinate changes plan identity');
const defaultText = apply(source, defaultEdit); assert(defaultText.includes('Clsn1[0] = -11, -21, 11, 21 ; torso')); assert(defaultText.includes('  ; keep between')); assert.strictEqual(defaultText.slice(0, defaultEdit.patch.start), source.slice(0, defaultEdit.patch.start));
assert.strictEqual(createAirCollisionEditPlan(evidence(source, 0, 'clsn1', 0, { kind: 'edit', rect: [11, 21, -11, -21] })).planHash, defaultEdit.planHash, 'same evidence yields deterministic plan'); assert(Object.isFrozen(defaultEdit) && Object.isFrozen(defaultEdit.patch));

const inheritedEdit = plan(source, 1, 'clsn1', 1, { kind: 'edit', rect: [-6, -9, 6, 9] });
assert.strictEqual(inheritedEdit.status, 'ready'); assert.match(inheritedEdit.impact, /Materialize all 2/); assert.strictEqual(inheritedEdit.patch.start, inheritedEdit.patch.end); const inheritedText = apply(source, inheritedEdit); assert(inheritedText.includes('Clsn1: 2\nClsn1[0] = -10, -20, 10, 20\nClsn1[1] = -6, -9, 6, 9\n100,1,0,0,1')); assert(source.includes('Clsn1Default: 2 ; shared attack'), 'shared default input remains untouched');

const explicitEdit = plan(source, 2, 'clsn1', 0, { kind: 'edit', rect: [-3, -4, 3, 4] });
assert.strictEqual(explicitEdit.status, 'ready'); assert.strictEqual(explicitEdit.ownership.kind, 'frame-specific'); assert.strictEqual(explicitEdit.patch.before.trim(), '-2, -3, 2, 3'); assert(apply(source, explicitEdit).includes('-3, -4, 3, 4 ; local box'));
const returnPlan = plan(source, 2, 'clsn1', 0, { kind: 'return-to-default' }); assert.strictEqual(returnPlan.status, 'ready'); const returned = apply(source, returnPlan); assert(!returned.includes('Clsn1: 1 ; local')); assert(returned.includes('; local') && returned.includes('; local box'), 'return removes local code while preserving all inline comments as comment-only lines');
assert.deepStrictEqual(returnPlan.selection.operation, { kind: 'return-to-default' }); assert.strictEqual(plan(source, 2, 'clsn1', 0, { kind: 'return-to-default', rect: [0,0,1,1] }).status, 'conflict', 'Return rejects unrelated rectangle evidence');
const independent = plan(source, 2, 'clsn2', 0, { kind: 'edit', rect: [-9, -19, 9, 19] }); assert.strictEqual(independent.ownership.kind, 'inherited-default'); assert.match(independent.patch.replacement, /^Clsn2:/); assert(!independent.patch.replacement.includes('Clsn1'));

const empty = '[Begin Action 100]\n100,0,0,0,1', added = plan(empty, 0, 'clsn1', 0, { kind: 'add', rect: [4, 3, 2, 1] }); assert.strictEqual(added.status, 'ready'); assert.strictEqual(apply(empty, added), '[Begin Action 100]\nClsn1: 1\nClsn1[0] = 2, 1, 4, 3\n100,0,0,0,1');
const emptyEdit = plan(empty, 0, 'clsn1', 0, { kind: 'edit', rect: [1, 2, 3, 4] }); assert.strictEqual(emptyEdit.ready, false);

const commented = '[Begin Action 100]\nClsn1: 2 ; count\n  Clsn1[0] = 1,2,3,4 ; remove me\n  ; middle\n  Clsn1[1] = 5,6,7,8 ; keep me\n100,0,0,0,1\n';
const stableDelete = plan(commented, 0, 'clsn1', 0, { kind: 'delete' }); assert.strictEqual(stableDelete.status, 'ready'); const stableDeleted = apply(commented, stableDelete); assert(stableDeleted.includes('Clsn1: 1 ; count')); assert(stableDeleted.includes('; remove me')); assert(stableDeleted.includes('Clsn1[1] = 5,6,7,8 ; keep me')); assert(stableDeleted.includes('  ; middle'));
assert.deepStrictEqual(stableDelete.selection.operation, { kind: 'delete' }); assert.strictEqual(plan(commented, 0, 'clsn1', 0, { kind: 'delete', rect: [0,0,1,1] }).status, 'conflict', 'Delete rejects unrelated rectangle evidence');
const duplicateLabels = '[Begin Action 100]\nClsn1: 2\nClsn1[7]=1,2,3,4 ; first\nClsn1[7]=5,6,7,8 ; second\n100,0,0,0,1\n', duplicateDelete = plan(duplicateLabels, 0, 'clsn1', 0, { kind: 'delete' }); assert.strictEqual(duplicateDelete.status, 'ready'); const duplicateDeleted = apply(duplicateLabels, duplicateDelete); assert(!duplicateDeleted.includes('1,2,3,4') && duplicateDeleted.includes('Clsn1[7]=5,6,7,8 ; second'), 'Stable source order, not duplicate authored labels, identifies the deleted slot');
const oddLabels = '[Begin Action 100]\nClsn1: 2\nClsn1[99]=1,2,3,4\nClsn1[4]=5,6,7,8\n100,0,0,0,1\n', oddDelete = plan(oddLabels, 0, 'clsn1', 1, { kind: 'delete' }); assert.strictEqual(oddDelete.status, 'ready'); const oddDeleted = apply(oddLabels, oddDelete); assert(oddDeleted.includes('Clsn1[99]=1,2,3,4') && !oddDeleted.includes('Clsn1[4]'), 'Stable preserves unaffected out-of-range authored labels while selecting by source order');

const unfilledDefault = '[Begin Action 100]\nClsn1Default: 2\nClsn1[0]=1,2,3,4\n100,0,0,0,1\n100,1,0,0,1\n', repaired = plan(unfilledDefault, 1, 'clsn1', 1, { kind: 'edit', rect: [8, 7, 6, 5] }); assert.strictEqual(repaired.status, 'ready'); assert(repaired.patch.replacement.includes('Clsn1[0] = 1, 2, 3, 4') && repaired.patch.replacement.includes('Clsn1[1] = 6, 5, 8, 7'), 'Stable inherited materialization includes and repairs allocated-unfilled zero slot');
const incompleteOwner = '[Begin Action 100]\r\nClsn1: 2 ; incomplete local\r\n  Clsn1[9]=1,2,3,4\r\n  ; retain gap\r\n100,0,0,0,1', ownerRepair = plan(incompleteOwner, 0, 'clsn1', 1, { kind: 'edit', rect: [8,7,6,5] }); assert.strictEqual(ownerRepair.status, 'ready'); const ownerRepaired = apply(incompleteOwner, ownerRepair); assert(ownerRepaired.includes('Clsn1[9]=1,2,3,4') && ownerRepaired.includes('  ; retain gap\r\n') && ownerRepaired.includes('Clsn1[1] = 6, 5, 8, 7\r\n100,0'), 'Stable frame-specific incomplete block is repaired through its exact pre-frame boundary');
const incompleteDefaultOwner = '[Begin Action 100]\r\nClsn1Default: 2 ; incomplete default\r\nClsn1[0]=1,2,3,4\r\n; keep\r\n100,0,0,0,1', defaultRepair = plan(incompleteDefaultOwner, 0, 'clsn1', 1, { kind: 'add', rect: [5,6,7,8] }); assert.strictEqual(defaultRepair.status, 'ready'); const defaultRepaired = apply(incompleteDefaultOwner, defaultRepair); assert(defaultRepaired.includes('Clsn1Default: 2 ; incomplete default') && defaultRepaired.includes('; keep\r\n') && defaultRepaired.includes('Clsn1[1] = 5, 6, 7, 8\r\n100,0'));

const indexed = '[Begin Action 100]\nClsn1: 3\nClsn1[0]=1,2,3,4\nClsn1[1]=5,6,7,8\nClsn1[2]=9,10,11,12\n100,0,0,0,1\n';
const middleIndexed = plan(indexed, 0, 'clsn1', 1, { kind: 'delete' }, true); assert.strictEqual(middleIndexed.status, 'conflict'); assert.match(middleIndexed.reason, /highest safely shrinkable/);
const highestIndexed = plan(indexed, 0, 'clsn1', 2, { kind: 'delete' }, true); assert.strictEqual(highestIndexed.status, 'ready'); const indexedDeleted = apply(indexed, highestIndexed); assert(indexedDeleted.includes('Clsn1: 2') && indexedDeleted.includes('Clsn1[1]=5,6,7,8') && !indexedDeleted.includes('Clsn1[2]'));
const indexedAppend = '[Begin Action 100]\nClsn1: 1\nClsn1[0]=1,2,3,4\n100,0,0,0,1\n', indexedFill = plan(indexedAppend, 0, 'clsn1', 1, { kind: 'add', rect: [5,6,7,8] }, true); assert.strictEqual(indexedFill.status, 'ready'); assert(apply(indexedAppend, indexedFill).includes('Clsn1[1] = 5, 6, 7, 8'));
const pinnedNightly = { ...nightly, allocationDecision: { ...nightly.allocationDecision, message: 'Pinned build supports indexed labels.' } }, pinnedPlan = plan(indexedAppend, 0, 'clsn1', 1, { kind: 'add', rect: [5,6,7,8] }, pinnedNightly); assert.strictEqual(pinnedPlan.status, 'ready', pinnedPlan.reason);

const crlf = source.replace(/\n/g, '\r\n'), crlfPlan = plan(crlf, 1, 'clsn1', 0, { kind: 'edit', rect: [-12,-22,12,22] }); assert.strictEqual(crlfPlan.status, 'ready'); const crlfResult = apply(crlf, crlfPlan); assert(!/(^|[^\r])\n/.test(crlfResult), 'CRLF style is preserved'); assert(!crlfResult.endsWith('\r\n'), 'no-final-EOL state is preserved');
const mixed = source.replace('Clsn1[0] = -2, -3, 2, 3 ; local box\n', 'Clsn1[0] = -2, -3, 2, 3 ; local box\r\n'), mixedPlan = plan(mixed, 2, 'clsn1', 0, { kind: 'edit', rect: [-4,-5,4,5] }); assert.strictEqual(mixedPlan.status, 'ready'); const mixedResult = apply(mixed, mixedPlan); assert.strictEqual(mixedResult.slice(0, mixedPlan.patch.start), mixed.slice(0, mixedPlan.patch.start)); assert.strictEqual(mixedResult.slice(mixedPlan.patch.start + mixedPlan.patch.replacement.length), mixed.slice(mixedPlan.patch.end));

const stale = evidence(source, 0, 'clsn1', 0, { kind: 'edit', rect: [1,2,3,4] }); stale.text += '\n; drift'; assert.strictEqual(createAirCollisionEditPlan(stale).status, 'unavailable');
const wrongImpact = evidence(source, 0, 'clsn1', 0, { kind: 'edit', rect: [1,2,3,4] }); wrongImpact.operation = { kind: 'delete' }; assert.strictEqual(createAirCollisionEditPlan(wrongImpact).status, 'unavailable');
const lowercase = evidence(source, 0, 'clsn1', 0, { kind: 'edit', rect: [1,2,3,4] }); lowercase.capabilityFingerprint = capability.toLowerCase(); assert.strictEqual(createAirCollisionEditPlan(lowercase).status, 'unavailable');
assert.strictEqual(createAirCollisionEditPlan({ text: 'x'.repeat(MAX_SOURCE_BYTES + 1) }).status, 'unavailable');
let getterRuns = 0; const accessor = {}; Object.defineProperty(accessor, 'text', { enumerable: true, get() { getterRuns += 1; return source; } }); assert.strictEqual(createAirCollisionEditPlan(accessor).status, 'unavailable'); assert.strictEqual(getterRuns, 0);
let proxyRuns = 0; const proxy = new Proxy({}, { get() { proxyRuns += 1; throw new Error('trap'); }, ownKeys() { proxyRuns += 1; throw new Error('trap'); } }); assert.strictEqual(createAirCollisionEditPlan(proxy).status, 'unavailable'); assert.strictEqual(proxyRuns, 0);
const cyclic = {}; cyclic.self = cyclic; assert.strictEqual(createAirCollisionEditPlan(cyclic).status, 'unavailable');
for (const result of [defaultEdit, inheritedEdit, explicitEdit, returnPlan, added, stableDelete, highestIndexed]) { assert.strictEqual(apply(result === added ? empty : result === stableDelete ? commented : result === highestIndexed ? indexed : source, result).length >= 0, true); assert.deepStrictEqual(result.effects, { filesystem: false, editor: false, clipboard: false, command: false, route: false, mutationAuthority: false }); const serialized = JSON.stringify(result); for (const forbidden of ['routeToken', 'workspaceEdit', 'applyEdit', 'saveDocument']) assert(!serialized.includes(forbidden)); }

console.log('AIR collision edit planner emits one exact lossless reviewed patch across ownership and allocation profiles');
