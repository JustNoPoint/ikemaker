'use strict';

const assert = require('assert');
const { createAirCollisionInspection } = require('../src/air_collision_inspection_model');
const { MAX_SOURCE_BYTES, createAirCollisionEditImpact } = require('../src/air_collision_edit_impact_model');

const capability = 'A'.repeat(64);
const source = `[Begin Action 100]
Clsn1Default: 2 ; first owner
Clsn1[0] = -10,-20,10,20
Clsn1[1] = -5,-8,5,8
Clsn2Default: 1
Clsn2[0] = -8,-18,8,18
100,0,0,0,1
100,1,0,0,1
Clsn1: 1 ; explicit interruption
Clsn1[0] = -2,-3,2,3
100,2,0,0,1
Clsn1Default: 1 ; replacement owner
Clsn1[0] = -20,-30,20,30
100,3,0,0,1
100,4,0,0,1
`;
const stableOptions = { target: { channel: 'stable', version: '1.0' }, allocationDecision: { enabled: false, status: 'unsupported' }, capabilityFingerprint: capability };
const nightlyOptions = { target: { channel: 'nightly', buildId: 'verified' }, allocationDecision: { capability: { id: 'collision.air-index-allocation' }, enabled: true, status: 'supported', capabilityFingerprint: capability }, capabilityFingerprint: capability };
function inspection(text, elementIndex, group = 'clsn1', nightly = false) { return createAirCollisionInspection({ text, action: 100, elementIndex, ...(nightly ? nightlyOptions : stableOptions) }); }
function impact(text, elementIndex, groupKey = 'clsn1', slot = 0, intent = { kind: 'inspect' }, nightly = false) { return createAirCollisionEditImpact({ text, inspection: inspection(text, elementIndex, groupKey, nightly), capabilityFingerprint: capability, action: 100, actionOccurrence: 0, elementIndex, groupKey, slot, intent }); }

const owner = impact(source, 0);
assert.strictEqual(owner.status, 'default-owner'); assert.strictEqual(owner.ownership.ownerLine, 2); assert.strictEqual(owner.ownership.affected.count, 2); assert.strictEqual(owner.ownership.affected.ownerCount, 1); assert.strictEqual(owner.ownership.affected.inheritorCount, 1); assert.deepStrictEqual(owner.ownership.affected.frames.map(item => item.elementIndex), [0, 1], 'a later replacement default and intervening explicit block are not counted');
assert.strictEqual(owner.materializationRequired, false); assert.strictEqual(owner.effectiveBefore.length, 2); assert(Object.isFrozen(owner) && Object.isFrozen(owner.ownership.affected.frames));
assert.strictEqual(impact(source, 0).impactHash, owner.impactHash, 'identical evidence produces one deterministic projection');

const inheritedEdit = impact(source, 1, 'clsn1', 1, { kind: 'edit', rect: [-6, -9, 6, 9] });
assert.strictEqual(inheritedEdit.status, 'inherited-default'); assert.strictEqual(inheritedEdit.materializationRequired, true); assert.strictEqual(inheritedEdit.materializesCount, 2); assert.strictEqual(inheritedEdit.ownership.ownerLine, 2); assert.deepStrictEqual(inheritedEdit.proposedAfter.map(item => item.normalizedRect), [[-10, -20, 10, 20], [-6, -9, 6, 9]], 'all effective boxes are materialized before the selected edit');
assert.match(inheritedEdit.limitations.join(' '), /shared default remains unchanged/i);
const inheritedInspect = impact(source, 1); assert.strictEqual(inheritedInspect.materializationOnEdit, true); assert.strictEqual(inheritedInspect.materializesCount, 2); assert.strictEqual(inheritedInspect.materializationRequired, false, 'read-only inspection discloses later edit materialization without claiming it is already occurring');
const reversedEdit = impact(source, 1, 'clsn1', 1, { kind: 'edit', rect: [6, 9, -6, -9] }); assert.deepStrictEqual(reversedEdit.proposedAfter[1].normalizedRect, [-6, -9, 6, 9], 'proposed coordinates are normalized before being labeled normalizedRect');
const inheritedDelete = impact(source, 1, 'clsn1', 0, { kind: 'delete' }); assert.strictEqual(inheritedDelete.proposedAfter.length, 1); assert.strictEqual(inheritedDelete.proposedAfter[0].slot, 0, 'Stable source-order deletion reprojects remaining semantic order');
const inheritedAdd = impact(source, 1, 'clsn1', 2, { kind: 'add', rect: [-1, -1, 1, 1] }); assert.strictEqual(inheritedAdd.proposedAfter.length, 3); assert.deepStrictEqual(inheritedAdd.proposedAfter[2].normalizedRect, [-1, -1, 1, 1]);

