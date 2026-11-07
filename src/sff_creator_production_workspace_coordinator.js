'use strict';

const path = require('path');
const { approveRetainedTargetProjection } = require('./sff_creator_production_review_ui');
const { approveRetainedAdoptionReview } = require('./sff_creator_adoption_review_ui');
const { approveRetainedLayoutReview } = require('./sff_creator_layout_review_ui');
const { confirmStartApprovedExecution } = require('./sff_creator_execution_start_ui');
const { approveRetainedHistoryReview } = require('./sff_creator_history_review_ui');

const SUPPORTED = new Set(['sff-v2.0', 'sff-v2.1']);
function fail(message) { throw new Error(`SFF Creator production workspace coordinator: ${message}`); }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function callable(value, label) { if (typeof value !== 'function') fail(`${label} must be a function.`); return value; }
function assertSession(input) { if (!input || typeof input !== 'object' || typeof input.draftKey !== 'string' || !input.draftKey || typeof input.draftRevision !== 'string' || !input.draftRevision || input.currentDraftRevision !== input.draftRevision || !input.binding || !SUPPORTED.has(input.binding.targetId)) fail('an exact unchanged v2.0/v2.1 reviewed draft session is required.'); }
function action(status) {
  if (status === 'target-review-required') return 'Continue Target Review';
  if (/review-retained/.test(status)) return 'Continue Approval';
  if (status === 'projection-approved-next-transition-unavailable') return 'Choose Certification Evidence';
  if (status === 'request-ready-next-transition-unavailable') return 'Build Private Candidate';
  if (status === 'candidate-built-next-transition-unavailable') return 'Persist Private Candidate';
  if (status === 'candidate-persisted-next-transition-unavailable') return 'Continue Adoption Review';
  if (status === 'adoption-approved-next-transition-unavailable') return 'Probe & Review Layout';
  if (status === 'execution-approved-next-transition-unavailable') return 'Confirm Execution Start';
  if (status === 'execution-intent-retained-executor-not-started' || status === 'execution-retry-may-be-offered' || status === 'retry-may-be-offered') return 'Execute Approved Intent';
  if (status === 'classification-required' || status === 'result-captured-continuation') return 'Classify Captured Result';
  if (status === 'history-approved-next-transition-unavailable') return 'Write Approved History & Complete';
  if (status === 'completed-authoritative' || status === 'completed-cleanup-recorded') return 'Finalize Completed Draft';
  if (/recovery|required|manual|cleanup/.test(status)) return 'Continue Recovery';
  return 'Continue Review';
}

