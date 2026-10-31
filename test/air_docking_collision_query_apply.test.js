'use strict';

const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {};
  if (request === './air_viewer' && /air_docking_workspace\.js$/.test(parent?.filename || '')) return { parseAir: () => [], inferCharacterFiles: () => ({}), collisionRuntimeOptions: () => ({}), collisionRuntimeDraftEntries: () => [] };
  return originalLoad.call(this, request, parent, isMain);
};
const { buildCollisionQueryConditionReview, queueCollisionQueryConditionReview, exactCollisionQueryApplyEnvelope, applyCollisionQueryConditionReview } = require('../src/air_docking_workspace');
Module._load = originalLoad;

const sha = value => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').toUpperCase();
const airPath = path.resolve('/char/main.air'), statePath = path.resolve('/char/main.zss'), defPath = path.resolve('/char/char.def');
const fingerprint = 'A'.repeat(64), token = 'b'.repeat(48), sessionId = 'c'.repeat(48);
const airText = '[Begin Action 200]\nClsn1: 1\nClsn1[0] = -4,-5,6,7\nClsn2: 1\nClsn2[0] = -8,-9,12,13\n0,0,0,0,1\n';
const originalStateText = '[StateDef 200]\nif time > 0 { changeState{value: 0} }\n';
const draft = Object.freeze({ family: 'queries', kind: 'ClsnOverlap', ownerGroup: 'Clsn1', target: 'Clsn2', player: 'p2, ID', projectileListIndex: 0 });
const runtimeOptions = () => ({ target: { channel: 'nightly', buildId: 'verified' }, targetBuildId: 'verified', capabilityFingerprint: fingerprint, allowIndexed: true, dummyReferenceDecision: true, allocationDecision: { capabilityId: 'collision.air-index-allocation', enabled: true, status: 'supported', capabilityFingerprint: fingerprint } });

function fixture(options = {}) {
  let stateText = originalStateText, airSourceText = airText, capabilityFingerprint = fingerprint;
  const closed = options.closed === true, airDocument = { fileName: airPath, isClosed: false, isDirty: true, version: 9, getText: () => airSourceText };
  const stateDocument = { fileName: statePath, isClosed: false, isDirty: !closed, version: closed ? 1 : 7, getText: () => stateText };
  const workspace = { textDocuments: closed ? [airDocument] : [airDocument, stateDocument], openTextDocument: async filename => { if (path.normalize(filename) !== path.normalize(statePath)) return airDocument; if (!workspace.textDocuments.includes(stateDocument)) workspace.textDocuments.push(stateDocument); return stateDocument; } };
  const evidence = record => record.referenceContext.defPath !== defPath ? { error: 'DEF assignment changed.' } : Object.freeze({
    sources: Object.freeze([Object.freeze({ filename: statePath, text: stateText, sourceHash: sha(stateText), syntax: 'zss', available: true, open: !closed, dirty: !closed, version: closed ? null : stateDocument.version })]),
    assignedSources: Object.freeze([statePath]), inventoryHash: sha(`inventory:${stateText}:${stateDocument.version}`), capabilityFingerprint,
    defAuthority: Object.freeze({ path: defPath, hash: sha('def'), version: null, dirty: false, open: false })
  });
  const record = { panel: { active: true }, airSourceAvailable: true, data: { airPath, ownerDef: defPath }, referenceContext: { defPath, generation: 4 }, browserState: { primaryView: 'collisions', collisionMode: 'properties', propertyState: { family: 'queries' } }, collisionGeneration: 0, collisionEpoch: 2, propertyEpoch: 3, queryConditionEpoch: 0, destinationEpoch: 0, queryConditionQueue: Promise.resolve(), destinationApplyAuthority: null, destinationApplyBusy: false, queryApplySessionId: sessionId, collisionAuthorities: new Map(), consumedCollisionRoutes: new Set() };
  const services = { workspace, collisionRuntimeOptions: () => ({ ...runtimeOptions(), capabilityFingerprint }), readRuntimePlan: () => ({ entries: [] }), collisionRuntimeDraftEntries: () => [], collisionQueryConditionEvidence: async recordValue => evidence(recordValue), applyToken: () => token };
  return { record, services, workspace, airDocument, stateDocument, stateText: () => stateText, setStateText(value) { stateText = value; }, setAirText(value) { airSourceText = value; airDocument.version += 1; }, setCapability(value) { capabilityFingerprint = value; } };
}
const reviewRequest = (phase, extra = {}) => Object.freeze({ type: 'reviewCollisionQueryCondition', request: 19, phase, action: 200, elementIndex: 0, groupKey: 'clsn1', index: 0, draft, ...extra });

