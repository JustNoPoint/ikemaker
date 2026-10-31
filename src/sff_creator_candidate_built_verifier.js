'use strict';

const crypto = require('crypto');
const { types } = require('util');
const { decodeStrictJsonArtifact } = require('./sff_strict_json_artifact');
const { canonicalize, hashCanonical } = require('./sff_capability_report');
const { createCreatorApprovedAdapterRequest } = require('./sff_creator_approved_request');
const { validateCreatorSourceEvidence } = require('./sff_creator_source_evidence');
const { deriveBuiltInCandidateEvidence } = require('./sff_builtin_candidate_evidence');

const SHA256 = /^[0-9a-f]{64}$/i;
const INPUT_KEYS = Object.freeze(['approvedRequestEnvelopeArtifactBytes', 'approvedRequestInput', 'candidateBytes', 'candidateDispatchReceiptArtifactBytes', 'expectedApprovalReceiptHash', 'expectedApprovedRequestEnvelopeArtifactByteHash', 'expectedApprovedRequestReplayInputHash', 'expectedCandidateByteHash', 'expectedCandidateDispatchReceiptArtifactByteHash', 'expectedCandidateDispatchReceiptHash', 'expectedRequestHash', 'expectedSourceSnapshotHash', 'expectedSourceValidationHash', 'expectedSpecificationHash', 'sourceBytesByEntryId']);
const SAVED_INPUT_KEYS = Object.freeze(['candidateEvidenceInput', 'candidateEvidenceVerificationArtifactBytes', 'expectedCandidateEvidenceVerificationArtifactByteHash', 'expectedCandidateEvidenceVerificationHash']);
const ROUTES = Object.freeze({
  'sff-v1': Object.freeze({ backendId: 'ikemaker-builtin-sff-v1', adapterId: 'builtin-v1-pcx8', adapterVersion: 1 }),
  'sff-v2.0': Object.freeze({ backendId: 'ikemaker-builtin-sff-v2.0', adapterId: 'builtin-v20-raw8', adapterVersion: 1 }),
  'sff-v2.1': Object.freeze({ backendId: 'ikemaker-builtin-sff-v21-png8-prerelease', adapterId: 'builtin-v21-png8', adapterVersion: 1 })
});
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function fail(message) { throw new Error(`Creator CandidateBuilt verifier: ${message}`); }
function checkedHash(value, label) { const result = typeof value === 'string' ? value.toLowerCase() : ''; if (!SHA256.test(result)) fail(`${label} must be a SHA-256 hash.`); return result; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(deepFreeze); return value; }
function exact(left, right, label) { if (JSON.stringify(canonicalize(left, `${label} left`)) !== JSON.stringify(canonicalize(right, `${label} right`))) fail(`${label} does not exactly match.`); }
function closedInput(rawInput) {
  if (types.isProxy(rawInput)) fail('input must not be a Proxy.');
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput) || Buffer.isBuffer(rawInput) || Object.getPrototypeOf(rawInput) !== Object.prototype) fail('input must be a plain object.');
  const ownKeys = Reflect.ownKeys(rawInput);
  if (ownKeys.some(key => typeof key === 'symbol') || ownKeys.length !== INPUT_KEYS.length || INPUT_KEYS.some(key => !ownKeys.includes(key))) fail('input must contain exactly the approved SFF-12/SFF-13 artifacts, retained hashes, source bytes, and candidate bytes.');
  const descriptors = Object.getOwnPropertyDescriptors(rawInput);
  for (const key of INPUT_KEYS) if (!descriptors[key]?.enumerable || !Object.prototype.hasOwnProperty.call(descriptors[key], 'value')) fail(`input.${key} must be an enumerable own data property.`);
  return Object.fromEntries(INPUT_KEYS.map(key => [key, descriptors[key].value]));
}
function closedSavedInput(rawInput) {
  if (types.isProxy(rawInput)) fail('saved-evidence input must not be a Proxy.');
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput) || Buffer.isBuffer(rawInput) || Object.getPrototypeOf(rawInput) !== Object.prototype) fail('saved-evidence input must be a plain object.');
  const ownKeys = Reflect.ownKeys(rawInput);
  if (ownKeys.some(key => typeof key === 'symbol') || ownKeys.length !== SAVED_INPUT_KEYS.length || SAVED_INPUT_KEYS.some(key => !ownKeys.includes(key))) fail('saved-evidence input must contain exactly the approved four fields.');
  const descriptors = Object.getOwnPropertyDescriptors(rawInput);
  for (const key of SAVED_INPUT_KEYS) if (!descriptors[key]?.enumerable || !Object.prototype.hasOwnProperty.call(descriptors[key], 'value')) fail(`saved-evidence input.${key} must be an enumerable own data property.`);
  return Object.fromEntries(SAVED_INPUT_KEYS.map(key => [key, descriptors[key].value]));
}
function snapshotAuthority(value, label = 'value', ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return { replay: value, normalized: value };
  if (typeof value === 'number') { if (!Number.isFinite(value)) fail(`${label} must contain finite numbers.`); return { replay: value, normalized: value }; }
  if (types.isProxy(value)) fail(`${label} must not contain proxies.`);
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) { const bytes = Buffer.from(value); return { replay: bytes, normalized: { kind: 'bytes', byteHash: sha(bytes), byteLength: bytes.length } }; }
  if (!value || typeof value !== 'object' || ancestors.has(value)) fail(`${label} must contain acyclic plain data and byte arrays.`);
  const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
  if ((!array && prototype !== Object.prototype && prototype !== null) || (array && prototype !== Array.prototype)) fail(`${label} must contain only plain objects and dense arrays.`);
  const descriptors = Object.getOwnPropertyDescriptors(value), symbols = Object.getOwnPropertySymbols(value), keys = Reflect.ownKeys(descriptors).filter(key => typeof key === 'string' && !(array && key === 'length'));
  if (symbols.length) fail(`${label} must not contain symbol properties.`);
  if (array && (keys.length !== value.length || keys.some(key => !/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))) fail(`${label} arrays must be dense and have no extra properties.`);
  for (const key of keys) if (!descriptors[key].enumerable || !Object.prototype.hasOwnProperty.call(descriptors[key], 'value')) fail(`${label}.${key} must be an enumerable data property.`);
  ancestors.add(value); const replay = array ? [] : {}, normalized = array ? [] : {};
  for (const key of keys) { const child = snapshotAuthority(descriptors[key].value, `${label}.${key}`, ancestors); replay[key] = child.replay; normalized[key] = child.normalized; }
  ancestors.delete(value); return { replay, normalized };
}
function exactBuffer(value, label) { if (types.isProxy(value) || !Buffer.isBuffer(value)) fail(`${label} must be a non-proxy Buffer.`); return Buffer.from(value); }
function routeReceipt(request, candidateByteHash) {
  const route = ROUTES[request.targetId];
  if (!route || request.backendId !== route.backendId || request.adapter?.id !== route.adapterId || Number(request.adapter?.version) !== route.adapterVersion) fail('request does not match an exact closed built-in CandidateBuilt route.');
  return deepFreeze({ schema: 'ikemaker.sff-built-in-dispatch-receipt', version: 1, requestHash: request.requestHash, targetId: request.targetId, backendId: request.backendId, adapter: { id: request.adapter.id, version: request.adapter.version }, candidateByteHash, byteEqualityRequired: false, adoptionAllowed: false });
}

