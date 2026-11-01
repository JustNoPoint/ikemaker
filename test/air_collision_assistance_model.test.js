'use strict';

const assert = require('assert');
const crypto = require('crypto');
const { MAX_SELECTED_FRAMES, MAX_BOX_CAP, createAirCollisionAssistanceProposals } = require('../src/air_collision_assistance_model');

const sha = value => crypto.createHash('sha256').update(value, 'utf8').digest('hex').toUpperCase();
const capability = 'C'.repeat(64);
const text = `[Begin Action 100]
Clsn1Default: 2
Clsn1[0]=-10,-20,0,0
Clsn1[1]=1,2,3,4
Clsn2Default: 3
Clsn2[0]=-8,-18,8,18
Clsn2[1]=-4,-12,4,0
Clsn2[2]=10,11,12,13
100,0,0,0,1
Clsn1: 1
Clsn1[0]=-9,-19,1,1
Clsn2: 2
Clsn2[0]=-7,-17,7,17
Clsn2[1]=-3,-11,3,1
100,1,0,0,1
100,2,0,0,1
`;
function input(changes = {}) { return { text, sourceFingerprint: sha(text), capabilityFingerprint: capability, target: { channel: 'stable', version: '1.0' }, allocationDecision: { enabled: false, status: 'unsupported', capabilityFingerprint: capability }, action: 100, actionOccurrence: 0, referenceElementIndex: 0, targetElementIndices: [2, 1], groups: { clsn1: { enabled: true, cap: 1 }, clsn2: { enabled: true, cap: 2 } }, locks: { frames: [], boxes: [] }, ...changes }; }

const result = createAirCollisionAssistanceProposals(input());
assert.strictEqual(result.status, 'ready'); assert.deepStrictEqual(result.selection.targetElementIndices, [1, 2], 'explicit targets normalize deterministically');
for (const target of result.targets) { assert.strictEqual(target.groups.clsn1.proposals.length, 1); assert.strictEqual(target.groups.clsn2.proposals.length, 2); assert.strictEqual(target.groups.clsn1.omittedByCap, 1); assert.strictEqual(target.groups.clsn2.omittedByCap, 1); }
assert.deepStrictEqual(result.targets[0].groups.clsn1.proposals[0].rect, [-10, -20, 0, 0]);
assert.strictEqual(result.totals.omittedByCap, 4, 'Clsn1 and Clsn2 caps are counted independently per target');
assert(Object.isFrozen(result) && Object.isFrozen(result.targets[0].groups.clsn2.proposals[0].rect));
assert.strictEqual(createAirCollisionAssistanceProposals(input()).proposalHash, result.proposalHash, 'same source and selection produce deterministic frozen proposals');
assert.deepStrictEqual(result.effects, { filesystem: false, editor: false, clipboard: false, command: false, route: false, network: false, mutationAuthority: false, simulation: false });
assert(!JSON.stringify(result).match(/body|head|torso|limb|semanticLabel/i), 'the proposal schema contains no body-part tagging');
assert(!JSON.stringify(result).match(/patch|replacement|workspaceEdit|applyEdit/i), 'C13A emits no mutation plan or patch');

const independent = createAirCollisionAssistanceProposals(input({ groups: { clsn1: { enabled: false, cap: 0 }, clsn2: { enabled: true, cap: 1 } } }));
assert.strictEqual(independent.targets[0].groups.clsn1.status, 'disabled'); assert.deepStrictEqual(independent.targets[0].groups.clsn1.proposals, []); assert.strictEqual(independent.targets[0].groups.clsn2.proposals.length, 1);

const locked = createAirCollisionAssistanceProposals(input({ targetElementIndices: [1, 2], groups: { clsn1: { enabled: true, cap: 2 }, clsn2: { enabled: true, cap: 3 } }, locks: { frames: [2], boxes: [{ elementIndex: 1, groupKey: 'clsn2', slot: 1 }] } }));
const targetOne = locked.targets.find(item => item.elementIndex === 1), targetTwo = locked.targets.find(item => item.elementIndex === 2);
const lockedBox = targetOne.groups.clsn2.proposals.find(item => item.target.slot === 1); assert(lockedBox.locked); assert.deepStrictEqual(lockedBox.rect, [-3, -11, 3, 1], 'an exact box lock preserves current target geometry');
assert(targetTwo.frameLocked && targetTwo.groups.clsn1.proposals.every(item => item.locked) && targetTwo.groups.clsn2.proposals.every(item => item.locked), 'a locked frame passes its existing effective geometry through unchanged');
assert.strictEqual(targetTwo.groups.clsn1.status, 'locked-frame'); assert.strictEqual(targetTwo.groups.clsn2.status, 'locked-frame'); assert.strictEqual(locked.status, 'ready', 'locked geometry at or under each independent cap stays ready');
assert.strictEqual(locked.reference.groups.clsn1.slots.length, 2, 'reference provenance remains separate from target locks');

