'use strict';

const crypto = require('crypto');
const { hashCanonical } = require('./sff_capability_report');

const SPRMAKER_SHA256 = 'e1852fce2043d760bad3173012f89eae24d2f101e069966c66974ab5bbb1d6af';
const MTOOLS_SHA256 = 'e8e3e84fb3a331a2576398e95a27e634e51a2c803f74b2a9eb321f75c7c898e3';
const APPROVED_NATIVE_PROBE_PROGRAM_HASHES = Object.freeze([]);
const APPROVED_DOSBOX_X_MANIFEST_HASHES = Object.freeze([]);
const SPRMAKER_EXECUTION_IMPLEMENTED = false;
const SHA = /^[0-9a-f]{64}$/;

function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(freeze); return value; }
function bytes(value, label) { if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) throw new Error(`${label} exact bytes are required.`); return Buffer.from(value); }
function text(value, label) { const result = String(value || '').trim(); if (!result || result.length > 500) throw new Error(`${label} is required and must be bounded.`); return result; }
function hash(value, label) { const result = String(value || '').toLowerCase(); if (!SHA.test(result)) throw new Error(`${label} must be a SHA-256 hash.`); return result; }

function inspectSprMakerDistribution(input = {}) {
  const executable = bytes(input.sprmakerBytes, 'SprMaker executable'), notice = bytes(input.mtoolsBytes, 'mtools.txt');
  const executableHash = sha(executable), noticeHash = sha(notice);
  if (executableHash !== SPRMAKER_SHA256) throw new Error('SprMaker executable is not the approved unmodified Elecbyte binary.');
  if (noticeHash !== MTOOLS_SHA256) throw new Error('mtools.txt is not the approved unmodified redistribution notice.');
  const result = { schema: 'ikemaker.sff-v1-sprmaker-distribution', version: 1, executable: { alias: 'SPRMAKER.EXE', byteHash: executableHash, byteLength: executable.length }, notice: { alias: 'MTOOLS.TXT', byteHash: noticeHash, byteLength: notice.length }, redistribution: { unmodifiedExecutableRequired: true, noticeRequired: true }, contractReady: true, executionReady: false, reason: 'No approved native probe or DOSBox-X runner manifest is pinned.' };
  result.evidenceHash = hashCanonical(result); return freeze(result);
}
function inspectNativeProbe(input = {}) {
  const receipt = input.receipt || {}, host = input.host || {}, issues = [];
  if (receipt.schema !== 'ikemaker.sff-v1-sprmaker-native-probe' || Number(receipt.version) !== 1) issues.push('unsupported native probe receipt');
  if (String(receipt.toolByteHash || '').toLowerCase() !== SPRMAKER_SHA256) issues.push('native probe tool hash mismatch');
  const probeHash = String(receipt.probeProgramHash || '').toLowerCase(); if (!SHA.test(probeHash) || !APPROVED_NATIVE_PROBE_PROGRAM_HASHES.includes(probeHash)) issues.push('native probe program is not approved');
  if (!['passed', 'failed'].includes(receipt.status)) issues.push('native probe status is invalid');
  for (const field of ['osVersion', 'platform', 'architecture', 'probeProgramVersion']) try { text(receipt[field], `native probe ${field}`); } catch (error) { issues.push(error.message); }
  for (const field of ['osVersion', 'platform', 'architecture', 'probeProgramVersion', 'probeProgramHash']) if (String(receipt[field] || '') !== String(host[field] || '')) issues.push(`native probe ${field} drifted from the current host/probe`);
  if (!receipt.testedAt || Number.isNaN(Date.parse(receipt.testedAt)) || new Date(receipt.testedAt).toISOString() !== receipt.testedAt) issues.push('native probe timestamp is invalid');
  const receiptHash = hashCanonical(receipt);
  return freeze({ kind: 'native-legacy', receiptHash, valid: issues.length === 0, executionReady: issues.length === 0 && receipt.status === 'passed', issues });
}
function inspectDosBoxXRunner(input = {}) {
  const manifestBytes = bytes(input.manifestBytes, 'DOSBox-X runner manifest'), manifestHash = sha(manifestBytes), issues = [];
  let manifest; try { manifest = JSON.parse(manifestBytes.toString('utf8')); } catch (error) { throw new Error(`DOSBox-X runner manifest is invalid JSON: ${error.message}`); }
  if (!APPROVED_DOSBOX_X_MANIFEST_HASHES.includes(manifestHash)) issues.push('DOSBox-X runner manifest hash is not approved');
  if (manifest?.schema !== 'ikemaker.sff-v1-dosbox-x-runner-manifest' || Number(manifest?.version) !== 1) issues.push('unsupported DOSBox-X runner manifest');
  const required = ['binaryHash', 'packageHash', 'sourceHash', 'configHash', 'noticeHash', 'sbomHash'];
  for (const field of required) try { hash(manifest?.[field], `DOSBox-X ${field}`); } catch (error) { issues.push(error.message); }
  const artifacts = input.artifacts;
  if (!artifacts || typeof artifacts !== 'object' || Array.isArray(artifacts)) issues.push('exact DOSBox-X artifacts are required');
  else for (const [field, role] of [['binaryHash', 'binary'], ['packageHash', 'package'], ['sourceHash', 'source'], ['configHash', 'config'], ['noticeHash', 'notice'], ['sbomHash', 'sbom']]) {
    const artifact = artifacts[role];
    if (!Buffer.isBuffer(artifact) && !(artifact instanceof Uint8Array)) issues.push(`DOSBox-X ${role} artifact is missing`);
    else if (sha(Buffer.from(artifact)) !== String(manifest?.[field] || '').toLowerCase()) issues.push(`DOSBox-X ${role} artifact hash mismatch`);
  }
  return freeze({ kind: 'dosbox-x-portable', manifestHash, valid: issues.length === 0, executionReady: issues.length === 0, issues });
}
function createSprMakerToolchainContract(input = {}) {
  const distribution = inspectSprMakerDistribution(input), requestedRunner = String(input.runnerKind || '').trim();
  if (!['native-legacy', 'dosbox-x-portable'].includes(requestedRunner)) throw new Error('runnerKind must explicitly be native-legacy or dosbox-x-portable.');
  const runner = requestedRunner === 'native-legacy' ? inspectNativeProbe({ receipt: input.nativeProbe, host: input.nativeHost }) : inspectDosBoxXRunner({ manifestBytes: input.runnerManifestBytes, artifacts: input.runnerArtifacts });
  const result = { schema: 'ikemaker.sff-v1-sprmaker-toolchain-contract', version: 1, distribution, runner, requestedRunner, contractReady: distribution.contractReady, executionImplemented: SPRMAKER_EXECUTION_IMPLEMENTED, executionReady: SPRMAKER_EXECUTION_IMPLEMENTED && distribution.contractReady && runner.executionReady, adoptionAllowed: false };
  result.contractHash = hashCanonical(result); return freeze(result);
}
function assertSprMakerToolchainContract(value, expectedHash = value?.contractHash) {
  const copy = { ...value }; delete copy.contractHash;
  const noApprovedRunner = APPROVED_NATIVE_PROBE_PROGRAM_HASHES.length === 0 && APPROVED_DOSBOX_X_MANIFEST_HASHES.length === 0;
  if (value?.schema !== 'ikemaker.sff-v1-sprmaker-toolchain-contract' || value.version !== 1 || !SHA.test(String(expectedHash || '')) || value.contractHash !== expectedHash || hashCanonical(copy) !== value.contractHash || value.adoptionAllowed !== false || value.distribution?.executable?.byteHash !== SPRMAKER_SHA256 || value.distribution?.notice?.byteHash !== MTOOLS_SHA256 || value.executionImplemented !== SPRMAKER_EXECUTION_IMPLEMENTED || value.executionReady !== false || noApprovedRunner && value.runner?.executionReady === true) throw new Error('SprMaker toolchain contract drifted or claims unavailable execution authority.');
  return value;
}

module.exports = { SPRMAKER_SHA256, MTOOLS_SHA256, APPROVED_NATIVE_PROBE_PROGRAM_HASHES, APPROVED_DOSBOX_X_MANIFEST_HASHES, SPRMAKER_EXECUTION_IMPLEMENTED, inspectSprMakerDistribution, inspectNativeProbe, inspectDosBoxXRunner, createSprMakerToolchainContract, assertSprMakerToolchainContract };
