'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const { hashCanonical } = require('../src/sff_capability_report');
const { createCreatorCommandGatePlan } = require('../src/sff_creator_command_gate');
const { createCreatorExecutionDispatchAuthority, createCreatorExecutionDispatchAuthorityForTest } = require('../src/sff_creator_execution_dispatch_authority');
const { verifyCreatorExecutingPhaseFromVault } = require('../src/sff_creator_executing_phase_verifier');
const { readCreatorOperationVaultCheckpointSnapshot, appendCreatorOperationCheckpoint } = require('../src/sff_creator_operation_vault');
const { createCreatorExecutionOutcomeVerifierForTest } = require('../src/sff_creator_execution_outcome_verifier');
const { createCreatorExecutionResultCaptureForTest } = require('../src/sff_creator_execution_result_capture');
const { executeCreatorAdoption } = require('../src/sff_creator_transactional_executor');
const { createRealExecutingIntentFixture } = require('./helpers/sff_creator_executing_intent_fixture');

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const h = value => sha(Buffer.from(value));
const json = value => Buffer.from(`${JSON.stringify(value)}\n`);
const request = (fixture, attempt = h('attempt')) => { const gate = createCreatorCommandGatePlan({ commandId: 'execute-approved-intent', executingIntentVaultLocator: fixture.locator }); return { commandId: 'execute-approved-intent', executingIntentVaultLocator: fixture.locator, expectedCommandGatePlanHash: gate.commandGatePlanHash, executionAttemptId: attempt }; };