const explicit = impact(source, 2, 'clsn1', 0, { kind: 'return-to-default' });
assert.strictEqual(explicit.status, 'frame-specific'); assert.strictEqual(explicit.returnToDefaultsAvailable, true); assert.strictEqual(explicit.ownership.fallbackLine, 2); assert.strictEqual(explicit.proposedAfter.length, 2, 'return-to-default exposes the proven earlier fallback without changing it');
const clsn2 = impact(source, 2, 'clsn2'); assert.strictEqual(clsn2.status, 'inherited-default'); assert.strictEqual(clsn2.ownership.ownerLine, 5); assert.strictEqual(clsn2.effectiveBefore.length, 1, 'Clsn2 ownership remains independent from the explicit Clsn1 interruption');
const replacement = impact(source, 3); assert.strictEqual(replacement.status, 'default-owner'); assert.deepStrictEqual(replacement.ownership.affected.frames.map(item => item.elementIndex), [3, 4]);

const noBoxes = '[Begin Action 100]\n100,0,0,0,1\n', newBlock = impact(noBoxes, 0, 'clsn1', 0, { kind: 'add', rect: [1, 2, 3, 4] });
assert.strictEqual(newBlock.status, 'new-frame-block'); assert.deepStrictEqual(newBlock.proposedAfter[0].normalizedRect, [1, 2, 3, 4]); assert.strictEqual(newBlock.materializationRequired, false);

const indexedSource = '[Begin Action 100]\nClsn1: 2\nClsn1[1]=5,6,7,8\nClsn1[0]=1,2,3,4\n100,0,0,0,1\n', indexedDelete = impact(indexedSource, 0, 'clsn1', 0, { kind: 'delete' }, true);
assert.strictEqual(indexedDelete.status, 'frame-specific'); assert.deepStrictEqual(indexedDelete.proposedAfter.map(item => item.slot), [1], 'Nightly authoritative labels are not silently renumbered'); assert.match(indexedDelete.limitations.join(' '), /count gap/);

const unfilledSource = '[Begin Action 100]\nClsn1: 2\nClsn1[0]=1,2,3,4\n100,0,0,0,1\n', filled = impact(unfilledSource, 0, 'clsn1', 1, { kind: 'edit', rect: [5, 6, 7, 8] });
assert.strictEqual(filled.status, 'frame-specific'); assert.strictEqual(filled.effectiveBefore[1].filled, false); assert.deepStrictEqual(filled.effectiveBefore[1].normalizedRect, [0, 0, 0, 0]); assert.strictEqual(filled.proposedAfter[1].filled, true, 'allocated-unfilled Stable slots retain zero geometry and can be explicitly repaired');
const inheritedUnfilledSource = '[Begin Action 100]\nClsn1Default: 2\nClsn1[0]=1,2,3,4\n100,0,0,0,1\n100,1,0,0,1\n', inheritedUnfilled = impact(inheritedUnfilledSource, 1, 'clsn1', 1, { kind: 'edit', rect: [5, 6, 7, 8] }); assert.strictEqual(inheritedUnfilled.materializationRequired, true); assert.deepStrictEqual(inheritedUnfilled.effectiveBefore[1].normalizedRect, [0, 0, 0, 0], 'inherited materialization retains allocated-unfilled zero geometry');

const crlf = source.trimEnd().replace(/\n/g, '\r\n') + '; eof', crlfBefore = crlf, crlfImpact = impact(crlf, 1);
assert.strictEqual(crlfImpact.status, 'inherited-default'); assert.strictEqual(crlf, crlfBefore, 'CRLF, comments, and no-final-EOL source bytes are never changed');

