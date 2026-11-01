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
const { prepareCreatorTestBuild } = require('../src/sff_creator_test_build');
const { createCreatorDualV21TestBuild } = require('../src/sff_creator_dual_test_build');
const { assertSffV21Png8, SFF_V21_PNG8_VALIDATOR_PROFILE } = require('../src/sff_v21_strict_validator');
const { SffCandidateComparisonError } = require('../src/sff_backend_comparison');

function png() { const colors = Array.from({ length: 256 }, (_, index) => [index, 255 - index, index, index === 0 ? 0 : 255]); return encodeIndexed(2, 2, Buffer.from([0, 1, 2, 3]), colors); }
function hash(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-creator-dual-test-'));
  try {
    const sourcePath = path.join(root, 'g1_i0.png'); fs.writeFileSync(sourcePath, png());
    const draft = workspace.defaultDraft(); draft.sources = [workspace.sourceFromFile(sourcePath)]; draft.configuration.group = 1; draft.configuration.startIndex = 0; draft.configuration.paletteMode = 'image';
    const reviewed = await workspace.createReviewedPackage(root, draft, false, path.join(root, 'never-adopt.sff'));
    reviewed.build.specificationArtifactByteHash = hash(fs.readFileSync(reviewed.build.specificationPath));
    const fakeTool = path.join(reviewed.build.outputDirectory, 'fake-sprmake2.exe'); fs.writeFileSync(fakeTool, Buffer.from('test-only-tool'));
    const build = { ...reviewed.build, sprmake: fakeTool, sprMake2Available: true };
    const prepared = prepareCreatorTestBuild({ packageRoot: reviewed.packageRoot, build, targetId: 'sff-v2.1' });
    let runCount = 0;
    const options = {
      prepareCreatorTestBuild: () => prepared,
      sprMake2Compatibility: () => ({ available: true, reasons: [] }),
      stagePrivateSprMakeRun: (generated, run) => { const definitionPath = path.join(run.directory, 'sprmake2.def'); fs.copyFileSync(generated.definitionPath, definitionPath); return { ...generated, outputDirectory: run.directory, definitionPath, candidateOutputSff: run.candidate }; },
      runSprMake: async staged => { runCount += 1; fs.writeFileSync(staged.candidateOutputSff, prepared.candidate); return 'mock SprMake2 output'; },
      verifyCandidateArchive: filename => { const candidateByteHash = hash(fs.readFileSync(filename)); return { candidateByteHash, specificationHash: build.specificationHash, strict: { status: 'passed', profile: SFF_V21_PNG8_VALIDATOR_PROFILE, compatibilityProfile: 'sprmake2-v2.1', candidateByteHash, specificationHash: build.specificationHash } }; }
    };
    const candidateDirectory = path.join(build.outputDirectory, 'test-candidates');
    let failedMarkerDirectory = '';
    await assert.rejects(() => createCreatorDualV21TestBuild({ packageRoot: reviewed.packageRoot, build, targetId: 'sff-v2.1' }, { ...options, writeMarkerSet: (_fs, writes, writeOptions) => { assert.strictEqual(writes.length, 1); assert.strictEqual(path.basename(writes[0][0]), '.ikemaker-owned-run'); assert.strictEqual(Buffer.isBuffer(writes[0][1]), true); assert.strictEqual(writeOptions.allowExisting, false); assert.strictEqual(writeOptions.backup, false); assert.strictEqual(writeOptions.journal, false); failedMarkerDirectory = path.dirname(writes[0][0]); throw new Error('mock marker boundary failure'); } }), /mock marker boundary failure/);
    assert(failedMarkerDirectory && !fs.existsSync(failedMarkerDirectory), 'a synchronous marker-boundary failure must remove its unchanged owned run directory');
    let replacementMarkerDirectory = '', movedMarkerDirectory = '';
    await assert.rejects(() => createCreatorDualV21TestBuild({ packageRoot: reviewed.packageRoot, build, targetId: 'sff-v2.1' }, { ...options, writeMarkerSet: (_fs, writes) => { replacementMarkerDirectory = path.dirname(writes[0][0]); movedMarkerDirectory = `${replacementMarkerDirectory}-moved`; fs.renameSync(replacementMarkerDirectory, movedMarkerDirectory); fs.mkdirSync(replacementMarkerDirectory); fs.writeFileSync(path.join(replacementMarkerDirectory, 'foreign.txt'), 'do not delete'); throw new Error('mock marker replacement failure'); } }), /mock marker replacement failure/);
    assert.strictEqual(fs.readFileSync(path.join(replacementMarkerDirectory, 'foreign.txt'), 'utf8'), 'do not delete', 'marker-failure cleanup must not delete a replacement directory');
    fs.rmSync(replacementMarkerDirectory, { recursive: true, force: true }); fs.rmSync(movedMarkerDirectory, { recursive: true, force: true });
    await assert.rejects(() => createCreatorDualV21TestBuild({ packageRoot: reviewed.packageRoot, build, targetId: 'sff-v2.1' }, { ...options, limits: { toolBytes: 1 } }), /SprMake2 executable exceeds/);
    await assert.rejects(() => createCreatorDualV21TestBuild({ packageRoot: reviewed.packageRoot, build, targetId: 'sff-v2.1' }, { ...options, limits: { definitionBytes: 1 } }), /SprMake2 definition exceeds/);
    await assert.rejects(() => createCreatorDualV21TestBuild({ packageRoot: reviewed.packageRoot, build, targetId: 'sff-v2.1' }, { ...options, limits: { candidateBytes: 1 } }), /IKEMaker candidate exceeds/);
    await assert.rejects(() => createCreatorDualV21TestBuild({ packageRoot: reviewed.packageRoot, build, targetId: 'sff-v2.1' }, { ...options, limits: { candidateBytes: prepared.candidate.length }, runSprMake: async staged => { fs.writeFileSync(staged.candidateOutputSff, Buffer.concat([prepared.candidate, Buffer.from([0])])); return ''; } }), /private SprMake2 candidate exceeds/);
    await assert.rejects(() => createCreatorDualV21TestBuild({ packageRoot: reviewed.packageRoot, build, targetId: 'sff-v2.1' }, { ...options, limits: { processLogBytes: 4 }, runSprMake: async staged => { fs.writeFileSync(staged.candidateOutputSff, prepared.candidate); return 'excessive output'; } }), /process log limit/);
    for (const mutate of [
      result => { result.strict.status = 'not-applicable'; },
      result => { result.strict.compatibilityProfile = 'canonical'; },
      result => { result.strict.candidateByteHash = '0'.repeat(64); },
      result => { delete result.strict; }
    ]) await assert.rejects(() => createCreatorDualV21TestBuild({ packageRoot: reviewed.packageRoot, build, targetId: 'sff-v2.1' }, { ...options, verifyCandidateArchive: filename => { const result = options.verifyCandidateArchive(filename); mutate(result); return result; } }), /strict verification|wrong validator|exact candidate hash/);
    const falseSuccess = input => ({ schema: 'ikemaker.sff-backend-comparison', version: 1, independentlyValidated: true, status: 'equivalent', semanticEquivalent: false, byteEquivalent: true, adoption: { attempted: false, sprMake2CandidateAdopted: false, builtInCandidateAdopted: false, supportedByThisWorkflow: false }, candidates: { builtIn: { backendId: 'ikemaker', byteHash: hash(input.builtInCandidateBytes), byteLength: input.builtInCandidateBytes.length, adoptionAllowed: false }, sprMake2: { backendId: 'sprmake2', byteHash: hash(input.sprMake2CandidateBytes), byteLength: input.sprMake2CandidateBytes.length, adoptionAllowed: false } } });
    await assert.rejects(() => createCreatorDualV21TestBuild({ packageRoot: reviewed.packageRoot, build, targetId: 'sff-v2.1' }, { ...options, compareSffBackends: falseSuccess }), /status and semantic result are inconsistent/);
    const malformedThrown = () => { throw new SffCandidateComparisonError('malformed', { status: 'equivalent', semanticEquivalent: false, candidates: {} }); };
    await assert.rejects(() => createCreatorDualV21TestBuild({ packageRoot: reviewed.packageRoot, build, targetId: 'sff-v2.1' }, { ...options, compareSffBackends: malformedThrown }), /malformed or non-independent evidence/);
    const escapedDefinition = path.join(root, 'outside-definition.def'); fs.writeFileSync(escapedDefinition, fs.readFileSync(build.definitionPath));
    await assert.rejects(() => createCreatorDualV21TestBuild({ packageRoot: reviewed.packageRoot, build: { ...build, definitionPath: escapedDefinition }, targetId: 'sff-v2.1' }, options), /definition escapes its sealed root/);
    await assert.rejects(() => createCreatorDualV21TestBuild({ packageRoot: reviewed.packageRoot, build, targetId: 'sff-v2.1' }, { ...options, afterPublish: files => fs.appendFileSync(files.reportPath, 'tamper') }), /comparison report.*hash drifted/); fs.rmSync(candidateDirectory, { recursive: true, force: true });
    await assert.rejects(() => createCreatorDualV21TestBuild({ packageRoot: reviewed.packageRoot, build, targetId: 'sff-v2.1' }, { ...options, afterPublish: files => fs.appendFileSync(files.receiptPath, 'tamper') }), /pair receipt.*hash drifted/); fs.rmSync(candidateDirectory, { recursive: true, force: true });
    const beforeDraft = JSON.stringify(draft), runsBeforeSuccess = runCount, result = await createCreatorDualV21TestBuild({ packageRoot: reviewed.packageRoot, build, targetId: 'sff-v2.1' }, options);
    assert.strictEqual(result.status, 'test-pair-created'); assert.strictEqual(result.semanticEquivalent, true); assert.strictEqual(result.adoptionAllowed, false); assert.strictEqual(result.draftResetAllowed, false); assert.strictEqual(runCount, runsBeforeSuccess + 1); assert.strictEqual(JSON.stringify(draft), beforeDraft);
    assert.match(path.basename(result.builtInCandidatePath), /^ikemaker-v21-png8-/); assert.match(path.basename(result.sprMake2CandidatePath), /^sprmake2-v21-png8-/); assert.notStrictEqual(path.basename(result.builtInCandidatePath), path.basename(result.sprMake2CandidatePath));
    assert.strictEqual(result.builtInCandidateHash, hash(fs.readFileSync(result.builtInCandidatePath))); assert.strictEqual(result.sprMake2CandidateHash, hash(fs.readFileSync(result.sprMake2CandidatePath))); assert.strictEqual(result.comparisonReportHash, hash(fs.readFileSync(result.comparisonReportPath)), 'publisher hashes remain bound to the exact validated pair and report');
    for (const filename of [result.builtInCandidatePath, result.sprMake2CandidatePath, result.comparisonReportPath, result.receiptPath]) assert(fs.existsSync(filename));
    assertSffV21Png8(fs.readFileSync(result.builtInCandidatePath), reviewed.build.specification, { compatibilityProfile: 'canonical' });
    assertSffV21Png8(fs.readFileSync(result.sprMake2CandidatePath), reviewed.build.specification, { compatibilityProfile: 'sprmake2-v2.1' });
    const receipt = JSON.parse(fs.readFileSync(result.receiptPath)); assert.strictEqual(receipt.packageSpecificationHash, build.specificationHash); assert.strictEqual(receipt.comparison.semanticEquivalent, true);
    for (const key of ['approvalAuthorityGranted', 'dispatchAuthorityGranted', 'persistenceAuthorityGranted', 'executionAuthorityGranted', 'recoveryAuthorityGranted', 'vaultAuthorityGranted', 'historyAuthorityGranted', 'completedAuthorityGranted']) assert.strictEqual(receipt[key], false);
    assert.strictEqual(receipt.completed, false); assert.strictEqual(receipt.lifecycleState, null);
    const runsBeforeV20 = runCount; await assert.rejects(() => createCreatorDualV21TestBuild({ packageRoot: reviewed.packageRoot, build, targetId: 'sff-v2.0' }, options), /v2\.1-only/); assert.strictEqual(runCount, runsBeforeV20, 'v2.0 must never dispatch SprMake2');
    await assert.rejects(() => createCreatorDualV21TestBuild({ packageRoot: reviewed.packageRoot, build: { ...build, sprMake2Available: false }, targetId: 'sff-v2.1' }, options), /unavailable/i);
    await assert.rejects(() => createCreatorDualV21TestBuild({ packageRoot: reviewed.packageRoot, build, targetId: 'sff-v2.1' }, { ...options, runSprMake: async () => { throw new Error('mock failure'); } }), /mock failure/);
    await assert.rejects(() => createCreatorDualV21TestBuild({ packageRoot: reviewed.packageRoot, build, targetId: 'sff-v2.1' }, options), /already exists/);
    await assert.rejects(() => createCreatorDualV21TestBuild({ packageRoot: reviewed.packageRoot, build, targetId: 'sff-v2.1' }, { ...options, beforePublish: () => fs.writeFileSync(build.targetSnapshot.filename, Buffer.from('target drift')) }), /active target was created/); fs.unlinkSync(build.targetSnapshot.filename);
    const sourceInPackage = path.join(build.outputDirectory, build.specification.sprites[0].source.relativePath), originalSource = fs.readFileSync(sourceInPackage);
    await assert.rejects(() => createCreatorDualV21TestBuild({ packageRoot: reviewed.packageRoot, build, targetId: 'sff-v2.1' }, { ...options, beforePublish: () => fs.appendFileSync(sourceInPackage, Buffer.from([0])) }), /hash drifted/); fs.writeFileSync(sourceInPackage, originalSource);
    if (process.platform !== 'win32' || process.env.CI_ALLOW_WINDOWS_SYMLINKS === '1') {
      const outputDirectory = path.dirname(result.builtInCandidatePath), outside = path.join(root, 'outside-pair-output'); fs.rmSync(outputDirectory, { recursive: true, force: true }); fs.mkdirSync(outside); fs.symlinkSync(outside, outputDirectory, 'dir');
      await assert.rejects(() => createCreatorDualV21TestBuild({ packageRoot: reviewed.packageRoot, build, targetId: 'sff-v2.1' }, options), /test candidate directory.*direct regular directory|symbolic-link|reparse/); assert.deepStrictEqual(fs.readdirSync(outside), []); fs.unlinkSync(outputDirectory);
    }
    fs.rmSync(candidateDirectory, { recursive: true, force: true });
    const mismatchCompare = input => { const builtHash = hash(input.builtInCandidateBytes), sprHash = hash(input.sprMake2CandidateBytes); throw new SffCandidateComparisonError('mock semantic mismatch', { schema: 'ikemaker.sff-backend-comparison', version: 1, independentlyValidated: true, status: 'rejected-semantic-mismatch', semanticEquivalent: false, byteEquivalent: true, adoption: { attempted: false, sprMake2CandidateAdopted: false, builtInCandidateAdopted: false, supportedByThisWorkflow: false }, candidates: { builtIn: { backendId: 'ikemaker', byteHash: builtHash, byteLength: input.builtInCandidateBytes.length, adoptionAllowed: false }, sprMake2: { backendId: 'sprmake2', byteHash: sprHash, byteLength: input.sprMake2CandidateBytes.length, adoptionAllowed: false } } }); };
    const rejected = await createCreatorDualV21TestBuild({ packageRoot: reviewed.packageRoot, build, targetId: 'sff-v2.1' }, { ...options, compareSffBackends: mismatchCompare });
    assert.strictEqual(rejected.status, 'rejected-not-equivalent'); assert.strictEqual(rejected.receiptPath, null); assert.match(path.basename(rejected.builtInCandidatePath), /^REJECTED-NOT-EQUIVALENT-/); assert(fs.existsSync(rejected.comparisonReportPath));
    assert.strictEqual(fs.readdirSync(candidateDirectory).some(name => name.endsWith('.receipt.json')), false, 'a rejected pair has no success receipt');
    if (process.platform !== 'win32' || process.env.CI_ALLOW_WINDOWS_SYMLINKS === '1') {
      const outsideDefDir = path.join(root, 'outside-definition-parent'); fs.mkdirSync(outsideDefDir); fs.copyFileSync(build.definitionPath, path.join(outsideDefDir, 'sprmake2.def')); const linkedDefDir = path.join(build.outputDirectory, 'linked-definition-parent'); fs.symlinkSync(outsideDefDir, linkedDefDir, 'dir');
      await assert.rejects(() => createCreatorDualV21TestBuild({ packageRoot: reviewed.packageRoot, build: { ...build, definitionPath: path.join(linkedDefDir, 'sprmake2.def') }, targetId: 'sff-v2.1' }, options), /definition resolves outside/); fs.unlinkSync(linkedDefDir);
    }
    fs.rmSync(candidateDirectory, { recursive: true, force: true }); let replacementRun = '', movedRun = '';
    const replacementResult = await createCreatorDualV21TestBuild({ packageRoot: reviewed.packageRoot, build, targetId: 'sff-v2.1' }, { ...options, beforeCleanup: run => { replacementRun = run.directory; movedRun = `${run.directory}-moved`; fs.renameSync(run.directory, movedRun); fs.mkdirSync(run.directory); fs.writeFileSync(path.join(run.directory, 'foreign.txt'), 'do not delete'); } });
    assert.strictEqual(replacementResult.status, 'test-pair-created'); assert.strictEqual(fs.readFileSync(path.join(replacementRun, 'foreign.txt'), 'utf8'), 'do not delete', 'cleanup must not delete a replaced private-run path'); fs.rmSync(replacementRun, { recursive: true, force: true }); fs.rmSync(movedRun, { recursive: true, force: true });
    const moduleText = fs.readFileSync(require.resolve('../src/sff_creator_dual_test_build'), 'utf8');
    for (const forbidden of ['executeComparedSprMake2Build', 'approveCreatorTargetProjection', 'createCreatorApprovedAdapterRequest', 'dispatchCreatorApprovedCandidate', 'writeSffExecutionReceipt']) assert(!moduleText.includes(forbidden), `${forbidden} must stay outside the candidate-only pair owner`);
    console.log('sff_creator_dual_test_build.test.js: all tests passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