for (const target of ['sff-v1', 'sff-v2.0', 'sff-v2.1']) {
  const fixture = createRealExecutingIntentFixture(target, `dispatch-${target}`);
  try {
    const before = fs.readdirSync(fixture.locator.operationDirectory).sort(), result = createCreatorExecutionDispatchAuthority(request(fixture));
    assert.strictEqual(result.selection.targetId, target);
    assert.strictEqual(result.status, 'eligible-at-observation');
    assert.strictEqual(result.version, 2); assert.strictEqual(result.attemptAuthority.version, 2);
    assert.strictEqual(result.observationClass, 'filesystem-read-only');
    assert.strictEqual(result.executionAuthorityGranted, false);
    assert.strictEqual(result.executionAllowed, false);
    assert.strictEqual(result.executionStarted, false);
    assert.strictEqual(result.writesAllowed, false);
    assert.strictEqual(result.executorInputTreatment, 'unexecuted-retained-authority-not-readiness-validation');
    assert.strictEqual(result.executionAttemptAuthorityHash, hashCanonical(result.attemptAuthority));
    assert.deepStrictEqual(Object.keys(result.attemptAuthority).sort(), ['commandGatePlanHash', 'commandId', 'executionAttemptId', 'executorAuthorityDescriptorHash', 'executorInputAuthorityComparisonHash', 'liveIntentReadinessVerificationHash', 'locatorAuthority', 'operationId', 'phaseVerificationHash', 'retainedIntentAuthorityVerificationHash', 'selection', 'semanticHeadRecordHash', 'snapshotAuthorityHash', 'version', 'domain'].sort());
    assert.strictEqual(result.liveIntentReadinessVerificationHash, hashCanonical(Object.fromEntries(Object.entries(fixture.liveIntentVerification).filter(([key]) => key !== 'copyExecutorInput'))));
    assert.strictEqual(result.retainedIntentAuthorityVerificationHash, hashCanonical(Object.fromEntries(Object.entries(fixture.intentVerification).filter(([key]) => key !== 'copyExecutorInput'))));
    assert.notStrictEqual(result.liveIntentReadinessVerificationHash, result.retainedIntentAuthorityVerificationHash);
    assert(Object.values(result.effects).every(value => value === false));
    assert(Object.isFrozen(result) && Object.isFrozen(result.selection) && Object.isFrozen(result.effects));
    assert.strictEqual(JSON.stringify(result).includes('executionLayoutApprovalInput'), false);
    assert.deepStrictEqual(fs.readdirSync(fixture.locator.operationDirectory).sort(), before);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
}

const fixture = createRealExecutingIntentFixture('sff-v2.1', 'dispatch-adversarial');
try {
  const baseRequest = request(fixture, h('attempt-a')), gate = createCreatorCommandGatePlan({ commandId: baseRequest.commandId, executingIntentVaultLocator: fixture.locator }), phase = verifyCreatorExecutingPhaseFromVault(fixture.locator);
  let copies = 0;
  const wrappedIntent = { ...fixture.intentVerification, copyExecutorInput() { copies += 1; return fixture.intentVerification.copyExecutorInput(); } };
  const verifier = createCreatorExecutionDispatchAuthorityForTest({ createGate() { return gate; }, readSnapshot(locator) { return readCreatorOperationVaultCheckpointSnapshot(locator); }, verifyPhase() { return phase; }, verifyIntent() { return wrappedIntent; } });
  const first = verifier(baseRequest), second = verifier(baseRequest), changed = verifier({ ...baseRequest, executionAttemptId: h('attempt-b') });
  assert.strictEqual(copies, 6);
  assert.strictEqual(first.executionAttemptAuthorityHash, second.executionAttemptAuthorityHash);
  assert.notStrictEqual(first.executionAttemptAuthorityHash, changed.executionAttemptAuthorityHash);
  assert.deepStrictEqual(first.attemptAuthority, second.attemptAuthority);
  assert.strictEqual(first.executionAttemptAuthorityHash, hashCanonical(first.attemptAuthority));
  let liveCopies = 0, retainedCopies = 0;
  const dual = createCreatorExecutionDispatchAuthorityForTest({ createGate() { return gate; }, readSnapshot(locator) { return readCreatorOperationVaultCheckpointSnapshot(locator); }, verifyPhase() { return phase; }, verifyLiveIntent() { return { ...fixture.liveIntentVerification, copyExecutorInput() { liveCopies += 1; return fixture.liveIntentVerification.copyExecutorInput(); } }; }, verifyRetainedIntent() { return { ...fixture.intentVerification, copyExecutorInput() { retainedCopies += 1; return fixture.intentVerification.copyExecutorInput(); } }; } });
  dual(baseRequest); assert.strictEqual(liveCopies, 1); assert.strictEqual(retainedCopies, 1);
  const mismatchedNested = createCreatorExecutionDispatchAuthorityForTest({ createGate() { return gate; }, readSnapshot(locator) { return readCreatorOperationVaultCheckpointSnapshot(locator); }, verifyPhase() { return phase; }, verifyLiveIntent() { return fixture.liveIntentVerification; }, verifyRetainedIntent() { return { ...fixture.intentVerification, copyExecutorInput() { const value = fixture.intentVerification.copyExecutorInput(); value.executionLayoutApprovalInput.executionLayoutPlanInput.operationId = h('nested-mismatch'); return value; } }; } });
  assert.throws(() => mismatchedNested(baseRequest), /live\/retained executor input authority comparison drifted/i);
  for (const key of Object.keys(first.attemptAuthority)) {
    const tampered = JSON.parse(JSON.stringify(first.attemptAuthority));
    if (typeof tampered[key] === 'number') tampered[key] += 1;
    else if (typeof tampered[key] === 'string') tampered[key] += '-tampered';
    else tampered[key] = { ...tampered[key], tampered: true };
    assert.notStrictEqual(hashCanonical(tampered), first.executionAttemptAuthorityHash, key);
  }
  const inspect = value => { if (!value || typeof value !== 'object') return; assert.strictEqual(Buffer.isBuffer(value) || ArrayBuffer.isView(value), false); for (const child of Object.values(value)) { assert.notStrictEqual(typeof child, 'function'); inspect(child); } };
  inspect(first.attemptAuthority);
  assert.throws(() => verifier({ ...baseRequest, expectedCommandGatePlanHash: h('wrong-gate') }), /optimistic assertion/i);
  assert.throws(() => verifier({ ...baseRequest, executionAttemptId: 'ABC' }), /nonce is invalid/i);
  assert.throws(() => verifier({ ...baseRequest, extra: true }), /closed fields/i);
  assert.throws(() => verifier(new Proxy(baseRequest, { getOwnPropertyDescriptor() { throw new Error('proxy trap ran'); } })), /plain non-proxy/i);
  { const hostile = { ...baseRequest }; Object.defineProperty(hostile, 'commandId', { enumerable: true, get() { throw new Error('getter ran'); } }); assert.throws(() => verifier(hostile), /data property/i); }
  { const hostile = { ...baseRequest, executingIntentVaultLocator: { ...fixture.locator, extra: true } }; assert.throws(() => verifier(hostile), /closed fields/i); }
  const badPhase = createCreatorExecutionDispatchAuthorityForTest({ createGate() { return gate; }, readSnapshot(locator) { return readCreatorOperationVaultCheckpointSnapshot(locator); }, verifyPhase() { return { ...phase, phase: 'ResultCaptured', evidenceClass: 'result-captured-evidence' }; }, verifyIntent() { return wrappedIntent; } });
  assert.throws(() => badPhase(baseRequest), /not exact ExecutionIntentRecorded/i);
  const badInput = createCreatorExecutionDispatchAuthorityForTest({ createGate() { return gate; }, readSnapshot(locator) { return readCreatorOperationVaultCheckpointSnapshot(locator); }, verifyPhase() { return phase; }, verifyIntent() { return { ...fixture.intentVerification, copyExecutorInput() { const value = fixture.intentVerification.copyExecutorInput(); value.expectedCandidateByteHash = h('tampered'); return value; } }; } });
  assert.throws(() => badInput(baseRequest), /not bound to the retained descriptor/i);
  const badReceiptBytes = createCreatorExecutionDispatchAuthorityForTest({ createGate() { return gate; }, readSnapshot(locator) { return readCreatorOperationVaultCheckpointSnapshot(locator); }, verifyPhase() { return phase; }, verifyIntent() { return { ...fixture.intentVerification, copyExecutorInput() { const value = fixture.intentVerification.copyExecutorInput(); value.executionLayoutApprovalReceiptArtifactBytes = Buffer.from(value.executionLayoutApprovalReceiptArtifactBytes); value.executionLayoutApprovalReceiptArtifactBytes[0] ^= 0xff; return value; } }; } });
  assert.throws(() => badReceiptBytes(baseRequest), /approval receipt artifact bytes drifted/i);
  for (const [tag, mutate] of [
    ['schema', descriptor => { descriptor.schema = 'ikemaker.attacker-descriptor'; }],
    ['version', descriptor => { descriptor.version = 2; }],
    ['input-projection', descriptor => { descriptor.projection.executionLayoutApprovalInput = 'caller-supplied'; }],
    ['receipt-projection', descriptor => { descriptor.projection.executionLayoutApprovalReceiptArtifactBytes = 'caller-supplied'; }]
  ]) {
    const alteredDescriptor = JSON.parse(JSON.stringify(fixture.intentVerification.executorAuthorityDescriptor));
    mutate(alteredDescriptor);
    const alteredVerification = { ...fixture.intentVerification, executorAuthorityDescriptor: alteredDescriptor, executorAuthorityDescriptorHash: hashCanonical(alteredDescriptor), copyExecutorInput() { return fixture.intentVerification.copyExecutorInput(); } };
    const altered = createCreatorExecutionDispatchAuthorityForTest({ createGate() { return gate; }, readSnapshot(locator) { return readCreatorOperationVaultCheckpointSnapshot(locator); }, verifyPhase() { return phase; }, verifyIntent() { return alteredVerification; } });
    assert.throws(() => altered(baseRequest), /descriptor fixed contract/i, tag);
  }
  const missingInput = createCreatorExecutionDispatchAuthorityForTest({ createGate() { return gate; }, readSnapshot(locator) { return readCreatorOperationVaultCheckpointSnapshot(locator); }, verifyPhase() { return phase; }, verifyIntent() { return { ...fixture.intentVerification, copyExecutorInput() { const value = fixture.intentVerification.copyExecutorInput(); delete value.expectedCandidateByteHash; return value; } }; } });
  assert.throws(() => missingInput(baseRequest), /exactly the closed fields/i);
  const extraInput = createCreatorExecutionDispatchAuthorityForTest({ createGate() { return gate; }, readSnapshot(locator) { return readCreatorOperationVaultCheckpointSnapshot(locator); }, verifyPhase() { return phase; }, verifyIntent() { return { ...fixture.intentVerification, copyExecutorInput() { return { ...fixture.intentVerification.copyExecutorInput(), extra: true }; } }; } });
  assert.throws(() => extraInput(baseRequest), /exactly the closed fields/i);
  const wrongOperationGate = { ...gate, operationId: h('other-operation') };
  assert.throws(() => createCreatorExecutionDispatchAuthorityForTest({ createGate() { return wrongOperationGate; }, readSnapshot(locator) { return readCreatorOperationVaultCheckpointSnapshot(locator); }, verifyPhase() { return phase; }, verifyIntent() { return wrappedIntent; } })(baseRequest), /operation, head, or descriptor authority/i);
  const wrongHeadGate = { ...gate, locatorAuthority: { ...gate.locatorAuthority, semanticHeadRecordHash: h('other-head') } };
  assert.throws(() => createCreatorExecutionDispatchAuthorityForTest({ createGate() { return wrongHeadGate; }, readSnapshot(locator) { return readCreatorOperationVaultCheckpointSnapshot(locator); }, verifyPhase() { return phase; }, verifyIntent() { return wrappedIntent; } })(baseRequest), /operation, head, or descriptor authority/i);
  const wrongTripleGate = { ...gate, selection: { ...gate.selection, adapterId: 'external-adapter' } };
  assert.throws(() => createCreatorExecutionDispatchAuthorityForTest({ createGate() { return wrongTripleGate; }, readSnapshot(locator) { return readCreatorOperationVaultCheckpointSnapshot(locator); }, verifyPhase() { return phase; }, verifyIntent() { return wrappedIntent; } })(baseRequest), /exact allowed built-in route/i);
  const externalRoute = createCreatorExecutionDispatchAuthorityForTest({ createGate() { return gate; }, readSnapshot(locator) { const snapshot = readCreatorOperationVaultCheckpointSnapshot(locator); return { ...snapshot, authority: { ...snapshot.authority, targetId: 'external-vendor' } }; }, verifyPhase() { return phase; }, verifyIntent() { return wrappedIntent; } });
  assert.throws(() => externalRoute(baseRequest), /allowed built-in route/i);
  let reads = 0;
  const drift = createCreatorExecutionDispatchAuthorityForTest({ createGate() { return gate; }, readSnapshot(locator) { const snapshot = readCreatorOperationVaultCheckpointSnapshot(locator); if (reads++ === 1) return { ...snapshot, authority: { ...snapshot.authority, workspaceId: h('drift') } }; return snapshot; }, verifyPhase() { return phase; }, verifyIntent() { return wrappedIntent; } });
  assert.throws(() => drift(baseRequest), /changed during/i);
} finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }

