'use strict';

const REGISTRY_VERSION = 1;
const hashes = (byteHash, semanticHash, authorityHash) => ({ byteHash, semanticHash, authorityHash });
const role = (id, storage, schema, contractId, independentHashes, authorityBinding, authorityBindingJustification, cardinality, producedBy) => ({
  id, storage, schema, contractId, independentHashes, authorityBinding, authorityBindingJustification, cardinality, producedBy
});
const namedArtifact = (id, schema, contractId, producedBy, min = 1, max = 1) => role(id, 'artifact', schema, contractId, hashes(true, true, true), 'descriptor-and-named-authority', null, { min, max }, producedBy);
const describedArtifact = (id, schema, contractId, producedBy, justification, min = 1, max = 1) => role(id, 'artifact', schema, contractId, hashes(true, schema !== null, false), 'descriptor-only', justification, { min, max }, producedBy);
const describedSemanticContractArtifact = (id, contractId, producedBy, justification, min = 1, max = 1) => role(id, 'artifact', null, contractId, hashes(true, true, false), 'descriptor-only', justification, { min, max }, producedBy);
const namedBinary = (id, contractId, producedBy, min = 1, max = 1) => role(id, 'binary', null, contractId, hashes(true, false, true), 'descriptor-and-named-authority', null, { min, max }, producedBy);
const replay = (id, module, exportName, observationClass, canonicalComparisonOnly) => ({
  id, version: 1, module, export: exportName, observationClass, writes: false, processes: false,
  approvalsGranted: false, backendExecution: false, canonicalComparisonOnly
});
const state = (stateName, phaseId, authoritative, supportStatus, prerequisiteIds, evidenceRoles, replayContract, notes) => ({
  state: stateName, phaseId, authoritative, supportStatus, prerequisiteIds, evidenceRoles, replayContract, notes
});

