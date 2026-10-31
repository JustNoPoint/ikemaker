'use strict';

const assert = require('assert');
const crypto = require('crypto');
const { createCreatorBuiltInLifecycleRuntime } = require('../src/sff_creator_builtin_lifecycle_runtime');

const H = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const locator = { operationDirectory: 'operation', expectedOperationId: H('operation'), expectedLatestCheckpointHash: H('result-head'), expectedVaultRoot: 'vault', manifestArtifactName: 'executing-result-captured-route-manifest', expectedManifestArtifactByteHash: H('result-manifest-bytes'), expectedManifestHash: H('result-manifest'), expectedManifestAuthorityHash: H('result-authority') };

for (const [outcomeClass, classification, expectedStatus] of [['committed-cleanup-required', 'RestartRecoveryRequired', 'restart-recovery-review-required'], ['manual-recovery-required', 'ManualRecoveryRequired', 'manual-inspection-export-only'], ['uncertain-failure', 'ManualRecoveryRequired', 'manual-inspection-export-only']]) {
  let reviewCalls = 0;
  const runtime = createCreatorBuiltInLifecycleRuntime({ globalStorageUri: { scheme: 'file', fsPath: 'global' } }, {
    createClassificationPlan(input) { assert.deepStrictEqual(input, locator); return { status: 'classification-append-ready-read-only', artifactBytes: Buffer.from('saved-plan'), artifactByteHash: H('saved-plan-bytes'), planHash: H('saved-plan') }; },
    commitClassification() { return { status: 'checkpoint-appended', operationId: locator.expectedOperationId, classification, expectedChildCheckpointHash: H(`child-${outcomeClass}`), manifestArtifactName: 'result-classification-route-manifest', manifestArtifactByteHash: H(`manifest-bytes-${outcomeClass}`), manifestHash: H(`manifest-${outcomeClass}`), manifestAuthorityHash: H(`authority-${outcomeClass}`) }; },
    readClassification() { return { classification, operationId: locator.expectedOperationId, auxiliaryPlan: { outcomeClass, allowedActions: ['manual-recovery-only'] } }; },
    reviewHost() { reviewCalls += 1; throw new Error('recovery classifications must never enter challenged history review'); }
  });
  const routed = runtime.classifyExecutionResult({ continuationLocator: locator });
  assert.strictEqual(routed.status, expectedStatus); assert.strictEqual(routed.classification, classification); assert.strictEqual(routed.historyReviewAvailable, false); assert.strictEqual(routed.resetDraft, false); assert.strictEqual(routed.writesAllowed, false); assert.strictEqual(reviewCalls, 0);
}

console.log('SFF Creator runtime keeps cleanup-required restart and manual/uncertain recovery classifications out of HistoryReview');
