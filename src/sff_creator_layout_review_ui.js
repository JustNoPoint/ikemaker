'use strict';

function fail(message) { throw new Error(`SFF Creator layout review UI: ${message}`); }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function callable(value, label) { if (typeof value !== 'function') fail(`${label} must be a function.`); return value; }
function labelFor(id) { return String(id || '').replace(/^confirmation:/, 'Confirm ').replace(/^risk:/, 'Acknowledge risk: ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()); }
function layoutDetail(item) {
  if(item.stage==='restart-recovery') {
    const summary=item.summary||{};
    return ['Action: Clean verified leftovers from the rolled-back attempt.',
      'The restored SFF and its backup are retained. This does not install the paint candidate.',
      'Active: '+summary.active?.path, 'Active SHA-256: '+summary.active?.byteHash,
      'Candidate SHA-256: '+summary.candidate?.byteHash,
      'Reviewed artifacts:', ...(summary.artifacts||[]).filter(row=>row.exists).map(row=>((summary.cleanupPaths||[]).includes(row.path)?'Remove: ':'Retain: ')+row.name+': '+row.path+'\nSHA-256: '+row.byteHash),
      ...(summary.completedArtifactExclusions||[]).map(row=>'Retain prior completed record: '+row.name+'\nSHA-256: '+row.byteHash+'\nCompleted operation: '+row.operationId+'\nCheckpoint: '+row.completedCheckpointHash),
      'Unknown or foreign files are retained. New filesystem changes require a fresh review.'
    ].join('\n');
  }
  const {paths={}, replacementProfile={}, active={}, candidate={}, rollback={}} = item.summary || {};
  const subset = keys => keys.filter(key=>paths[key]).map(key=>labelFor(key)+'  '+paths[key]).join('\n');
  switch (item.id.replace(/^confirmation:/,'')) {
    case 'backupPublication': return subset(['backupPartialPath','backupPath']);
    case 'currentStateRecheck': return [paths.destinationPath,'Current SHA-256  '+active.byteHash,'Candidate SHA-256  '+candidate.byteHash].join('\n');
    case 'destinationIdentity': return subset(['destinationPath']);
    case 'directoryDurabilityCaveat': return replacementProfile.directoryFsyncObserved ? 'The directory flush succeeded during the filesystem check.' : 'The filesystem check could not verify a directory flush. A power loss may interrupt recovery.';
    case 'everyExecutionPath': return subset(Object.keys(paths).filter(key=>key!=='journalPaths'))+'\n'+Object.values(paths.journalPaths||{}).join('\n');
    case 'externalRaceCaveat': return 'Other tools can still write to '+paths.destinationPath+' during this operation.';
    case 'leaseSemantics': return 'IKeMaker coordinates its writers using '+paths.leasePath;
    case 'nonAtomicReplacement': return 'Replacement uses multiple filesystem steps. Recovery may be needed if interrupted.\n'+subset(['destinationPath','rollbackHoldPath']);
    case 'primitiveCapabilityProfile': return 'Profile  '+replacementProfile.id+'\n'+Object.entries(replacementProfile.capability?.checks||{}).map(([key,value])=>labelFor(key)+'  '+value).join('\n');
    case 'quarantinePolicy': return subset(['failedInstallHoldPath']);
    case 'recoveryJournalAndStateMachine': return Object.entries(paths.journalPaths||{}).map(([stage,file])=>labelFor(stage)+'  '+file).join('\n');
    case 'rollbackFallback': return subset(['backupPath'])+'\nExpected restored SHA-256  '+rollback.fallbackBackupByteHash;
    case 'rollbackStaging': return subset(['rollbackHoldPath','rollbackTempPath','destinationPath']);
    default: return subset(['destinationPath','backupPath']);
  }
}
function createVscodeLayoutReviewUi(vscode) { const showWarningMessage = callable(vscode?.window?.showWarningMessage, 'vscode.window.showWarningMessage'); return freeze({ async confirmReviewRow(item) { const action = 'Acknowledge & Continue'; return await showWarningMessage(item.stage==='restart-recovery'?'Review SFF recovery cleanup':'Review SFF execution layout', { modal: true, detail: `${item.position} of ${item.total}\n\n${item.label}\n\n${layoutDetail(item)}` }, action) === action; }, async confirmApproval(item) { const action = 'Approve Reviewed Execution Layout'; return await showWarningMessage('Approve the retained execution layout?', { modal: true, detail: `Operation: ${item.operationId}\nLayout: ${item.layoutPlanHash}\n\nThis grants retained execution-layout authority but does not start execution, replace the active SFF, or clear the draft.` }, action) === action; } }); }
async function approveRetainedLayoutReview(input = {}) { const runtime = input.runtime, ui = input.ui, continuationLocator = input.continuationLocator; if (!runtime || typeof runtime !== 'object' || !ui || typeof ui !== 'object' || !continuationLocator) fail('runtime, UI adapter, and retained continuation locator are required.'); const retained = input.retainedPlan || callable(runtime.readRetainedLayoutPlan, 'runtime.readRetainedLayoutPlan')({ continuationLocator }); if (retained?.status !== 'retained-execution-layout-plan' || !retained.approvalDecisionTemplate || retained.writesAllowed !== false) fail('runtime did not return the exact write-free retained execution-layout plan.'); const accepted = await callable(ui.confirmApproval, 'ui.confirmApproval')(freeze({ operationId: retained.operationId, layoutPlanHash: retained.layoutPlanHash, approvalDecision: retained.approvalDecisionTemplate })); if (accepted !== true) return freeze({ status: 'execution-layout-review-retained-approval-deferred', operationId: retained.operationId, continuationLocator, resetDraft: false, writesAllowed: false }); const approved = callable(runtime.approveLayoutReview, 'runtime.approveLayoutReview')({ continuationLocator, approvalDecision: retained.approvalDecisionTemplate }); if (approved?.status !== 'execution-approved-next-transition-unavailable' || approved.writesAllowed !== false) fail('runtime did not retain the exact non-executing layout approval.'); return approved; }
async function runExecutionLayoutReview(input = {}) {
  const runtime = input.runtime, ui = input.ui, started = input.started; if (!runtime || typeof runtime !== 'object' || !ui || typeof ui !== 'object' || started?.status !== 'execution-layout-review-required' || !started.review || !started.continuationLocator) fail('an exact execution-layout-review-required result, runtime, and UI adapter are required.'); const review = started.review;
  const confirm = callable(ui.confirmReviewRow, 'ui.confirmReviewRow'), cancel = callable(runtime.cancelReview, 'runtime.cancelReview'), acknowledge = callable(runtime.acknowledgeReview, 'runtime.acknowledgeReview'), record = callable(runtime.recordReview, 'runtime.recordReview');
  if (review.stage !== 'execution-layout' || !Array.isArray(review.rows) || !review.rows.length || review.executionAuthorityGranted !== false || review.adoptionAllowed !== false || review.writesAllowed !== false) fail('execution-layout review must contain explicit challenged rows and no granted mutation authority.');
  const ids = new Set(); for (const row of review.rows) { if (!row || typeof row.id !== 'string' || !row.id || typeof row.challengeToken !== 'string' || !row.challengeToken || ids.has(row.id)) fail('execution-layout review rows must have unique ids and explicit challenge tokens.'); ids.add(row.id); }
  for (let index = 0; index < review.rows.length; index += 1) { const row = review.rows[index], accepted = await confirm(freeze({ stage: review.stage, id: row.id, label: labelFor(row.id), summary: review.summary, position: index + 1, total: review.rows.length })); if (accepted !== true) { const cancellation = cancel({ actionToken: review.actionToken, expectedHeadHash: review.expectedHeadHash }); return freeze({ status: 'execution-layout-review-deferred', cancellation, continuationLocator: started.continuationLocator, resetDraft: false, writesAllowed: false }); } acknowledge({ actionToken: review.actionToken, expectedHeadHash: review.expectedHeadHash, confirmationId: row.id, challengeToken: row.challengeToken }); }
  const retained = record({ actionToken: review.actionToken, expectedHeadHash: review.expectedHeadHash }); if (retained.status !== 'execution-layout-review-retained-next-transition-unavailable' || retained.writesAllowed !== false) fail('runtime did not retain the exact write-free execution-layout review.'); return retained;
}
module.exports = { approveRetainedLayoutReview, createVscodeLayoutReviewUi, labelFor, runExecutionLayoutReview };
