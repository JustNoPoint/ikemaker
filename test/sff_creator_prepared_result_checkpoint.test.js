'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { hashCanonical } = require('../src/sff_capability_report');
const { createCreatorCommandGatePlan } = require('../src/sff_creator_command_gate');
const { createCreatorExecutionDispatchAuthority } = require('../src/sff_creator_execution_dispatch_authority');
const { createCreatorExecutionResultCaptureForTest, createCreatorAttemptBoundExecutionResultCaptureForTest } = require('../src/sff_creator_execution_result_capture');
const { createCreatorExecutionOutcomeVerifierForTest } = require('../src/sff_creator_execution_outcome_verifier');
const { createCreatorResultAppendPreparationPlan, writeCreatorResultAppendPreparation } = require('../src/sff_creator_result_append_preparation');
const { COMMAND_ID, appendPreparedCreatorResultCheckpoint, createPreparedCreatorResultCheckpointForTest } = require('../src/sff_creator_prepared_result_checkpoint');
const { appendCreatorOperationCheckpoint, readCreatorOperationVaultCheckpointSnapshot } = require('../src/sff_creator_operation_vault');
const { executeCreatorAdoption } = require('../src/sff_creator_transactional_executor');
const { createRealExecutingIntentFixture } = require('./helpers/sff_creator_executing_intent_fixture');

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const h = value => sha(Buffer.from(value));
const json = value => Buffer.from(`${JSON.stringify(value)}\n`);

function createPrepared(target, tag) {
  const real = createRealExecutingIntentFixture(target, `prepared-checkpoint-${tag}`), gate = createCreatorCommandGatePlan({ commandId: 'execute-approved-intent', executingIntentVaultLocator: real.locator }), dispatch = createCreatorExecutionDispatchAuthority({ commandId: 'execute-approved-intent', executingIntentVaultLocator: real.locator, expectedCommandGatePlanHash: gate.commandGatePlanHash, executionAttemptId: h(`attempt-${tag}`) }), execution = executeCreatorAdoption(real.executorInput, {}), receiptBytes = json(execution.receipt), outcomeInput = { executingIntentVaultLocator: real.locator, outcomeReceiptArtifactBytes: receiptBytes, expectedOutcomeReceiptArtifactByteHash: sha(receiptBytes), expectedOutcomeReceiptHash: hashCanonical(execution.receipt) }, outcome = createCreatorExecutionOutcomeVerifierForTest({ hydrateIntent() { return real.intentVerification; }, readSnapshot(locator) { return readCreatorOperationVaultCheckpointSnapshot(locator); } })(outcomeInput), base = createCreatorExecutionResultCaptureForTest({ verifyOutcome() { return outcome; } }), capture = createCreatorAttemptBoundExecutionResultCaptureForTest({ captureBase: base })({ executionResultCaptureInput: outcomeInput, executionDispatchAuthority: dispatch }), payload = capture.copyAppendPayload(), appendInput = { ...real.common, operationDirectory: real.locator.operationDirectory, expectedPreviousCheckpointHash: real.locator.expectedLatestCheckpointHash, mutationId: capture.mutationId, lifecycleState: 'Executing', ...payload }, plan = createCreatorResultAppendPreparationPlan({ appendInput }), prepared = writeCreatorResultAppendPreparation({ preparationPlanInput: { appendInput }, expectedPreparationPlanHash: plan.planHash });
  return { ...real, appendInput, capture, plan, prepared, command: { commandId: COMMAND_ID, preparationLocator: prepared.restartLocator } };
}
function assertReceipt(receipt, status) {
  assert.strictEqual(receipt.status, status); assert(Object.isFrozen(receipt) && Object.isFrozen(receipt.effects)); assert.strictEqual(receipt.commandId, COMMAND_ID); assert.strictEqual(receipt.preparationVerified, true); assert.strictEqual(receipt.preparationRetained, true); assert.strictEqual(receipt.preparationCleanupRequired, true); assert.strictEqual(receipt.preparationModified, false); assert.strictEqual(receipt.activeArchiveModified, false); assert.strictEqual(receipt.candidateModified, false); assert.strictEqual(receipt.historyModified, false); assert.strictEqual(receipt.executionStarted, false); assert.strictEqual(receipt.recoveryAuthorityGranted, false); assert.strictEqual(receipt.classificationAuthorityGranted, false); assert.strictEqual(receipt.historyAuthorityGranted, false); assert(!JSON.stringify(receipt).includes('copyPreparedAppendInput')); assert(!Buffer.isBuffer(receipt));
}

