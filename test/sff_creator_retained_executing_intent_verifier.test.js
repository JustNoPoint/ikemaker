'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { hashCanonical } = require('../src/sff_capability_report');
const { verifyRetainedCreatorExecutingIntentFromVault } = require('../src/sff_creator_retained_executing_intent_verifier');
const { verifyCreatorExecutingIntentRouteBridgeFromVault } = require('../src/sff_creator_lifecycle_route_bridge');
const { verifyCreatorExecutionOutcome } = require('../src/sff_creator_execution_outcome_verifier');
const { createCreatorExecutionResultCapture } = require('../src/sff_creator_execution_result_capture');
const { executeCreatorAdoption } = require('../src/sff_creator_transactional_executor');
const { createRealExecutingIntentFixture } = require('./helpers/sff_creator_executing_intent_fixture');

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(`${JSON.stringify(value)}\n`);
function outcomeInput(fixture, receipt) { const bytes = json(receipt); return { executingIntentVaultLocator: fixture.locator, outcomeReceiptArtifactBytes: bytes, expectedOutcomeReceiptArtifactByteHash: sha(bytes), expectedOutcomeReceiptHash: hashCanonical(receipt) }; }

for (const targetId of ['sff-v1', 'sff-v2.0', 'sff-v2.1']) {
  const fixture = createRealExecutingIntentFixture(targetId, `retained-${targetId}`);
  try {
    const before = verifyRetainedCreatorExecutingIntentFromVault(fixture.locator), copy1 = before.copyExecutorInput(), copy2 = before.copyExecutorInput();
    assert.strictEqual(before.schema, 'ikemaker.sff-creator-retained-executing-intent-verification');
    assert.strictEqual(before.phase, 'ExecutionIntentRecorded'); assert.strictEqual(before.historicalAuthorityOnly, true); assert.strictEqual(before.executionReadinessValidated, false); assert.strictEqual(before.currentStateGuaranteed, false); assert(Object.values(before.effects).every(value => value === false)); assert(Object.isFrozen(before));
    copy1.executionLayoutApprovalInput.executionLayoutPlanInput = { changed: true }; copy1.executionLayoutApprovalReceiptArtifactBytes[0] ^= 0xff; assert.notDeepStrictEqual(copy1.executionLayoutApprovalInput, copy2.executionLayoutApprovalInput); assert.notStrictEqual(copy1.executionLayoutApprovalReceiptArtifactBytes[0], copy2.executionLayoutApprovalReceiptArtifactBytes[0]);
    const receipt = executeCreatorAdoption(fixture.executorInput, {}).receipt;
    assert.throws(() => verifyCreatorExecutingIntentRouteBridgeFromVault(fixture.locator), /active archive observation drifted|current|drifted/i, 'live verifier must retain its current-state semantics');
    const historical = verifyRetainedCreatorExecutingIntentFromVault(fixture.locator); assert.strictEqual(historical.executionIntentReceiptHash, before.executionIntentReceiptHash);
    const input = outcomeInput(fixture, receipt), verified = verifyCreatorExecutionOutcome(input); assert.strictEqual(verified.outcomeClass, 'committed'); assert.strictEqual(verified.parentExecutingIntentVerificationHash, hashCanonical(Object.fromEntries(Object.entries(historical).filter(([key]) => key !== 'copyExecutorInput'))));
    const capture = createCreatorExecutionResultCapture(input); assert.strictEqual(capture.status, 'append-ready'); assert.strictEqual(capture.manifest.outcomeClass, 'committed');
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
}

{
  const fixture = createRealExecutingIntentFixture('sff-v2.1', 'retained-no-live-files');
  try {
    fs.unlinkSync(fixture.common.activePath); fs.unlinkSync(fixture.common.candidatePath);
    const retained = verifyRetainedCreatorExecutingIntentFromVault(fixture.locator); assert.strictEqual(retained.status, 'verified');
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
}

{
  const fixture = createRealExecutingIntentFixture('sff-v2.1', 'retained-wrong-backup');
  try {
    const receipt = executeCreatorAdoption(fixture.executorInput, {}).receipt, approval = JSON.parse(fixture.executorInput.executionLayoutApprovalReceiptArtifactBytes);
    fs.writeFileSync(approval.paths.backupPath, Buffer.from('wrong-backup'));
    assert.throws(() => verifyCreatorExecutionOutcome(outcomeInput(fixture, receipt)), /backup|authority|bytes/i);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
}

{
  const fixture = createRealExecutingIntentFixture('sff-v2.1', 'retained-boundary');
  try {
    let traps = 0; const proxy = new Proxy({}, { ownKeys() { traps += 1; throw new Error('trap'); } }); assert.throws(() => verifyRetainedCreatorExecutingIntentFromVault(proxy), /non-Proxy/); assert.strictEqual(traps, 0);
    const getter = { ...fixture.locator }; Object.defineProperty(getter, 'expectedManifestHash', { enumerable: true, get() { traps += 1; throw new Error('getter'); } }); assert.throws(() => verifyRetainedCreatorExecutingIntentFromVault(getter), /data property/); assert.strictEqual(traps, 0);
    assert.throws(() => verifyRetainedCreatorExecutingIntentFromVault({ ...fixture.locator, extra: true }), /fields drifted/);
    assert.throws(() => verifyRetainedCreatorExecutingIntentFromVault({ ...fixture.locator, expectedLatestCheckpointHash: sha(Buffer.from('wrong-head')) }), /head|drift/i);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
}

{
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'sff_creator_retained_executing_intent_verifier.js'), 'utf8');
  assert(!/readFileSync|writeFile|appendFile|renameSync|unlinkSync|child_process|vscode|executeCreatorAdoption/.test(source));
}

console.log('sff_creator_retained_executing_intent_verifier tests passed');
