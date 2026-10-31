'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { certification, kits } = require('./sff_creator_candidate_dispatch.test');
const { approvalInput, buildChain } = require('./sff_creator_adoption_approval.test');
const { layoutInput } = require('./sff_creator_execution_layout.test');
const { approveCreatorAdoptionPlan } = require('../src/sff_creator_adoption_approval');
const { createCreatorExecutionLayoutPlan } = require('../src/sff_creator_execution_layout_plan');
const { PROFILE_ID } = require('../src/sff_creator_execution_layout_plan');
const {
  FIXTURE_MANIFEST_HASH,
  createCreatorReplacementCapabilityProbeForTest,
  probeCreatorReplacementCapability
} = require('../src/sff_creator_replacement_capability_probe');

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-replacement-probe-test-'));
try {
  const activeDirectory = path.join(root, 'active-parent'); fs.mkdirSync(activeDirectory);
  const active = path.join(activeDirectory, 'active.sff'), candidate = path.join(activeDirectory, 'candidate.sff'), activeBytes = Buffer.from('untouched active'), candidateBytes = Buffer.from('untouched candidate');
  fs.writeFileSync(active, activeBytes); fs.writeFileSync(candidate, candidateBytes);
  const before = fs.readdirSync(activeDirectory).sort(), result = probeCreatorReplacementCapability({ activeDirectory }), after = fs.readdirSync(activeDirectory).sort(), evidence = result.evidence;
  assert.deepStrictEqual(after, before, 'the isolated probe directory must be removed without changing parent inventory');
  assert.deepStrictEqual(fs.readFileSync(active), activeBytes); assert.deepStrictEqual(fs.readFileSync(candidate), candidateBytes);
  assert.strictEqual(result.activeArchiveModified, false); assert.strictEqual(result.candidateModified, false); assert.strictEqual(result.historyModified, false);
  assert.strictEqual(result.probeDirectoryRetained, false); assert.strictEqual(result.effects.projectFilesWritten, false);
  assert.strictEqual(result.artifactByteHash, sha(result.artifactBytes)); assert.deepStrictEqual(JSON.parse(result.artifactBytes), evidence);
  assert.deepStrictEqual(Object.keys(evidence).sort(), ['arch', 'checks', 'evidenceGeneratorVersion', 'filesystem', 'fixtureManifestHash', 'nodeVersion', 'platform', 'profileId', 'profileVersion', 'schema', 'testedAt', 'tester', 'version']);
  assert.deepStrictEqual(Object.keys(evidence.checks).sort(), ['directoryFsyncStatus', 'fileFsyncObserved', 'openHandleRenameObserved', 'renameToAbsentObserved']);
  assert.deepStrictEqual(Object.keys(evidence.filesystem).sort(), ['device', 'parentRealpath']);
  assert.strictEqual(evidence.profileId, PROFILE_ID); assert.strictEqual(evidence.fixtureManifestHash, FIXTURE_MANIFEST_HASH); assert(/^[0-9a-f]{64}$/.test(FIXTURE_MANIFEST_HASH));
  assert.strictEqual(evidence.filesystem.parentRealpath, fs.realpathSync.native(activeDirectory)); assert.strictEqual(evidence.filesystem.device, String(fs.statSync(activeDirectory, { bigint: true }).dev));
  assert.strictEqual(evidence.fileFsyncObserved, undefined); assert.strictEqual(evidence.checks.fileFsyncObserved, true); assert.strictEqual(evidence.checks.renameToAbsentObserved, true); assert.strictEqual(evidence.checks.openHandleRenameObserved, true);
  assert(['completed', 'unsupported-by-platform'].includes(evidence.checks.directoryFsyncStatus));

  const chainRoot = path.join(root, 'real-chain'); fs.mkdirSync(chainRoot);
  const runtimeEvidence = certification(kits['sff-v2.1'].generate(path.join(chainRoot, 'cert'))), chain = buildChain('sff-v2.1', chainRoot, runtimeEvidence);
  const adoptionApprovalInput = approvalInput(chain.planInput, chain.plan), adoptionApproval = approveCreatorAdoptionPlan(adoptionApprovalInput);
  const chainCapability = probeCreatorReplacementCapability({ activeDirectory: path.dirname(chain.active) });
  const executionInput = {
    ...layoutInput(adoptionApprovalInput, adoptionApproval, chainCapability.evidence),
    replacementCapabilityArtifactBytes: chainCapability.artifactBytes,
    expectedReplacementCapabilityArtifactByteHash: chainCapability.artifactByteHash
  };
  const executionPlan = createCreatorExecutionLayoutPlan(executionInput);
  assert.strictEqual(executionPlan.replacementProfile.capabilityArtifactByteHash, chainCapability.artifactByteHash, 'the layout must bind the probe\'s exact artifact bytes');
  assert.deepStrictEqual(executionPlan.replacementProfile.capability, chainCapability.evidence, 'the real chain must retain the exact probed capability evidence');
  assert(!executionPlan.blockers.includes('replacement-capability-environment-drift'));
  assert(!executionPlan.blockers.includes('replacement-capability-directory-fsync-invalid'));
  assert.deepStrictEqual(fs.readdirSync(path.dirname(chain.active)).sort(), ['active.sff'], 'layout acceptance and the probe must leave the active directory unchanged');

  const fixedNow = new Date('2026-10-26T12:34:56.789Z'), faulted = createCreatorReplacementCapabilityProbeForTest({ now: () => fixedNow, fault(at) { if (at === 'after-file-fsync') { const error = new Error('injected file sync observation fault'); error.code = 'EIO'; throw error; } } })({ activeDirectory });
  assert.strictEqual(faulted.evidence.testedAt, fixedNow.toISOString()); assert.strictEqual(faulted.evidence.checks.fileFsyncObserved, false); assert(faulted.diagnostics.some(row => row.check === 'fileFsyncObserved' && row.code === 'EIO')); assert.deepStrictEqual(fs.readdirSync(activeDirectory).sort(), before);

  const unsupportedFs = { ...fs, openSync(filename, flags, mode) { if (path.basename(String(filename)).startsWith('.ikemaker-replacement-probe-') && fs.statSync(filename).isDirectory()) { const error = new Error('directory handles unsupported'); error.code = 'ENOTSUP'; throw error; } return fs.openSync(filename, flags, mode); } };
  const unsupported = createCreatorReplacementCapabilityProbeForTest({ fsApi: unsupportedFs })({ activeDirectory });
  assert.strictEqual(unsupported.evidence.checks.directoryFsyncStatus, 'unsupported-by-platform'); assert(unsupported.diagnostics.some(row => row.check === 'directoryFsyncStatus' && row.code === 'ENOTSUP')); assert.deepStrictEqual(fs.readdirSync(activeDirectory).sort(), before);

  assert.throws(() => createCreatorReplacementCapabilityProbeForTest({ fault(at) { if (at === 'after-probe-directory-created') throw new Error('injected setup fault'); } })({ activeDirectory }), /injected setup fault/);
  assert.deepStrictEqual(fs.readdirSync(activeDirectory).sort(), before, 'setup faults must still clean the owned directory');

  const ioFailureFs = { ...fs, openSync(filename, flags, mode) { if (path.basename(String(filename)).startsWith('.ikemaker-replacement-probe-') && fs.statSync(filename).isDirectory()) { const error = new Error('real directory fsync I/O failure'); error.code = 'EIO'; throw error; } return fs.openSync(filename, flags, mode); } };
  assert.throws(() => createCreatorReplacementCapabilityProbeForTest({ fsApi: ioFailureFs })({ activeDirectory }), /real directory fsync I\/O failure/);
  assert.deepStrictEqual(fs.readdirSync(activeDirectory).sort(), before, 'unclassified I/O failure must clean and fail, not claim platform limitation');

  assert.throws(() => probeCreatorReplacementCapability({ activeDirectory, activePath: active }), /exactly/);
  const accessor = {}; Object.defineProperty(accessor, 'activeDirectory', { enumerable: true, get() { throw new Error('getter executed'); } });
  assert.throws(() => probeCreatorReplacementCapability(accessor), /data property/);

  const alias = path.join(root, 'active-parent-alias');
  try {
    fs.symlinkSync(activeDirectory, alias, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => probeCreatorReplacementCapability({ activeDirectory: alias }), /direct directory|link|ambiguous/);
  } catch (error) {
    if (error.code !== 'EPERM') throw error;
  } finally { try { if (fs.lstatSync(alias).isSymbolicLink()) fs.unlinkSync(alias); } catch (_) {} }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log('SFF Creator replacement capability probe records exact same-parent filesystem observations, truthful directory-fsync limits, and deterministic isolated cleanup');
