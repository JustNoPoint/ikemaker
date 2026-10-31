'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { types: utilTypes } = require('util');
const { canonicalize, hashCanonical } = require('./sff_capability_report');
const { PROFILE_ID } = require('./sff_creator_execution_layout_plan');

const PROBE_SCHEMA = 'ikemaker.sff-replacement-capability-evidence';
const PROBE_VERSION = 1;
const GENERATOR_VERSION = 1;
const TESTER = 'IKEMaker extension replacement-capability probe';
const FIXTURE = Object.freeze({
  schema: 'ikemaker.sff-replacement-capability-probe-fixture', version: 1, profileId: PROFILE_ID, profileVersion: 1,
  operations: Object.freeze(['rename-to-absent', 'file-fsync', 'open-handle-rename', 'directory-fsync']),
  isolation: 'owned-child-directory-in-active-parent', cleanup: 'known-files-only-then-rmdir'
});
const FIXTURE_MANIFEST_HASH = hashCanonical(FIXTURE);
const UNSUPPORTED_DIRECTORY_FSYNC_CODES = new Set(['EACCES', 'EBADF', 'EINVAL', 'EISDIR', 'ENOSYS', 'ENOTSUP', 'EPERM']);
const FILES = Object.freeze(['file-fsync.bin', 'open-handle-destination.bin', 'open-handle-source.bin', 'rename-destination.bin', 'rename-source.bin']);

function fail(message, cause) { throw new Error(`SFF Creator replacement-capability probe: ${message}`, cause ? { cause } : undefined); }
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function freeze(value) { if (!value || typeof value !== 'object' || Buffer.isBuffer(value) || ArrayBuffer.isView(value) || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) freeze(nested); return value; }
function closed(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) fail(`${label} must be a plain non-proxy object.`);
  const descriptors = Object.getOwnPropertyDescriptors(value), found = Object.keys(descriptors).sort();
  if (Object.getOwnPropertySymbols(value).length || JSON.stringify(found) !== JSON.stringify([...keys].sort())) fail(`${label} must contain exactly ${[...keys].sort().join(', ')}.`);
  for (const key of found) if (!descriptors[key].enumerable || !Object.prototype.hasOwnProperty.call(descriptors[key], 'value')) fail(`${label}.${key} must be an enumerable data property.`);
  return Object.fromEntries(found.map(key => [key, descriptors[key].value]));
}
function identity(stat) { return { device: String(stat.dev), inode: String(stat.ino) }; }
function sameIdentity(left, right) { return String(left.dev) === right.device && String(left.ino) === right.inode; }
function boundedError(check, error) { return freeze({ check, code: error?.code == null ? null : String(error.code).slice(0, 80), message: String(error?.message || error).slice(0, 500) }); }