function verifyCreatorCandidateBuilt(rawInput) {
  const input = closedInput(rawInput), authority = snapshotAuthority(input.approvedRequestInput, 'approvedRequestInput'), normalizedInputHash = hashCanonical(authority.normalized);
  if (normalizedInputHash !== checkedHash(input.expectedApprovedRequestReplayInputHash, 'expectedApprovedRequestReplayInputHash')) fail('approvedRequestInput replay authority hash drifted.');
  const rederivedEnvelope = createCreatorApprovedAdapterRequest(authority.replay), savedEnvelope = decodeStrictJsonArtifact(exactBuffer(input.approvedRequestEnvelopeArtifactBytes, 'approvedRequestEnvelopeArtifactBytes'), 'saved SFF-12 approved request envelope');
  const expected = {
    envelopeArtifact: checkedHash(input.expectedApprovedRequestEnvelopeArtifactByteHash, 'expectedApprovedRequestEnvelopeArtifactByteHash'), request: checkedHash(input.expectedRequestHash, 'expectedRequestHash'), specification: checkedHash(input.expectedSpecificationHash, 'expectedSpecificationHash'), approval: checkedHash(input.expectedApprovalReceiptHash, 'expectedApprovalReceiptHash'), source: checkedHash(input.expectedSourceSnapshotHash, 'expectedSourceSnapshotHash'), sourceValidation: checkedHash(input.expectedSourceValidationHash, 'expectedSourceValidationHash'), candidate: checkedHash(input.expectedCandidateByteHash, 'expectedCandidateByteHash'), receiptArtifact: checkedHash(input.expectedCandidateDispatchReceiptArtifactByteHash, 'expectedCandidateDispatchReceiptArtifactByteHash'), receipt: checkedHash(input.expectedCandidateDispatchReceiptHash, 'expectedCandidateDispatchReceiptHash')
  };
  const envelopeArtifactHash = sha(savedEnvelope.bytes);
  if (envelopeArtifactHash !== expected.envelopeArtifact) fail('saved SFF-12 envelope artifact byte hash drifted.');
  exact(savedEnvelope.parsed, rederivedEnvelope, 'saved and replayed SFF-12 envelope');
  for (const envelope of [savedEnvelope.parsed, rederivedEnvelope]) if (envelope.schema !== 'ikemaker.sff-creator-approved-adapter-request' || envelope.version !== 1 || envelope.requestHash !== expected.request || envelope.requestHashToRetain !== expected.request || envelope.specificationHash !== expected.specification || envelope.approvalReceiptHash !== expected.approval || envelope.sourceSnapshotHash !== expected.source || envelope.candidateCreated !== false || envelope.sourceBytesValidated !== false || envelope.adoptionAllowed !== false || envelope.byteEqualityRequired !== false) fail('SFF-12 envelope contradicts independently retained upstream authority.');
  const request = rederivedEnvelope.request, sourceEvidence = validateCreatorSourceEvidence({ request, sourceBytesByEntryId: input.sourceBytesByEntryId });
  if (sourceEvidence.receiptHash !== expected.sourceValidation) fail('source validation receipt hash drifted from independent authority.');
  const candidateBytes = exactBuffer(input.candidateBytes, 'candidateBytes'), candidateEvidence = deriveBuiltInCandidateEvidence({ request, candidateBytes });
  if (candidateEvidence.byteHash !== expected.candidate) fail('candidate byte hash drifted from independent authority.');
  const dispatch = routeReceipt(request, candidateEvidence.byteHash);
  const receipt = deepFreeze({ schema: 'ikemaker.sff-creator-candidate-dispatch-receipt', version: 1, approvedRequestEnvelopeArtifactByteHash: envelopeArtifactHash, requestHash: expected.request, specificationHash: request.specificationHash, logicalHash: request.logicalHash, approvalReceiptHash: expected.approval, sourceSnapshotHash: request.sourceSnapshotHash, capabilitySnapshotHash: request.capabilitySnapshot.snapshotHash, selection: { targetId: request.targetId, backendId: request.backendId, adapter: { id: request.adapter.id, version: request.adapter.version } }, sourceValidationReceipt: sourceEvidence.receipt, sourceValidationHash: sourceEvidence.receiptHash, candidateByteHash: candidateEvidence.byteHash, candidateByteLength: candidateBytes.length, validation: canonicalize(candidateEvidence.validation, 'candidate validation receipt'), semanticComparison: canonicalize(candidateEvidence.semanticComparison, 'candidate semantic receipt'), dispatch: canonicalize(dispatch, 'candidate dispatch receipt'), candidateCreated: true, writesCommitted: false, adoptionAllowed: false, byteEqualityRequired: false });
  const receiptHash = hashCanonical(receipt), savedReceipt = decodeStrictJsonArtifact(exactBuffer(input.candidateDispatchReceiptArtifactBytes, 'candidateDispatchReceiptArtifactBytes'), 'saved SFF-13 candidate receipt'), receiptArtifactHash = sha(savedReceipt.bytes);
  if (receiptArtifactHash !== expected.receiptArtifact || receiptHash !== expected.receipt || hashCanonical(savedReceipt.parsed) !== expected.receipt) fail('saved SFF-13 artifact or semantic receipt hash drifted.');
  exact(savedReceipt.parsed, receipt, 'saved and independently reconstructed SFF-13 receipt');
  const effects = deepFreeze({ sourceBytesValidated: true, candidateCreated: true, writesCommitted: false, processesStarted: false, approvalsGranted: false, backendExecution: false, adoptionAllowed: false, activeArchiveModified: false, historyAppended: false });
  const core = deepFreeze({ schema: 'ikemaker.sff-creator-candidate-evidence-verification', version: 1, approvedRequestReplayInputHash: normalizedInputHash, approvedRequestEnvelopeArtifactByteHash: envelopeArtifactHash, requestHash: expected.request, specificationHash: request.specificationHash, logicalHash: request.logicalHash, approvalReceiptHash: expected.approval, sourceSnapshotHash: request.sourceSnapshotHash, capabilitySnapshotHash: request.capabilitySnapshot.snapshotHash, selection: { targetId: request.targetId, backendId: request.backendId, adapter: { id: request.adapter.id, version: request.adapter.version } }, sourceValidationHash: sourceEvidence.receiptHash, candidateDispatchReceiptArtifactByteHash: receiptArtifactHash, candidateDispatchReceiptHash: receiptHash, candidateByteHash: candidateEvidence.byteHash, candidateByteLength: candidateBytes.length, validationHash: hashCanonical(receipt.validation), semanticComparisonHash: hashCanonical(receipt.semanticComparison), dispatchHash: hashCanonical(receipt.dispatch), status: 'verified', observationClass: 'in-memory', effects, receipt });
  const metadata = deepFreeze({ ...core, verificationHash: hashCanonical(core) }), sealedCandidate = Buffer.from(candidateBytes);
  return Object.freeze({ ...metadata, copyCandidateBytes: () => Buffer.from(sealedCandidate) });
}

