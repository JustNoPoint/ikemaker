'use strict';

const assert = require('assert');
const crypto = require('crypto');
const { CONFIRMATION_KEYS } = require('../src/sff_creator_target_projection_approval');
const { approveRetainedTargetProjection, createVscodeTargetReviewUi, labelFor, runTargetProjectionReview, targetApprovalDecision } = require('../src/sff_creator_production_review_ui');

const h = value => crypto.createHash('sha256').update(value).digest('hex');
const plan = {
  planHash: h('plan'), sourceArtifactByteHash: h('source'), legacySpecificationHash: h('legacy'),
  selection: { targetId: 'sff-v2.1', backendId: 'ikemaker-builtin-sff-v21-png8-prerelease', adapter: { id: 'builtin-v21-png8', version: 1 } },
  conversions: [{ id: 'palette-layout' }, { id: 'sprite-order' }, { id: 'palette-layout' }],
  mandatoryAcknowledgements: [{ id: 'source-order', accepted: true }, { id: 'optional-note', accepted: false }]
};
const planBytes = Buffer.from(`${JSON.stringify(plan)}\n`);

function fixture(cancelAt = 0, approve = true) {
  const calls = [], head = h('head'), token = h('token');
  const rows = ['confirmation:sourceSnapshots', 'conversion:palette-layout', 'risk:representation-change'].map((id, index) => ({ id, challengeToken: h(`challenge-${index}`) }));
  const started = { status: 'target-review-required', operationId: h('operation'), continuationLocator: { expectedOperationId: h('operation') }, review: { stage: 'target-projection', expectedHeadHash: head, actionToken: token, rows, summary: { selection: plan.selection } } };
  const retainedLocator = { expectedOperationId: h('operation'), expectedLatestCheckpointHash: h('retained') };
  const runtime = {
    acknowledgeReview(input) { calls.push(['ack', input.confirmationId]); return { status: 'acknowledged' }; },
    cancelReview() { calls.push(['cancel']); return { status: 'cancelled' }; },
    recordReview() { calls.push(['record']); return { status: 'target-review-retained-next-transition-unavailable', operationId: h('operation'), continuationLocator: retainedLocator, retained: { planArtifactBytes: Buffer.from(planBytes), planHash: plan.planHash } }; },
    readRetainedTargetPlan() { calls.push(['read-plan']); return { status: 'retained-target-plan', operationId: h('operation'), continuationLocator: retainedLocator, planArtifactBytes: Buffer.from(planBytes), planHash: plan.planHash }; },
    approveTargetProjection(input) { calls.push(['approve', input]); return { status: 'projection-approved-next-transition-unavailable', continuationLocator: { expectedLatestCheckpointHash: h('approved') }, resetDraft: false, writesAllowed: false }; }
  };
  const ui = {
    async confirmReviewRow(input) { calls.push(['prompt', input.id]); return cancelAt !== input.position; },
    async confirmApproval(input) { calls.push(['final', input.planHash]); return approve; }
  };
  return { calls, runtime, started, ui, retainedLocator };
}

(async () => {
  const decision = targetApprovalDecision(planBytes);
  assert.strictEqual(decision.projectionArtifactByteHash, h(planBytes));
  assert.deepStrictEqual(decision.reviewedConversionIds, ['palette-layout', 'sprite-order']);
  assert.deepStrictEqual(decision.acceptedMandatoryAcknowledgementIds, ['source-order']);
  assert.deepStrictEqual(decision.confirmations, Object.fromEntries(CONFIRMATION_KEYS.map(key => [key, true])));
  assert.strictEqual(labelFor('confirmation:sourceSnapshots'), 'Confirm Source Snapshots');
  const shown = [], vscodeUi = createVscodeTargetReviewUi({ window: { async showWarningMessage(...args) { shown.push(args); return args[2]; } } });
  assert.strictEqual(await vscodeUi.confirmReviewRow({ stage: 'target-projection', position: 1, total: 2, label: 'Confirm Source Snapshots' }), true);
  assert.strictEqual(await vscodeUi.confirmApproval({ operationId: h('operation'), planHash: h('plan') }), true);
  assert.strictEqual(shown.length, 2);
  assert.match(shown[0][1].detail, /does not build, replace, or adopt/);

  const success = fixture(), result = await runTargetProjectionReview(success);
  assert.strictEqual(result.status, 'projection-approved-next-transition-unavailable');
  assert.deepStrictEqual(success.calls.filter(row => row[0] === 'ack').map(row => row[1]), success.started.review.rows.map(row => row.id));
  assert.strictEqual(success.calls.filter(row => row[0] === 'record').length, 1);
  assert.strictEqual(success.calls.filter(row => row[0] === 'approve').length, 1);

  const cancelled = fixture(2), cancelledResult = await runTargetProjectionReview(cancelled);
  assert.strictEqual(cancelledResult.status, 'cancelled');
  assert.strictEqual(cancelled.calls.filter(row => row[0] === 'ack').length, 1);
  assert.strictEqual(cancelled.calls.filter(row => row[0] === 'cancel').length, 1);
  assert.strictEqual(cancelled.calls.some(row => row[0] === 'record'), false);

  const deferred = fixture(0, false), deferredResult = await runTargetProjectionReview(deferred);
  assert.strictEqual(deferredResult.status, 'review-retained-approval-deferred');
  assert.deepStrictEqual(deferredResult.continuationLocator, deferred.retainedLocator);
  assert.strictEqual(deferred.calls.some(row => row[0] === 'approve'), false);

  const reopened = fixture(), reopenedResult = await approveRetainedTargetProjection({ runtime: reopened.runtime, ui: reopened.ui, continuationLocator: reopened.retainedLocator });
  assert.strictEqual(reopenedResult.status, 'projection-approved-next-transition-unavailable');
  assert.strictEqual(reopened.calls.filter(row => row[0] === 'read-plan').length, 1);
  assert.strictEqual(reopened.calls.filter(row => row[0] === 'approve').length, 1);

  await assert.rejects(() => runTargetProjectionReview({}), /runtime is required/);
  assert.throws(() => targetApprovalDecision(Buffer.from('{broken')), /not valid JSON/);
  console.log('SFF Creator production review UI requires every challenged row and a separate final approval; cancel/defer remain write-free');
})().catch(error => { console.error(error); process.exitCode = 1; });
