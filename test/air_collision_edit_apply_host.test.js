'use strict';

const assert = require('assert');
const path = require('path');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {};
  return originalLoad.call(this, request, parent, isMain);
};
const { buildAirCollisionEditPrepare, buildAirCollisionEditReview, applyReviewedAirCollisionEdit, handleAirCollisionEditApplyMessage, revokeAirCollisionEditReview, revokeAirCollisionEditReviewForRequest } = require('../src/air_viewer');
Module._load = originalLoad;

const airPath = path.resolve('C:/character/main.air');
const stableFingerprint = 'A'.repeat(64), nightlyFingerprint = 'B'.repeat(64), fixedToken = 'c'.repeat(48);
const source = `[Begin Action 100]
Clsn1Default: 2 ; shared attack
Clsn1[0] = -10, -20, 10, 20
Clsn1[1] = -5, -8, 5, 8
100,0,0,0,1
100,1,0,0,1
Clsn1: 1
Clsn1[0] = -2, -3, 2, 3
100,2,0,0,1
`;

function stableOptions() {
  return { target: { channel: 'stable', version: '1.0' }, targetBuildId: '1.0', allowIndexed: false, capabilityFingerprint: stableFingerprint, allocationDecision: { capability: { id: 'collision.air-index-allocation' }, capabilityId: 'collision.air-index-allocation', enabled: false, status: 'unsupported', message: 'Stable source-order profile.', capabilityFingerprint: stableFingerprint } };
}
function nightlyOptions() {
  return { target: { channel: 'nightly', version: 'nightly', buildId: 'verified' }, targetBuildId: 'verified', allowIndexed: true, capabilityFingerprint: nightlyFingerprint, allocationDecision: { capability: { id: 'collision.air-index-allocation' }, capabilityId: 'collision.air-index-allocation', enabled: true, status: 'supported', message: 'Pinned indexed-label support.', capabilityFingerprint: nightlyFingerprint } };
}
function harness(options = {}) {
  let text = options.text ?? source, applyCalls = 0, saveCalls = 0, fsCalls = 0, clipboardCalls = 0, commandCalls = 0, navigationCalls = 0;
  const operations = [], posted = [];
  const document = {
    fileName: airPath, uri: { fsPath: airPath }, isClosed: false, isDirty: true, version: 7,
    getText: () => text,
    positionAt: offset => options.badPosition && offset > 0 ? ({ offset: offset - 1 }) : ({ offset }),
    offsetAt: position => position.offset,
    save: async () => { saveCalls += 1; return true; }
  };
  class Range { constructor(start, end) { this.start = start; this.end = end; } }
  class WorkspaceEdit {
    insert(uri, position, replacement) { operations.push({ kind: 'insert', uri, start: position.offset, end: position.offset, replacement }); }
    delete(uri, range) { operations.push({ kind: 'delete', uri, start: range.start.offset, end: range.end.offset, replacement: '' }); }
    replace(uri, range, replacement) { operations.push({ kind: 'replace', uri, start: range.start.offset, end: range.end.offset, replacement }); }
  }
  const workspace = {
    textDocuments: [document], fs: { writeFile: async () => { fsCalls += 1; } },
    openTextDocument: async () => document,
    applyEdit: async () => {
      applyCalls += 1;
      if (options.applyFalse) return false;
      assert.strictEqual(operations.length, 1, 'one reviewed collision Apply must contain exactly one narrow workspace operation');
      const operation = operations[0]; text = text.slice(0, operation.start) + operation.replacement + text.slice(operation.end);
      if (options.postMismatch) text += '; unexpected mismatch\n';
      document.version += 1; document.isDirty = true; return true;
    }
  };
  let runtime = options.nightly ? nightlyOptions() : stableOptions(), savedEntries = [], draftEntries = [];
  const session = { airPath, panel: { active: true, visible: true, webview: { postMessage: async message => { posted.push(message); return true; } } }, collisionEditSourceAvailable: true, collisionEditSessionId: 'air-session-1', collisionEditEpoch: 0, collisionEditApplyAuthority: null, collisionEditReviewRequest: null, collisionEditApplyBusy: false, disposed: false };
  const services = {
    workspace, WorkspaceEdit, Range,
    collisionRuntimeOptions: () => runtime,
    readRuntimePlan: () => ({ entries: savedEntries }),
    collisionRuntimeDraftEntries: () => draftEntries,
    tokenFactory: () => fixedToken,
    window: { showWarningMessage: async () => options.confirm === false ? undefined : 'Apply Reviewed AIR Edit', showTextDocument: async () => { navigationCalls += 1; } },
    commands: { executeCommand: async () => { commandCalls += 1; } },
    env: { clipboard: { writeText: async () => { clipboardCalls += 1; } } }
  };
  return {
    session, services, workspace, document, operations, posted,
    get text() { return text; }, set text(value) { text = value; },
    set runtime(value) { runtime = value; }, set savedEntries(value) { savedEntries = value; }, set draftEntries(value) { draftEntries = value; },
    counts: () => ({ applyCalls, saveCalls, fsCalls, clipboardCalls, commandCalls, navigationCalls })
  };
}
function request(overrides = {}) { return { request: 1, action: 100, actionOccurrence: 0, elementIndex: 0, groupKey: 'clsn1', slot: 0, operation: { kind: 'edit', rect: [-11, -21, 11, 21] }, ...overrides }; }
async function issue(h, value = request()) {
  const result = await buildAirCollisionEditReview(h.session, value, h.services);
  assert.strictEqual(result.available, true, result.reason);
  assert.match(result.review.token, /^[a-f0-9]{48}$/);
  return result;
}
async function apply(h, review) { return applyReviewedAirCollisionEdit(h.session, review.review.token, h.services); }
function noExternalEffects(h, applyCalls = 0) { assert.deepStrictEqual(h.counts(), { applyCalls, saveCalls: 0, fsCalls: 0, clipboardCalls: 0, commandCalls: 0, navigationCalls: 0 }); }

