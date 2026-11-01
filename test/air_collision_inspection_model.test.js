'use strict';

const assert = require('assert');
const { allocationProfile, createAirCollisionInspection } = require('../src/air_collision_inspection_model');

const source = `; mixed evidence\r
[Begin Action 10]\nClsn2Default: 2 ; inherited later\nClsn2[1] = 9, 8, 1, 2 ; reversed\nClsn1 = -5, -6, 7, 8\nClsn1: 1\nClsn2[0] = -3, -4, 3, 4\n10, 0, 0, 0, 2\n10, 1, 0, 0, 1\n[Begin Action 20]\nCopy Action 10\n`;

const stable = createAirCollisionInspection({ text: source, action: 10, elementIndex: 0, target: { channel: 'stable', version: '1.0.0' }, allocationDecision: { enabled: false, status: 'unsupported' }, capabilityFingerprint: 'STABLE' });
assert.strictEqual(stable.target.allocation.id, 'stable-source-order');
assert.strictEqual(stable.selection.authoritativeAction, 10);
assert.strictEqual(stable.groups.clsn2.ownership, 'default-declared-for-this-element');
assert.strictEqual(stable.groups.clsn2.authored.block.default, true);
assert.strictEqual(stable.groups.clsn2.authored.block.declared, 2);
assert.strictEqual(stable.groups.clsn2.authored.assignments[0].rawCoordinateText, '9, 8, 1, 2');
assert.deepStrictEqual(stable.groups.clsn2.authored.assignments[0].rawRect, [9, 8, 1, 2]);
assert.deepStrictEqual(stable.groups.clsn2.authored.assignments[0].normalizedRect, [1, 2, 9, 8]);
assert.strictEqual(stable.groups.clsn2.authored.assignments[1].authoredGroupToken, 'Clsn1', 'raw mismatched assignment ownership remains visible');
assert.deepStrictEqual(stable.groups.clsn2.projection.candidates[0].slots.map(slot => slot.authoredLabel), [1, null], 'Stable projection remains source ordered and preserves an absent label');
assert(Object.isFrozen(stable) && Object.isFrozen(stable.groups.clsn2.authored.assignments[0].rawRect), 'the public model is deeply frozen');
assert.strictEqual(createAirCollisionInspection({ text: source, action: 10, elementIndex: 0, target: { channel: 'stable', version: '1.0.0' }, allocationDecision: { enabled: false, status: 'unsupported' }, capabilityFingerprint: 'STABLE' }).inspectionHash, stable.inspectionHash, 'inspection hashing is deterministic');

const indexed = createAirCollisionInspection({ text: source, action: 10, elementIndex: 0, target: { channel: 'nightly', buildId: 'verified' }, allocationDecision: { capability: { id: 'collision.air-index-allocation' }, enabled: true, status: 'supported', capabilityFingerprint: 'INDEXED' }, capabilityFingerprint: 'INDEXED', savedRuntimePlans: [{ action: 10, element: 1, kind: 'overrideclsn', group: 'Clsn2', index: 0, rect: [-2, -3, 4, 5] }, { action: 10, element: 2, kind: 'transformclsn', group: 'Clsn2', index: 0, scale: [1, 1], angle: 0, pivot: [0, 0] }, { action: 10, element: 1, kind: 'width', values: [1, 2] }], recoveryRuntimePlans: [{ action: 10, element: 1, kind: 'transformclsn', group: 'Clsn2', index: -1, scale: [1, 1], angle: 5, pivot: [0, 0] }, { action: 10, element: 1, kind: 'transformclsn', group: 'Clsn2', index: -1, values: [1, 1, 0] }] });
assert.strictEqual(indexed.target.allocation.id, 'indexed-label');
assert.deepStrictEqual(indexed.groups.clsn2.projection.candidates[0].slots.map(slot => [slot.slot, slot.authoredLabel, slot.allocation]), [[0, null, 'absent-index-fallback'], [1, 1, 'authored']]);
assert.deepStrictEqual(indexed.runtimeAdditions.counts, { override: 1, transform: 1, saved: 1, recovery: 1 });
assert.strictEqual(indexed.runtimeAdditions.applied, false);
assert.strictEqual(indexed.runtimeAdditions.total, 2);
assert.deepStrictEqual(indexed.runtimeAdditions.omitted, { saved: 2, recovery: 1, total: 3 }, 'wrong-element, unsupported, and incomplete recovery entries never become plan badges');