const rows = [
  state('Draft', 'sff09-draft', false, 'contract-missing', ['contract-draft-evidence-v1'], [], null, ['state-not-authoritative']),
  state('ProjectionReview', 'sff10-projection-review', true, 'replay-available', [], [
    namedArtifact('target-projection-input', null, 'creator-target-projection-input-v1', 'sff09-draft'),
    namedArtifact('saved-target-projection-plan', 'ikemaker.sff-creator-target-projection', null, 'sff10-projection-review')
  ], replay('target-projection-replay', './sff_creator_target_projection', 'createCreatorTargetProjection', 'in-memory', false), ['pure-replay']),
  state('ProjectionApproved', 'sff11-projection-approved', true, 'replay-available', [], [
    namedArtifact('projection-approval-input', null, 'creator-projection-approval-input-v1', 'sff10-projection-review'),
    namedArtifact('saved-target-projection-artifact', 'ikemaker.sff-creator-target-projection', null, 'sff10-projection-review'),
    namedArtifact('saved-approved-v2-specification', 'ikemaker.sff-creator-approved-v2-specification', null, 'sff11-projection-approved')
  ], replay('projection-approval-replay', './sff_creator_target_projection_approval', 'approveCreatorTargetProjection', 'in-memory', true), ['canonical-artifact-comparison', 'saved-approval-required']),
  state('CapabilityBlocked', 'sff10-capability-blocked', false, 'contract-missing', ['contract-capability-blocked-evidence-v1'], [
    describedArtifact('capability-report', 'ikemaker.sff-capability-report', null, 'sff10-projection-review', 'Capability reports predate named vault authority and remain descriptor-bound.')
  ], null, ['state-not-authoritative']),
  state('RequestReady', 'sff12-request-ready', true, 'replay-available', [], [
    namedArtifact('approved-request-input', null, 'creator-approved-request-input-v1', 'sff11-projection-approved'),
    namedArtifact('saved-approved-v2-specification', 'ikemaker.sff-creator-approved-v2-specification', null, 'sff11-projection-approved'),
    namedArtifact('saved-approved-adapter-request', 'ikemaker.sff-creator-approved-adapter-request', null, 'sff12-request-ready')
  ], replay('approved-request-replay', './sff_creator_approved_request', 'createCreatorApprovedAdapterRequest', 'in-memory', false), ['pure-replay']),
  state('CandidateBuilt', 'sff13-candidate-built', true, 'replay-available', [], [
    namedArtifact('candidate-built-replay-manifest', 'ikemaker.sff-creator-candidate-built-replay-manifest', null, 'sff13-candidate-built'),
    namedArtifact('legacy-sff-build-specification', 'ikemaker.sff-build-specification', null, 'sff13-candidate-built'),
    namedArtifact('target-projection', 'ikemaker.sff-creator-target-projection', null, 'sff13-candidate-built'),
    namedArtifact('saved-approved-v2-specification', 'ikemaker.sff-creator-approved-v2-specification', null, 'sff13-candidate-built'),
    namedArtifact('saved-sff12-approved-adapter-request', 'ikemaker.sff-creator-approved-adapter-request', null, 'sff13-candidate-built'),
    namedBinary('packed-source-collections-with-manifest-mapping', 'creator-candidate-built-packed-source-collection-v2', 'sff13-candidate-built', 1, 128),
    namedArtifact('candidate-dispatch-receipt', 'ikemaker.sff-creator-candidate-dispatch-receipt', null, 'sff13-candidate-built'),
    namedBinary('candidate-collections', 'strict-sff-candidate-packed-collection-v2', 'sff13-candidate-built', 1, 128),
    namedArtifact('saved-candidate-evidence-verification', 'ikemaker.sff-creator-candidate-evidence-verification', null, 'sff13-candidate-built')
  ], replay('candidate-built-vault-replay', './sff_creator_candidate_built_replay', 'verifyCreatorCandidateBuiltReplayFromVault', 'filesystem-read-only', true), ['canonical-artifact-comparison', 'packed-source-mapping-verified', 'b1-head-reopened-after-hydration']),
  state('CandidatePersisted', 'sff14-candidate-persisted', true, 'replay-available', [], [
    namedArtifact('candidate-persisted-replay-manifest', 'ikemaker.sff-creator-candidate-persisted-replay-manifest', null, 'sff14-candidate-persisted'),
    namedArtifact('legacy-sff-build-specification', 'ikemaker.sff-build-specification', null, 'sff13-candidate-built'),
    namedArtifact('target-projection', 'ikemaker.sff-creator-target-projection', null, 'sff13-candidate-built'),
    namedArtifact('saved-approved-v2-specification', 'ikemaker.sff-creator-approved-v2-specification', null, 'sff13-candidate-built'),
    namedArtifact('saved-sff12-approved-adapter-request', 'ikemaker.sff-creator-approved-adapter-request', null, 'sff13-candidate-built'),
    namedBinary('packed-source-collections-with-manifest-mapping', 'creator-candidate-built-packed-source-collection-v2', 'sff13-candidate-built', 1, 128),
    namedArtifact('candidate-dispatch-receipt', 'ikemaker.sff-creator-candidate-dispatch-receipt', null, 'sff13-candidate-built'),
    namedBinary('candidate-collections-and-persisted-comparison-source', 'strict-sff-candidate-packed-collection-v2', 'sff13-candidate-built', 1, 128),
    namedArtifact('saved-candidate-evidence-verification', 'ikemaker.sff-creator-candidate-evidence-verification', null, 'sff13-candidate-built'),
    namedArtifact('candidate-persistence-receipt', 'ikemaker.sff-creator-persisted-candidate-receipt', null, 'sff14-candidate-persisted')
  ], replay('candidate-persisted-vault-replay', './sff_creator_candidate_persisted_replay', 'verifyCreatorCandidatePersistedReplayFromVault', 'filesystem-read-only', true), ['canonical-artifact-comparison', 'persisted-byte-equality-verified', 'b1-head-reopened-after-hydration']),
  state('AdoptionReview', 'sff15-adoption-review', true, 'replay-available', [], [
    namedArtifact('candidate-persisted-adoption-review-route-manifest', 'ikemaker.sff-creator-lifecycle-route-manifest', null, 'sff15-adoption-review'),
    namedArtifact('legacy-sff-build-specification', 'ikemaker.sff-build-specification', null, 'sff13-candidate-built'),
    namedArtifact('target-projection', 'ikemaker.sff-creator-target-projection', null, 'sff13-candidate-built'),
    namedArtifact('saved-approved-v2-specification', 'ikemaker.sff-creator-approved-v2-specification', null, 'sff13-candidate-built'),
    namedArtifact('saved-sff12-approved-adapter-request', 'ikemaker.sff-creator-approved-adapter-request', null, 'sff13-candidate-built'),
    namedBinary('packed-source-collections-with-manifest-mapping', 'creator-candidate-built-packed-source-collection-v2', 'sff13-candidate-built', 1, 128),
    namedArtifact('candidate-dispatch-receipt', 'ikemaker.sff-creator-candidate-dispatch-receipt', null, 'sff13-candidate-built'),
    namedBinary('candidate-collections-and-persisted-comparison-source', 'strict-sff-candidate-packed-collection-v2', 'sff13-candidate-built', 1, 128),
    namedArtifact('saved-candidate-evidence-verification', 'ikemaker.sff-creator-candidate-evidence-verification', null, 'sff13-candidate-built'),
    namedArtifact('candidate-persistence-receipt', 'ikemaker.sff-creator-persisted-candidate-receipt', null, 'sff14-candidate-persisted'),
    namedArtifact('saved-adoption-plan', 'ikemaker.sff-creator-adoption-plan', null, 'sff15-adoption-review')
  ], replay('candidate-persisted-adoption-review-route-replay', './sff_creator_lifecycle_route_bridge', 'verifyCreatorLifecycleRouteBridgeFromVault', 'filesystem-read-only', true), ['canonical-artifact-comparison', 'active-archive-live-observation', 'current-state-not-guaranteed']),
  state('AdoptionApproved', 'sff16-adoption-approved', true, 'replay-available', [], [
    namedArtifact('adoption-review-approved-route-manifest', 'ikemaker.sff-creator-lifecycle-route-manifest', null, 'sff16-adoption-approved'),
    namedArtifact('legacy-sff-build-specification', 'ikemaker.sff-build-specification', null, 'sff13-candidate-built'),
    namedArtifact('target-projection', 'ikemaker.sff-creator-target-projection', null, 'sff13-candidate-built'),
    namedArtifact('saved-approved-v2-specification', 'ikemaker.sff-creator-approved-v2-specification', null, 'sff13-candidate-built'),
    namedArtifact('saved-sff12-approved-adapter-request', 'ikemaker.sff-creator-approved-adapter-request', null, 'sff13-candidate-built'),
    namedBinary('packed-source-collections-with-manifest-mapping', 'creator-candidate-built-packed-source-collection-v2', 'sff13-candidate-built', 1, 128),
    namedArtifact('candidate-dispatch-receipt', 'ikemaker.sff-creator-candidate-dispatch-receipt', null, 'sff13-candidate-built'),
    namedBinary('candidate-collections-and-persisted-comparison-source', 'strict-sff-candidate-packed-collection-v2', 'sff13-candidate-built', 1, 128),
    namedArtifact('saved-candidate-evidence-verification', 'ikemaker.sff-creator-candidate-evidence-verification', null, 'sff13-candidate-built'),
    namedArtifact('candidate-persistence-receipt', 'ikemaker.sff-creator-persisted-candidate-receipt', null, 'sff14-candidate-persisted'),
    namedArtifact('saved-adoption-plan', 'ikemaker.sff-creator-adoption-plan', null, 'sff15-adoption-review'),
    namedArtifact('saved-adoption-approval-receipt', 'ikemaker.sff-creator-adoption-plan-approval-receipt', null, 'sff16-adoption-approved')
  ], replay('candidate-adoption-approved-route-replay', './sff_creator_lifecycle_route_bridge', 'verifyCreatorAdoptionApprovedRouteBridgeFromVault', 'filesystem-read-only', true), ['canonical-artifact-comparison', 'active-archive-live-observation', 'saved-approval-required', 'current-state-not-guaranteed']),
  state('LayoutReview', 'sff17a-layout-review', true, 'replay-available', [], [
    namedArtifact('adoption-approved-layout-review-route-manifest', 'ikemaker.sff-creator-lifecycle-route-manifest', null, 'sff17a-layout-review'),
    namedArtifact('legacy-sff-build-specification', 'ikemaker.sff-build-specification', null, 'sff13-candidate-built'),
    namedArtifact('target-projection', 'ikemaker.sff-creator-target-projection', null, 'sff13-candidate-built'),
    namedArtifact('saved-approved-v2-specification', 'ikemaker.sff-creator-approved-v2-specification', null, 'sff13-candidate-built'),
    namedArtifact('saved-sff12-approved-adapter-request', 'ikemaker.sff-creator-approved-adapter-request', null, 'sff13-candidate-built'),
    namedBinary('packed-source-collections-with-manifest-mapping', 'creator-candidate-built-packed-source-collection-v2', 'sff13-candidate-built', 1, 128),
    namedArtifact('candidate-dispatch-receipt', 'ikemaker.sff-creator-candidate-dispatch-receipt', null, 'sff13-candidate-built'),
    namedBinary('candidate-collections-and-persisted-comparison-source', 'strict-sff-candidate-packed-collection-v2', 'sff13-candidate-built', 1, 128),
    namedArtifact('saved-candidate-evidence-verification', 'ikemaker.sff-creator-candidate-evidence-verification', null, 'sff13-candidate-built'),
    namedArtifact('candidate-persistence-receipt', 'ikemaker.sff-creator-persisted-candidate-receipt', null, 'sff14-candidate-persisted'),
    namedArtifact('saved-adoption-plan', 'ikemaker.sff-creator-adoption-plan', null, 'sff15-adoption-review'),
    namedArtifact('saved-adoption-approval-receipt', 'ikemaker.sff-creator-adoption-plan-approval-receipt', null, 'sff16-adoption-approved'),
    namedArtifact('replacement-capability-evidence', 'ikemaker.sff-replacement-capability-evidence', null, 'sff17a-layout-review'),
    namedArtifact('saved-execution-layout-plan', 'ikemaker.sff-creator-execution-layout-plan', null, 'sff17a-layout-review')
  ], replay('adoption-approved-layout-review-route-replay', './sff_creator_lifecycle_route_bridge', 'verifyCreatorLayoutReviewRouteBridgeFromVault', 'filesystem-read-only', true), ['canonical-artifact-comparison', 'filesystem-observation-transient', 'current-state-not-guaranteed']),
  state('ExecutionApproved', 'sff17b-execution-approved', true, 'replay-available', [], [
    namedArtifact('layout-review-execution-approved-route-manifest', 'ikemaker.sff-creator-lifecycle-route-manifest', null, 'sff17b-execution-approved'),
    namedArtifact('legacy-sff-build-specification', 'ikemaker.sff-build-specification', null, 'sff13-candidate-built'),
    namedArtifact('target-projection', 'ikemaker.sff-creator-target-projection', null, 'sff13-candidate-built'),
    namedArtifact('saved-approved-v2-specification', 'ikemaker.sff-creator-approved-v2-specification', null, 'sff13-candidate-built'),
    namedArtifact('saved-sff12-approved-adapter-request', 'ikemaker.sff-creator-approved-adapter-request', null, 'sff13-candidate-built'),
    namedBinary('packed-source-collections-with-manifest-mapping', 'creator-candidate-built-packed-source-collection-v2', 'sff13-candidate-built', 1, 128),
    namedArtifact('candidate-dispatch-receipt', 'ikemaker.sff-creator-candidate-dispatch-receipt', null, 'sff13-candidate-built'),
    namedBinary('candidate-collections-and-persisted-comparison-source', 'strict-sff-candidate-packed-collection-v2', 'sff13-candidate-built', 1, 128),
    namedArtifact('saved-candidate-evidence-verification', 'ikemaker.sff-creator-candidate-evidence-verification', null, 'sff13-candidate-built'),
    namedArtifact('candidate-persistence-receipt', 'ikemaker.sff-creator-persisted-candidate-receipt', null, 'sff14-candidate-persisted'),
    namedArtifact('saved-adoption-plan', 'ikemaker.sff-creator-adoption-plan', null, 'sff15-adoption-review'),
    namedArtifact('saved-adoption-approval-receipt', 'ikemaker.sff-creator-adoption-plan-approval-receipt', null, 'sff16-adoption-approved'),
    namedArtifact('replacement-capability-evidence', 'ikemaker.sff-replacement-capability-evidence', null, 'sff17a-layout-review'),
    namedArtifact('saved-execution-layout-plan', 'ikemaker.sff-creator-execution-layout-plan', null, 'sff17a-layout-review'),
    namedArtifact('saved-layout-approval-receipt', 'ikemaker.sff-creator-execution-layout-approval-receipt', null, 'sff17b-execution-approved')
  ], replay('layout-review-execution-approved-route-replay', './sff_creator_lifecycle_route_bridge', 'verifyCreatorExecutionApprovedRouteBridgeFromVault', 'filesystem-read-only', true), ['canonical-artifact-comparison', 'filesystem-observation-transient', 'current-state-not-guaranteed']),
  state('Executing', 'sff17c-executing', true, 'replay-available', [], [
    namedArtifact('executing-phase-root-xor', null, 'sff17c-executing-phase-root-xor-v1', 'sff17c-executing'),
    namedArtifact('target-projection', 'ikemaker.sff-creator-target-projection', null, 'sff13-candidate-built'),
    namedArtifact('saved-approved-v2-specification', 'ikemaker.sff-creator-approved-v2-specification', null, 'sff13-candidate-built'),
    namedArtifact('saved-sff12-approved-adapter-request', 'ikemaker.sff-creator-approved-adapter-request', null, 'sff13-candidate-built'),
    namedBinary('packed-source-collections-with-manifest-mapping', 'creator-candidate-built-packed-source-collection-v2', 'sff13-candidate-built', 1, 128),
    namedArtifact('candidate-dispatch-receipt', 'ikemaker.sff-creator-candidate-dispatch-receipt', null, 'sff13-candidate-built'),
    namedBinary('candidate-collections-and-persisted-comparison-source', 'strict-sff-candidate-packed-collection-v2', 'sff13-candidate-built', 1, 128),
    namedArtifact('saved-candidate-evidence-verification', 'ikemaker.sff-creator-candidate-evidence-verification', null, 'sff13-candidate-built'),
    namedArtifact('candidate-persistence-receipt', 'ikemaker.sff-creator-persisted-candidate-receipt', null, 'sff14-candidate-persisted'),
    namedArtifact('saved-adoption-plan', 'ikemaker.sff-creator-adoption-plan', null, 'sff15-adoption-review'),
    namedArtifact('saved-adoption-approval-receipt', 'ikemaker.sff-creator-adoption-plan-approval-receipt', null, 'sff16-adoption-approved'),
    namedArtifact('replacement-capability-evidence', 'ikemaker.sff-replacement-capability-evidence', null, 'sff17a-layout-review'),
    namedArtifact('saved-execution-layout-authority-artifacts', null, 'sff17-layout-plan-and-approval-artifacts-v1', 'sff17b-execution-approved', 2, 2),
    namedArtifact('execution-intent-and-executor-authority-artifacts', null, 'sff17c-execution-intent-and-authority-artifacts-v1', 'sff17c-executing', 2, 2),
    namedArtifact('conditional-result-capture-evidence', null, 'sff17d-result-capture-evidence-v1', 'sff17c-executing', 0, 67)
  ], replay('executing-phase-replay', './sff_creator_executing_phase_verifier', 'verifyCreatorExecutingPhaseFromVault', 'filesystem-read-only', true), ['canonical-artifact-comparison', 'phase-root-xor-enforced', 'legacy-specification-bound-by-integration-authority', 'result-capture-evidence-conditional', 'current-state-not-guaranteed']),
  state('TerminalNeedsHistory', 'sff18-terminal-needs-history', true, 'replay-available', [], [
    namedArtifact('result-classification-route-manifest', 'ikemaker.sff-creator-result-classification-route-manifest', null, 'sff18-terminal-needs-history'),
    describedSemanticContractArtifact('immutable-result-captured-predecessor-relationship', 'sff17d-result-captured-immediate-predecessor-v1', 'sff18-terminal-needs-history', 'The immutable predecessor checkpoint and retained ResultCaptured root are descriptor-bound B1 evidence.'),
    namedArtifact('saved-result-classification-plan', 'ikemaker.sff-creator-result-captured-classification-plan', null, 'sff18-terminal-needs-history'),
    namedArtifact('saved-history-reconciliation-plan', 'ikemaker.sff-creator-history-reconciliation-plan', null, 'sff18-terminal-needs-history'),
    namedArtifact('inherited-result-capture-evidence', null, 'sff17d-result-capture-retained-evidence-v1', 'sff17c-executing', 1, 128)
  ], replay('saved-result-classification-replay', './sff_creator_saved_result_classification_verifier', 'verifySavedCreatorResultClassificationFromVault', 'filesystem-read-only', true), ['canonical-artifact-comparison', 'historical-filesystem-observations-only']),
  state('HistoryReview', 'sff18a-history-review', true, 'replay-available', [], [
    namedArtifact('history-review-route-manifest', 'ikemaker.sff-creator-history-review-route-manifest', null, 'sff18a-history-review'),
    namedArtifact('history-reconciliation-plan', 'ikemaker.sff-creator-history-reconciliation-plan', null, 'sff18a-history-review'),
    namedArtifact('saved-history-reconciliation-approval-receipt', 'ikemaker.sff-creator-history-reconciliation-approval-receipt', null, 'sff18a-history-review')
  ], replay('saved-history-review-replay', './sff_creator_saved_history_review_verifier', 'verifySavedCreatorHistoryReviewFromVault', 'filesystem-read-only', true), ['canonical-artifact-comparison', 'history-write-authority-not-granted']),
  state('Completed', 'sff19da-completed', true, 'terminal-b1-verified', [], [
    describedArtifact('completed-vault-checkpoint', 'ikemaker.sff-creator-operation-vault-checkpoint', null, 'sff19da-completed', 'The Completed checkpoint is the exact B1 head descriptor and is not an artifactAuthorities payload.'),
    namedArtifact('saved-history-reconciliation-approval-receipt', 'ikemaker.sff-creator-history-reconciliation-approval-receipt', null, 'sff18a-history-review'),
    namedArtifact('saved-history-writer-receipt', 'ikemaker.sff-creator-history-write-receipt', null, 'sff18a-history-review'),
    describedArtifact('immutable-history-record', 'ikemaker.sff-creator-history-record', null, 'sff18a-history-review', 'The immutable record is reopened from the sealed external history root and is not a vault artifactAuthorities payload.'),
    describedArtifact('optional-completion-cleanup-marker', 'ikemaker.sff-creator-operation-vault-completion-cleanup-marker', null, 'sff19da-completed', 'The operation-vault-owned marker is bound to the exact Completed head and records durable capsule cleanup.', 0, 1)
  ], replay('saved-completed-replay', './sff_creator_saved_completed_verifier', 'verifySavedCreatorCompletedFromVault', 'filesystem-read-only', true), ['b1-head-snapshot-required', 'embedded-terminal-history-evidence-validated', 'immediately-preceding-history-review-validated', 'completion-cleanup-marker-validated']),
  state('CancelledBeforeMutation', 'sff17c-cancelled-before-mutation', false, 'contract-missing', ['contract-cancelled-before-mutation-v1'], [
    describedArtifact('cancellation-receipt', null, 'cancelled-before-mutation-receipt-v1', 'sff17c-executing', 'No registered named authority contract exists for the cancellation receipt.')
  ], null, ['state-not-authoritative']),
  state('RestartRecoveryRequired', 'sff19a-restart-recovery-required', true, 'replay-available', [], [
    namedArtifact('result-classification-route-manifest', 'ikemaker.sff-creator-result-classification-route-manifest', null, 'sff19a-restart-recovery-required'),
    describedSemanticContractArtifact('immutable-result-captured-predecessor-relationship', 'sff17d-result-captured-immediate-predecessor-v1', 'sff19a-restart-recovery-required', 'The immutable predecessor checkpoint and retained ResultCaptured root are descriptor-bound B1 evidence.'),
    namedArtifact('saved-result-classification-plan', 'ikemaker.sff-creator-result-captured-classification-plan', null, 'sff19a-restart-recovery-required'),
    namedArtifact('saved-restart-recovery-plan', 'ikemaker.sff-creator-restart-recovery-plan', null, 'sff19a-restart-recovery-required'),
    namedArtifact('inherited-result-capture-evidence', null, 'sff17d-result-capture-retained-evidence-v1', 'sff17c-executing', 1, 128)
  ], replay('saved-result-classification-replay', './sff_creator_saved_result_classification_verifier', 'verifySavedCreatorResultClassificationFromVault', 'filesystem-read-only', true), ['canonical-artifact-comparison', 'historical-filesystem-observations-only']),
  state('ManualRecoveryRequired', 'sff19a-manual-recovery-required', true, 'replay-available', [], [
    namedArtifact('result-classification-route-manifest', 'ikemaker.sff-creator-result-classification-route-manifest', null, 'sff19a-manual-recovery-required'),
    describedSemanticContractArtifact('immutable-result-captured-predecessor-relationship', 'sff17d-result-captured-immediate-predecessor-v1', 'sff19a-manual-recovery-required', 'The immutable predecessor checkpoint and retained ResultCaptured root are descriptor-bound B1 evidence.'),
    namedArtifact('saved-result-classification-plan', 'ikemaker.sff-creator-result-captured-classification-plan', null, 'sff19a-manual-recovery-required'),
    namedArtifact('saved-restart-recovery-plan', 'ikemaker.sff-creator-restart-recovery-plan', null, 'sff19a-manual-recovery-required'),
    namedArtifact('inherited-result-capture-evidence', null, 'sff17d-result-capture-retained-evidence-v1', 'sff17c-executing', 1, 128)
  ], replay('saved-result-classification-replay', './sff_creator_saved_result_classification_verifier', 'verifySavedCreatorResultClassificationFromVault', 'filesystem-read-only', true), ['canonical-artifact-comparison', 'historical-filesystem-observations-only']),
  state('ExternalLegacyRoute', 'external-legacy-route', false, 'contract-missing', ['contract-external-legacy-route-v1'], [], null, ['external-route-not-dispatched']),
  state('ExternalNeedsRunner', 'external-needs-runner', false, 'contract-missing', ['contract-external-needs-runner-v1'], [], null, ['external-runner-not-dispatched'])
];

