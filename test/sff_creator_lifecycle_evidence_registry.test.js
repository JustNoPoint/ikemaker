'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { hashCanonical } = require('../src/sff_capability_report');
const {
  CREATOR_LIFECYCLE_EVIDENCE_REGISTRY: registry,
  REGISTRY_HASH,
  REGISTRY_VERSION,
  getCreatorLifecycleEvidenceRegistry
} = require('../src/sff_creator_lifecycle_evidence_registry');

const expectedStates = [
  'Draft', 'ProjectionReview', 'ProjectionApproved', 'CapabilityBlocked', 'RequestReady',
  'CandidateBuilt', 'CandidatePersisted', 'AdoptionReview', 'AdoptionApproved', 'LayoutReview',
  'ExecutionApproved', 'Executing', 'TerminalNeedsHistory', 'HistoryReview', 'Completed',
  'CancelledBeforeMutation', 'RestartRecoveryRequired', 'ManualRecoveryRequired',
  'ExternalLegacyRoute', 'ExternalNeedsRunner'
];
const expectedStatuses = {
  Draft: 'contract-missing', ProjectionReview: 'replay-available', ProjectionApproved: 'replay-available', CapabilityBlocked: 'contract-missing', RequestReady: 'replay-available',
  CandidateBuilt: 'replay-available', CandidatePersisted: 'replay-available', AdoptionReview: 'replay-available', AdoptionApproved: 'replay-available', LayoutReview: 'replay-available',
  ExecutionApproved: 'replay-available', Executing: 'replay-available', TerminalNeedsHistory: 'replay-available', HistoryReview: 'replay-available', Completed: 'terminal-b1-verified',
  CancelledBeforeMutation: 'contract-missing', RestartRecoveryRequired: 'replay-available', ManualRecoveryRequired: 'replay-available', ExternalLegacyRoute: 'contract-missing', ExternalNeedsRunner: 'contract-missing'
};
const expectedReplay = {
  ProjectionReview: ['target-projection-replay', './sff_creator_target_projection', 'createCreatorTargetProjection', 'in-memory', false],
  ProjectionApproved: ['projection-approval-replay', './sff_creator_target_projection_approval', 'approveCreatorTargetProjection', 'in-memory', true],
  RequestReady: ['approved-request-replay', './sff_creator_approved_request', 'createCreatorApprovedAdapterRequest', 'in-memory', false],
  CandidateBuilt: ['candidate-built-vault-replay', './sff_creator_candidate_built_replay', 'verifyCreatorCandidateBuiltReplayFromVault', 'filesystem-read-only', true],
  CandidatePersisted: ['candidate-persisted-vault-replay', './sff_creator_candidate_persisted_replay', 'verifyCreatorCandidatePersistedReplayFromVault', 'filesystem-read-only', true],
  AdoptionReview: ['candidate-persisted-adoption-review-route-replay', './sff_creator_lifecycle_route_bridge', 'verifyCreatorLifecycleRouteBridgeFromVault', 'filesystem-read-only', true],
  AdoptionApproved: ['candidate-adoption-approved-route-replay', './sff_creator_lifecycle_route_bridge', 'verifyCreatorAdoptionApprovedRouteBridgeFromVault', 'filesystem-read-only', true],
  LayoutReview: ['adoption-approved-layout-review-route-replay', './sff_creator_lifecycle_route_bridge', 'verifyCreatorLayoutReviewRouteBridgeFromVault', 'filesystem-read-only', true],
  ExecutionApproved: ['layout-review-execution-approved-route-replay', './sff_creator_lifecycle_route_bridge', 'verifyCreatorExecutionApprovedRouteBridgeFromVault', 'filesystem-read-only', true],
  Executing: ['executing-phase-replay', './sff_creator_executing_phase_verifier', 'verifyCreatorExecutingPhaseFromVault', 'filesystem-read-only', true],
  TerminalNeedsHistory: ['saved-result-classification-replay', './sff_creator_saved_result_classification_verifier', 'verifySavedCreatorResultClassificationFromVault', 'filesystem-read-only', true],
  HistoryReview: ['saved-history-review-replay', './sff_creator_saved_history_review_verifier', 'verifySavedCreatorHistoryReviewFromVault', 'filesystem-read-only', true],
  Completed: ['saved-completed-replay', './sff_creator_saved_completed_verifier', 'verifySavedCreatorCompletedFromVault', 'filesystem-read-only', true],
  RestartRecoveryRequired: ['saved-result-classification-replay', './sff_creator_saved_result_classification_verifier', 'verifySavedCreatorResultClassificationFromVault', 'filesystem-read-only', true],
  ManualRecoveryRequired: ['saved-result-classification-replay', './sff_creator_saved_result_classification_verifier', 'verifySavedCreatorResultClassificationFromVault', 'filesystem-read-only', true]
};
const replayEvidence = {
  ProjectionReview: ['target-projection-input', 'saved-target-projection-plan'],
  ProjectionApproved: ['projection-approval-input', 'saved-approved-v2-specification'],
  RequestReady: ['approved-request-input', 'saved-approved-adapter-request'],
  CandidateBuilt: ['candidate-built-replay-manifest', 'saved-candidate-evidence-verification'],
  CandidatePersisted: ['candidate-persisted-replay-manifest', 'candidate-persistence-receipt'],
  AdoptionReview: ['candidate-persisted-adoption-review-route-manifest', 'saved-adoption-plan'],
  AdoptionApproved: ['adoption-review-approved-route-manifest', 'saved-adoption-approval-receipt'],
  LayoutReview: ['adoption-approved-layout-review-route-manifest', 'saved-execution-layout-plan'],
  ExecutionApproved: ['layout-review-execution-approved-route-manifest', 'saved-layout-approval-receipt'],
  Executing: ['executing-phase-root-xor', 'execution-intent-and-executor-authority-artifacts'],
  TerminalNeedsHistory: ['result-classification-route-manifest', 'saved-history-reconciliation-plan'],
  HistoryReview: ['history-review-route-manifest', 'saved-history-reconciliation-approval-receipt'],
  Completed: ['saved-history-reconciliation-approval-receipt', 'saved-history-writer-receipt'],
  RestartRecoveryRequired: ['result-classification-route-manifest', 'saved-restart-recovery-plan'],
  ManualRecoveryRequired: ['result-classification-route-manifest', 'saved-restart-recovery-plan']
};
const keyset = (value) => Object.keys(value).sort();
const state = (name) => registry.states.find((row) => row.state === name);
const roleMap = (name) => new Map(state(name).evidenceRoles.map((role) => [role.id, role]));
function assertFrozen(value) { if (!value || typeof value !== 'object') return; assert.ok(Object.isFrozen(value)); Object.values(value).forEach(assertFrozen); }

