'use strict';

function fail(message) { throw new Error(`SFF Creator history review UI: ${message}`); }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function callable(value, label) { if (typeof value !== 'function') fail(`${label} must be a function.`); return value; }
function labelFor(id) { return String(id || '').replace(/^confirmation:/, 'Confirm ').replace(/^risk:/, 'Acknowledge risk: ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()); }
function exactSummary(summary) {
  const value = summary || {}, reconciliation = Array.isArray(value.reconciliationRows) ? value.reconciliationRows : [], caveats = Array.isArray(value.durabilityCaveats) ? value.durabilityCaveats : [];
  return [`Outcome: ${value.outcome || 'unknown'}`, `Rollback currently available: ${value.rollbackCurrentlyAvailable === true ? 'yes' : 'no'}`, 'Exact history reconciliation rows:', ...(reconciliation.length ? reconciliation.map(row => JSON.stringify(row)) : ['(none)']), 'Exact durability caveats:', ...(caveats.length ? caveats.map(row => typeof row === 'string' ? row : JSON.stringify(row)) : ['(none)'])].join('\n');
}

function createVscodeHistoryReviewUi(vscode) {
  const showWarningMessage = callable(vscode?.window?.showWarningMessage, 'vscode.window.showWarningMessage');
  return freeze({
    async confirmReviewRow(item) {
      const action = 'Acknowledge & Continue';
      return await showWarningMessage('Review SFF history reconciliation impact', { modal: true, detail: `${item.position} of ${item.total}\n\n${item.label}\n\n${exactSummary(item.summary)}\n\nThis records review only. It does not append history, modify recovery evidence, mark the operation complete, or clear the draft.` }, action) === action;
    },
    async confirmApproval(item) {
      const action = 'Approve Retained History Plan';
      return await showWarningMessage('Approve the retained SFF history reconciliation plan?', { modal: true, detail: `Operation: ${item.operationId}\nPlan: ${item.planHash}\n\nThis retains approval authority only. It does not invoke the history writer, append history, mark the operation complete, or clear the draft.` }, action) === action;
    }
  });
}

async function approveRetainedHistoryReview(input = {}) {
  const runtime = input.runtime, ui = input.ui, continuationLocator = input.continuationLocator;
  if (!runtime || typeof runtime !== 'object' || !ui || typeof ui !== 'object' || !continuationLocator) fail('runtime, UI adapter, and retained history-review locator are required.');
  const retained = input.retainedPlan || callable(runtime.readRetainedHistoryPlan, 'runtime.readRetainedHistoryPlan')({ continuationLocator });
  if (retained?.status !== 'retained-history-reconciliation-plan' || !retained.approvalDecisionTemplate) fail('runtime did not return the exact retained history reconciliation plan.');
  const accepted = await callable(ui.confirmApproval, 'ui.confirmApproval')(freeze({ operationId: retained.operationId, planHash: retained.planHash, approvalDecision: retained.approvalDecisionTemplate }));
  if (accepted !== true) return freeze({ status: 'history-review-retained-approval-deferred', operationId: retained.operationId, continuationLocator, resetDraft: false, writesAllowed: false });
  return callable(runtime.approveHistoryReview, 'runtime.approveHistoryReview')({ continuationLocator, approvalDecision: retained.approvalDecisionTemplate });
}

async function runHistoryReconciliationReview(input = {}) {
  const runtime = input.runtime, ui = input.ui, started = input.started;
  if (!runtime || typeof runtime !== 'object' || !ui || typeof ui !== 'object' || started?.status !== 'history-reconciliation-review-required' || !started.review || !started.continuationLocator) fail('an exact history-reconciliation-review-required result, runtime, and UI adapter are required.');
  const review = started.review;
  for (let index = 0; index < review.rows.length; index += 1) {
    const row = review.rows[index], accepted = await callable(ui.confirmReviewRow, 'ui.confirmReviewRow')(freeze({ stage: review.stage, id: row.id, label: labelFor(row.id), summary: review.summary, position: index + 1, total: review.rows.length }));
    if (accepted !== true) { const cancellation = runtime.cancelReview({ actionToken: review.actionToken, expectedHeadHash: review.expectedHeadHash }); return freeze({ status: 'history-reconciliation-review-deferred', cancellation, continuationLocator: started.continuationLocator, resetDraft: false, writesAllowed: false }); }
    runtime.acknowledgeReview({ actionToken: review.actionToken, expectedHeadHash: review.expectedHeadHash, confirmationId: row.id, challengeToken: row.challengeToken });
  }
  const retained = runtime.recordReview({ actionToken: review.actionToken, expectedHeadHash: review.expectedHeadHash });
  if (retained.status !== 'history-reconciliation-review-retained-next-transition-unavailable' || retained.retained?.historyWriteAuthorityGranted !== false) fail('runtime did not retain the exact no-write history reconciliation review.');
  return approveRetainedHistoryReview({ runtime, ui, continuationLocator: retained.continuationLocator });
}

module.exports = { approveRetainedHistoryReview, createVscodeHistoryReviewUi, exactSummary, labelFor, runHistoryReconciliationReview };
