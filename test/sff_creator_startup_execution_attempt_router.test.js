'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const { hashCanonical } = require('../src/sff_capability_report');
const { appendCreatorOperationCheckpoint, readCreatorOperationVaultCheckpointSnapshot } = require('../src/sff_creator_operation_vault');
const { inspectCreatorStructuralExecutingPhaseRoot } = require('../src/sff_creator_structural_phase_root_inspector');
const { verifyRetainedCreatorExecutingIntentFromVault } = require('../src/sff_creator_retained_executing_intent_verifier');
const { createCreatorStartupExecutionAttemptRouterForTest, routeCreatorExecutionAttemptOnStartup } = require('../src/sff_creator_startup_execution_attempt_router');
const { createCreatorCommandGatePlan } = require('../src/sff_creator_command_gate');
const { createCreatorExecutionDispatchAuthority } = require('../src/sff_creator_execution_dispatch_authority');
const { executeCreatorAdoption } = require('../src/sff_creator_transactional_executor');
const { createCreatorExecutionOutcomeVerifierForTest } = require('../src/sff_creator_execution_outcome_verifier');
const { createCreatorExecutionResultCaptureForTest, createCreatorAttemptBoundExecutionResultCaptureForTest } = require('../src/sff_creator_execution_result_capture');
const { createRealExecutingIntentFixture } = require('./helpers/sff_creator_executing_intent_fixture');

const h = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const json = value => Buffer.from(`${JSON.stringify(value)}\n`);
const ROW_NAMES = ['active', 'backup', 'replacementTemp', 'rollbackHold', 'failedInstallHold', 'rollbackTemp', 'backupPartial', 'lease', 'candidate'];
function row(name, authority, formatStatus, exists = false) { return { name, path: `/sealed/${name}`, status: exists ? 'observed' : 'missing', exists, identity: exists ? { device: '1', inode: name } : null, byteHash: exists ? h(`${name}-bytes`) : null, byteLength: exists ? 10 : null, error: null, authority, formatStatus, targetIds: name === 'candidate' ? ['sff-v2.1'] : [], reportHash: name === 'candidate' ? h('strict') : null }; }
function plan(kind = 'pristine') {
  const rows = [row('active', 'old-active', 'old-active-recognized', true), ...ROW_NAMES.slice(1, -1).map(name => row(name, 'missing', 'not-observed')), row('candidate', 'candidate', 'candidate-validated', true)];
  if (kind === 'foreign') Object.assign(rows[2], { status: 'observed', exists: true, authority: 'foreign', formatStatus: 'not-validated', byteHash: h('foreign'), byteLength: 12, identity: { device: '1', inode: 'foreign' } });
  const currentStateSeal = { activeDirectory: { path: '/sealed', realpath: '/sealed', identity: { device: '1', inode: '1' }, device: '1', fingerprint: 'stable' }, candidateDirectory: { path: '/candidate', realpath: '/candidate', identity: { device: '1', inode: '2' }, device: '1', fingerprint: 'stable' }, journalFailure: null, lastJournalState: kind === 'terminal' ? 'committed' : null, lastJournalHash: kind === 'terminal' ? h('journal') : null, journalChainHash: kind === 'terminal' ? h('chain') : hashCanonical([]), rows, recoveryArtifactRows: [] };
  const blockers = ['foreign', 'blocker'].includes(kind) ? ['foreign-artifact:replacementTemp'] : [], allowedActions = kind === 'pristine' ? ['no-action-not-started'] : kind === 'manual' || blockers.length ? ['manual-recovery-only'] : kind === 'terminal' ? ['no-action-terminal'] : ['abort-and-clean-pre-replacement'];
  const value = { schema: 'ikemaker.sff-creator-restart-recovery-plan', version: 1, operationId: h('operation'), classification: kind === 'pristine' ? 'not-started' : kind === 'terminal' ? 'committed' : kind === 'manual' ? 'manual_recovery_required' : 'candidate_staged', allowedActions, allowedActionStateMapping: Object.fromEntries(allowedActions.map(action => [action, action.replaceAll('-', '_')])), blockers, risks: kind === 'stale' ? ['same-operation-stale-lease-unknown-liveness'] : ['external-path-race-not-excluded'], currentStateSeal, currentStateHash: hashCanonical(currentStateSeal), writesAllowed: false, executionAuthorityGranted: false, currentStateGuaranteed: false };
  if (kind === 'pristine') value.allowedActionStateMapping = { 'no-action-not-started': 'no_action_not_started' };
  value.planHash = hashCanonical(value); return value;
}
function b1(locator) { return { operationDirectory: locator.operationDirectory, expectedOperationId: locator.expectedOperationId, expectedLatestCheckpointHash: locator.expectedLatestCheckpointHash, expectedVaultRoot: locator.expectedVaultRoot }; }
function routerFor(real, createPlan, overrides = {}) {
  return createCreatorStartupExecutionAttemptRouterForTest({ inspectStructural: overrides.inspectStructural || inspectCreatorStructuralExecutingPhaseRoot, verifyPhase: overrides.verifyPhase || (() => { throw new Error('unexpected result verifier'); }), verifyRetained: overrides.verifyRetained || verifyRetainedCreatorExecutingIntentFromVault, readSnapshot: overrides.readSnapshot || readCreatorOperationVaultCheckpointSnapshot, createPlan });
}

