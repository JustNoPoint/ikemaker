'use strict';

const crypto = require('crypto');
const { types: utilTypes } = require('util');
const { decodeStrictJsonArtifact } = require('./sff_strict_json_artifact');
const { snapshotPlainJson } = require('./sff_plain_json_snapshot');
const { canonicalize, hashCanonical } = require('./sff_capability_report');
const { createCreatorAdoptionPlan } = require('./sff_creator_adoption_plan');

const SHA256 = /^[0-9a-f]{64}$/i;
const INPUT_KEYS = Object.freeze(['adoptionPlanArtifactBytes', 'adoptionPlanInput', 'approvalDecision', 'expectedAdoptionPlanArtifactByteHash', 'expectedAdoptionPlanHash']);
const DECISION_KEYS = Object.freeze(['acknowledgedRiskIds', 'active', 'approvalMode', 'candidate', 'comparison', 'confirmations', 'format', 'paths', 'planHash', 'rollback', 'status']);
const CONFIRMATION_KEYS = Object.freeze(['activeFingerprint', 'backupAndDestinationPaths', 'candidateIdentity', 'elevatedRisks', 'formatAndProfile', 'rollbackPlan', 'semanticChanges', 'semanticUnknowns']);
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function checkedHash(value, label) { const result = String(value || '').toLowerCase(); if (!SHA256.test(result)) throw new Error(`${label} must be a SHA-256 hash.`); return result; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(deepFreeze); return value; }
function closedRoot(value) { if (!value || typeof value !== 'object' || Array.isArray(value) || Buffer.isBuffer(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('Creator adoption-approval input must be a plain non-proxy object.'); const descriptors = Object.getOwnPropertyDescriptors(value), keys = Object.keys(descriptors).sort(); if (Object.getOwnPropertySymbols(value).length || JSON.stringify(keys) !== JSON.stringify([...INPUT_KEYS].sort())) throw new Error('Creator adoption-approval input must contain exactly the plan authority and approval decision.'); for (const key of keys) if (!descriptors[key].enumerable || !Object.prototype.hasOwnProperty.call(descriptors[key], 'value')) throw new Error(`Creator adoption-approval input ${key} must be an enumerable data property.`); return Object.fromEntries(keys.map((key) => [key, descriptors[key].value])); }
function exactObject(value, keys, label) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new Error(`${label} must contain exactly: ${[...keys].sort().join(', ')}.`); return value; }
function exact(left, right, label) { if (JSON.stringify(canonicalize(left, label)) !== JSON.stringify(canonicalize(right, label))) throw new Error(`${label} does not exactly match the reviewed adoption plan.`); }
function categories(plan) { return Object.keys(plan.comparison.categories).sort().map((id) => { const row = plan.comparison.categories[id]; return { id, changed: row.changed, added: row.added, removed: row.removed, unknown: row.unknown }; }); }

function approveCreatorAdoptionPlan(rawInput = {}) {
  const input = closedRoot(rawInput), rederived = createCreatorAdoptionPlan(input.adoptionPlanInput), saved = decodeStrictJsonArtifact(input.adoptionPlanArtifactBytes, 'Creator adoption plan');
  const artifactHash = sha(saved.bytes), expectedArtifactHash = checkedHash(input.expectedAdoptionPlanArtifactByteHash, 'expectedAdoptionPlanArtifactByteHash'), expectedPlanHash = checkedHash(input.expectedAdoptionPlanHash, 'expectedAdoptionPlanHash');
  if (artifactHash !== expectedArtifactHash) throw new Error('Adoption-plan artifact byte hash does not match the independently retained hash.');
  for (const plan of [saved.parsed, rederived]) {
    if (plan.schema !== 'ikemaker.sff-creator-adoption-plan' || plan.version !== 1 || checkedHash(plan.planHash, 'plan.planHash') !== expectedPlanHash || hashCanonical({ ...plan, planHash: undefined }) !== expectedPlanHash) throw new Error('Adoption plan hash or schema drifted.');
    if (plan.reviewRequired !== true || plan.humanReviewComplete !== false || plan.backupCreated !== false || plan.replacementCommitted !== false || plan.activeArchiveModified !== false || plan.adoptionAllowed !== false || plan.byteEqualityRequired !== false) throw new Error('Adoption plan claims approval, writes, replacement, or adoption authority.');
  }
  exact(saved.parsed, rederived, 'saved adoption plan');
  if (!Array.isArray(rederived.blockers) || rederived.blockers.length) throw new Error(`Adoption plan contains non-waivable blockers and must be regenerated: ${(rederived.blockers || []).join(', ') || 'invalid blocker list'}.`);

  const decision = snapshotPlainJson(input.approvalDecision, 'approvalDecision'); exactObject(decision, DECISION_KEYS, 'approvalDecision');
  if (decision.status !== 'approved' || decision.planHash !== expectedPlanHash) throw new Error('approvalDecision must explicitly approve the exact planHash.');
  const elevated = rederived.risks.length > 0, expectedMode = elevated ? 'elevated' : 'standard'; if (decision.approvalMode !== expectedMode) throw new Error(`approvalDecision.approvalMode must be ${expectedMode} for this plan.`);
  exactObject(decision.candidate, ['byteHash', 'byteLength', 'identity', 'path', 'strictReportHash', 'targetId', 'validatorId', 'validatorVersion'], 'approvalDecision.candidate'); exact(decision.candidate, rederived.candidate, 'approvalDecision.candidate');
  const activeExpected = { path: rederived.active.path, realpath: rederived.active.realpath, identity: rederived.active.identity, byteHash: rederived.active.byteHash, byteLength: rederived.active.byteLength, inspectionStatus: rederived.active.inspection.status, inspectionTargetId: rederived.active.inspection.targetId, recognizedVersion: rederived.active.inspection.recognizedVersion, driftedSincePersistence: rederived.active.driftedSincePersistence };
  exactObject(decision.active, Object.keys(activeExpected), 'approvalDecision.active'); exact(decision.active, activeExpected, 'approvalDecision.active');
  const comparisonExpected = { semanticEquivalence: rederived.comparison.semanticEquivalence, renderEquivalence: rederived.comparison.renderEquivalence, categories: categories(rederived) };
  exactObject(decision.comparison, ['categories', 'renderEquivalence', 'semanticEquivalence'], 'approvalDecision.comparison'); exact(decision.comparison, comparisonExpected, 'approvalDecision.comparison');
  const formatExpected = {
    activeTargetId: rederived.active.inspection.targetId,
    activeRecognizedVersion: rederived.active.inspection.recognizedVersion,
    candidateTargetId: rederived.candidate.targetId,
    formatRelation: rederived.active.inspection.targetId == null
      ? 'unknown'
      : rederived.active.inspection.targetId === rederived.candidate.targetId ? 'same' : 'changed',
    activeInspectionStatus: rederived.active.inspection.status
  };
  exactObject(decision.format, Object.keys(formatExpected), 'approvalDecision.format'); exact(decision.format, formatExpected, 'approvalDecision.format');
  exactObject(decision.paths, Object.keys(rederived.proposedPaths), 'approvalDecision.paths'); exact(decision.paths, rederived.proposedPaths, 'approvalDecision.paths');
  exactObject(decision.rollback, Object.keys(rederived.rollback), 'approvalDecision.rollback'); exact(decision.rollback, rederived.rollback, 'approvalDecision.rollback');
  const risks = [...rederived.risks]; if (!Array.isArray(decision.acknowledgedRiskIds) || JSON.stringify(decision.acknowledgedRiskIds) !== JSON.stringify([...new Set(decision.acknowledgedRiskIds)].sort()) || JSON.stringify(decision.acknowledgedRiskIds) !== JSON.stringify(risks)) throw new Error('approvalDecision.acknowledgedRiskIds must be the sorted exact plan risk list.');
  exactObject(decision.confirmations, CONFIRMATION_KEYS, 'approvalDecision.confirmations'); for (const key of CONFIRMATION_KEYS) if (decision.confirmations[key] !== true) throw new Error(`approvalDecision.confirmations.${key} must be exactly true.`);
  const approvalDecisionHash = hashCanonical(decision);
  const receipt = deepFreeze({
    schema: 'ikemaker.sff-creator-adoption-plan-approval-receipt', version: 1, status: 'approved', adoptionPlanArtifactByteHash: artifactHash, approvedObservationPlanHash: expectedPlanHash,
    approvalMode: expectedMode, persistedReceiptArtifactByteHash: rederived.persistedReceiptArtifactByteHash, persistedReceiptHash: rederived.persistedReceiptHash, candidateDispatchReceiptHash: rederived.candidateDispatchReceiptHash,
    requestHash: rederived.requestHash, specificationHash: rederived.specificationHash, logicalHash: rederived.logicalHash, approvalReceiptHash: rederived.approvalReceiptHash,
    sourceSnapshotHash: rederived.sourceSnapshotHash, sourceValidationHash: rederived.sourceValidationHash, capabilitySnapshotHash: rederived.capabilitySnapshotHash, persistenceValidationHash: rederived.persistenceValidationHash,
    candidate: rederived.candidate, active: activeExpected, comparison: comparisonExpected, format: formatExpected, paths: rederived.proposedPaths, rollback: rederived.rollback,
    acknowledgedRiskIds: risks, confirmations: decision.confirmations, approvalDecisionHash,
    adoptionPlanApproved: true, humanReviewComplete: true, currentStateGuaranteed: false, backupCreated: false, replacementCommitted: false, activeArchiveModified: false, executionAllowed: false, adoptionAllowed: false, byteEqualityRequired: false
  });
  return deepFreeze({ receipt, receiptHash: hashCanonical(receipt) });
}

module.exports = { CONFIRMATION_KEYS, approveCreatorAdoptionPlan };