const lockedOverCap = createAirCollisionAssistanceProposals(input({ targetElementIndices: [2], groups: { clsn1: { enabled: true, cap: 1 }, clsn2: { enabled: true, cap: 2 } }, locks: { frames: [2], boxes: [] } }));
assert.strictEqual(lockedOverCap.status, 'partial'); assert.strictEqual(lockedOverCap.totals.conflicts, 2); assert.strictEqual(lockedOverCap.totals.omittedByCap, 0, 'locked boxes are preserved rather than reported as cap omissions');
for (const key of ['clsn1', 'clsn2']) { const group = lockedOverCap.targets[0].groups[key]; assert.strictEqual(group.status, 'partial'); assert.deepStrictEqual(group.conflicts.map(item => item.kind), ['locked-over-cap']); assert(group.proposals.length > group.cap && group.proposals.every(item => item.locked), `${key} preserves all locked over-cap geometry`); }

const missingLock = createAirCollisionAssistanceProposals(input({ targetElementIndices: [1], locks: { frames: [], boxes: [{ elementIndex: 1, groupKey: 'clsn1', slot: 9 }] } }));
assert.strictEqual(missingLock.status, 'partial'); assert.deepStrictEqual(missingLock.targets[0].groups.clsn1.conflicts.map(item => item.kind), ['missing-locked-box']);

const stableOddLabels = text.replace('Clsn1[0]=-10,-20,0,0', 'Clsn1[99]=-10,-20,0,0').replace('Clsn1[1]=1,2,3,4', 'Clsn1[7]=1,2,3,4');
const stableResult = createAirCollisionAssistanceProposals(input({ text: stableOddLabels, sourceFingerprint: sha(stableOddLabels) }));
assert.strictEqual(stableResult.allocationProfile, 'stable-source-order'); assert.deepStrictEqual(stableResult.reference.groups.clsn1.slots.map(item => item.slot), [0, 1], 'Stable proposals never claim authored labels are indexed identities');

const nightly = createAirCollisionAssistanceProposals(input({ target: { channel: 'nightly', buildId: 'verified' }, allocationDecision: { capability: { id: 'collision.air-index-allocation' }, capabilityId: 'collision.air-index-allocation', enabled: true, status: 'supported', capabilityFingerprint: capability } }));
assert.strictEqual(nightly.allocationProfile, 'indexed-label');
const emptyTargetText = '[Begin Action 100]\nClsn1: 1\nClsn1[0]=1,2,3,4\n100,0,0,0,1\n100,1,0,0,1\n';
const emptyTarget = createAirCollisionAssistanceProposals(input({ text: emptyTargetText, sourceFingerprint: sha(emptyTargetText), targetElementIndices: [1], groups: { clsn1: { enabled: true, cap: 1 }, clsn2: { enabled: false, cap: 0 } } }));
assert.strictEqual(emptyTarget.status, 'ready'); assert.deepStrictEqual(emptyTarget.targets[0].groups.clsn1.proposals[0].rect, [1, 2, 3, 4], 'an explicitly selected empty target can receive a read-only reference proposal without guessed ownership');
for (const bad of [
  input({ sourceFingerprint: 'A'.repeat(64) }),
  input({ capabilityFingerprint: 'D'.repeat(64) }),
  input({ target: { channel: 'nightly' }, allocationDecision: { enabled: false, status: 'unknown', capabilityFingerprint: capability } }),
  input({ targetElementIndices: [1], locks: { frames: [2], boxes: [] } })
]) assert.throws(() => createAirCollisionAssistanceProposals(bad), /source fingerprint|capability evidence|allocation is unresolved|outside the explicit target/i);

assert.throws(() => createAirCollisionAssistanceProposals(input({ targetElementIndices: Array.from({ length: MAX_SELECTED_FRAMES + 1 }, (_, index) => index) })), /select between/);
assert.throws(() => createAirCollisionAssistanceProposals(input({ groups: { clsn1: { enabled: true, cap: MAX_BOX_CAP + 1 }, clsn2: { enabled: true, cap: 1 } } })), /cap/);
let getterRuns = 0; const hostile = {}; Object.defineProperty(hostile, 'text', { enumerable: true, get() { getterRuns += 1; return text; } }); assert.throws(() => createAirCollisionAssistanceProposals(hostile), /exact plain request/); assert.strictEqual(getterRuns, 0);
let proxyRuns = 0; const proxy = new Proxy({}, { ownKeys() { proxyRuns += 1; throw new Error('trap'); } }); assert.throws(() => createAirCollisionAssistanceProposals(proxy), /exact plain request/); assert.strictEqual(proxyRuns, 0);
const caller = input(), before = JSON.stringify(caller); createAirCollisionAssistanceProposals(caller); assert.strictEqual(JSON.stringify(caller), before, 'proposal construction never mutates caller input');

console.log('AIR collision assistance proposals are deterministic, bounded, locked/capped independently, source-pinned, and read-only');
