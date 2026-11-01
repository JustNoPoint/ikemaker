'use strict';

const crypto = require('crypto');
const { decodeStrictJsonArtifact } = require('./sff_strict_json_artifact');
const { canonicalize, hashCanonical } = require('./sff_capability_report');
const { createSffBuildSpecificationV2 } = require('./sff_build_specification_v2');
const { createCreatorTargetProjection } = require('./sff_creator_target_projection');
const { snapshotPlainJson } = require('./sff_plain_json_snapshot');

const SHA256 = /^[0-9a-f]{64}$/i;
const DECISION_KEYS = Object.freeze(['acceptedMandatoryAcknowledgementIds', 'adapterId', 'adapterVersion', 'backendId', 'confirmations', 'legacySpecificationHash', 'projectionArtifactByteHash', 'projectionPlanHash', 'reviewedBlockerCount', 'reviewedConversionIds', 'sourceArtifactByteHash', 'status', 'targetId']);
const CONFIRMATION_KEYS = Object.freeze(['finalAxesAndCrops', 'linksAndStorage', 'paletteMappingAndAssignments', 'physicalSpriteOrder', 'sourceSnapshots', 'targetRepresentation']);
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function checkedHash(value, label) { const result = String(value || '').toLowerCase(); if (!SHA256.test(result)) throw new Error(`${label} must be a SHA-256 hash.`); return result; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(deepFreeze); return value; }
function plainObject(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain object.`); return value; }
function exactKeys(value, expected, label) { const keys = Object.keys(plainObject(value, label)).sort(); if (JSON.stringify(keys) !== JSON.stringify([...expected].sort())) throw new Error(`${label} must contain exactly: ${[...expected].sort().join(', ')}.`); }
function exactSortedUniqueStrings(value, expected, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item)) throw new Error(`${label} must be an array of non-empty strings.`);
  if (JSON.stringify(value) !== JSON.stringify([...new Set(value)].sort())) throw new Error(`${label} must be sorted and contain no duplicates.`);
  if (JSON.stringify(value) !== JSON.stringify(expected)) throw new Error(`${label} does not match the reviewed projection.`);
}
function exactSemantic(left, right) { return JSON.stringify(canonicalize(left, 'projection artifact')) === JSON.stringify(canonicalize(right, 'rederived projection')); }
function validateCapabilityRequest(value) {
  const request = value == null ? {} : snapshotPlainJson(value, 'capabilityRequest'), keys = Object.keys(plainObject(request, 'capabilityRequest')).sort();
  if (keys.some((key) => !['evidence', 'requiredFeatures'].includes(key))) throw new Error('capabilityRequest contains an unknown field.');
  if (request.requiredFeatures !== undefined && (!Array.isArray(request.requiredFeatures) || request.requiredFeatures.some((item) => typeof item !== 'string' || !item.trim()))) throw new Error('capabilityRequest.requiredFeatures must be an array of non-empty strings.');
  if (request.evidence !== undefined) plainObject(request.evidence, 'capabilityRequest.evidence');
  return { ...(request.requiredFeatures === undefined ? {} : { requiredFeatures: [...request.requiredFeatures] }), ...(request.evidence === undefined ? {} : { evidence: request.evidence }) };
}

function projectionInput(input) {
  return {
    artifactBytes: input.legacyArtifactBytes, expectedArtifactByteHash: input.expectedLegacyArtifactByteHash,
    expectedLegacySpecificationHash: input.expectedLegacySpecificationHash, targetId: input.targetId, backendId: input.backendId,
    ...(input.v1PaletteMapping === undefined ? {} : { v1PaletteMapping: snapshotPlainJson(input.v1PaletteMapping, 'v1PaletteMapping') }),
    ...(input.v1PaletteDecisions === undefined ? {} : { v1PaletteDecisions: snapshotPlainJson(input.v1PaletteDecisions, 'v1PaletteDecisions') }),
    ...(input.acknowledgements === undefined ? {} : { acknowledgements: snapshotPlainJson(input.acknowledgements, 'acknowledgements') })
  };
}

function expectedSourceRows(specification) {
  return [...specification.logical.sprites, ...specification.logical.palettes].map((entry) => ({ entryId: entry.entryId, relativePath: entry.source.relativePath, byteHash: entry.source.byteHash, decodedHash: entry.source.decodedHash || null, kind: entry.source.kind }));
}

function approveCreatorTargetProjection(input = {}) {
  const rederived = createCreatorTargetProjection(projectionInput(input));
  const projectionArtifact = decodeStrictJsonArtifact(input.projectionArtifactBytes, 'Creator target projection');
  const projectionArtifactByteHash = sha(projectionArtifact.bytes), expectedArtifactHash = checkedHash(input.expectedProjectionArtifactByteHash, 'expectedProjectionArtifactByteHash');
  if (projectionArtifactByteHash !== expectedArtifactHash) throw new Error('Projection artifact byte hash does not match the independently retained hash.');
  const expectedPlanHash = checkedHash(input.expectedProjectionPlanHash, 'expectedProjectionPlanHash'), parsed = projectionArtifact.parsed;
  if (!plainObject(parsed, 'projection artifact') || checkedHash(parsed.planHash, 'projection artifact planHash') !== expectedPlanHash || rederived.planHash !== expectedPlanHash || hashCanonical({ ...parsed, planHash: undefined }) !== expectedPlanHash) throw new Error('Projection plan hash drift detected.');
  if (!exactSemantic(parsed, rederived)) throw new Error('Saved projection artifact does not exactly match the independently rederived review plan.');
  if (rederived.eligibleForReview !== true || rederived.blockers.length || rederived.reviewRequired !== true || rederived.adapterRequestCreated !== false || rederived.candidateCreated !== false || rederived.adoptionAllowed !== false || rederived.byteEqualityRequired !== false) throw new Error('Only an unchanged, blocker-free review-only projection can be approved.');

  const decision = snapshotPlainJson(input.approvalDecision, 'approvalDecision'); exactKeys(decision, DECISION_KEYS, 'approvalDecision');
  if (decision.status !== 'approved' || decision.reviewedBlockerCount !== 0) throw new Error('approvalDecision must explicitly approve a zero-blocker projection.');
  const selection = rederived.selection;
  const exact = {
    projectionPlanHash: rederived.planHash, sourceArtifactByteHash: rederived.sourceArtifactByteHash, legacySpecificationHash: rederived.legacySpecificationHash,
    projectionArtifactByteHash, targetId: selection.targetId, backendId: selection.backendId, adapterId: selection.adapter.id, adapterVersion: selection.adapter.version
  };
  for (const [key, value] of Object.entries(exact)) if (decision[key] !== value) throw new Error(`approvalDecision.${key} does not match the reviewed projection.`);
  const conversionIds = [...new Set(rederived.conversions.map((item) => item.id))].sort(), acceptedIds = [...new Set(rederived.mandatoryAcknowledgements.filter((item) => item.accepted === true).map((item) => item.id))].sort();
  exactSortedUniqueStrings(decision.reviewedConversionIds, conversionIds, 'approvalDecision.reviewedConversionIds');
  exactSortedUniqueStrings(decision.acceptedMandatoryAcknowledgementIds, acceptedIds, 'approvalDecision.acceptedMandatoryAcknowledgementIds');
  exactKeys(decision.confirmations, CONFIRMATION_KEYS, 'approvalDecision.confirmations');
  for (const key of CONFIRMATION_KEYS) if (decision.confirmations[key] !== true) throw new Error(`approvalDecision.confirmations.${key} must be exactly true.`);

  const approvalReceipt = {
    schema: 'ikemaker.sff-creator-projection-approval-receipt', version: 1, status: 'approved', humanReviewComplete: true,
    ...exact, reviewedBlockerCount: 0, reviewedConversionIds: conversionIds, acceptedMandatoryAcknowledgementIds: acceptedIds,
    confirmations: Object.fromEntries(CONFIRMATION_KEYS.map((key) => [key, true])), byteEqualityRequired: false, adoptionAllowed: false
  };
  const approvalReceiptHash = hashCanonical(approvalReceipt), capabilityRequest = validateCapabilityRequest(input.capabilityRequest);
  const reviewRecord = {
    sourceArtifactByteHash: rederived.sourceArtifactByteHash, legacySpecificationHash: rederived.legacySpecificationHash,
    projectionArtifactByteHash, projectionPlanHash: rederived.planHash, approvalReceiptHash,
    selection: rederived.selection, reviewedConversionIds: conversionIds, acceptedMandatoryAcknowledgementIds: acceptedIds,
    confirmations: approvalReceipt.confirmations, humanReviewComplete: true, byteEqualityRequired: false, adoptionAllowed: false
  };
  const specification = createSffBuildSpecificationV2({
    planId: `${rederived.sourcePlanId}:${selection.targetId}:${rederived.planHash.slice(0, 16)}`, selection: { targetId: selection.targetId, backendId: selection.backendId }, archive: rederived.archive,
    logical: rederived.proposedLogical, encodingIntent: rederived.proposedEncodingIntent, capabilityRequest,
    review: { creatorProjectionApproval: reviewRecord }
  });
  const rows = expectedSourceRows(specification);
  if (JSON.stringify(rows) !== JSON.stringify(rederived.sourceSnapshotRows)) throw new Error('Approved v2 specification source order or seal fields drifted from the reviewed projection.');
  const sourceSnapshotSeal = { sources: rows }, sourceSnapshotHash = hashCanonical(sourceSnapshotSeal);
  const envelope = {
    schema: 'ikemaker.sff-creator-approved-v2-specification', version: 1, specification, specificationHash: specification.specificationHash,
    approvalReceipt, approvalReceiptHash, sourceSnapshotSeal, sourceSnapshotHash, capabilityAssessment: specification.capabilityAssessment,
    adapterRequestCreated: false, candidateCreated: false, adoptionAllowed: false, byteEqualityRequired: false
  };
  return deepFreeze(envelope);
}

module.exports = { DECISION_KEYS, CONFIRMATION_KEYS, approveCreatorTargetProjection };
