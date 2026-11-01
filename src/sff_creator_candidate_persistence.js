'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { types: utilTypes } = require('util');
const { decodeStrictJsonArtifact } = require('./sff_strict_json_artifact');
const { snapshotPlainJson } = require('./sff_plain_json_snapshot');
const { canonicalize, hashCanonical } = require('./sff_capability_report');
const { dispatchCreatorApprovedCandidate } = require('./sff_creator_candidate_dispatch');
const { assertSffV1Pcx8 } = require('./sff_v1_pcx8_strict_validator');
const { assertSffV20Raw8 } = require('./sff_v20_strict_validator');
const { assertSffV21Mixed: assertSffV21Png8 } = require('./sff_v21_mixed_strict_validator');

const SHA256 = /^[0-9a-f]{64}$/i;
const INPUT_KEYS = Object.freeze(['activeArchivePath', 'candidateBytes', 'candidateDispatchInput', 'candidateDispatchReceiptArtifactBytes', 'candidateFilename', 'expectedApprovalReceiptHash', 'expectedCandidateByteHash', 'expectedCandidateDispatchReceiptArtifactByteHash', 'expectedCandidateDispatchReceiptHash', 'expectedRequestHash', 'expectedSourceSnapshotHash', 'expectedSpecificationHash', 'protectedRoots', 'stagingParent']);
const RESERVED_INPUT_KEYS = Object.freeze(['activeArchivePath', 'candidateBytes', 'candidateDispatchInput', 'candidateDispatchReceiptArtifactBytes', 'expectedApprovalReceiptHash', 'expectedCandidateByteHash', 'expectedCandidateDispatchReceiptArtifactByteHash', 'expectedCandidateDispatchReceiptHash', 'expectedRequestHash', 'expectedSourceSnapshotHash', 'expectedSpecificationHash', 'protectedRoots', 'reservedCandidatePath']);
const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function checkedHash(value, label) { const result = String(value || '').toLowerCase(); if (!SHA256.test(result)) throw new Error(`${label} must be a SHA-256 hash.`); return result; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(deepFreeze); return value; }
function exactSemantic(left, right, label) { return JSON.stringify(canonicalize(left, label)) === JSON.stringify(canonicalize(right, label)); }

function closedInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Buffer.isBuffer(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('Creator candidate-persistence input must be a plain non-proxy object.');
  if (Object.getOwnPropertySymbols(value).length) throw new Error('Creator candidate-persistence input must not contain symbol properties.');
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Object.keys(descriptors).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...INPUT_KEYS].sort())) throw new Error('Creator candidate-persistence input must contain exactly the reviewed replay, receipt, candidate, retained hashes, and private-staging fields.');
  for (const key of keys) if (!descriptors[key].enumerable || !Object.prototype.hasOwnProperty.call(descriptors[key], 'value')) throw new Error(`Creator candidate-persistence input ${key} must be an enumerable data property, not an accessor.`);
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function closedReservedInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Buffer.isBuffer(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('Creator reserved candidate-persistence input must be a plain non-proxy object.');
  if (Object.getOwnPropertySymbols(value).length) throw new Error('Creator reserved candidate-persistence input must not contain symbol properties.');
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Object.keys(descriptors).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...RESERVED_INPUT_KEYS].sort())) throw new Error('Creator reserved candidate-persistence input must contain exactly the reviewed replay, receipt, candidate, retained hashes, and pre-authorized path fields.');
  for (const key of keys) if (!descriptors[key].enumerable || !Object.prototype.hasOwnProperty.call(descriptors[key], 'value')) throw new Error(`Creator reserved candidate-persistence input ${key} must be an enumerable data property, not an accessor.`);
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}

