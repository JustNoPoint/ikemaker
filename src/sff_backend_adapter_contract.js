'use strict';

const crypto = require('crypto');
const { createSffCapabilityReport, canonicalize, hashCanonical } = require('./sff_capability_report');
const { resolveSffTargetBackend } = require('./sff_backend_registry');
const { assertSffBuildSpecificationV2, hashSpecification, derivedFeatures, deepFreeze, assertDeepFrozen } = require('./sff_build_specification_v2');

const SFF_ADAPTER_CONTRACT_VERSION = 1;
const SHA256 = /^[0-9a-f]{64}$/i;
const REQUIRED_SEMANTIC_CHECKS = Object.freeze(['physicalOrder', 'identities', 'axes', 'dimensions', 'decodedPixels', 'paletteAssignments', 'paletteValues', 'links', 'transparency']);
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function checkedHash(value, label) { const result = String(value || '').toLowerCase(); if (!SHA256.test(result)) throw new Error(`${label} must be a SHA-256 hash.`); return result; }

function expectedSourceRows(specification) {
  return [...specification.logical.sprites, ...specification.logical.palettes].map((entry) => ({
    entryId: entry.entryId, relativePath: entry.source.relativePath, byteHash: entry.source.byteHash,
    decodedHash: entry.source.decodedHash || null, kind: entry.source.kind
  }));
}

function validateSourceSeal(specification, seal) {
  if (!seal || !Array.isArray(seal.sources)) throw new Error('A sourceSnapshotSeal with sources is required.');
  const expected = expectedSourceRows(specification), found = new Map();
  for (const [index, item] of seal.sources.entries()) {
    const entryId = String(item?.entryId || '').trim();
    if (!entryId || found.has(entryId)) throw new Error(`Source snapshot entryId at row ${index} must be present and unique.`);
    found.set(entryId, item); checkedHash(item.byteHash, `source snapshot ${entryId} byteHash`);
    if (item.decodedHash != null) checkedHash(item.decodedHash, `source snapshot ${entryId} decodedHash`);
  }
  if (found.size !== expected.length) throw new Error('Source snapshot seal does not contain exactly every logical source entry.');
  for (const wanted of expected) {
    const item = found.get(wanted.entryId);
    if (!item || item.relativePath !== wanted.relativePath || String(item.byteHash).toLowerCase() !== wanted.byteHash ||
        (item.decodedHash == null ? null : String(item.decodedHash).toLowerCase()) !== wanted.decodedHash || item.kind !== wanted.kind) throw new Error(`Source snapshot seal does not match logical source ${wanted.entryId}.`);
  }
}

function createAdapterRequest(input = {}) {
  const specification = assertSffBuildSpecificationV2(input.specification);
  assertDeepFrozen(specification);
  if (!input.expectedSpecificationHash) throw new Error('An independently retained expectedSpecificationHash is required.');
  if (specification.specificationHash !== checkedHash(input.expectedSpecificationHash, 'expectedSpecificationHash')) throw new Error('Reviewed SFF specification seal drift detected.');
  if (specification.review?.migration?.reviewRequired === true) throw new Error('Migrated legacy specifications require a new reviewed v2 specification before adapter execution.');
  const { target, backend } = resolveSffTargetBackend(specification.selection);
  if (specification.selection.adapter.id !== backend.adapter.id || specification.selection.adapter.version !== backend.adapter.version) throw new Error('Selected adapter identity/version drifted from the registry.');
  if (input.capabilityRequest?.requiredFeatures !== undefined && !Array.isArray(input.capabilityRequest.requiredFeatures)) throw new Error('capabilityRequest.requiredFeatures must be an array.');
  const required = [...new Set([...derivedFeatures(specification.logical.sprites, specification.logical.palettes), ...(specification.capabilityAssessment?.requiredFeatures || []), ...(input.capabilityRequest?.requiredFeatures || [])])].sort();
  const conversions = specification.encodingIntent.reviewedConversions || [];
  const fresh = createSffCapabilityReport({ targetId: target.id, backendId: backend.id, requiredFeatures: required, conversions, evidence: input.capabilityRequest?.evidence || {} });
  if (!fresh.exactBuildAllowed || fresh.mismatches.length) {
    const reasons = fresh.mismatches.map(item => item.detail || item.code).filter(Boolean).join(' ');
    throw new Error(`Fresh SFF capability assessment blocks adapter execution.${reasons ? ` ${reasons}` : ''}`);
  }
  const seal = canonicalize(input.sourceSnapshotSeal, 'sourceSnapshotSeal');
  validateSourceSeal(specification, seal);
  const sourceSnapshotHash = hashCanonical(seal);
  if (!input.expectedSourceSnapshotHash) throw new Error('An independently retained expectedSourceSnapshotHash is required.');
  if (sourceSnapshotHash !== checkedHash(input.expectedSourceSnapshotHash, 'expectedSourceSnapshotHash')) throw new Error('Source snapshot seal drift detected.');
  const expectedValidator = backend.strictValidator ? { id: backend.strictValidator.id, version: Number(backend.strictValidator.version) } : {
    id: String(input.capabilityRequest?.evidence?.targetProbe?.validatorId || '').trim(),
    version: Number(input.capabilityRequest?.evidence?.targetProbe?.validatorVersion)
  };
  if (!expectedValidator.id || !Number.isSafeInteger(expectedValidator.version) || expectedValidator.version < 1) throw new Error('Fresh capability evidence must identify the target-specific strict validator.');
  const request = { schema: 'ikemaker.sff-adapter-request', version: SFF_ADAPTER_CONTRACT_VERSION, specification, specificationHash: specification.specificationHash, logicalHash: specification.logicalHash, targetId: target.id, backendId: backend.id, adapter: backend.adapter, expectedValidator, capabilitySnapshot: fresh, sourceSnapshotSeal: seal, sourceSnapshotHash, intent: 'candidate-only', adoptionAllowed: false };
  request.requestHash = hashCanonical({ ...request, specification: undefined });
  return deepFreeze(request);
}

