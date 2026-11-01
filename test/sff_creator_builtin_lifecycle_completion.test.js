'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createCreatorBuiltInLifecycleRuntime } = require('../src/sff_creator_builtin_lifecycle_runtime');

const h = value => crypto.createHash('sha256').update(value).digest('hex');
const reviewLocator = root => ({ operationDirectory: path.join(root, 'operation'), expectedOperationId: h('operation'), expectedLatestCheckpointHash: h('history-review'), expectedVaultRoot: root, manifestArtifactName: 'history-review-route-manifest', expectedManifestArtifactByteHash: h('manifest-bytes'), expectedManifestHash: h('manifest'), expectedManifestAuthorityHash: h('manifest-authority') });

function dependencies(root, overrides = {}) {
  const locator = reviewLocator(root), completedCheckpointHash = h('completed'), approvalHash = h('approval'), writerHash = h('writer'), recordHash = h('record');
  return {
    readHistoryApproval() { return { operationId: locator.expectedOperationId, historyApprovalReceiptHash: approvalHash }; },
    commitCompleted() { return { status: 'completed', operationId: locator.expectedOperationId, historyReviewCheckpointHash: locator.expectedLatestCheckpointHash, completedCheckpointHash, writerReceiptHash: writerHash, capsuleCleanupCompleted: true, historyAppended: true }; },
    verifyCompleted(input) { assert.strictEqual(input.expectedLatestCheckpointHash, completedCheckpointHash); return { operationId: locator.expectedOperationId, semanticHeadRecordHash: completedCheckpointHash, historyReviewCheckpointHash: locator.expectedLatestCheckpointHash, historyAppended: true, completedAuthoritative: true, writerReceiptHash: writerHash, historyApprovalReceiptHash: approvalHash, historyRecordHash: recordHash, verificationHash: h('verification') }; },
    readSnapshot() { return { authority: { artifacts: [{ name: locator.manifestArtifactName, byteHash: locator.expectedManifestArtifactByteHash }], artifactAuthorities: [{ name: locator.manifestArtifactName, hash: locator.expectedManifestAuthorityHash }], chain: [{ recordHash: h('older') }, { recordHash: locator.expectedLatestCheckpointHash }, { recordHash: completedCheckpointHash }] }, readArtifactBytes() { return Buffer.from(JSON.stringify({ manifestHash: locator.expectedManifestHash })); } }; },
    routeLifecycleStartup() { return { status: 'completed-cleanup-recorded' }; },
    ...overrides
  };
}

function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-runtime-completion-'));
  try {
    const locator = reviewLocator(root), runtime = createCreatorBuiltInLifecycleRuntime({ globalStorageUri: { fsPath: root } }, dependencies(root)), completed = runtime.completeApprovedHistory({ continuationLocator: locator });
    assert.strictEqual(completed.status, 'completed-authoritative'); assert.strictEqual(completed.resetDraft, true); assert.strictEqual(completed.historyAppended, true); assert.strictEqual(completed.capsuleCleanupCompleted, true);

    const cleanupRuntime = createCreatorBuiltInLifecycleRuntime({ globalStorageUri: { fsPath: root } }, dependencies(root, { commitCompleted() { return { status: 'completed-cleanup-required', operationId: locator.expectedOperationId, historyReviewCheckpointHash: locator.expectedLatestCheckpointHash, completedCheckpointHash: h('completed'), writerReceiptHash: h('writer'), capsuleCleanupCompleted: false, historyAppended: true }; }, routeLifecycleStartup() { return { status: 'completed-cleanup-required' }; } })), cleanup = cleanupRuntime.completeApprovedHistory({ continuationLocator: locator });
    assert.strictEqual(cleanup.status, 'completed-cleanup-required'); assert.strictEqual(cleanup.resetDraft, false); assert.strictEqual(cleanup.capsuleCleanupCompleted, false);
    const cleanupRetry = createCreatorBuiltInLifecycleRuntime({ globalStorageUri: { fsPath: root } }, dependencies(root, { readHistoryApproval() { throw new Error('head is already Completed'); }, commitCompleted(input) { assert.strictEqual(input.historyReviewVaultLocator.expectedLatestCheckpointHash, locator.expectedLatestCheckpointHash); return { status: 'completed', operationId: locator.expectedOperationId, historyReviewCheckpointHash: locator.expectedLatestCheckpointHash, completedCheckpointHash: h('completed'), writerReceiptHash: h('writer'), capsuleCleanupCompleted: true, historyAppended: true }; } })).completeApprovedHistory({ continuationLocator: cleanup.continuationLocator });
    assert.strictEqual(cleanupRetry.status, 'completed-authoritative'); assert.strictEqual(cleanupRetry.resetDraft, true);
    const missingCleanupProof = createCreatorBuiltInLifecycleRuntime({ globalStorageUri: { fsPath: root } }, dependencies(root, { routeLifecycleStartup() { return { status: 'completed-authoritative' }; } })).completeApprovedHistory({ continuationLocator: locator });
    assert.strictEqual(missingCleanupProof.status, 'completed-cleanup-required'); assert.strictEqual(missingCleanupProof.resetDraft, false);

    const driftRuntime = createCreatorBuiltInLifecycleRuntime({ globalStorageUri: { fsPath: root } }, dependencies(root, { verifyCompleted() { throw new Error('injected saved Completed verification failure'); } }));
    assert.throws(() => driftRuntime.completeApprovedHistory({ continuationLocator: locator }), /saved Completed verification failure/);
    const writerFailure = createCreatorBuiltInLifecycleRuntime({ globalStorageUri: { fsPath: root } }, dependencies(root, { commitCompleted() { throw new Error('injected history writer failure'); } }));
    assert.throws(() => writerFailure.completeApprovedHistory({ continuationLocator: locator }), /history writer failure/);
    console.log('sff_creator_builtin_lifecycle_completion.test.js: verified Completed and cleanup are both required before resetDraft');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

main();
