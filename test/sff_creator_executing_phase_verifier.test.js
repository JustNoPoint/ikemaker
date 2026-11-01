'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const { hashCanonical } = require('../src/sff_capability_report');
const { appendCreatorOperationCheckpoint, readCreatorOperationVaultCheckpointSnapshot } = require('../src/sff_creator_operation_vault');
const { createCreatorExecutionOutcomeVerifierForTest } = require('../src/sff_creator_execution_outcome_verifier');
const { createCreatorExecutionResultCaptureForTest } = require('../src/sff_creator_execution_result_capture');
const { executeCreatorAdoption } = require('../src/sff_creator_transactional_executor');
const { INTENT_MANIFEST, RESULT_MANIFEST, createCreatorExecutingPhaseVerifierForTest, verifyCreatorExecutingPhaseFromVault } = require('../src/sff_creator_executing_phase_verifier');
const { createRealExecutingIntentFixture } = require('./helpers/sff_creator_executing_intent_fixture');

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const h = value => sha(Buffer.from(value));
const json = value => Buffer.from(`${JSON.stringify(value)}\n`);

const intentFixture = createRealExecutingIntentFixture('sff-v2.1', 'phase-intent');
try {
  const result = verifyCreatorExecutingPhaseFromVault(intentFixture.locator);
  assert.strictEqual(result.phase, 'ExecutionIntentRecorded');
  assert.strictEqual(result.evidenceClass, 'execution-intent-recorded-evidence');
  assert.strictEqual(result.observationClass, 'filesystem-read-only');
  assert.strictEqual(result.routeId, 'execution-approved-to-executing-intent-v1');
  assert.strictEqual(result.selectedManifestArtifactName, INTENT_MANIFEST);
  assert.strictEqual(result.currentStateGuaranteed, false);
  assert.strictEqual(result.classificationAllowed, false);
  assert.strictEqual(result.historyAllowed, false);
  assert.strictEqual(result.executionAuthorityGranted, false);
  assert(Object.values(result.effects).every(value => value === false));
  assert(Object.isFrozen(result) && Object.isFrozen(result.effects));
  assert.strictEqual(Object.values(result).some(value => typeof value === 'function'), false);
  assert.deepStrictEqual(Object.keys(result).sort(), ['activeParentSealHash', 'activePath', 'adapterId', 'backendId', 'candidateParentSealHash', 'candidatePath', 'classificationAllowed', 'currentStateGuaranteed', 'effects', 'evidenceClass', 'executionAllowed', 'executionAuthorityGranted', 'executionStarted', 'historyAllowed', 'historyRoot', 'historyRootSealHash', 'lifecycleState', 'observationClass', 'operationDirectory', 'operationId', 'phase', 'routeId', 'schema', 'selectedManifestArtifactByteHash', 'selectedManifestArtifactName', 'selectedManifestAuthorityHash', 'selectedManifestHash', 'semanticHeadRecordHash', 'snapshotAuthorityHash', 'status', 'targetId', 'underlyingVerificationHash', 'vaultRoot', 'vaultRootSealHash', 'version', 'workspaceId', 'workspaceRootSealHash', 'writesAllowed'].sort());
  assert.throws(() => verifyCreatorExecutingPhaseFromVault({ ...intentFixture.locator, expectedManifestHash: h('wrong-semantic-manifest') }), /manifest authority|drifted/i);
} finally { fs.rmSync(intentFixture.root, { recursive: true, force: true }); }

const resultFixture = createRealExecutingIntentFixture('sff-v2.1', 'phase-result');
try {
  const receipt = executeCreatorAdoption(resultFixture.executorInput, {}).receipt;
  const receiptBytes = json(receipt), outcomeInput = { executingIntentVaultLocator: resultFixture.locator, outcomeReceiptArtifactBytes: receiptBytes, expectedOutcomeReceiptArtifactByteHash: sha(receiptBytes), expectedOutcomeReceiptHash: hashCanonical(receipt) };
  const live = createCreatorExecutionOutcomeVerifierForTest({ hydrateIntent() { return resultFixture.intentVerification; }, readSnapshot(locator) { return readCreatorOperationVaultCheckpointSnapshot(locator); } })(outcomeInput);
  const plan = createCreatorExecutionResultCaptureForTest({ verifyOutcome() { return live; } })(outcomeInput);
  const child = appendCreatorOperationCheckpoint({ ...resultFixture.common, operationDirectory: resultFixture.locator.operationDirectory, expectedPreviousCheckpointHash: resultFixture.locator.expectedLatestCheckpointHash, mutationId: h('phase-result-capture'), lifecycleState: 'Executing', ...plan.copyAppendPayload() });
  const locator = { operationDirectory: resultFixture.locator.operationDirectory, expectedOperationId: resultFixture.locator.expectedOperationId, expectedLatestCheckpointHash: child.latestCheckpointHash, expectedVaultRoot: resultFixture.locator.expectedVaultRoot, manifestArtifactName: plan.manifestArtifactName, expectedManifestArtifactByteHash: plan.manifestArtifactByteHash, expectedManifestAuthorityHash: plan.manifestAuthorityHash, expectedManifestHash: plan.manifestHash };
  const result = verifyCreatorExecutingPhaseFromVault(locator);
  assert.strictEqual(result.phase, 'ResultCaptured');
  assert.strictEqual(result.evidenceClass, 'result-captured-evidence');
  assert.strictEqual(result.observationClass, 'filesystem-read-only');
  assert.strictEqual(result.routeId, 'executing-intent-to-result-captured-v1');
  assert.strictEqual(result.selectedManifestArtifactName, RESULT_MANIFEST);
  assert.strictEqual(result.semanticHeadRecordHash, child.latestCheckpointHash);
  assert.strictEqual(Object.values(result).some(value => typeof value === 'function'), false);
} finally { fs.rmSync(resultFixture.root, { recursive: true, force: true }); }

