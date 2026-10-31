'use strict';

const crypto = require('crypto');
const { CONFIRMATION_KEYS } = require('./sff_creator_target_projection_approval');

function fail(message) { throw new Error(`SFF Creator production review UI: ${message}`); }
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function callable(value, label) { if (typeof value !== 'function') fail(`${label} must be a function.`); return value; }
function labelFor(id) {
  const [kind, raw] = String(id || '').split(':', 2);
  const text = String(raw || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  if (kind === 'confirmation') return `Confirm ${text}`;
  if (kind === 'conversion') return `Review Conversion: ${text}`;
  if (kind === 'mandatory') return `Required Acknowledgement: ${text}`;
  if (kind === 'risk') return `Acknowledge Risk: ${text}`;
  return text || 'Review Item';
}

function targetApprovalDecision(planBytes) {
  if (!Buffer.isBuffer(planBytes) || planBytes.length < 2 || planBytes.length > 16 * 1024 * 1024) fail('retained target plan bytes are missing or exceed the review limit.');
  let plan;
  try { plan = JSON.parse(planBytes.toString('utf8')); } catch (_) { fail('retained target plan is not valid JSON.'); }
  const selection = plan?.selection, adapter = selection?.adapter;
  if (!plan || typeof plan !== 'object' || Array.isArray(plan) || !selection || !adapter || !Array.isArray(plan.conversions) || !Array.isArray(plan.mandatoryAcknowledgements)) fail('retained target plan is incomplete.');
  return freeze({
    status: 'approved',
    projectionPlanHash: plan.planHash,
    sourceArtifactByteHash: plan.sourceArtifactByteHash,
    legacySpecificationHash: plan.legacySpecificationHash,
    projectionArtifactByteHash: sha(planBytes),
    targetId: selection.targetId,
    backendId: selection.backendId,
    adapterId: adapter.id,
    adapterVersion: adapter.version,
    reviewedBlockerCount: 0,
    reviewedConversionIds: [...new Set(plan.conversions.map(row => row?.id))].filter(Boolean).sort(),
    acceptedMandatoryAcknowledgementIds: [...new Set(plan.mandatoryAcknowledgements.filter(row => row?.accepted === true).map(row => row.id))].filter(Boolean).sort(),
    confirmations: Object.fromEntries(CONFIRMATION_KEYS.map(key => [key, true]))
  });
}

function createVscodeTargetReviewUi(vscode) {
  const showWarningMessage = callable(vscode?.window?.showWarningMessage, 'vscode.window.showWarningMessage');
  return freeze({
    async confirmReviewRow(item) {
      const action = 'Acknowledge & Continue';
      const detail = [
        `${item.position} of ${item.total} · ${item.stage}`,
        '',
        item.label,
        '',
        'This acknowledgement applies only to the exact retained review plan. It does not build, replace, or adopt an SFF.'
      ].join('\n');
      return await showWarningMessage('Review built-in SFF target projection', { modal: true, detail }, action) === action;
    },
    async confirmApproval(item) {
      const action = 'Approve Reviewed Projection';
      const detail = [
        `Operation: ${item.operationId}`,
        `Projection: ${item.planHash}`,
        '',
        'All challenged rows were acknowledged and retained. Approving creates the exact candidate-only adapter specification. It still does not build, replace, or adopt an SFF.'
      ].join('\n');
      return await showWarningMessage('Approve the retained SFF target projection?', { modal: true, detail }, action) === action;
    }
  });
}

async function runTargetProjectionReview(input = {}) {
  const runtime = input.runtime, started = input.started, ui = input.ui;
  if (!runtime || typeof runtime !== 'object') fail('runtime is required.');
  if (!started || started.status !== 'target-review-required' || !started.review || !started.continuationLocator) fail('an exact target-review-required result is required.');
  if (!ui || typeof ui !== 'object') fail('UI adapter is required.');
  const acknowledge = callable(runtime.acknowledgeReview, 'runtime.acknowledgeReview');
  const cancel = callable(runtime.cancelReview, 'runtime.cancelReview');
  const record = callable(runtime.recordReview, 'runtime.recordReview');
  const confirmRow = callable(ui.confirmReviewRow, 'ui.confirmReviewRow');
  callable(ui.confirmApproval, 'ui.confirmApproval');
  const review = started.review;
  if (!Array.isArray(review.rows) || !review.rows.length) fail('target review has no explicit challenged rows.');

  for (let index = 0; index < review.rows.length; index += 1) {
    const row = review.rows[index];
    const accepted = await confirmRow(freeze({
      stage: review.stage,
      id: row.id,
      label: labelFor(row.id),
      summary: review.summary,
      position: index + 1,
      total: review.rows.length
    }));
    if (accepted !== true) {
      const cancellation = cancel({ actionToken: review.actionToken, expectedHeadHash: review.expectedHeadHash });
      return freeze({ status: 'cancelled', cancellation, continuationLocator: started.continuationLocator, resetDraft: false, writesAllowed: false });
    }
    acknowledge({ actionToken: review.actionToken, expectedHeadHash: review.expectedHeadHash, confirmationId: row.id, challengeToken: row.challengeToken });
  }

  const retained = record({ actionToken: review.actionToken, expectedHeadHash: review.expectedHeadHash });
  if (retained.status !== 'target-review-retained-next-transition-unavailable' || !retained.retained?.planArtifactBytes || !retained.continuationLocator) fail('runtime did not return the exact retained target review.');
  return approveRetainedTargetProjection({ runtime, ui, continuationLocator: retained.continuationLocator, retainedPlan: { status: 'retained-target-plan', operationId: retained.operationId, planArtifactBytes: retained.retained.planArtifactBytes, planHash: retained.retained.planHash }, capabilityRequest: input.capabilityRequest || {} });
}

async function approveRetainedTargetProjection(input = {}) {
  const runtime = input.runtime, ui = input.ui;
  if (!runtime || typeof runtime !== 'object') fail('runtime is required.');
  if (!ui || typeof ui !== 'object') fail('UI adapter is required.');
  const approve = callable(runtime.approveTargetProjection, 'runtime.approveTargetProjection');
  const confirmApproval = callable(ui.confirmApproval, 'ui.confirmApproval');
  const continuationLocator = input.continuationLocator;
  if (!continuationLocator || typeof continuationLocator !== 'object') fail('retained target continuation locator is required.');
  const retainedPlan = input.retainedPlan || callable(runtime.readRetainedTargetPlan, 'runtime.readRetainedTargetPlan')({ continuationLocator });
  if (retainedPlan?.status !== 'retained-target-plan' || !Buffer.isBuffer(retainedPlan.planArtifactBytes)) fail('runtime did not return the exact retained target plan.');
  const approvalDecision = targetApprovalDecision(retainedPlan.planArtifactBytes);
  const approvedByUser = await confirmApproval(freeze({ stage: 'target-projection', operationId: retainedPlan.operationId, planHash: retainedPlan.planHash, approvalDecision }));
  if (approvedByUser !== true) return freeze({ status: 'review-retained-approval-deferred', operationId: retainedPlan.operationId, continuationLocator, resetDraft: false, writesAllowed: false });
  return approve({ continuationLocator, approvalDecision, capabilityRequest: input.capabilityRequest || {} });
}

module.exports = { approveRetainedTargetProjection, createVscodeTargetReviewUi, labelFor, runTargetProjectionReview, targetApprovalDecision };
