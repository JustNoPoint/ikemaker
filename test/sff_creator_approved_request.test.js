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
const { assertAdapterRequest } = require('../src/sff_backend_adapter_contract');
const { hashCanonical } = require('../src/sff_capability_report');
const { hashSpecification } = require('../src/sff_build_specification_v2');
const { REQUIRED_CHECKS } = require('../src/sff_runtime_certification');
const kits = { 'sff-v1': require('../tools/generate_sff_v1_runtime_certification_fixtures'), 'sff-v2.0': require('../tools/generate_sff_v20_runtime_certification_fixtures'), 'sff-v2.1': require('../tools/generate_sff_runtime_certification_fixtures') };

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const H = (text) => sha(Buffer.from(text));
function colors(seed) { return Array.from({ length: 256 }, (_, index) => [(index + seed) & 255, (index * 5) & 255, 255 - index, index === 0 ? 0 : 255]); }
function source(name, seed, width, height) { return { relativePath: `input/${name}`, byteHash: H(`bytes:${seed}`), decodedHash: H(`decoded:${seed}`), width, height, provenance: { kind: 'fixture' } }; }
function palette(id, group, number) { const value = source(`${id}.png`, `pal:${id}`, 256, 1); value.provenance = { kind: 'indexed-png-image-palette', sourcePngByteHash: value.byteHash }; return { entryId: id, group, number, tableOrder: 'sff', colors: colors(number), duplicatePolicy: 'preserve-separate', source: value }; }
function sprite(id, group, number, paletteId) { return { entryId: id, group, number, axisX: 2, axisY: 8, colorDepth: 8, format: 'png8', compression: 'png8', paletteId, duplicatePolicy: 'preserve-separate', crop: { mode: 'none', axisDeltaX: 0, axisDeltaY: 0 }, source: source(`${id}.png`, id, 2, 2) }; }
const legacy = createSffBuildSpecification({ planId: 'request-bridge', sourceRoot: 'input', target: { archiveIdentity: 'request.sff', sffVersion: '2.1' }, sprites: [sprite('sprite:a', 20, 0, '1,1'), sprite('sprite:b', 20, 1, '1,2')], palettes: [palette('palette:a', 1, 1), palette('palette:b', 1, 2)], requirements: [], decisions: [], options: { shared: {}, backends: {} } });
const legacyArtifactBytes = Buffer.from(JSON.stringify(legacy));
function selected(targetId) { return targetId === 'sff-v1' ? { targetId, backendId: 'ikemaker-builtin-sff-v1' } : targetId === 'sff-v2.0' ? { targetId, backendId: 'ikemaker-builtin-sff-v2.0' } : { targetId, backendId: 'ikemaker-builtin-sff-v21-png8-prerelease' }; }
function choices(targetId) { return targetId === 'sff-v1' ? { v1PaletteMapping: [{ sourcePaletteEntryId: 'palette:a', syntheticGroup: 0, syntheticNumber: 0 }, { sourcePaletteEntryId: 'palette:b', syntheticGroup: 0, syntheticNumber: 1 }], v1PaletteDecisions: [{ spriteEntryId: 'sprite:a', mode: 'own' }, { spriteEntryId: 'sprite:b', mode: 'own' }], acknowledgements: [V1_IDENTITY_ACK] } : {}; }
function certification(generated) {
  const ledger = JSON.parse(JSON.stringify(generated.ledger)), evidenceArtifacts = {};
  for (const platform of ledger.platforms.filter((item) => item.required)) { platform.tester = 'request bridge fixture'; platform.testedAt = '2026-10-09T12:00:00.000Z'; platform.osVersion = platform.platformId; platform.ikemenBuild = 'sealed-request-fixture'; for (const fixture of platform.fixtures) for (const check of REQUIRED_CHECKS) { const bytes = Buffer.from(`${platform.platformId}:${fixture.fixtureId}:${check}:request`), id = `${platform.platformId}/${fixture.fixtureId}/${check}.bin`; fixture.checks[check] = 'pass'; fixture.checkEvidence[check] = [{ id, sha256: sha(bytes), description: 'Exact request bridge fixture evidence.' }]; evidenceArtifacts[id] = bytes.toString('base64'); } }
  const manifestText = generated.manifestBytes ? generated.manifestBytes.toString('utf8') : fs.readFileSync(generated.manifestPath, 'utf8');
  return { certification: { manifestText, ledgerText: JSON.stringify(ledger), evidenceArtifacts } };
}
function authority(targetId, evidence, approvalCapabilityRequest = {}) {
  const selection = selected(targetId), option = choices(targetId), legacyHashes = { expectedLegacyArtifactByteHash: sha(legacyArtifactBytes), expectedLegacySpecificationHash: legacy.specificationHash };
  const projection = createCreatorTargetProjection({ artifactBytes: legacyArtifactBytes, expectedArtifactByteHash: legacyHashes.expectedLegacyArtifactByteHash, expectedLegacySpecificationHash: legacy.specificationHash, ...selection, ...option });
  const projectionArtifactBytes = Buffer.from(JSON.stringify(projection, null, 2)), approvalDecision = { status: 'approved', projectionPlanHash: projection.planHash, sourceArtifactByteHash: projection.sourceArtifactByteHash, legacySpecificationHash: projection.legacySpecificationHash, projectionArtifactByteHash: sha(projectionArtifactBytes), targetId, backendId: selection.backendId, adapterId: projection.selection.adapter.id, adapterVersion: projection.selection.adapter.version, reviewedBlockerCount: 0, reviewedConversionIds: [...new Set(projection.conversions.map((item) => item.id))].sort(), acceptedMandatoryAcknowledgementIds: [...new Set(projection.mandatoryAcknowledgements.filter((item) => item.accepted).map((item) => item.id))].sort(), confirmations: Object.fromEntries(CONFIRMATION_KEYS.map((key) => [key, true])) };
  const approvalArgs = { legacyArtifactBytes, ...legacyHashes, ...selection, ...option, projectionArtifactBytes, expectedProjectionArtifactByteHash: sha(projectionArtifactBytes), expectedProjectionPlanHash: projection.planHash, approvalDecision, capabilityRequest: approvalCapabilityRequest };
  const approved = approveCreatorTargetProjection(approvalArgs), approvedEnvelopeArtifactBytes = Buffer.from(JSON.stringify(approved, null, 2));
  return { input: { legacyArtifactBytes, ...legacyHashes, ...selection, ...option, projectionArtifactBytes, expectedProjectionArtifactByteHash: approvalArgs.expectedProjectionArtifactByteHash, expectedProjectionPlanHash: projection.planHash, approvalDecision, approvalCapabilityRequest, approvedEnvelopeArtifactBytes, expectedApprovedEnvelopeArtifactByteHash: sha(approvedEnvelopeArtifactBytes), expectedSpecificationHash: approved.specificationHash, expectedApprovalReceiptHash: approved.approvalReceiptHash, expectedSourceSnapshotHash: approved.sourceSnapshotHash, freshCapabilityRequest: { evidence } }, approved };
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-approved-request-'));
try {
  const authorities = {};
  for (const targetId of ['sff-v1', 'sff-v2.0', 'sff-v2.1']) {
    const evidence = certification(kits[targetId].generate(path.join(root, targetId.replace(/[^a-z0-9]/gi, '_')))), built = authority(targetId, evidence), args = built.input; authorities[targetId] = built;
    const result = createCreatorApprovedAdapterRequest(args), repeat = createCreatorApprovedAdapterRequest(args);
    assert.strictEqual(result.requestHash, repeat.requestHash); assert.strictEqual(result.requestHashToRetain, result.requestHash); assert.strictEqual(result.request.targetId, targetId); assert.strictEqual(result.request.intent, 'candidate-only'); assert.strictEqual(result.request.adoptionAllowed, false); assert(Object.isFrozen(result)); assert(Object.isFrozen(result.request));
    assert.strictEqual(result.candidateCreated, false); assert.strictEqual(result.sourceBytesValidated, false); assert.strictEqual(result.adoptionAllowed, false); assert.strictEqual(result.byteEqualityRequired, false); assert(!Object.prototype.hasOwnProperty.call(result, 'sourceBytesByEntryId'));
    assert.strictEqual(assertAdapterRequest(result.request, result.requestHash), result.request);
  }

  const baseAuthority = authorities['sff-v2.0'], base = baseAuthority.input;
  const reorderedEnvelopeBytes = Buffer.from(JSON.stringify({ sourceSnapshotHash: baseAuthority.approved.sourceSnapshotHash, ...baseAuthority.approved }, null, 4));
  assert(createCreatorApprovedAdapterRequest({ ...base, approvedEnvelopeArtifactBytes: reorderedEnvelopeBytes, expectedApprovedEnvelopeArtifactByteHash: sha(reorderedEnvelopeBytes) }));
  assert.throws(() => createCreatorApprovedAdapterRequest({ ...base, freshCapabilityRequest: { evidence: {} } }), /blocks adapter/);
  const missingFresh = { ...base }; delete missingFresh.freshCapabilityRequest; assert.throws(() => createCreatorApprovedAdapterRequest(missingFresh), /must contain exactly/);
  const approvalCertified = authority('sff-v2.0', base.freshCapabilityRequest.evidence, { evidence: base.freshCapabilityRequest.evidence }).input; const noFresh = { ...approvalCertified }; delete noFresh.freshCapabilityRequest; assert.throws(() => createCreatorApprovedAdapterRequest(noFresh), /must contain exactly/, 'approval-time evidence never substitutes for fresh evidence');
  for (const key of ['expectedApprovedEnvelopeArtifactByteHash', 'expectedSpecificationHash', 'expectedApprovalReceiptHash', 'expectedSourceSnapshotHash']) assert.throws(() => createCreatorApprovedAdapterRequest({ ...base, [key]: 'f'.repeat(64) }), /hash|artifact/i);
  const extraEnvelopeBytes = Buffer.from(JSON.stringify({ ...baseAuthority.approved, candidateCreated: true, extraAuthority: true })); assert.throws(() => createCreatorApprovedAdapterRequest({ ...base, approvedEnvelopeArtifactBytes: extraEnvelopeBytes, expectedApprovedEnvelopeArtifactByteHash: sha(extraEnvelopeBytes) }), /does not exactly match/);
  const forged = JSON.parse(JSON.stringify(baseAuthority.approved)); forged.approvalReceipt.status = 'forged'; forged.approvalReceiptHash = require('../src/sff_capability_report').hashCanonical(forged.approvalReceipt); forged.specification.review.creatorProjectionApproval.approvalReceiptHash = forged.approvalReceiptHash; const forgedBytes = Buffer.from(JSON.stringify(forged)); assert.throws(() => createCreatorApprovedAdapterRequest({ ...base, approvedEnvelopeArtifactBytes: forgedBytes, expectedApprovedEnvelopeArtifactByteHash: sha(forgedBytes), expectedApprovalReceiptHash: forged.approvalReceiptHash }), /does not exactly match/);
  const forgedSpecification = JSON.parse(JSON.stringify(baseAuthority.approved)); forgedSpecification.specification.review.creatorProjectionApproval.humanReviewComplete = false; forgedSpecification.specification.specificationHash = hashSpecification(forgedSpecification.specification); forgedSpecification.specificationHash = forgedSpecification.specification.specificationHash; const forgedSpecificationBytes = Buffer.from(JSON.stringify(forgedSpecification)); assert.throws(() => createCreatorApprovedAdapterRequest({ ...base, approvedEnvelopeArtifactBytes: forgedSpecificationBytes, expectedApprovedEnvelopeArtifactByteHash: sha(forgedSpecificationBytes), expectedSpecificationHash: forgedSpecification.specificationHash }), /does not exactly match/);
  const forgedSeal = JSON.parse(JSON.stringify(baseAuthority.approved)); forgedSeal.sourceSnapshotSeal.sources[0].relativePath = 'input/forged.png'; forgedSeal.sourceSnapshotHash = hashCanonical(forgedSeal.sourceSnapshotSeal); const forgedSealBytes = Buffer.from(JSON.stringify(forgedSeal)); assert.throws(() => createCreatorApprovedAdapterRequest({ ...base, approvedEnvelopeArtifactBytes: forgedSealBytes, expectedApprovedEnvelopeArtifactByteHash: sha(forgedSealBytes), expectedSourceSnapshotHash: forgedSeal.sourceSnapshotHash }), /does not exactly match/);
  assert.throws(() => createCreatorApprovedAdapterRequest({ ...base, sourceBytesByEntryId: {} }), /must contain exactly/);
  assert.throws(() => createCreatorApprovedAdapterRequest(new Proxy(base, {})), /non-proxy/);
  assert.throws(() => createCreatorApprovedAdapterRequest({ ...base, freshCapabilityRequest: new Proxy(base.freshCapabilityRequest, {}) }), /non-proxy/);
  assert.throws(() => createCreatorApprovedAdapterRequest({ ...base, freshCapabilityRequest: { evidence: new Proxy(base.freshCapabilityRequest.evidence, {}) } }), /non-proxy/);
  assert.throws(() => createCreatorApprovedAdapterRequest({ ...base, freshCapabilityRequest: { evidence: base.freshCapabilityRequest.evidence, unknown: true } }), /unknown field/);
  assert.throws(() => createCreatorApprovedAdapterRequest({ ...base, v1PaletteMapping: [] }), /must contain exactly/, 'v1-only fields are rejected for v2 targets');
  const v1Missing = { ...authorities['sff-v1'].input }; delete v1Missing.acknowledgements; assert.throws(() => createCreatorApprovedAdapterRequest(v1Missing), /must contain exactly/);
  const moduleText = fs.readFileSync(path.join(__dirname, '..', 'src', 'sff_creator_approved_request.js'), 'utf8'); assert(!/require\(['"](?:fs|child_process|vscode)['"]\)/.test(moduleText)); assert(!/\b(?:writeFile|spawn|execFile|randomUUID|Date\.now)\b/.test(moduleText));
  console.log('SFF Creator approved-request bridge rederives exact approval authority and emits only frozen, fresh-capability, candidate-only requests for v1/v2.0/v2.1');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