function safeFilename(value) {
  const name = String(value || '');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.sff$/.test(name) || Buffer.byteLength(name, 'utf8') > 124 || path.basename(name) !== name || WINDOWS_DEVICE.test(name) || /[ .]$/.test(name)) throw new Error('candidateFilename must be a conservative ASCII .sff basename with no traversal, device, ADS, trailing-dot, or trailing-space syntax.');
  return name;
}
function key(filename) { const resolved = path.resolve(filename); return process.platform === 'win32' ? resolved.toLowerCase() : resolved; }
function within(candidate, root) { const relative = path.relative(path.resolve(root), path.resolve(candidate)); return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)); }
function statIdentity(stat) { return { device: typeof stat.dev === 'bigint' ? stat.dev.toString() : Number(stat.dev), inode: typeof stat.ino === 'bigint' ? stat.ino.toString() : Number(stat.ino) }; }
function sameIdentity(left, right) { return String(left.dev) === String(right.dev) && String(left.ino) === String(right.ino); }
function sameFileObservation(left, right) {
  return sameIdentity(left, right) && String(left.size) === String(right.size) && String(left.mtimeNs ?? left.mtimeMs) === String(right.mtimeNs ?? right.mtimeMs) && String(left.ctimeNs ?? left.ctimeMs) === String(right.ctimeNs ?? right.ctimeMs);
}

function assertSafeExistingPath(filename, label) {
  const resolved = path.resolve(filename), parsed = path.parse(resolved);
  if (process.platform === 'win32' && (resolved.startsWith('\\\\') || parsed.root.startsWith('\\\\'))) throw new Error(`${label} must be a local filesystem path, not UNC/network storage.`);
  const relative = path.relative(parsed.root, resolved), pieces = relative ? relative.split(path.sep) : [];
  let current = parsed.root;
  for (const piece of pieces) {
    current = path.join(current, piece);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error(`${label} must not contain a symbolic-link, junction, or reparse ancestor: ${current}`);
  }
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) throw new Error(`${label} must be an existing directory.`);
  return { resolved, realpath: fs.realpathSync.native(resolved), stat };
}