for (const target of ['sff-v1', 'sff-v2.0', 'sff-v2.1']) {
  const real = createRealExecutingIntentFixture(target, `startup-${target.replace('.', '-')}`), before = fs.readdirSync(real.root, { recursive: true }).map(String).sort(); let calls = 0, captured;
  try {
    const router = routerFor(real, input => { calls++; captured = input; return plan('pristine'); }), result = router({ executingPhaseVaultLocator: real.locator });
    assert.strictEqual(result.status, 'retry-may-be-offered'); assert.strictEqual(result.retryOfferAllowed, true); assert.strictEqual(calls, 2); assert.strictEqual(Object.keys(captured).length, 29); assert.strictEqual(captured.recoveryResumeAuthority, null); assert(Buffer.isBuffer(captured.executionLayoutApprovalReceiptArtifactBytes)); assert.strictEqual(captured.expectedOperationId, captured.expectedExecutionLayoutApprovalReceiptHash); assert.strictEqual(captured.expectedCandidateTargetId, target); assert(Object.isFrozen(result)); assert(Object.values(result.effects).every(value => value === false)); assert(!JSON.stringify(result).includes('ArtifactBytes'));
    if (target === 'sff-v2.1') { const production = routeCreatorExecutionAttemptOnStartup({ executingPhaseVaultLocator: real.locator }); assert.strictEqual(production.status, 'manual-recovery-required'); assert.strictEqual(production.restartRecoveryPlan.blockers.length > 0, true); }
    assert.deepStrictEqual(fs.readdirSync(real.root, { recursive: true }).map(String).sort(), before);
  } finally { fs.rmSync(real.root, { recursive: true, force: true }); }
}