function assertAdapterRequest(request, expectedRequestHash) {
  const retainedHash = checkedHash(expectedRequestHash, 'expectedRequestHash');
  if (!request || request.schema !== 'ikemaker.sff-adapter-request' || request.version !== SFF_ADAPTER_CONTRACT_VERSION) throw new Error('A valid SFF adapter request is required.');
  assertDeepFrozen(request, 'adapter request');
  if (request.intent !== 'candidate-only' || request.adoptionAllowed !== false) throw new Error('The SFF adapter request must remain candidate-only with adoption disabled.');
  const specification = assertSffBuildSpecificationV2(request.specification);
  if (hashSpecification(specification) !== request.specificationHash || specification.specificationHash !== request.specificationHash || specification.logicalHash !== request.logicalHash) throw new Error('Adapter request specification or logical seal drift detected.');
  const calculatedRequestHash = hashCanonical({ ...request, requestHash: undefined, specification: undefined });
  if (calculatedRequestHash !== checkedHash(request.requestHash, 'request.requestHash') || calculatedRequestHash !== retainedHash) throw new Error('Adapter request seal drift detected.');
  const { target, backend } = resolveSffTargetBackend(specification.selection);
  if (request.targetId !== target.id || request.backendId !== backend.id || request.adapter?.id !== backend.adapter.id || Number(request.adapter?.version) !== Number(backend.adapter.version)) throw new Error('Adapter request target, backend, or adapter identity drifted from the current registry.');
  validateSourceSeal(specification, request.sourceSnapshotSeal);
  const sourceSnapshotHash = hashCanonical(request.sourceSnapshotSeal);
  if (sourceSnapshotHash !== checkedHash(request.sourceSnapshotHash, 'request.sourceSnapshotHash')) throw new Error('Adapter request source snapshot seal drift detected.');
  const capability = request.capabilitySnapshot || {}, reviewedCapability = specification.capabilityAssessment || {};
  const reviewedFeatures = Array.isArray(reviewedCapability.requiredFeatures) ? reviewedCapability.requiredFeatures : [];
  const freshFeatures = Array.isArray(capability.requiredFeatures) ? capability.requiredFeatures : [];
  const currentlyRequired = [...new Set([...derivedFeatures(specification.logical.sprites, specification.logical.palettes), ...reviewedFeatures])];
  if (capability.targetId !== target.id || capability.backendId !== backend.id || capability.exactBuildAllowed !== true || !Array.isArray(capability.mismatches) || capability.mismatches.length ||
      reviewedCapability.targetId !== target.id || reviewedCapability.backendId !== backend.id ||
      currentlyRequired.some((feature) => !freshFeatures.includes(feature)) ||
      reviewedFeatures.some((feature) => JSON.stringify(capability.features?.[feature]) !== JSON.stringify(reviewedCapability.features?.[feature]))) throw new Error('Adapter request capability snapshot is not bound to the reviewed specification and current selection.');
  for (const feature of freshFeatures) {
    const targetState = target.capabilities[feature] || 'unproven', backendState = backend.capabilities[feature] || 'unproven';
    const effective = targetState === 'unsupported' || backendState === 'unsupported' ? 'unsupported' : targetState === 'supported' && backendState === 'supported' ? 'supported' : 'unproven';
    if (JSON.stringify(capability.features?.[feature]) !== JSON.stringify({ target: targetState, backend: backendState, effective }) || effective !== 'supported') throw new Error(`Adapter request capability ${feature} drifted from the current registry.`);
  }
  checkedHash(capability.snapshotHash, 'capabilitySnapshot.snapshotHash');
  const expectedValidator = backend.strictValidator ? { id: backend.strictValidator.id, version: Number(backend.strictValidator.version) } : request.expectedValidator;
  if (!expectedValidator || request.expectedValidator?.id !== expectedValidator.id || Number(request.expectedValidator?.version) !== expectedValidator.version || !String(expectedValidator.id || '').trim() || !Number.isSafeInteger(expectedValidator.version) || expectedValidator.version < 1) throw new Error('Adapter request strict validator binding drifted.');
  return request;
}

