'use strict';

const crypto = require('crypto');
const { types: { isProxy } } = require('util');
const { routeCreatorSffLifecycleOnStartup } = require('./sff_creator_startup_lifecycle_router');
const { verifySavedCreatorCompletedFromVault } = require('./sff_creator_saved_completed_verifier');

const STORE_KEY = 'ikemaker.sffCreator.lifecycleContinuations.v1';
const DETACHED_KEY = '__ikemakerDetachedLifecycleContinuationsV1';
const DETACH_CONFIRMATION = 'I understand: detach this exact lifecycle operation, keep its recovery record, and do not change the Creator draft or project assets.';
const SHA = /^[0-9a-f]{64}$/;
const LOCATOR_KEYS = Object.freeze(['expectedLatestCheckpointHash', 'expectedManifestArtifactByteHash', 'expectedManifestAuthorityHash', 'expectedManifestHash', 'expectedOperationId', 'expectedVaultRoot', 'manifestArtifactName', 'operationDirectory']);
const BINDING_KEYS = Object.freeze(['adapterId', 'backendId', 'routeEnvelopeHash', 'specificationHash', 'targetId']);

function fail(message) { throw new Error(`SFF Creator workspace continuation: ${message}`); }
function plain(value) { return value && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value) && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype; }
function closed(raw, keys, label) { if (!plain(raw) || Object.getOwnPropertySymbols(raw).length) fail(`${label} must be a plain closed object.`); const found = Object.keys(Object.getOwnPropertyDescriptors(raw)).sort(), expected = [...keys].sort(); if (JSON.stringify(found) !== JSON.stringify(expected)) fail(`${label} fields drifted.`); const out = {}; for (const key of keys) { const descriptor = Object.getOwnPropertyDescriptor(raw, key); if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail(`${label}.${key} must be an enumerable data property.`); out[key] = descriptor.value; } return out; }
function text(value, label, maximum = 4096) { if (typeof value !== 'string' || !value || value.length > maximum) fail(`${label} must be bounded nonempty text.`); return value; }
function draftKey(value) { const key = text(value, 'draftKey'); if (['__proto__', 'constructor', 'prototype', DETACHED_KEY].includes(key)) fail('draftKey is unsafe.'); return key; }
function hash(value, label) { if (!SHA.test(String(value || ''))) fail(`${label} must be a lowercase SHA-256 hash.`); return value; }
function clone(value) { return value === null || typeof value !== 'object' ? value : Array.isArray(value) ? value.map(clone) : Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clone(child)])); }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function stable(value) { return Array.isArray(value) ? `[${value.map(stable).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}` : JSON.stringify(value); }
function seal(value) { return crypto.createHash('sha256').update(stable(value)).digest('hex'); }
function locator(raw) { const value = closed(raw, LOCATOR_KEYS, 'lifecycle locator'); for (const key of ['expectedLatestCheckpointHash', 'expectedManifestArtifactByteHash', 'expectedManifestAuthorityHash', 'expectedManifestHash', 'expectedOperationId']) hash(value[key], `locator.${key}`); for (const key of ['expectedVaultRoot', 'manifestArtifactName', 'operationDirectory']) text(value[key], `locator.${key}`); return clone(value); }
function binding(raw) { const value = closed(raw, BINDING_KEYS, 'lifecycle binding'); for (const key of ['routeEnvelopeHash', 'specificationHash']) hash(value[key], `binding.${key}`); for (const key of ['adapterId', 'backendId', 'targetId']) text(value[key], `binding.${key}`, 128); return clone(value); }
function record(raw) { const value = closed(raw, ['binding', 'draftKey', 'draftRevision', 'locator'], 'continuation record'); return freeze({ draftKey: draftKey(value.draftKey), draftRevision: hash(value.draftRevision, 'draftRevision'), locator: locator(value.locator), binding: binding(value.binding) }); }
function detachedRow(raw, operationKey) {
  const value = closed(raw, ['confirmation', 'currentDraftRevision', 'detachRequestId', 'detachedRecordHash', 'operationId', 'reason', 'record', 'status'], 'detached continuation');
  if (value.status !== 'detached-recoverable') fail('detached continuation status drifted.');
  const operationId = hash(value.operationId, 'detached.operationId'); if (operationId !== operationKey) fail('detached continuation operation key drifted.');
  const retained = record(value.record); if (retained.locator.expectedOperationId !== operationId) fail('detached continuation record operation drifted.');
  const detachedRecordHash = hash(value.detachedRecordHash, 'detached.detachedRecordHash'); if (seal(retained) !== detachedRecordHash) fail('detached continuation record seal drifted.');
  if (value.confirmation !== DETACH_CONFIRMATION) fail('detached continuation confirmation drifted.');
  return freeze({ status: value.status, operationId, detachRequestId: hash(value.detachRequestId, 'detached.detachRequestId'), detachedRecordHash, currentDraftRevision: hash(value.currentDraftRevision, 'detached.currentDraftRevision'), reason: text(value.reason, 'detached.reason', 512), confirmation: value.confirmation, record: retained });
}
function detachedArchive(raw) {
  if (raw == null) return {};
  const value = closed(raw, ['operations', 'version'], 'detached continuation archive'); if (value.version !== 1 || !plain(value.operations)) fail('detached continuation archive is malformed.');
  const out = {}; for (const [operationId, row] of Object.entries(value.operations)) out[operationId] = detachedRow(row, operationId); return out;
}
function persisted(active, detached) { return { ...clone(active), [DETACHED_KEY]: { version: 1, operations: clone(detached) } }; }
function b1(value) { return { operationDirectory: value.operationDirectory, expectedOperationId: value.expectedOperationId, expectedLatestCheckpointHash: value.expectedLatestCheckpointHash, expectedVaultRoot: value.expectedVaultRoot }; }
function effects() { return freeze({ draftCleared: false, writes: false, processes: false, approvalsGranted: false, backendExecution: false, activeArchiveModified: false, historyModified: false }); }