function fakeAuthority(rootNames) {
  const artifacts = rootNames.map(name => ({ name, byteHash: h(`${name}-bytes`), byteLength: 10, authorityHash: h(`${name}-authority`), path: `C:\\vault\\${name}`, identity: { device: '1', inode: name } }));
  const seal = { path: 'C:\\vault', realpath: 'C:\\vault', device: '1', identity: { device: '1', inode: '1' }, fingerprint: 'fixture' };
  return { lifecycleState: 'Executing', operationId: h('operation'), workspaceId: h('workspace'), targetId: 'sff-v2.1', backendId: 'builtin-js', adapterId: 'builtin-sff-v2.1', activePath: 'C:\\active.sff', candidatePath: 'C:\\candidate.sff', historyRoot: 'C:\\history', semanticHeadRecordHash: h('head'), vaultRootSeal: seal, workspaceRootSeal: seal, activeParentSeal: seal, candidateParentSeal: seal, historyRootSeal: seal, artifacts, binaries: [], artifactAuthorities: rootNames.map(name => ({ name, hash: h(`${name}-authority`) })) };
}
function fakeLocator(name = INTENT_MANIFEST) { return { operationDirectory: 'C:\\vault\\op', expectedOperationId: h('operation'), expectedLatestCheckpointHash: h('head'), expectedVaultRoot: 'C:\\vault', manifestArtifactName: name, expectedManifestArtifactByteHash: h(`${name}-bytes`), expectedManifestAuthorityHash: h(`${name}-authority`), expectedManifestHash: h(`${name}-manifest`) }; }
function fakeVerification(copyName, routeId, authority) { return { schema: 'ikemaker.sff-creator-lifecycle-route-verification', version: 1, status: 'verified', lifecycleState: 'Executing', routeId, operationId: authority.operationId, semanticHeadRecordHash: authority.semanticHeadRecordHash, executionIntentReceipt: {}, executionIntentReceiptHash: h('intent-receipt'), executorAuthorityDescriptor: {}, executorAuthorityDescriptorHash: h('descriptor'), observationClass: 'filesystem-read-only', currentStateGuaranteed: false, effects: { writes: false }, [copyName]() { return {}; } }; }
function verifierFor(authority, after = authority) { let reads = 0; return createCreatorExecutingPhaseVerifierForTest({ readSnapshot() { return { authority: reads++ === 0 ? authority : after }; }, verifyIntent() { return fakeVerification('copyExecutorInput', 'execution-approved-to-executing-intent-v1', authority); }, verifyResult() { return fakeVerification('copySavedOutcomeEvidence', 'executing-intent-to-result-captured-v1', authority); } }); }

assert.throws(() => verifierFor(fakeAuthority([]))(fakeLocator()), /XOR/i);
assert.throws(() => verifierFor(fakeAuthority([INTENT_MANIFEST, RESULT_MANIFEST]))(fakeLocator()), /XOR/i);
assert.throws(() => verifierFor(fakeAuthority([INTENT_MANIFEST]))(fakeLocator(RESULT_MANIFEST)), /selected phase-root/i);
{ const authority = fakeAuthority([INTENT_MANIFEST]); authority.artifacts.push({ ...authority.artifacts[0] }); assert.throws(() => verifierFor(authority)(fakeLocator()), /XOR/i); }
{ const authority = fakeAuthority([INTENT_MANIFEST]); authority.artifactAuthorities.push({ ...authority.artifactAuthorities[0] }); assert.throws(() => verifierFor(authority)(fakeLocator()), /XOR/i); }
{ const authority = fakeAuthority([INTENT_MANIFEST]); authority.artifactAuthorities = []; assert.throws(() => verifierFor(authority)(fakeLocator()), /XOR/i); }
{ const authority = fakeAuthority([INTENT_MANIFEST]); authority.artifactAuthorities[0].hash = h('wrong'); assert.throws(() => verifierFor(authority)(fakeLocator()), /named authority drifted/i); }
{ const authority = fakeAuthority([INTENT_MANIFEST]); authority.artifacts[0].byteHash = h('wrong'); assert.throws(() => verifierFor(authority)(fakeLocator()), /descriptor or named authority drifted/i); }
{ const authority = fakeAuthority([INTENT_MANIFEST]), after = JSON.parse(JSON.stringify(authority)); after.workspaceId = h('drift'); assert.throws(() => verifierFor(authority, after)(fakeLocator()), /changed during/i); }
{ const locator = fakeLocator(); locator.extra = true; assert.throws(() => verifierFor(fakeAuthority([INTENT_MANIFEST]))(locator), /fields drifted/i); }
{ const locator = fakeLocator(); locator[Symbol('extra')] = true; assert.throws(() => verifierFor(fakeAuthority([INTENT_MANIFEST]))(locator), /plain closed object/i); }
{ const locator = fakeLocator(); Object.defineProperty(locator, 'hidden', { value: true }); assert.throws(() => verifierFor(fakeAuthority([INTENT_MANIFEST]))(locator), /fields drifted/i); }
{ const locator = fakeLocator(); Object.defineProperty(locator, 'manifestArtifactName', { enumerable: true, get() { throw new Error('getter executed'); } }); assert.throws(() => verifierFor(fakeAuthority([INTENT_MANIFEST]))(locator), /data property/i); }

console.log('SFF Creator Executing phase verifier validates exact intent/result phase roots read-only');
