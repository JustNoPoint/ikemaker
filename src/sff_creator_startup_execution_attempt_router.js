'use strict';

const { types: { isProxy } } = require('util');
const { decodeStrictJsonArtifact } = require('./sff_strict_json_artifact');
const { canonicalize, hashCanonical } = require('./sff_capability_report');
const { readCreatorOperationVaultCheckpointSnapshot } = require('./sff_creator_operation_vault');
const { inspectCreatorStructuralExecutingPhaseRoot } = require('./sff_creator_structural_phase_root_inspector');
const { verifyCreatorExecutingPhaseFromVault } = require('./sff_creator_executing_phase_verifier');
const { verifyRetainedCreatorExecutingIntentFromVault } = require('./sff_creator_retained_executing_intent_verifier');
const { createCreatorRestartRecoveryPlan } = require('./sff_creator_restart_recovery_plan');

const INPUT_KEYS = Object.freeze(['executingPhaseVaultLocator']);
const LOCATOR_KEYS = Object.freeze(['expectedLatestCheckpointHash', 'expectedManifestArtifactByteHash', 'expectedManifestAuthorityHash', 'expectedManifestHash', 'expectedOperationId', 'expectedVaultRoot', 'manifestArtifactName', 'operationDirectory']);
const EXECUTOR_KEYS = Object.freeze(['executionLayoutApprovalInput', 'executionLayoutApprovalReceiptArtifactBytes', 'expectedActiveByteHash', 'expectedAdoptionApprovalReceiptHash', 'expectedCandidateByteHash', 'expectedCandidateDispatchReceiptHash', 'expectedExecutionLayoutApprovalDecisionHash', 'expectedExecutionLayoutApprovalReceiptArtifactByteHash', 'expectedExecutionLayoutApprovalReceiptHash', 'expectedExecutionLayoutPlanHash', 'expectedPersistedReceiptHash', 'expectedPersistenceValidationHash', 'expectedRequestHash', 'expectedSourceSnapshotHash', 'expectedSourceValidationHash', 'expectedSpecificationHash']);
const ROW_NAMES = Object.freeze(['active', 'backup', 'replacementTemp', 'rollbackHold', 'failedInstallHold', 'rollbackTemp', 'backupPartial', 'lease', 'candidate']);
const ROW_KEYS = Object.freeze(['authority', 'byteHash', 'byteLength', 'error', 'exists', 'formatStatus', 'identity', 'name', 'path', 'reportHash', 'status', 'targetIds']);
const SHA = /^[0-9a-f]{64}$/;

