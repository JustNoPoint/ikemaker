'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const { hashCanonical } = require('../src/sff_capability_report');
const { createCreatorLiveExecutionCommandForTest } = require('../src/sff_creator_live_execution_command');
const { readCreatorOperationVaultCheckpointSnapshot } = require('../src/sff_creator_operation_vault');
const { createCreatorExecutionDispatchAuthority } = require('../src/sff_creator_execution_dispatch_authority');
const { verifyCreatorExecutingPhaseFromVault } = require('../src/sff_creator_executing_phase_verifier');
const { verifyRetainedCreatorExecutingIntentFromVault } = require('../src/sff_creator_retained_executing_intent_verifier');
const { executeCreatorAdoption } = require('../src/sff_creator_transactional_executor');
const { verifyCreatorExecutionOutcome } = require('../src/sff_creator_execution_outcome_verifier');
const { createCreatorAttemptBoundExecutionResultCapture } = require('../src/sff_creator_execution_result_capture');
const { createCreatorResultAppendPreparationPlan, writeCreatorResultAppendPreparation } = require('../src/sff_creator_result_append_preparation');
const { appendPreparedCreatorResultCheckpoint } = require('../src/sff_creator_prepared_result_checkpoint');
const { cleanupCreatorResultAppendPreparation } = require('../src/sff_creator_result_preparation_cleanup');
const { createCreatorCommandGatePlan } = require('../src/sff_creator_command_gate');
const { createRealExecutingIntentFixture } = require('./helpers/sff_creator_executing_intent_fixture');

