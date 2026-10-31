'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { makeFixture } = require('./helpers/sff_v1_sprmaker_fixture');
const { createSprMakerRecipe } = require('../src/sff_v1_sprmaker_recipe');
const { createSprMakerToolchainContract, SPRMAKER_SHA256 } = require('../src/sff_v1_sprmaker_toolchain_contract');
const { createSprMakerStagingPlan } = require('../src/sff_v1_sprmaker_staging_contract');
const { createSprMakerExecutionRequest, assertSprMakerExecutionRequest, validateSprMakerExecutionResult } = require('../src/sff_v1_sprmaker_execution_contract');
const { hashCanonical } = require('../src/sff_capability_report');

const root = process.env.IKEMAKER_LEGACY_MTOOLS || 'D:/Dropbox/Ikemen/Development/EngineSupport/tools/archive/old_tools', executable = path.join(root, 'sprmaker.exe'), notice = path.join(root, 'mtools.txt');
if (fs.existsSync(executable) && fs.existsSync(notice)) {
  const sprmakerBytes = fs.readFileSync(executable), mtoolsBytes = fs.readFileSync(notice), fixture = makeFixture({ single: true }), recipe = createSprMakerRecipe(fixture.specification);
  const toolchain = createSprMakerToolchainContract({ sprmakerBytes, mtoolsBytes, runnerKind: 'native-legacy', nativeProbe: { schema: 'ikemaker.sff-v1-sprmaker-native-probe', version: 1, toolByteHash: SPRMAKER_SHA256, probeProgramHash: 'a'.repeat(64), probeProgramVersion: '1', status: 'failed', testedAt: '2026-10-09T12:00:00.000Z', osVersion: 'Windows 11 x64', platform: 'win32', architecture: 'x64' } });
  const stage = createSprMakerStagingPlan({ specification: fixture.specification, recipe, sprmakerBytes, mtoolsBytes, runNonce: '00112233445566778899aabbccddeeff', derivedPcxByEntryId: fixture.derivedPcxByEntryId }), request = createSprMakerExecutionRequest({ toolchain, stage });
  assertSprMakerExecutionRequest(request); assert.strictEqual(request.executionAllowed, false); assert.strictEqual(request.adoptionAllowed, false); assert.deepStrictEqual(request.arguments, []); assert.strictEqual(request.processPolicy.shell, false);
  const forgedBase = { ...request, executionImplemented: true, executionAllowed: true }; delete forgedBase.requestHash;
  assert.throws(() => assertSprMakerExecutionRequest({ ...forgedBase, requestHash: hashCanonical(forgedBase) }), /unavailable execution authority/);
  const failed = validateSprMakerExecutionResult(request, { status: 'failed', requestHash: request.requestHash, toolchainHash: request.toolchainHash, stagePlanHash: request.stagePlanHash, stdoutBytes: 0, stderrBytes: 7 }); assert.strictEqual(failed.candidateAccepted, false);
  assert.throws(() => validateSprMakerExecutionResult(request, { status: 'passed', requestHash: request.requestHash, toolchainHash: request.toolchainHash, stagePlanHash: request.stagePlanHash, stdoutBytes: 0, stderrBytes: 0 }), /not approved/);
  assert.throws(() => validateSprMakerExecutionResult(request, { status: 'failed', requestHash: 'a'.repeat(64), toolchainHash: request.toolchainHash, stagePlanHash: request.stagePlanHash, stdoutBytes: 0, stderrBytes: 0 }), /not bound/);
}
for (const filename of ['sff_v1_sprmaker_toolchain_contract.js', 'sff_v1_sprmaker_recipe.js', 'sff_v1_sprmaker_staging_contract.js', 'sff_v1_sprmaker_execution_contract.js']) { const source = fs.readFileSync(path.join(__dirname, '..', 'src', filename), 'utf8'); assert(!/require\(['"](?:child_process|fs)['"]\)/.test(source), `${filename} must remain pure and process-free`); }
console.log('SprMaker execution contract is process-free, hash-bound, bounded, candidate-only, and cannot self-authorize success');
