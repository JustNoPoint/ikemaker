'use strict';

const crypto = require('crypto');
const { types: utilTypes } = require('util');
const { decodeStrictJsonArtifact } = require('./sff_strict_json_artifact');
const { snapshotPlainJson } = require('./sff_plain_json_snapshot');
const { canonicalize, hashCanonical } = require('./sff_capability_report');
const { assertSffBuildSpecificationV2, hashSpecification } = require('./sff_build_specification_v2');
const { approveCreatorTargetProjection } = require('./sff_creator_target_projection_approval');
const { createAdapterRequest, assertAdapterRequest } = require('./sff_backend_adapter_contract');

const SHA256 = /^[0-9a-f]{64}$/i;
const COMMON_KEYS = Object.freeze(['acknowledgements', 'approvalCapabilityRequest', 'approvalDecision', 'approvedEnvelopeArtifactBytes', 'backendId', 'expectedApprovalReceiptHash', 'expectedApprovedEnvelopeArtifactByteHash', 'expectedLegacyArtifactByteHash', 'expectedLegacySpecificationHash', 'expectedProjectionArtifactByteHash', 'expectedProjectionPlanHash', 'expectedSourceSnapshotHash', 'expectedSpecificationHash', 'freshCapabilityRequest', 'legacyArtifactBytes', 'projectionArtifactBytes', 'targetId', 'v1PaletteDecisions', 'v1PaletteMapping']);
const V1_ONLY = Object.freeze(['acknowledgements', 'v1PaletteDecisions', 'v1PaletteMapping']);
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function checkedHash(value, label) { const result = String(value || '').toLowerCase(); if (!SHA256.test(result)) throw new Error(`${label} must be a SHA-256 hash.`); return result; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(deepFreeze); return value; }
function exactSemantic(left, right) { return JSON.stringify(canonicalize(left, 'saved approved envelope')) === JSON.stringify(canonicalize(right, 'rederived approved envelope')); }

function closedInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Buffer.isBuffer(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('Creator approved-request input must be a plain non-proxy object.');
  if (Object.getOwnPropertySymbols(value).length) throw new Error('Creator approved-request input must not contain symbol properties.');
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Object.keys(descriptors).sort();
  for (const key of keys) if (!descriptors[key].enumerable || !Object.prototype.hasOwnProperty.call(descriptors[key], 'value')) throw new Error(`Creator approved-request input ${key} must be an enumerable data property, not an accessor.`);
  const target = descriptors.targetId?.value, expected = target === 'sff-v1' ? COMMON_KEYS : COMMON_KEYS.filter((key) => !V1_ONLY.includes(key));
  if (JSON.stringify(keys) !== JSON.stringify([...expected].sort())) throw new Error(`Creator approved-request input for ${target || 'unknown target'} must contain exactly the reviewed authority fields and cannot accept source bytes, candidates, dispatch, or adoption data.`);
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}

function capabilityRequest(value, label) {
  const request = snapshotPlainJson(value, label);
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error(`${label} must be a plain object.`);
  if (Object.keys(request).some((key) => !['evidence', 'requiredFeatures'].includes(key))) throw new Error(`${label} contains an unknown field.`);
  if (request.requiredFeatures !== undefined && (!Array.isArray(request.requiredFeatures) || request.requiredFeatures.some((item) => typeof item !== 'string' || !item.trim()))) throw new Error(`${label}.requiredFeatures must contain only non-empty strings.`);
  if (request.evidence === undefined || !request.evidence || typeof request.evidence !== 'object' || Array.isArray(request.evidence)) throw new Error(`${label}.evidence is required and must be a plain object; fresh capability evidence is never inferred from approval.`);
  return request;
}

function approvalArguments(input) {
  return {
    legacyArtifactBytes: input.legacyArtifactBytes, expectedLegacyArtifactByteHash: input.expectedLegacyArtifactByteHash, expectedLegacySpecificationHash: input.expectedLegacySpecificationHash,
    targetId: input.targetId, backendId: input.backendId, projectionArtifactBytes: input.projectionArtifactBytes, expectedProjectionArtifactByteHash: input.expectedProjectionArtifactByteHash,
    expectedProjectionPlanHash: input.expectedProjectionPlanHash, approvalDecision: snapshotPlainJson(input.approvalDecision, 'approvalDecision'), capabilityRequest: snapshotPlainJson(input.approvalCapabilityRequest, 'approvalCapabilityRequest'),
    ...(input.targetId === 'sff-v1' ? { v1PaletteMapping: snapshotPlainJson(input.v1PaletteMapping, 'v1PaletteMapping'), v1PaletteDecisions: snapshotPlainJson(input.v1PaletteDecisions, 'v1PaletteDecisions'), acknowledgements: snapshotPlainJson(input.acknowledgements, 'acknowledgements') } : {})
  };
}

