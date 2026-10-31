'use strict';

const crypto = require('crypto');
const { readIndexedPng8 } = require('./sff_png8_source');
const { createSffV20Raw8Bytes } = require('./sff_v20_raw8_writer');
const { validateAdapterCandidate } = require('./sff_backend_adapter_contract');
const { assertBuiltInCandidateRequestProfile, deriveBuiltInCandidateEvidence } = require('./sff_builtin_candidate_evidence');

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function fail(message) { throw new Error(`Built-in SFF v2.0 RAW8 v2 adapter: ${message}`); }
function plainObject(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value) || Buffer.isBuffer(value)) fail(`${label} must be an entryId-keyed object.`); return value; }
function sourceVault(request, sourceBytesByEntryId) {
  plainObject(sourceBytesByEntryId, 'sourceBytesByEntryId');
  const rows = request.sourceSnapshotSeal.sources, keys = Object.keys(sourceBytesByEntryId), expected = new Set(rows.map(row => row.entryId));
  if (keys.length !== rows.length || keys.some(key => !expected.has(key))) fail('source bytes must contain exactly every sealed entryId.');
  const vault = new Map(), paths = new Map();
  for (const row of rows) {
    let bytes = sourceBytesByEntryId[row.entryId]; if (bytes instanceof Uint8Array && !Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
    if (!Buffer.isBuffer(bytes) || sha256(bytes) !== String(row.byteHash).toLowerCase()) fail(`source bytes drifted for ${row.entryId}.`);
    const previous = paths.get(row.relativePath); if (previous && previous !== row.byteHash) fail(`source path ${row.relativePath} is ambiguous across different sealed bytes.`);
    paths.set(row.relativePath, row.byteHash); vault.set(row.entryId, Buffer.from(bytes));
  }
  return vault;
}
function decodedPixels(request, vault) {
  const result = {};
  for (const sprite of request.specification.logical.sprites) {
    if (sprite.pixels.kind !== 'indexed8' || sprite.source.kind !== 'complete-image') fail(`sprite ${sprite.entryId} is outside complete-image indexed8 intake.`);
    let decoded; try { decoded = readIndexedPng8(vault.get(sprite.entryId)); } catch (error) { fail(`sprite ${sprite.entryId} source is not accepted PNG8: ${error.message}`); }
    if (decoded.width !== sprite.width || decoded.height !== sprite.height) fail(`sprite ${sprite.entryId} source dimensions drifted.`);
    if (decoded.decodedHash !== sprite.pixels.decodedHash || decoded.decodedHash !== sprite.source.decodedHash) fail(`sprite ${sprite.entryId} decoded indexes drifted.`);
    result[sprite.entryId] = Buffer.from(decoded.indices);
  }
  return result;
}
function createV20Raw8Candidate(request, sourceBytesByEntryId) {
  request = assertBuiltInCandidateRequestProfile(request, 'sff-v2.0');
  const vault = sourceVault(request, sourceBytesByEntryId), pixels = decodedPixels(request, vault);
  const bytes = createSffV20Raw8Bytes(request.specification, { decodedPixelsByEntryId: pixels }), evidence = deriveBuiltInCandidateEvidence({ request, candidateBytes: bytes });
  return validateAdapterCandidate(request, { specificationHash: request.specificationHash, logicalHash: request.logicalHash, targetId: request.targetId, backendId: request.backendId, adapter: request.adapter, capabilitySnapshotHash: request.capabilitySnapshot.snapshotHash, sourceSnapshotHash: request.sourceSnapshotHash, adoptionAllowed: false, bytes, byteHash: evidence.byteHash, validation: evidence.validation, semanticComparison: evidence.semanticComparison });
}

module.exports = { createV20Raw8Candidate };