// ResultCaptured is routed to semantic saved-result continuation and never to a retry plan.
for (const variant of ['result-captured-base-v1', 'result-captured-attempt-bound-v2']) {
  const common = { operationId: h(`result-${variant}`), workspaceId: h(`workspace-${variant}`), targetId: 'sff-v2.1', backendId: 'builtin-js', adapterId: 'builtin-v2.1', activePath: '/active.sff', candidatePath: '/candidate.sff', historyRoot: '/history', vaultRootSealHash: h('vault-seal'), workspaceRootSealHash: h('workspace-seal'), activeParentSealHash: h('active-seal'), candidateParentSealHash: h('candidate-seal'), historyRootSealHash: h('history-seal'), semanticHeadRecordHash: h(`head-${variant}`), selectedManifestArtifactName: 'executing-result-captured-route-manifest', selectedManifestArtifactByteHash: h('result-bytes'), selectedManifestHash: h('result-manifest'), selectedManifestAuthorityHash: h('result-authority'), snapshotAuthorityHash: h('snapshot') }, structural = { ...common, phase: 'ResultCaptured', manifestVariant: variant, lifecycleState: 'Executing' }, verified = { ...common, phase: 'ResultCaptured', lifecycleState: 'Executing', status: 'verified' };
  let plans = 0; const router = createCreatorStartupExecutionAttemptRouterForTest({ inspectStructural: () => structural, verifyPhase: () => verified, verifyRetained: () => { throw new Error('must not run'); }, readSnapshot: () => { throw new Error('must not run'); }, createPlan: () => { plans++; } }), locator = { operationDirectory: 'C:\\vault\\op', expectedOperationId: h('op'), expectedLatestCheckpointHash: h('head'), expectedVaultRoot: 'C:\\vault', manifestArtifactName: 'executing-result-captured-route-manifest', expectedManifestArtifactByteHash: h('bytes'), expectedManifestAuthorityHash: h('auth'), expectedManifestHash: h('manifest') };
  const result = router({ executingPhaseVaultLocator: locator }); assert.strictEqual(result.status, 'result-captured-continuation'); assert.strictEqual(result.resultContinuationRequired, true); assert.strictEqual(plans, 0); assert.strictEqual(result.retryOfferAllowed, false);
  assert.throws(() => createCreatorStartupExecutionAttemptRouterForTest({ inspectStructural: () => structural, verifyPhase: () => ({ ...verified, snapshotAuthorityHash: h('substituted-same-head') }), verifyRetained: () => {}, readSnapshot: () => {}, createPlan: () => {} })({ executingPhaseVaultLocator: locator }), /snapshot authority/);
}

// Classification table and stable/unstable observation failures use a lightweight retained seam.
{
  const real = createRealExecutingIntentFixture('sff-v2.1', 'startup-matrix');
  try {
    for (const [kind, expected] of [['terminal', 'restart-recovery-required'], ['staged', 'restart-recovery-required'], ['manual', 'manual-recovery-required'], ['foreign', 'manual-recovery-required'], ['stale', 'manual-recovery-required']]) assert.strictEqual(routerFor(real, () => plan(kind))({ executingPhaseVaultLocator: real.locator }).status, expected);
    const stable = routerFor(real, () => { const error = new Error('bounded observation failure'); error.code = 'EIO'; throw error; })({ executingPhaseVaultLocator: real.locator }); assert.strictEqual(stable.status, 'manual-recovery-required'); assert.deepStrictEqual(stable.stableObservationError, { name: 'Error', code: 'EIO', message: 'bounded observation failure' });
    const unsafe = routerFor(real, () => { throw new Error('Approved active directory is not a non-link directory.'); })({ executingPhaseVaultLocator: real.locator }); assert.strictEqual(unsafe.status, 'manual-recovery-required');
    assert.throws(() => routerFor(real, () => { throw new Error('Saved layout authority schema hash drifted.'); })({ executingPhaseVaultLocator: real.locator }), /outside the approved filesystem-observation class/);
    let call = 0; assert.throws(() => routerFor(real, () => { call++; if (call === 1) throw new Error('first'); return plan(); })({ executingPhaseVaultLocator: real.locator }), /changed between repeated plans/);
    call = 0; assert.throws(() => routerFor(real, () => { call++; throw new Error(call === 1 ? 'first' : 'second'); })({ executingPhaseVaultLocator: real.locator }), /changed between repeated plans/);
    let reads = 0; const driftRead = base => { reads++; const snapshot = readCreatorOperationVaultCheckpointSnapshot(base), authority = JSON.parse(JSON.stringify(snapshot.authority)); if (reads > 1) authority.workspaceId = h('drifted'); return { ...snapshot, authority }; }; assert.throws(() => routerFor(real, () => plan(), { readSnapshot: driftRead })({ executingPhaseVaultLocator: real.locator }), /changed during restart observation/);
    let retainedCalls = 0; const driftRetained = locator => { retainedCalls++; const value = verifyRetainedCreatorExecutingIntentFromVault(locator); if (retainedCalls > 1) return Object.freeze({ ...value, workspaceId: h('retained-drift') }); return value; }; assert.throws(() => routerFor(real, () => plan(), { verifyRetained: driftRetained })({ executingPhaseVaultLocator: real.locator }), /changed during restart observation/);
  } finally { fs.rmSync(real.root, { recursive: true, force: true }); }
}