(async () => {
  const unresolved = harness({ text: `[Begin Action 100]
Clsn2Default: 3
Clsn2[0] = -24, -36, 23, 0
Clsn2[1] = -24, -81, 23, -36
Clsn2[2] = -16, -97, 17, -75
0,0,0,11,4
` });
  unresolved.runtime = { target: null, targetBuildId: '', allowIndexed: false, capabilityFingerprint: stableFingerprint, allocationDecision: { enabled: false, status: 'unknown', capabilityFingerprint: stableFingerprint } };
  const sequentialPrepare = await buildAirCollisionEditPrepare(unresolved.session, { request: 1, viewerEditEpoch: 0, action: 100, actionOccurrence: 0, elementIndex: 0, groupKey: 'clsn2', slot: 0, intent: 'select' }, unresolved.services);
  assert.strictEqual(sequentialPrepare.available, true, sequentialPrepare.reason);
  assert.strictEqual(sequentialPrepare.records.length, 3, 'ordinary sequential boxes remain editable before a target is configured');

  const ambiguous = harness({ text: `[Begin Action 100]
Clsn2: 2
Clsn2[0] = -24, -36, 23, 0
Clsn2[2] = -16, -97, 17, -75
0,0,0,11,4
` });
  ambiguous.runtime = { target: null, targetBuildId: '', allowIndexed: false, capabilityFingerprint: stableFingerprint, allocationDecision: { enabled: false, status: 'unknown', capabilityFingerprint: stableFingerprint } };
  const ambiguousPrepare = await buildAirCollisionEditPrepare(ambiguous.session, { request: 1, viewerEditEpoch: 0, action: 100, actionOccurrence: 0, elementIndex: 0, groupKey: 'clsn2', slot: 0, intent: 'select' }, ambiguous.services);
  assert.strictEqual(ambiguousPrepare.available, false, 'ambiguous authored numbering still requires a resolved target');

  for (const [label, value, fragment] of [
    ['default edit', request(), 'Clsn1[0] = -11, -21, 11, 21'],
    ['inherited materialize-all', request({ request: 2, elementIndex: 1, slot: 1, operation: { kind: 'edit', rect: [-6, -9, 6, 9] } }), 'Clsn1: 2\nClsn1[0] = -10, -20, 10, 20\nClsn1[1] = -6, -9, 6, 9'],
    ['frame-specific delete', request({ request: 3, elementIndex: 2, operation: { kind: 'delete' } }), '100,2,0,0,1'],
    ['return to defaults', request({ request: 4, elementIndex: 2, operation: { kind: 'return-to-default' } }), '100,2,0,0,1']
  ]) {
    const h = harness(), review = await issue(h, value), result = await apply(h, review);
    assert.strictEqual(result.status, 'applied', label); assert(h.text.includes(fragment), label); assert.strictEqual(h.operations.length, 1, label); noExternalEffects(h, 1);
  }

  const empty = harness({ text: '[Begin Action 100]\n100,0,0,0,1\n' });
  const added = await issue(empty, request({ operation: { kind: 'add', rect: [2, 1, 4, 3] } }));
  assert.strictEqual((await apply(empty, added)).status, 'applied'); assert(empty.text.includes('Clsn1[0] = 2, 1, 4, 3')); assert.strictEqual(empty.operations[0].kind, 'insert');

  const unfilled = harness({ text: '[Begin Action 100]\nClsn1Default: 2\nClsn1[0]=1,2,3,4\n100,0,0,0,1\n100,1,0,0,1\n' });
  const repaired = await issue(unfilled, request({ elementIndex: 1, slot: 1, operation: { kind: 'edit', rect: [6, 5, 8, 7] } }));
  assert.strictEqual((await apply(unfilled, repaired)).status, 'applied'); assert(unfilled.text.includes('Clsn1[1] = 6, 5, 8, 7'));

  const indexed = harness({ nightly: true, text: '[Begin Action 100]\nClsn1: 1\nClsn1[0]=1,2,3,4\n100,0,0,0,1\n' });
  const indexedReview = await issue(indexed, request({ slot: 1, operation: { kind: 'add', rect: [5, 6, 7, 8] } }));
  assert.strictEqual((await apply(indexed, indexedReview)).status, 'applied'); assert(indexed.text.includes('Clsn1[1] = 5, 6, 7, 8'));

  const unavailableReturn = harness({ text: '[Begin Action 100]\n100,0,0,0,1\n' });
  const returnReview = await buildAirCollisionEditReview(unavailableReturn.session, request({ operation: { kind: 'return-to-default' } }), unavailableReturn.services);
  assert.strictEqual(returnReview.available, false); assert.strictEqual(returnReview.returnToDefaultsAvailable, false);

  const cancelled = harness({ confirm: false }), cancelledReview = await issue(cancelled);
  const cancelledEpoch = cancelled.session.collisionEditEpoch; assert.strictEqual((await apply(cancelled, cancelledReview)).status, 'cancelled'); noExternalEffects(cancelled);
  assert(cancelled.session.collisionEditEpoch > cancelledEpoch && cancelled.session.collisionEditReviewRequest === null, 'modal cancellation retires the consumed review epoch');
  await assert.rejects(() => apply(cancelled, cancelledReview), /invalid, stale, or already consumed/i, 'cancel consumes authority and prevents replay');

  const malformedApply = harness(), malformedReview = await issue(malformedApply), malformedEpoch = malformedApply.session.collisionEditEpoch;
  const hostileRequest = { [Symbol.toPrimitive]() { throw new Error('request correlation must not coerce'); } };
  const malformedEnvelope = { type: 'applyReviewedCollisionEdit', request: hostileRequest, token: malformedReview.review.token, extra: true };
  await assert.doesNotReject(() => handleAirCollisionEditApplyMessage(malformedApply.session, malformedEnvelope, malformedApply.services), 'the real host branch consumes before exact validation without coercing correlation evidence');
  assert.deepStrictEqual(malformedApply.posted.at(-1), { type: 'collisionEditApplied', request: null, status: 'error', message: 'The collision Apply request contains unsupported or stale fields. Review the draft again.' });
  assert(malformedApply.session.collisionEditEpoch > malformedEpoch, 'malformed Apply consumes and retires its review');
  await assert.rejects(() => apply(malformedApply, malformedReview), /invalid, stale, or already consumed/i); noExternalEffects(malformedApply);

  for (const [label, mutate] of [
    ['source text', h => { h.text += '; drift\n'; }],
    ['version', h => { h.document.version += 1; }],
    ['capability', h => { h.runtime = nightlyOptions(); }],
    ['saved runtime plan', h => { h.savedEntries = [{ kind: 'overrideclsn', action: 100, element: 0 }]; }],
    ['recovery runtime plan', h => { h.draftEntries = [{ kind: 'transformclsn', action: 100, element: 0 }]; }],
    ['selection epoch', h => { h.session.collisionEditEpoch += 1; }],
    ['session identity', h => { h.session.collisionEditSessionId = 'different-session'; }],
    ['hidden panel', h => { h.session.panel.visible = false; }],
    ['disposed panel', h => { h.session.disposed = true; }]
  ]) {
    const h = harness(), review = await issue(h); mutate(h);
    await assert.rejects(() => apply(h, review), /changed before confirmation|invalid, stale|hidden, closed, or unavailable/i, label); noExternalEffects(h);
  }

  for (const [label, mutate] of [
    ['text during prompt', h => { h.text += '; modal drift\n'; }],
    ['version during prompt', h => { h.document.version += 1; }],
    ['capability during prompt', h => { h.runtime = nightlyOptions(); }],
    ['runtime plan during prompt', h => { h.savedEntries = [{ kind: 'overrideclsn', action: 100, element: 0 }]; }],
    ['selection during prompt', h => { h.session.collisionEditEpoch += 1; }]
  ]) {
    const h = harness(), review = await issue(h); h.services.window.showWarningMessage = async () => { mutate(h); return 'Apply Reviewed AIR Edit'; };
    await assert.rejects(() => apply(h, review), /changed during confirmation/i, label); noExternalEffects(h);
  }

  const busy = harness(), busyReview = await issue(busy); busy.session.collisionEditApplyBusy = true;
  await assert.rejects(() => apply(busy, busyReview), /already being applied/i); await assert.rejects(() => apply(busy, busyReview), /invalid, stale, or already consumed/i); noExternalEffects(busy);

  for (const hostile of [
    { ...request(), extra: true },
    { ...request(), operation: { kind: 'edit', rect: [1, 2, 3, 4], boxes: [] } },
    { ...request(), actionOccurrence: 1 },
    { ...request(), groupKey: 'size' },
    { ...request(), slot: -1 },
    { ...request(), operation: { kind: 'delete', rect: [1, 2, 3, 4] } }
  ]) await assert.rejects(() => buildAirCollisionEditReview(harness().session, hostile, harness().services), /incomplete or contains unsupported/i);

  const forged = harness(); await issue(forged); await assert.rejects(() => applyReviewedAirCollisionEdit(forged.session, 'd'.repeat(48), forged.services), /invalid, stale, or already consumed/i); noExternalEffects(forged);
  const applyFalse = harness({ applyFalse: true }), falseReview = await issue(applyFalse), falseEpoch = applyFalse.session.collisionEditEpoch; await assert.rejects(() => apply(applyFalse, falseReview), /rejected/); assert.strictEqual(applyFalse.operations.length, 1); assert(applyFalse.session.collisionEditEpoch > falseEpoch); noExternalEffects(applyFalse, 1);
  const mismatch = harness({ postMismatch: true }), mismatchReview = await issue(mismatch), mismatchEpoch = mismatch.session.collisionEditEpoch; await assert.rejects(() => apply(mismatch, mismatchReview), /differs from the reviewed AIR text/); assert(mismatch.session.collisionEditEpoch > mismatchEpoch); noExternalEffects(mismatch, 1);
  const badPosition = harness({ badPosition: true }), badPositionReview = await issue(badPosition); await assert.rejects(() => apply(badPosition, badPositionReview), /no longer maps to exact editor positions/); noExternalEffects(badPosition);

  const terminal = harness(), terminalReview = await issue(terminal); revokeAirCollisionEditReview(terminal.session, { terminal: true });
  await assert.rejects(() => apply(terminal, terminalReview), /invalid, stale, or already consumed/i); assert.strictEqual(terminal.session.collisionEditSourceAvailable, false); noExternalEffects(terminal);

  const guarded = harness(), guardedReview = await issue(guarded), guardedEpoch = guarded.session.collisionEditEpoch;
  assert.strictEqual(revokeAirCollisionEditReviewForRequest(guarded.session, guardedReview.request - 1), false, 'a late failed review cannot revoke the current request');
  assert.strictEqual(guarded.session.collisionEditEpoch, guardedEpoch); assert(guarded.session.collisionEditApplyAuthority);
  assert.strictEqual(revokeAirCollisionEditReviewForRequest(guarded.session, guardedReview.request), true); assert.strictEqual(guarded.session.collisionEditApplyAuthority, null);

  const newerDuringCancel = harness(); let tokenCounter = 0, newerReview;
  newerDuringCancel.services.tokenFactory = () => (++tokenCounter === 1 ? '1' : '2').repeat(48);
  const olderReview = await issue(newerDuringCancel);
  newerDuringCancel.services.window.showWarningMessage = async () => { newerReview = await buildAirCollisionEditReview(newerDuringCancel.session, request({ request: 2, operation: { kind: 'edit', rect: [-12, -22, 12, 22] } }), newerDuringCancel.services); return undefined; };
  assert.strictEqual((await applyReviewedAirCollisionEdit(newerDuringCancel.session, olderReview.review.token, newerDuringCancel.services)).status, 'cancelled');
  assert(newerReview.available && newerDuringCancel.session.collisionEditApplyAuthority?.token === newerReview.review.token, 'an older terminal exit must not revoke a newer review');
  newerDuringCancel.services.window.showWarningMessage = async () => 'Apply Reviewed AIR Edit';
  assert.strictEqual((await applyReviewedAirCollisionEdit(newerDuringCancel.session, newerReview.review.token, newerDuringCancel.services)).status, 'applied');

  let release;
  const race = harness(); race.workspace.textDocuments.length = 0;
  race.workspace.openTextDocument = () => new Promise(resolve => { release = () => resolve(race.document); });
  const first = buildAirCollisionEditReview(race.session, request({ request: 10 }), race.services);
  while (!release) await new Promise(resolve => setImmediate(resolve));
  race.workspace.textDocuments.push(race.document);
  const second = await buildAirCollisionEditReview(race.session, request({ request: 11, operation: { kind: 'edit', rect: [-12, -22, 12, 22] } }), race.services);
  release(); const staleFirst = await first;
  assert.strictEqual(second.available, true); assert.deepStrictEqual(staleFirst, { stale: true, request: 10 }); assert.strictEqual(race.session.collisionEditReviewRequest, 11, 'late review completion cannot replace the newer authority');

  console.log('AIR one-box reviewed Apply owns dirty-document collision geometry, rejects drift/replay, and performs one narrow editor operation with no external side effects');
})().catch(error => { console.error(error); process.exitCode = 1; });
