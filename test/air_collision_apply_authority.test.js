'use strict';

const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const { deepFreeze, semanticHash } = require('../src/air_collision_destination_plan');
const { parseStateSource } = require('../src/state_transfer_model');
const { parseCollisionReferences } = require('../src/collision_reference_authority');
const { PINNED_SOURCE_COMMIT, createAirRuntimeCollisionControllerReplacementPlan } = require('../src/air_runtime_collision_controller_edit_plan');
const {
  readyCollisionPatch,
  readyInsertion,
  issueAirCollisionApplyAuthority,
  consumeAirCollisionApplyAuthority,
  sameAirCollisionApplyReview
} = require('../src/air_collision_apply_authority');

const HASH = 'A'.repeat(64), TOKEN = 'b'.repeat(48);
const sha = value => crypto.createHash('sha256').update(value, 'utf8').digest('hex').toUpperCase();
function readyPlan() {
  const semantic = {
    schema: 'ikemaker.air-collision-destination-plan', version: 1, status: 'ready',
    operation: { kind: 'new-controller', fields: ['attr'], noop: false, proposedTextHash: 'B'.repeat(64) },
    insertion: { start: 12, end: 12, text: '\nhitBy{attr: SCA, AP;}\n' },
    preview: { diff: '+hitBy{attr: SCA, AP;}' },
    hashes: { before: HASH, after: 'B'.repeat(64) },
    effects: { filesystem: false, editor: false, clipboard: false, command: false, route: false, mutationAuthority: false }
  };
  return deepFreeze({ ...semantic, planHash: semanticHash(semantic) });
}
function input() {
  return {
    plan: readyPlan(), inventoryHash: HASH, airSourceFingerprint: HASH,
    projection: deepFreeze({ status: 'ready', selection: { inspectionHash: HASH }, draftHash: HASH }),
    snapshot: deepFreeze({ inventoryComplete: true }),
    destination: deepFreeze({ sourcePath: '/char/main.zss', sourceHash: HASH, sourceVersion: null }),
    request: deepFreeze({ reviewKind: 'insert', action: 200, elementIndex: 0, groupKey: 'clsn1', index: 0, destinationId: 'd0', draft: { family: 'eligibility', kind: 'HitBy' } }),
    binding: deepFreeze({ airPath: '/char/main.air', collisionEpoch: 2, propertyEpoch: 3, destinationEpoch: 4, generation: 5, inspectionHash: HASH, draftHash: HASH, capabilityFingerprint: HASH }),
    sourceWasOpen: false
  };
}

function existingPlan(action = 'replace') {
  const fieldAuthority = { key: 'time', start: 30, end: 31, expression: '1', expressionHash: sha('1') };
  const semantic = {
    schema: 'ikemaker.air-collision-existing-property-edit-plan', version: 1, status: 'ready',
    operation: { kind: action === 'replace' ? 'replace-existing-field' : 'remove-existing-field', controller: 'HitBy', field: 'time', fields: ['time'], noop: false, proposedTextHash: 'D'.repeat(64), sourceField: fieldAuthority },
    insertion: { start: action === 'replace' ? 30 : 24, end: 31, text: action === 'replace' ? '4' : '', replacedByteLength: action === 'replace' ? 1 : 7, insertedByteLength: action === 'replace' ? 1 : 0, anchorHash: 'E'.repeat(64) },
    fieldAuthority,
    preview: { diff: action === 'replace' ? '-1\n+4' : '-time: 1;' },
    hashes: { source: HASH, before: HASH, after: 'D'.repeat(64) }, conflicts: [], limitations: [], draftHash: HASH,
    destination: { sourcePath: '/char/main.zss', sourceHash: HASH },
    effects: { filesystem: false, editor: false, clipboard: false, command: false, route: false, mutationAuthority: false }
  };
  return deepFreeze({ ...semantic, planHash: semanticHash(semantic) });
}
function rehashed(plan, mutate) { const copy = JSON.parse(JSON.stringify(plan)); delete copy.planHash; mutate(copy); return deepFreeze({ ...copy, planHash: semanticHash(copy) }); }
function runtimePlan() {
  const text = '[StateDef 200]\nOverrideClsn { group: Clsn1; index: 0; rect: 0,0,1,1; }\n', filename = path.resolve('C:/chars/Hero/runtime.zss'), record = parseCollisionReferences(text, 'zss')[0], declaration = parseStateSource(text, filename, 'zss').declarations[0], sourceHash = sha(text), capability = deepFreeze({ target: 'nightly', decision: 'supported', fingerprint: HASH, indexed: true, dummy: true }), snapshot = deepFreeze({ inventoryComplete: true, clean: false, assignedSources: [filename], sources: [{ available: true, dirty: true, filename, syntax: 'zss', text, sourceHash, version: 7 }] }), destination = deepFreeze({ sourcePath: filename, sourceHash, sourceVersion: 7, stateNumber: 200, stateLine: declaration.line, stateCharacter: declaration.character, stateExpression: declaration.expression, controller: { kind: record.label, start: record.controllerStart, end: record.controllerEnd, controllerHash: sha(text.slice(record.controllerStart, record.controllerEnd)) } });
  return createAirRuntimeCollisionControllerReplacementPlan({ sourceCommit: PINNED_SOURCE_COMMIT, capability, snapshot, destination, draft: deepFreeze({ kind: 'OverrideClsn', group: 2, index: 0, rect: [-2, -3, 4, 5] }) });
}