function openNoFollow(filename, flags, mode) {
  const noFollow = fs.constants.O_NOFOLLOW || 0;
  return fs.openSync(filename, flags | noFollow, mode);
}
function readHandleExact(handle) { const stat = fs.fstatSync(handle); if (!stat.isFile() || !Number.isSafeInteger(stat.size) || stat.size < 1) throw new Error('Persisted candidate must be a non-empty regular file.'); const bytes = Buffer.alloc(stat.size); let at = 0; while (at < bytes.length) { const read = fs.readSync(handle, bytes, at, bytes.length - at, at); if (!read) throw new Error('Persisted candidate ended before its recorded length.'); at += read; } return bytes; }
function fingerprintRegularFile(filename, label) {
  const resolved = path.resolve(filename), before = fs.lstatSync(resolved, { bigint: true });
  if (before.isSymbolicLink() || !before.isFile()) throw new Error(`${label} must identify an existing non-link regular file.`);
  const realpath = fs.realpathSync.native(resolved), handle = openNoFollow(resolved, fs.constants.O_RDONLY), digest = crypto.createHash('sha256'), chunk = Buffer.alloc(1024 * 1024);
  let opened, afterRead;
  try {
    opened = fs.fstatSync(handle, { bigint: true }); if (!opened.isFile() || opened.size < 0n || opened.size > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${label} changed before it could be fingerprinted or exceeds the safe streaming size range.`);
    const size = Number(opened.size); let position = 0; while (position < size) { const count = fs.readSync(handle, chunk, 0, Math.min(chunk.length, size - position), position); if (!count) throw new Error(`${label} ended before its recorded length.`); digest.update(chunk.subarray(0, count)); position += count; }
    afterRead = fs.fstatSync(handle, { bigint: true });
  } finally { fs.closeSync(handle); }
  const after = fs.lstatSync(resolved, { bigint: true }), afterRealpath = fs.realpathSync.native(resolved);
  if (after.isSymbolicLink() || !sameFileObservation(before, opened) || !sameFileObservation(opened, afterRead) || !sameFileObservation(afterRead, after) || key(realpath) !== key(afterRealpath)) throw new Error(`${label} identity or contents changed while it was fingerprinted.`);
  return { path: resolved, realpath, identity: statIdentity(opened), byteHash: digest.digest('hex'), byteLength: Number(opened.size) };
}
function syncDirectory(directory) {
  let handle;
  try { handle = fs.openSync(directory, fs.constants.O_RDONLY); fs.fsyncSync(handle); return 'completed'; }
  catch (error) { if (['EINVAL', 'EPERM', 'EISDIR', 'ENOTSUP', 'EACCES'].includes(error?.code)) return 'unsupported-by-platform'; throw error; }
  finally { if (handle !== undefined) fs.closeSync(handle); }
}

function strictValidation(request, bytes) {
  let report, strictReportHash, specificationBinding = 'direct-strict-validator-specification';
  if (request.targetId === 'sff-v1') {
    report = assertSffV1Pcx8(bytes, request.specification);
    strictReportHash = hashCanonical({ kind: report.kind, profile: report.profile, version: report.header.version, groupCount: report.header.groupCount, spriteCount: report.sprites.length });
  } else if (request.targetId === 'sff-v2.0') {
    report = assertSffV20Raw8(bytes, request.specification, { compatibilityProfile: 'canonical' });
    strictReportHash = hashCanonical({ kind: report.kind, profile: report.profile, primaryVersion: report.primaryVersion, compatibleVersion: report.compatibleVersion, spriteCount: report.sprites.length, paletteCount: report.palettes.length });
  } else if (request.targetId === 'sff-v2.1') {
    report = assertSffV21Png8(bytes, null, { compatibilityProfile: 'canonical' });
    strictReportHash = hashCanonical(report);
    specificationBinding = 'exact-sff13-strict-report-hash';
  } else throw new Error(`No certified persistence validator exists for ${request.targetId}.`);
  return { strictReportHash, profile: report.profile, compatibilityProfile: report.compatibilityProfile || 'canonical', specificationBinding };
}

function persistCandidate(input, destination) {
  const rederived = dispatchCreatorApprovedCandidate(input.candidateDispatchInput);
  const saved = decodeStrictJsonArtifact(input.candidateDispatchReceiptArtifactBytes, 'Creator candidate-dispatch receipt');
  const artifactHash = sha(saved.bytes), expectedArtifactHash = checkedHash(input.expectedCandidateDispatchReceiptArtifactByteHash, 'expectedCandidateDispatchReceiptArtifactByteHash');
  if (artifactHash !== expectedArtifactHash) throw new Error('Candidate-dispatch receipt artifact byte hash does not match the independently retained hash.');
  if (!exactSemantic(saved.parsed, rederived.receipt, 'candidate dispatch receipt')) throw new Error('Saved candidate-dispatch receipt does not exactly match the independently rederived SFF-13 authority.');
  const expected = {
    receiptHash: checkedHash(input.expectedCandidateDispatchReceiptHash, 'expectedCandidateDispatchReceiptHash'), requestHash: checkedHash(input.expectedRequestHash, 'expectedRequestHash'),
    specificationHash: checkedHash(input.expectedSpecificationHash, 'expectedSpecificationHash'), approvalReceiptHash: checkedHash(input.expectedApprovalReceiptHash, 'expectedApprovalReceiptHash'),
    sourceSnapshotHash: checkedHash(input.expectedSourceSnapshotHash, 'expectedSourceSnapshotHash'), candidateByteHash: checkedHash(input.expectedCandidateByteHash, 'expectedCandidateByteHash')
  };
  if (hashCanonical(rederived.receipt) !== expected.receiptHash || rederived.receiptHash !== expected.receiptHash || hashCanonical(saved.parsed) !== expected.receiptHash) throw new Error('Candidate-dispatch receipt hash does not match the independently retained hash.');
  for (const receipt of [saved.parsed, rederived.receipt]) if (receipt.requestHash !== expected.requestHash || receipt.specificationHash !== expected.specificationHash || receipt.approvalReceiptHash !== expected.approvalReceiptHash || receipt.sourceSnapshotHash !== expected.sourceSnapshotHash || receipt.candidateByteHash !== expected.candidateByteHash || receipt.candidateCreated !== true || receipt.writesCommitted !== false || receipt.adoptionAllowed !== false || receipt.byteEqualityRequired !== false) throw new Error('Saved or rederived candidate-dispatch authority does not match the independently retained values.');
  if (utilTypes.isProxy(input.candidateBytes) || !Buffer.isBuffer(input.candidateBytes)) throw new Error('candidateBytes must be a non-proxy Buffer.');
  const candidateBytes = Buffer.from(input.candidateBytes), rederivedBytes = rederived.readCandidateBytes();
  if (sha(candidateBytes) !== expected.candidateByteHash || candidateBytes.length !== rederived.receipt.candidateByteLength || !candidateBytes.equals(rederivedBytes)) throw new Error('Exact candidate bytes do not match the rederived SFF-13 candidate.');

  const filename = destination.filename, parent = destination.parent;
  const protectedRoots = snapshotPlainJson(input.protectedRoots, 'protectedRoots');
  if (!Array.isArray(protectedRoots) || protectedRoots.some((item) => typeof item !== 'string' || !path.isAbsolute(item))) throw new Error('protectedRoots must be an array of absolute paths.');
  if (typeof input.activeArchivePath !== 'string' || !path.isAbsolute(input.activeArchivePath)) throw new Error('activeArchivePath must be an absolute path.');
  const protectedDirectories = protectedRoots.map((item, index) => assertSafeExistingPath(item, `protectedRoots[${index}]`));
  const activeDirectory = assertSafeExistingPath(path.dirname(input.activeArchivePath), 'activeArchiveDirectory');
  const activeArchive = fingerprintRegularFile(input.activeArchivePath, 'activeArchivePath');
  for (const protectedDirectory of [...protectedDirectories, activeDirectory]) {
    if (within(parent.realpath, protectedDirectory.realpath) || within(protectedDirectory.realpath, parent.realpath)) throw new Error('The private staging parent must not overlap any protected workspace root or active archive directory.');
  }
  const adapterRequest = rederivedRequest(input.candidateDispatchInput), operationName = `.ikemaker-sff-candidate-${expected.receiptHash.slice(0, 16)}-${expected.candidateByteHash.slice(0, 16)}`;
  const directory = destination.directory || path.join(parent.realpath, operationName), partial = path.join(directory, `.${expected.candidateByteHash}.partial`), finalPath = path.join(directory, filename);
  for (const candidatePath of [directory, partial, finalPath]) if (!within(candidatePath, parent.realpath)) throw new Error('Private candidate path escaped the reviewed staging parent.');
  if (destination.createDirectory) { if (fs.existsSync(directory)) throw new Error(`Private candidate operation already exists and will not be overwritten: ${directory}`); fs.mkdirSync(directory, { mode: 0o700 }); }
  else if (path.resolve(destination.exactPath) !== path.resolve(finalPath)) throw new Error('Reserved candidate path does not exactly match the pre-authorized destination.');
  if (fs.existsSync(finalPath)) throw new Error(`Reserved candidate path already exists and will not be overwritten: ${finalPath}`);
  let directoryCreated = destination.createDirectory, partialCreated = false, finalCreated = false, handle, fileFsync = 'not-completed', parentDirectoryFsync = 'not-completed', directoryFsyncAfterPublish = 'not-completed', directoryFsyncAfterCleanup = 'not-completed';
  try {
    parentDirectoryFsync = syncDirectory(parent.realpath);
    const leafStat = fs.lstatSync(directory, { bigint: true }), leafIdentity = statIdentity(leafStat); if (leafStat.isSymbolicLink() || !leafStat.isDirectory()) throw new Error('Private candidate operation directory was replaced before writing.');
    if (process.platform !== 'win32' && (leafStat.mode & 0o077n) !== 0n) throw new Error('Private candidate operation directory permissions are broader than 0700.');
    handle = openNoFollow(partial, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600); partialCreated = true;
    let at = 0; while (at < candidateBytes.length) { const written = fs.writeSync(handle, candidateBytes, at, candidateBytes.length - at, at); if (!written) throw new Error('Candidate partial write made no progress.'); at += written; }
    fs.fsyncSync(handle); fileFsync = 'completed'; fs.closeSync(handle); handle = undefined;
    handle = openNoFollow(partial, fs.constants.O_RDONLY); const reopenedPartial = readHandleExact(handle); fs.closeSync(handle); handle = undefined;
    if (sha(reopenedPartial) !== expected.candidateByteHash || !reopenedPartial.equals(candidateBytes)) throw new Error('Candidate partial changed after its mandatory file sync.');
    const partialValidation = strictValidation(adapterRequest, reopenedPartial);
    if (partialValidation.strictReportHash !== rederived.receipt.validation.strictReportHash) throw new Error('Reopened candidate strict validation differs from the SFF-13 validator receipt.');
    fs.linkSync(partial, finalPath); finalCreated = true; directoryFsyncAfterPublish = syncDirectory(directory);
    handle = openNoFollow(finalPath, fs.constants.O_RDONLY); const reopenedFinal = readHandleExact(handle); fs.closeSync(handle); handle = undefined;
    if (sha(reopenedFinal) !== expected.candidateByteHash || !reopenedFinal.equals(candidateBytes)) throw new Error('Published private candidate bytes drifted after reopen.');
    const finalValidation = strictValidation(adapterRequest, reopenedFinal);
    if (finalValidation.strictReportHash !== rederived.receipt.validation.strictReportHash) throw new Error('Published candidate strict validation differs from the SFF-13 validator receipt.');
    fs.unlinkSync(partial); partialCreated = false; directoryFsyncAfterCleanup = syncDirectory(directory);
    const parentAfter = fs.statSync(parent.resolved), realpathAfter = fs.realpathSync.native(parent.resolved);
    if (!sameIdentity(parent.stat, parentAfter) || key(parent.realpath) !== key(realpathAfter)) throw new Error('Staging parent identity changed during candidate persistence.');
    const finalDirectoryStat = fs.statSync(directory, { bigint: true }), finalDirectoryRealpath = fs.realpathSync.native(directory);
    if (!sameIdentity(leafStat, finalDirectoryStat) || key(finalDirectoryRealpath) !== key(directory)) throw new Error('Private candidate operation directory identity changed during persistence.');
    const activeArchiveAfter = fingerprintRegularFile(input.activeArchivePath, 'activeArchivePath');
    if (JSON.stringify(activeArchiveAfter) !== JSON.stringify(activeArchive)) throw new Error('The active archive changed during private candidate persistence.');
    const persistenceValidation = deepFreeze({ status: 'passed', validatorId: rederived.receipt.validation.validatorId, validatorVersion: rederived.receipt.validation.validatorVersion, strictReportHash: finalValidation.strictReportHash, specificationBinding: finalValidation.specificationBinding, candidateByteHash: expected.candidateByteHash, specificationHash: expected.specificationHash, logicalHash: rederived.receipt.logicalHash });
    const directoryFsync = directoryFsyncAfterPublish === 'completed' && directoryFsyncAfterCleanup === 'completed' ? 'completed' : 'unsupported-by-platform';
    const receipt = deepFreeze({
      schema: 'ikemaker.sff-creator-persisted-candidate-receipt', version: 1, candidateDispatchReceiptArtifactByteHash: artifactHash, candidateDispatchReceiptHash: expected.receiptHash,
      requestHash: expected.requestHash, specificationHash: expected.specificationHash, logicalHash: rederived.receipt.logicalHash, approvalReceiptHash: expected.approvalReceiptHash,
      sourceSnapshotHash: expected.sourceSnapshotHash, capabilitySnapshotHash: rederived.receipt.capabilitySnapshotHash, sourceValidationHash: rederived.receipt.sourceValidationHash,
      selection: rederived.receipt.selection, candidateByteHash: expected.candidateByteHash, candidateByteLength: candidateBytes.length,
      activeArchive,
      stagingDirectory: { realpath: finalDirectoryRealpath, identity: leafIdentity }, relativeCandidateFilename: filename,
      persistedByteHash: sha(reopenedFinal), persistedByteLength: reopenedFinal.length, fileFsync, parentDirectoryFsync, directoryFsync, directoryFsyncAfterPublish, directoryFsyncAfterCleanup,
      persistenceValidation, persistenceValidationHash: hashCanonical(persistenceValidation), semanticComparisonHash: hashCanonical(rederived.receipt.semanticComparison), dispatchReceiptHash: hashCanonical(rederived.receipt.dispatch),
      candidatePersisted: true, writesCommitted: true, activeArchiveModified: false, adoptionAllowed: false, byteEqualityRequired: false
    });
    return Object.freeze({ receipt, receiptHash: hashCanonical(receipt), stagingCandidatePath: finalPath });
  } catch (error) {
    if (handle !== undefined) { try { fs.closeSync(handle); } catch (_) {} }
    const cleanup = [];
    for (const [created, filenameToRemove] of [[finalCreated, finalPath], [partialCreated, partial]]) if (created) { try { fs.unlinkSync(filenameToRemove); } catch (cleanupError) { cleanup.push({ path: filenameToRemove, error: cleanupError.message }); } }
    if (directoryCreated) { try { fs.rmdirSync(directory); directoryCreated = false; try { syncDirectory(parent.realpath); } catch (_) {} } catch (cleanupError) { cleanup.push({ path: directory, error: cleanupError.message }); } }
    if (cleanup.length) { error.cleanupRequired = cleanup; error.message = `${error.message} Private candidate cleanup is required.`; }
    throw error;
  }
}

function persistCreatorCandidate(rawInput = {}) {
  const input = closedInput(rawInput), parent = assertSafeExistingPath(input.stagingParent, 'stagingParent');
  return persistCandidate(input, { filename: safeFilename(input.candidateFilename), parent, directory: null, exactPath: null, createDirectory: true });
}

function persistCreatorCandidateToReservedPath(rawInput = {}) {
  const input = closedReservedInput(rawInput);
  if (typeof input.reservedCandidatePath !== 'string' || !path.isAbsolute(input.reservedCandidatePath)) throw new Error('reservedCandidatePath must be an absolute pre-authorized path.');
  const exactPath = path.resolve(input.reservedCandidatePath), parent = assertSafeExistingPath(path.dirname(exactPath), 'reservedCandidateRoot'), filename = safeFilename(path.basename(exactPath));
  if (!/^[0-9a-f]{64}\.sff$/.test(filename) || path.resolve(parent.realpath, filename) !== exactPath) throw new Error('reservedCandidatePath must be the exact lowercase SHA-256 reservation basename in its direct candidate root.');
  return persistCandidate(input, { filename, parent, directory: parent.realpath, exactPath, createDirectory: false });
}

function rederivedRequest(candidateDispatchInput) {
  const approved = require('./sff_creator_approved_request').createCreatorApprovedAdapterRequest(candidateDispatchInput.approvedRequestInput);
  return approved.request;
}

module.exports = { persistCreatorCandidate, persistCreatorCandidateToReservedPath };