const resultFixture = createRealExecutingIntentFixture('sff-v2.1', 'dispatch-result-phase');
try {
  const receipt = executeCreatorAdoption(resultFixture.executorInput, {}).receipt, bytes = json(receipt), outcomeInput = { executingIntentVaultLocator: resultFixture.locator, outcomeReceiptArtifactBytes: bytes, expectedOutcomeReceiptArtifactByteHash: sha(bytes), expectedOutcomeReceiptHash: hashCanonical(receipt) };
  const live = createCreatorExecutionOutcomeVerifierForTest({ hydrateIntent() { return resultFixture.intentVerification; }, readSnapshot(locator) { return readCreatorOperationVaultCheckpointSnapshot(locator); } })(outcomeInput);
  const plan = createCreatorExecutionResultCaptureForTest({ verifyOutcome() { return live; } })(outcomeInput), child = appendCreatorOperationCheckpoint({ ...resultFixture.common, operationDirectory: resultFixture.locator.operationDirectory, expectedPreviousCheckpointHash: resultFixture.locator.expectedLatestCheckpointHash, mutationId: h('dispatch-result-child'), lifecycleState: 'Executing', ...plan.copyAppendPayload() }), locator = { operationDirectory: resultFixture.locator.operationDirectory, expectedOperationId: resultFixture.locator.expectedOperationId, expectedLatestCheckpointHash: child.latestCheckpointHash, expectedVaultRoot: resultFixture.locator.expectedVaultRoot, manifestArtifactName: plan.manifestArtifactName, expectedManifestArtifactByteHash: plan.manifestArtifactByteHash, expectedManifestAuthorityHash: plan.manifestAuthorityHash, expectedManifestHash: plan.manifestHash };
  const gateHash = h('optimistic-only');
  assert.throws(() => createCreatorExecutionDispatchAuthority({ commandId: 'execute-approved-intent', executingIntentVaultLocator: locator, expectedCommandGatePlanHash: gateHash, executionAttemptId: h('attempt') }), /manifest name|ExecutionIntentRecorded|phase/i);
} finally { fs.rmSync(resultFixture.root, { recursive: true, force: true }); }

console.log('SFF Creator execution dispatch authority derives read-only nonce-bound intent authority');
