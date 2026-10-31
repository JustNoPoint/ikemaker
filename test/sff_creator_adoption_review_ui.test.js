'use strict';

const assert = require('assert');
const { approveRetainedAdoptionReview, runAdoptionImpactReview } = require('../src/sff_creator_adoption_review_ui');

async function main() {
  const locator = { exact: 'review-head' }, rows = [{ id: 'confirmation:one', challengeToken: 'c1' }, { id: 'risk:two', challengeToken: 'c2' }], calls = [];
  const runtime = {
    acknowledgeReview(input) { calls.push(['ack', input.confirmationId]); },
    cancelReview(input) { calls.push(['cancel', input.actionToken]); return { status: 'cancelled' }; },
    recordReview() { calls.push(['record']); return { status: 'adoption-impact-review-retained-next-transition-unavailable', operationId: 'op', continuationLocator: locator, retained: { planHash: 'plan' } }; },
    readRetainedAdoptionPlan() { calls.push(['read']); return { status: 'retained-adoption-impact-plan', operationId: 'op', planHash: 'plan', approvalDecisionTemplate: { status: 'approved', planHash: 'plan' } }; },
    approveAdoptionReview(input) { calls.push(['approve', input.approvalDecision.planHash]); return { status: 'adoption-approved-next-transition-unavailable', continuationLocator: { exact: 'approved' }, resetDraft: false, writesAllowed: false }; }
  };
  const started = { status: 'adoption-impact-review-required', continuationLocator: { exact: 'route' }, review: { actionToken: 'token', expectedHeadHash: 'head', stage: 'adoption-impact', rows, summary: {} } };
  const cancelled = await runAdoptionImpactReview({ runtime, started, ui: { async confirmReviewRow() { return false; }, async confirmApproval() { throw new Error('approval must not be reached'); } } });
  assert.strictEqual(cancelled.status, 'cancelled'); assert.deepStrictEqual(calls.splice(0), [['cancel', 'token']]);
  let approvals = 0; const deferred = await runAdoptionImpactReview({ runtime, started, ui: { async confirmReviewRow() { return true; }, async confirmApproval() { approvals += 1; return false; } } });
  assert.strictEqual(deferred.status, 'adoption-review-retained-approval-deferred'); assert.deepStrictEqual(calls.splice(0), [['ack', 'confirmation:one'], ['ack', 'risk:two'], ['record'], ['read']]); assert.strictEqual(approvals, 1);
  const approved = await approveRetainedAdoptionReview({ runtime, continuationLocator: locator, ui: { async confirmApproval(item) { assert.strictEqual(item.planHash, 'plan'); return true; } } });
  assert.strictEqual(approved.status, 'adoption-approved-next-transition-unavailable'); assert.deepStrictEqual(calls.splice(0), [['read'], ['approve', 'plan']]);
  console.log('SFF Creator adoption review UI keeps challenged review, retained-plan approval, cancellation, and deferral as separate direct-human boundaries');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