const integrationAuthorityStates = new Set(['CandidateBuilt', 'CandidatePersisted', 'AdoptionReview', 'AdoptionApproved', 'LayoutReview', 'ExecutionApproved', 'Executing', 'TerminalNeedsHistory', 'HistoryReview', 'Completed', 'RestartRecoveryRequired', 'ManualRecoveryRequired']);
for (const row of rows) if (integrationAuthorityStates.has(row.state)) {
  row.evidenceRoles.unshift(namedArtifact('retained-integration-and-state-root-authorities', null, 'sff13-integration-and-state-root-authorities-v1', 'sff13-candidate-built', 2, 2));
  row.notes.unshift('integration-semantics-established-at-candidate-built-and-retained-by-verified-checkpoint-chain');
}

const authorityByState = new Map(rows.map((row) => [row.state, row.authoritative]));
// An edge is implemented only when both endpoint states can already be established by implemented evidence contracts.
const edge = (from, to, kind) => ({ from, to, kind, implementedEvidenceContract: authorityByState.get(from) === true && authorityByState.get(to) === true });
const legalGraphOnly = [
  edge('Draft', 'ProjectionReview', 'forward'),
  edge('ProjectionReview', 'ProjectionApproved', 'forward'), edge('ProjectionReview', 'Draft', 'back'), edge('ProjectionReview', 'CancelledBeforeMutation', 'cancel'),
  edge('ProjectionApproved', 'CapabilityBlocked', 'blocked'), edge('ProjectionApproved', 'RequestReady', 'forward'), edge('ProjectionApproved', 'ExternalLegacyRoute', 'external'), edge('ProjectionApproved', 'ExternalNeedsRunner', 'external'),
  edge('CapabilityBlocked', 'ProjectionReview', 'review-back'), edge('CapabilityBlocked', 'ExternalLegacyRoute', 'external'), edge('CapabilityBlocked', 'CancelledBeforeMutation', 'cancel'),
  edge('RequestReady', 'CandidateBuilt', 'forward'), edge('RequestReady', 'ExternalNeedsRunner', 'external'), edge('RequestReady', 'CancelledBeforeMutation', 'cancel'),
  edge('CandidateBuilt', 'CandidatePersisted', 'forward'), edge('CandidateBuilt', 'RequestReady', 'back'), edge('CandidateBuilt', 'CancelledBeforeMutation', 'cancel'),
  edge('CandidatePersisted', 'AdoptionReview', 'forward'), edge('CandidatePersisted', 'CancelledBeforeMutation', 'cancel'),
  edge('AdoptionReview', 'CandidatePersisted', 'review-back'), edge('AdoptionReview', 'AdoptionApproved', 'forward'), edge('AdoptionReview', 'CancelledBeforeMutation', 'cancel'),
  edge('AdoptionApproved', 'LayoutReview', 'forward'),
  edge('LayoutReview', 'ExecutionApproved', 'forward'), edge('LayoutReview', 'AdoptionReview', 'review-back'), edge('LayoutReview', 'CancelledBeforeMutation', 'cancel'),
  edge('ExecutionApproved', 'Executing', 'forward'), edge('ExecutionApproved', 'CancelledBeforeMutation', 'cancel'),
  edge('Executing', 'Executing', 'phase-progress-result-capture'), edge('Executing', 'TerminalNeedsHistory', 'terminal'), edge('Executing', 'RestartRecoveryRequired', 'recovery'), edge('Executing', 'ManualRecoveryRequired', 'recovery'),
  edge('RestartRecoveryRequired', 'RestartRecoveryRequired', 'same-state-recovery-phase'), edge('RestartRecoveryRequired', 'Executing', 'recovery-resume'), edge('RestartRecoveryRequired', 'TerminalNeedsHistory', 'recovery-terminal'), edge('RestartRecoveryRequired', 'ManualRecoveryRequired', 'recovery-branch'),
  edge('ManualRecoveryRequired', 'ManualRecoveryRequired', 'same-state-recovery-phase'),
  edge('TerminalNeedsHistory', 'TerminalNeedsHistory', 'same-state-history-phase'), edge('TerminalNeedsHistory', 'HistoryReview', 'forward'),
  edge('HistoryReview', 'HistoryReview', 'same-state-history-phase'), edge('HistoryReview', 'Completed', 'forward'), edge('HistoryReview', 'TerminalNeedsHistory', 'review-back'), edge('HistoryReview', 'ManualRecoveryRequired', 'manual-recovery'),
  edge('ExternalLegacyRoute', 'ExternalNeedsRunner', 'external'), edge('ExternalNeedsRunner', 'ExternalLegacyRoute', 'external'), edge('ExternalLegacyRoute', 'CandidateBuilt', 'external'), edge('ExternalNeedsRunner', 'CandidateBuilt', 'external'),
  edge('Completed', 'Completed', 'same-state-terminal-verification')
];

const registry = { schema: 'ikemaker.sff-creator-lifecycle-evidence-registry', version: 1, registryVersion: REGISTRY_VERSION, states: rows, legalGraphOnly, registryHash: '24563ee79c457912960fe59789edd15f4af0de86ac4f2c50effb39a5f0b18ce8' };
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(deepFreeze); return value; }
const CREATOR_LIFECYCLE_EVIDENCE_REGISTRY = deepFreeze(registry);
const REGISTRY_HASH = CREATOR_LIFECYCLE_EVIDENCE_REGISTRY.registryHash;
function getCreatorLifecycleEvidenceRegistry() { return CREATOR_LIFECYCLE_EVIDENCE_REGISTRY; }

module.exports = { CREATOR_LIFECYCLE_EVIDENCE_REGISTRY, REGISTRY_HASH, REGISTRY_VERSION, getCreatorLifecycleEvidenceRegistry };
