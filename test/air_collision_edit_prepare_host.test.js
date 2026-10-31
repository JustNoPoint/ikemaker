'use strict';

const assert = require('assert');
const path = require('path');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {};
  return originalLoad.call(this, request, parent, isMain);
};
const { MAX_COLLISION_EDIT_PREPARE_AFFECTED, exactCollisionEditPrepareRequest, exactCollisionEditPrepareEnvelope, buildAirCollisionEditPrepare, handleAirCollisionEditPrepareMessage } = require('../src/air_viewer');
Module._load = originalLoad;

const airPath = path.resolve('C:/character/main.air');
const fingerprint = 'A'.repeat(64);
const source = `[Begin Action 100]
Clsn1Default: 2
Clsn1[0] = -10,-20,10,20
Clsn1[1] = -5,-8,5,8
100,0,0,0,1
100,1,0,0,1
Clsn1: 1
Clsn1[0] = -2,-3,2,3
100,2,0,0,1
`;

function runtime() {
  return { target: { channel: 'stable', version: '1.0' }, targetBuildId: '1.0', capabilityFingerprint: fingerprint, allocationDecision: { capability: { id: 'collision.air-index-allocation' }, capabilityId: 'collision.air-index-allocation', enabled: false, status: 'unsupported', capabilityFingerprint: fingerprint } };
}
function request(overrides = {}) {
  return { request: 1, viewerEditEpoch: 4, action: 100, actionOccurrence: 0, elementIndex: 0, groupKey: 'clsn1', slot: 0, intent: 'begin', ...overrides };
}
function harness(text = source) {
  const document = { fileName: airPath, isClosed: false, isDirty: true, version: 9, getText: () => text };
  const workspace = { textDocuments: [document], openTextDocument: async () => document };
  const session = { airPath, panel: { active: true, visible: true }, collisionEditSourceAvailable: true, collisionEditSessionId: 'prepare-session', collisionEditEpoch: 0, collisionEditPrepareRequest: null, collisionEditReviewRequest: null, collisionEditApplyAuthority: null, disposed: false };
  const services = { workspace, collisionRuntimeOptions: runtime, readRuntimePlan: () => ({ entries: [] }), collisionRuntimeDraftEntries: () => [] };
  return { session, services, document };
}