function fail(message) { throw new Error(`Startup execution-attempt router: ${message}`); }
function isPlain(value) { if (value === null || typeof value !== 'object' || isProxy(value) || Array.isArray(value) || Buffer.isBuffer(value) || ArrayBuffer.isView(value)) return false; const proto = Object.getPrototypeOf(value); return proto === Object.prototype || proto === null; }
function closed(raw, keys, label) { if (!isPlain(raw) || Object.getOwnPropertySymbols(raw).length) fail(`${label} must be a plain closed object.`); const descriptors = Object.getOwnPropertyDescriptors(raw), own = Object.keys(descriptors).sort(); if (own.length !== keys.length || own.some((key, index) => key !== [...keys].sort()[index])) fail(`${label} fields drifted.`); const out = {}; for (const key of keys) { const descriptor = descriptors[key]; if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value') || Object.hasOwn(descriptor, 'get') || Object.hasOwn(descriptor, 'set')) fail(`${label}.${key} must be an enumerable data property.`); out[key] = descriptor.value; } return out; }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }
function cloneJson(value, label) { try { return JSON.parse(JSON.stringify(canonicalize(value, label))); } catch (error) { fail(`${label} is not closed JSON metadata: ${error.message}`); } }
function exact(left, right) { return JSON.stringify(canonicalize(left, 'left')) === JSON.stringify(canonicalize(right, 'right')); }
function b1(locator) { return { operationDirectory: locator.operationDirectory, expectedOperationId: locator.expectedOperationId, expectedLatestCheckpointHash: locator.expectedLatestCheckpointHash, expectedVaultRoot: locator.expectedVaultRoot }; }
function withoutFunction(value, functionName, label) { if (!isPlain(value)) fail(`${label} is not a plain result.`); const descriptors = Object.getOwnPropertyDescriptors(value); if (typeof descriptors[functionName]?.value !== 'function' || !descriptors[functionName].enumerable) fail(`${label} omitted its copy boundary.`); const out = {}; for (const [key, descriptor] of Object.entries(descriptors)) { if (key === functionName) continue; if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value === 'function' || Buffer.isBuffer(descriptor.value) || ArrayBuffer.isView(descriptor.value)) fail(`${label} exposed non-JSON metadata.`); out[key] = cloneJson(descriptor.value, `${label}.${key}`); } return out; }
function boundedError(error) { return { name: String(error?.name || 'Error').slice(0, 100), code: error?.code == null ? null : String(error.code).slice(0, 100), message: String(error?.message || error).slice(0, 1000) }; }
function observationFailure(error) { const code = error.code, message = error.message; if (['EIO', 'EACCES', 'EPERM', 'ENOENT', 'ESTALE', 'EBUSY', 'ENOTDIR'].includes(code)) return true; if (/schema|authority|receipt|hash|contract|input|malformed|contradict|independently retained/i.test(message)) return false; return /not a non-link directory|changed during restart observation|filesystem observation|unobservable|unsafe path|cannot observe/i.test(message); }
function bindStructuralCommon(structural, observed, label) {
  for (const key of ['operationId', 'workspaceId', 'targetId', 'backendId', 'adapterId', 'semanticHeadRecordHash']) if (structural[key] !== observed[key]) fail(`${label} ${key} does not match the structural observation.`);
  for (const key of ['activePath', 'candidatePath', 'historyRoot', 'vaultRootSealHash', 'workspaceRootSealHash', 'activeParentSealHash', 'candidateParentSealHash', 'historyRootSealHash']) if (structural[key] !== observed[key]) fail(`${label} ${key} does not match the structural observation.`);
  if (structural.selectedManifestArtifactName !== observed.selectedManifestArtifactName || structural.selectedManifestArtifactByteHash !== observed.selectedManifestArtifactByteHash || structural.selectedManifestHash !== observed.selectedManifestHash || structural.selectedManifestAuthorityHash !== observed.selectedManifestAuthorityHash || structural.snapshotAuthorityHash !== observed.snapshotAuthorityHash) fail(`${label} phase-root or snapshot authority does not match the structural observation.`);
}

function deriveRestartInput(executorInput) {
  const input = closed(executorInput, EXECUTOR_KEYS, 'retained executor input'), artifact = decodeStrictJsonArtifact(input.executionLayoutApprovalReceiptArtifactBytes, 'retained SFF17b receipt'), receipt = artifact.parsed;
  if (!isPlain(receipt) || receipt.schema !== 'ikemaker.sff-creator-execution-layout-approval-receipt' || receipt.version !== 1 || receipt.status !== 'approved') fail('retained SFF17b receipt is not the approved closed authority.');
  for (const key of ['authority', 'active', 'candidate']) if (!isPlain(receipt[key])) fail(`retained SFF17b ${key} authority is malformed.`);
  return {
    executionLayoutApprovalReceiptArtifactBytes: Buffer.from(artifact.bytes),
    expectedActiveByteHash: input.expectedActiveByteHash,
    expectedActiveByteLength: receipt.active.byteLength,
    expectedActiveIdentity: cloneJson(receipt.active.identity, 'active identity'),
    expectedAdoptionApprovalReceiptHash: input.expectedAdoptionApprovalReceiptHash,
    expectedAdoptionPlanArtifactByteHash: receipt.authority.adoptionPlanArtifactByteHash,
    expectedApprovedObservationPlanHash: receipt.authority.approvedObservationPlanHash,
    expectedCandidateByteHash: input.expectedCandidateByteHash,
    expectedCandidateByteLength: receipt.candidate.byteLength,
    expectedCandidateDispatchReceiptHash: input.expectedCandidateDispatchReceiptHash,
    expectedCandidateStrictReportHash: receipt.candidate.strictReportHash,
    expectedCandidateTargetId: receipt.candidate.targetId,
    expectedCapabilitySnapshotHash: receipt.authority.capabilitySnapshotHash,
    expectedExecutionLayoutApprovalDecisionHash: input.expectedExecutionLayoutApprovalDecisionHash,
    expectedExecutionLayoutApprovalReceiptArtifactByteHash: input.expectedExecutionLayoutApprovalReceiptArtifactByteHash,
    expectedExecutionLayoutApprovalReceiptHash: input.expectedExecutionLayoutApprovalReceiptHash,
    expectedExecutionLayoutPlanArtifactByteHash: receipt.executionLayoutPlanArtifactByteHash,
    expectedExecutionLayoutPlanHash: input.expectedExecutionLayoutPlanHash,
    expectedLogicalHash: receipt.authority.logicalHash,
    expectedOperationId: input.expectedExecutionLayoutApprovalReceiptHash,
    expectedPersistedReceiptArtifactByteHash: receipt.authority.persistedReceiptArtifactByteHash,
    expectedPersistedReceiptHash: input.expectedPersistedReceiptHash,
    expectedPersistenceValidationHash: input.expectedPersistenceValidationHash,
    expectedProjectionApprovalReceiptHash: receipt.authority.projectionApprovalReceiptHash,
    expectedRequestHash: input.expectedRequestHash,
    expectedSourceSnapshotHash: input.expectedSourceSnapshotHash,
    expectedSourceValidationHash: input.expectedSourceValidationHash,
    expectedSpecificationHash: input.expectedSpecificationHash,
    recoveryResumeAuthority: null
  };
}

function validateRows(plan) {
  if (!isPlain(plan.currentStateSeal) || !Array.isArray(plan.currentStateSeal.rows) || plan.currentStateSeal.rows.length !== ROW_NAMES.length || !Array.isArray(plan.currentStateSeal.recoveryArtifactRows)) fail('restart plan current-state rows are malformed.');
  const names = plan.currentStateSeal.rows.map(row => row.name);
  if (JSON.stringify(names) !== JSON.stringify(ROW_NAMES)) fail('restart plan current-state role order drifted.');
  for (const row of plan.currentStateSeal.rows) closed(row, ROW_KEYS, `restart row ${row.name}`);
}
function pristine(plan) {
  validateRows(plan);
  const rows = Object.fromEntries(plan.currentStateSeal.rows.map(row => [row.name, row]));
  return plan.classification === 'not-started' && exact(plan.allowedActions, ['no-action-not-started']) && exact(plan.allowedActionStateMapping, { 'no-action-not-started': 'no_action_not_started' }) && plan.blockers.length === 0 && plan.currentStateSeal.journalFailure === null && plan.currentStateSeal.lastJournalState === null && plan.currentStateSeal.lastJournalHash === null && plan.currentStateSeal.journalChainHash === hashCanonical([]) && plan.currentStateSeal.recoveryArtifactRows.length === 0 && rows.active.authority === 'old-active' && rows.active.formatStatus === 'old-active-recognized' && rows.candidate.authority === 'candidate' && rows.candidate.formatStatus === 'candidate-validated' && ['backup', 'replacementTemp', 'rollbackHold', 'failedInstallHold', 'rollbackTemp', 'backupPartial', 'lease'].every(name => rows[name].status === 'missing' && rows[name].exists === false && rows[name].authority === 'missing');
}
function manual(plan) { return plan.blockers.length > 0 || exact(plan.allowedActions, ['manual-recovery-only']) || plan.classification === 'journal-chain-invalid' || plan.risks.some(risk => risk === 'same-operation-stale-lease-unknown-liveness') || plan.currentStateSeal.rows.some(row => ['unsafe', 'unobservable'].includes(row.status) || ['foreign', 'multiple', 'foreign-lease'].includes(row.authority)); }
function effects() { return { writes: false, processes: false, approvalsGranted: false, backendExecution: false, executionStarted: false, recoveryStarted: false, activeArchiveModified: false, historyAppended: false }; }

function buildRouter(deps) {
  return function routeCreatorExecutionAttemptOnStartup(rawInput) {
    const outer = closed(rawInput, INPUT_KEYS, 'router input'), locator = closed(outer.executingPhaseVaultLocator, LOCATOR_KEYS, 'Executing phase locator');
    const structural = deps.inspectStructural(locator), structuralHash = hashCanonical(structural);
    if (structural.phase === 'ResultCaptured') {
      const verified = deps.verifyPhase(locator);
      if (verified.phase !== 'ResultCaptured') fail('ResultCaptured semantic verification returned the wrong phase.');
      bindStructuralCommon(structural, verified, 'ResultCaptured semantic verification');
      const resultVerification = cloneJson(verified, 'ResultCaptured verification');
      return freeze({ schema: 'ikemaker.sff-creator-startup-execution-attempt-route', version: 1, status: 'result-captured-continuation', lifecycleState: 'Executing', phase: 'ResultCaptured', operationId: structural.operationId, semanticHeadRecordHash: structural.semanticHeadRecordHash, structuralInspectionHash: structuralHash, retainedIntentVerificationHash: null, resultVerificationHash: hashCanonical(resultVerification), restartRecoveryPlan: null, restartRecoveryPlanHash: null, stableObservationError: null, observationClass: 'filesystem-read-only', retryOfferAllowed: false, resultContinuationRequired: true, restartRecoveryReviewRequired: false, manualRecoveryRequired: false, currentStateGuaranteed: false, executionAuthorityGranted: false, executionAllowed: false, recoveryAuthorityGranted: false, classificationAuthorityGranted: false, historyAuthorityGranted: false, writesAllowed: false, effects: effects() });
    }
    if (structural.phase !== 'ExecutionIntentRecorded') fail('unsupported structural Executing phase.');
    const before = deps.readSnapshot(b1(locator));
    if (structural.snapshotAuthorityHash !== hashCanonical(before.authority)) fail('intent B1 authority changed after structural inspection.');
    const structuralBefore = { operationId: before.authority.operationId, workspaceId: before.authority.workspaceId, targetId: before.authority.targetId, backendId: before.authority.backendId, adapterId: before.authority.adapterId, activePath: before.authority.activePath, candidatePath: before.authority.candidatePath, historyRoot: before.authority.historyRoot, vaultRootSealHash: hashCanonical(before.authority.vaultRootSeal), workspaceRootSealHash: hashCanonical(before.authority.workspaceRootSeal), activeParentSealHash: hashCanonical(before.authority.activeParentSeal), candidateParentSealHash: hashCanonical(before.authority.candidateParentSeal), historyRootSealHash: hashCanonical(before.authority.historyRootSeal), semanticHeadRecordHash: before.authority.semanticHeadRecordHash, selectedManifestArtifactName: locator.manifestArtifactName, selectedManifestArtifactByteHash: locator.expectedManifestArtifactByteHash, selectedManifestHash: locator.expectedManifestHash, selectedManifestAuthorityHash: locator.expectedManifestAuthorityHash, snapshotAuthorityHash: hashCanonical(before.authority) };
    bindStructuralCommon(structural, structuralBefore, 'intent B1 authority');
    const retainedBefore = deps.verifyRetained(locator), retainedMetadata = withoutFunction(retainedBefore, 'copyExecutorInput', 'retained intent verification');
    if (retainedMetadata.snapshotAuthorityHash !== structural.snapshotAuthorityHash || retainedMetadata.operationId !== structural.operationId || retainedMetadata.workspaceId !== structural.workspaceId || retainedMetadata.targetId !== structural.targetId || retainedMetadata.backendId !== structural.backendId || retainedMetadata.adapterId !== structural.adapterId || retainedMetadata.semanticHeadRecordHash !== structural.semanticHeadRecordHash || retainedMetadata.routeId !== structural.routeId || retainedMetadata.executionIntentReceipt?.active?.path !== structural.activePath || retainedMetadata.executionIntentReceipt?.candidate?.path !== structural.candidatePath) fail('retained intent verification does not bind the structural observation.');
    const executorInput = retainedBefore.copyExecutorInput(), restartInput = deriveRestartInput(executorInput); let first, second;
    try { first = { plan: deps.createPlan(restartInput), error: null }; } catch (error) { first = { plan: null, error: boundedError(error) }; }
    try { second = { plan: deps.createPlan(restartInput), error: null }; } catch (error) { second = { plan: null, error: boundedError(error) }; }
    const retainedAfterResult = deps.verifyRetained(locator), retainedAfter = withoutFunction(retainedAfterResult, 'copyExecutorInput', 'retained intent re-verification'), after = deps.readSnapshot(b1(locator));
    if (!exact(before.authority, after.authority) || !exact(retainedMetadata, retainedAfter) || retainedMetadata.operationId !== structural.operationId || retainedMetadata.semanticHeadRecordHash !== structural.semanticHeadRecordHash) fail('vault or retained intent authority changed during restart observation.');
    const retainedHash = hashCanonical(retainedMetadata);
    if (!!first.error !== !!second.error || first.error && !exact(first.error, second.error) || first.plan && (!exact(first.plan, second.plan) || first.plan.planHash !== second.plan.planHash || first.plan.currentStateHash !== second.plan.currentStateHash || !exact(first.plan.currentStateSeal, second.plan.currentStateSeal))) fail('restart observation changed between repeated plans.');
    if (first.error) { if (!observationFailure(first.error)) fail(`restart planning failed outside the approved filesystem-observation class: ${first.error.message}`); return freeze({ schema: 'ikemaker.sff-creator-startup-execution-attempt-route', version: 1, status: 'manual-recovery-required', lifecycleState: 'Executing', phase: 'ExecutionIntentRecorded', operationId: structural.operationId, semanticHeadRecordHash: structural.semanticHeadRecordHash, structuralInspectionHash: structuralHash, retainedIntentVerificationHash: retainedHash, resultVerificationHash: null, restartRecoveryPlan: null, restartRecoveryPlanHash: null, stableObservationError: first.error, observationClass: 'filesystem-read-only', retryOfferAllowed: false, resultContinuationRequired: false, restartRecoveryReviewRequired: false, manualRecoveryRequired: true, currentStateGuaranteed: false, executionAuthorityGranted: false, executionAllowed: false, recoveryAuthorityGranted: false, classificationAuthorityGranted: false, historyAuthorityGranted: false, writesAllowed: false, effects: effects() }); }
    const plan = cloneJson(first.plan, 'restart recovery plan'), isPristine = pristine(plan), isManual = !isPristine && manual(plan), status = isPristine ? 'retry-may-be-offered' : isManual ? 'manual-recovery-required' : 'restart-recovery-required';
    return freeze({ schema: 'ikemaker.sff-creator-startup-execution-attempt-route', version: 1, status, lifecycleState: 'Executing', phase: 'ExecutionIntentRecorded', operationId: structural.operationId, semanticHeadRecordHash: structural.semanticHeadRecordHash, structuralInspectionHash: structuralHash, retainedIntentVerificationHash: retainedHash, resultVerificationHash: null, restartRecoveryPlan: plan, restartRecoveryPlanHash: plan.planHash, stableObservationError: null, observationClass: 'filesystem-read-only', retryOfferAllowed: isPristine, resultContinuationRequired: false, restartRecoveryReviewRequired: status === 'restart-recovery-required', manualRecoveryRequired: isManual, currentStateGuaranteed: false, executionAuthorityGranted: false, executionAllowed: false, recoveryAuthorityGranted: false, classificationAuthorityGranted: false, historyAuthorityGranted: false, writesAllowed: false, effects: effects() });
  };
}

const routeCreatorExecutionAttemptOnStartup = buildRouter({ inspectStructural: inspectCreatorStructuralExecutingPhaseRoot, verifyPhase: verifyCreatorExecutingPhaseFromVault, verifyRetained: verifyRetainedCreatorExecutingIntentFromVault, readSnapshot: readCreatorOperationVaultCheckpointSnapshot, createPlan: createCreatorRestartRecoveryPlan });
function createCreatorStartupExecutionAttemptRouterForTest(raw) { const deps = closed(raw, ['createPlan', 'inspectStructural', 'readSnapshot', 'verifyPhase', 'verifyRetained'], 'test dependencies'); for (const value of Object.values(deps)) if (typeof value !== 'function') fail('test dependencies must be functions.'); return buildRouter(deps); }

module.exports = { createCreatorStartupExecutionAttemptRouterForTest, deriveRestartInput, routeCreatorExecutionAttemptOnStartup };
