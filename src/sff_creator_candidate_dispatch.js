'use strict';

const crypto = require('crypto');
const { types: utilTypes } = require('util');
const { decodeStrictJsonArtifact } = require('./sff_strict_json_artifact');
const { canonicalize, hashCanonical } = require('./sff_capability_report');
const { createCreatorApprovedAdapterRequest } = require('./sff_creator_approved_request');
const { validateCreatorSourceEvidence } = require('./sff_creator_source_evidence');
const { assertAdapterRequest, REQUIRED_SEMANTIC_CHECKS } = require('./sff_backend_adapter_contract');
const { dispatchBuiltInCandidate } = require('./sff_builtin_candidate_dispatcher');

const SHA256 = /^[0-9a-f]{64}$/i;
const INPUT_KEYS = Object.freeze(['approvedRequestEnvelopeArtifactBytes', 'approvedRequestInput', 'expectedApprovalReceiptHash', 'expectedApprovedRequestEnvelopeArtifactByteHash', 'expectedRequestHash', 'expectedSourceSnapshotHash', 'expectedSpecificationHash', 'sourceBytesByEntryId']);
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function checkedHash(value, label) { const result = String(value || '').toLowerCase(); if (!SHA256.test(result)) throw new Error(`${label} must be a SHA-256 hash.`); return result; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(deepFreeze); return value; }
function exactSemantic(left, right, label) { return JSON.stringify(canonicalize(left, label)) === JSON.stringify(canonicalize(right, label)); }

function closedInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Buffer.isBuffer(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('Creator candidate-dispatch input must be a plain non-proxy object.');
  if (Object.getOwnPropertySymbols(value).length) throw new Error('Creator candidate-dispatch input must not contain symbol properties.');
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Object.keys(descriptors).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...INPUT_KEYS].sort())) throw new Error('Creator candidate-dispatch input must contain exactly the reviewed replay, retained hashes, saved envelope, and source vault fields.');
  for (const key of keys) if (!descriptors[key].enumerable || !Object.prototype.hasOwnProperty.call(descriptors[key], 'value')) throw new Error(`Creator candidate-dispatch input ${key} must be an enumerable data property, not an accessor.`);
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}