const h = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function normalized(value) { if (Buffer.isBuffer(value)) return { byteHash: sha(value), byteLength: value.length }; if (Array.isArray(value)) return value.map(normalized); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalized(value[key])])); return value; }
const triples = { 'sff-v1': ['ikemaker-builtin-sff-v1', 'builtin-v1-pcx8'], 'sff-v2.0': ['ikemaker-builtin-sff-v2.0', 'builtin-v20-raw8'], 'sff-v2.1': ['ikemaker-builtin-sff-v21-png8-prerelease', 'builtin-v21-png8'] };
function harness(targetId = 'sff-v2.1', options = {}) {
  const [backendId, adapterId] = triples[targetId], operationId = h(`op-${targetId}`), workspaceId = h(`workspace-${targetId}`), head = h(`head-${targetId}`), attempt = h(`attempt-${targetId}`), gate = h(`gate-${targetId}`), locator = { operationDirectory: `C:\\vault\\op-${operationId}`, expectedOperationId: operationId, expectedLatestCheckpointHash: head, expectedVaultRoot: 'C:\\vault', manifestArtifactName: 'execution-approved-executing-intent-route-manifest', expectedManifestArtifactByteHash: h('intent-byte'), expectedManifestAuthorityHash: h('intent-authority'), expectedManifestHash: h('intent-manifest') };
  const receiptBytes = Buffer.from('approval'), executorInput = { executionLayoutApprovalInput: { held: true }, executionLayoutApprovalReceiptArtifactBytes: receiptBytes, expectedActiveByteHash: h('active'), expectedAdoptionApprovalReceiptHash: h('adoption'), expectedCandidateByteHash: h('candidate'), expectedCandidateDispatchReceiptHash: h('dispatch'), expectedExecutionLayoutApprovalDecisionHash: h('decision'), expectedExecutionLayoutApprovalReceiptArtifactByteHash: sha(receiptBytes), expectedExecutionLayoutApprovalReceiptHash: h('approval'), expectedExecutionLayoutPlanHash: h('layout'), expectedPersistedReceiptHash: h('persisted'), expectedPersistenceValidationHash: h('persistence'), expectedRequestHash: h('request'), expectedSourceSnapshotHash: h('source'), expectedSourceValidationHash: h('source-validation'), expectedSpecificationHash: h('spec') };
  const descriptor = { schema: 'ikemaker.sff-creator-executor-authority-descriptor', version: 1, projection: { executionLayoutApprovalInput: 'reconstructed-from-held-route4-through-route1-evidence', executionLayoutApprovalReceiptArtifactBytes: 'exact-held-sff17b-receipt-artifact' }, hashes: Object.fromEntries(Object.entries(executorInput).filter(([key]) => key.startsWith('expected') && key !== 'expectedActiveByteHash').map(([key, value]) => [key, value])) }; descriptor.hashes.expectedActiveByteHash = executorInput.expectedActiveByteHash;
  const retainedMetadata = { schema: 'ikemaker.sff-creator-retained-executing-intent-verification', version: 1, status: 'verified', operationId, workspaceId, targetId, backendId, adapterId, semanticHeadRecordHash: head, executionIntentReceipt: { executionLayoutApprovalReceiptHash: executorInput.expectedExecutionLayoutApprovalReceiptHash, executionLayoutApprovalReceiptArtifactByteHash: executorInput.expectedExecutionLayoutApprovalReceiptArtifactByteHash }, executionIntentReceiptHash: h('intent-receipt'), executorAuthorityDescriptor: descriptor, executorAuthorityDescriptorHash: hashCanonical(descriptor) };
  const authority = { operationId, workspaceId, targetId, backendId, adapterId, semanticHeadRecordHash: head, activePath: 'C:\\workspace\\active.sff', candidatePath: 'C:\\workspace\\candidate.sff', historyRoot: 'C:\\history', workspaceRootSeal: { realpath: 'C:\\workspace' }, vaultRootSeal: { realpath: 'C:\\vault' } }, snapshotHash = hashCanonical(authority), comparison = hashCanonical({ domain: 'ikemaker.sff-creator-executor-input-authority-comparison', version: 1, normalizedExecutorInput: normalized(executorInput) });
  let executeCalls = 0, snapshotCalls = 0, phaseCalls = 0;
  const deps = {
    readSnapshot() { snapshotCalls++; const value = JSON.parse(JSON.stringify(authority)); if (options.b1Drift && snapshotCalls > 1) value.workspaceId = h('drift'); return { authority: value }; },
    routeStartup() { return { status: 'retry-may-be-offered', phase: 'ExecutionIntentRecorded', operationId, semanticHeadRecordHash: head }; },
    createDispatch() { return { selection: { targetId, backendId, adapterId }, operationId, semanticHeadRecordHash: head, executionAttemptId: attempt, commandGatePlanHash: gate, snapshotAuthorityHash: snapshotHash, retainedIntentAuthorityVerificationHash: hashCanonical(retainedMetadata), executorInputAuthorityComparisonHash: comparison, executorAuthorityDescriptorHash: retainedMetadata.executorAuthorityDescriptorHash, executionAttemptAuthorityHash: h('attempt-authority') }; },
    verifyPhase(input) { phaseCalls++; return input.manifestArtifactName === 'executing-result-captured-route-manifest' ? { phase: 'ResultCaptured', semanticHeadRecordHash: h('child'), operationId, targetId, backendId, adapterId, selectedManifestArtifactByteHash: h('manifest-byte'), selectedManifestHash: h('manifest'), selectedManifestAuthorityHash: h('manifest-authority') } : { phase: 'ExecutionIntentRecorded', semanticHeadRecordHash: head, operationId }; },
    verifyRetained() { return { ...retainedMetadata, copyExecutorInput() { return { ...executorInput, executionLayoutApprovalInput: JSON.parse(JSON.stringify(executorInput.executionLayoutApprovalInput)), executionLayoutApprovalReceiptArtifactBytes: Buffer.from(executorInput.executionLayoutApprovalReceiptArtifactBytes) }; } }; },
    execute() { executeCalls++; if (options.badReceipt) return {}; const receipt = { schema: 'fixture', status: options.outcome || 'committed', operationId }; if (options.throwRecovery) { const error = new Error('recovered'); error.recoveryReceipt = receipt; error.recoveryReceiptHash = hashCanonical(receipt); throw error; } return { receipt, receiptHash: hashCanonical(receipt) }; },
    verifyOutcome() { return { outcomeClass: options.outcome || 'committed' }; },
    captureAttempt() { return { status: 'append-ready', executionAttemptId: attempt, expectedPreviousCheckpointHash: head, mutationId: h('mutation'), manifestArtifactByteHash: h('manifest-byte'), manifestHash: h('manifest'), manifestAuthorityHash: h('manifest-authority'), copyAppendPayload() { return { artifacts: [], binaries: [], artifactAuthorities: [] }; } }; },
    planPreparation() { return { planHash: h('prep-plan') }; },
    writePreparation() { return { status: 'prepared', effects: { writes: true }, restartLocator: { retained: true } }; },
    appendPrepared() { return options.appendInterrupted ? { status: 'append-interrupted-recoverable', vaultWritesMayHaveOccurred: true } : { status: 'checkpoint-appended', mutationId: h('mutation'), resultManifestArtifactByteHash: h('manifest-byte'), resultManifestHash: h('manifest'), resultManifestAuthorityHash: h('manifest-authority'), operationId, targetId, backendId, adapterId, observedChildCheckpointHash: h('child'), vaultWritesMayHaveOccurred: true }; },
    cleanupPreparation() { return options.cleanupRequired ? { status: 'cleanup-interrupted-retryable', effects: { writes: true }, boundedError: { message: 'cleanup' } } : { status: 'preparation-cleaned', effects: { writes: true }, boundedError: null }; }
  };
  const input = { commandId: 'execute-approved-intent', executingIntentVaultLocator: locator, executionAttemptId: attempt, expectedCommandGatePlanHash: gate };
  return { deps, input, get executeCalls() { return executeCalls; }, get phaseCalls() { return phaseCalls; } };
}

for (const target of Object.keys(triples)) { const f = harness(target), result = createCreatorLiveExecutionCommandForTest(f.deps)(f.input); assert.strictEqual(result.status, 'result-captured-cleaned'); assert.strictEqual(result.targetId, target); assert.strictEqual(f.executeCalls, 1); assert.strictEqual(result.executorInvoked, true); assert.strictEqual(result.resultCaptured, true); assert.strictEqual(result.preparationCleaned, true); assert.strictEqual(result.historyAppended, false); assert(Object.isFrozen(result)); assert(!JSON.stringify(result).includes('ArtifactBytes')); }

