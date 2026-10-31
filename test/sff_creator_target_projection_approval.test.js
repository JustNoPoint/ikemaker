'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSffBuildSpecification } = require('../src/sff_build_specification');
const { createCreatorTargetProjection, V1_IDENTITY_ACK } = require('../src/sff_creator_target_projection');
const { CONFIRMATION_KEYS, approveCreatorTargetProjection } = require('../src/sff_creator_target_projection_approval');
const { createAdapterRequest } = require('../src/sff_backend_adapter_contract');
const { REQUIRED_CHECKS } = require('../src/sff_runtime_certification');
const v20Kit = require('../tools/generate_sff_v20_runtime_certification_fixtures');

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const H = (text) => sha(Buffer.from(text));
function colors(seed) { return Array.from({ length: 256 }, (_, index) => [(index + seed) & 255, (index * 3) & 255, 255 - index, index === 0 ? 0 : 255]); }
function source(name, seed, width, height) { return { relativePath: `input/${name}`, byteHash: H(`bytes:${seed}`), decodedHash: H(`decoded:${seed}`), width, height, provenance: { kind: 'fixture' } }; }
function palette(id, group, number) { const value = source(`${id}.png`, `palette:${id}`, 256, 1); value.provenance = { kind: 'indexed-png-image-palette', sourcePngByteHash: value.byteHash }; return { entryId: id, group, number, tableOrder: 'sff', colors: colors(number), duplicatePolicy: 'preserve-separate', source: value }; }
function sprite(id, group, number, paletteId) { return { entryId: id, group, number, axisX: 3, axisY: 9, colorDepth: 8, format: 'png8', compression: 'png8', paletteId, duplicatePolicy: 'preserve-separate', crop: { mode: 'none', axisDeltaX: 0, axisDeltaY: 0 }, source: source(`${id}.png`, id, 2, 2) }; }
const legacy = createSffBuildSpecification({ planId: 'approval', sourceRoot: 'input', target: { archiveIdentity: 'approved.sff', sffVersion: '2.1' }, sprites: [sprite('sprite:a', 10, 0, '1,1'), sprite('sprite:b', 10, 1, '1,2')], palettes: [palette('palette:a', 1, 1), palette('palette:b', 1, 2)], requirements: [], decisions: [], options: { shared: {}, backends: {} } });
const legacyArtifactBytes = Buffer.from(JSON.stringify(legacy)), legacyArgs = { legacyArtifactBytes, expectedLegacyArtifactByteHash: sha(legacyArtifactBytes), expectedLegacySpecificationHash: legacy.specificationHash };
function selected(targetId) { return targetId === 'sff-v1' ? { targetId, backendId: 'ikemaker-builtin-sff-v1' } : targetId === 'sff-v2.0' ? { targetId, backendId: 'ikemaker-builtin-sff-v2.0' } : { targetId, backendId: 'ikemaker-builtin-sff-v21-png8-prerelease' }; }
function choices(targetId) { return targetId === 'sff-v1' ? { v1PaletteMapping: [{ sourcePaletteEntryId: 'palette:a', syntheticGroup: 0, syntheticNumber: 0 }, { sourcePaletteEntryId: 'palette:b', syntheticGroup: 0, syntheticNumber: 1 }], v1PaletteDecisions: [{ spriteEntryId: 'sprite:a', mode: 'own' }, { spriteEntryId: 'sprite:b', mode: 'own' }], acknowledgements: [V1_IDENTITY_ACK] } : {}; }
function setup(targetId, artifactTransform = (value) => JSON.stringify(value, null, 2)) {
  const select = selected(targetId), option = choices(targetId), projection = createCreatorTargetProjection({ artifactBytes: legacyArtifactBytes, expectedArtifactByteHash: legacyArgs.expectedLegacyArtifactByteHash, expectedLegacySpecificationHash: legacy.specificationHash, ...select, ...option });
  const projectionArtifactBytes = Buffer.from(artifactTransform(projection)), conversionIds = [...new Set(projection.conversions.map((item) => item.id))].sort(), ackIds = [...new Set(projection.mandatoryAcknowledgements.filter((item) => item.accepted).map((item) => item.id))].sort();
  const approvalDecision = { status: 'approved', projectionPlanHash: projection.planHash, sourceArtifactByteHash: projection.sourceArtifactByteHash, legacySpecificationHash: projection.legacySpecificationHash, projectionArtifactByteHash: sha(projectionArtifactBytes), targetId, backendId: select.backendId, adapterId: projection.selection.adapter.id, adapterVersion: projection.selection.adapter.version, reviewedBlockerCount: 0, reviewedConversionIds: conversionIds, acceptedMandatoryAcknowledgementIds: ackIds, confirmations: Object.fromEntries(CONFIRMATION_KEYS.map((key) => [key, true])) };
  return { ...legacyArgs, ...select, ...option, projection, projectionArtifactBytes, expectedProjectionArtifactByteHash: sha(projectionArtifactBytes), expectedProjectionPlanHash: projection.planHash, approvalDecision };
}
function completeCertification(generated) {
  const ledger = JSON.parse(JSON.stringify(generated.ledger)), evidenceArtifacts = {};
  for (const platform of ledger.platforms.filter((item) => item.required)) { platform.tester = 'approval fixture'; platform.testedAt = '2026-10-09T12:00:00.000Z'; platform.osVersion = platform.platformId; platform.ikemenBuild = 'sealed-approval-fixture'; for (const fixture of platform.fixtures) for (const check of REQUIRED_CHECKS) { const bytes = Buffer.from(`${platform.platformId}:${fixture.fixtureId}:${check}:approval`), id = `${platform.platformId}/${fixture.fixtureId}/${check}.bin`; fixture.checks[check] = 'pass'; fixture.checkEvidence[check] = [{ id, sha256: sha(bytes), description: 'Exact approval fixture evidence.' }]; evidenceArtifacts[id] = bytes.toString('base64'); } }
  return { certification: { manifestText: generated.manifestBytes.toString('utf8'), ledgerText: JSON.stringify(ledger), evidenceArtifacts } };
}

