'use strict';

const assert = require('assert');
const { createAirCollisionInspection } = require('../src/air_collision_inspection_model');
const { MAX_INPUT_BYTES, createAirCollisionPropertyDraft } = require('../src/air_collision_property_draft_model');

const fingerprint = 'A'.repeat(64);
const text = '[Begin Action 200]\nClsn1: 2\nClsn1[0] = -4,-5,6,7\nClsn1[1] = 8,9,10,11\nClsn2: 1\nClsn2[0] = -8,-9,12,13\n0,0,0,0,1\n';
const indexedDecision = { capabilityId: 'collision.indexed-controls', enabled: true, status: 'supported', capabilityFingerprint: fingerprint };
const dummyDecision = { capabilityId: 'collision.dummy-group', enabled: true, status: 'supported', capabilityFingerprint: fingerprint };
const allocationDecision = { capabilityId: 'collision.air-index-allocation', enabled: true, status: 'supported', capabilityFingerprint: fingerprint };
const inspection = createAirCollisionInspection({ text, action: 200, elementIndex: 0, target: { channel: 'nightly', buildId: 'verified' }, allocationDecision, capabilityFingerprint: fingerprint });
const base = { inspection, capabilityFingerprint: fingerprint, target: { channel: 'nightly', buildId: 'verified' }, indexedDecision, dummyDecision, group: 'Clsn1', index: 1 };

const eligibility = createAirCollisionPropertyDraft({ ...base, draft: { family: 'eligibility', kind: 'NotHitBy', attr: 'SCA, AP', time: 3, playerno: '2', playerid: 'enemyId', slot: 7, stack: true } });
assert.strictEqual(eligibility.status, 'ready');
assert.strictEqual(eligibility.selection.group, 'Clsn1');
assert.strictEqual(eligibility.selection.index, 1);
assert.strictEqual(eligibility.selection.allocation, 'indexed-label');
assert.strictEqual(eligibility.recipe.selectedIndexUsed, true);
assert.match(eligibility.recipe.preview.code, /^notHitBy\{attr: SCA, AP; time: 3; clsn\.group: Clsn1; clsn\.index: 1;/);
assert.match(eligibility.recipe.preview.code, /slot: 7; stack: 1\}$/);
assert.match(eligibility.recipe.preview.notes[0], /ReversalDef.*bypasses/i);
assert.strictEqual(eligibility.recipe.preview.label, 'Unbound draft — no owning StateDef/source selected');
assert(Object.isFrozen(eligibility) && Object.isFrozen(eligibility.recipe.fields) && Object.isFrozen(eligibility.recipe.preview.notes));
assert.strictEqual(createAirCollisionPropertyDraft({ ...base, draft: { family: 'eligibility', kind: 'NotHitBy', attr: 'SCA, AP', time: 3, playerno: '2', playerid: 'enemyId', slot: 7, stack: true } }).draftHash, eligibility.draftHash);

for (const kind of ['HitDef', 'Projectile', 'ReversalDef']) {
  const item = createAirCollisionPropertyDraft({ ...base, draft: { family: 'contact', kind, attr: 'S, NA', reversalAttr: 'SCA, AA', p2clsncheck: kind === 'ReversalDef' ? 'Clsn1' : 'Clsn2', p2clsnrequire: 'Dummy' } });
  assert.strictEqual(item.recipe.available, true);
  assert.strictEqual(item.recipe.groupWide, true);
  assert.strictEqual(item.recipe.selectedIndexUsed, false);
  assert.match(item.recipe.preview.code, kind === 'ReversalDef' ? /reversal\.attr: SCA, AA/ : /attr: S, NA/);
  assert.match(item.recipe.preview.code, /p2clsnrequire: Dummy/);
}
for (const kind of ['ModifyHitDef', 'ModifyProjectile', 'ModifyReversalDef']) {
  const item = createAirCollisionPropertyDraft({ ...base, draft: { family: 'contact', kind, p2clsncheck: 'All', p2clsnrequire: 'None' } });
  assert.strictEqual(item.recipe.available, true);
  assert(!/\battr\s*:|reversal\.attr/.test(item.recipe.preview.code), `${kind} must not invent a creation-only attr`);
  assert(!/p2clsnrequire/.test(item.recipe.preview.code), 'None means omit p2clsnrequire');
}