function assertAuthorityBindings(envelope, expected) {
  const specification = assertSffBuildSpecificationV2(envelope.specification), receipt = envelope.approvalReceipt, seal = envelope.sourceSnapshotSeal, review = specification.review?.creatorProjectionApproval;
  if (hashSpecification(specification) !== expected.specificationHash || specification.specificationHash !== expected.specificationHash || envelope.specificationHash !== expected.specificationHash) throw new Error('Approved specification hash binding drifted.');
  if (hashCanonical(receipt) !== expected.receiptHash || envelope.approvalReceiptHash !== expected.receiptHash) throw new Error('Approval receipt hash binding drifted.');
  if (hashCanonical(seal) !== expected.sourceSnapshotHash || envelope.sourceSnapshotHash !== expected.sourceSnapshotHash) throw new Error('Source snapshot seal hash binding drifted.');
  if (!review || review.approvalReceiptHash !== expected.receiptHash || review.sourceArtifactByteHash !== receipt.sourceArtifactByteHash || review.legacySpecificationHash !== receipt.legacySpecificationHash || review.projectionArtifactByteHash !== receipt.projectionArtifactByteHash || review.projectionPlanHash !== receipt.projectionPlanHash || review.humanReviewComplete !== true || review.adoptionAllowed !== false || review.byteEqualityRequired !== false) throw new Error('Creator approval provenance is not bound to the receipt and source artifacts.');
  const selection = specification.selection;
  if (selection.targetId !== receipt.targetId || selection.backendId !== receipt.backendId || selection.adapter.id !== receipt.adapterId || selection.adapter.version !== receipt.adapterVersion || JSON.stringify(canonicalize(review.selection)) !== JSON.stringify(canonicalize(selection))) throw new Error('Creator approval selection binding drifted.');
  if (envelope.adapterRequestCreated !== false || envelope.candidateCreated !== false || envelope.adoptionAllowed !== false || envelope.byteEqualityRequired !== false || receipt.adoptionAllowed !== false || receipt.byteEqualityRequired !== false) throw new Error('Saved approval envelope claims request, candidate, byte-equality, or adoption authority.');
}

function createCreatorApprovedAdapterRequest(rawInput = {}) {
  const input = closedInput(rawInput), authoritative = approveCreatorTargetProjection(approvalArguments(input));
  const saved = decodeStrictJsonArtifact(input.approvedEnvelopeArtifactBytes, 'Approved Creator v2 envelope'), artifactHash = sha(saved.bytes), expectedArtifactHash = checkedHash(input.expectedApprovedEnvelopeArtifactByteHash, 'expectedApprovedEnvelopeArtifactByteHash');
  if (artifactHash !== expectedArtifactHash) throw new Error('Approved envelope artifact byte hash does not match the independently retained hash.');
  if (!exactSemantic(saved.parsed, authoritative)) throw new Error('Saved approved envelope does not exactly match the independently rederived SFF-11 authority.');
  const expected = { specificationHash: checkedHash(input.expectedSpecificationHash, 'expectedSpecificationHash'), receiptHash: checkedHash(input.expectedApprovalReceiptHash, 'expectedApprovalReceiptHash'), sourceSnapshotHash: checkedHash(input.expectedSourceSnapshotHash, 'expectedSourceSnapshotHash') };
  for (const envelope of [saved.parsed, authoritative]) {
    if (envelope.specificationHash !== expected.specificationHash || envelope.specification?.specificationHash !== expected.specificationHash || envelope.approvalReceiptHash !== expected.receiptHash || envelope.sourceSnapshotHash !== expected.sourceSnapshotHash) throw new Error('Saved or rederived approved-envelope authority hash does not match the independently retained value.');
  }
  assertAuthorityBindings(authoritative, expected);
  const freshCapabilityRequest = capabilityRequest(input.freshCapabilityRequest, 'freshCapabilityRequest');
  const request = createAdapterRequest({ specification: authoritative.specification, expectedSpecificationHash: expected.specificationHash, sourceSnapshotSeal: authoritative.sourceSnapshotSeal, expectedSourceSnapshotHash: expected.sourceSnapshotHash, capabilityRequest: freshCapabilityRequest });
  assertAdapterRequest(request, request.requestHash);
  if (request.specificationHash !== expected.specificationHash || request.logicalHash !== authoritative.specification.logicalHash || request.targetId !== authoritative.specification.selection.targetId || request.backendId !== authoritative.specification.selection.backendId || request.adapter.id !== authoritative.specification.selection.adapter.id || request.adapter.version !== authoritative.specification.selection.adapter.version || request.sourceSnapshotHash !== expected.sourceSnapshotHash || request.capabilitySnapshot.targetId !== request.targetId || request.capabilitySnapshot.backendId !== request.backendId || request.intent !== 'candidate-only' || request.adoptionAllowed !== false || !Object.isFrozen(request)) throw new Error('Generated Creator adapter request is not exactly bound and candidate-only.');
  return deepFreeze({
    schema: 'ikemaker.sff-creator-approved-adapter-request', version: 1, request, requestHash: request.requestHash, requestHashToRetain: request.requestHash,
    approvedEnvelopeArtifactByteHash: artifactHash, specificationHash: expected.specificationHash, approvalReceiptHash: expected.receiptHash, sourceSnapshotHash: expected.sourceSnapshotHash,
    candidateCreated: false, sourceBytesValidated: false, adoptionAllowed: false, byteEqualityRequired: false
  });
}

module.exports = { createCreatorApprovedAdapterRequest };
