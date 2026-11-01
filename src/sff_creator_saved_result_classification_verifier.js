'use strict';

const { hashCanonical } = require('./sff_capability_report');
const { readCreatorResultClassificationChildAuthority } = require('./sff_creator_result_classification_bridge');

function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(deepFreeze); return value; }
function effects() { return { writes: false, processes: false, approvalsGranted: false, backendExecution: false, executionStarted: false, recoveryStarted: false, activeArchiveModified: false, candidateModified: false, historyModified: false, historyAppended: false }; }

function verifySavedCreatorResultClassificationFromVault(classifiedChildLocator) {
  const authority = readCreatorResultClassificationChildAuthority(classifiedChildLocator), terminal = authority.classification === 'TerminalNeedsHistory', recovery = authority.classification === 'RestartRecoveryRequired' || authority.classification === 'ManualRecoveryRequired';
  if (!terminal && !recovery) throw new Error('Saved result classification verifier: unsupported classified lifecycle.');
  const core = {
    schema: 'ikemaker.sff-creator-saved-result-classification-verification', version: 1, status: 'verified', observationClass: 'retained-vault-evidence-only', lifecycleState: authority.classification, classification: authority.classification,
    operationId: authority.operationId, workspaceId: authority.workspaceId, targetId: authority.targetId, backendId: authority.backendId, adapterId: authority.adapterId, activePath: authority.activePath, candidatePath: authority.candidatePath, historyRoot: authority.historyRoot,
    semanticHeadRecordHash: authority.semanticHeadRecordHash, predecessorHeadRecordHash: authority.predecessorHeadRecordHash, snapshotAuthorityHash: authority.snapshotAuthorityHash,
    resultClassificationManifestArtifactByteHash: authority.manifestArtifactByteHash, resultClassificationManifestHash: authority.manifestHash, resultClassificationManifestAuthorityHash: authority.manifestAuthorityHash,
    predecessorResultManifestArtifactByteHash: authority.parentManifestArtifactByteHash, predecessorResultManifestHash: authority.parentManifestHash, predecessorResultManifestAuthorityHash: authority.parentManifestAuthorityHash, parentRootSealsHash: authority.parentRootSealsHash,
    resultClassificationPlanHash: authority.classificationPlanHash, resultClassificationPlanArtifactByteHash: authority.classificationPlanArtifactByteHash, resultClassificationPlanAuthorityHash: authority.classificationPlanAuthorityHash,
    historyReconciliationPlanHash: terminal ? authority.auxiliaryPlanHash : null, restartRecoveryPlanHash: recovery ? authority.auxiliaryPlanHash : null, auxiliaryPlanArtifactName: authority.auxiliaryPlanArtifactName, auxiliaryPlanArtifactByteHash: authority.auxiliaryPlanArtifactByteHash, auxiliaryPlanAuthorityHash: authority.auxiliaryPlanAuthorityHash,
    currentStateHash: authority.classificationPlan.currentStateHash, outcomeReceiptHash: authority.classificationPlan.outcomeReceiptHash, journalChainHash: authority.classificationPlan.journalChainHash, mutationId: authority.mutationId, childCheckpointAuthorityHash: authority.childCheckpointAuthorityHash,
    historicalFilesystemObservationsOnly: true, currentStateGuaranteed: false, classificationAuthorityGranted: false, recoveryAuthorityGranted: false, historyAuthorityGranted: false, historyApprovalCreated: false, historyWriteAuthorityGranted: false, executionAuthorityGranted: false, writesAllowed: false, effects: effects()
  };
  return deepFreeze({ ...core, verificationHash: hashCanonical(core) });
}

module.exports = { verifySavedCreatorResultClassificationFromVault };
