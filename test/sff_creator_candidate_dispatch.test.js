'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSffBuildSpecification } = require('../src/sff_build_specification');
const { createCreatorTargetProjection, V1_IDENTITY_ACK } = require('../src/sff_creator_target_projection');
const { CONFIRMATION_KEYS, approveCreatorTargetProjection } = require('../src/sff_creator_target_projection_approval');
const { createCreatorApprovedAdapterRequest } = require('../src/sff_creator_approved_request');
const { dispatchCreatorApprovedCandidate } = require('../src/sff_creator_candidate_dispatch');
const { hashCanonical } = require('../src/sff_capability_report');
const { encodeIndexed } = require('../src/sff_palette_remap');
const { crc32, readIndexedPng8 } = require('../src/sff_png8_source');
const { REQUIRED_CHECKS } = require('../src/sff_runtime_certification');
const kits = { 'sff-v1': require('../tools/generate_sff_v1_runtime_certification_fixtures'), 'sff-v2.0': require('../tools/generate_sff_v20_runtime_certification_fixtures'), 'sff-v2.1': require('../tools/generate_sff_runtime_certification_fixtures') };

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
function colors(seed = 0) { return Array.from({ length: 256 }, (_, index) => [(index + seed) & 255, (index * 3) & 255, 255 - index, index === 0 ? 0 : 255]); }
function certification(generated) {
  const ledger = JSON.parse(JSON.stringify(generated.ledger)), evidenceArtifacts = {};
  for (const platform of ledger.platforms.filter((item) => item.required)) {
    platform.tester = 'creator dispatch fixture'; platform.testedAt = '2026-10-09T12:00:00.000Z'; platform.osVersion = platform.platformId; platform.ikemenBuild = 'creator-dispatch-fixture';
    for (const fixture of platform.fixtures) for (const check of REQUIRED_CHECKS) { const bytes = Buffer.from(`${platform.platformId}:${fixture.fixtureId}:${check}:creator-dispatch`), id = `${platform.platformId}/${fixture.fixtureId}/${check}.bin`; fixture.checks[check] = 'pass'; fixture.checkEvidence[check] = [{ id, sha256: sha(bytes), description: 'Exact creator dispatch fixture evidence.' }]; evidenceArtifacts[id] = bytes.toString('base64'); }
  }
  const manifestText = generated.manifestBytes ? generated.manifestBytes.toString('utf8') : fs.readFileSync(generated.manifestPath, 'utf8');
  return { certification: { manifestText, ledgerText: JSON.stringify(ledger), evidenceArtifacts } };
}
function selection(targetId) { return targetId === 'sff-v1' ? { targetId, backendId: 'ikemaker-builtin-sff-v1' } : targetId === 'sff-v2.0' ? { targetId, backendId: 'ikemaker-builtin-sff-v2.0' } : { targetId, backendId: 'ikemaker-builtin-sff-v21-png8-prerelease' }; }
function buildFixture(targetId, evidence, overrides = {}) {
  const paletteColors = overrides.paletteColors || colors(), spriteIndices = Buffer.from([0, 1, 2, 3]);
  const spriteBytes = overrides.spriteBytes || encodeIndexed(2, 2, spriteIndices, paletteColors), spriteDecoded = readIndexedPng8(encodeIndexed(2, 2, spriteIndices, paletteColors));
  const paletteIndices = Buffer.from(Array.from({ length: 256 }, (_, index) => index)), paletteBytes = overrides.paletteBytes || encodeIndexed(16, 16, paletteIndices, paletteColors), paletteDecoded = readIndexedPng8(encodeIndexed(16, 16, paletteIndices, paletteColors));
  const spriteWidth = overrides.spriteWidth ?? 2, spriteHeight = overrides.spriteHeight ?? 2, spriteDecodedHash = overrides.spriteDecodedHash || spriteDecoded.decodedHash;
  const spriteSource = { relativePath: 'input/sprite.png', byteHash: sha(spriteBytes), decodedHash: spriteDecodedHash, width: spriteWidth, height: spriteHeight, provenance: { kind: 'fixture' } };
  const paletteSource = { relativePath: 'input/palette.png', byteHash: sha(paletteBytes), decodedHash: paletteDecoded.decodedHash, width: 16, height: 16, provenance: { kind: 'indexed-png-image-palette', sourcePngByteHash: sha(paletteBytes) } };
  const legacy = overrides.legacy || createSffBuildSpecification({ planId: `creator-dispatch-${targetId}`, sourceRoot: 'input', target: { archiveIdentity: `${targetId}.sff`, sffVersion: '2.1' }, sprites: [{ entryId: 'sprite:a', group: 0, number: 0, axisX: 1, axisY: 2, colorDepth: 8, format: 'png8', compression: 'png8', paletteId: '1,1', duplicatePolicy: 'preserve-separate', crop: { mode: 'none', axisDeltaX: 0, axisDeltaY: 0 }, source: spriteSource }], palettes: [{ entryId: 'palette:a', group: 1, number: 1, tableOrder: 'sff', colors: paletteColors, duplicatePolicy: 'preserve-separate', source: paletteSource }], requirements: [], decisions: [], options: { shared: {}, backends: {} } });
  const legacyArtifactBytes = Buffer.from(JSON.stringify(legacy)), selected = selection(targetId), v1 = targetId === 'sff-v1' ? { v1PaletteMapping: [{ sourcePaletteEntryId: 'palette:a', syntheticGroup: 0, syntheticNumber: 0 }], v1PaletteDecisions: [{ spriteEntryId: 'sprite:a', mode: 'own' }], acknowledgements: [V1_IDENTITY_ACK] } : {};
  const projection = createCreatorTargetProjection({ artifactBytes: legacyArtifactBytes, expectedArtifactByteHash: sha(legacyArtifactBytes), expectedLegacySpecificationHash: legacy.specificationHash, ...selected, ...v1 });
  const projectionArtifactBytes = Buffer.from(JSON.stringify(projection, null, 2));
  const approvalDecision = { status: 'approved', projectionPlanHash: projection.planHash, sourceArtifactByteHash: projection.sourceArtifactByteHash, legacySpecificationHash: projection.legacySpecificationHash, projectionArtifactByteHash: sha(projectionArtifactBytes), targetId, backendId: selected.backendId, adapterId: projection.selection.adapter.id, adapterVersion: projection.selection.adapter.version, reviewedBlockerCount: 0, reviewedConversionIds: [...new Set(projection.conversions.map((item) => item.id))].sort(), acceptedMandatoryAcknowledgementIds: [...new Set(projection.mandatoryAcknowledgements.filter((item) => item.accepted).map((item) => item.id))].sort(), confirmations: Object.fromEntries(CONFIRMATION_KEYS.map((key) => [key, true])) };
  const approvalArgs = { legacyArtifactBytes, expectedLegacyArtifactByteHash: sha(legacyArtifactBytes), expectedLegacySpecificationHash: legacy.specificationHash, ...selected, ...v1, projectionArtifactBytes, expectedProjectionArtifactByteHash: sha(projectionArtifactBytes), expectedProjectionPlanHash: projection.planHash, approvalDecision, capabilityRequest: {} };
  const approved = approveCreatorTargetProjection(approvalArgs), approvedEnvelopeArtifactBytes = Buffer.from(JSON.stringify(approved, null, 2));
  const approvedRequestInput = { legacyArtifactBytes, expectedLegacyArtifactByteHash: approvalArgs.expectedLegacyArtifactByteHash, expectedLegacySpecificationHash: legacy.specificationHash, ...selected, ...v1, projectionArtifactBytes, expectedProjectionArtifactByteHash: approvalArgs.expectedProjectionArtifactByteHash, expectedProjectionPlanHash: projection.planHash, approvalDecision, approvalCapabilityRequest: {}, approvedEnvelopeArtifactBytes, expectedApprovedEnvelopeArtifactByteHash: sha(approvedEnvelopeArtifactBytes), expectedSpecificationHash: approved.specificationHash, expectedApprovalReceiptHash: approved.approvalReceiptHash, expectedSourceSnapshotHash: approved.sourceSnapshotHash, freshCapabilityRequest: { evidence } };
  const requestEnvelope = createCreatorApprovedAdapterRequest(approvedRequestInput), requestEnvelopeArtifactBytes = Buffer.from(JSON.stringify(requestEnvelope, null, 2));
  return { input: { approvedRequestInput, approvedRequestEnvelopeArtifactBytes: requestEnvelopeArtifactBytes, expectedApprovedRequestEnvelopeArtifactByteHash: sha(requestEnvelopeArtifactBytes), expectedRequestHash: requestEnvelope.requestHash, expectedSpecificationHash: requestEnvelope.specificationHash, expectedApprovalReceiptHash: requestEnvelope.approvalReceiptHash, expectedSourceSnapshotHash: requestEnvelope.sourceSnapshotHash, sourceBytesByEntryId: overrides.sourceBytesByEntryId || { 'sprite:a': spriteBytes, 'palette:a': paletteBytes } }, requestEnvelope };
}

