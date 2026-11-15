'use strict';

function fail(message) { throw new Error(`SFF Creator adoption review UI: ${message}`); }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function callable(value, label) { if (typeof value !== 'function') fail(`${label} must be a function.`); return value; }
function labelFor(id) { return String(id || '').replace(/^confirmation:/, 'Confirm ').replace(/^risk:/, 'Acknowledge risk: ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()); }

function impactDetail(item) {
  const {candidate = {}, active = {}, comparison = {}, proposedPaths = {}, rollback = {}} = item.summary || {};
  const key = item.id.replace(/^confirmation:/, '');
  const totals = Object.entries(comparison.totals || {});
  switch (key) {
    case 'activeFingerprint': return [active.realpath || active.path, active.byteLength + ' bytes', 'SHA-256 ' + active.byteHash].join('\n');
    case 'backupAndDestinationPaths': return 'Destination  ' + proposedPaths.destinationPath + '\nBackup  ' + proposedPaths.backupPath;
    case 'candidateIdentity': return [candidate.path, candidate.byteLength + ' bytes', 'SHA-256 ' + candidate.byteHash].join('\n');
    case 'formatAndProfile': return 'Current  ' + (active.inspection?.targetId || active.inspection?.status || 'Unknown') + '\nProposed  ' + candidate.targetId;
    case 'rollbackPlan': return 'Restore from  ' + proposedPaths.backupPath + '\nDestination  ' + proposedPaths.destinationPath + '\nExpected restored SHA-256  ' + rollback.rollbackTargetByteHash;
    case 'elevatedRisks': return item.risks.length ? item.risks.map(labelFor).join('\n') : 'No elevated risks were reported.';
    case 'semanticChanges': return totals.map(([name,v]) => labelFor(name) + '  ' + v.changed + ' changed, ' + v.added + ' added, ' + v.removed + ' removed').join('\n');
    case 'semanticUnknowns': return totals.filter(([,v]) => v.unknown).map(([name,v]) => labelFor(name) + '  ' + v.unknown + ' could not be compared').join('\n') || 'All comparison categories have known results.';
    default: return 'Current archive  ' + active.path + '\nProposed archive  ' + candidate.path;
  }
}

function createVscodeAdoptionReviewUi(vscode) {
  const showWarningMessage = callable(vscode?.window?.showWarningMessage, 'vscode.window.showWarningMessage');
  return freeze({
    async confirmReviewRow(item) {
      const action = 'Acknowledge & Continue';
      return await showWarningMessage('Review SFF adoption impact', { modal: true, detail: `${item.position} of ${item.total}\n\n${item.label}\n\n${impactDetail(item)}` }, action) === action;
    },
    async confirmApproval(item) {
      const action = 'Approve Reviewed Adoption Plan';
      return await showWarningMessage('Approve the retained SFF adoption plan?', { modal: true, detail: `Operation: ${item.operationId}\nPlan: ${item.planHash}\n\nApproval retains authority for a later layout review. It does not replace the active SFF, execute adoption, or clear the draft.` }, action) === action;
    }
  });
}

async function approveRetainedAdoptionReview(input = {}) {
  const runtime = input.runtime, ui = input.ui, continuationLocator = input.continuationLocator;
  if (!runtime || typeof runtime !== 'object' || !ui || typeof ui !== 'object' || !continuationLocator) fail('runtime, UI adapter, and retained continuation locator are required.');
  const retained = input.retainedPlan || callable(runtime.readRetainedAdoptionPlan, 'runtime.readRetainedAdoptionPlan')({ continuationLocator });
  if (retained?.status !== 'retained-adoption-impact-plan' || !retained.approvalDecisionTemplate) fail('runtime did not return the exact retained adoption-impact plan.');
  const accepted = await callable(ui.confirmApproval, 'ui.confirmApproval')(freeze({ operationId: retained.operationId, planHash: retained.planHash, approvalDecision: retained.approvalDecisionTemplate }));
  if (accepted !== true) return freeze({ status: 'adoption-review-retained-approval-deferred', operationId: retained.operationId, continuationLocator, resetDraft: false, writesAllowed: false });
  return callable(runtime.approveAdoptionReview, 'runtime.approveAdoptionReview')({ continuationLocator, approvalDecision: retained.approvalDecisionTemplate });
}

async function runAdoptionImpactReview(input = {}) {
  const runtime = input.runtime, ui = input.ui, started = input.started;
  if (!runtime || typeof runtime !== 'object' || !ui || typeof ui !== 'object' || started?.status !== 'adoption-impact-review-required' || !started.review || !started.continuationLocator) fail('an exact adoption-impact-review-required result, runtime, and UI adapter are required.');
  const review = started.review;
  for (let index = 0; index < review.rows.length; index += 1) {
    const row = review.rows[index], accepted = await callable(ui.confirmReviewRow, 'ui.confirmReviewRow')(freeze({ stage: review.stage, id: row.id, label: labelFor(row.id), summary: review.summary, risks:review.rows.filter(item=>item.id.startsWith('risk:')).map(item=>item.id.slice(5)), position: index + 1, total: review.rows.length }));
    if (accepted !== true) { const cancellation = runtime.cancelReview({ actionToken: review.actionToken, expectedHeadHash: review.expectedHeadHash }); return freeze({ status: 'cancelled', cancellation, continuationLocator: started.continuationLocator, resetDraft: false, writesAllowed: false }); }
    runtime.acknowledgeReview({ actionToken: review.actionToken, expectedHeadHash: review.expectedHeadHash, confirmationId: row.id, challengeToken: row.challengeToken });
  }
  const retained = runtime.recordReview({ actionToken: review.actionToken, expectedHeadHash: review.expectedHeadHash });
  if (retained.status !== 'adoption-impact-review-retained-next-transition-unavailable') fail('runtime did not retain the exact adoption-impact review.');
  return approveRetainedAdoptionReview({ runtime, ui, continuationLocator: retained.continuationLocator, retainedPlan: { status: 'retained-adoption-impact-plan', operationId: retained.operationId, planHash: retained.retained.planHash, approvalDecisionTemplate: runtime.readRetainedAdoptionPlan({ continuationLocator: retained.continuationLocator }).approvalDecisionTemplate } });
}

module.exports = { approveRetainedAdoptionReview, createVscodeAdoptionReviewUi, impactDetail, labelFor, runAdoptionImpactReview };
