'use strict';

const crypto = require('crypto');
const { createSffV21Bytes } = require('./sff_v21_writer');
const { validateAdapterCandidate } = require('./sff_backend_adapter_contract');
const { assertBuiltInCandidateRequestProfile, deriveBuiltInCandidateEvidence, projectV21RequestSpecification } = require('./sff_builtin_candidate_evidence');

function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function fail(message) { throw new Error(`Built-in SFF v2.1 PNG8 v2 adapter: ${message}`); }
function exactObject(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`); return value; }
function sourceVault(request, bytesByEntryId) {
  exactObject(bytesByEntryId, 'sourceBytesByEntryId');
  const expected = request.sourceSnapshotSeal.sources, keys = Object.keys(bytesByEntryId);
  if (keys.length !== expected.length || keys.some(key => !expected.some(row => row.entryId === key))) fail('source bytes must contain exactly every sealed entryId.');
  const vault = new Map(), paths = new Map();
  for (const row of expected) {
    let bytes = bytesByEntryId[row.entryId]; if (bytes instanceof Uint8Array && !Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
    if (!Buffer.isBuffer(bytes) || sha(bytes) !== String(row.byteHash).toLowerCase()) fail(`source bytes drifted for ${row.entryId}.`);
    const prior = paths.get(row.relativePath); if (prior && prior !== row.byteHash) fail(`source path ${row.relativePath} is ambiguous across different bytes.`);
    paths.set(row.relativePath, row.byteHash); vault.set(row.entryId, Buffer.from(bytes));
  }
  return vault;
}
function createV21Png8Candidate(request, sourceBytesByEntryId) {
  request = assertBuiltInCandidateRequestProfile(request, 'sff-v2.1');
  const vault = sourceVault(request, sourceBytesByEntryId), projected = projectV21RequestSpecification(request), pathToEntry = new Map(request.sourceSnapshotSeal.sources.map(row => [row.relativePath, row.entryId]));
  const bytes = createSffV21Bytes(projected, { readSource: relativePath => { const id = pathToEntry.get(relativePath); return id ? vault.get(id) : null; } }), evidence = deriveBuiltInCandidateEvidence({ request, candidateBytes: bytes });
  return validateAdapterCandidate(request, { specificationHash: request.specificationHash, logicalHash: request.logicalHash, targetId: request.targetId, backendId: request.backendId, adapter: request.adapter, capabilitySnapshotHash: request.capabilitySnapshot.snapshotHash, sourceSnapshotHash: request.sourceSnapshotHash, adoptionAllowed: false, bytes, byteHash: evidence.byteHash, validation: evidence.validation, semanticComparison: evidence.semanticComparison });
}

module.exports = { createV21Png8Candidate };