for (const targetId of ['sff-v1', 'sff-v2.0', 'sff-v2.1']) {
  const args = setup(targetId), before = JSON.stringify(args.projection), approved = approveCreatorTargetProjection(args), repeat = approveCreatorTargetProjection(args);
  assert.strictEqual(approved.specification.version, 2); assert.strictEqual(approved.specification.selection.targetId, targetId); assert.strictEqual(approved.specification.review.creatorProjectionApproval.humanReviewComplete, true);
  assert.strictEqual(approved.approvalReceiptHash, repeat.approvalReceiptHash); assert.strictEqual(approved.specificationHash, repeat.specificationHash); assert(Object.isFrozen(approved)); assert(Object.isFrozen(approved.approvalReceipt));
  assert.strictEqual(approved.adapterRequestCreated, false); assert.strictEqual(approved.candidateCreated, false); assert.strictEqual(approved.adoptionAllowed, false); assert.strictEqual(approved.byteEqualityRequired, false);
  assert.strictEqual(approved.sourceSnapshotHash, require('../src/sff_capability_report').hashCanonical(approved.sourceSnapshotSeal)); assert.strictEqual(approved.sourceSnapshotSeal.sources.length, 4);
  assert.strictEqual(approved.capabilityAssessment.exactBuildAllowed, false, 'human approval alone must not imply physical certification'); assert.strictEqual(JSON.stringify(args.projection), before);
  if (targetId === 'sff-v1') { assert.strictEqual(approved.specification.encodingIntent.backendOptions['ikemaker-builtin-sff-v1'].paletteBySpriteEntryId['sprite:a'], 'own'); assert.deepStrictEqual(approved.approvalReceipt.acceptedMandatoryAcknowledgementIds, [V1_IDENTITY_ACK]); }
}

const formatted = setup('sff-v2.1', (projection) => JSON.stringify({ planHash: projection.planHash, ...projection }, null, 4));
assert(approveCreatorTargetProjection(formatted), 'formatting and root key order may differ when canonical meaning is exact');
const base = setup('sff-v2.0');
assert.throws(() => approveCreatorTargetProjection({ ...base, expectedProjectionArtifactByteHash: 'f'.repeat(64) }), /artifact byte hash/);
assert.throws(() => approveCreatorTargetProjection({ ...base, expectedProjectionPlanHash: 'f'.repeat(64) }), /plan hash drift/);
const extraProjectionBytes = Buffer.from(JSON.stringify({ ...base.projection, extraAuthority: true }));
assert.throws(() => approveCreatorTargetProjection({ ...base, projectionArtifactBytes: extraProjectionBytes, expectedProjectionArtifactByteHash: sha(extraProjectionBytes) }), /plan hash drift|does not exactly match/);
const duplicateProjectionBytes = Buffer.from(JSON.stringify(base.projection).replace('"version":1', '"version":1,"version":1'));
assert.throws(() => approveCreatorTargetProjection({ ...base, projectionArtifactBytes: duplicateProjectionBytes, expectedProjectionArtifactByteHash: sha(duplicateProjectionBytes) }), /Duplicate JSON object key/);
assert.throws(() => approveCreatorTargetProjection({ ...base, backendId: 'ikemaker-builtin-sff-v21-png8-prerelease' }), /selection|match|exact implemented built-in/);