// Genuine appended base and attempt-bound ResultCaptured heads route through production D-D2b.3.
for (const attemptBound of [false, true]) {
  const real = createRealExecutingIntentFixture('sff-v2.1', `startup-real-result-${attemptBound ? 'attempt' : 'base'}`);
  try {
    let dispatch = null; if (attemptBound) { const gate = createCreatorCommandGatePlan({ commandId: 'execute-approved-intent', executingIntentVaultLocator: real.locator }); dispatch = createCreatorExecutionDispatchAuthority({ commandId: 'execute-approved-intent', executingIntentVaultLocator: real.locator, expectedCommandGatePlanHash: gate.commandGatePlanHash, executionAttemptId: h('startup-genuine-attempt') }); }
    const receipt = executeCreatorAdoption(real.executorInput, {}).receipt, receiptBytes = json(receipt), captureInput = { executingIntentVaultLocator: real.locator, outcomeReceiptArtifactBytes: receiptBytes, expectedOutcomeReceiptArtifactByteHash: sha(receiptBytes), expectedOutcomeReceiptHash: hashCanonical(receipt) };
    const verification = createCreatorExecutionOutcomeVerifierForTest({ hydrateIntent() { return real.intentVerification; }, readSnapshot(input) { return readCreatorOperationVaultCheckpointSnapshot(input); } })(captureInput), captureBase = createCreatorExecutionResultCaptureForTest({ verifyOutcome() { return verification; } });
    let planValue;
    if (attemptBound) planValue = createCreatorAttemptBoundExecutionResultCaptureForTest({ captureBase })({ executionResultCaptureInput: captureInput, executionDispatchAuthority: dispatch });
    else planValue = captureBase(captureInput);
    const payload = planValue.copyAppendPayload(), child = appendCreatorOperationCheckpoint({ ...real.common, operationDirectory: real.locator.operationDirectory, expectedPreviousCheckpointHash: real.locator.expectedLatestCheckpointHash, mutationId: attemptBound ? planValue.mutationId : h('startup-genuine-base-result'), lifecycleState: 'Executing', ...payload }), locator = { operationDirectory: real.locator.operationDirectory, expectedOperationId: real.locator.expectedOperationId, expectedLatestCheckpointHash: child.latestCheckpointHash, expectedVaultRoot: real.locator.expectedVaultRoot, manifestArtifactName: planValue.manifestArtifactName, expectedManifestArtifactByteHash: planValue.manifestArtifactByteHash, expectedManifestAuthorityHash: planValue.manifestAuthorityHash, expectedManifestHash: planValue.manifestHash };
    const structural = inspectCreatorStructuralExecutingPhaseRoot(locator), routed = routeCreatorExecutionAttemptOnStartup({ executingPhaseVaultLocator: locator }); assert.strictEqual(routed.status, 'result-captured-continuation'); assert.strictEqual(routed.resultContinuationRequired, true); assert.strictEqual(routed.structuralInspectionHash, hashCanonical(structural)); assert.strictEqual(routed.semanticHeadRecordHash, child.latestCheckpointHash); assert.strictEqual(structural.manifestVariant, attemptBound ? 'result-captured-attempt-bound-v2' : 'result-captured-base-v1');
  } finally { fs.rmSync(real.root, { recursive: true, force: true }); }
}

// Boundary validation never invokes caller traps or accessors.
{
  let traps = 0; const proxy = new Proxy({}, { ownKeys() { traps++; throw new Error('trap'); }, getPrototypeOf() { traps++; throw new Error('trap'); } }); assert.throws(() => require('../src/sff_creator_startup_execution_attempt_router').routeCreatorExecutionAttemptOnStartup(proxy), /plain closed/); assert.strictEqual(traps, 0);
  const raw = {}; Object.defineProperty(raw, 'executingPhaseVaultLocator', { enumerable: true, get() { traps++; throw new Error('getter'); } }); assert.throws(() => require('../src/sff_creator_startup_execution_attempt_router').routeCreatorExecutionAttemptOnStartup(raw), /data property/); assert.strictEqual(traps, 0);
}

console.log('sff_creator_startup_execution_attempt_router.test.js: all tests passed');
