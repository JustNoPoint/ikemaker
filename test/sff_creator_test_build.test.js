'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const original = Module._load;
Module._load = function (request, parent, main) {
  if (request === 'vscode') return { Uri: { file: fsPath => ({ fsPath, toString: () => `file:///${fsPath}` }), parse: value => ({ fsPath: value.replace(/^file:\/\/\//, '') }) }, ViewColumn: { Active: 1 }, workspace: { workspaceFolders: [], getConfiguration: () => ({ get: (_key, fallback) => fallback }) }, window: {} };
  return original.call(this, request, parent, main);
};
const workspace = require('../src/sff_creator_workspace'); Module._load = original;
const { encodeIndexed } = require('../src/sff_palette_remap');
const { createCreatorTestBuild } = require('../src/sff_creator_test_build');
const { createCreatorTargetProjection } = require('../src/sff_creator_target_projection');
const { createSffBuildSpecificationV2, deepFreeze } = require('../src/sff_build_specification_v2');
const { projectV21RequestSpecification } = require('../src/sff_builtin_candidate_evidence');

function png() { const colors = Array.from({ length: 256 }, (_, index) => [index, 255 - index, index, index === 0 ? 0 : 255]); return encodeIndexed(2, 2, Buffer.from([0, 1, 2, 3]), colors); }

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-creator-test-build-'));
  try {
    const sourcePath = path.join(root, 'g1_i0.png'); fs.writeFileSync(sourcePath, png());
    const draft = workspace.defaultDraft(); draft.sources = [workspace.sourceFromFile(sourcePath)]; draft.configuration.group = 1; draft.configuration.startIndex = 0; draft.configuration.paletteMode = 'image';
    const reviewed = await workspace.createReviewedPackage(root, draft, false, path.join(root, 'never-adopt.sff'));
    reviewed.build.specificationArtifactByteHash = crypto.createHash('sha256').update(fs.readFileSync(reviewed.build.specificationPath)).digest('hex');
    const legacyBytes = fs.readFileSync(reviewed.build.specificationPath), projection = createCreatorTargetProjection({ artifactBytes: legacyBytes, expectedArtifactByteHash: reviewed.build.specificationArtifactByteHash, expectedLegacySpecificationHash: reviewed.build.specificationHash, targetId: 'sff-v2.1', backendId: 'ikemaker-builtin-sff-v21-png8-prerelease' });
    const makeDirect = (review = { creatorTestBuild: { humanReviewComplete: false, adoptionAllowed: false, certificationRequired: true, projectionPlanHash: projection.planHash } }, encodingIntent = projection.proposedEncodingIntent, selection = { targetId: 'sff-v2.1', backendId: 'ikemaker-builtin-sff-v21-png8-prerelease' }) => createSffBuildSpecificationV2({ planId: 'direct-test-projection', selection, archive: projection.archive, logical: projection.proposedLogical, encodingIntent, capabilityRequest: { requiredFeatures: [], evidence: {} }, review });
    assert.strictEqual(projectV21RequestSpecification(makeDirect()).target.sffVersion, '2.1');
    assert.throws(() => projectV21RequestSpecification(makeDirect({ creatorTestBuild: { humanReviewComplete: false, adoptionAllowed: false, certificationRequired: true, projectionPlanHash: projection.planHash.toUpperCase() } })), /closed, explicitly non-authoritative/);
    assert.throws(() => projectV21RequestSpecification(makeDirect({ creatorTestBuild: { humanReviewComplete: false, adoptionAllowed: false, certificationRequired: true, projectionPlanHash: projection.planHash }, adoptionApproval: { granted: true } })), /closed, explicitly non-authoritative/);
    assert.throws(() => projectV21RequestSpecification(makeDirect(undefined, { ...projection.proposedEncodingIntent, compression: { default: 'raw8', byEntryId: {} } })), /compression .* must be explicitly png8/);
    assert.throws(() => projectV21RequestSpecification(makeDirect(undefined, projection.proposedEncodingIntent, { targetId: 'sff-v2.0', backendId: 'ikemaker-builtin-sff-v2.0' })), /selection does not match built-in target/);
    const wrongAdapter = JSON.parse(JSON.stringify(makeDirect())); wrongAdapter.selection.adapter.id = 'forged-adapter'; deepFreeze(wrongAdapter); assert.throws(() => projectV21RequestSpecification(wrongAdapter), /adapter identity|hash drift/);
    const v20 = createCreatorTestBuild({ packageRoot: reviewed.packageRoot, build: reviewed.build, targetId: 'sff-v2.0' });
    const v21 = createCreatorTestBuild({ packageRoot: reviewed.packageRoot, build: reviewed.build, targetId: 'sff-v2.1' });
    for (const result of [v20, v21]) { assert.strictEqual(result.status, 'test-build-created'); assert.strictEqual(result.adoptionAllowed, false); assert.strictEqual(result.draftResetAllowed, false); assert(fs.existsSync(result.candidatePath)); assert(fs.existsSync(result.receiptPath)); const receipt = JSON.parse(fs.readFileSync(result.receiptPath)); assert.strictEqual(receipt.purpose, 'TEST BUILD ONLY · No Adoption'); assert.strictEqual(receipt.humanReviewComplete, false); assert.strictEqual(receipt.adoptionAllowed, false); assert.strictEqual(receipt.completed, false); assert.strictEqual(receipt.lifecycleState, null); for (const key of ['approvalAuthorityGranted', 'dispatchAuthorityGranted', 'persistenceAuthorityGranted', 'executionAuthorityGranted', 'recoveryAuthorityGranted', 'vaultAuthorityGranted', 'historyAuthorityGranted', 'completedAuthorityGranted']) assert.strictEqual(receipt[key], false); }
    await assert.rejects(async () => createCreatorTestBuild({ packageRoot: reviewed.packageRoot, build: reviewed.build, targetId: 'sff-v1' }), /only explicit sff-v2\.0 and sff-v2\.1/);
    assert.throws(() => createCreatorTestBuild({ packageRoot: reviewed.packageRoot, build: reviewed.build, targetId: 'sff-v2.0' }), /already exists; no file was overwritten/);
    fs.unlinkSync(v20.candidatePath); fs.unlinkSync(v20.receiptPath);
    const active = path.join(root, 'active.sff'); fs.writeFileSync(active, Buffer.from('reviewed-active')); const activeHash = crypto.createHash('sha256').update(fs.readFileSync(active)).digest('hex').toUpperCase(), driftBuild = { ...reviewed.build, targetSnapshot: { filename: active, exists: true, hash: activeHash } };
    assert.throws(() => createCreatorTestBuild({ packageRoot: reviewed.packageRoot, build: driftBuild, targetId: 'sff-v2.0' }, { beforeFinalTargetCheck: () => fs.writeFileSync(active, Buffer.from('drifted-active')) }), /active target changed/);
    assert.strictEqual(fs.existsSync(v20.candidatePath), false); assert.strictEqual(fs.existsSync(v20.receiptPath), false);
    const candidateBefore = fs.readFileSync(v21.candidatePath);
    if (process.platform !== 'win32' || process.env.CI_ALLOW_WINDOWS_SYMLINKS === '1') {
      const outsideSpec = path.join(root, 'outside-spec'); fs.mkdirSync(outsideSpec); const escapedSpec = path.join(outsideSpec, 'spec.json'); fs.copyFileSync(reviewed.build.specificationPath, escapedSpec); const specLink = path.join(reviewed.build.outputDirectory, 'linked-spec'); fs.symlinkSync(outsideSpec, specLink, 'dir');
      assert.throws(() => createCreatorTestBuild({ packageRoot: reviewed.packageRoot, build: { ...reviewed.build, specificationPath: path.join(specLink, 'spec.json') }, targetId: 'sff-v2.0' }), /symbolic-link|resolves outside/); fs.unlinkSync(specLink);
      const inputDir = path.join(reviewed.build.outputDirectory, 'input'), outsideInput = path.join(root, 'outside-input'); fs.renameSync(inputDir, outsideInput); fs.symlinkSync(outsideInput, inputDir, 'dir');
      assert.throws(() => createCreatorTestBuild({ packageRoot: reviewed.packageRoot, build: reviewed.build, targetId: 'sff-v2.0' }), /symbolic-link|reparse/); fs.unlinkSync(inputDir); fs.renameSync(outsideInput, inputDir);
      fs.unlinkSync(v21.candidatePath); fs.unlinkSync(v21.receiptPath); const outputDir = path.dirname(v21.candidatePath); fs.rmdirSync(outputDir); const outsideOutput = path.join(root, 'outside-output'); fs.mkdirSync(outsideOutput); fs.symlinkSync(outsideOutput, outputDir, 'dir');
      assert.throws(() => createCreatorTestBuild({ packageRoot: reviewed.packageRoot, build: reviewed.build, targetId: 'sff-v2.0' }), /test candidate directory.*direct regular directory|symbolic-link|reparse/); assert.deepStrictEqual(fs.readdirSync(outsideOutput), [], 'a linked output directory receives no candidate or receipt'); fs.unlinkSync(outputDir);
    }
    const sourceInPackage = path.join(reviewed.build.outputDirectory, reviewed.build.specification.sprites[0].source.relativePath); fs.appendFileSync(sourceInPackage, Buffer.from([0]));
    assert.throws(() => createCreatorTestBuild({ packageRoot: reviewed.packageRoot, build: reviewed.build, targetId: 'sff-v2.1' }), /hash drifted/); if (fs.existsSync(v21.candidatePath)) assert(fs.readFileSync(v21.candidatePath).equals(candidateBefore));
    const moduleText = fs.readFileSync(require.resolve('../src/sff_creator_test_build'), 'utf8');
    for (const forbidden of ['approveCreatorTargetProjection', 'createCreatorApprovedAdapterRequest', 'dispatchCreatorApprovedCandidate', 'persistCreatorCandidate', 'createCreatorOperationVault', 'writeCreatorHistoryRecord']) assert(!moduleText.includes(forbidden), `${forbidden} must stay outside candidate-only test builds`);
    console.log('sff_creator_test_build.test.js: all tests passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