(async () => {
  const ownerHarness = harness(), owner = await buildAirCollisionEditPrepare(ownerHarness.session, request(), ownerHarness.services);
  assert.strictEqual(owner.available, true);
  assert.strictEqual(owner.ownership.kind, 'default-owner');
  assert.strictEqual(owner.ownership.affected.count, 2);
  assert.deepStrictEqual(owner.records.map(item => item.normalizedRect), [[-10, -20, 10, 20], [-5, -8, 5, 8]]);
  assert.strictEqual(owner.binding.documentVersion, 9);
  for (const key of ['airIdentityFingerprint', 'sessionFingerprint', 'runtimePlansFingerprint']) assert.match(owner.binding[key], /^[A-F0-9]{64}$/, `${key} binds preparation to exact host evidence without exposing raw authority`);
  assert.strictEqual(owner.binding.hostEditEpoch, ownerHarness.session.collisionEditEpoch);
  assert(Object.isFrozen(owner) && Object.isFrozen(owner.records) && Object.isFrozen(owner.binding));
  assert(!JSON.stringify(owner).includes('token'), 'read-only preparation exposes no mutation token');

  const inherited = await buildAirCollisionEditPrepare(harness().session, request({ request: 2, viewerEditEpoch: 5, elementIndex: 1, slot: 1, intent: 'select' }), harness().services);
  assert.strictEqual(inherited.ownership.kind, 'inherited-default');
  assert.strictEqual(inherited.ownership.materializationOnEdit, true);
  assert.strictEqual(inherited.ownership.materializesCount, 2);
  assert.deepStrictEqual(inherited.records.map(item => item.slot), [0, 1]);

  const addHarness = harness(), add = await buildAirCollisionEditPrepare(addHarness.session, request({ request: 3, viewerEditEpoch: 6, elementIndex: 1, slot: 'append-next', intent: 'add' }), addHarness.services);
  assert.strictEqual(add.selection.slot, 2, 'the host derives append-next from authoritative effective records');
  assert.strictEqual(add.records.length, 2, 'an Add seed retains every inherited box before local drawing');

  const localHarness = harness(), local = await buildAirCollisionEditPrepare(localHarness.session, request({ request: 4, viewerEditEpoch: 7, elementIndex: 2, intent: 'return-to-default' }), localHarness.services);
  assert.strictEqual(local.ownership.kind, 'frame-specific');
  assert.strictEqual(local.returnToDefaultsAvailable, true);
  assert.strictEqual(local.ownership.fallbackLine, 2);

  const unfilledText = '[Begin Action 100]\nClsn1Default: 2\nClsn1[0]=1,2,3,4\n100,0,0,0,1\n100,1,0,0,1\n', unfilledHarness = harness(unfilledText);
  const unfilled = await buildAirCollisionEditPrepare(unfilledHarness.session, request({ request: 5, viewerEditEpoch: 8, elementIndex: 1, slot: 1, intent: 'indexed-edit' }), unfilledHarness.services);
  assert.strictEqual(unfilled.records[1].filled, false);
  assert.deepStrictEqual(unfilled.records[1].normalizedRect, [0, 0, 0, 0], 'allocated/unfilled zero geometry remains selectable for repair');

  const emptyHarness = harness('[Begin Action 100]\n100,0,0,0,1\n'), empty = await buildAirCollisionEditPrepare(emptyHarness.session, request({ request: 6, viewerEditEpoch: 9, slot: 'append-next', intent: 'add' }), emptyHarness.services);
  assert.strictEqual(empty.ownership.kind, 'new-frame-block'); assert.strictEqual(empty.selection.slot, 0); assert.deepStrictEqual(empty.records, []);

  const manyFrames = '[Begin Action 100]\nClsn1Default: 1\nClsn1[0]=1,2,3,4\n' + Array.from({ length: MAX_COLLISION_EDIT_PREPARE_AFFECTED + 7 }, (_, index) => `100,${index},0,0,1`).join('\n') + '\n', manyHarness = harness(manyFrames), bounded = await buildAirCollisionEditPrepare(manyHarness.session, request({ request: 7, viewerEditEpoch: 10 }), manyHarness.services);
  assert.strictEqual(bounded.ownership.affected.frames.length, MAX_COLLISION_EDIT_PREPARE_AFFECTED);
  assert.strictEqual(bounded.ownership.affected.omitted, 7);

  for (const bad of [
    { ...request(), extra: true },
    request({ actionOccurrence: 1 }), request({ slot: -1 }), request({ slot: 'append-next', intent: 'begin' }),
    request({ slot: 0, intent: 'add' }), request({ groupKey: 'size' }), request({ viewerEditEpoch: -1 })
  ]) assert.strictEqual(exactCollisionEditPrepareRequest(bad), null);
  let getterRuns = 0; const accessor = request(); Object.defineProperty(accessor, 'request', { enumerable: true, get() { getterRuns += 1; throw new Error('must not run'); } });
  assert.strictEqual(exactCollisionEditPrepareRequest(accessor), null); assert.strictEqual(getterRuns, 0, 'prepare validation rejects accessors without executing them');
  const hostilePrimitive = { [Symbol.toPrimitive]() { throw new Error('must not coerce'); } }, hostileEnvelope = { type: 'prepareCollisionEdit', ...request(), request: hostilePrimitive };
  assert.strictEqual(exactCollisionEditPrepareEnvelope(hostileEnvelope), null, 'hostile request values are rejected without numeric coercion');

  const hostileHarness = harness(), hostilePosts = [];
  await assert.doesNotReject(() => handleAirCollisionEditPrepareMessage(hostileHarness.session, hostileEnvelope, { ...hostileHarness.services, postMessage: async value => hostilePosts.push(value) }));
  assert.deepStrictEqual(hostilePosts, [{ type: 'collisionEditPrepared', request: null, viewerEditEpoch: null, status: 'error', available: false, reason: 'The collision editor preparation request is incomplete or contains unsupported authority fields.' }]);

  let rejectOld; const sameNumberHarness = harness(), sameNumberPosts = [], sameNumberMessage = { type: 'prepareCollisionEdit', ...request({ request: 44, viewerEditEpoch: 20 }) };
  const oldFailure = handleAirCollisionEditPrepareMessage(sameNumberHarness.session, sameNumberMessage, { ...sameNumberHarness.services, buildAirCollisionEditPrepare: () => new Promise((_resolve, reject) => { rejectOld = reject; }), postMessage: async value => sameNumberPosts.push(value) });
  await Promise.resolve();
  sameNumberHarness.session.collisionEditPrepareRequest = 44;
  const newer = await handleAirCollisionEditPrepareMessage(sameNumberHarness.session, sameNumberMessage, { ...sameNumberHarness.services, buildAirCollisionEditPrepare: async () => ({ request: 44, viewerEditEpoch: 20, available: true, status: 'ready' }), postMessage: async value => sameNumberPosts.push(value) });
  const epochBeforeOldFailure = sameNumberHarness.session.collisionEditEpoch;
  rejectOld(new Error('late old failure')); await oldFailure;
  assert.strictEqual(newer, true); assert.strictEqual(sameNumberPosts.length, 1); assert.strictEqual(sameNumberPosts[0].available, true, 'only the newest same-number generation may publish');
  assert.strictEqual(sameNumberHarness.session.collisionEditEpoch, epochBeforeOldFailure, 'an older same-number failure cannot revoke the newer generation');

  const duplicateHarness = harness(source + source), duplicate = await buildAirCollisionEditPrepare(duplicateHarness.session, request({ request: 8, viewerEditEpoch: 11 }), duplicateHarness.services);
  assert.strictEqual(duplicate.available, false); assert.match(duplicate.reason, /duplicate|ambiguous|selection/i);
  const copyText = '[Begin Action 100]\n100,0,0,0,1\n[Begin Action 200]\nCopy Action 100\n', copyHarness = harness(copyText), copy = await buildAirCollisionEditPrepare(copyHarness.session, request({ request: 9, viewerEditEpoch: 12, action: 200 }), copyHarness.services);
  assert.strictEqual(copy.available, false); assert.match(copy.reason, /Copy Action|read-only|selection/i);

  let release;
  const slowDocument = { fileName: airPath, isClosed: false, version: 1, getText: () => source }, slowWorkspace = { textDocuments: [], openTextDocument: () => new Promise(resolve => { release = () => resolve(slowDocument); }) }, raceHarness = harness(); raceHarness.services.workspace = slowWorkspace;
  const old = buildAirCollisionEditPrepare(raceHarness.session, request({ request: 10, viewerEditEpoch: 13 }), raceHarness.services);
  await Promise.resolve(); await Promise.resolve();
  raceHarness.session.collisionEditEpoch += 1; raceHarness.session.collisionEditPrepareRequest = 11;
  release();
  assert.deepStrictEqual(await old, { stale: true, request: 10, viewerEditEpoch: 13 }, 'late preparation cannot publish after host epoch/request invalidation');

  for (const mutate of [session => { session.panel.visible = false; }, session => { session.disposed = true; }, session => { session.collisionEditSourceAvailable = false; }]) {
    const h = harness(); mutate(h.session);
    await assert.rejects(() => buildAirCollisionEditPrepare(h.session, request(), h.services), /hidden, closed, or unavailable/);
  }

  const focusRace = harness(); focusRace.session.panel.active = false;
  const focusRaceResult = await buildAirCollisionEditPrepare(focusRace.session, request(), focusRace.services);
  assert.strictEqual(focusRaceResult.available, true, 'a visible viewer click must not be rejected while VS Code is still updating the panel active flag');
  console.log('AIR collision edit preparation seeds exact dirty-document ownership and bounded effective geometry without mutation authority');
})().catch(error => { console.error(error); process.exitCode = 1; });
