'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { types: utilTypes } = require('util');
const { decodeStrictJsonArtifact } = require('./sff_strict_json_artifact');
const { canonicalize, hashCanonical } = require('./sff_capability_report');
const { approveCreatorExecutionLayoutPlan } = require('./sff_creator_execution_layout_approval');
const { assertSffV1Pcx8 } = require('./sff_v1_pcx8_strict_validator');
const { assertSffV20Raw8 } = require('./sff_v20_strict_validator');
const { assertSffV21Mixed: assertSffV21Png8 } = require('./sff_v21_mixed_strict_validator');

const WRITE_AUTHORITY = 'approved-sff-transactional-adoption-execution';
const SHA256 = /^[0-9a-f]{64}$/i;
const INPUT_KEYS = Object.freeze(['executionLayoutApprovalInput', 'executionLayoutApprovalReceiptArtifactBytes', 'expectedActiveByteHash', 'expectedAdoptionApprovalReceiptHash', 'expectedCandidateByteHash', 'expectedCandidateDispatchReceiptHash', 'expectedExecutionLayoutApprovalDecisionHash', 'expectedExecutionLayoutApprovalReceiptArtifactByteHash', 'expectedExecutionLayoutApprovalReceiptHash', 'expectedExecutionLayoutPlanHash', 'expectedPersistedReceiptHash', 'expectedPersistenceValidationHash', 'expectedRequestHash', 'expectedSourceSnapshotHash', 'expectedSourceValidationHash', 'expectedSpecificationHash']);
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function checkedHash(value, label) { if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(`${label} must be a SHA-256 hash string.`); return value.toLowerCase(); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(deepFreeze); return value; }
function closed(value) { if (!value || typeof value !== 'object' || Array.isArray(value) || Buffer.isBuffer(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('Creator transactional-executor input must be a plain non-proxy object.'); const descriptors = Object.getOwnPropertyDescriptors(value), keys = Object.keys(descriptors).sort(); if (Object.getOwnPropertySymbols(value).length || JSON.stringify(keys) !== JSON.stringify([...INPUT_KEYS].sort())) throw new Error('Creator transactional-executor input must contain exactly the approved execution authority and retained hashes.'); for (const key of keys) if (!descriptors[key].enumerable || !Object.prototype.hasOwnProperty.call(descriptors[key], 'value')) throw new Error(`Creator transactional-executor input ${key} must be an enumerable data property.`); return Object.fromEntries(keys.map((key) => [key, descriptors[key].value])); }
function exact(left, right, label) { if (JSON.stringify(canonicalize(left, label)) !== JSON.stringify(canonicalize(right, label))) throw new Error(`${label} does not exactly match rederived execution authority.`); }
function openNoFollow(filename, flags, mode) { return fs.openSync(filename, flags | (fs.constants.O_NOFOLLOW || 0), mode); }
function identity(stat) { return { device: String(stat.dev), inode: String(stat.ino) }; }
function sameIdentity(stat, expected) { return String(stat.dev) === String(expected?.device) && String(stat.ino) === String(expected?.inode); }
function stableStat(stat) { return [String(stat.dev), String(stat.ino), String(stat.size), String(stat.mtimeNs ?? stat.mtimeMs), String(stat.ctimeNs ?? stat.ctimeMs)].join(':'); }
function pathExists(filename) { try { fs.lstatSync(filename); return true; } catch (error) { if (error?.code === 'ENOENT') return false; throw error; } }
function platformKey(value) { return process.platform === 'win32' || process.platform === 'darwin' ? String(value).toLowerCase() : String(value); }
function syncDirectory(directory) { let handle; try { handle = fs.openSync(directory, fs.constants.O_RDONLY); fs.fsyncSync(handle); return 'completed'; } catch (error) { if (['EINVAL', 'EPERM', 'EISDIR', 'ENOTSUP', 'EACCES'].includes(error?.code)) return 'unsupported-by-platform'; throw error; } finally { if (handle !== undefined) fs.closeSync(handle); } }
function writeExclusive(filename, bytes, mode = 0o600) { const handle = openNoFollow(filename, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, mode); try { let at = 0; while (at < bytes.length) { const written = fs.writeSync(handle, bytes, at, bytes.length - at, at); if (!written) throw new Error(`Write made no progress for ${filename}.`); at += written; } fs.fsyncSync(handle); } finally { fs.closeSync(handle); } }
function readExact(filename, expectedLength, label) {
  const before = fs.lstatSync(filename, { bigint: true }); if (before.isSymbolicLink() || !before.isFile()) throw new Error(`${label} must be a non-link regular file.`);
  const handle = openNoFollow(filename, fs.constants.O_RDONLY); let opened, afterHandle, bytes;
  try {
    opened = fs.fstatSync(handle, { bigint: true }); if (!opened.isFile() || opened.size !== BigInt(expectedLength) || stableStat(before) !== stableStat(opened)) throw new Error(`${label} identity or length drifted before read.`);
    bytes = Buffer.alloc(expectedLength); let at = 0; while (at < bytes.length) { const count = fs.readSync(handle, bytes, at, bytes.length - at, at); if (!count) throw new Error(`${label} ended early.`); at += count; }
    afterHandle = fs.fstatSync(handle, { bigint: true }); if (stableStat(opened) !== stableStat(afterHandle)) throw new Error(`${label} changed while read.`);
  } finally { fs.closeSync(handle); }
  const after = fs.lstatSync(filename, { bigint: true }); if (after.isSymbolicLink() || stableStat(afterHandle) !== stableStat(after)) throw new Error(`${label} path changed while read.`);
  return { bytes, identity: identity(opened), statFingerprint: stableStat(opened) };
}
function verifiedBytes(filename, expectedHash, expectedLength, expectedIdentity, label) { const loaded = readExact(filename, expectedLength, label); if (expectedIdentity && !sameIdentity({ dev: loaded.identity.device, ino: loaded.identity.inode }, expectedIdentity)) throw new Error(`${label} identity drifted.`); if (sha(loaded.bytes) !== expectedHash) throw new Error(`${label} byte hash drifted.`); return { ...loaded, path: filename, byteHash: expectedHash, byteLength: expectedLength }; }
function strictHash(targetId, bytes) {
  if (targetId === 'sff-v1') { const report = assertSffV1Pcx8(bytes, null); return hashCanonical({ kind: report.kind, profile: report.profile, version: report.header.version, groupCount: report.header.groupCount, spriteCount: report.sprites.length }); }
  if (targetId === 'sff-v2.0') { const report = assertSffV20Raw8(bytes, null, { compatibilityProfile: 'canonical' }); return hashCanonical({ kind: report.kind, profile: report.profile, primaryVersion: report.primaryVersion, compatibleVersion: report.compatibleVersion, spriteCount: report.sprites.length, paletteCount: report.palettes.length }); }
  if (targetId === 'sff-v2.1') return hashCanonical(assertSffV21Png8(bytes, null, { compatibilityProfile: 'canonical' }));
  throw new Error(`No strict validator exists for ${targetId}.`);
}
function maybeFault(options, point) { if (typeof options.faultAt === 'function') options.faultAt(point); }

function executeCreatorAdoption(rawInput = {}, options = {}) {
  const input = closed(rawInput), rederived = approveCreatorExecutionLayoutPlan(input.executionLayoutApprovalInput), saved = decodeStrictJsonArtifact(input.executionLayoutApprovalReceiptArtifactBytes, 'Creator execution-layout approval receipt');
  const expected = { artifactHash: checkedHash(input.expectedExecutionLayoutApprovalReceiptArtifactByteHash, 'expectedExecutionLayoutApprovalReceiptArtifactByteHash'), receiptHash: checkedHash(input.expectedExecutionLayoutApprovalReceiptHash, 'expectedExecutionLayoutApprovalReceiptHash'), layoutHash: checkedHash(input.expectedExecutionLayoutPlanHash, 'expectedExecutionLayoutPlanHash'), adoptionHash: checkedHash(input.expectedAdoptionApprovalReceiptHash, 'expectedAdoptionApprovalReceiptHash'), persistedHash: checkedHash(input.expectedPersistedReceiptHash, 'expectedPersistedReceiptHash'), dispatchHash: checkedHash(input.expectedCandidateDispatchReceiptHash, 'expectedCandidateDispatchReceiptHash'), requestHash: checkedHash(input.expectedRequestHash, 'expectedRequestHash'), specificationHash: checkedHash(input.expectedSpecificationHash, 'expectedSpecificationHash'), sourceHash: checkedHash(input.expectedSourceSnapshotHash, 'expectedSourceSnapshotHash'), sourceValidationHash: checkedHash(input.expectedSourceValidationHash, 'expectedSourceValidationHash'), persistenceValidationHash: checkedHash(input.expectedPersistenceValidationHash, 'expectedPersistenceValidationHash'), candidateHash: checkedHash(input.expectedCandidateByteHash, 'expectedCandidateByteHash'), activeHash: checkedHash(input.expectedActiveByteHash, 'expectedActiveByteHash'), decisionHash: checkedHash(input.expectedExecutionLayoutApprovalDecisionHash, 'expectedExecutionLayoutApprovalDecisionHash') };
  if (sha(saved.bytes) !== expected.artifactHash || hashCanonical(saved.parsed) !== expected.receiptHash || rederived.receiptHash !== expected.receiptHash) throw new Error('Execution-layout approval artifact or retained receipt hash drifted.'); exact(saved.parsed, rederived.receipt, 'saved execution-layout approval receipt');
  const authority = rederived.receipt.authority;
  if (rederived.receipt.approvedExecutionLayoutPlanHash !== expected.layoutHash || authority.adoptionApprovalReceiptHash !== expected.adoptionHash || authority.persistedReceiptHash !== expected.persistedHash || authority.candidateDispatchReceiptHash !== expected.dispatchHash || authority.requestHash !== expected.requestHash || authority.specificationHash !== expected.specificationHash || authority.sourceSnapshotHash !== expected.sourceHash || authority.sourceValidationHash !== expected.sourceValidationHash || authority.persistenceValidationHash !== expected.persistenceValidationHash || rederived.receipt.candidate.byteHash !== expected.candidateHash || rederived.receipt.active.byteHash !== expected.activeHash || rederived.receipt.approvalDecisionHash !== expected.decisionHash || rederived.receipt.executionAuthorityGranted !== true || rederived.receipt.executionStarted !== false || rederived.receipt.writesCommitted !== false || rederived.receipt.adoptionCompleted !== false) throw new Error('Execution-layout approval is not exactly bound to retained executor authority.');
  const receipt = rederived.receipt, paths = receipt.paths, active = receipt.active, candidate = receipt.candidate, directory = receipt.activeDirectory.realpath, operationId = expected.receiptHash;
  let leaseCreated = false, leaseOwnership = null, leaseUncertain = false, journalUncertain = false, lastState = null, lastRecordHash = null, sequence = 0, replacementStarted = false, committed = false, backupPublished = false, backupVerified = false, rollbackAttempted = false, rollbackSucceeded = false, currentState = 'not-started';
  const directorySyncs = [], journalRecords = [], recoveryCleanupIssues = [], owned = new Map();
  const expectedLengths = new Map([[paths.destinationPath, Math.max(active.byteLength, candidate.byteLength)], [paths.backupPath, active.byteLength], [paths.backupPartialPath, active.byteLength], [paths.replacementTempPath, candidate.byteLength], [paths.rollbackHoldPath, active.byteLength], [paths.failedInstallHoldPath, candidate.byteLength], [paths.rollbackTempPath, active.byteLength]]);
  function observedPath(filename) {
    try {
      if (!pathExists(filename)) return { path: filename, exists: false, identity: null, byteHash: null, byteLength: null, observationError: null };
      const stat = fs.lstatSync(filename, { bigint: true }), safeLength = stat.size <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(stat.size) : null, maximum = expectedLengths.get(filename);
      if (!stat.isFile() || stat.isSymbolicLink() || safeLength == null || (Number.isSafeInteger(maximum) && safeLength > maximum)) return { path: filename, exists: true, identity: identity(stat), byteHash: null, byteLength: safeLength, observationError: !stat.isFile() || stat.isSymbolicLink() ? 'not-a-non-link-regular-file' : 'unexpected-or-unsupported-length' };
      const loaded = readExact(filename, safeLength, 'journal observation'); return { path: filename, exists: true, identity: loaded.identity, byteHash: sha(loaded.bytes), byteLength: loaded.bytes.length, observationError: null };
    } catch (error) { return { path: filename, exists: null, identity: null, byteHash: null, byteLength: null, observationError: String(error?.message || error).slice(0, 1000) }; }
  }
  function rememberOwned(filename, verified) { owned.set(filename, { byteHash: verified.byteHash, byteLength: verified.byteLength, identity: verified.identity }); return verified; }
  function removeOwned(filename, label) { const expectedOwned = owned.get(filename); if (!expectedOwned) throw new Error(`${label} is not owned by this operation.`); verifiedBytes(filename, expectedOwned.byteHash, expectedOwned.byteLength, expectedOwned.identity, label); fs.unlinkSync(filename); owned.delete(filename); }
  function writeOwnedExclusive(filename, bytes, expectedHash, expectedLength, label) {
    try { writeExclusive(filename, bytes); }
    catch (error) {
      if (pathExists(filename)) { try { rememberOwned(filename, verifiedBytes(filename, expectedHash, expectedLength, null, label)); } catch (verifyError) { recoveryCleanupIssues.push(`${path.basename(filename)}:${String(verifyError?.message || verifyError).slice(0, 1000)}`); } }
      throw error;
    }
    return rememberOwned(filename, verifiedBytes(filename, expectedHash, expectedLength, null, label));
  }
  function journal(state) {
    const allowed = lastState == null ? state === 'prepared' : (receipt.stateMachine.transitions[lastState] || []).includes(state); if (!allowed) throw new Error(`Execution journal transition ${lastState || '(start)'} -> ${state} is not approved.`);
    const observedPaths = Object.fromEntries(['destinationPath', 'backupPath', 'replacementTempPath', 'rollbackHoldPath', 'failedInstallHoldPath', 'rollbackTempPath'].map((name) => [name, observedPath(paths[name])]));
    const record = { schema: receipt.stateMachine.journalRecordContract.schema, version: receipt.stateMachine.journalRecordContract.version, operationId, layoutApprovalReceiptHash: expected.receiptHash, sequence, state, previousState: lastState, previousRecordHash: lastRecordHash, observedPaths };
    record.recordHash = hashCanonical({ ...record, recordHash: undefined }); const bytes = Buffer.from(`${JSON.stringify(record)}\n`), filename = paths.journalPaths[state];
    try { writeExclusive(filename, bytes); const reopened = verifiedBytes(filename, sha(bytes), bytes.length, null, `journal record ${state}`); lastState = state; lastRecordHash = record.recordHash; sequence += 1; currentState = state; journalRecords.push({ state, sequence: record.sequence, recordHash: record.recordHash, fileByteHash: reopened.byteHash, path: filename }); directorySyncs.push({ state, status: syncDirectory(directory) }); journalUncertain = false; }
    catch (error) { if (pathExists(filename)) journalUncertain = true; throw error; }
    return record;
  }
  function cleanupLease() { if (!leaseCreated) return; if (!pathExists(paths.leasePath)) throw new Error('Execution lease disappeared before terminal release.'); verifiedBytes(paths.leasePath, leaseOwnership.byteHash, leaseOwnership.byteLength, leaseOwnership.identity, 'execution lease'); fs.unlinkSync(paths.leasePath); leaseCreated = false; directorySyncs.push({ state: 'lease-released', status: syncDirectory(directory) }); }
  function recoveryReceipt(error, manualRecoveryRequired) { return deepFreeze({ schema: 'ikemaker.sff-creator-execution-recovery-receipt', version: 1, operationId, executionLayoutApprovalReceiptHash: expected.receiptHash, state: currentState, error: String(error?.message || error).slice(0, 4000), rollbackAttempted, rollbackSucceeded, manualRecoveryRequired, leaseUncertain, journalUncertain, active: observedPath(paths.destinationPath), backup: observedPath(paths.backupPath), rollbackHold: observedPath(paths.rollbackHoldPath), failedInstallHold: observedPath(paths.failedInstallHoldPath), journalRecords, directorySyncs, cleanupIssues: recoveryCleanupIssues, adoptionCompleted: false, byteEqualityRequired: false }); }
  function rollback(cause) {
    rollbackAttempted = true;
    try {
      if (lastState !== 'rollback_started') journal('rollback_started'); maybeFault(options, 'rollback_started');
      let activeKind = 'absent', activeCapture = null;
      if (pathExists(paths.destinationPath)) {
        try { activeCapture = verifiedBytes(paths.destinationPath, expected.activeHash, active.byteLength, active.identity, 'unchanged active archive'); activeKind = 'original'; }
        catch (_) { try { activeCapture = verifiedBytes(paths.destinationPath, expected.candidateHash, candidate.byteLength, null, 'failed installed candidate'); activeKind = 'candidate'; } catch (error) { throw new Error(`Active destination is neither the approved original nor candidate: ${error.message}`); } }
      }
      let holdGood = false;
      if (pathExists(paths.rollbackHoldPath)) { try { verifiedBytes(paths.rollbackHoldPath, expected.activeHash, active.byteLength, null, 'rollback hold'); holdGood = true; } catch (_) { holdGood = false; } }
      if (activeKind === 'candidate') { if (pathExists(paths.failedInstallHoldPath)) throw new Error('failedInstallHoldPath became occupied.'); maybeFault(options, 'before_failed_install_hold'); fs.renameSync(paths.destinationPath, paths.failedInstallHoldPath); const failed = verifiedBytes(paths.failedInstallHoldPath, expected.candidateHash, activeCapture.byteLength, null, 'failed install hold'); rememberOwned(paths.failedInstallHoldPath, failed); journal('failed_install_held'); activeKind = 'absent'; }
      if (activeKind === 'original') { journal('active_restored'); journal('rolled_back'); rollbackSucceeded = true; cleanupLease(); return recoveryReceipt(cause, false); }
      let restorePath = paths.rollbackHoldPath;
      if (!holdGood) { const backup = verifiedBytes(paths.backupPath, expected.activeHash, active.byteLength, null, 'durable backup'); if (pathExists(paths.rollbackTempPath)) throw new Error('rollbackTempPath became occupied.'); writeOwnedExclusive(paths.rollbackTempPath, backup.bytes, expected.activeHash, active.byteLength, 'rollback temp'); restorePath = paths.rollbackTempPath; }
      maybeFault(options, 'before_rollback_restore'); fs.renameSync(restorePath, paths.destinationPath); owned.delete(restorePath); verifiedBytes(paths.destinationPath, expected.activeHash, active.byteLength, null, 'restored active archive'); journal('active_restored'); journal('rolled_back'); rollbackSucceeded = true; cleanupLease(); return recoveryReceipt(cause, false);
    } catch (rollbackError) {
      try { if ((receipt.stateMachine.transitions[lastState] || []).includes('manual_recovery_required')) journal('manual_recovery_required'); } catch (_) {}
      try { cleanupLease(); } catch (_) {}
      const combined = new Error(`${cause.message} Rollback failed: ${rollbackError.message}`); combined.recoveryReceipt = recoveryReceipt(combined, true); throw combined;
    }
  }
  try {
    const inventoryBeforeLease = fs.readdirSync(directory).map(platformKey).sort();
    const leaseBytes = Buffer.from(`${JSON.stringify({ schema: 'ikemaker.sff-creator-execution-lease', version: 1, operationId, layoutApprovalReceiptHash: expected.receiptHash })}\n`);
    try { writeExclusive(paths.leasePath, leaseBytes); leaseOwnership = verifiedBytes(paths.leasePath, sha(leaseBytes), leaseBytes.length, null, 'execution lease'); leaseCreated = true; }
    catch (error) { if (pathExists(paths.leasePath)) { try { leaseOwnership = verifiedBytes(paths.leasePath, sha(leaseBytes), leaseBytes.length, null, 'partial execution lease'); leaseCreated = true; } catch (_) { leaseUncertain = true; } } throw error; }
    directorySyncs.push({ state: 'lease-acquired', status: syncDirectory(directory) });
    const inventoryAfterLease = fs.readdirSync(directory).map(platformKey).sort(), expectedAfterLease = [...inventoryBeforeLease, platformKey(path.basename(paths.leasePath))].sort(); if (JSON.stringify(inventoryAfterLease) !== JSON.stringify(expectedAfterLease)) throw new Error('Active-directory inventory drifted while the execution lease was acquired.');
    maybeFault(options, 'after_lease');
    const dirStat = fs.statSync(directory, { bigint: true }); if (!sameIdentity(dirStat, receipt.activeDirectory.identity) || String(dirStat.dev) !== String(receipt.activeDirectory.device)) throw new Error('Active directory identity/device drifted after lease acquisition.');
    const activeNow = verifiedBytes(paths.destinationPath, expected.activeHash, active.byteLength, active.identity, 'active archive'), candidateNow = verifiedBytes(candidate.path, expected.candidateHash, candidate.byteLength, candidate.identity, 'persisted candidate');
    if (strictHash(candidate.targetId, candidateNow.bytes) !== candidate.strictReportHash) throw new Error('Persisted candidate strict validation drifted after lease acquisition.');
    for (const filename of [paths.backupPath, paths.backupPartialPath, paths.replacementTempPath, paths.rollbackHoldPath, paths.failedInstallHoldPath, paths.rollbackTempPath, ...Object.values(paths.journalPaths)]) if (pathExists(filename)) throw new Error(`Approved execution path became occupied: ${filename}`);
    journal('prepared'); maybeFault(options, 'prepared');
    const backupPartial = writeOwnedExclusive(paths.backupPartialPath, activeNow.bytes, expected.activeHash, active.byteLength, 'backup partial'); maybeFault(options, 'backup_partial_verified'); fs.linkSync(paths.backupPartialPath, paths.backupPath); backupPublished = true; directorySyncs.push({ state: 'backup-published', status: syncDirectory(directory) }); verifiedBytes(paths.backupPath, expected.activeHash, active.byteLength, null, 'durable backup'); backupVerified = true; removeOwned(paths.backupPartialPath, 'backup partial cleanup'); journal('backup_verified'); maybeFault(options, 'backup_verified');
    const staged = writeOwnedExclusive(paths.replacementTempPath, candidateNow.bytes, expected.candidateHash, candidate.byteLength, 'staged candidate'); if (strictHash(candidate.targetId, staged.bytes) !== candidate.strictReportHash) throw new Error('Staged candidate strict validation drifted.'); journal('candidate_staged'); maybeFault(options, 'candidate_staged');
    if (options.signal?.aborted) { journal('aborted_before_replacement'); removeOwned(paths.replacementTempPath, 'cancelled staged candidate'); cleanupLease(); const abortedReceipt = deepFreeze({ schema: 'ikemaker.sff-creator-transactional-execution-receipt', version: 1, status: 'aborted-before-replacement', operationId, executionLayoutApprovalReceiptHash: expected.receiptHash, terminalState: currentState, terminalJournalHash: lastRecordHash, journalRecords, directorySyncs, backup: observedPath(paths.backupPath), backupCreated: true, replacementCommitted: false, adoptionCompleted: false, activeArchiveModified: false, historyAppended: false, byteEqualityRequired: false }); return deepFreeze({ receipt: abortedReceipt, receiptHash: hashCanonical(abortedReceipt) }); }
    journal('replacement_started'); replacementStarted = true; maybeFault(options, 'replacement_started');
    if (pathExists(paths.rollbackHoldPath)) throw new Error('rollbackHoldPath became occupied.'); fs.renameSync(paths.destinationPath, paths.rollbackHoldPath); const rollbackHold = verifiedBytes(paths.rollbackHoldPath, expected.activeHash, active.byteLength, null, 'rollback hold'); rememberOwned(paths.rollbackHoldPath, rollbackHold); if (pathExists(paths.destinationPath)) throw new Error('Active destination still exists after hold move.'); journal('active_held'); maybeFault(options, 'active_held');
    maybeFault(options, 'before_candidate_install'); fs.renameSync(paths.replacementTempPath, paths.destinationPath); owned.delete(paths.replacementTempPath); const installed = verifiedBytes(paths.destinationPath, expected.candidateHash, candidate.byteLength, null, 'installed candidate'); journal('candidate_installed'); maybeFault(options, 'candidate_installed');
    if (strictHash(candidate.targetId, installed.bytes) !== candidate.strictReportHash) throw new Error('Installed candidate strict validation drifted.'); journal('installed_verified'); maybeFault(options, 'installed_verified'); journal('committed'); committed = true;
    const cleanupIssues = [];
    try { if (pathExists(paths.rollbackHoldPath)) removeOwned(paths.rollbackHoldPath, 'committed rollback hold cleanup'); } catch (error) { cleanupIssues.push(`rollback-hold:${error.message}`); }
    if (!cleanupIssues.length) { try { journal('cleanup_complete'); } catch (error) { cleanupIssues.push(`cleanup-journal:${error.message}`); } }
    try { cleanupLease(); } catch (error) { cleanupIssues.push(`lease:${error.message}`); }
    const finalBackup = verifiedBytes(paths.backupPath, expected.activeHash, active.byteLength, null, 'final durable backup'), finalInstalled = verifiedBytes(paths.destinationPath, expected.candidateHash, candidate.byteLength, null, 'final installed candidate'); if (strictHash(candidate.targetId, finalInstalled.bytes) !== candidate.strictReportHash) throw new Error('Final installed candidate strict validation drifted.');
    const executionReceipt = deepFreeze({ schema: 'ikemaker.sff-creator-transactional-execution-receipt', version: 1, status: cleanupIssues.length ? 'committed-cleanup-required' : 'committed', operationId, executionLayoutApprovalReceiptArtifactByteHash: expected.artifactHash, executionLayoutApprovalReceiptHash: expected.receiptHash, executionLayoutPlanHash: expected.layoutHash, authority, replacementProfile: receipt.replacementProfile, acknowledgedRiskIds: receipt.acknowledgedRiskIds, backup: { path: paths.backupPath, exists: true, identity: finalBackup.identity, byteHash: finalBackup.byteHash, byteLength: finalBackup.byteLength }, installed: { path: paths.destinationPath, exists: true, identity: finalInstalled.identity, byteHash: finalInstalled.byteHash, byteLength: finalInstalled.byteLength, strictReportHash: candidate.strictReportHash }, terminalState: currentState, terminalJournalHash: lastRecordHash, journalRecords, directorySyncs, cleanupIssues, directoryDurabilityGuaranteed: false, backupCreated: true, replacementCommitted: true, adoptionCompleted: true, activeArchiveModified: true, rollbackAvailableFromBackup: true, historyAppended: false, byteEqualityRequired: false });
    return deepFreeze({ receipt: executionReceipt, receiptHash: hashCanonical(executionReceipt) });
  } catch (error) {
    if (replacementStarted && !committed) { const recovered = rollback(error); const wrapped = new Error(`${error.message} Active archive was rolled back.`); wrapped.recoveryReceipt = recovered; wrapped.recoveryReceiptHash = hashCanonical(recovered); throw wrapped; }
    if (committed) { try { cleanupLease(); } catch (_) {} const wrapped = new Error(`${error.message} Candidate installation was already committed; cleanup or receipt recovery is required.`); wrapped.recoveryReceipt = recoveryReceipt(wrapped, true); wrapped.recoveryReceiptHash = hashCanonical(wrapped.recoveryReceipt); throw wrapped; }
    for (const filename of [paths.backupPartialPath, paths.replacementTempPath]) { try { if (owned.has(filename) && pathExists(filename)) removeOwned(filename, 'pre-replacement owned cleanup'); } catch (cleanupError) { recoveryCleanupIssues.push(`${path.basename(filename)}:${String(cleanupError?.message || cleanupError).slice(0, 1000)}`); } }
    let manualRecoveryRequired = recoveryCleanupIssues.length > 0 || leaseUncertain || journalUncertain || (backupPublished && !backupVerified);
    try { const wanted = manualRecoveryRequired ? 'manual_recovery_required' : 'aborted_before_replacement'; if (lastState && (receipt.stateMachine.transitions[lastState] || []).includes(wanted)) journal(wanted); } catch (journalError) { recoveryCleanupIssues.push(`terminal-journal:${String(journalError?.message || journalError).slice(0, 1000)}`); manualRecoveryRequired = true; }
    try { cleanupLease(); } catch (leaseError) { recoveryCleanupIssues.push(`lease:${String(leaseError?.message || leaseError).slice(0, 1000)}`); manualRecoveryRequired = true; }
    error.recoveryReceipt = recoveryReceipt(error, manualRecoveryRequired); error.recoveryReceiptHash = hashCanonical(error.recoveryReceipt); throw error;
  }
}

module.exports = { executeCreatorAdoption };
