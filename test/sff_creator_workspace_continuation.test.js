'use strict';

const assert = require('assert');
const { DETACHED_KEY, DETACH_CONFIRMATION, createCreatorWorkspaceContinuationHost } = require('../src/sff_creator_workspace_continuation');

const H = value => require('crypto').createHash('sha256').update(value).digest('hex');
const locator = { operationDirectory: 'C:/state/op', expectedOperationId: H('operation'), expectedLatestCheckpointHash: H('head'), expectedVaultRoot: 'C:/state', manifestArtifactName: 'history-review-route-manifest', expectedManifestArtifactByteHash: H('manifest-bytes'), expectedManifestHash: H('manifest'), expectedManifestAuthorityHash: H('manifest-authority') };
const binding = { specificationHash: H('spec'), routeEnvelopeHash: H('route'), targetId: 'sff-v2.1', backendId: 'ikemaker-builtin-sff-v21-png8-prerelease', adapterId: 'builtin-v21-png8' };
const draftRevision = H('draft');

async function main() {
  const legacyRecord = { draftKey: 'legacy', draftRevision, locator, binding }, legacyState = { legacy: JSON.parse(JSON.stringify(legacyRecord)) };
  const legacyHost = createCreatorWorkspaceContinuationHost({ readState: async () => legacyState, writeState: async () => { throw new Error('legacy dismiss must not write'); }, clearDraft: async () => { throw new Error('legacy dismiss must not clear'); }, routeStartup: async () => { throw new Error('legacy dismiss must not route'); }, verifyCompleted: async () => { throw new Error('legacy dismiss must not verify'); } });
  const legacyDismiss = await legacyHost.dismiss({ draftKey: 'legacy' }); assert.strictEqual(legacyDismiss.status, 'presentation-dismissed-continuation-retained', 'the original flat-map workspace state remains readable');
  let state = {}, clears = 0, routes = 0, completedCalls = 0, startup = { status: 'history-review-required', lifecycleState: 'TerminalNeedsHistory', operationId: locator.expectedOperationId, nextCommand: 'review-history-reconciliation' };
  const host = createCreatorWorkspaceContinuationHost({
    readState: async () => state,
    writeState: async value => { state = value; },
    clearDraft: async key => { assert.strictEqual(key, 'root'); clears += 1; },
    routeStartup: async () => { routes += 1; return startup; },
    verifyCompleted: async () => { completedCalls += 1; return { status: 'verified', lifecycleState: 'Completed', operationId: locator.expectedOperationId, ...binding }; }
  });
  await host.retain({ draftKey: 'root', draftRevision, locator, binding });
  const otherLocator = { ...locator, expectedOperationId: H('other-operation') };
  await assert.rejects(() => host.retain({ draftKey: 'root', draftRevision, locator: otherLocator, binding }), /different retained operation/);
  assert.strictEqual(state.root.locator.expectedOperationId, locator.expectedOperationId, 'a second operation cannot replace the exact restart handoff');
  await assert.rejects(() => host.retain({ draftKey: '__proto__', draftRevision, locator, binding }), /draftKey is unsafe/);
  const cancelled = await host.dismiss({ draftKey: 'root' }); assert.strictEqual(cancelled.status, 'presentation-dismissed-continuation-retained'); assert.strictEqual(clears, 0); assert.ok(state.root);
  const drift = await host.resume({ draftKey: 'root', currentDraftRevision: H('changed') }); assert.strictEqual(drift.status, 'draft-drift-review-required'); assert.strictEqual(drift.draftRevision, draftRevision); assert.deepStrictEqual(drift.continuationLocator, locator); assert.deepStrictEqual(drift.binding, binding); assert.notStrictEqual(drift.continuationLocator, state.root.locator); assert.strictEqual(routes, 0); assert.strictEqual(clears, 0); assert.ok(state.root);
  const restart = await host.resume({ draftKey: 'root', currentDraftRevision: draftRevision }); assert.strictEqual(restart.status, 'restart-review-required'); assert.strictEqual(restart.draftRevision, draftRevision); assert.deepStrictEqual(restart.continuationLocator, locator); assert.deepStrictEqual(restart.binding, binding); assert.strictEqual(restart.startup.nextCommand, 'review-history-reconciliation'); assert.strictEqual(clears, 0); assert.strictEqual(completedCalls, 0); assert.ok(state.root);
  startup = { status: 'completed-authoritative', lifecycleState: 'Completed', operationId: locator.expectedOperationId, nextCommand: null };
  const completedPending = await host.resume({ draftKey: 'root', currentDraftRevision: draftRevision }); assert.strictEqual(completedPending.status, 'restart-review-required'); assert.strictEqual(completedPending.draftCleared, false); assert.strictEqual(clears, 0); assert.strictEqual(completedCalls, 0); assert.ok(state.root, 'reopen never auto-clears a Completed draft');
  await assert.rejects(() => host.complete({ draftKey: 'root', currentDraftRevision: draftRevision, runtimeResetDraft: false }), /resetDraft authority/); const completed = await host.complete({ draftKey: 'root', currentDraftRevision: draftRevision, runtimeResetDraft: true }); assert.strictEqual(completed.status, 'completed-draft-cleared'); assert.strictEqual(completed.draftCleared, true); assert.strictEqual(clears, 1); assert.strictEqual(completedCalls, 1); assert.strictEqual(state.root, undefined);

  await host.retain({ draftKey: 'root', draftRevision, locator, binding });
  const rejecting = createCreatorWorkspaceContinuationHost({ readState: async () => state, writeState: async value => { state = value; }, clearDraft: async () => { clears += 1; }, routeStartup: async () => startup, verifyCompleted: async () => ({ status: 'verified', lifecycleState: 'Completed', operationId: locator.expectedOperationId, ...binding, routeEnvelopeHash: H('wrong-route') }) });
  await assert.rejects(() => rejecting.complete({ draftKey: 'root', currentDraftRevision: draftRevision, runtimeResetDraft: true }), /Completed verification did not match/); assert.strictEqual(clears, 1); assert.ok(state.root, 'failed Completed verification retains the continuation and draft');

  const detachInput = { draftKey: 'root', expectedOperationId: locator.expectedOperationId, expectedRetainedDraftRevision: draftRevision, currentDraftRevision: H('changed-after-operation'), detachRequestId: H('detach-request-1'), reason: 'The Creator draft intentionally moved on after review.', confirmation: DETACH_CONFIRMATION };
  const beforeDetach = JSON.parse(JSON.stringify(state.root)), callsBeforeDetach = { clears, routes, completedCalls };
  await assert.rejects(() => host.detach({ ...detachInput, confirmation: 'yes' }), /exact detach confirmation/i);
  await assert.rejects(() => host.detach({ ...detachInput, expectedOperationId: H('stale-operation') }), /identity|revision changed/i);
  assert.deepStrictEqual(state.root, beforeDetach, 'failed detach never changes the retained continuation');
  const detached = await host.detach(detachInput);
  assert.strictEqual(detached.status, 'detached-continuation-recoverable'); assert.strictEqual(detached.draftCleared, false); assert.strictEqual(detached.workspaceStateModified, true); assert.deepStrictEqual(detached.effects, { draftCleared: false, writes: false, processes: false, approvalsGranted: false, backendExecution: false, activeArchiveModified: false, historyModified: false });
  assert.strictEqual(state.root, undefined, 'detach releases only the lifecycle ownership lock');
  assert.deepStrictEqual(state[DETACHED_KEY].operations[locator.expectedOperationId].record, beforeDetach, 'the exact continuation record remains durable and recoverable');
  assert.deepStrictEqual({ clears, routes, completedCalls }, callsBeforeDetach, 'detach does not clear a draft, route an operation, or verify/mutate project assets');
  const inspected = await host.inspectDetached({ operationId: locator.expectedOperationId, detachedRecordHash: detached.detachedRecordHash });
  assert.strictEqual(inspected.status, 'detached-continuation-record'); assert.deepStrictEqual(inspected.detached.record, beforeDetach); assert(Object.isFrozen(inspected));
  await assert.rejects(() => host.inspectDetached({ operationId: locator.expectedOperationId, detachedRecordHash: H('stale-record') }), /absent or stale/i);
  await assert.rejects(() => host.detach(detachInput), /already applied/i, 'the same detach request cannot replay');
  await assert.rejects(() => host.detach({ ...detachInput, detachRequestId: H('detach-request-2') }), /already detached/i, 'a fresh request cannot silently replace the archived operation');
  await assert.rejects(() => host.retain({ draftKey: 'root', draftRevision, locator, binding }), /detached.*silently replayed/i, 'ordinary retain cannot erase the detach audit by replaying the operation');
  await assert.rejects(() => host.retain({ draftKey: DETACHED_KEY, draftRevision, locator: { ...locator, expectedOperationId: H('reserved-key-op') }, binding }), /draftKey is unsafe/i);

  const tamperedState = JSON.parse(JSON.stringify(state)); tamperedState[DETACHED_KEY].operations[locator.expectedOperationId].record.binding.targetId = 'sff-v1';
  const tampered = createCreatorWorkspaceContinuationHost({ readState: async () => tamperedState, writeState: async () => { throw new Error('must not write'); }, clearDraft: async () => { throw new Error('must not clear'); }, routeStartup: async () => { throw new Error('must not route'); }, verifyCompleted: async () => { throw new Error('must not verify'); } });
  await assert.rejects(() => tampered.inspectDetached({ operationId: locator.expectedOperationId, detachedRecordHash: detached.detachedRecordHash }), /record seal drifted/i, 'archived-record tampering fails closed');
  console.log('SFF Creator workspace continuation retains cancel/drift/restart state, durably audits exact detach without draft/project effects, rejects replay/tamper, and clears drafts only after ordinary Completed verification');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
