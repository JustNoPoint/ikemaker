'use strict';

const crypto = require('crypto');
const { types: utilTypes } = require('util');
const { decodeStrictJsonArtifact } = require('./sff_strict_json_artifact');
const { snapshotPlainJson } = require('./sff_plain_json_snapshot');
const { canonicalize, hashCanonical } = require('./sff_capability_report');
const { createCreatorExecutionLayoutPlan } = require('./sff_creator_execution_layout_plan');

const SHA256 = /^[0-9a-f]{64}$/i;
const INPUT_KEYS = Object.freeze(['approvalDecision', 'executionLayoutPlanArtifactBytes', 'executionLayoutPlanInput', 'expectedExecutionLayoutPlanArtifactByteHash', 'expectedExecutionLayoutPlanHash']);
const DECISION_KEYS = Object.freeze(['acknowledgedRiskIds', 'active', 'activeDirectory', 'approvalMode', 'authority', 'candidate', 'confirmations', 'directoryObservationHash', 'layoutPlanHash', 'paths', 'replacementProfile', 'rollback', 'stateMachine', 'status']);
const CONFIRMATION_KEYS = Object.freeze(['backupPublication', 'currentStateRecheck', 'destinationIdentity', 'directoryDurabilityCaveat', 'everyExecutionPath', 'externalRaceCaveat', 'leaseSemantics', 'nonAtomicReplacement', 'primitiveCapabilityProfile', 'quarantinePolicy', 'recoveryJournalAndStateMachine', 'rollbackFallback', 'rollbackStaging']);
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function checkedHash(value, label) { if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(`${label} must be a SHA-256 hash string.`); return value.toLowerCase(); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(deepFreeze); return value; }
function closed(value, keys, label) { if (!value || typeof value !== 'object' || Array.isArray(value) || Buffer.isBuffer(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain non-proxy object.`); const descriptors = Object.getOwnPropertyDescriptors(value), found = Object.keys(descriptors).sort(); if (Object.getOwnPropertySymbols(value).length || JSON.stringify(found) !== JSON.stringify([...keys].sort())) throw new Error(`${label} must contain exactly the reviewed fields.`); for (const key of found) if (!descriptors[key].enumerable || !Object.prototype.hasOwnProperty.call(descriptors[key], 'value')) throw new Error(`${label}.${key} must be an enumerable data property, not an accessor.`); return Object.fromEntries(found.map((key) => [key, descriptors[key].value])); }
function exact(left, right, label) { if (JSON.stringify(canonicalize(left, label)) !== JSON.stringify(canonicalize(right, label))) throw new Error(`${label} does not exactly match the execution layout plan.`); }
function authority(plan) { return { adoptionApprovalReceiptHash: plan.adoptionApprovalReceiptHash, approvedObservationPlanHash: plan.approvedObservationPlanHash, adoptionPlanArtifactByteHash: plan.adoptionPlanArtifactByteHash, persistedReceiptArtifactByteHash: plan.persistedReceiptArtifactByteHash, persistedReceiptHash: plan.persistedReceiptHash, candidateDispatchReceiptHash: plan.candidateDispatchReceiptHash, requestHash: plan.requestHash, specificationHash: plan.specificationHash, logicalHash: plan.logicalHash, projectionApprovalReceiptHash: plan.projectionApprovalReceiptHash, sourceSnapshotHash: plan.sourceSnapshotHash, sourceValidationHash: plan.sourceValidationHash, capabilitySnapshotHash: plan.capabilitySnapshotHash, persistenceValidationHash: plan.persistenceValidationHash, adoptionApprovalDecisionHash: plan.adoptionApprovalDecisionHash };
}

function buildCreatorExecutionLayoutApproval(rawInput, observeCurrentState) {
  const input = closed(rawInput, INPUT_KEYS, 'Creator execution-layout approval input'), saved = decodeStrictJsonArtifact(input.executionLayoutPlanArtifactBytes, 'Creator execution-layout plan'), rederived = observeCurrentState ? createCreatorExecutionLayoutPlan(input.executionLayoutPlanInput) : saved.parsed;
  const artifactHash = sha(saved.bytes), expectedArtifactHash = checkedHash(input.expectedExecutionLayoutPlanArtifactByteHash, 'expectedExecutionLayoutPlanArtifactByteHash'), expectedPlanHash = checkedHash(input.expectedExecutionLayoutPlanHash, 'expectedExecutionLayoutPlanHash');
  if (artifactHash !== expectedArtifactHash) throw new Error('Execution-layout artifact byte hash does not match the independently retained hash.');
  for (const plan of [saved.parsed, rederived]) if (plan.schema !== 'ikemaker.sff-creator-execution-layout-plan' || plan.version !== 1 || plan.layoutPlanHash !== expectedPlanHash || hashCanonical({ ...plan, layoutPlanHash: undefined }) !== expectedPlanHash || plan.executionLayoutApproved !== false || plan.executionAuthorityGranted !== false || plan.executionAllowed !== false || plan.writesCommitted !== false || plan.adoptionCompleted !== false || plan.activeArchiveModified !== false || plan.currentStateGuaranteed !== false) throw new Error('Execution-layout plan schema, hash, or no-write authority drifted.');
  exact(saved.parsed, rederived, 'saved execution-layout plan');
  if (!Array.isArray(rederived.blockers) || rederived.blockers.length) throw new Error(`Execution-layout plan contains non-waivable blockers: ${(rederived.blockers || []).join(', ') || 'invalid blocker list'}.`);
  const decision = snapshotPlainJson(input.approvalDecision, 'approvalDecision'); closed(decision, DECISION_KEYS, 'approvalDecision');
  if (decision.status !== 'approved' || decision.layoutPlanHash !== expectedPlanHash) throw new Error('approvalDecision must approve the exact layoutPlanHash.');
  const expectedMode = rederived.risks.length ? 'elevated' : 'standard'; if (decision.approvalMode !== expectedMode) throw new Error(`approvalDecision.approvalMode must be ${expectedMode}.`);
  const authorityExpected = authority(rederived); closed(decision.authority, Object.keys(authorityExpected), 'approvalDecision.authority'); exact(decision.authority, authorityExpected, 'approvalDecision.authority');
  closed(decision.active, Object.keys(rederived.active), 'approvalDecision.active'); exact(decision.active, rederived.active, 'approvalDecision.active');
  closed(decision.candidate, Object.keys(rederived.candidate), 'approvalDecision.candidate'); exact(decision.candidate, rederived.candidate, 'approvalDecision.candidate');
  closed(decision.activeDirectory, Object.keys(rederived.activeDirectory), 'approvalDecision.activeDirectory'); exact(decision.activeDirectory, rederived.activeDirectory, 'approvalDecision.activeDirectory');
  closed(decision.paths, Object.keys(rederived.paths), 'approvalDecision.paths'); exact(decision.paths, rederived.paths, 'approvalDecision.paths');
  closed(decision.replacementProfile, Object.keys(rederived.replacementProfile), 'approvalDecision.replacementProfile'); exact(decision.replacementProfile, rederived.replacementProfile, 'approvalDecision.replacementProfile');
  closed(decision.stateMachine, Object.keys(rederived.stateMachine), 'approvalDecision.stateMachine'); exact(decision.stateMachine, rederived.stateMachine, 'approvalDecision.stateMachine');
  closed(decision.rollback, Object.keys(rederived.rollback), 'approvalDecision.rollback'); exact(decision.rollback, rederived.rollback, 'approvalDecision.rollback');
  if (decision.directoryObservationHash !== rederived.directoryObservationHash) throw new Error('approvalDecision.directoryObservationHash does not match the reviewed inventory.');
  if (!Array.isArray(decision.acknowledgedRiskIds) || JSON.stringify(decision.acknowledgedRiskIds) !== JSON.stringify([...new Set(decision.acknowledgedRiskIds)].sort()) || JSON.stringify(decision.acknowledgedRiskIds) !== JSON.stringify(rederived.risks)) throw new Error('approvalDecision.acknowledgedRiskIds must exactly match the sorted layout risk list.');
  closed(decision.confirmations, CONFIRMATION_KEYS, 'approvalDecision.confirmations'); for (const key of CONFIRMATION_KEYS) if (decision.confirmations[key] !== true) throw new Error(`approvalDecision.confirmations.${key} must be exactly true.`);
  const approvalDecisionHash = hashCanonical(decision);
  const receipt = deepFreeze({
    schema: 'ikemaker.sff-creator-execution-layout-approval-receipt', version: 1, status: 'approved', executionLayoutPlanArtifactByteHash: artifactHash, approvedExecutionLayoutPlanHash: expectedPlanHash,
    authority: authorityExpected, active: rederived.active, candidate: rederived.candidate, activeDirectory: rederived.activeDirectory, paths: rederived.paths, replacementProfile: rederived.replacementProfile, stateMachine: rederived.stateMachine, stateMachineHash: rederived.stateMachineHash, rollback: rederived.rollback,
    directoryObservationHash: rederived.directoryObservationHash, acknowledgedRiskIds: rederived.risks, confirmations: decision.confirmations, approvalDecisionHash,
    executorContract: { id: 'ikemaker.sff-creator-transactional-executor', version: 1 }, executionLayoutApproved: true, executionAuthorityGranted: true,
    executionStarted: false, writesCommitted: false, adoptionCompleted: false, activeArchiveModified: false, currentStateGuaranteed: false, byteEqualityRequired: false
  });
  return deepFreeze({ receipt, receiptHash: hashCanonical(receipt) });
}

function approveCreatorExecutionLayoutPlan(rawInput = {}) { return buildCreatorExecutionLayoutApproval(rawInput, true); }
function verifySavedCreatorExecutionLayoutApproval(rawInput = {}) { return buildCreatorExecutionLayoutApproval(rawInput, false); }

module.exports = { CONFIRMATION_KEYS, approveCreatorExecutionLayoutPlan, verifySavedCreatorExecutionLayoutApproval };