function verifySavedCreatorCandidateBuiltEvidence(rawInput) {
  const input = closedSavedInput(rawInput), expectedArtifactHash = checkedHash(input.expectedCandidateEvidenceVerificationArtifactByteHash, 'expectedCandidateEvidenceVerificationArtifactByteHash'), expectedVerificationHash = checkedHash(input.expectedCandidateEvidenceVerificationHash, 'expectedCandidateEvidenceVerificationHash');
  const fresh = verifyCreatorCandidateBuilt(input.candidateEvidenceInput), saved = decodeStrictJsonArtifact(exactBuffer(input.candidateEvidenceVerificationArtifactBytes, 'candidateEvidenceVerificationArtifactBytes'), 'saved CandidateBuilt evidence verification'), artifactHash = sha(saved.bytes);
  if (artifactHash !== expectedArtifactHash) fail('saved CandidateBuilt evidence artifact byte hash drifted.');
  const verification = saved.parsed;
  if (verification.schema !== 'ikemaker.sff-creator-candidate-evidence-verification' || verification.version !== 1 || verification.status !== 'verified' || verification.observationClass !== 'in-memory') fail('saved CandidateBuilt evidence has an invalid schema, version, status, or observation class.');
  const expectedEffects = { sourceBytesValidated: true, candidateCreated: true, writesCommitted: false, processesStarted: false, approvalsGranted: false, backendExecution: false, adoptionAllowed: false, activeArchiveModified: false, historyAppended: false };
  exact(verification.effects, expectedEffects, 'saved CandidateBuilt evidence effects');
  if (!Object.prototype.hasOwnProperty.call(verification, 'verificationHash')) fail('saved CandidateBuilt evidence is missing verificationHash.');
  const { verificationHash, ...verificationCore } = verification;
  if (checkedHash(verificationHash, 'saved verificationHash') !== expectedVerificationHash || hashCanonical(verificationCore) !== verificationHash) fail('saved CandidateBuilt evidence verification hash drifted.');
  const { copyCandidateBytes, ...freshMetadata } = fresh;
  exact(verification, freshMetadata, 'saved and freshly reconstructed CandidateBuilt evidence');
  const effects = deepFreeze({ writes: false, processes: false, approvalsGranted: false, backendExecution: false }), sealedCandidate = fresh.copyCandidateBytes();
  const wrapper = deepFreeze({ schema: 'ikemaker.sff-creator-saved-candidate-evidence-verification', version: 1, verification: canonicalize(verification, 'saved CandidateBuilt verification'), verificationHash, verificationArtifactByteHash: artifactHash, status: 'verified', observationClass: 'in-memory', effects });
  return Object.freeze({ ...wrapper, copyCandidateBytes: () => Buffer.from(sealedCandidate) });
}

module.exports = { verifyCreatorCandidateBuilt, verifySavedCreatorCandidateBuiltEvidence };