const overlap = createAirCollisionPropertyDraft({ ...base, draft: { family: 'queries', kind: 'ClsnOverlap', target: 'Size', player: 'playerId(2)' } });
assert.strictEqual(overlap.recipe.preview.code, 'clsnOverlap(Clsn1, playerId(2), Size)');
assert.strictEqual(overlap.recipe.selectedIndexUsed, false);
assert.match(overlap.recipe.preview.notes[0], /index is .*context only/i);
const dummyOverlap = createAirCollisionPropertyDraft({ ...base, draft: { family: 'queries', kind: 'ClsnOverlap', ownerGroup: 'Dummy', target: 'Clsn2', player: 'root, ID' } });
assert.strictEqual(dummyOverlap.status, 'ready'); assert.strictEqual(dummyOverlap.recipe.fields.owner, 'Dummy'); assert.strictEqual(dummyOverlap.recipe.selectedIndexUsed, false); assert.strictEqual(dummyOverlap.recipe.preview.code, 'clsnOverlap(Dummy, root, ID, Clsn2)'); assert.match(dummyOverlap.recipe.preview.notes.join(' '), /runtime logic group.*not authored AIR geometry/i);
const projectileOverlap = createAirCollisionPropertyDraft({ ...base, draft: { family: 'queries', kind: 'ProjClsnOverlap', projectileListIndex: 44, target: 'Clsn2', player: 'p2, ID' } });
assert.strictEqual(projectileOverlap.recipe.preview.code, 'projClsnOverlap(44, p2, ID, Clsn2)');
assert.match(projectileOverlap.recipe.preview.notes[0], /independent of the selected AIR collision index/i);

const stableInspection = createAirCollisionInspection({ text, action: 200, elementIndex: 0, target: { channel: 'stable', version: '1.0' }, capabilityFingerprint: fingerprint, allocationDecision: { capabilityId: 'collision.air-index-allocation', enabled: false, status: 'unsupported', capabilityFingerprint: fingerprint } });
const stableBase = { inspection: stableInspection, capabilityFingerprint: fingerprint, target: { channel: 'stable', version: '1.0' }, indexedDecision: { capabilityId: 'collision.indexed-controls', enabled: false, status: 'unsupported', capabilityFingerprint: fingerprint }, dummyDecision: { capabilityId: 'collision.dummy-group', enabled: false, status: 'unsupported', capabilityFingerprint: fingerprint }, group: 'Clsn2', index: 0 };
const stableEligibility = createAirCollisionPropertyDraft({ ...stableBase, draft: { family: 'eligibility', kind: 'HitBy' } });
assert.strictEqual(stableEligibility.status, 'unresolved');assert.strictEqual(stableEligibility.familyAvailability.eligibility, false);assert.strictEqual(stableEligibility.recipe.preview.available, false);
assert.strictEqual(createAirCollisionPropertyDraft({ ...stableBase, draft: { family: 'contact', kind: 'HitDef', attr: 'S, NA' } }).status, 'ready');
const stableDummyOverlap = createAirCollisionPropertyDraft({ ...stableBase, draft: { family: 'queries', kind: 'ClsnOverlap', ownerGroup: 'Dummy', target: 'Clsn2' } });
assert.strictEqual(stableDummyOverlap.status, 'unresolved'); assert.strictEqual(stableDummyOverlap.recipe.fields.owner, 'Dummy'); assert.match(stableDummyOverlap.recipe.reason, /same-fingerprint supporting Nightly/i); assert.strictEqual(stableDummyOverlap.recipe.preview.available, false);
assert.throws(() => createAirCollisionPropertyDraft({ ...stableBase, draft: { family: 'contact', kind: 'HitDef', attr: 'S, NA', p2clsncheck: 'All' } }), /p2clsncheck must be one of/);
assert.throws(() => createAirCollisionPropertyDraft({ ...stableBase, draft: { family: 'contact', kind: 'HitDef', attr: 'S, NA', p2clsnrequire: 'Dummy' } }), /p2clsnrequire must be one of/);
assert.throws(() => createAirCollisionPropertyDraft({ ...base, draft: { family: 'contact', kind: 'HitDef', attr: 'S, NA', p2clsncheck: 'None' } }), /p2clsncheck must be one of/);

