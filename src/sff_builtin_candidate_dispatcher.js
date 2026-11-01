'use strict';

const crypto = require('crypto');
const { types: utilTypes } = require('util');
const { requireSffBackend, resolveSffTargetBackend } = require('./sff_backend_registry');
const { assertAdapterRequest, REQUIRED_SEMANTIC_CHECKS } = require('./sff_backend_adapter_contract');
const { createV1Pcx8Candidate } = require('./sff_v1_pcx8_v2_adapter');
const { createV20Raw8Candidate } = require('./sff_v20_raw8_v2_adapter');
const { createV21Png8Candidate } = require('./sff_v21_png8_v2_adapter');

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value); Object.values(value).forEach(deepFreeze); return value;
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function fail(message) { throw new Error(`Built-in SFF candidate dispatcher: ${message}`); }
function routeKey(targetId, backendId, adapterId, adapterVersion) { return `${targetId}\0${backendId}\0${adapterId}\0${adapterVersion}`; }

const BUILTIN_CANDIDATE_ADAPTERS = deepFreeze([
  {
    targetId: 'sff-v1', backendId: 'ikemaker-builtin-sff-v1', adapterId: 'builtin-v1-pcx8', adapterVersion: 1,
    candidateAdapterImplemented: true, processExecutionRequired: false, adoptionSupported: false, requiresValidatedAdapterRequest: true
  },
  {
    targetId: 'sff-v2.0', backendId: 'ikemaker-builtin-sff-v2.0', adapterId: 'builtin-v20-raw8', adapterVersion: 1,
    candidateAdapterImplemented: true, processExecutionRequired: false, adoptionSupported: false, requiresValidatedAdapterRequest: true
  },
  {
    targetId: 'sff-v2.1', backendId: 'ikemaker-builtin-sff-v21-png8-prerelease', adapterId: 'builtin-v21-png8', adapterVersion: 1,
    candidateAdapterImplemented: true, processExecutionRequired: false, adoptionSupported: false, requiresValidatedAdapterRequest: true
  }
]);

const ROUTES = new Map([
  [routeKey('sff-v1', 'ikemaker-builtin-sff-v1', 'builtin-v1-pcx8', 1), createV1Pcx8Candidate],
  [routeKey('sff-v2.0', 'ikemaker-builtin-sff-v2.0', 'builtin-v20-raw8', 1), createV20Raw8Candidate],
  [routeKey('sff-v2.1', 'ikemaker-builtin-sff-v21-png8-prerelease', 'builtin-v21-png8', 1), createV21Png8Candidate]
]);

function listBuiltInCandidateAdapters() { return BUILTIN_CANDIDATE_ADAPTERS; }

function privateSourceVault(request, supplied) {
  if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied) || Buffer.isBuffer(supplied) || utilTypes.isProxy(supplied) || ![Object.prototype, null].includes(Object.getPrototypeOf(supplied))) fail('sourceBytesByEntryId must be a plain, non-proxy own-property object.');
  const descriptors = Object.getOwnPropertyDescriptors(supplied), rows = request.sourceSnapshotSeal.sources, expected = new Set(rows.map((row) => row.entryId)), keys = Object.keys(supplied);
  if (keys.length !== expected.size || keys.some((key) => !expected.has(key))) fail('sourceBytesByEntryId must contain exactly every sealed entryId and no extras.');
  const paths = new Map(), vault = Object.create(null);
  for (const row of rows) {
    if (!Object.prototype.hasOwnProperty.call(supplied, row.entryId)) fail(`sourceBytesByEntryId is missing ${row.entryId}.`);
    const descriptor = descriptors[row.entryId];
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || typeof descriptor.get === 'function' || typeof descriptor.set === 'function') fail(`sourceBytesByEntryId.${row.entryId} must be an inert data property.`);
    let bytes = descriptor.value;
    if (bytes instanceof Uint8Array && !Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
    if (!Buffer.isBuffer(bytes)) fail(`sourceBytesByEntryId.${row.entryId} must be a Buffer or Uint8Array.`);
    const copy = Buffer.from(bytes), byteHash = sha256(copy);
    if (byteHash !== String(row.byteHash).toLowerCase()) fail(`source bytes drifted for ${row.entryId}.`);
    const previous = paths.get(row.relativePath);
    if (previous && previous !== byteHash) fail(`sealed source path ${row.relativePath} is ambiguous across different bytes.`);
    paths.set(row.relativePath, byteHash); vault[row.entryId] = copy;
  }
  return vault;
}

function dispatchBuiltInCandidate(input = {}) {
  const request = assertAdapterRequest(input.request, input.expectedRequestHash);
  const resolved = resolveSffTargetBackend({ targetId: request.targetId, backendId: request.backendId }), backend = requireSffBackend(request.backendId);
  if (backend.kind !== 'built-in' || backend.implemented !== true) fail(`backend ${request.backendId} is not an implemented built-in candidate adapter.`);
  if (resolved.target.id !== request.targetId || resolved.backend.id !== request.backendId) fail('target/backend registry resolution drifted.');
  const key = routeKey(request.targetId, request.backendId, request.adapter.id, request.adapter.version), route = ROUTES.get(key);
  if (!route) fail(`no exact built-in candidate route exists for ${request.targetId} / ${request.backendId} / ${request.adapter.id}@${request.adapter.version}.`);
  const vault = privateSourceVault(request, input.sourceBytesByEntryId), candidate = route(request, vault);
  if (!candidate || candidate.adoptionAllowed !== false || candidate.targetId !== request.targetId || candidate.backendId !== request.backendId || candidate.specificationHash !== request.specificationHash || candidate.logicalHash !== request.logicalHash || candidate.sourceSnapshotHash !== request.sourceSnapshotHash || candidate.capabilitySnapshotHash !== request.capabilitySnapshot.snapshotHash) fail('adapter returned a candidate outside the sealed request.');
  if (candidate.semanticComparison?.byteEqualityRequired !== false) fail('candidate semantic receipt must explicitly state that byte equality is not required.');
  const missing = REQUIRED_SEMANTIC_CHECKS.filter((name) => candidate.semanticComparison?.checks?.[name] !== true);
  if (missing.length) fail(`candidate semantic receipt failed required checks: ${missing.join(', ')}.`);
  const bytes = candidate.readBytes();
  if (!Buffer.isBuffer(bytes) || sha256(bytes) !== candidate.byteHash || bytes.length !== candidate.byteLength) fail('candidate copy-on-read bytes do not match its receipt.');
  const dispatch = deepFreeze({ schema: 'ikemaker.sff-built-in-dispatch-receipt', version: 1, requestHash: request.requestHash, targetId: request.targetId, backendId: request.backendId, adapter: { id: request.adapter.id, version: request.adapter.version }, candidateByteHash: candidate.byteHash, byteEqualityRequired: false, adoptionAllowed: false });
  return Object.freeze({ ...candidate, dispatch, readBytes: () => Buffer.from(bytes) });
}

module.exports = { BUILTIN_CANDIDATE_ADAPTERS, listBuiltInCandidateAdapters, dispatchBuiltInCandidate };