function createCreatorProductionWorkspaceCoordinator(dependencies = {}) {
  const runtime = dependencies.runtime, continuations = dependencies.continuations;
  if (!runtime || typeof runtime !== 'object' || !continuations || typeof continuations !== 'object') fail('runtime and continuation host are required.');
  const pickCertification = callable(dependencies.pickCertification, 'pickCertification'), probeReplacement = callable(dependencies.probeReplacement, 'probeReplacement');
  const ui = dependencies.ui || {};
  for (const key of ['target', 'adoption', 'layout', 'execution', 'history']) if (!ui[key] || typeof ui[key] !== 'object') fail(`${key} UI adapter is required.`);

  async function retain(input, result) {
    if (!result?.continuationLocator) fail(`durable transition ${result?.status || 'unknown'} did not return a continuation locator.`);
    await continuations.retain({ draftKey: input.draftKey, draftRevision: input.draftRevision, locator: result.continuationLocator, binding: input.binding });
    return freeze({ ...result, continueAction: action(result.status), draftCleared: false });
  }
  async function challenge(input, presented, adapter) {
    const review = presented.review;
    if (!review || !Array.isArray(review.rows) || !review.rows.length) fail(`${presented.status} has no explicit challenged rows.`);
    for (let index = 0; index < review.rows.length; index += 1) {
      const row = review.rows[index], accepted = await callable(adapter.confirmReviewRow, 'confirmReviewRow')(freeze({ stage: review.stage, id: row.id, label: row.id, summary: review.summary, position: index + 1, total: review.rows.length }));
      if (accepted !== true) { runtime.cancelReview({ actionToken: review.actionToken, expectedHeadHash: review.expectedHeadHash }); return freeze({ status: 'review-deferred', operationId: presented.operationId, continuationLocator: presented.continuationLocator, continueAction: action(presented.status), resetDraft: false, draftCleared: false, writesAllowed: false }); }
      runtime.acknowledgeReview({ actionToken: review.actionToken, expectedHeadHash: review.expectedHeadHash, confirmationId: row.id, challengeToken: row.challengeToken });
    }
    return retain(input, runtime.recordReview({ actionToken: review.actionToken, expectedHeadHash: review.expectedHeadHash }));
  }
  async function completeHistory(input, continuationLocator) {
    const completed = runtime.completeApprovedHistory({ continuationLocator }), retained = await retain(input, completed);
    if (completed.resetDraft !== true) return retained;
    const finalized = await continuations.complete({ draftKey: input.draftKey, currentDraftRevision: input.currentDraftRevision, runtimeResetDraft: true });
    return freeze({ ...retained, status: finalized.status, draftCleared: finalized.draftCleared, completed: finalized.completed });
  }
  async function start(input) {
    assertSession(input);
    if (!input.lifecycleInput || input.lifecycleInput.routeEnvelope?.route?.targetId !== input.binding.targetId) fail('lifecycle input does not match the retained route binding.');
    const started = await runtime.startLifecycle(input.lifecycleInput);
    if (started?.status !== 'target-review-required') fail(`runtime did not stop at target review: ${started?.status || 'missing result'}.`);
    return retain(input, started);
  }
  async function continueOperation(input) {
    assertSession(input); if (!input.continuationLocator) fail('an exact retained continuation locator is required.');
    const presented = runtime.resumeLifecycle(input.continuationLocator), status = presented?.status;
    if (status === 'target-review-required') return challenge(input, presented, ui.target);
    if (status === 'target-review-retained-next-transition-unavailable') return retain(input, await approveRetainedTargetProjection({ runtime, ui: ui.target, continuationLocator: presented.continuationLocator, capabilityRequest: input.capabilityRequest || {} }));
    if (status === 'projection-approved-next-transition-unavailable') { const picked = await pickCertification(input.binding); if (!picked) return freeze({ ...presented, status: 'certification-selection-deferred', continueAction: action(status), draftCleared: false }); return retain(input, runtime.retainApprovedRequest({ continuationLocator: presented.continuationLocator, freshCapabilityRequest: picked.freshCapabilityRequest })); }
    if (status === 'request-ready-next-transition-unavailable') return retain(input, runtime.buildCandidate({ continuationLocator: presented.continuationLocator }));
    if (status === 'candidate-built-next-transition-unavailable') return retain(input, runtime.persistCandidate({ continuationLocator: presented.continuationLocator }));
    if (status === 'candidate-persisted-next-transition-unavailable') { if (typeof input.backupBasename !== 'string' || !input.backupBasename) fail('an explicit backup basename is required.'); return retain(input, runtime.beginAdoptionReview({ continuationLocator: presented.continuationLocator, backupBasename: input.backupBasename, recoveryPolicy: input.recoveryPolicy || 'temporary' })); }
    if (status === 'adoption-impact-review-required') return challenge(input, presented, ui.adoption);
    if (status === 'adoption-impact-review-retained-next-transition-unavailable') return retain(input, await approveRetainedAdoptionReview({ runtime, ui: ui.adoption, continuationLocator: presented.continuationLocator }));
    if (status === 'adoption-approved-next-transition-unavailable') { const evidence = probeReplacement({ activeDirectory: path.dirname(input.activePath) }); if (!evidence?.artifactBytes || !evidence?.artifactByteHash) fail('replacement capability probe did not return exact artifact evidence.'); return retain(input, runtime.beginLayoutReview({ continuationLocator: presented.continuationLocator, replacementCapabilityArtifactBytes: Buffer.from(evidence.artifactBytes), expectedReplacementCapabilityArtifactByteHash: evidence.artifactByteHash })); }
    if (status === 'execution-layout-review-required') return challenge(input, presented, ui.layout);
    if (status === 'execution-layout-review-retained-next-transition-unavailable') return retain(input, await approveRetainedLayoutReview({ runtime, ui: ui.layout, continuationLocator: presented.continuationLocator }));
    if (status === 'execution-approved-next-transition-unavailable') { const result = await confirmStartApprovedExecution({ runtime, ui: ui.execution, continuationLocator: presented.continuationLocator }); return result.continuationLocator && result.status !== 'approved-execution-start-deferred' ? retain(input, result) : freeze({ ...result, continueAction: action(status), draftCleared: false }); }
    if (status === 'execution-intent-retained-executor-not-started' || status === 'execution-retry-may-be-offered' || status === 'retry-may-be-offered') return retain(input, runtime.executeApprovedIntent({ continuationLocator: presented.continuationLocator }));
    if (status === 'classification-required' || status === 'result-captured-continuation') return retain(input, runtime.classifyExecutionResult({ continuationLocator: presented.continuationLocator }));
    if (status === 'history-reconciliation-review-required') return challenge(input, presented, ui.history);
    if (status === 'history-reconciliation-review-retained-next-transition-unavailable') return retain(input, await approveRetainedHistoryReview({ runtime, ui: ui.history, continuationLocator: presented.continuationLocator }));
    if (status === 'history-approved-next-transition-unavailable' || status === 'finalization-required' || status === 'completed-cleanup-required') return completeHistory(input, presented.continuationLocator);
    if (status === 'completed-authoritative' || status === 'completed-cleanup-recorded') { if (presented.resetDraft !== true) return freeze({ ...presented, continueAction: action(status), draftCleared: false }); const finalized = await continuations.complete({ draftKey: input.draftKey, currentDraftRevision: input.currentDraftRevision, runtimeResetDraft: true }); return freeze({ ...presented, status: finalized.status, draftCleared: finalized.draftCleared, completed: finalized.completed }); }
    return freeze({ ...presented, continueAction: action(status || ''), resetDraft: false, draftCleared: false });
  }
  return freeze({ continueOperation, start });
}

module.exports = { SUPPORTED, action, createCreatorProductionWorkspaceCoordinator };