const unresolved = createAirCollisionPropertyDraft({ ...base, indexedDecision: { ...indexedDecision, capabilityFingerprint: 'B'.repeat(64) }, draft: { family: 'contact', kind: 'HitDef', attr: 'S, NA' } });
assert.strictEqual(unresolved.status, 'unresolved');assert.strictEqual(unresolved.recipe.preview.available, false);
assert.strictEqual(createAirCollisionPropertyDraft({ ...base, capabilityFingerprint: 'B'.repeat(64), draft: { family: 'queries', kind: 'ClsnOverlap' } }).status, 'unresolved');
assert.strictEqual(createAirCollisionPropertyDraft({ ...base, index: 99, draft: { family: 'contact', kind: 'ModifyHitDef' } }).status, 'unresolved');
assert.strictEqual(createAirCollisionPropertyDraft({ ...base, target: { channel: 'stable', version: '1.0' }, draft: { family: 'contact', kind: 'HitDef', attr: 'S, NA' } }).status, 'unresolved','a Nightly inspection cannot be relabelled Stable');
assert.strictEqual(createAirCollisionPropertyDraft({ ...stableBase, target: { channel: 'nightly', buildId: 'verified' }, indexedDecision, dummyDecision, draft: { family: 'contact', kind: 'HitDef', attr: 'S, NA', p2clsncheck: 'Dummy' } }).status, 'unresolved','a Stable inspection cannot be relabelled Nightly');

const shallow=Object.freeze(JSON.parse(JSON.stringify(inspection))),before=JSON.stringify(shallow);const shallowResult=createAirCollisionPropertyDraft({ ...base, inspection: shallow, draft: { family: 'contact', kind: 'HitDef', attr: 'S, NA' } });assert.strictEqual(shallowResult.status,'unresolved');assert.strictEqual(JSON.stringify(shallow),before,'rejection does not freeze or mutate nested caller data');shallow.groups.clsn1.provenance.via='changed';assert.strictEqual(createAirCollisionPropertyDraft({ ...base, inspection: shallow, draft: { family: 'contact', kind: 'HitDef', attr: 'S, NA' } }).status,'unresolved','mutable nested authority remains rejected after mutation');
assert.strictEqual(createAirCollisionPropertyDraft({ ...base, inspection: Object.freeze({ ...inspection, inspectionHash: 'ABC' }), draft: { family: 'contact', kind: 'HitDef', attr: 'S, NA' } }).status,'unresolved');
for(const malformed of [Object.freeze({schema:'ikemaker.air-collision-inspection',version:1}),Object.freeze({schema:'ikemaker.air-collision-inspection',version:1,inspectionHash:fingerprint,target:Object.freeze({})}),Object.freeze({...inspection,groups:Object.freeze({clsn1:inspection.groups.clsn1})})])assert.doesNotThrow(()=>{assert.strictEqual(createAirCollisionPropertyDraft({ ...base, inspection: malformed, draft: { family: 'contact', kind: 'HitDef', attr: 'S, NA' } }).status,'unresolved')});
assert.strictEqual(createAirCollisionPropertyDraft({ ...base, capabilityFingerprint: fingerprint.toLowerCase(), draft: { family: 'contact', kind: 'HitDef', attr: 'S, NA' } }).status,'unresolved');

assert.throws(() => createAirCollisionPropertyDraft({ ...base, draft: { family: 'eligibility', kind: 'HitBy', slot: 8 } }), /slot.*0 through 7/i);
assert.throws(() => createAirCollisionPropertyDraft({ ...base, draft: { family: 'eligibility', kind: 'HitBy', stack: 'false' } }), /Stack must be/);
assert.throws(() => createAirCollisionPropertyDraft({ ...base, draft: { family: 'queries', kind: 'ProjClsnOverlap', projectileListIndex: -1 } }), /Projectile list index/);
assert.throws(() => createAirCollisionPropertyDraft({ ...base, draft: { family: 'queries', kind: 'ClsnOverlap', player: 'p2; destroy' } }), /cannot contain/);
assert.throws(() => createAirCollisionPropertyDraft({ ...base, draft: { family: 'eligibility', kind: 'HitBy', attr: 'S, NA\nfoo' } }), /cannot contain/);
assert.throws(() => createAirCollisionPropertyDraft({ ...base, draft: { family: 'eligibility', kind: 'HitBy', attr: 'map(foo)' } }), /conventional literal/);
assert.throws(() => createAirCollisionPropertyDraft({ ...stableBase, draft: { family: 'contact', kind: 'HitDef', attr: 'map(foo)' } }), /conventional literal/);
assert.throws(() => createAirCollisionPropertyDraft({ ...base, draft: { family: 'contact', kind: 'HitDef', attr: 'S, XX' } }), /conventional literal/);
assert.throws(() => createAirCollisionPropertyDraft({ ...base, draft: { family: 'contact', kind: 'ReversalDef', reversalAttr: 'S, SA # truncate' } }), /comment tokens/);
assert.throws(() => createAirCollisionPropertyDraft({ ...base, draft: { family: 'contact', kind: 'HitDef', attr: 'x'.repeat(MAX_INPUT_BYTES + 1) } }), /draft fields exceed/);

console.log('AIR collision property draft model keeps selected-box recipes exact, bounded, frozen, and non-mutating');
