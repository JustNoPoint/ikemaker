'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { canonicalize, hashCanonical } = require('./sff_capability_report');
const { createCreatorTargetProjection } = require('./sff_creator_target_projection');
const { createSffBuildSpecificationV2, deepFreeze } = require('./sff_build_specification_v2');
const { projectV21RequestSpecification } = require('./sff_builtin_candidate_evidence');
const { createSffV20Raw8Bytes } = require('./sff_v20_raw8_writer');
const { createSffV21Bytes: createSffV21Png8Bytes } = require('./sff_v21_writer');
const { assertSffV20Raw8 } = require('./sff_v20_strict_validator');
const { assertSffV21Mixed: assertSffV21Png8 } = require('./sff_v21_mixed_strict_validator');
const { readIndexedPng8 } = require('./sff_png8_source');
const { transactionalWriteSet } = require('./mutation_safety');

const ROUTES = Object.freeze({
  'sff-v2.0': Object.freeze({ backendId: 'ikemaker-builtin-sff-v2.0', label: 'v20-raw8' }),
  'sff-v2.1': Object.freeze({ backendId: 'ikemaker-builtin-sff-v21-png8-prerelease', label: 'v21-png8' })
});
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function within(child, parent) { const relative = path.relative(path.resolve(parent), path.resolve(child)); return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)); }
function artifact(value) { return Buffer.from(`${JSON.stringify(canonicalize(value, 'test-build receipt'))}\n`); }
function fail(message) { throw new Error(`SFF Creator test build: ${message}`); }
function identity(stat) { return `${stat.dev}:${stat.ino}`; }
function sealDirectory(directory, parent = null, label = 'directory') {
  const lexical = path.resolve(directory), stat = fs.lstatSync(lexical); if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`${label} is not a direct regular directory.`);
  const realpath = fs.realpathSync.native(lexical), realStat = fs.statSync(realpath); if (!realStat.isDirectory() || identity(stat) !== identity(realStat)) fail(`${label} directory identity is ambiguous.`);
  if (parent && (!within(lexical, parent.lexical) || !within(realpath, parent.realpath))) fail(`${label} escapes its sealed parent.`);
  return { lexical, realpath, identity: identity(realStat) };
}
function recheckDirectory(seal, label) { const current = sealDirectory(seal.lexical, null, label); if (current.realpath !== seal.realpath || current.identity !== seal.identity) fail(`${label} identity drifted.`); }
function assertNoLinkedPath(filename, root, label) {
  const relative = path.relative(root.lexical, filename); let cursor = root.lexical;
  for (const part of relative.split(path.sep).filter(Boolean)) { cursor = path.join(cursor, part); const stat = fs.lstatSync(cursor); if (stat.isSymbolicLink()) fail(`${label} uses a symbolic-link, junction, or reparse path.`); }
}
function readExact(filename, root, expectedHash, label) {
  const resolved = path.resolve(filename); if (!within(resolved, root.lexical)) fail(`${label} escapes the immutable package.`); assertNoLinkedPath(resolved, root, label);
  const before = fs.lstatSync(resolved); if (!before.isFile() || before.isSymbolicLink()) fail(`${label} is not a regular package file.`);
  const realpath = fs.realpathSync.native(resolved); if (!within(realpath, root.realpath)) fail(`${label} resolves outside the sealed package.`);
  const bytes = fs.readFileSync(resolved), after = fs.lstatSync(resolved); if (identity(before) !== identity(after) || before.size !== after.size || before.mtimeMs !== after.mtimeMs || fs.realpathSync.native(resolved) !== realpath) fail(`${label} changed while it was read.`);
  if (sha(bytes) !== String(expectedHash).toLowerCase()) fail(`${label} hash drifted.`); return { bytes, filename: resolved, realpath, identity: identity(after), byteHash: sha(bytes) };
}
function verifyActiveTarget(snapshot) {
  if (!snapshot) return null;
  if (!snapshot.exists) { const filename = path.resolve(snapshot.filename || ''); if (filename && fs.existsSync(filename)) fail('active target was created after package review.'); return { path: filename, exists: false, byteHash: null }; }
  const filename = path.resolve(snapshot.filename), stat = fs.lstatSync(filename); if (!stat.isFile() || stat.isSymbolicLink()) fail('active target is not the reviewed regular file.');
  const byteHash = sha(fs.readFileSync(filename)); if (byteHash !== String(snapshot.hash || '').toLowerCase()) fail('active target changed after package review.');
  return { path: filename, exists: true, byteHash };
}
function testSpecification(projection) {
  return createSffBuildSpecificationV2({
    planId: `creator-test-${projection.sourcePlanId}-${projection.selection.targetId}`,
    selection: { targetId: projection.selection.targetId, backendId: projection.selection.backendId },
    archive: projection.archive,
    logical: projection.proposedLogical,
    encodingIntent: projection.proposedEncodingIntent,
    capabilityRequest: { requiredFeatures: [], evidence: {} },
    review: { creatorTestBuild: { humanReviewComplete: false, adoptionAllowed: false, certificationRequired: true, projectionPlanHash: projection.planHash } }
  });
}
function sourceVault(specification, rows, packageBuildRoot) {
  const expected = [...specification.logical.sprites, ...specification.logical.palettes];
  if (rows.length !== expected.length) fail('projection source snapshot is incomplete.');
  const byId = new Map(rows.map(row => [row.entryId, row])), bytes = {}, pathMap = new Map();
  for (const entry of expected) {
    const row = byId.get(entry.entryId); if (!row || row.relativePath !== entry.source.relativePath || row.byteHash !== entry.source.byteHash) fail(`source seal drifted for ${entry.entryId}.`);
    const filename = path.resolve(packageBuildRoot.lexical, specification.logical.sourceRoot, row.relativePath.replace(/^input\//, ''));
    const loaded = readExact(filename, packageBuildRoot, row.byteHash, `source ${entry.entryId}`).bytes;
    const prior = pathMap.get(row.relativePath); if (prior && !prior.equals(loaded)) fail(`source path ${row.relativePath} is ambiguous.`);
    pathMap.set(row.relativePath, loaded); bytes[entry.entryId] = loaded;
  }
  return { bytes, pathMap };
}
function prepareCreatorTestBuild(input = {}) {
  const route = ROUTES[input.targetId]; if (!route) fail('only explicit sff-v2.0 and sff-v2.1 test routes exist; no fallback is available.');
  const packageRoot = sealDirectory(input.packageRoot, null, 'package root'), buildRoot = sealDirectory(input.build?.outputDirectory || '', packageRoot, 'package build root');
  if (!input.build?.specificationPath || !input.build?.specificationHash || !/^[0-9a-f]{64}$/i.test(String(input.build?.specificationArtifactByteHash || ''))) fail('a complete immutable Creator package with an independently retained specification artifact hash is required.');
  const activeTarget = verifyActiveTarget(input.build.targetSnapshot);
  const legacyFile = readExact(input.build.specificationPath, packageRoot, input.build.specificationArtifactByteHash, 'reviewed specification'), legacyBytes = legacyFile.bytes;
  const legacy = JSON.parse(legacyBytes.toString('utf8')); if (legacy.specificationHash !== input.build.specificationHash) fail('reviewed specification semantic hash drifted.');
  const projection = createCreatorTargetProjection({ artifactBytes: legacyBytes, expectedArtifactByteHash: sha(legacyBytes), expectedLegacySpecificationHash: input.build.specificationHash, targetId: input.targetId, backendId: route.backendId });
  if (!projection.eligibleForReview || projection.blockers.length) fail(`target projection is blocked: ${projection.blockers.map(row => row.code).join(', ')}`);
  const specification = testSpecification(projection), vault = sourceVault(specification, projection.sourceSnapshotRows, buildRoot), decodedPixelsByEntryId = {};
  for (const sprite of specification.logical.sprites.filter(row => row.pixels.kind === 'indexed8')) { const decoded = readIndexedPng8(vault.bytes[sprite.entryId]); if (decoded.decodedHash !== sprite.source.decodedHash) fail(`decoded source drifted for ${sprite.entryId}.`); decodedPixelsByEntryId[sprite.entryId] = Buffer.from(decoded.indices); }
  let candidate, validatorHash, validatorReport;
  if (input.targetId === 'sff-v2.0') { candidate = createSffV20Raw8Bytes(specification, { decodedPixelsByEntryId }); validatorReport = assertSffV20Raw8(candidate, specification, { compatibilityProfile: 'canonical' }); validatorHash = hashCanonical({ primaryVersion: validatorReport.primaryVersion, compatibleVersion: validatorReport.compatibleVersion, spriteCount: validatorReport.sprites.length, paletteCount: validatorReport.palettes.length }); }
  else { const projected = projectV21RequestSpecification(specification); candidate = createSffV21Png8Bytes(projected, { readSource: relative => vault.pathMap.get(relative) || vault.bytes[projection.sourceSnapshotRows.find(row => row.relativePath === relative)?.entryId] || null }); validatorReport = assertSffV21Png8(candidate, projected, { compatibilityProfile: 'canonical' }); validatorHash = hashCanonical(validatorReport); }
  const revalidate = () => {
    recheckDirectory(packageRoot, 'package root'); recheckDirectory(buildRoot, 'package build root');
    readExact(legacyFile.filename, packageRoot, legacyFile.byteHash, 'reviewed specification final check'); sourceVault(specification, projection.sourceSnapshotRows, buildRoot);
    const finalActiveTarget = verifyActiveTarget(input.build.targetSnapshot); if (JSON.stringify(finalActiveTarget) !== JSON.stringify(activeTarget)) fail('active target changed during the test build.');
    return finalActiveTarget;
  };
  return Object.freeze({ route, packageRoot, buildRoot, legacyBytes, legacyFile, projection, specification, candidate, candidateHash: sha(candidate), validatorHash, validatorReport, activeTarget, sourceSnapshotHash: hashCanonical({ sources: projection.sourceSnapshotRows }), revalidate });
}
function createCreatorTestBuild(input = {}, options = {}) {
  const route = ROUTES[input.targetId]; if (!route) fail('only explicit sff-v2.0 and sff-v2.1 test routes exist; no fallback is available.');
  const packageRoot = sealDirectory(input.packageRoot, null, 'package root'), buildRoot = sealDirectory(input.build?.outputDirectory || '', packageRoot, 'package build root');
  if (!input.build?.specificationPath || !input.build?.specificationHash || !/^[0-9a-f]{64}$/i.test(String(input.build?.specificationArtifactByteHash || ''))) fail('a complete immutable Creator package with an independently retained specification artifact hash is required.');
  const activeTarget = verifyActiveTarget(input.build.targetSnapshot);
  const legacyFile = readExact(input.build.specificationPath, packageRoot, input.build.specificationArtifactByteHash, 'reviewed specification'), legacyBytes = legacyFile.bytes;
  const legacy = JSON.parse(legacyBytes.toString('utf8')); if (legacy.specificationHash !== input.build.specificationHash) fail('reviewed specification semantic hash drifted.');
  const projection = createCreatorTargetProjection({ artifactBytes: legacyBytes, expectedArtifactByteHash: sha(legacyBytes), expectedLegacySpecificationHash: input.build.specificationHash, targetId: input.targetId, backendId: route.backendId });
  if (!projection.eligibleForReview || projection.blockers.length) fail(`target projection is blocked: ${projection.blockers.map(row => row.code).join(', ')}`);
  const specification = testSpecification(projection), vault = sourceVault(specification, projection.sourceSnapshotRows, buildRoot), decodedPixelsByEntryId = {};
  for (const sprite of specification.logical.sprites.filter(row => row.pixels.kind === 'indexed8')) { const decoded = readIndexedPng8(vault.bytes[sprite.entryId]); if (decoded.decodedHash !== sprite.source.decodedHash) fail(`decoded source drifted for ${sprite.entryId}.`); decodedPixelsByEntryId[sprite.entryId] = Buffer.from(decoded.indices); }
  let candidate, validatorHash;
  if (input.targetId === 'sff-v2.0') { candidate = createSffV20Raw8Bytes(specification, { decodedPixelsByEntryId }); const report = assertSffV20Raw8(candidate, specification, { compatibilityProfile: 'canonical' }); validatorHash = hashCanonical({ primaryVersion: report.primaryVersion, compatibleVersion: report.compatibleVersion, spriteCount: report.sprites.length, paletteCount: report.palettes.length }); }
  else { const projected = projectV21RequestSpecification(specification); candidate = createSffV21Png8Bytes(projected, { readSource: relative => vault.pathMap.get(relative) || vault.bytes[projection.sourceSnapshotRows.find(row => row.relativePath === relative)?.entryId] || null }); const report = assertSffV21Png8(candidate, projected, { compatibilityProfile: 'canonical' }); validatorHash = hashCanonical(report); }
  const candidateHash = sha(candidate), directory = path.join(buildRoot.lexical, 'test-candidates');
  if (!fs.existsSync(directory)) fs.mkdirSync(directory);
  const outputRoot = sealDirectory(directory, buildRoot, 'test candidate directory'), stem = `ikemaker-${route.label}-${candidateHash.slice(0, 16)}`, candidatePath = path.join(outputRoot.lexical, `${stem}.sff`), receiptPath = path.join(outputRoot.lexical, `${stem}.receipt.json`);
  if (fs.existsSync(candidatePath) || fs.existsSync(receiptPath)) fail('the deterministic test candidate or receipt already exists; no file was overwritten.');
  if (typeof options.beforeFinalTargetCheck === 'function') options.beforeFinalTargetCheck();
  recheckDirectory(packageRoot, 'package root'); recheckDirectory(buildRoot, 'package build root'); recheckDirectory(outputRoot, 'test candidate directory'); readExact(legacyFile.filename, packageRoot, legacyFile.byteHash, 'reviewed specification final check'); sourceVault(specification, projection.sourceSnapshotRows, buildRoot);
  const finalActiveTarget = verifyActiveTarget(input.build.targetSnapshot); if (JSON.stringify(finalActiveTarget) !== JSON.stringify(activeTarget)) fail('active target changed during the test build.');
  const sourceSnapshotHash = hashCanonical({ sources: projection.sourceSnapshotRows });
  const receiptCore = { schema: 'ikemaker.sff-creator-test-build-receipt', version: 1, status: 'validated-test-candidate', purpose: 'TEST BUILD ONLY · No Adoption', targetId: input.targetId, backendId: route.backendId, adapterId: projection.selection.adapter.id, legacySpecificationHash: input.build.specificationHash, legacySpecificationArtifactByteHash: sha(legacyBytes), projectionPlanHash: projection.planHash, testSpecificationHash: specification.specificationHash, logicalHash: specification.logicalHash, sourceSnapshotHash, activeTarget, candidateByteHash: candidateHash, candidateByteLength: candidate.length, validatorReportHash: validatorHash, humanReviewComplete: false, adoptionAllowed: false, certificationRequired: true, approvalAuthorityGranted: false, dispatchAuthorityGranted: false, persistenceAuthorityGranted: false, executionAuthorityGranted: false, recoveryAuthorityGranted: false, vaultAuthorityGranted: false, historyAuthorityGranted: false, completedAuthorityGranted: false, completed: false, lifecycleState: null };
  const receipt = { ...receiptCore, receiptHash: hashCanonical(receiptCore) }, receiptBytes = artifact(receipt);
  transactionalWriteSet(fs, [[candidatePath, candidate], [receiptPath, receiptBytes]], { label: 'sff-creator-test-candidate', allowExisting: false, backup: false, journal: false });
  const reopened = readExact(candidatePath, outputRoot, candidateHash, 'persisted test candidate').bytes; if (!reopened.equals(candidate)) fail('persisted candidate bytes drifted.');
  if (input.targetId === 'sff-v2.0') assertSffV20Raw8(reopened, specification, { compatibilityProfile: 'canonical' }); else assertSffV21Png8(reopened, projectV21RequestSpecification(specification), { compatibilityProfile: 'canonical' });
  const reopenedReceipt = readExact(receiptPath, outputRoot, sha(receiptBytes), 'persisted test receipt').bytes; if (JSON.parse(reopenedReceipt).receiptHash !== receipt.receiptHash) fail('persisted receipt drifted.');
  return Object.freeze({ status: 'test-build-created', purpose: receipt.purpose, targetId: input.targetId, candidatePath, receiptPath, candidateByteHash: candidateHash, receiptHash: receipt.receiptHash, adoptionAllowed: false, draftResetAllowed: false });
}

module.exports = { ROUTES, createCreatorTestBuild, prepareCreatorTestBuild };