function validateAdapterCandidate(request, result = {}) {
  assertAdapterRequest(request, request?.requestHash);
  for (const key of ['specificationHash', 'logicalHash', 'targetId', 'backendId']) if (result[key] !== request[key]) throw new Error(`Adapter candidate ${key} does not match its request.`);
  if (result.adapter?.id !== request.adapter.id || result.adapter?.version !== request.adapter.version) throw new Error('Adapter candidate identity/version does not match its request.');
  if (result.capabilitySnapshotHash !== request.capabilitySnapshot.snapshotHash || result.sourceSnapshotHash !== request.sourceSnapshotHash) throw new Error('Adapter candidate evidence seal drift detected.');
  if (result.adoptionAllowed !== false) throw new Error('Adapter candidates cannot grant adoption authority.');
  if (!Buffer.isBuffer(result.bytes)) throw new Error('Adapter candidate bytes are required.');
  const byteHash = checkedHash(result.byteHash, 'candidate byteHash');
  if (sha(result.bytes) !== byteHash) throw new Error('Adapter candidate byte hash mismatch.');
  const validation = result.validation || {};
  if (validation.status !== 'passed' || validation.targetId !== request.targetId || validation.backendId !== request.backendId ||
      validation.validatorId !== request.expectedValidator.id || Number(validation.validatorVersion) !== request.expectedValidator.version ||
      validation.candidateByteHash !== byteHash || validation.specificationHash !== request.specificationHash || validation.logicalHash !== request.logicalHash) throw new Error('A passed target-specific strict validation result bound to this candidate is required.');
  const semantic = result.semanticComparison || {};
  if (semantic.status !== 'passed' || semantic.targetId !== request.targetId || semantic.backendId !== request.backendId || semantic.candidateByteHash !== byteHash ||
      semantic.specificationHash !== request.specificationHash || semantic.logicalHash !== request.logicalHash || semantic.validationCandidateByteHash !== byteHash || semantic.byteEqualityRequired !== false) throw new Error('A passed logical semantic-comparison receipt bound to this candidate, with cross-writer byte equality disabled, is required.');
  const missingSemantic = REQUIRED_SEMANTIC_CHECKS.filter((name) => semantic.checks?.[name] !== true);
  if (missingSemantic.length) throw new Error(`Logical semantic comparison did not pass required checks: ${missingSemantic.join(', ')}.`);
  const sealedBytes = Buffer.from(result.bytes);
  const metadata = deepFreeze({ ...canonicalize({ ...result, bytes: undefined }, 'candidate result'), byteHash, byteLength: sealedBytes.length });
  return Object.freeze({ ...metadata, readBytes: () => Buffer.from(sealedBytes) });
}

module.exports = { SFF_ADAPTER_CONTRACT_VERSION, REQUIRED_SEMANTIC_CHECKS, createAdapterRequest, assertAdapterRequest, validateAdapterCandidate };