const duplicate = source + source.replace('[Begin Action 100]', '[Begin Action 100]'), duplicateImpact = createAirCollisionEditImpact({ text: duplicate, inspection: inspection(duplicate, 0), capabilityFingerprint: capability, action: 100, actionOccurrence: 0, elementIndex: 0, groupKey: 'clsn1', slot: 0, intent: { kind: 'inspect' } }); assert.strictEqual(duplicateImpact.status, 'unavailable');
const copyText = '[Begin Action 100]\n100,0,0,0,1\n[Begin Action 200]\nCopy Action 100\n', copyInspection = createAirCollisionInspection({ text: copyText, action: 200, elementIndex: 0, ...stableOptions }), copyImpact = createAirCollisionEditImpact({ text: copyText, inspection: copyInspection, capabilityFingerprint: capability, action: 200, actionOccurrence: 0, elementIndex: 0, groupKey: 'clsn1', slot: 0, intent: { kind: 'inspect' } }); assert.strictEqual(copyImpact.status, 'unavailable'); assert.match(copyImpact.reason, /Copy Action|read-only|selection/i);
const staleInspection = inspection(source, 0), stale = createAirCollisionEditImpact({ text: source + '; changed\n', inspection: staleInspection, capabilityFingerprint: capability, action: 100, actionOccurrence: 0, elementIndex: 0, groupKey: 'clsn1', slot: 0, intent: { kind: 'inspect' } }); assert.strictEqual(stale.status, 'unavailable'); assert.match(stale.reason, /changed/);
const capabilityStale = createAirCollisionEditImpact({ text: source, inspection: staleInspection, capabilityFingerprint: 'B'.repeat(64), action: 100, actionOccurrence: 0, elementIndex: 0, groupKey: 'clsn1', slot: 0, intent: { kind: 'inspect' } }); assert.strictEqual(capabilityStale.status, 'unavailable');
for (const invalidCapability of ['SHORT', 'a'.repeat(64), 'Z'.repeat(64)]) { const invalidInspection = createAirCollisionInspection({ text: source, action: 100, elementIndex: 0, ...stableOptions, capabilityFingerprint: invalidCapability }); const invalid = createAirCollisionEditImpact({ text: source, inspection: invalidInspection, capabilityFingerprint: invalidCapability, action: 100, actionOccurrence: 0, elementIndex: 0, groupKey: 'clsn1', slot: 0, intent: { kind: 'inspect' } }); assert.strictEqual(invalid.status, 'unavailable'); assert.match(invalid.reason, /canonical capability fingerprint/i); }
const tooLarge = createAirCollisionEditImpact({ text: 'x'.repeat(MAX_SOURCE_BYTES + 1) }); assert.strictEqual(tooLarge.status, 'unavailable');

const caller = { text: source, inspection: staleInspection, capabilityFingerprint: capability, action: 100, actionOccurrence: 0, elementIndex: 0, groupKey: 'clsn1', slot: 0, intent: { kind: 'inspect' } }, before = JSON.stringify(caller); createAirCollisionEditImpact(caller); assert.strictEqual(JSON.stringify(caller), before, 'caller evidence is never mutated');
let getterRuns = 0; const accessor = {}; Object.defineProperty(accessor, 'text', { enumerable: true, get() { getterRuns += 1; return source; } }); assert.strictEqual(createAirCollisionEditImpact(accessor).status, 'unavailable'); assert.strictEqual(getterRuns, 0, 'accessor evidence is rejected without execution');
let proxyRuns = 0; const proxy = new Proxy({}, { get() { proxyRuns += 1; throw new Error('trap'); }, ownKeys() { proxyRuns += 1; throw new Error('trap'); } }); assert.strictEqual(createAirCollisionEditImpact(proxy).status, 'unavailable'); assert.strictEqual(proxyRuns, 0, 'proxy evidence is rejected before traps');
const cyclic = {}; cyclic.self = cyclic; assert.strictEqual(createAirCollisionEditImpact(cyclic).status, 'unavailable');
for (const result of [owner, inheritedEdit, explicit, newBlock]) { const serialized = JSON.stringify(result); for (const forbidden of ['routeToken', 'commandId', 'workspaceEdit', 'applyEdit', 'save']) assert(!serialized.includes(forbidden)); assert.deepStrictEqual(result.effects, { filesystem: false, editor: false, clipboard: false, command: false, route: false, mutationAuthority: false }); }

console.log('AIR collision edit-impact model preserves exact default/frame ownership and materialization semantics without writing');