const issued = issueAirCollisionApplyAuthority(input(), () => TOKEN);
assert(issued && issued.authority && issued.public, 'a ready exact insertion issues one authority');
assert.deepStrictEqual(issued.public, { token: TOKEN, label: 'Apply reviewed diff…' });
assert(Object.isFrozen(issued.authority) && Object.isFrozen(issued.authority.plan));
const record = { destinationApplyAuthority: issued.authority };
assert.strictEqual(consumeAirCollisionApplyAuthority(record, 'not-a-token'), null, 'a hostile token fails closed');
assert.strictEqual(record.destinationApplyAuthority, null, 'even a hostile attempt clears the current authority');
record.destinationApplyAuthority = issued.authority;
assert.strictEqual(consumeAirCollisionApplyAuthority(record, TOKEN), issued.authority, 'the exact token consumes once');
assert.strictEqual(consumeAirCollisionApplyAuthority(record, TOKEN), null, 'replay is rejected');

const reviewInput = input(), review = { _authorityInput: { ...reviewInput } };
assert.strictEqual(sameAirCollisionApplyReview(issued.authority, review, reviewInput.binding), true, 'the full rebuilt review matches');
assert.strictEqual(sameAirCollisionApplyReview(issued.authority, { _authorityInput: { ...reviewInput, inventoryHash: 'C'.repeat(64) } }, reviewInput.binding), false);
assert.strictEqual(sameAirCollisionApplyReview(issued.authority, review, { ...reviewInput.binding, destinationEpoch: 99 }), false);

for (const status of ['no-op', 'conflict', 'unresolved']) {
  const bad = input(), semantic = { ...bad.plan, status }; delete semantic.planHash; bad.plan = deepFreeze({ ...semantic, planHash: semanticHash(semantic) });
  assert.strictEqual(issueAirCollisionApplyAuthority(bad, () => TOKEN), null, `${status} cannot issue Apply authority`);
}
const tampered = input(); tampered.plan = deepFreeze({ ...tampered.plan, insertion: { ...tampered.plan.insertion, text: 'evil' } });
assert.strictEqual(readyInsertion(tampered.plan), false, 'a plan with a stale semantic hash is rejected');
assert.throws(() => issueAirCollisionApplyAuthority(input(), () => 'A'.repeat(48)), /48-hex/, 'uppercase/noncanonical tokens fail closed');
assert.throws(() => issueAirCollisionApplyAuthority(input(), () => 123), /48-hex/, 'token factories cannot coerce non-string values');

for (const action of ['replace', 'remove']) {
  const existing = input(); existing.plan = existingPlan(action); existing.request = deepFreeze({ ...existing.request, reviewKind: 'existing-field', occurrenceId: HASH, fieldKey: 'time', editAction: action });
  const granted = issueAirCollisionApplyAuthority(existing, () => TOKEN);
  assert(granted, `${action} issues through the same one-use authority`);
  assert.strictEqual(granted.authority.reviewKind, 'existing-field');
  assert.strictEqual(readyCollisionPatch(existing.plan), true);
  assert.strictEqual(readyInsertion(existing.plan), false);
  assert.strictEqual(sameAirCollisionApplyReview(granted.authority, { _authorityInput: existing }, existing.binding), true);
  const crossKind = { _authorityInput: { ...existing, request: deepFreeze({ ...existing.request, reviewKind: 'insert' }) } };
  assert.strictEqual(sameAirCollisionApplyReview(granted.authority, crossKind, existing.binding), false, 'cross-kind replay is rejected');
}