const unknown = createAirCollisionInspection({ text: source, action: 10, elementIndex: 1, target: { channel: 'nightly', buildId: 'unknown' }, allocationDecision: { enabled: false, status: 'unknown' }, capabilityFingerprint: 'UNKNOWN' });
assert.strictEqual(unknown.target.allocation.id, 'target-unresolved');
assert.strictEqual(unknown.groups.clsn2.ownership, 'inherited-default');
assert.deepStrictEqual(unknown.groups.clsn2.projection.candidates.map(item => [item.profile, item.authoritative]), [['stable-source-order', false], ['indexed-label', false]], 'unknown targets expose two non-authoritative candidates');

const copied = createAirCollisionInspection({ text: source, action: 20, elementIndex: 0, target: { channel: 'stable', version: '1.0.0' } });
assert.strictEqual(copied.selection.sourceMode, 'copy-action');
assert.strictEqual(copied.selection.readOnly, true);
assert.strictEqual(copied.selection.authoritativeAction, 10);
assert.strictEqual(copied.groups.clsn2.authored.block.line, 3, 'Copy Action points to the authoritative source block rather than fabricating alias authorship');
assert.deepStrictEqual(copied.groups.clsn2.provenance, { via: 'copy-action', authoritativeAction: 10 });

const malformed = createAirCollisionInspection({ text: '[Begin Action 1]\nClsn1: 2\nClsn1[0] = 0,0,2,2\n1,0,0,0,1\n', action: 1, elementIndex: 0, target: { channel: 'nightly' }, allocationDecision: { capability: { id: 'collision.air-index-allocation' }, enabled: true, status: 'supported', capabilityFingerprint: 'MALFORMED' }, capabilityFingerprint: 'MALFORMED' });
assert.strictEqual(malformed.groups.clsn1.projection.status, 'compiler-invalid');
assert.strictEqual(malformed.groups.clsn1.projection.candidates[0].authoritative, false);
assert.deepStrictEqual(malformed.groups.clsn1.projection.candidates[0].slots.map(slot => slot.filled), [true, false], 'allocated-but-unfilled slots remain explanatory without a runtime claim');
const malformedLine = createAirCollisionInspection({ text: '[Begin Action 7]\nClsn1: 2\nClsn1 bogus\n7,0,0,0,1\n', action: 7, elementIndex: 0, target: { channel: 'nightly' }, allocationDecision: { capability: { id: 'collision.air-index-allocation' }, enabled: true, status: 'supported', capabilityFingerprint: 'BAD-LINE' }, capabilityFingerprint: 'BAD-LINE' });
assert.strictEqual(malformedLine.groups.clsn1.authored.block.endLine, 3, 'the evidence extent includes the malformed line without consuming it as a parsed assignment');
assert.deepStrictEqual(malformedLine.groups.clsn1.authored.diagnostics.map(item => [item.kind, item.line]), [['malformed-collision-assignment', 3], ['collision-count-mismatch', 2]]);
assert.deepStrictEqual(malformedLine.groups.clsn1.authored.diagnostics[0].range, { start: { line: 2, character: 0 }, end: { line: 2, character: 11 } });

const zero = createAirCollisionInspection({ text: '[Begin Action 2]\nClsn1: 0\n2,0,0,0,1\n', action: 2, elementIndex: 0, target: { channel: 'stable', version: '1.0.0' } });
assert.strictEqual(zero.groups.clsn1.authored.block.declared, 0);
assert.deepStrictEqual(zero.groups.clsn1.projection.candidates[0].slots, []);