function dispatchCreatorApprovedCandidate(rawInput = {}) {
  const input = closedInput(rawInput), rederived = createCreatorApprovedAdapterRequest(input.approvedRequestInput);
  const saved = decodeStrictJsonArtifact(input.approvedRequestEnvelopeArtifactBytes, 'Approved Creator adapter-request envelope');
  const artifactHash = sha(saved.bytes), expectedArtifactHash = checkedHash(input.expectedApprovedRequestEnvelopeArtifactByteHash, 'expectedApprovedRequestEnvelopeArtifactByteHash');
  if (artifactHash !== expectedArtifactHash) throw new Error('Approved request-envelope artifact byte hash does not match the independently retained hash.');
  if (!exactSemantic(saved.parsed, rederived, 'approved request envelope')) throw new Error('Saved approved request envelope does not exactly match the independently rederived SFF-12 authority.');
  const expected = {
    requestHash: checkedHash(input.expectedRequestHash, 'expectedRequestHash'), specificationHash: checkedHash(input.expectedSpecificationHash, 'expectedSpecificationHash'),
    approvalReceiptHash: checkedHash(input.expectedApprovalReceiptHash, 'expectedApprovalReceiptHash'), sourceSnapshotHash: checkedHash(input.expectedSourceSnapshotHash, 'expectedSourceSnapshotHash')
  };
  for (const envelope of [saved.parsed, rederived]) {
    if (envelope.schema !== 'ikemaker.sff-creator-approved-adapter-request' || envelope.version !== 1 || envelope.requestHash !== expected.requestHash || envelope.requestHashToRetain !== expected.requestHash || envelope.specificationHash !== expected.specificationHash || envelope.approvalReceiptHash !== expected.approvalReceiptHash || envelope.sourceSnapshotHash !== expected.sourceSnapshotHash || envelope.candidateCreated !== false || envelope.sourceBytesValidated !== false || envelope.adoptionAllowed !== false || envelope.byteEqualityRequired !== false) throw new Error('Saved or rederived request-envelope authority does not match the independently retained values.');
  }
  const request = assertAdapterRequest(rederived.request, expected.requestHash);
  if (request.specificationHash !== expected.specificationHash || request.sourceSnapshotHash !== expected.sourceSnapshotHash) throw new Error('Adapter request does not match the independently retained specification and source authority.');
  const validated = validateCreatorSourceEvidence({ request, sourceBytesByEntryId: input.sourceBytesByEntryId }), sourceValidationHash = validated.receiptHash;
  const candidate = dispatchBuiltInCandidate({ request, expectedRequestHash: expected.requestHash, sourceBytesByEntryId: validated.copySourceBytesByEntryId() });
  if (candidate.targetId !== request.targetId || candidate.backendId !== request.backendId || candidate.adapter?.id !== request.adapter.id || Number(candidate.adapter?.version) !== Number(request.adapter.version) || candidate.specificationHash !== request.specificationHash || candidate.logicalHash !== request.logicalHash || candidate.sourceSnapshotHash !== request.sourceSnapshotHash || candidate.capabilitySnapshotHash !== request.capabilitySnapshot.snapshotHash || candidate.adoptionAllowed !== false) throw new Error('Dispatched candidate escaped the approved adapter request.');
  if (candidate.validation?.status !== 'passed' || candidate.validation.targetId !== request.targetId || candidate.validation.backendId !== request.backendId || candidate.validation.validatorId !== request.expectedValidator.id || Number(candidate.validation.validatorVersion) !== Number(request.expectedValidator.version) || candidate.validation.candidateByteHash !== candidate.byteHash) throw new Error('Candidate strict validation receipt is not exactly bound.');
  const missing = REQUIRED_SEMANTIC_CHECKS.filter((name) => candidate.semanticComparison?.checks?.[name] !== true);
  if (candidate.semanticComparison?.status !== 'passed' || candidate.semanticComparison?.byteEqualityRequired !== false || candidate.semanticComparison?.candidateByteHash !== candidate.byteHash || missing.length) throw new Error(`Candidate semantic receipt is not exactly bound${missing.length ? `; missing ${missing.join(', ')}` : ''}.`);
  if (candidate.dispatch?.requestHash !== expected.requestHash || candidate.dispatch?.candidateByteHash !== candidate.byteHash || candidate.dispatch?.adoptionAllowed !== false || candidate.dispatch?.byteEqualityRequired !== false) throw new Error('Candidate dispatch receipt is not exactly bound.');
  const candidateBytes = candidate.readBytes(), independentCopy = candidate.readBytes();
  if (!Buffer.isBuffer(candidateBytes) || !Buffer.isBuffer(independentCopy) || sha(candidateBytes) !== candidate.byteHash || sha(independentCopy) !== candidate.byteHash || candidateBytes.length !== candidate.byteLength) throw new Error('Candidate copy-on-read bytes do not match the dispatch receipt.');
  if (candidateBytes.length) { const original = independentCopy[0]; candidateBytes[0] ^= 0xff; if (candidate.readBytes()[0] !== original) throw new Error('Candidate byte reader does not provide isolated copies.'); candidateBytes[0] ^= 0xff; }
  const receipt = deepFreeze({
    schema: 'ikemaker.sff-creator-candidate-dispatch-receipt', version: 1, approvedRequestEnvelopeArtifactByteHash: artifactHash,
    requestHash: expected.requestHash, specificationHash: request.specificationHash, logicalHash: request.logicalHash, approvalReceiptHash: expected.approvalReceiptHash,
    sourceSnapshotHash: request.sourceSnapshotHash, capabilitySnapshotHash: request.capabilitySnapshot.snapshotHash,
    selection: { targetId: request.targetId, backendId: request.backendId, adapter: { id: request.adapter.id, version: request.adapter.version } },
    sourceValidationReceipt: validated.receipt, sourceValidationHash, candidateByteHash: candidate.byteHash, candidateByteLength: candidate.byteLength,
    validation: canonicalize(candidate.validation, 'candidate validation receipt'), semanticComparison: canonicalize(candidate.semanticComparison, 'candidate semantic receipt'), dispatch: canonicalize(candidate.dispatch, 'candidate dispatch receipt'),
    candidateCreated: true, writesCommitted: false, adoptionAllowed: false, byteEqualityRequired: false
  });
  const receiptHash = hashCanonical(receipt), sealedCandidateBytes = candidate.readBytes();
  return Object.freeze({ receipt, receiptHash, readCandidateBytes: () => Buffer.from(sealedCandidateBytes) });
}

module.exports = { dispatchCreatorApprovedCandidate };
