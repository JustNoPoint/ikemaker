'use strict';

const assert = require('assert');
const { approveRetainedHistoryReview, createVscodeHistoryReviewUi, runHistoryReconciliationReview } = require('../src/sff_creator_history_review_ui');

async function main() {
  let shown = null; const vscodeUi = createVscodeHistoryReviewUi({ window: { async showWarningMessage(title, options, action) { shown = { title, options, action }; return action; } } }); await vscodeUi.confirmReviewRow({ position: 1, total: 2, label: 'Confirm Exact Immutable Record', summary: { outcome: 'committed', reconciliationRows: [{ id: 'append-exact-record', action: 'append' }], durabilityCaveats: ['directory-sync-platform-limited'], rollbackCurrentlyAvailable: true } }); assert.match(shown.options.detail, /append-exact-record/); assert.match(shown.options.detail, /directory-sync-platform-limited/); assert.match(shown.options.detail, /Rollback currently available: yes/); assert.match(shown.options.detail, /does not append history/); await vscodeUi.confirmApproval({ operationId: 'op', planHash: 'plan' }); assert.match(shown.options.detail, /approval authority only/); assert.match(shown.options.detail, /does not invoke the history writer/);
  const locator = { exact: 'classified-head' }, rows = [{ id: 'confirmation:terminalOutcomeAndJournal', challengeToken: 'c1' }, { id: 'risk:durability-caveat', challengeToken: 'c2' }], calls = [];
  const runtime = {
    acknowledgeReview(input) { calls.push(['ack', input.confirmationId]); },
    cancelReview(input) { calls.push(['cancel', input.actionToken]); return { status: 'cancelled', writesAllowed: false }; },
    recordReview() { calls.push(['record']); return { status: 'history-reconciliation-review-retained-next-transition-unavailable', operationId: 'op', continuationLocator: { exact: 'review-child' }, retained: { historyWriteAuthorityGranted: false }, resetDraft: false, writesAllowed: false }; },
    readRetainedHistoryPlan() { calls.push(['read']); return { status: 'retained-history-reconciliation-plan', operationId: 'op', planHash: 'plan', approvalDecisionTemplate: { status: 'approved', planHash: 'plan' } }; },
    approveHistoryReview(input) { calls.push(['approve', input.approvalDecision.planHash]); return { status: 'history-approved-next-transition-unavailable', continuationLocator: { exact: 'approved' }, resetDraft: false, writesAllowed: false }; }
  }, started = { status: 'history-reconciliation-review-required', continuationLocator: locator, review: { actionToken: 'token', expectedHeadHash: 'head', stage: 'history-reconciliation', rows, summary: { outcome: 'committed', reconciliationRows: [{ id: 'one' }], durabilityCaveats: ['directory-sync-platform-limited'] } } };
  const deferred = await runHistoryReconciliationReview({ runtime, started, ui: { async confirmReviewRow() { return false; }, async confirmApproval() { throw new Error('approval must not be reached'); } } });
  assert.strictEqual(deferred.status, 'history-reconciliation-review-deferred'); assert.strictEqual(deferred.resetDraft, false); assert.strictEqual(deferred.writesAllowed, false); assert.deepStrictEqual(calls.splice(0), [['cancel', 'token']]);
  const retainedDeferred = await runHistoryReconciliationReview({ runtime, started, ui: { async confirmReviewRow(item) { assert.strictEqual(item.summary.outcome, 'committed'); return true; }, async confirmApproval() { return false; } } });
  assert.strictEqual(retainedDeferred.status, 'history-review-retained-approval-deferred'); assert.strictEqual(retainedDeferred.resetDraft, false); assert.strictEqual(retainedDeferred.writesAllowed, false); assert.deepStrictEqual(calls.splice(0), [['ack', rows[0].id], ['ack', rows[1].id], ['record'], ['read']]);
  const approved = await approveRetainedHistoryReview({ runtime, continuationLocator: { exact: 'review-child' }, ui: { async confirmApproval(item) { assert.strictEqual(item.planHash, 'plan'); return true; } } }); assert.strictEqual(approved.status, 'history-approved-next-transition-unavailable'); assert.deepStrictEqual(calls.splice(0), [['read'], ['approve', 'plan']]);
  console.log('SFF Creator history review UI separates challenged review, retained-plan approval, cancellation, and deferral as direct-human boundaries');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