for (const mutation of [
  (decision) => { decision.status = 'pending'; }, (decision) => { decision.reviewedBlockerCount = 1; },
  (decision) => { decision.projectionPlanHash = 'f'.repeat(64); }, (decision) => { decision.confirmations.sourceSnapshots = false; },
  (decision) => { decision.confirmations.extra = true; }, (decision) => { decision.reviewedConversionIds = ['z', 'a']; },
  (decision) => { decision.acceptedMandatoryAcknowledgementIds.push('extra'); }, (decision) => { decision.extra = true; }
]) {
  const args = setup('sff-v1'), decision = JSON.parse(JSON.stringify(args.approvalDecision)); mutation(decision); assert.throws(() => approveCreatorTargetProjection({ ...args, approvalDecision: decision }), /approvalDecision/);
}
assert.throws(() => approveCreatorTargetProjection({ ...base, capabilityRequest: { unknown: true } }), /unknown field/);
const accessorDecision = { ...base.approvalDecision };
Object.defineProperty(accessorDecision, 'status', { enumerable: true, get() { return 'approved'; } });
assert.throws(() => approveCreatorTargetProjection({ ...base, approvalDecision: accessorDecision }), /accessor/);
const accessorEvidence = {};
Object.defineProperty(accessorEvidence, 'certification', { enumerable: true, get() { return {}; } });
assert.throws(() => approveCreatorTargetProjection({ ...base, capabilityRequest: { evidence: accessorEvidence } }), /accessor/);

assert.throws(() => createAdapterRequest({ specification: approveCreatorTargetProjection(base).specification, expectedSpecificationHash: approveCreatorTargetProjection(base).specificationHash, sourceSnapshotSeal: approveCreatorTargetProjection(base).sourceSnapshotSeal, expectedSourceSnapshotHash: approveCreatorTargetProjection(base).sourceSnapshotHash }), /blocks adapter/);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-approval-cert-'));
try {
  const evidence = completeCertification(v20Kit.generate(path.join(root, 'kit'))), approved = approveCreatorTargetProjection({ ...base, capabilityRequest: { evidence } });
  const request = createAdapterRequest({ specification: approved.specification, expectedSpecificationHash: approved.specificationHash, sourceSnapshotSeal: approved.sourceSnapshotSeal, expectedSourceSnapshotHash: approved.sourceSnapshotHash, capabilityRequest: { evidence } });
  assert.strictEqual(request.intent, 'candidate-only'); assert.strictEqual(approved.adapterRequestCreated, false, 'approval does not create the separately tested request');
} finally { fs.rmSync(root, { recursive: true, force: true }); }

const selfAuthored = setup('sff-v2.1'), forged = JSON.parse(JSON.stringify(selfAuthored.projection)); forged.review = { creatorProjectionApproval: { humanReviewComplete: true } }; const forgedBytes = Buffer.from(JSON.stringify(forged));
assert.throws(() => approveCreatorTargetProjection({ ...selfAuthored, projectionArtifactBytes: forgedBytes, expectedProjectionArtifactByteHash: sha(forgedBytes) }), /plan hash drift|does not exactly match/);
const moduleText = fs.readFileSync(path.join(__dirname, '..', 'src', 'sff_creator_target_projection_approval.js'), 'utf8'); assert(!/require\(['"](?:fs|child_process|vscode)['"]\)/.test(moduleText)); assert(!/\b(?:writeFile|spawn|execFile|randomUUID|Date\.now)\b/.test(moduleText));
console.log('SFF Creator projection approval binds exact artifacts, a closed human decision, generated receipt, schema-v2 specification and future adapter source seal without creating execution or adoption authority');
