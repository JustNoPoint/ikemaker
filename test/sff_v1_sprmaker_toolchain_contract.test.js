'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { sha } = require('./helpers/sff_v1_sprmaker_fixture');
const { SPRMAKER_SHA256, MTOOLS_SHA256, inspectSprMakerDistribution, inspectNativeProbe, inspectDosBoxXRunner, createSprMakerToolchainContract, assertSprMakerToolchainContract } = require('../src/sff_v1_sprmaker_toolchain_contract');

const legacyRoot = process.env.IKEMAKER_LEGACY_MTOOLS || 'D:/Dropbox/Ikemen/Development/EngineSupport/tools/archive/old_tools', executable = path.join(legacyRoot, 'sprmaker.exe'), notice = path.join(legacyRoot, 'mtools.txt');
assert.throws(() => inspectSprMakerDistribution({ sprmakerBytes: Buffer.from('wrong'), mtoolsBytes: Buffer.from('wrong') }), /approved unmodified/);
const native = inspectNativeProbe({ receipt: { schema: 'ikemaker.sff-v1-sprmaker-native-probe', version: 1, toolByteHash: SPRMAKER_SHA256, probeProgramHash: 'a'.repeat(64), probeProgramVersion: '1', status: 'passed', testedAt: '2026-10-09T12:00:00.000Z', osVersion: 'Windows', platform: 'win32', architecture: 'x64' } }); assert.strictEqual(native.executionReady, false); assert(native.issues.some(issue => /not approved/.test(issue)));
const artifacts = { binary: Buffer.from('binary'), package: Buffer.from('package'), source: Buffer.from('source'), config: Buffer.from('config'), notice: Buffer.from('notice'), sbom: Buffer.from('sbom') }, manifest = { schema: 'ikemaker.sff-v1-dosbox-x-runner-manifest', version: 1, binaryHash: sha(artifacts.binary), packageHash: sha(artifacts.package), sourceHash: sha(artifacts.source), configHash: sha(artifacts.config), noticeHash: sha(artifacts.notice), sbomHash: sha(artifacts.sbom) }, dosbox = inspectDosBoxXRunner({ manifestBytes: Buffer.from(JSON.stringify(manifest)), artifacts }); assert.strictEqual(dosbox.executionReady, false); assert(dosbox.issues.some(issue => /not approved/.test(issue)));
if (fs.existsSync(executable) && fs.existsSync(notice)) {
  const sprmakerBytes = fs.readFileSync(executable), mtoolsBytes = fs.readFileSync(notice); assert.strictEqual(sha(sprmakerBytes), SPRMAKER_SHA256); assert.strictEqual(sha(mtoolsBytes), MTOOLS_SHA256);
  const distribution = inspectSprMakerDistribution({ sprmakerBytes, mtoolsBytes }); assert.strictEqual(distribution.contractReady, true); assert.strictEqual(distribution.executionReady, false);
  const contract = createSprMakerToolchainContract({ sprmakerBytes, mtoolsBytes, runnerKind: 'native-legacy', nativeProbe: { schema: 'ikemaker.sff-v1-sprmaker-native-probe', version: 1, toolByteHash: SPRMAKER_SHA256, probeProgramHash: 'a'.repeat(64), probeProgramVersion: '1', status: 'failed', testedAt: '2026-10-09T12:00:00.000Z', osVersion: 'Windows 11 x64', platform: 'win32', architecture: 'x64' } }); assertSprMakerToolchainContract(contract); assert.strictEqual(contract.executionReady, false);
}
console.log('SprMaker toolchain evidence pins the unmodified tool/notice and cannot self-approve native or DOSBox-X execution');