const duplicateText = '[Begin Action 3]\nClsn1: 1\nClsn1[0]=0,0,1,1\n3,0,0,0,1\n[Begin Action 3]\nClsn1: 1\nClsn1[0]=2,2,3,3\n3,1,0,0,1\n';
const duplicate = createAirCollisionInspection({ text: duplicateText, action: 3, actionOccurrence: 1, elementIndex: 0, target: { channel: 'stable', version: '1.0.0' } });
assert.match(duplicate.reason, /defined 2 times/);
assert.strictEqual(duplicate.selection.authoritativeAction, null);
assert.strictEqual(duplicate.groups.clsn1.authored.available, true, 'the selected duplicate occurrence remains visible as raw evidence');
assert.strictEqual(duplicate.groups.clsn1.projection.status, 'unavailable', 'duplicates never receive a parsed-slot authority claim');

const unresolvedCopy = createAirCollisionInspection({ text: '[Begin Action 4]\nCopy Action 999\n', action: 4, elementIndex: 0, target: { channel: 'stable', version: '1.0.0' } });
assert.strictEqual(unresolvedCopy.available, false);
assert.match(unresolvedCopy.reason, /could not be resolved/);
assert.strictEqual(unresolvedCopy.selection.sourceMode, 'unresolved');

const fallthrough = createAirCollisionInspection({ text: '[Begin Action 5]\n; empty\n[Begin Action 6]\nClsn2: 1\nClsn2[0]=1,2,3,4\n6,0,0,0,1\n', action: 5, elementIndex: 0, target: { channel: 'stable', version: '1.0.0' } });
assert.strictEqual(fallthrough.selection.sourceMode, 'fallthrough');
assert.strictEqual(fallthrough.selection.authoritativeAction, 6);
assert.strictEqual(fallthrough.selection.readOnly, true);
assert.deepStrictEqual(fallthrough.groups.clsn2.provenance, { via: 'fallthrough', authoritativeAction: 6 });

assert.deepStrictEqual(allocationProfile({ target: { channel: 'nightly' }, allocationDecision: { enabled: false } }), { id: 'target-unresolved', status: 'unknown', authoritative: false, reason: 'The exact AIR collision allocation profile is unresolved for this target.' });
assert.strictEqual(allocationProfile({ target: { channel: 'stable', version: '1.0.0' }, capabilityFingerprint: 'S', allocationDecision: { capability: { id: 'collision.air-index-allocation' }, enabled: true, status: 'supported', capabilityFingerprint: 'S' } }).id, 'stable-source-order', 'Stable cannot be overridden by contradictory indexed input');
for (const allocationDecision of [
  { enabled: true, status: 'supported', capabilityFingerprint: 'X' },
  { capability: { id: 'collision.indexed-controls' }, enabled: true, status: 'supported', capabilityFingerprint: 'X' },
  { capability: { id: 'collision.air-index-allocation' }, enabled: true, status: 'unverified', capabilityFingerprint: 'X' },
  { capability: { id: 'collision.air-index-allocation' }, enabled: true, status: 'supported', capabilityFingerprint: 'OTHER' }
]) assert.strictEqual(allocationProfile({ target: { channel: 'nightly' }, capabilityFingerprint: 'X', allocationDecision }).id, 'target-unresolved', 'non-canonical or unbound capability input remains unresolved');
assert.strictEqual(allocationProfile({ target: { channel: 'nightly' }, capabilityFingerprint: 'X', allocationDecision: { capability: { id: 'collision.air-index-allocation' }, enabled: true, status: 'changed', capabilityFingerprint: 'X' } }).id, 'indexed-label', 'a canonical enabled decision bound to the exact capability fingerprint is authoritative');
assert.throws(() => createAirCollisionInspection({ text: '[Begin Action 1]\n1,0,0,0,1', action: 1, elementIndex: 0, savedRuntimePlans: Array.from({ length: 4097 }, () => ({})) }), /runtime plan badges exceed/);

console.log('AIR collision inspection model preserves bounded raw evidence and target-specific pre-runtime projections');