// Production end-to-end chain for every built-in format. The fixture's identical old/candidate
// bytes make its real SFF-19A state intentionally non-pristine, so only that read-only decision is injected.
for (const targetId of Object.keys(triples)) {
  const real = createRealExecutingIntentFixture(targetId, `live-command-${targetId.replace('.', '-')}`), sentinel = `${real.root}\\outside-sentinel.txt`; fs.writeFileSync(sentinel, 'unchanged');
  try {
    const gate = createCreatorCommandGatePlan({ commandId: 'execute-approved-intent', executingIntentVaultLocator: real.locator }), executionAttemptId = h(`live-command-attempt-${targetId}`), deps = { readSnapshot: readCreatorOperationVaultCheckpointSnapshot, routeStartup() { return { status: 'retry-may-be-offered', phase: 'ExecutionIntentRecorded', operationId: real.locator.expectedOperationId, semanticHeadRecordHash: real.locator.expectedLatestCheckpointHash }; }, createDispatch: createCreatorExecutionDispatchAuthority, verifyPhase: verifyCreatorExecutingPhaseFromVault, verifyRetained: verifyRetainedCreatorExecutingIntentFromVault, execute: executeCreatorAdoption, verifyOutcome: verifyCreatorExecutionOutcome, captureAttempt: createCreatorAttemptBoundExecutionResultCapture, planPreparation: createCreatorResultAppendPreparationPlan, writePreparation: writeCreatorResultAppendPreparation, appendPrepared: appendPreparedCreatorResultCheckpoint, cleanupPreparation: cleanupCreatorResultAppendPreparation }, result = createCreatorLiveExecutionCommandForTest(deps)({ commandId: 'execute-approved-intent', executingIntentVaultLocator: real.locator, executionAttemptId, expectedCommandGatePlanHash: gate.commandGatePlanHash });
    assert.strictEqual(result.status, 'result-captured-cleaned'); assert.strictEqual(result.targetId, targetId); assert.strictEqual(result.executionAttemptId, executionAttemptId); assert.strictEqual(result.resultCaptured, true); assert.strictEqual(result.preparationCleaned, true); assert.strictEqual(fs.readFileSync(sentinel, 'utf8'), 'unchanged');
  } finally { fs.rmSync(real.root, { recursive: true, force: true }); }
}
for (const outcome of ['aborted-before-replacement', 'rolled-back', 'committed-cleanup-required', 'manual-recovery-required', 'uncertain-failure']) { const f = harness('sff-v2.1', { outcome, throwRecovery: outcome !== 'committed-cleanup-required' }), result = createCreatorLiveExecutionCommandForTest(f.deps)(f.input); assert.strictEqual(result.status, 'result-captured-cleaned'); assert.strictEqual(result.outcomeClass, outcome); assert.strictEqual(f.executeCalls, 1); }
{
  const f = harness('sff-v2.1', { badReceipt: true }), result = createCreatorLiveExecutionCommandForTest(f.deps)(f.input); assert.strictEqual(result.status, 'manual-startup-reinspection-required'); assert.strictEqual(f.executeCalls, 1); assert.strictEqual(result.resultCaptured, false);
}
{
  const f = harness('sff-v2.1', { appendInterrupted: true }), result = createCreatorLiveExecutionCommandForTest(f.deps)(f.input); assert.strictEqual(result.status, 'post-execution-manual-reinspection-required'); assert.strictEqual(f.executeCalls, 1); assert(result.preparationLocator); assert.strictEqual(result.vaultWritesMayHaveOccurred, true);
}
{
  const f = harness('sff-v2.1', { cleanupRequired: true }), result = createCreatorLiveExecutionCommandForTest(f.deps)(f.input); assert.strictEqual(result.status, 'result-captured-cleanup-required'); assert.strictEqual(result.resultCaptured, true); assert(result.resultCapturedLocator); assert.strictEqual(f.executeCalls, 1);
}
{
  const f = harness('sff-v2.1', { b1Drift: true }); assert.throws(() => createCreatorLiveExecutionCommandForTest(f.deps)(f.input), /changed immediately before/); assert.strictEqual(f.executeCalls, 0);
}
{
  let traps = 0; const proxy = new Proxy({}, { getPrototypeOf() { traps++; throw new Error('trap'); } }); assert.throws(() => require('../src/sff_creator_live_execution_command').executeCreatorApprovedIntentCommand(proxy), /plain closed/); assert.strictEqual(traps, 0);
}
{
  const source = fs.readFileSync(require.resolve('../src/sff_creator_live_execution_command'), 'utf8'); assert(!/child_process|vscode|extension|commands\.registerCommand/.test(source));
}

console.log('sff_creator_live_execution_command.test.js: all tests passed');