for (const target of ['sff-v1', 'sff-v2.0', 'sff-v2.1']) {
  const fixture = createPrepared(target, `success-${target}`);
  try {
    const activeBefore = fs.readFileSync(fixture.common.activePath), candidateBefore = fs.readFileSync(fixture.common.candidatePath), historyBefore = fs.readdirSync(fixture.common.historyRoot).sort();
    assert.throws(() => appendPreparedCreatorResultCheckpoint({ commandId: COMMAND_ID, preparationLocator: { ...fixture.prepared.restartLocator, expectedPreparationPlanHash: h('tampered-plan') } }), /plan|authority|formula|drift/i);
    const appended = appendPreparedCreatorResultCheckpoint(fixture.command); assertReceipt(appended, 'checkpoint-appended'); assert.strictEqual(appended.appendInvoked, true); assert.strictEqual(appended.vaultWritesMayHaveOccurred, true); assert.strictEqual(appended.vaultCheckpointAppended, true); assert.strictEqual(appended.observedChildCheckpointHash, fixture.plan.nextCheckpointHash); assert(appended.phaseVerificationHash); assert.strictEqual(appended.boundedError, null);
    if (target === 'sff-v2.1') { let calls = 0; const throwingPhase = createPreparedCreatorResultCheckpointForTest({ appendCheckpoint() { calls += 1; throw new Error('must not append completed child'); }, verifyCompletedPhase() { throw Object.assign(new Error('phase verification failed'), { code: 'EIO' }); } })(fixture.command); assertReceipt(throwingPhase, 'append-unsafe-or-ambiguous'); assert.strictEqual(throwingPhase.vaultCheckpointAppended, false); assert.strictEqual(throwingPhase.observedChildCheckpointHash, null); assert.strictEqual(throwingPhase.boundedError.code, 'EIO'); assert.strictEqual(calls, 0); const mismatchedPhase = createPreparedCreatorResultCheckpointForTest({ appendCheckpoint() { calls += 1; throw new Error('must not append completed child'); }, verifyCompletedPhase() { return { phase: 'ResultCaptured', semanticHeadRecordHash: h('wrong-child'), selectedManifestArtifactName: 'wrong', selectedManifestArtifactByteHash: h('wrong-byte'), selectedManifestHash: h('wrong-manifest'), selectedManifestAuthorityHash: h('wrong-authority') }; } })(fixture.command); assertReceipt(mismatchedPhase, 'append-unsafe-or-ambiguous'); assert.strictEqual(mismatchedPhase.vaultCheckpointAppended, false); assert.strictEqual(mismatchedPhase.boundedError.code, 'ERR_COMPLETED_PHASE_MISMATCH'); assert.strictEqual(calls, 0); }
    const idempotent = appendPreparedCreatorResultCheckpoint(fixture.command); assertReceipt(idempotent, 'checkpoint-already-appended'); assert.strictEqual(idempotent.appendInvoked, false); assert.strictEqual(idempotent.vaultWritesMayHaveOccurred, false); assert.strictEqual(idempotent.observedChildCheckpointHash, fixture.plan.nextCheckpointHash);
    assert.deepStrictEqual(fs.readFileSync(fixture.common.activePath), activeBefore); assert.deepStrictEqual(fs.readFileSync(fixture.common.candidatePath), candidateBefore); assert.deepStrictEqual(fs.readdirSync(fixture.common.historyRoot).sort(), historyBefore);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
}

{
  const fixture = createPrepared('sff-v2.1', 'throw-before'); let calls = 0;
  try {
    const runner = createPreparedCreatorResultCheckpointForTest({ appendCheckpoint() { calls += 1; const error = new Error('bounded pre-write fault'); error.code = 'EIO'; throw error; } }), result = runner(fixture.command); assertReceipt(result, 'append-not-started-retryable'); assert.strictEqual(calls, 1); assert.strictEqual(result.vaultWritesMayHaveOccurred, true); assert.deepStrictEqual(result.boundedError, { name: 'Error', code: 'EIO', message: 'bounded pre-write fault' });
    const recovered = appendPreparedCreatorResultCheckpoint(fixture.command); assertReceipt(recovered, 'checkpoint-appended');
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
}

{
  const fixture = createPrepared('sff-v2.1', 'recoverable-lock'); let calls = 0;
  try {
    const nextSequence = readCreatorOperationVaultCheckpointSnapshot({ operationDirectory: fixture.locator.operationDirectory, expectedOperationId: fixture.locator.expectedOperationId, expectedLatestCheckpointHash: fixture.locator.expectedLatestCheckpointHash, expectedVaultRoot: fixture.locator.expectedVaultRoot }).authority.headCheckpoint.sequence + 1, runner = createPreparedCreatorResultCheckpointForTest({ appendCheckpoint(input) { calls += 1; return appendCreatorOperationCheckpoint(input, { faultAt: `before_checkpoint_${String(nextSequence).padStart(6, '0')}_create` }); } }), interrupted = runner(fixture.command); assertReceipt(interrupted, 'append-interrupted-recoverable'); assert.strictEqual(calls, 1); assert.strictEqual(interrupted.vaultWritesMayHaveOccurred, true); assert(interrupted.boundedError.message.includes('Injected'));
    const resumed = appendPreparedCreatorResultCheckpoint(fixture.command); assertReceipt(resumed, 'checkpoint-appended'); assert.strictEqual(appendPreparedCreatorResultCheckpoint(fixture.command).status, 'checkpoint-already-appended');
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
}

{
  const fixture = createPrepared('sff-v2.1', 'throw-after-child'); let calls = 0;
  try {
    const runner = createPreparedCreatorResultCheckpointForTest({ appendCheckpoint(input) { calls += 1; return appendCreatorOperationCheckpoint(input); }, verifyCompletedPhase() { throw Object.assign(new Error('post-append phase failure'), { code: 'EIO' }); } }), result = runner(fixture.command); assertReceipt(result, 'append-unsafe-or-ambiguous'); assert.strictEqual(calls, 1); assert.strictEqual(result.vaultCheckpointAppended, false); assert.strictEqual(result.observedChildCheckpointHash, null); assert.strictEqual(result.phaseVerificationHash, null); assert.strictEqual(result.vaultWritesMayHaveOccurred, true); assert.strictEqual(result.boundedError.code, 'EIO');
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
}

{
  const fixture = createPrepared('sff-v2.1', 'contradictory-return');
  try {
    let calls = 0; const runner = createPreparedCreatorResultCheckpointForTest({ appendCheckpoint(input) { calls += 1; return appendCreatorOperationCheckpoint(input); }, verifyCompletedPhase() { return { phase: 'ResultCaptured', semanticHeadRecordHash: h('mismatched-post-append-head'), selectedManifestArtifactName: 'wrong', selectedManifestArtifactByteHash: h('wrong-byte'), selectedManifestHash: h('wrong-manifest'), selectedManifestAuthorityHash: h('wrong-authority') }; } }), result = runner(fixture.command); assertReceipt(result, 'append-unsafe-or-ambiguous'); assert.strictEqual(calls, 1); assert.strictEqual(result.vaultCheckpointAppended, false); assert.strictEqual(result.observedChildCheckpointHash, null); assert.strictEqual(result.phaseVerificationHash, null); assert.strictEqual(result.boundedError.code, 'ERR_COMPLETED_PHASE_UNPROVEN');
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
}

{
  const fixture = createPrepared('sff-v2.1', 'competing');
  try {
    assert.throws(() => appendCreatorOperationCheckpoint({ ...fixture.appendInput, mutationId: h('competing-mutation') }, { faultAt: 'after_mutation_lock' }), /fault/); const result = appendPreparedCreatorResultCheckpoint(fixture.command); assertReceipt(result, 'append-competing-mutation'); assert.strictEqual(result.appendInvoked, false); assert.strictEqual(result.vaultWritesMayHaveOccurred, false);
    assert.throws(() => appendPreparedCreatorResultCheckpoint({ commandId: COMMAND_ID, preparationLocator: { ...fixture.command.preparationLocator, expectedReadyHash: h('tampered-competing-ready') } }), /capsule|locator|authority|formula/i);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
}

{
  const fixture = createPrepared('sff-v2.1', 'manual');
  try {
    assert.throws(() => appendCreatorOperationCheckpoint(fixture.appendInput, { faultAt: 'after_mutation_lock' }), /fault/); const result = appendPreparedCreatorResultCheckpoint(fixture.command); assertReceipt(result, 'append-manual-recovery-required'); assert.strictEqual(result.appendInvoked, false); assert.strictEqual(result.vaultWritesMayHaveOccurred, false);
    assert.throws(() => appendPreparedCreatorResultCheckpoint({ commandId: COMMAND_ID, preparationLocator: { ...fixture.command.preparationLocator, expectedManifestHash: h('tampered-manual-manifest') } }), /capsule|locator|authority|formula/i);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
}

{
  const fixture = createPrepared('sff-v2.1', 'unsafe');
  try {
    const controlPath = path.join(fixture.prepared.preparationDirectory, 'preparation-control.json'), controlBytes = fs.readFileSync(controlPath), originalOpen = fs.openSync, originalClose = fs.closeSync; let watched = null, replaced = false; fs.openSync = function(filename, ...args) { const fd = originalOpen.call(fs, filename, ...args); if (!replaced && path.resolve(String(filename)) === path.resolve(controlPath)) watched = fd; return fd; }; fs.closeSync = function(fd) { const result = originalClose.call(fs, fd); if (!replaced && fd === watched) { replaced = true; fs.unlinkSync(controlPath); fs.writeFileSync(controlPath, controlBytes); } return result; }; try { assert.throws(() => appendPreparedCreatorResultCheckpoint(fixture.command), /capsule.*changed|identity|changed during verification/i); assert.strictEqual(replaced, true); } finally { fs.openSync = originalOpen; fs.closeSync = originalClose; }
    const bundlePath = path.join(fixture.prepared.preparationDirectory, 'publication-bundle.bin'), alias = path.join(fixture.prepared.preparationDirectory, 'race-hardlink.keep'); watched = null; let linked = false; fs.openSync = function(filename, ...args) { const fd = originalOpen.call(fs, filename, ...args); if (!linked && path.resolve(String(filename)) === path.resolve(bundlePath)) watched = fd; return fd; }; fs.closeSync = function(fd) { const result = originalClose.call(fs, fd); if (!linked && fd === watched) { linked = true; fs.linkSync(bundlePath, alias); } return result; }; try { assert.throws(() => appendPreparedCreatorResultCheckpoint(fixture.command), /capsule.*changed|inventory|hard|linked/i); assert.strictEqual(linked, true); } finally { fs.openSync = originalOpen; fs.closeSync = originalClose; if (fs.existsSync(alias)) fs.unlinkSync(alias); }
    const foreign = path.join(fixture.locator.operationDirectory, 'foreign.keep'); fs.writeFileSync(foreign, 'sentinel'); const result = appendPreparedCreatorResultCheckpoint(fixture.command); assertReceipt(result, 'append-unsafe-or-ambiguous'); assert.strictEqual(result.vaultWritesMayHaveOccurred, false); assert.strictEqual(fs.readFileSync(foreign, 'utf8'), 'sentinel');
    assert.throws(() => appendPreparedCreatorResultCheckpoint({ commandId: COMMAND_ID, preparationLocator: { ...fixture.command.preparationLocator, expectedControlHash: h('tampered-unsafe-control') } }), /capsule|locator|authority|formula/i);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
}

{
  let traps = 0; const proxy = new Proxy({}, { ownKeys() { traps += 1; throw new Error('trap'); } }); assert.throws(() => appendPreparedCreatorResultCheckpoint(proxy), /plain non-proxy/); assert.strictEqual(traps, 0); const getter = {}; Object.defineProperty(getter, 'commandId', { enumerable: true, get() { traps += 1; throw new Error('getter'); } }); Object.defineProperty(getter, 'preparationLocator', { enumerable: true, value: {} }); assert.throws(() => appendPreparedCreatorResultCheckpoint(getter), /data property/); assert.strictEqual(traps, 0); assert.throws(() => appendPreparedCreatorResultCheckpoint({ commandId: 'wrong', preparationLocator: {} }), /commandId/);
}

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'sff_creator_prepared_result_checkpoint.js'), 'utf8');
assert(!/transactional_executor|executeCreatorAdoption|child_process|vscode|writeFileSync|renameSync|copyFileSync/.test(source));
assert(source.includes('appendCreatorOperationCheckpoint'));

console.log('sff_creator_prepared_result_checkpoint tests passed');