assert.deepStrictEqual(keyset(registry), ['legalGraphOnly', 'registryHash', 'registryVersion', 'schema', 'states', 'version']);
assert.strictEqual(registry.schema, 'ikemaker.sff-creator-lifecycle-evidence-registry');
assert.strictEqual(registry.version, 1);
assert.strictEqual(registry.registryVersion, REGISTRY_VERSION);
assert.strictEqual(REGISTRY_VERSION, 1);
assert.match(REGISTRY_HASH, /^[0-9a-f]{64}$/);
const { registryHash, ...hashInput } = registry;
assert.strictEqual(registryHash, hashCanonical(hashInput));
assert.strictEqual(REGISTRY_HASH, registryHash);
assert.strictEqual(getCreatorLifecycleEvidenceRegistry(), registry);

assert.deepStrictEqual(registry.states.map((row) => row.state), expectedStates);
assert.strictEqual(new Set(registry.states.map((row) => row.state)).size, expectedStates.length);
assert.strictEqual(new Set(registry.states.map((row) => row.phaseId)).size, expectedStates.length);
const phaseIds = new Set(registry.states.map((row) => row.phaseId));
const prerequisiteIds = [];
for (const row of registry.states) {
  assert.deepStrictEqual(keyset(row), ['authoritative', 'evidenceRoles', 'notes', 'phaseId', 'prerequisiteIds', 'replayContract', 'state', 'supportStatus']);
  assert.match(row.phaseId, /^[a-z0-9][a-z0-9-]{2,63}$/);
  assert.strictEqual(row.supportStatus, expectedStatuses[row.state]);
  assert.strictEqual(row.authoritative, row.supportStatus === 'replay-available' || row.supportStatus === 'terminal-b1-verified');
  assert.ok(Array.isArray(row.prerequisiteIds) && row.prerequisiteIds.length <= 16);
  assert.strictEqual(new Set(row.prerequisiteIds).size, row.prerequisiteIds.length);
  row.prerequisiteIds.forEach((id) => { assert.match(id, /^[a-z0-9][a-z0-9-]{2,95}$/); prerequisiteIds.push(id); });
  if (row.supportStatus === 'verifier-required' || row.supportStatus === 'contract-missing') assert.ok(row.prerequisiteIds.length >= 1);
  else assert.deepStrictEqual(row.prerequisiteIds, []);
  assert.ok(Array.isArray(row.notes) && row.notes.length >= 1 && row.notes.length <= 8);
  assert.strictEqual(new Set(row.notes).size, row.notes.length);
  row.notes.forEach((note) => assert.match(note, /^[a-z0-9][a-z0-9-]{2,95}$/));
  assert.ok(Array.isArray(row.evidenceRoles) && row.evidenceRoles.length <= 16);
  assert.strictEqual(new Set(row.evidenceRoles.map((role) => role.id)).size, row.evidenceRoles.length);
  for (const role of row.evidenceRoles) {
    assert.deepStrictEqual(keyset(role), ['authorityBinding', 'authorityBindingJustification', 'cardinality', 'contractId', 'id', 'independentHashes', 'producedBy', 'schema', 'storage']);
    assert.match(role.id, /^[a-z][a-z0-9-]{1,63}$/);
    assert.ok(role.storage === 'artifact' || role.storage === 'binary');
    assert.notStrictEqual(role.schema === null, role.contractId === null);
    for (const name of ['schema', 'contractId']) assert.ok(role[name] === null || (typeof role[name] === 'string' && role[name].length >= 1 && role[name].length <= 128));
    assert.deepStrictEqual(keyset(role.independentHashes), ['authorityHash', 'byteHash', 'semanticHash']);
    for (const value of Object.values(role.independentHashes)) assert.strictEqual(typeof value, 'boolean');
    assert.deepStrictEqual(keyset(role.cardinality), ['max', 'min']);
    assert.ok(Number.isSafeInteger(role.cardinality.min) && role.cardinality.min >= 0 && role.cardinality.min <= 128);
    assert.ok(Number.isSafeInteger(role.cardinality.max) && role.cardinality.max >= role.cardinality.min && role.cardinality.max <= 128);
    assert.match(role.producedBy, /^[a-z0-9][a-z0-9-]{2,63}$/);
    assert.ok(phaseIds.has(role.producedBy));
    if (role.authorityBinding === 'descriptor-and-named-authority') {
      assert.strictEqual(role.authorityBindingJustification, null);
      assert.strictEqual(role.independentHashes.authorityHash, true);
    } else {
      assert.strictEqual(role.authorityBinding, 'descriptor-only');
      assert.ok(typeof role.authorityBindingJustification === 'string' && role.authorityBindingJustification.length >= 16 && role.authorityBindingJustification.length <= 256);
      assert.strictEqual(role.independentHashes.authorityHash, false);
    }
  }
  const expected = expectedReplay[row.state];
  if (!expected) {
    assert.strictEqual(row.replayContract, null);
  } else {
    const replay = row.replayContract;
    assert.deepStrictEqual(keyset(replay), ['approvalsGranted', 'backendExecution', 'canonicalComparisonOnly', 'export', 'id', 'module', 'observationClass', 'processes', 'version', 'writes']);
    assert.deepStrictEqual([replay.id, replay.module, replay.export, replay.observationClass, replay.canonicalComparisonOnly], expected);
    assert.strictEqual(replay.version, 1);
    assert.ok(replay.observationClass === 'in-memory' || replay.observationClass === 'filesystem-read-only');
    for (const field of ['writes', 'processes', 'approvalsGranted', 'backendExecution']) assert.strictEqual(replay[field], false);
    const implementation = require(path.join('../src', replay.module.slice(2)));
    assert.strictEqual(typeof implementation[replay.export], 'function');
    const retained = new Map(row.evidenceRoles.map((role) => [role.id, role]));
    const [inputRole, resultRole] = replayEvidence[row.state];
    assert.ok(retained.has(inputRole));
    if (!['CandidateBuilt', 'CandidatePersisted', 'AdoptionReview', 'AdoptionApproved', 'LayoutReview', 'ExecutionApproved', 'Executing', 'TerminalNeedsHistory', 'HistoryReview', 'Completed', 'RestartRecoveryRequired', 'ManualRecoveryRequired'].includes(row.state)) {
      assert.ok(inputRole.endsWith('-input'));
      assert.strictEqual(retained.get(inputRole).schema, null);
      assert.match(retained.get(inputRole).contractId, /-input-v1$/);
    } else if (row.state === 'Executing') { assert.strictEqual(retained.get(inputRole).schema, null); assert.strictEqual(retained.get(inputRole).contractId, 'sff17c-executing-phase-root-xor-v1'); }
    else assert.strictEqual(retained.get(inputRole).schema, row.state === 'CandidateBuilt' ? 'ikemaker.sff-creator-candidate-built-replay-manifest' : row.state === 'CandidatePersisted' ? 'ikemaker.sff-creator-candidate-persisted-replay-manifest' : ['TerminalNeedsHistory', 'RestartRecoveryRequired', 'ManualRecoveryRequired'].includes(row.state) ? 'ikemaker.sff-creator-result-classification-route-manifest' : row.state === 'HistoryReview' ? 'ikemaker.sff-creator-history-review-route-manifest' : row.state === 'Completed' ? 'ikemaker.sff-creator-history-reconciliation-approval-receipt' : 'ikemaker.sff-creator-lifecycle-route-manifest');
    assert.strictEqual(retained.get(inputRole).authorityBinding, 'descriptor-and-named-authority');
    assert.ok(retained.has(resultRole));
    assert.strictEqual(retained.get(resultRole).storage, 'artifact');
    assert.strictEqual(retained.get(resultRole).authorityBinding, 'descriptor-and-named-authority');
  }
}
assert.strictEqual(new Set(prerequisiteIds).size, prerequisiteIds.length);