function runTests() { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-creator-dispatch-')); try {
  const evidence = Object.fromEntries(Object.entries(kits).map(([targetId, kit]) => [targetId, certification(kit.generate(path.join(root, targetId.replace(/[^a-z0-9]/gi, '_'))))]));
  const fixtures = {};
  for (const targetId of Object.keys(kits)) {
    const fixture = buildFixture(targetId, evidence[targetId]), first = dispatchCreatorApprovedCandidate(fixture.input), repeat = dispatchCreatorApprovedCandidate(fixture.input); fixtures[targetId] = fixture;
    assert.strictEqual(first.receiptHash, repeat.receiptHash); assert.strictEqual(first.receipt.candidateByteHash, repeat.receipt.candidateByteHash); assert.deepStrictEqual(first.readCandidateBytes(), repeat.readCandidateBytes());
    assert(Object.isFrozen(first)); assert(Object.isFrozen(first.receipt)); assert(Object.isFrozen(first.receipt.sourceValidationReceipt)); assert.strictEqual(first.receipt.selection.targetId, targetId); assert.strictEqual(first.receipt.writesCommitted, false); assert.strictEqual(first.receipt.adoptionAllowed, false); assert.strictEqual(first.receipt.byteEqualityRequired, false); assert.strictEqual(first.receipt.semanticComparison.byteEqualityRequired, false);
    assert.strictEqual(first.receipt.sourceValidationReceipt.sources[0].verification, 'byte-hash-and-indexed-pixels-verified');
    assert.strictEqual(first.receipt.sourceValidationReceipt.sources[1].semanticUse, targetId === 'sff-v1' ? 'candidate-indexed-palette' : 'provenance-only');
    const copy = first.readCandidateBytes(); copy[0] ^= 0xff; assert.notDeepStrictEqual(copy, first.readCandidateBytes());
    const sourceBefore = Buffer.from(fixture.input.sourceBytesByEntryId['sprite:a']); const result = dispatchCreatorApprovedCandidate(fixture.input); fixture.input.sourceBytesByEntryId['sprite:a'][0] ^= 0xff; assert.deepStrictEqual(result.readCandidateBytes(), first.readCandidateBytes()); fixture.input.sourceBytesByEntryId['sprite:a'] = sourceBefore;
  }

  const base = fixtures['sff-v2.1'].input;
  const reordered = Buffer.from(JSON.stringify({ requestHashToRetain: fixtures['sff-v2.1'].requestEnvelope.requestHashToRetain, ...fixtures['sff-v2.1'].requestEnvelope }, null, 4));
  assert(dispatchCreatorApprovedCandidate({ ...base, approvedRequestEnvelopeArtifactBytes: reordered, expectedApprovedRequestEnvelopeArtifactByteHash: sha(reordered) }));
  assert.throws(() => dispatchCreatorApprovedCandidate({ ...base, adoptionAllowed: true }), /contain exactly/);
  assert.throws(() => dispatchCreatorApprovedCandidate(new Proxy(base, {})), /non-proxy/);
  const accessorRoot = { ...base }; Object.defineProperty(accessorRoot, 'expectedRequestHash', { enumerable: true, get: () => base.expectedRequestHash }); assert.throws(() => dispatchCreatorApprovedCandidate(accessorRoot), /data property/);
  for (const key of ['expectedApprovedRequestEnvelopeArtifactByteHash', 'expectedRequestHash', 'expectedSpecificationHash', 'expectedApprovalReceiptHash', 'expectedSourceSnapshotHash']) assert.throws(() => dispatchCreatorApprovedCandidate({ ...base, [key]: 'f'.repeat(64) }), /hash|authority|seal|match/i);
  const extraEnvelope = Buffer.from(JSON.stringify({ ...fixtures['sff-v2.1'].requestEnvelope, adoptionAllowed: true, forged: true })); assert.throws(() => dispatchCreatorApprovedCandidate({ ...base, approvedRequestEnvelopeArtifactBytes: extraEnvelope, expectedApprovedRequestEnvelopeArtifactByteHash: sha(extraEnvelope) }), /does not exactly match/);
  const forgedRequest = JSON.parse(JSON.stringify(fixtures['sff-v2.1'].requestEnvelope)); forgedRequest.request.intent = 'forged'; forgedRequest.request.requestHash = hashCanonical({ ...forgedRequest.request, requestHash: undefined, specification: undefined }); forgedRequest.requestHash = forgedRequest.requestHashToRetain = forgedRequest.request.requestHash; const forgedRequestBytes = Buffer.from(JSON.stringify(forgedRequest)); assert.throws(() => dispatchCreatorApprovedCandidate({ ...base, approvedRequestEnvelopeArtifactBytes: forgedRequestBytes, expectedApprovedRequestEnvelopeArtifactByteHash: sha(forgedRequestBytes), expectedRequestHash: forgedRequest.requestHash }), /does not exactly match/);
  const keys = Object.keys(base.sourceBytesByEntryId), missing = { ...base.sourceBytesByEntryId }; delete missing[keys[0]]; assert.throws(() => dispatchCreatorApprovedCandidate({ ...base, sourceBytesByEntryId: missing }), /exactly every/);
  assert.throws(() => dispatchCreatorApprovedCandidate({ ...base, sourceBytesByEntryId: { ...base.sourceBytesByEntryId, extra: Buffer.alloc(0) } }), /exactly every/);
  assert.throws(() => dispatchCreatorApprovedCandidate({ ...base, sourceBytesByEntryId: new Proxy(base.sourceBytesByEntryId, {}) }), /non-proxy/);
  const accessorVault = { ...base.sourceBytesByEntryId }; Object.defineProperty(accessorVault, keys[0], { enumerable: true, get: () => base.sourceBytesByEntryId[keys[0]] }); assert.throws(() => dispatchCreatorApprovedCandidate({ ...base, sourceBytesByEntryId: accessorVault }), /inert data property/);
  const proxiedBytes = { ...base.sourceBytesByEntryId, [keys[0]]: new Proxy(base.sourceBytesByEntryId[keys[0]], {}) }; assert.throws(() => dispatchCreatorApprovedCandidate({ ...base, sourceBytesByEntryId: proxiedBytes }), /must not be a proxy/);
  const nonEnumerable = { ...base.sourceBytesByEntryId }; Object.defineProperty(nonEnumerable, 'hidden', { value: Buffer.alloc(0), enumerable: false }); assert.throws(() => dispatchCreatorApprovedCandidate({ ...base, sourceBytesByEntryId: nonEnumerable }), /exactly every/);
  const symbolVault = { ...base.sourceBytesByEntryId, [Symbol('hidden')]: Buffer.alloc(0) }; assert.throws(() => dispatchCreatorApprovedCandidate({ ...base, sourceBytesByEntryId: symbolVault }), /symbol/);
  assert.throws(() => dispatchCreatorApprovedCandidate({ ...base, sourceBytesByEntryId: { ...base.sourceBytesByEntryId, [keys[0]]: Buffer.from('drift') } }), /bytes drifted/i);

  const malformed = buildFixture('sff-v2.1', evidence['sff-v2.1'], { spriteBytes: Buffer.from('not-png') }); assert.throws(() => dispatchCreatorApprovedCandidate(malformed.input), /not a PNG/);
  const truecolorBytes = Buffer.from(base.sourceBytesByEntryId['sprite:a']); truecolorBytes[25] = 2; truecolorBytes.writeUInt32BE(crc32(truecolorBytes.subarray(12, 29)), 29); const truecolor = buildFixture('sff-v2.1', evidence['sff-v2.1'], { spriteBytes: truecolorBytes }); assert.throws(() => dispatchCreatorApprovedCandidate(truecolor.input), /indexed PNG input/);
  const dimensions = buildFixture('sff-v2.1', evidence['sff-v2.1'], { spriteWidth: 3 }); assert.throws(() => dispatchCreatorApprovedCandidate(dimensions.input), /dimensions drifted/);
  const decoded = buildFixture('sff-v2.1', evidence['sff-v2.1'], { spriteDecodedHash: 'a'.repeat(64) }); assert.throws(() => dispatchCreatorApprovedCandidate(decoded.input), /decoded-index hash drifted/);
  const changedColors = colors(1), v1PaletteDrift = buildFixture('sff-v1', evidence['sff-v1'], { paletteColors: changedColors, paletteBytes: encodeIndexed(16, 16, Buffer.from(Array.from({ length: 256 }, (_, index) => index)), colors()) }); assert.throws(() => dispatchCreatorApprovedCandidate(v1PaletteDrift.input), /palette colors drifted/);
  const provenanceOnlyPalette = buildFixture('sff-v2.0', evidence['sff-v2.0'], { paletteBytes: Buffer.from('sealed palette provenance, not candidate image input') }); const provenanceOnlyResult = dispatchCreatorApprovedCandidate(provenanceOnlyPalette.input); assert.strictEqual(provenanceOnlyResult.receipt.sourceValidationReceipt.sources[1].verification, 'byte-hash-verified-not-decoded-for-candidate');

  const sourceText = fs.readFileSync(path.join(__dirname, '..', 'src', 'sff_creator_candidate_dispatch.js'), 'utf8');
  assert(!/require\(['"](?:fs|child_process|vscode)['"]\)/.test(sourceText)); assert(!/\b(?:writeFile|spawn|execFile|randomUUID|Date\.now)\b/.test(sourceText));
  console.log('SFF Creator exact-source dispatch replays approval, validates indexed sources, and returns only immutable candidate receipts with adoption disabled');
} finally { fs.rmSync(root, { recursive: true, force: true }); } }

if (require.main === module) runTests();
module.exports = { buildFixture, certification, kits };