function createCreatorWorkspaceContinuationHost(rawDependencies) {
  const deps = closed(rawDependencies, ['clearDraft', 'readState', 'routeStartup', 'verifyCompleted', 'writeState'], 'dependencies');
  for (const key of Object.keys(deps)) if (typeof deps[key] !== 'function') fail(`${key} must be a function.`);
  async function state() { const value = await deps.readState(); if (value == null) return { active: {}, detached: {} }; if (!plain(value)) fail('retained continuation state is malformed.'); const active = {}, detached = detachedArchive(value[DETACHED_KEY]); for (const [key, row] of Object.entries(value)) { if (key === DETACHED_KEY) continue; const checked = record(row); if (checked.draftKey !== key) fail('retained continuation key drifted.'); active[key] = checked; } return { active, detached }; }
  async function retain(raw) { const checked = record(raw), retainedState = await state(), prior = retainedState.active[checked.draftKey]; if (retainedState.detached[checked.locator.expectedOperationId]) fail('this exact operation was detached and cannot be silently replayed as a new continuation.'); if (prior && (prior.locator.expectedOperationId !== checked.locator.expectedOperationId || prior.draftRevision !== checked.draftRevision || JSON.stringify(prior.binding) !== JSON.stringify(checked.binding))) fail('a different retained operation already owns this draft key.'); retainedState.active[checked.draftKey] = checked; await deps.writeState(persisted(retainedState.active, retainedState.detached)); return freeze({ status: 'continuation-retained', draftKey: checked.draftKey, operationId: checked.locator.expectedOperationId, draftCleared: false }); }
  async function dismiss(raw) { const input = closed(raw, ['draftKey'], 'dismiss input'), key = draftKey(input.draftKey), retainedState = await state(); return freeze({ status: retainedState.active[key] ? 'presentation-dismissed-continuation-retained' : 'no-continuation', draftKey: key, draftCleared: false, effects: effects() }); }
  async function detach(raw) {
    const input = closed(raw, ['confirmation', 'currentDraftRevision', 'detachRequestId', 'draftKey', 'expectedOperationId', 'expectedRetainedDraftRevision', 'reason'], 'detach input'), key = draftKey(input.draftKey), operationId = hash(input.expectedOperationId, 'expectedOperationId'), requestId = hash(input.detachRequestId, 'detachRequestId'), retainedRevision = hash(input.expectedRetainedDraftRevision, 'expectedRetainedDraftRevision'), currentRevision = hash(input.currentDraftRevision, 'currentDraftRevision'), reason = text(input.reason, 'reason', 512);
    if (input.confirmation !== DETACH_CONFIRMATION) fail('exact detach confirmation is required.');
    const retainedState = await state(), priorDetached = retainedState.detached[operationId];
    if (priorDetached) fail(priorDetached.detachRequestId === requestId ? 'detach request was already applied.' : 'this operation is already detached and recoverable.');
    for (const row of Object.values(retainedState.detached)) if (row.detachRequestId === requestId) fail('detach request ID was already used for another operation.');
    const retained = retainedState.active[key]; if (!retained) fail('the requested retained continuation does not exist or is stale.');
    if (retained.locator.expectedOperationId !== operationId || retained.draftRevision !== retainedRevision) fail('the retained operation identity or revision changed before detach.');
    const detachedRecordHash = seal(retained), archived = freeze({ status: 'detached-recoverable', operationId, detachRequestId: requestId, detachedRecordHash, currentDraftRevision: currentRevision, reason, confirmation: DETACH_CONFIRMATION, record: retained });
    retainedState.detached[operationId] = archived; delete retainedState.active[key]; await deps.writeState(persisted(retainedState.active, retainedState.detached));
    return freeze({ status: 'detached-continuation-recoverable', draftKey: key, operationId, detachRequestId: requestId, detachedRecordHash, draftCleared: false, workspaceStateModified: true, effects: effects() });
  }
  async function inspectDetached(raw) { const input = closed(raw, ['detachedRecordHash', 'operationId'], 'inspect detached input'), operationId = hash(input.operationId, 'operationId'), expected = hash(input.detachedRecordHash, 'detachedRecordHash'), retainedState = await state(), found = retainedState.detached[operationId]; if (!found || found.detachedRecordHash !== expected) fail('the detached operation identity is absent or stale.'); return freeze({ status: 'detached-continuation-record', operationId, detached: clone(found), draftCleared: false, effects: effects() }); }
  async function resume(raw) {
    const input = closed(raw, ['currentDraftRevision', 'draftKey'], 'resume input'), key = draftKey(input.draftKey), revision = hash(input.currentDraftRevision, 'currentDraftRevision'), retainedState = await state(), retained = retainedState.active[key];
    if (!retained) return freeze({ status: 'no-continuation', draftKey: key, draftCleared: false, effects: effects() });
    if (revision !== retained.draftRevision) return freeze({ status: 'draft-drift-review-required', draftKey: key, draftRevision: retained.draftRevision, operationId: retained.locator.expectedOperationId, continuationLocator: clone(retained.locator), binding: clone(retained.binding), startup: null, draftCleared: false, effects: effects() });
    const startup = await deps.routeStartup({ lifecycleVaultLocator: clone(retained.locator), classificationAppendReplayAuthority: null });
    if (!plain(startup) || startup.operationId !== retained.locator.expectedOperationId || startup.lifecycleState === 'Completed' && startup.status !== 'completed-authoritative' && startup.status !== 'completed-cleanup-required' && startup.status !== 'completed-cleanup-recorded') fail('startup continuation result does not match the retained operation.');
    return freeze({ status: 'restart-review-required', draftKey: key, draftRevision: retained.draftRevision, operationId: retained.locator.expectedOperationId, continuationLocator: clone(retained.locator), binding: clone(retained.binding), startup: clone(startup), draftCleared: false, effects: effects() });
  }
  async function complete(raw) {
    const input = closed(raw, ['currentDraftRevision', 'draftKey', 'runtimeResetDraft'], 'complete input'), key = draftKey(input.draftKey), revision = hash(input.currentDraftRevision, 'currentDraftRevision'), retainedState = await state(), retained = retainedState.active[key];
    if (input.runtimeResetDraft !== true) fail('runtime resetDraft authority is required.');
    if (!retained) fail('the completed continuation is absent or stale.');
    if (revision !== retained.draftRevision) fail('the Creator draft changed before Completed finalization.');
    const startup = await deps.routeStartup({ lifecycleVaultLocator: clone(retained.locator), classificationAppendReplayAuthority: null });
    if (!plain(startup) || startup.operationId !== retained.locator.expectedOperationId || startup.lifecycleState !== 'Completed' || !['completed-authoritative', 'completed-cleanup-recorded'].includes(startup.status)) fail('startup continuation is not independently verified and durably cleaned Completed authority.');
    const completed = await deps.verifyCompleted(b1(retained.locator)), expected = retained.binding;
    if (!plain(completed) || completed.status !== 'verified' || completed.lifecycleState !== 'Completed' || completed.operationId !== retained.locator.expectedOperationId || completed.specificationHash !== expected.specificationHash || completed.routeEnvelopeHash !== expected.routeEnvelopeHash || completed.targetId !== expected.targetId || completed.backendId !== expected.backendId || completed.adapterId !== expected.adapterId) fail('ordinary Completed verification did not match the retained Creator operation.');
    await deps.clearDraft(key, freeze(clone(completed))); delete retainedState.active[key]; await deps.writeState(persisted(retainedState.active, retainedState.detached));
    return freeze({ status: 'completed-draft-cleared', draftKey: key, operationId: completed.operationId, startup: clone(startup), completed: clone(completed), draftCleared: true, effects: freeze({ ...effects(), draftCleared: true, writes: true }) });
  }
  return freeze({ complete, detach, dismiss, inspectDetached, resume, retain });
}

function createProductionCreatorWorkspaceContinuationHost(context, clearDraft, routeStartup = routeCreatorSffLifecycleOnStartup) {
  if (!context?.workspaceState || typeof context.workspaceState.get !== 'function' || typeof context.workspaceState.update !== 'function' || typeof clearDraft !== 'function') fail('production context and clearDraft callback are required.');
  if (typeof routeStartup !== 'function') fail('production startup route must be a function.');
  return createCreatorWorkspaceContinuationHost({ readState: () => context.workspaceState.get(STORE_KEY, {}), writeState: value => context.workspaceState.update(STORE_KEY, value), routeStartup, verifyCompleted: verifySavedCreatorCompletedFromVault, clearDraft });
}

module.exports = { STORE_KEY, DETACHED_KEY, DETACH_CONFIRMATION, createCreatorWorkspaceContinuationHost, createProductionCreatorWorkspaceContinuationHost };