for (const approval of [['ProjectionApproved', 'saved-approved-v2-specification'], ['AdoptionApproved', 'saved-adoption-approval-receipt'], ['ExecutionApproved', 'saved-layout-approval-receipt']]) {
  const replay = state(approval[0]).replayContract;
  const receipt = roleMap(approval[0]).get(approval[1]);
  assert.strictEqual(replay.canonicalComparisonOnly, true);
  assert.ok(receipt);
  assert.deepStrictEqual(receipt.independentHashes, { byteHash: true, semanticHash: true, authorityHash: true });
  assert.strictEqual(receipt.authorityBinding, 'descriptor-and-named-authority');
}
assert.strictEqual(roleMap('ProjectionApproved').has('saved-projection-approval-receipt'), false);
assert.strictEqual(roleMap('ProjectionApproved').get('saved-approved-v2-specification').schema, 'ikemaker.sff-creator-approved-v2-specification');
assert.strictEqual(roleMap('RequestReady').get('saved-approved-v2-specification').schema, 'ikemaker.sff-creator-approved-v2-specification');
assert.strictEqual(roleMap('RequestReady').get('saved-approved-adapter-request').schema, 'ikemaker.sff-creator-approved-adapter-request');
assert.strictEqual(roleMap('LayoutReview').get('replacement-capability-evidence').schema, 'ikemaker.sff-replacement-capability-evidence');
for (const stateName of ['ProjectionReview', 'RequestReady']) assert.strictEqual(state(stateName).replayContract.canonicalComparisonOnly, false);
assert.strictEqual(state('AdoptionReview').replayContract.canonicalComparisonOnly, true);
const candidateBuilt = roleMap('CandidateBuilt');
assert.deepStrictEqual([...candidateBuilt.keys()], ['retained-integration-and-state-root-authorities', 'candidate-built-replay-manifest', 'legacy-sff-build-specification', 'target-projection', 'saved-approved-v2-specification', 'saved-sff12-approved-adapter-request', 'packed-source-collections-with-manifest-mapping', 'candidate-dispatch-receipt', 'candidate-collections', 'saved-candidate-evidence-verification']);
assert.deepStrictEqual(candidateBuilt.get('retained-integration-and-state-root-authorities').cardinality, { min: 2, max: 2 });
assert.strictEqual(candidateBuilt.get('retained-integration-and-state-root-authorities').contractId, 'sff13-integration-and-state-root-authorities-v1');
assert.strictEqual(state('CandidateBuilt').authoritative, true); assert.deepStrictEqual(state('CandidateBuilt').prerequisiteIds, []); assert.strictEqual(state('CandidateBuilt').replayContract.canonicalComparisonOnly, true);
for (const retained of candidateBuilt.values()) assert.strictEqual(retained.authorityBinding, 'descriptor-and-named-authority');
assert.strictEqual(candidateBuilt.has('candidate-built-replay-artifacts'), false);
assert.strictEqual(candidateBuilt.get('legacy-sff-build-specification').schema, 'ikemaker.sff-build-specification'); assert.strictEqual(candidateBuilt.get('target-projection').schema, 'ikemaker.sff-creator-target-projection'); assert.strictEqual(candidateBuilt.get('saved-approved-v2-specification').schema, 'ikemaker.sff-creator-approved-v2-specification'); assert.strictEqual(candidateBuilt.get('saved-sff12-approved-adapter-request').schema, 'ikemaker.sff-creator-approved-adapter-request'); assert.strictEqual(candidateBuilt.get('candidate-dispatch-receipt').schema, 'ikemaker.sff-creator-candidate-dispatch-receipt'); assert.strictEqual(candidateBuilt.get('saved-candidate-evidence-verification').schema, 'ikemaker.sff-creator-candidate-evidence-verification');
assert.strictEqual(candidateBuilt.get('packed-source-collections-with-manifest-mapping').cardinality.max, 128); assert.strictEqual(candidateBuilt.get('candidate-collections').cardinality.max, 128);
const candidatePersisted = roleMap('CandidatePersisted');
assert.deepStrictEqual([...candidatePersisted.keys()], ['retained-integration-and-state-root-authorities', 'candidate-persisted-replay-manifest', 'legacy-sff-build-specification', 'target-projection', 'saved-approved-v2-specification', 'saved-sff12-approved-adapter-request', 'packed-source-collections-with-manifest-mapping', 'candidate-dispatch-receipt', 'candidate-collections-and-persisted-comparison-source', 'saved-candidate-evidence-verification', 'candidate-persistence-receipt']);
assert.strictEqual(state('CandidatePersisted').authoritative, true); assert.deepStrictEqual(state('CandidatePersisted').prerequisiteIds, []); assert.strictEqual(state('CandidatePersisted').replayContract.canonicalComparisonOnly, true);
for (const retained of candidatePersisted.values()) assert.strictEqual(retained.authorityBinding, 'descriptor-and-named-authority');
assert.strictEqual(candidatePersisted.get('candidate-persisted-replay-manifest').schema, 'ikemaker.sff-creator-candidate-persisted-replay-manifest'); assert.strictEqual(candidatePersisted.get('candidate-persistence-receipt').schema, 'ikemaker.sff-creator-persisted-candidate-receipt');
assert.strictEqual(candidatePersisted.get('packed-source-collections-with-manifest-mapping').cardinality.max, 128); assert.strictEqual(candidatePersisted.get('candidate-collections-and-persisted-comparison-source').cardinality.max, 128);
const adoptionReview = roleMap('AdoptionReview');
assert.strictEqual(adoptionReview.get('candidate-persisted-adoption-review-route-manifest').schema, 'ikemaker.sff-creator-lifecycle-route-manifest'); assert.strictEqual(adoptionReview.get('saved-adoption-plan').schema, 'ikemaker.sff-creator-adoption-plan'); assert.strictEqual(adoptionReview.has('active-archive-bytes'), false); assert.strictEqual(adoptionReview.has('persisted-candidate-bytes'), false); assert.strictEqual(state('AdoptionReview').replayContract.canonicalComparisonOnly, true);
const adoptionApproved = roleMap('AdoptionApproved');
assert.strictEqual(adoptionApproved.get('adoption-review-approved-route-manifest').schema, 'ikemaker.sff-creator-lifecycle-route-manifest'); assert.strictEqual(adoptionApproved.get('saved-adoption-plan').schema, 'ikemaker.sff-creator-adoption-plan'); assert.strictEqual(adoptionApproved.get('saved-adoption-approval-receipt').schema, 'ikemaker.sff-creator-adoption-plan-approval-receipt'); assert.strictEqual(adoptionApproved.has('active-archive-bytes'), false); assert.strictEqual(adoptionApproved.has('persisted-candidate-bytes'), false); assert.strictEqual(state('AdoptionApproved').replayContract.canonicalComparisonOnly, true);
const executing = roleMap('Executing');
assert.strictEqual(executing.get('executing-phase-root-xor').cardinality.min, 1); assert.strictEqual(executing.get('executing-phase-root-xor').cardinality.max, 1);
assert.strictEqual(executing.get('executing-phase-root-xor').schema, null); assert.strictEqual(executing.get('executing-phase-root-xor').contractId, 'sff17c-executing-phase-root-xor-v1');
assert.strictEqual(executing.get('execution-intent-and-executor-authority-artifacts').cardinality.min, 2); assert.strictEqual(executing.get('execution-intent-and-executor-authority-artifacts').cardinality.max, 2);
assert.strictEqual(executing.get('conditional-result-capture-evidence').cardinality.min, 0); assert.strictEqual(executing.get('conditional-result-capture-evidence').cardinality.max, 67);
assert.ok(state('Executing').notes.includes('phase-root-xor-enforced'));
const completed = roleMap('Completed');
assert.deepStrictEqual([...completed.keys()], ['retained-integration-and-state-root-authorities', 'completed-vault-checkpoint', 'saved-history-reconciliation-approval-receipt', 'saved-history-writer-receipt', 'immutable-history-record', 'optional-completion-cleanup-marker']);
assert.strictEqual(completed.get('completed-vault-checkpoint').schema, 'ikemaker.sff-creator-operation-vault-checkpoint');
assert.strictEqual(completed.get('saved-history-writer-receipt').schema, 'ikemaker.sff-creator-history-write-receipt');
assert.strictEqual(completed.get('immutable-history-record').schema, 'ikemaker.sff-creator-history-record');
assert.strictEqual(completed.get('optional-completion-cleanup-marker').schema, 'ikemaker.sff-creator-operation-vault-completion-cleanup-marker');
assert.deepStrictEqual(completed.get('optional-completion-cleanup-marker').cardinality, { min: 0, max: 1 });
for (const id of ['completed-vault-checkpoint', 'immutable-history-record', 'optional-completion-cleanup-marker']) {
  assert.strictEqual(completed.get(id).authorityBinding, 'descriptor-only');
  assert.deepStrictEqual(completed.get(id).independentHashes, { byteHash: true, semanticHash: true, authorityHash: false });
  assert.ok(completed.get(id).authorityBindingJustification.length >= 16);
}
for (const id of ['saved-history-reconciliation-approval-receipt', 'saved-history-writer-receipt']) {
  assert.strictEqual(completed.get(id).authorityBinding, 'descriptor-and-named-authority');
  assert.deepStrictEqual(completed.get(id).independentHashes, { byteHash: true, semanticHash: true, authorityHash: true });
}
assert.ok(state('Completed').notes.includes('embedded-terminal-history-evidence-validated'));
assert.ok(state('Completed').notes.includes('immediately-preceding-history-review-validated'));
const historyReview = roleMap('HistoryReview');
assert.ok(historyReview.has('history-review-route-manifest'));
assert.ok(historyReview.has('history-reconciliation-plan'));
assert.strictEqual(historyReview.get('saved-history-reconciliation-approval-receipt').schema, 'ikemaker.sff-creator-history-reconciliation-approval-receipt');
for (const stateName of ['TerminalNeedsHistory', 'RestartRecoveryRequired', 'ManualRecoveryRequired']) {
  const retained = roleMap(stateName);
  const root = retained.get('result-classification-route-manifest');
  const child = retained.get('immutable-result-captured-predecessor-relationship');
  assert.strictEqual(root.schema, 'ikemaker.sff-creator-result-classification-route-manifest');
  assert.deepStrictEqual(root.independentHashes, { byteHash: true, semanticHash: true, authorityHash: true });
  assert.strictEqual(root.authorityBinding, 'descriptor-and-named-authority');
  assert.strictEqual(child.contractId, 'sff17d-result-captured-immediate-predecessor-v1');
  assert.deepStrictEqual(child.independentHashes, { byteHash: true, semanticHash: true, authorityHash: false });
  assert.strictEqual(child.authorityBinding, 'descriptor-only');
  assert.ok(child.authorityBindingJustification.length >= 16);
}