async function issueReady(f) {
  const states = await buildCollisionQueryConditionReview(f.record, reviewRequest('states'), f.services), stateId = states.states[0].id;
  const anchors = await buildCollisionQueryConditionReview(f.record, reviewRequest('anchors', { stateId }), f.services), anchorId = anchors.anchors[0].id;
  const published = [];
  await queueCollisionQueryConditionReview(f.record, reviewRequest('plan', { stateId, anchorId, review: true }), value => published.push(value), f.services);
  assert.strictEqual(published.length, 1);
  const response = published[0];
  assert.deepStrictEqual(response.applyAuthority, { token, applyRequest: 1, label: 'Apply reviewed AND condition…' });
  assert(!JSON.stringify(response).includes(statePath), 'public response does not expose source paths');
  return { response, envelope: { type: 'applyCollisionQueryCondition', request: response.applyAuthority.applyRequest, token, action: 200, propertyDraftHash: response.propertyDraftHash, stateId, anchorId, inventoryBindingHash: response.inventoryBindingHash, planHash: response.plan.planHash } };
}

(async () => {
  const f = fixture(), { envelope } = await issueReady(f);
  assert.strictEqual(exactCollisionQueryApplyEnvelope(envelope).valid, true);
  for (const malformed of [{ ...envelope, extra: true }, { ...envelope, token: 'B'.repeat(48) }, { ...envelope, request: -1 }]) assert.strictEqual(exactCollisionQueryApplyEnvelope(malformed).valid, false);
  let traps = 0; const proxy = new Proxy({}, { ownKeys() { traps += 1; return []; }, get() { traps += 1; }, getPrototypeOf() { traps += 1; return Object.prototype; } }); assert.strictEqual(exactCollisionQueryApplyEnvelope(proxy).valid, false); assert.strictEqual(traps, 0);
  let getterHits = 0; const accessor = { ...envelope }; Object.defineProperty(accessor, 'token', { enumerable: true, get() { getterHits += 1; return token; } }); assert.strictEqual(exactCollisionQueryApplyEnvelope(accessor).valid, false); assert.strictEqual(getterHits, 0);

  let writes = 0, operation = null;
  const result = await applyCollisionQueryConditionReview(f.record, envelope, { ...f.services, window: { showWarningMessage: async () => 'Apply Reviewed AND Condition' }, applyReviewedWorkspacePatch: async (document, next) => { writes += 1; operation = next; assert.strictEqual(document, f.stateDocument); const before = f.stateText(); f.setStateText(before.slice(0, next.start) + next.replacement + before.slice(next.end)); f.stateDocument.version += 1; } });
  assert.strictEqual(result.status, 'applied'); assert.strictEqual(writes, 1); assert.strictEqual(operation.policy, 'replace'); assert.strictEqual(operation.sourceWasDirty, true); assert.match(f.stateText(), /clsnOverlap\(Clsn1, p2, ID, Clsn2\)/); assert.strictEqual(f.record.destinationApplyAuthority, null);
  await assert.rejects(() => applyCollisionQueryConditionReview(f.record, envelope, f.services), /invalid, stale, or already consumed/i, 'one-use authority cannot replay');

  const cancelled = fixture(), cancelledReady = await issueReady(cancelled), beforeCancel = cancelled.stateText();
  const cancelledResult = await applyCollisionQueryConditionReview(cancelled.record, cancelledReady.envelope, { ...cancelled.services, window: { showWarningMessage: async () => undefined }, applyReviewedWorkspacePatch: async () => { throw new Error('must not write'); } });
  assert.strictEqual(cancelledResult.status, 'cancelled'); assert.strictEqual(cancelled.stateText(), beforeCancel);

  const malformed = fixture(), malformedReady = await issueReady(malformed);
  await assert.rejects(() => applyCollisionQueryConditionReview(malformed.record, { ...malformedReady.envelope, extra: true }, malformed.services), /malformed/i);
  await assert.rejects(() => applyCollisionQueryConditionReview(malformed.record, malformedReady.envelope, malformed.services), /already consumed/i, 'malformed presentation consumes the singleton token before validation');

  const drift = fixture(), driftReady = await issueReady(drift); drift.record.browserState.propertyState.family = 'contact';
  await assert.rejects(() => applyCollisionQueryConditionReview(drift.record, driftReady.envelope, { ...drift.services, window: { showWarningMessage: async () => 'Apply Reviewed AND Condition' } }), /changed before confirmation/i);

  const busy = fixture(), busyReady = await issueReady(busy); busy.record.destinationApplyBusy = true;
  await assert.rejects(() => applyCollisionQueryConditionReview(busy.record, busyReady.envelope, busy.services), /already being processed/i);

  const closed = fixture({ closed: true }), closedReady = await issueReady(closed); let closedWrites = 0;
  const closedResult = await applyCollisionQueryConditionReview(closed.record, closedReady.envelope, { ...closed.services, window: { showWarningMessage: async () => 'Apply Reviewed AND Condition' }, applyReviewedWorkspacePatch: async (_document, next) => { closedWrites += 1; assert.strictEqual(next.sourceWasOpen, false); assert.strictEqual(next.sourceWasDirty, false); assert.strictEqual(next.documentVersion, null); } });
  assert.strictEqual(closedResult.status, 'applied'); assert.strictEqual(closedWrites, 1); assert(closed.workspace.textDocuments.includes(closed.stateDocument), 'a clean closed source opens only after confirmation');

  for (const [field, value] of [['request', 999], ['action', 201], ['propertyDraftHash', '0'.repeat(64)], ['stateId', '0'.repeat(64)], ['anchorId', '0'.repeat(64)], ['inventoryBindingHash', '0'.repeat(64)], ['planHash', '0'.repeat(64)]]) {
    const wrong = fixture(), ready = await issueReady(wrong); await assert.rejects(() => applyCollisionQueryConditionReview(wrong.record, { ...ready.envelope, [field]: value }, wrong.services), /malformed|no longer matches/i, `wrong ${field} fails closed`); assert.strictEqual(wrong.record.destinationApplyAuthority, null);
  }
  const wrongToken = fixture(), wrongTokenReady = await issueReady(wrongToken); await assert.rejects(() => applyCollisionQueryConditionReview(wrongToken.record, { ...wrongTokenReady.envelope, token: 'd'.repeat(48) }, wrongToken.services), /invalid, stale, or already consumed/i); assert.strictEqual(wrongToken.record.destinationApplyAuthority, null);

  for (const [label, mutate] of [
    ['source', value => { value.setStateText(originalStateText + '# pre-drift\n'); value.stateDocument.version += 1; }],
    ['selection', value => { value.record.browserState.action = 201; }],
    ['AIR', value => value.setAirText(airText + '; drift\n')],
    ['DEF assignment', value => { value.record.referenceContext.defPath = path.resolve('/char/other.def'); }],
    ['capability', value => value.setCapability('0'.repeat(64))],
    ['delete/rename lifecycle', value => { value.record.airSourceAvailable = false; }]
  ]) { const changed = fixture(), ready = await issueReady(changed); mutate(changed); await assert.rejects(() => applyCollisionQueryConditionReview(changed.record, ready.envelope, { ...changed.services, window: { showWarningMessage: async () => 'Apply Reviewed AND Condition' } }), error => error instanceof Error && error.message.length > 0, `${label} drift before modal fails closed`); }

  for (const [label, mutate] of [
    ['source', value => { value.setStateText(originalStateText + '# drift\n'); value.stateDocument.version += 1; }],
    ['AIR', value => value.setAirText(airText + '; modal drift\n')],
    ['DEF assignment', value => { value.record.referenceContext.defPath = path.resolve('/char/other.def'); }],
    ['capability', value => value.setCapability('0'.repeat(64))],
    ['selection', value => { value.record.browserState.action = 201; }]
  ]) { const changed = fixture(), ready = await issueReady(changed); await assert.rejects(() => applyCollisionQueryConditionReview(changed.record, ready.envelope, { ...changed.services, window: { showWarningMessage: async () => { mutate(changed); return 'Apply Reviewed AND Condition'; } } }), error => error instanceof Error && error.message.length > 0, `${label} drift during modal fails closed`); }

  const newer = fixture({ closed: true }), newerReady = await issueReady(newer), newerAuthority = { token: 'e'.repeat(48) }; const originalOpen = newer.workspace.openTextDocument;
  newer.workspace.openTextDocument = async filename => { const document = await originalOpen(filename); newer.record.destinationApplyAuthority = newerAuthority; return document; };
  await assert.rejects(() => applyCollisionQueryConditionReview(newer.record, newerReady.envelope, { ...newer.services, workspace: newer.workspace, window: { showWarningMessage: async () => 'Apply Reviewed AND Condition' } }), /newer reviewed/i); assert.strictEqual(newer.record.destinationApplyAuthority, newerAuthority, 'delayed closed-source open preserves a newer authority');

  const openedDuringModal = fixture({ closed: true }), openedReady = await issueReady(openedDuringModal); await assert.rejects(() => applyCollisionQueryConditionReview(openedDuringModal.record, openedReady.envelope, { ...openedDuringModal.services, window: { showWarningMessage: async () => { openedDuringModal.workspace.textDocuments.push(openedDuringModal.stateDocument); return 'Apply Reviewed AND Condition'; } } }), /open\/dirty\/version state changed during confirmation/i);

  for (const target of ['stable', 'unknown']) {
    const gated = fixture(); gated.services.collisionRuntimeOptions = target === 'stable' ? () => ({ target: { channel: 'stable', version: '1.0' }, targetBuildId: 'stable', capabilityFingerprint: fingerprint, allowIndexed: false, dummyReferenceDecision: false, allocationDecision: { capabilityId: 'collision.air-index-allocation', enabled: false, status: 'unsupported', capabilityFingerprint: fingerprint } }) : () => ({ target: null, targetBuildId: '', capabilityFingerprint: fingerprint, allowIndexed: false, dummyReferenceDecision: null, allocationDecision: { capabilityId: 'collision.air-index-allocation', enabled: false, status: 'unknown', capabilityFingerprint: fingerprint } });
    const states = await buildCollisionQueryConditionReview(gated.record, reviewRequest('states'), gated.services); if (!states.states.length) { assert.strictEqual(gated.record.destinationApplyAuthority, null); continue; }
    const stateId = states.states[0].id, anchors = await buildCollisionQueryConditionReview(gated.record, reviewRequest('anchors', { stateId }), gated.services), published = []; if (!anchors.anchors.length) { assert.strictEqual(gated.record.destinationApplyAuthority, null); continue; }
    await queueCollisionQueryConditionReview(gated.record, reviewRequest('plan', { stateId, anchorId: anchors.anchors[0].id, review: true }), value => published.push(value), gated.services); assert.strictEqual(published[0]?.applyAuthority || null, null, `${target} target never receives Apply authority`);
  }

  for (const [code, expected] of [['reviewed-workspace-patch:apply-rejected', /rejected/i], ['reviewed-workspace-patch:postcondition', /differs/i], ['reviewed-workspace-patch:offset-mismatch', /exact editor range/i]]) {
    const failed = fixture(), ready = await issueReady(failed); await assert.rejects(() => applyCollisionQueryConditionReview(failed.record, ready.envelope, { ...failed.services, window: { showWarningMessage: async () => 'Apply Reviewed AND Condition' }, applyReviewedWorkspacePatch: async () => { const error = new Error(code); error.code = code; throw error; } }), expected);
  }

  console.log('AIR query-condition Apply is compact, exact, one-use, drift-safe, and routed through one reviewed editor patch');
})().catch(error => { console.error(error); process.exitCode = 1; });