function makeProbe(dependencies) {
  const deps = closed(dependencies, ['fault', 'fsApi', 'now'], 'probe dependencies');
  if (!deps.fsApi || typeof deps.fsApi !== 'object' || typeof deps.now !== 'function' || typeof deps.fault !== 'function') fail('probe dependencies are invalid.');
  const io = deps.fsApi;
  for (const name of ['closeSync', 'existsSync', 'fstatSync', 'fsyncSync', 'lstatSync', 'mkdtempSync', 'openSync', 'readFileSync', 'readdirSync', 'realpathSync', 'renameSync', 'rmdirSync', 'statSync', 'unlinkSync', 'writeSync']) if (typeof io[name] !== 'function') fail(`filesystem dependency ${name} is unavailable.`);

  return function probeCreatorReplacementCapability(rawInput = {}) {
    const input = closed(rawInput, ['activeDirectory'], 'probe input');
    if (typeof input.activeDirectory !== 'string' || !input.activeDirectory || input.activeDirectory.length > 4096) fail('activeDirectory must be bounded nonempty text.');
    const lexicalParent = path.resolve(input.activeDirectory), parentLstat = io.lstatSync(lexicalParent, { bigint: true });
    if (!parentLstat.isDirectory() || parentLstat.isSymbolicLink()) fail('activeDirectory must be a direct directory, not a link.');
    const parentRealpath = io.realpathSync.native ? io.realpathSync.native(lexicalParent) : io.realpathSync(lexicalParent), parentStat = io.statSync(parentRealpath, { bigint: true }), parentIdentity = identity(parentStat);
    if (!parentStat.isDirectory() || path.resolve(parentRealpath) !== lexicalParent || !sameIdentity(parentLstat, parentIdentity)) fail('activeDirectory realpath or identity is ambiguous.');

    let probeDirectory = null;
    const diagnostics = [], checks = { renameToAbsentObserved: false, fileFsyncObserved: false, openHandleRenameObserved: false, directoryFsyncStatus: 'unsupported-by-platform' };
    const probeBytes = Buffer.from('IKEMaker isolated replacement capability probe\n', 'utf8');
    function file(name) { return path.join(probeDirectory, name); }
    function attempt(check, operation) { try { operation(); return true; } catch (error) { diagnostics.push(boundedError(check, error)); return false; } }
    function exclusiveFile(name, sync) {
      const descriptor = io.openSync(file(name), 'wx', 0o600);
      try { io.writeSync(descriptor, probeBytes, 0, probeBytes.length, 0); if (sync) io.fsyncSync(descriptor); }
      finally { io.closeSync(descriptor); }
    }
    function cleanup() {
      if (!probeDirectory) return;
      const probeLstat = io.lstatSync(probeDirectory, { bigint: true }), probeRealpath = io.realpathSync.native ? io.realpathSync.native(probeDirectory) : io.realpathSync(probeDirectory);
      if (!probeLstat.isDirectory() || probeLstat.isSymbolicLink() || path.dirname(path.resolve(probeRealpath)) !== path.resolve(parentRealpath) || !path.basename(probeDirectory).startsWith('.ikemaker-replacement-probe-')) fail('owned probe directory identity became unsafe; cleanup stopped.');
      const inventory = io.readdirSync(probeDirectory).sort();
      if (inventory.some(name => !FILES.includes(name))) fail(`owned probe directory contains foreign entries; cleanup stopped: ${inventory.filter(name => !FILES.includes(name)).join(', ')}.`);
      for (const name of inventory) { const target = file(name), stat = io.lstatSync(target, { bigint: true }); if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n) fail(`owned probe file ${name} became unsafe; cleanup stopped.`); io.unlinkSync(target); }
      io.rmdirSync(probeDirectory); probeDirectory = null;
    }

    try {
      probeDirectory = io.mkdtempSync(path.join(parentRealpath, '.ikemaker-replacement-probe-'));
      const probeStat = io.lstatSync(probeDirectory, { bigint: true });
      if (!probeStat.isDirectory() || probeStat.isSymbolicLink() || String(probeStat.dev) !== parentIdentity.device || path.dirname(path.resolve(probeDirectory)) !== path.resolve(parentRealpath)) fail('probe directory is not an isolated same-device child of activeDirectory.');
      deps.fault('after-probe-directory-created');

      checks.fileFsyncObserved = attempt('fileFsyncObserved', () => { exclusiveFile('file-fsync.bin', true); deps.fault('after-file-fsync'); });
      checks.renameToAbsentObserved = attempt('renameToAbsentObserved', () => {
        exclusiveFile('rename-source.bin', false); const destination = file('rename-destination.bin');
        if (io.existsSync(destination)) fail('rename destination unexpectedly exists.');
        io.renameSync(file('rename-source.bin'), destination); deps.fault('after-rename-to-absent');
        if (io.existsSync(file('rename-source.bin')) || !io.readFileSync(destination).equals(probeBytes)) fail('rename-to-absent result did not preserve exact bytes.');
      });
      checks.openHandleRenameObserved = attempt('openHandleRenameObserved', () => {
        const source = file('open-handle-source.bin'), destination = file('open-handle-destination.bin'), descriptor = io.openSync(source, 'wx+', 0o600);
        try {
          io.writeSync(descriptor, probeBytes, 0, probeBytes.length, 0); io.fsyncSync(descriptor); const before = io.fstatSync(descriptor, { bigint: true });
          io.renameSync(source, destination); deps.fault('after-open-handle-rename');
          if (io.existsSync(source) || !io.readFileSync(destination).equals(probeBytes)) fail('open-handle rename did not preserve exact bytes.');
          const after = io.fstatSync(descriptor, { bigint: true }); if (String(before.dev) !== String(after.dev) || String(before.ino) !== String(after.ino)) fail('open file identity changed across rename.');
        } finally { io.closeSync(descriptor); }
      });
      try {
        const descriptor = io.openSync(probeDirectory, 'r');
        try { io.fsyncSync(descriptor); deps.fault('after-directory-fsync'); checks.directoryFsyncStatus = 'completed'; }
        finally { io.closeSync(descriptor); }
      } catch (error) {
        if (!UNSUPPORTED_DIRECTORY_FSYNC_CODES.has(String(error?.code || ''))) throw error;
        diagnostics.push(boundedError('directoryFsyncStatus', error)); checks.directoryFsyncStatus = 'unsupported-by-platform';
      }
    } finally {
      let cleanupError = null; try { cleanup(); } catch (error) { cleanupError = error; }
      let parentError = null; try { const finalLstat = io.lstatSync(lexicalParent, { bigint: true }), finalRealpath = io.realpathSync.native ? io.realpathSync.native(lexicalParent) : io.realpathSync(lexicalParent), finalStat = io.statSync(finalRealpath, { bigint: true }); if (finalLstat.isSymbolicLink() || finalRealpath !== parentRealpath || !sameIdentity(finalStat, parentIdentity)) fail('activeDirectory identity drifted during the probe.'); } catch (error) { parentError = error; }
      if (cleanupError || parentError) fail(`cleanup or parent revalidation failed${probeDirectory ? `; retained probe directory: ${probeDirectory}` : ''}.`, cleanupError || parentError);
    }

    const tested = deps.now();
    if (!(tested instanceof Date) || Number.isNaN(tested.valueOf())) fail('probe clock returned an invalid date.');
    const evidence = freeze({
      schema: PROBE_SCHEMA, version: PROBE_VERSION, profileId: PROFILE_ID, profileVersion: 1,
      platform: process.platform, arch: process.arch, nodeVersion: process.version,
      filesystem: { parentRealpath, device: parentIdentity.device }, checks,
      fixtureManifestHash: FIXTURE_MANIFEST_HASH, evidenceGeneratorVersion: GENERATOR_VERSION, tester: TESTER, testedAt: tested.toISOString()
    }), artifactBytes = Buffer.from(`${JSON.stringify(canonicalize(evidence, 'replacement capability evidence'))}\n`);
    return freeze({
      schema: 'ikemaker.sff-replacement-capability-probe-result', version: 1, status: 'observed', evidence, artifactBytes, artifactByteHash: sha(artifactBytes), diagnostics,
      probeDirectoryRetained: false, activeArchiveModified: false, candidateModified: false, historyModified: false,
      effects: { temporaryProbeDirectoryCreatedAndRemoved: true, projectFilesWritten: false, executionAuthorityGranted: false, adoptionAllowed: false }
    });
  };
}

const probeCreatorReplacementCapability = makeProbe({ fsApi: fs, now: () => new Date(), fault() {} });
function createCreatorReplacementCapabilityProbeForTest(dependencies = {}) {
  return makeProbe({ fsApi: dependencies.fsApi || fs, now: dependencies.now || (() => new Date('2026-10-26T12:00:00.000Z')), fault: dependencies.fault || (() => {}) });
}

module.exports = { FIXTURE_MANIFEST_HASH, GENERATOR_VERSION, PROBE_SCHEMA, PROBE_VERSION, TESTER, createCreatorReplacementCapabilityProbeForTest, probeCreatorReplacementCapability };