const graphKeys = new Set();
const expectedEdgePairs = [
  'Draft>ProjectionReview',
  'ProjectionReview>ProjectionApproved', 'ProjectionReview>Draft', 'ProjectionReview>CancelledBeforeMutation',
  'ProjectionApproved>CapabilityBlocked', 'ProjectionApproved>RequestReady', 'ProjectionApproved>ExternalLegacyRoute', 'ProjectionApproved>ExternalNeedsRunner',
  'CapabilityBlocked>ProjectionReview', 'CapabilityBlocked>ExternalLegacyRoute', 'CapabilityBlocked>CancelledBeforeMutation',
  'RequestReady>CandidateBuilt', 'RequestReady>ExternalNeedsRunner', 'RequestReady>CancelledBeforeMutation',
  'CandidateBuilt>CandidatePersisted', 'CandidateBuilt>RequestReady', 'CandidateBuilt>CancelledBeforeMutation',
  'CandidatePersisted>AdoptionReview', 'CandidatePersisted>CancelledBeforeMutation',
  'AdoptionReview>AdoptionApproved', 'AdoptionReview>CandidatePersisted', 'AdoptionReview>CancelledBeforeMutation',
  'AdoptionApproved>LayoutReview',
  'LayoutReview>ExecutionApproved', 'LayoutReview>AdoptionReview', 'LayoutReview>CancelledBeforeMutation',
  'ExecutionApproved>Executing', 'ExecutionApproved>CancelledBeforeMutation',
  'Executing>Executing', 'Executing>TerminalNeedsHistory', 'Executing>RestartRecoveryRequired', 'Executing>ManualRecoveryRequired',
  'RestartRecoveryRequired>RestartRecoveryRequired', 'RestartRecoveryRequired>Executing', 'RestartRecoveryRequired>TerminalNeedsHistory', 'RestartRecoveryRequired>ManualRecoveryRequired',
  'ManualRecoveryRequired>ManualRecoveryRequired',
  'TerminalNeedsHistory>TerminalNeedsHistory', 'TerminalNeedsHistory>HistoryReview',
  'HistoryReview>HistoryReview', 'HistoryReview>Completed', 'HistoryReview>TerminalNeedsHistory', 'HistoryReview>ManualRecoveryRequired',
  'ExternalLegacyRoute>ExternalNeedsRunner', 'ExternalLegacyRoute>CandidateBuilt', 'ExternalNeedsRunner>ExternalLegacyRoute', 'ExternalNeedsRunner>CandidateBuilt',
  'Completed>Completed'
];
for (const edge of registry.legalGraphOnly) {
  assert.deepStrictEqual(keyset(edge), ['from', 'implementedEvidenceContract', 'kind', 'to']);
  assert.ok(expectedStates.includes(edge.from) && expectedStates.includes(edge.to));
  assert.strictEqual(typeof edge.implementedEvidenceContract, 'boolean');
  const identity = `${edge.from}\0${edge.to}\0${edge.kind}`;
  assert.strictEqual(graphKeys.has(identity), false);
  graphKeys.add(identity);
  assert.strictEqual(edge.implementedEvidenceContract, state(edge.from).authoritative && state(edge.to).authoritative);
}
assert.deepStrictEqual(registry.legalGraphOnly.map((edge) => `${edge.from}>${edge.to}`).sort(), expectedEdgePairs.sort());
for (const identity of ['RestartRecoveryRequired\0RestartRecoveryRequired\0same-state-recovery-phase', 'ManualRecoveryRequired\0ManualRecoveryRequired\0same-state-recovery-phase', 'TerminalNeedsHistory\0TerminalNeedsHistory\0same-state-history-phase', 'HistoryReview\0HistoryReview\0same-state-history-phase']) assert.ok(graphKeys.has(identity));
assert.strictEqual(registry.legalGraphOnly.some((edge) => Object.keys(edge).some((key) => /action|availability|backend|dispatch/i.test(key))), false);

assertFrozen(registry);
assert.throws(() => { registry.states[0].notes.push('changed'); }, TypeError);
const copy = JSON.parse(JSON.stringify(registry));
copy.states[0].notes[0] = 'changed';
assert.strictEqual(state('Draft').notes[0], 'state-not-authoritative');
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'sff_creator_lifecycle_evidence_registry.js'), 'utf8');
assert.doesNotMatch(source, /\brequire\s*\(|\bimport\s+/);

console.log('sff creator lifecycle evidence registry tests passed');