const runtime = input(); runtime.plan = runtimePlan(); runtime.destination = runtime.plan.destination; runtime.snapshot = deepFreeze({ inventoryComplete: true, clean: false }); runtime.request = deepFreeze({ reviewKind: 'runtime-controller-replace', candidateId: HASH, action: 200, elementIndex: 0, groupKey: 'clsn1', index: 0, draft: runtime.plan.after }); runtime.binding = deepFreeze({ ...runtime.binding, transformEpoch: 4, runtimeControllerEpoch: 5, primaryView: 'collisions', collisionMode: 'transform', action: 200, elementIndex: 0, groupKey: 'clsn1', index: 0 }); runtime.sourceWasOpen = true; runtime.sourceWasDirty = true;
const runtimeGranted = issueAirCollisionApplyAuthority(runtime, () => TOKEN); assert(runtimeGranted, 'an exact existing runtime-controller replacement issues through the sole Apply authority'); assert.strictEqual(runtimeGranted.authority.reviewKind, 'runtime-controller-replace'); assert.strictEqual(runtimeGranted.authority.sourceWasDirty, true); assert.strictEqual(readyCollisionPatch(runtime.plan), true); assert.strictEqual(readyInsertion(runtime.plan), false); assert.strictEqual(sameAirCollisionApplyReview(runtimeGranted.authority, { _authorityInput: runtime }, runtime.binding), true); assert.strictEqual(sameAirCollisionApplyReview(runtimeGranted.authority, { _authorityInput: { ...runtime, sourceWasDirty: false } }, runtime.binding), false, 'dirty-open authority is exact');
for (const [label, plan] of [
  ['controller hash', rehashed(runtime.plan, value => { value.controllerAuthority.controllerHash = 'F'.repeat(64); })],
  ['body span', rehashed(runtime.plan, value => { value.controllerAuthority.bodyStart += 1; })],
  ['replacement anchor', rehashed(runtime.plan, value => { value.replacement.anchorHash = 'invalid'; })],
  ['body after hash', rehashed(runtime.plan, value => { value.hashes.bodyAfter = 'F'.repeat(64); })],
  ['source hash', rehashed(runtime.plan, value => { value.hashes.source = 'F'.repeat(64); })]
]) assert.strictEqual(readyCollisionPatch(plan), false, `a correctly rehashed runtime ${label} mismatch is rejected`);

const exactReplacement = existingPlan('replace'), exactRemoval = existingPlan('remove');
for (const [label, plan] of [
  ['field key', rehashed(exactReplacement, value => { value.operation.field = 'attr'; })],
  ['fields array', rehashed(exactReplacement, value => { value.operation.fields = ['time', 'attr']; })],
  ['source field', rehashed(exactReplacement, value => { value.operation.sourceField.expression = '2'; })],
  ['replacement span', rehashed(exactReplacement, value => { value.insertion.start -= 1; value.insertion.replacedByteLength += 1; })],
  ['removal containment', rehashed(exactRemoval, value => { value.insertion.start = value.fieldAuthority.end; value.insertion.end = value.fieldAuthority.end + 1; value.insertion.replacedByteLength = 1; })],
  ['source/before hash', rehashed(exactReplacement, value => { value.hashes.source = 'F'.repeat(64); })],
  ['destination/source hash', rehashed(exactReplacement, value => { value.destination.sourceHash = 'F'.repeat(64); })],
  ['after/proposed hash', rehashed(exactReplacement, value => { value.hashes.after = 'F'.repeat(64); })],
  ['expression hash', rehashed(exactReplacement, value => { value.fieldAuthority.expressionHash = 'F'.repeat(64); value.operation.sourceField.expressionHash = 'F'.repeat(64); })]
]) assert.strictEqual(readyCollisionPatch(plan), false, `a correctly rehashed ${label} mismatch is rejected`);

record.destinationApplyAuthority = issued.authority;
assert.strictEqual(consumeAirCollisionApplyAuthority(record, Symbol('hostile')), null, 'symbol tokens fail without coercion');
assert.strictEqual(record.destinationApplyAuthority, null, 'a non-primitive attempt still consumes the live authority');

console.log('AIR collision Apply authority is exact, one-use, and replay-safe');
