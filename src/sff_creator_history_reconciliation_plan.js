'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { types: utilTypes } = require('util');
const { decodeStrictJsonArtifact } = require('./sff_strict_json_artifact');
const { canonicalize, hashCanonical } = require('./sff_capability_report');
const { assertSffV1Pcx8 } = require('./sff_v1_pcx8_strict_validator');
const { assertSffV20Raw8 } = require('./sff_v20_strict_validator');
const { assertSffV21Mixed: assertSffV21Png8 } = require('./sff_v21_mixed_strict_validator');

const SHA256 = /^[0-9a-f]{64}$/;
const INPUT_KEYS = Object.freeze(['executionLayoutApprovalReceiptArtifactBytes', 'expectedActiveByteHash', 'expectedActiveByteLength', 'expectedActiveIdentity', 'expectedAdoptionApprovalReceiptHash', 'expectedAdoptionPlanArtifactByteHash', 'expectedApprovedObservationPlanHash', 'expectedCandidateByteHash', 'expectedCandidateByteLength', 'expectedCandidateDispatchReceiptHash', 'expectedCandidateStrictReportHash', 'expectedCandidateTargetId', 'expectedCapabilitySnapshotHash', 'expectedExecutionLayoutApprovalDecisionHash', 'expectedExecutionLayoutApprovalReceiptArtifactByteHash', 'expectedExecutionLayoutApprovalReceiptHash', 'expectedExecutionLayoutPlanArtifactByteHash', 'expectedExecutionLayoutPlanHash', 'expectedHistoryRoot', 'expectedLogicalHash', 'expectedOperationId', 'expectedPersistedReceiptArtifactByteHash', 'expectedPersistedReceiptHash', 'expectedPersistenceValidationHash', 'expectedProjectionApprovalReceiptHash', 'expectedRequestHash', 'expectedSourceSnapshotHash', 'expectedSourceValidationHash', 'expectedSpecificationHash', 'expectedTerminalReceiptArtifactByteHash', 'expectedTerminalReceiptHash', 'terminalReceiptArtifactBytes']);
const ROOT_KEYS = Object.freeze(['device', 'identity', 'path', 'realpath']);
const JOURNAL_FIELDS = Object.freeze(['layoutApprovalReceiptHash', 'observedPaths', 'operationId', 'previousRecordHash', 'previousState', 'recordHash', 'schema', 'sequence', 'state', 'version']);
const REQUIRED_JOURNAL_FIELDS = Object.freeze(['schema', 'version', 'operationId', 'layoutApprovalReceiptHash', 'sequence', 'state', 'previousState', 'previousRecordHash', 'observedPaths', 'recordHash']);
const OBSERVED_FIELDS = Object.freeze(['byteHash', 'byteLength', 'exists', 'identity', 'observationError', 'path']);
const OBSERVED_NAMES = Object.freeze(['destinationPath', 'backupPath', 'replacementTempPath', 'rollbackHoldPath', 'failedInstallHoldPath', 'rollbackTempPath']);
const OUTCOMES = Object.freeze(['committed', 'committed-cleanup-required', 'rolled_back', 'aborted-before-replacement', 'manual_recovery_required']);
const LAYOUT_KEYS = Object.freeze(['acknowledgedRiskIds', 'active', 'activeArchiveModified', 'activeDirectory', 'adoptionCompleted', 'approvalDecisionHash', 'authority', 'byteEqualityRequired', 'candidate', 'confirmations', 'currentStateGuaranteed', 'directoryObservationHash', 'executionAuthorityGranted', 'executionLayoutApproved', 'executionLayoutPlanArtifactByteHash', 'executionStarted', 'executorContract', 'paths', 'replacementProfile', 'rollback', 'schema', 'stateMachine', 'stateMachineHash', 'status', 'version', 'writesCommitted', 'approvedExecutionLayoutPlanHash']);
const EXECUTION_COMMITTED_KEYS = Object.freeze(['acknowledgedRiskIds', 'activeArchiveModified', 'adoptionCompleted', 'authority', 'backup', 'backupCreated', 'byteEqualityRequired', 'cleanupIssues', 'directoryDurabilityGuaranteed', 'directorySyncs', 'executionLayoutApprovalReceiptArtifactByteHash', 'executionLayoutApprovalReceiptHash', 'executionLayoutPlanHash', 'historyAppended', 'installed', 'journalRecords', 'operationId', 'replacementCommitted', 'replacementProfile', 'rollbackAvailableFromBackup', 'schema', 'status', 'terminalJournalHash', 'terminalState', 'version']);
const EXECUTION_ABORTED_KEYS = Object.freeze(['activeArchiveModified', 'adoptionCompleted', 'backup', 'backupCreated', 'byteEqualityRequired', 'directorySyncs', 'executionLayoutApprovalReceiptHash', 'historyAppended', 'journalRecords', 'operationId', 'replacementCommitted', 'schema', 'status', 'terminalJournalHash', 'terminalState', 'version']);
const RECOVERY_KEYS = Object.freeze(['active', 'adoptionCompleted', 'backup', 'byteEqualityRequired', 'cleanupIssues', 'directorySyncs', 'error', 'executionLayoutApprovalReceiptHash', 'failedInstallHold', 'journalRecords', 'journalUncertain', 'leaseUncertain', 'manualRecoveryRequired', 'operationId', 'rollbackAttempted', 'rollbackHold', 'rollbackSucceeded', 'schema', 'state', 'version']);
const AUTHORITY_KEYS = Object.freeze(['adoptionApprovalDecisionHash', 'adoptionApprovalReceiptHash', 'adoptionPlanArtifactByteHash', 'approvedObservationPlanHash', 'candidateDispatchReceiptHash', 'capabilitySnapshotHash', 'logicalHash', 'persistedReceiptArtifactByteHash', 'persistedReceiptHash', 'persistenceValidationHash', 'projectionApprovalReceiptHash', 'requestHash', 'sourceSnapshotHash', 'sourceValidationHash', 'specificationHash']);
const CANDIDATE_KEYS = Object.freeze(['byteHash', 'byteLength', 'identity', 'path', 'strictReportHash', 'targetId', 'validatorId', 'validatorVersion']);
const ACTIVE_KEYS = Object.freeze(['byteHash', 'byteLength', 'driftedSincePersistence', 'identity', 'inspectionStatus', 'inspectionTargetId', 'path', 'realpath', 'recognizedVersion']);
const PATH_KEYS = Object.freeze(['backupPartialPath', 'backupPath', 'destinationPath', 'failedInstallHoldPath', 'journalPaths', 'leasePath', 'replacementTempPath', 'rollbackHoldPath', 'rollbackTempPath']);
const STATE_MACHINE_KEYS = Object.freeze(['cancellationAfterReplacementStarted', 'cancellationBeforeReplacementStarted', 'id', 'journalRecordContract', 'rollbackPreference', 'states', 'transitions', 'version']);
const JOURNAL_CONTRACT_KEYS = Object.freeze(['appendOnlyExclusiveCreate', 'directorySyncAfterRecord', 'firstPreviousRecordHash', 'firstPreviousState', 'hashAlgorithm', 'hashChained', 'observedPathFields', 'requiredFields', 'schema', 'version']);

function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(deepFreeze); return value; }
function closed(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Buffer.isBuffer(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain non-proxy object.`);
  const descriptors = Object.getOwnPropertyDescriptors(value), found = Object.keys(descriptors).sort();
  if (Object.getOwnPropertySymbols(value).length || JSON.stringify(found) !== JSON.stringify([...keys].sort())) throw new Error(`${label} must contain exactly the reviewed fields.`);
  for (const key of found) if (!descriptors[key].enumerable || !Object.prototype.hasOwnProperty.call(descriptors[key], 'value')) throw new Error(`${label}.${key} must be an enumerable data property, not an accessor.`);
  return Object.fromEntries(found.map((key) => [key, descriptors[key].value]));
}
function checkedHash(value, label) { if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(`${label} must be a lowercase SHA-256 hash.`); return value; }
function identity(stat) { return { device: String(stat.dev), inode: String(stat.ino) }; }
function fingerprint(stat) { return [String(stat.dev), String(stat.ino), String(stat.size), String(stat.mtimeNs ?? stat.mtimeMs), String(stat.ctimeNs ?? stat.ctimeMs)].join(':'); }
function exact(left, right, label) { if (JSON.stringify(canonicalize(left, label)) !== JSON.stringify(canonicalize(right, label))) throw new Error(`${label} does not exactly match retained authority.`); }
function samePath(a, b) { const x = path.resolve(a), y = path.resolve(b); return process.platform === 'win32' || process.platform === 'darwin' ? x.toLowerCase() === y.toLowerCase() : x === y; }
function beneath(parent, child) { const relative = path.relative(path.resolve(parent), path.resolve(child)); return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)); }
function safeLeaf(root, name) { if (!/^[A-Za-z0-9._-]{1,220}$/.test(name) || path.basename(name) !== name) throw new Error('Derived history basename is unsafe.'); const value = path.join(root, name); if (path.dirname(value) !== root) throw new Error('Derived history path escaped its root.'); return value; }
function assertNoLinkAncestors(filename) {
  const resolved = path.resolve(filename), parsed = path.parse(resolved); let cursor = parsed.root;
  for (const part of resolved.slice(parsed.root.length).split(path.sep).filter(Boolean)) { cursor = path.join(cursor, part); const stat = fs.lstatSync(cursor, { bigint: true }); if (stat.isSymbolicLink()) throw new Error(`History root ancestor is a link: ${cursor}`); }
}
function readNoFollow(filename, maximum, label) {
  let handle;
  const before = fs.lstatSync(filename, { bigint: true });
  if (before.isSymbolicLink() || !before.isFile()) throw new Error(`${label} must be a non-link regular file.`);
  if (before.size > BigInt(maximum) || before.size > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${label} exceeds its approved read bound.`);
  try {
    handle = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const opened = fs.fstatSync(handle, { bigint: true });
    if (!opened.isFile() || fingerprint(opened) !== fingerprint(before)) throw new Error(`${label} changed before read.`);
    const bytes = Buffer.alloc(Number(opened.size)); let offset = 0;
    while (offset < bytes.length) { const count = fs.readSync(handle, bytes, offset, bytes.length - offset, offset); if (!count) throw new Error(`${label} ended early.`); offset += count; }
    const after = fs.fstatSync(handle, { bigint: true });
    if (fingerprint(after) !== fingerprint(opened)) throw new Error(`${label} changed while read.`);
    const finalPath = fs.lstatSync(filename, { bigint: true }); if (finalPath.isSymbolicLink() || fingerprint(finalPath) !== fingerprint(opened)) throw new Error(`${label} path changed after read.`);
    return { bytes, identity: identity(opened), byteLength: bytes.length, byteHash: sha(bytes), fingerprint: fingerprint(opened) };
  } finally { if (handle !== undefined) fs.closeSync(handle); }
}
function observe(filename, maximum, expectedHash, expectedLength) {
  try {
    const stat = fs.lstatSync(filename, { bigint: true });
    if (stat.isSymbolicLink() || !stat.isFile()) return { path: filename, status: 'error', exists: true, identity: identity(stat), byteHash: null, byteLength: stat.size <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(stat.size) : null, error: 'not-a-non-link-regular-file' };
    if (stat.size > BigInt(maximum) || stat.size > BigInt(Number.MAX_SAFE_INTEGER)) return { path: filename, status: 'drifted', exists: true, identity: identity(stat), byteHash: null, byteLength: stat.size <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(stat.size) : null, error: 'read-bound-exceeded' };
    const read = readNoFollow(filename, maximum, 'reconciliation path');
    const matched = expectedHash != null && read.byteHash === expectedHash && expectedLength != null && read.byteLength === expectedLength;
    return { path: filename, status: matched ? 'matched' : 'drifted', exists: true, identity: read.identity, byteHash: read.byteHash, byteLength: read.byteLength, error: null };
  } catch (error) {
    if (error && error.code === 'ENOENT') return { path: filename, status: 'missing', exists: false, identity: null, byteHash: null, byteLength: null, error: null };
    return { path: filename, status: 'error', exists: null, identity: null, byteHash: null, byteLength: null, error: String(error?.message || error).slice(0, 1000) };
  }
}
function sealDirectory(filename, label) { const link = fs.lstatSync(filename, { bigint: true }); if (link.isSymbolicLink() || !link.isDirectory()) throw new Error(`${label} must be a non-link directory.`); const realpath = fs.realpathSync.native(filename), stat = fs.statSync(realpath, { bigint: true }); if (!stat.isDirectory()) throw new Error(`${label} realpath is not a directory.`); return { path: filename, realpath, identity: identity(stat), device: String(stat.dev), fingerprint: fingerprint(stat) }; }
function recheckDirectory(seal, label) { const current = sealDirectory(seal.path, label); if (!samePath(current.realpath, seal.realpath) || current.fingerprint !== seal.fingerprint) throw new Error(`${label} changed during reconciliation.`); }
function terminalOutcome(receipt) {
  if (receipt.schema === 'ikemaker.sff-creator-transactional-execution-receipt') {
    if (!['committed', 'committed-cleanup-required', 'aborted-before-replacement'].includes(receipt.status)) throw new Error('Terminal execution receipt has an unsupported status.');
    if (receipt.byteEqualityRequired !== false || receipt.historyAppended !== false) throw new Error('Terminal execution receipt must retain false byte-equality and history flags.');
    if (receipt.status === 'aborted-before-replacement' && (receipt.terminalState !== 'aborted_before_replacement' || receipt.replacementCommitted !== false || receipt.adoptionCompleted !== false || receipt.activeArchiveModified !== false || receipt.backupCreated !== true || receipt.backup?.exists !== true)) throw new Error('Terminal execution receipt contradicts its aborted outcome.');
    if (receipt.status.startsWith('committed') && (!['committed', 'cleanup_complete'].includes(receipt.terminalState) || receipt.replacementCommitted !== true || receipt.adoptionCompleted !== true || receipt.activeArchiveModified !== true || receipt.backupCreated !== true || receipt.rollbackAvailableFromBackup !== true || !Array.isArray(receipt.cleanupIssues))) throw new Error('Terminal execution receipt contradicts its committed outcome.');
    if (receipt.status === 'committed' && (receipt.terminalState !== 'cleanup_complete' || receipt.cleanupIssues.length !== 0)) throw new Error('Committed receipt must agree with clean terminal state.');
    if (receipt.status === 'committed-cleanup-required' && receipt.cleanupIssues.length === 0) throw new Error('Cleanup-required receipt must retain a cleanup issue.');
    return receipt.status;
  }
  if (receipt.schema !== 'ikemaker.sff-creator-execution-recovery-receipt') throw new Error('Unsupported terminal receipt schema.');
  for (const key of ['rollbackAttempted', 'rollbackSucceeded', 'manualRecoveryRequired', 'leaseUncertain', 'journalUncertain', 'adoptionCompleted', 'byteEqualityRequired']) if (typeof receipt[key] !== 'boolean') throw new Error(`Recovery receipt ${key} must be boolean.`);
  if (receipt.adoptionCompleted !== false || receipt.byteEqualityRequired !== false || receipt.rollbackSucceeded && !receipt.rollbackAttempted || receipt.rollbackSucceeded && receipt.manualRecoveryRequired) throw new Error('Recovery receipt contains mutually contradictory flags.');
  if (receipt.manualRecoveryRequired === true && ['committed', 'cleanup_complete'].includes(receipt.state)) return 'committed-cleanup-required';
  if (receipt.manualRecoveryRequired === true) return 'manual_recovery_required';
  if (receipt.rollbackSucceeded === true) { if (receipt.rollbackAttempted !== true || receipt.state !== 'rolled_back') throw new Error('Rollback receipt contradicts its terminal outcome.'); return 'rolled_back'; }
  if (receipt.state === 'aborted_before_replacement' && receipt.rollbackAttempted === false) return 'aborted-before-replacement';
  throw new Error('Recovery receipt is non-terminal or internally contradictory.');
}
function strictArchiveHash(targetId, value) {
  if (targetId === 'sff-v1') { const report = assertSffV1Pcx8(value, null); return hashCanonical({ kind: report.kind, profile: report.profile, version: report.header.version, groupCount: report.header.groupCount, spriteCount: report.sprites.length }); }
  if (targetId === 'sff-v2.0') { const report = assertSffV20Raw8(value, null, { compatibilityProfile: 'canonical' }); return hashCanonical({ kind: report.kind, profile: report.profile, primaryVersion: report.primaryVersion, compatibleVersion: report.compatibleVersion, spriteCount: report.sprites.length, paletteCount: report.palettes.length }); }
  if (targetId === 'sff-v2.1') return hashCanonical(assertSffV21Png8(value, null, { compatibilityProfile: 'canonical' }));
  return null;
}
function probeOldArchive(value) { const reports = []; for (const targetId of ['sff-v1', 'sff-v2.0', 'sff-v2.1']) { try { reports.push({ targetId, reportHash: strictArchiveHash(targetId, value) }); } catch (_) {} } return { status: reports.length === 1 ? 'recognized' : reports.length === 0 ? 'unknown' : 'ambiguous', targetIds: reports.map((row) => row.targetId), reports }; }
function validateStateMachine(layout) {
  const machine = closed(layout.stateMachine, STATE_MACHINE_KEYS, 'layout.stateMachine'), contract = closed(machine.journalRecordContract, JOURNAL_CONTRACT_KEYS, 'layout.stateMachine.journalRecordContract');
  if (layout.stateMachineHash !== hashCanonical(machine) || machine.id !== 'ikemaker.sff-portable-two-rename-recovery' || machine.version !== 1 || !Array.isArray(machine.states) || new Set(machine.states).size !== machine.states.length) throw new Error('Layout state machine or retained hash is invalid.');
  closed(machine.transitions, machine.states, 'layout.stateMachine.transitions'); for (const state of machine.states) if (!Array.isArray(machine.transitions[state]) || machine.transitions[state].some((next) => !machine.states.includes(next))) throw new Error('Layout state transitions are malformed.');
  if (contract.schema !== 'ikemaker.sff-creator-execution-journal-record' || contract.version !== 1 || contract.appendOnlyExclusiveCreate !== true || contract.directorySyncAfterRecord !== true || contract.hashAlgorithm !== 'sha256-canonical-json' || contract.hashChained !== true || contract.firstPreviousState !== null || contract.firstPreviousRecordHash !== null || JSON.stringify(contract.requiredFields) !== JSON.stringify(REQUIRED_JOURNAL_FIELDS) || JSON.stringify(contract.observedPathFields) !== JSON.stringify(['path', 'exists', 'identity', 'byteHash', 'byteLength'])) throw new Error('Layout journal contract is invalid.');
}
function validateObserved(value, expectedPath, label) {
  const row = closed(value, OBSERVED_FIELDS, label); if (row.path !== expectedPath || ![true, false, null].includes(row.exists)) throw new Error(`${label} has an invalid path or exists value.`);
  if (row.exists === false && (row.identity !== null || row.byteHash !== null || row.byteLength !== null || row.observationError !== null)) throw new Error(`${label} absent semantics are invalid.`);
  if (row.exists === null && (row.identity !== null || row.byteHash !== null || row.byteLength !== null || typeof row.observationError !== 'string' || !row.observationError || row.observationError.length > 1000)) throw new Error(`${label} unknown semantics are invalid.`);
  if (row.exists === true) {
    const ident = closed(row.identity, ['device', 'inode'], `${label}.identity`); if (typeof ident.device !== 'string' || typeof ident.inode !== 'string') throw new Error(`${label} identity is invalid.`);
    if (row.byteLength !== null && (!Number.isSafeInteger(row.byteLength) || row.byteLength < 0) || row.byteHash !== null && (typeof row.byteHash !== 'string' || !SHA256.test(row.byteHash)) || row.observationError !== null && (typeof row.observationError !== 'string' || !row.observationError || row.observationError.length > 1000)) throw new Error(`${label} observation values are invalid.`);
    if (row.observationError === null && (row.byteHash === null || row.byteLength === null)) throw new Error(`${label} successful observation lacks hash or length.`);
    if (row.observationError !== null && row.byteHash !== null) throw new Error(`${label} failed observation cannot retain a byte hash.`);
  }
}
function journalChain(layout, terminal) {
  if (!Array.isArray(terminal.journalRecords) || !terminal.journalRecords.length) throw new Error('Terminal receipt must retain a non-empty journal summary.');
  const directory = layout.activeDirectory.realpath, approved = layout.paths.journalPaths, approvedFolded = new Set(Object.values(approved).map((filename) => path.basename(filename).toLowerCase())), existing = fs.readdirSync(directory).filter((name) => approvedFolded.has(name.toLowerCase()));
  const rows = [], seenStates = new Set(); let previousState = null, previousHash = null;
  for (let sequence = 0; sequence < terminal.journalRecords.length; sequence += 1) {
    const summary = terminal.journalRecords[sequence];
    closed(summary, ['fileByteHash', 'path', 'recordHash', 'sequence', 'state'], `terminal journal summary ${sequence}`);
    if (summary.sequence !== sequence || typeof summary.state !== 'string' || summary.path !== approved[summary.state] || seenStates.has(summary.state)) throw new Error('Terminal journal summary has a gap, duplicate, invalid state, or unapproved path.'); seenStates.add(summary.state);
    checkedHash(summary.fileByteHash, 'journal fileByteHash'); checkedHash(summary.recordHash, 'journal recordHash');
    const loaded = readNoFollow(summary.path, 1024 * 1024, `journal record ${summary.state}`);
    if (loaded.byteHash !== summary.fileByteHash) throw new Error('Journal file hash drifted.');
    const decoded = decodeStrictJsonArtifact(loaded.bytes, `journal record ${summary.state}`), record = closed(decoded.parsed, JOURNAL_FIELDS, `journal record ${summary.state}`);
    closed(record.observedPaths, OBSERVED_NAMES, `journal record ${summary.state}.observedPaths`);
    for (const name of OBSERVED_NAMES) validateObserved(record.observedPaths[name], layout.paths[name], `journal record ${summary.state}.observedPaths.${name}`);
    if (record.schema !== layout.stateMachine.journalRecordContract.schema || record.version !== layout.stateMachine.journalRecordContract.version || record.operationId !== terminal.operationId || record.layoutApprovalReceiptHash !== terminal.executionLayoutApprovalReceiptHash || record.sequence !== sequence || record.state !== summary.state || record.previousState !== previousState || record.previousRecordHash !== previousHash || record.recordHash !== summary.recordHash || hashCanonical({ ...record, recordHash: undefined }) !== record.recordHash) throw new Error('Journal record schema, chain, authority, or recordHash is invalid.');
    const legal = previousState == null ? record.state === 'prepared' : (layout.stateMachine.transitions[previousState] || []).includes(record.state); if (!legal) throw new Error('Journal contains an illegal state transition.');
    rows.push({ state: record.state, sequence, path: summary.path, fileByteHash: loaded.byteHash, recordHash: record.recordHash }); previousState = record.state; previousHash = record.recordHash;
  }
  if (terminal.terminalState && terminal.terminalState !== previousState || terminal.state && terminal.state !== previousState || terminal.terminalJournalHash && terminal.terminalJournalHash !== previousHash) throw new Error('Terminal receipt does not agree with the final journal record.');
  const expectedExisting = rows.map((row) => path.basename(row.path)).sort(); if (JSON.stringify(existing.sort()) !== JSON.stringify(expectedExisting)) throw new Error('Approved journal files contain an omission or an extra existing record.');
  return rows;
}
function createLegacyCreatorHistoryReconciliationPlan(rawInput = {}) {
  const input = closed(rawInput, INPUT_KEYS, 'Creator history-reconciliation input');
  const layoutArtifact = decodeStrictJsonArtifact(input.executionLayoutApprovalReceiptArtifactBytes, 'Execution-layout approval receipt'), terminalArtifact = decodeStrictJsonArtifact(input.terminalReceiptArtifactBytes, 'Terminal execution receipt');
  const layoutArtifactHash = sha(layoutArtifact.bytes), terminalArtifactHash = sha(terminalArtifact.bytes), expectedLayoutArtifactHash = checkedHash(input.expectedExecutionLayoutApprovalReceiptArtifactByteHash, 'expectedExecutionLayoutApprovalReceiptArtifactByteHash'), expectedLayoutHash = checkedHash(input.expectedExecutionLayoutApprovalReceiptHash, 'expectedExecutionLayoutApprovalReceiptHash'), expectedTerminalArtifactHash = checkedHash(input.expectedTerminalReceiptArtifactByteHash, 'expectedTerminalReceiptArtifactByteHash'), expectedTerminalHash = checkedHash(input.expectedTerminalReceiptHash, 'expectedTerminalReceiptHash');
  if (layoutArtifactHash !== expectedLayoutArtifactHash || hashCanonical(layoutArtifact.parsed) !== expectedLayoutHash) throw new Error('Saved layout approval artifact or independently retained receipt hash drifted.');
  if (terminalArtifactHash !== expectedTerminalArtifactHash || hashCanonical(terminalArtifact.parsed) !== expectedTerminalHash) throw new Error('Saved terminal artifact or independently retained receipt hash drifted.');
  const layout = layoutArtifact.parsed, terminal = terminalArtifact.parsed;
  closed(layout, LAYOUT_KEYS, 'saved execution-layout approval receipt');
  if (terminal.schema === 'ikemaker.sff-creator-transactional-execution-receipt') closed(terminal, terminal.status === 'aborted-before-replacement' ? EXECUTION_ABORTED_KEYS : EXECUTION_COMMITTED_KEYS, 'saved terminal execution receipt');
  else if (terminal.schema === 'ikemaker.sff-creator-execution-recovery-receipt') closed(terminal, RECOVERY_KEYS, 'saved terminal recovery receipt');
  if (layout.schema !== 'ikemaker.sff-creator-execution-layout-approval-receipt' || layout.version !== 1 || layout.executionLayoutApproved !== true || layout.executionAuthorityGranted !== true || layout.executionStarted !== false || layout.writesCommitted !== false || layout.adoptionCompleted !== false || layout.activeArchiveModified !== false) throw new Error('Saved layout approval is not pure pre-execution authority.');
  if (layout.currentStateGuaranteed !== false || layout.byteEqualityRequired !== false || layout.status !== 'approved') throw new Error('Saved layout approval no-write booleans are invalid.');
  closed(layout.authority, AUTHORITY_KEYS, 'layout.authority'); closed(layout.candidate, CANDIDATE_KEYS, 'layout.candidate'); closed(layout.active, ACTIVE_KEYS, 'layout.active'); closed(layout.activeDirectory, ['device', 'identity', 'path', 'realpath'], 'layout.activeDirectory'); closed(layout.paths, PATH_KEYS, 'layout.paths'); closed(layout.paths.journalPaths, layout.stateMachine.states, 'layout.paths.journalPaths'); closed(layout.rollback, ['candidateByteHash', 'fallbackBackupByteHash', 'oldActiveByteHash'], 'layout.rollback');
  validateStateMachine(layout);
  const retained = {
    layoutPlanArtifactByteHash: checkedHash(input.expectedExecutionLayoutPlanArtifactByteHash, 'expectedExecutionLayoutPlanArtifactByteHash'), layoutPlanHash: checkedHash(input.expectedExecutionLayoutPlanHash, 'expectedExecutionLayoutPlanHash'), approvalDecisionHash: checkedHash(input.expectedExecutionLayoutApprovalDecisionHash, 'expectedExecutionLayoutApprovalDecisionHash'), operationId: checkedHash(input.expectedOperationId, 'expectedOperationId'), adoptionApprovalReceiptHash: checkedHash(input.expectedAdoptionApprovalReceiptHash, 'expectedAdoptionApprovalReceiptHash'), approvedObservationPlanHash: checkedHash(input.expectedApprovedObservationPlanHash, 'expectedApprovedObservationPlanHash'), adoptionPlanArtifactByteHash: checkedHash(input.expectedAdoptionPlanArtifactByteHash, 'expectedAdoptionPlanArtifactByteHash'), persistedReceiptArtifactByteHash: checkedHash(input.expectedPersistedReceiptArtifactByteHash, 'expectedPersistedReceiptArtifactByteHash'), persistedReceiptHash: checkedHash(input.expectedPersistedReceiptHash, 'expectedPersistedReceiptHash'), candidateDispatchReceiptHash: checkedHash(input.expectedCandidateDispatchReceiptHash, 'expectedCandidateDispatchReceiptHash'), requestHash: checkedHash(input.expectedRequestHash, 'expectedRequestHash'), specificationHash: checkedHash(input.expectedSpecificationHash, 'expectedSpecificationHash'), logicalHash: checkedHash(input.expectedLogicalHash, 'expectedLogicalHash'), projectionApprovalReceiptHash: checkedHash(input.expectedProjectionApprovalReceiptHash, 'expectedProjectionApprovalReceiptHash'), sourceSnapshotHash: checkedHash(input.expectedSourceSnapshotHash, 'expectedSourceSnapshotHash'), sourceValidationHash: checkedHash(input.expectedSourceValidationHash, 'expectedSourceValidationHash'), capabilitySnapshotHash: checkedHash(input.expectedCapabilitySnapshotHash, 'expectedCapabilitySnapshotHash'), persistenceValidationHash: checkedHash(input.expectedPersistenceValidationHash, 'expectedPersistenceValidationHash'), candidateByteHash: checkedHash(input.expectedCandidateByteHash, 'expectedCandidateByteHash'), candidateStrictReportHash: checkedHash(input.expectedCandidateStrictReportHash, 'expectedCandidateStrictReportHash'), activeByteHash: checkedHash(input.expectedActiveByteHash, 'expectedActiveByteHash')
  };
  if (!Number.isSafeInteger(input.expectedCandidateByteLength) || input.expectedCandidateByteLength < 0 || !Number.isSafeInteger(input.expectedActiveByteLength) || input.expectedActiveByteLength < 0 || typeof input.expectedCandidateTargetId !== 'string' || !input.expectedCandidateTargetId) throw new Error('Independently retained archive metadata is malformed.');
  const activeIdentity = closed(input.expectedActiveIdentity, ['device', 'inode'], 'expectedActiveIdentity');
  closed(layout.active.identity, ['device', 'inode'], 'layout.active.identity'); closed(layout.candidate.identity, ['device', 'inode'], 'layout.candidate.identity'); closed(layout.activeDirectory.identity, ['device', 'inode'], 'layout.activeDirectory.identity');
  if (typeof activeIdentity.device !== 'string' || !activeIdentity.device || typeof activeIdentity.inode !== 'string' || !activeIdentity.inode) throw new Error('expectedActiveIdentity must retain exact device and inode strings.');
  const authorityFields = ['adoptionApprovalReceiptHash', 'approvedObservationPlanHash', 'adoptionPlanArtifactByteHash', 'persistedReceiptArtifactByteHash', 'persistedReceiptHash', 'candidateDispatchReceiptHash', 'requestHash', 'specificationHash', 'logicalHash', 'projectionApprovalReceiptHash', 'sourceSnapshotHash', 'sourceValidationHash', 'capabilitySnapshotHash', 'persistenceValidationHash'];
  for (const key of authorityFields) if (layout.authority[key] !== retained[key]) throw new Error(`Saved layout authority ${key} contradicts its independently retained hash.`);
  if (layout.executionLayoutPlanArtifactByteHash !== retained.layoutPlanArtifactByteHash || layout.approvedExecutionLayoutPlanHash !== retained.layoutPlanHash || layout.approvalDecisionHash !== retained.approvalDecisionHash || expectedLayoutHash !== retained.operationId || layout.candidate.byteHash !== retained.candidateByteHash || layout.candidate.byteLength !== input.expectedCandidateByteLength || layout.candidate.targetId !== input.expectedCandidateTargetId || layout.candidate.strictReportHash !== retained.candidateStrictReportHash || layout.active.byteHash !== retained.activeByteHash || layout.active.byteLength !== input.expectedActiveByteLength || String(layout.active.identity?.device) !== String(activeIdentity.device) || String(layout.active.identity?.inode) !== String(activeIdentity.inode) || layout.rollback.oldActiveByteHash !== retained.activeByteHash || layout.rollback.candidateByteHash !== retained.candidateByteHash || layout.rollback.fallbackBackupByteHash !== retained.activeByteHash) throw new Error('Saved layout archive or decision authority contradicts independently retained values.');
  if (terminal.operationId !== retained.operationId || terminal.executionLayoutApprovalReceiptHash !== expectedLayoutHash || terminal.historyAppended === true) throw new Error('Terminal receipt is not bound to the saved layout approval or already claims history mutation.');
  if (terminal.executionLayoutApprovalReceiptArtifactByteHash !== undefined && terminal.executionLayoutApprovalReceiptArtifactByteHash !== layoutArtifactHash || terminal.executionLayoutPlanHash !== undefined && terminal.executionLayoutPlanHash !== layout.approvedExecutionLayoutPlanHash) throw new Error('Terminal receipt retained layout hashes contradict saved authority.');
  if (terminal.authority !== undefined) exact(terminal.authority, layout.authority, 'terminal authority');
  if (terminal.schema === 'ikemaker.sff-creator-transactional-execution-receipt' && terminal.status !== 'aborted-before-replacement') { closed(terminal.backup, ['byteHash', 'byteLength', 'exists', 'identity', 'path'], 'terminal.backup'); closed(terminal.installed, ['byteHash', 'byteLength', 'exists', 'identity', 'path', 'strictReportHash'], 'terminal.installed'); if (!Array.isArray(terminal.cleanupIssues) || terminal.cleanupIssues.some((item) => typeof item !== 'string' || item.length > 1000)) throw new Error('Terminal cleanup issues are malformed.'); }
  else if (terminal.schema === 'ikemaker.sff-creator-transactional-execution-receipt') validateObserved(terminal.backup, layout.paths.backupPath, 'terminal.backup');
  else { validateObserved(terminal.active, layout.paths.destinationPath, 'terminal.active'); validateObserved(terminal.backup, layout.paths.backupPath, 'terminal.backup'); validateObserved(terminal.rollbackHold, layout.paths.rollbackHoldPath, 'terminal.rollbackHold'); validateObserved(terminal.failedInstallHold, layout.paths.failedInstallHoldPath, 'terminal.failedInstallHold'); if (typeof terminal.error !== 'string' || terminal.error.length > 4000 || !Array.isArray(terminal.cleanupIssues) || terminal.cleanupIssues.some((item) => typeof item !== 'string' || item.length > 1000)) throw new Error('Recovery error or cleanup issues are malformed.'); }
  const outcome = terminalOutcome(terminal), activeDirectorySeal = sealDirectory(layout.activeDirectory.realpath, 'active directory'), candidateDirectorySeal = sealDirectory(path.dirname(layout.candidate.path), 'candidate directory');
  if (!samePath(activeDirectorySeal.realpath, layout.activeDirectory.realpath) || activeDirectorySeal.device !== String(layout.activeDirectory.device) || activeDirectorySeal.identity.device !== String(layout.activeDirectory.identity.device) || activeDirectorySeal.identity.inode !== String(layout.activeDirectory.identity.inode)) throw new Error('Active directory sealed identity, device, or realpath drifted.');
  const journals = journalChain(layout, terminal), journalChainHash = hashCanonical(journals);
  if (outcome.startsWith('committed') && terminal.schema === 'ikemaker.sff-creator-transactional-execution-receipt' && (terminal.installed?.exists !== true || terminal.installed?.path !== layout.paths.destinationPath || terminal.installed?.byteHash !== retained.candidateByteHash || terminal.installed?.byteLength !== input.expectedCandidateByteLength || terminal.installed?.strictReportHash !== retained.candidateStrictReportHash || terminal.backup?.exists !== true || terminal.backup?.path !== layout.paths.backupPath || terminal.backup?.byteHash !== retained.activeByteHash || terminal.backup?.byteLength !== input.expectedActiveByteLength)) throw new Error('Committed terminal archive evidence contradicts independently retained authority.');
  if (outcome === 'aborted-before-replacement' && terminal.backup?.exists === true && (terminal.backup.path !== layout.paths.backupPath || terminal.backup.byteHash !== retained.activeByteHash || terminal.backup.byteLength !== input.expectedActiveByteLength)) throw new Error('Aborted terminal backup contradicts independently retained authority.');
  if (outcome === 'rolled_back' && (terminal.active?.exists !== true || terminal.active.byteHash !== retained.activeByteHash || terminal.active.byteLength !== input.expectedActiveByteLength || terminal.backup?.exists !== true || terminal.backup.byteHash !== retained.activeByteHash || terminal.failedInstallHold?.exists !== true || terminal.failedInstallHold.byteHash !== retained.candidateByteHash)) throw new Error('Rolled-back terminal evidence contradicts independently retained authority.');
  const expectedRoot = closed(input.expectedHistoryRoot, ROOT_KEYS, 'expectedHistoryRoot'), expectedRootIdentity = closed(expectedRoot.identity, ['device', 'inode'], 'expectedHistoryRoot.identity'), rootLstat = fs.lstatSync(expectedRoot.path, { bigint: true });
  assertNoLinkAncestors(expectedRoot.path);
  if (rootLstat.isSymbolicLink() || !rootLstat.isDirectory()) throw new Error('History root must be an existing non-link directory.');
  const rootSeal = sealDirectory(expectedRoot.path, 'history root'), rootRealpath = rootSeal.realpath, rootStat = fs.statSync(rootRealpath, { bigint: true }), rootIdentity = identity(rootStat);
  if (!samePath(rootRealpath, expectedRoot.realpath) || !samePath(expectedRoot.path, expectedRoot.realpath) || String(rootStat.dev) !== String(expectedRoot.device) || String(rootIdentity.device) !== String(expectedRootIdentity.device) || String(rootIdentity.inode) !== String(expectedRootIdentity.inode)) throw new Error('History root realpath, identity, or device drifted.');
  const candidateDirectory = path.dirname(layout.candidate.path);
  if (beneath(rootRealpath, layout.activeDirectory.realpath) || beneath(layout.activeDirectory.realpath, rootRealpath) || beneath(rootRealpath, candidateDirectory) || beneath(candidateDirectory, rootRealpath)) throw new Error('History root lacks protected path separation from execution assets.');
  const expectations = {
    active: outcome.startsWith('committed') ? [layout.candidate.byteHash, layout.candidate.byteLength] : outcome === 'manual_recovery_required' && terminal.active?.exists === true ? [terminal.active.byteHash, terminal.active.byteLength] : outcome === 'manual_recovery_required' ? [null, null] : [layout.active.byteHash, layout.active.byteLength],
    backup: terminal.backup?.exists === true ? [terminal.backup.byteHash, terminal.backup.byteLength] : [null, null],
    rollbackHold: terminal.rollbackHold?.exists === true ? [terminal.rollbackHold.byteHash, terminal.rollbackHold.byteLength] : [null, null],
    failedInstallHold: terminal.failedInstallHold?.exists === true ? [terminal.failedInstallHold.byteHash, terminal.failedInstallHold.byteLength] : [null, null],
    candidate: [layout.candidate.byteHash, layout.candidate.byteLength]
  };
  const targets = { active: layout.paths.destinationPath, backup: layout.paths.backupPath, backupPartial: layout.paths.backupPartialPath, replacementTemp: layout.paths.replacementTempPath, rollbackHold: layout.paths.rollbackHoldPath, failedInstallHold: layout.paths.failedInstallHoldPath, rollbackTemp: layout.paths.rollbackTempPath, lease: layout.paths.leasePath, candidate: layout.candidate.path };
  const rows = Object.entries(targets).map(([name, filename]) => {
    const expectation = expectations[name] || [null, null], maximum = expectation[1] == null ? Math.max(layout.active.byteLength, layout.candidate.byteLength, 4096) : expectation[1], row = { name, ...observe(filename, maximum, expectation[0], expectation[1]), expectedExists: expectation[0] != null, expectedByteHash: expectation[0], expectedByteLength: expectation[1], strictStatus: 'not-applicable', strictReportHash: null, strictTargetIds: [], strictReports: [] };
    if (row.status === 'matched' && ['active', 'backup', 'rollbackHold', 'failedInstallHold', 'candidate'].includes(name)) {
      const loaded = readNoFollow(filename, maximum, `strict ${name}`), candidateRole = name === 'candidate' || name === 'failedInstallHold' || name === 'active' && outcome.startsWith('committed');
      if (loaded.byteHash !== row.byteHash) { row.status = 'error'; row.error = 'path-changed-before-strict-validation'; }
      else if (candidateRole && !['sff-v1', 'sff-v2.0', 'sff-v2.1'].includes(layout.candidate.targetId)) row.strictStatus = 'candidate-target-not-supported';
      else if (candidateRole) { try { row.strictReportHash = strictArchiveHash(layout.candidate.targetId, loaded.bytes); row.strictTargetIds = [layout.candidate.targetId]; row.strictReports = [{ targetId: layout.candidate.targetId, reportHash: row.strictReportHash }]; row.strictStatus = row.strictReportHash === layout.candidate.strictReportHash ? 'candidate-validated' : 'candidate-mismatch'; } catch (_) { row.strictStatus = 'candidate-mismatch'; } }
      else { const probe = probeOldArchive(loaded.bytes); row.strictStatus = `old-active-${probe.status}`; row.strictTargetIds = probe.targetIds; row.strictReports = probe.reports; }
    }
    return row;
  });
  recheckDirectory(activeDirectorySeal, 'active directory'); recheckDirectory(candidateDirectorySeal, 'candidate directory');
  const currentStateHash = hashCanonical({ outcome, journalChainHash, rows });
  const basename = `${terminal.operationId}.${expectedTerminalHash}.history.json`, partialBasename = `.${terminal.operationId}.${expectedTerminalHash}.history.partial`, foldedFinal = basename.toLowerCase(), foldedPartial = partialBasename.toLowerCase(), historyPath = safeLeaf(rootRealpath, basename), historyPartialPath = safeLeaf(rootRealpath, partialBasename);
  const reconciliationRisks = rows.flatMap((row) => row.status === 'error' ? [`current-path-error:${row.name}`] : row.expectedExists && row.status === 'missing' ? [`current-path-missing:${row.name}`] : row.status === 'drifted' ? [`current-path-drift:${row.name}`] : ['old-active-unknown', 'old-active-ambiguous'].includes(row.strictStatus) ? [`current-format-${row.strictStatus}:${row.name}`] : row.strictStatus === 'candidate-target-not-supported' ? [`current-format-${row.strictStatus}:${row.name}`] : row.strictStatus === 'candidate-mismatch' ? [`current-strict-validation-failed:${row.name}`] : []).sort();
  const risks = [...new Set(['external-path-race-not-excluded', ...reconciliationRisks])].sort(), reconciliationBlockers = rows.filter((row) => row.status === 'error' || row.strictStatus === 'candidate-mismatch').map((row) => row.status === 'error' ? `reconciliation-observation-error:${row.name}` : `sealed-candidate-contradiction:${row.name}`).sort();
  const backupRow = rows.find((row) => row.name === 'backup'), holdRow = rows.find((row) => row.name === 'rollbackHold'), rollbackCurrentlyAvailable = Boolean((backupRow.status === 'matched' && backupRow.byteHash === layout.active.byteHash) || (holdRow.status === 'matched' && holdRow.byteHash === layout.active.byteHash));
  const durabilityCaveats = [...new Set([layout.replacementProfile?.crashDurabilityGuaranteed === false ? 'replacement-crash-durability-not-guaranteed' : null, layout.replacementProfile?.directoryFsyncObserved === false ? 'directory-fsync-not-observed' : null, terminal.directoryDurabilityGuaranteed === false ? 'terminal-directory-durability-not-guaranteed' : null].filter(Boolean))].sort();
  const completeHistoryInventory = fs.readdirSync(rootRealpath).sort(), historyRootInventory = completeHistoryInventory.filter((name) => ![foldedFinal, foldedPartial].includes(name.toLowerCase())), historyRootInventoryHash = hashCanonical(historyRootInventory);
  const warnings = reconciliationRisks, blockers = [...reconciliationBlockers];
  if (completeHistoryInventory.some((name) => name.toLowerCase() === foldedFinal && name !== basename)) blockers.push('history-final-case-collision');
  if (completeHistoryInventory.some((name) => name.toLowerCase() === foldedPartial && name !== partialBasename)) blockers.push('history-partial-case-collision');
  const existingPartial = observe(historyPartialPath, Math.max(layout.active.byteLength, layout.candidate.byteLength, 4096), null, null); if (existingPartial.exists) blockers.push('history-partial-path-occupied');
  function recordWith(blockerList) { const core = { schema: 'ikemaker.sff-creator-history-record', version: 1, operationId: terminal.operationId, outcome, outcomeNature: 'sealed-historical-terminal-outcome', reconciliationNature: 'transient-current-observation', currentStateGuaranteed: false, executionLayoutApprovalReceiptArtifactByteHash: layoutArtifactHash, executionLayoutApprovalReceiptHash: expectedLayoutHash, terminalReceiptArtifactByteHash: terminalArtifactHash, terminalReceiptHash: expectedTerminalHash, authority: layout.authority, replacementProfile: layout.replacementProfile, executorProfile: layout.executorContract, durabilityCaveats, journalChainHash, journalSummary: journals, journalTerminalHash: journals[journals.length - 1].recordHash, reconciliationRows: rows, currentStateHash, risks, warnings, blockers: [...new Set(blockerList)].sort(), backupCurrentlyAvailable: backupRow.status === 'matched', rollbackCurrentlyAvailable, historyRootInventoryHash, historyAppended: false }; const hash = hashCanonical(core), record = { ...core, historyRecordHash: hash }, text = `${JSON.stringify(record)}\n`; return { core, hash, record, text, byteHash: sha(Buffer.from(text)) }; }
  const preliminary = recordWith(blockers), preliminaryExisting = observe(historyPath, Buffer.byteLength(preliminary.text), preliminary.byteHash, Buffer.byteLength(preliminary.text)); if (preliminaryExisting.exists && preliminaryExisting.status !== 'matched') blockers.push('history-final-path-occupied');
  const built = recordWith(blockers), existingFinal = observe(historyPath, Buffer.byteLength(built.text), built.byteHash, Buffer.byteLength(built.text));
  recheckDirectory(rootSeal, 'history root');
  const finalBlockers = [...new Set(blockers)].sort(), historyRecord = built.record, historyRecordHash = built.hash, historyRecordBytesUtf8 = built.text, historyRecordByteHash = built.byteHash;
  const plan = { schema: 'ikemaker.sff-creator-history-reconciliation-plan', version: 1, operationId: terminal.operationId, outcome, outcomeNature: 'sealed-historical-terminal-outcome', reconciliationNature: 'transient-current-observation', currentStateGuaranteed: false, executionLayoutApprovalReceiptArtifactByteHash: layoutArtifactHash, executionLayoutApprovalReceiptHash: expectedLayoutHash, terminalReceiptArtifactByteHash: terminalArtifactHash, terminalReceiptHash: expectedTerminalHash, authority: layout.authority, replacementProfile: layout.replacementProfile, executorProfile: layout.executorContract, durabilityCaveats, historyRoot: { path: expectedRoot.path, realpath: rootRealpath, identity: rootIdentity, device: String(rootStat.dev), inventory: historyRootInventory, inventoryHash: historyRootInventoryHash, fingerprint: rootSeal.fingerprint }, journalRecords: journals, journalChainHash, reconciliationRows: rows, currentStateHash, backupCurrentlyAvailable: backupRow.status === 'matched', rollbackCurrentlyAvailable, historyPath, historyPartialPath, historyRecord, historyRecordBytesUtf8, historyRecordByteHash, historyRecordHash, plannedExistingFinal: existingFinal, plannedExistingPartial: existingPartial, idempotentExistingRecord: existingFinal.status === 'matched', blockers: finalBlockers, risks, warnings, reviewRequired: true, historyPlanApproved: false, historyWriteAuthorityGranted: false, archiveMutationAllowed: false, recoveryMutationAllowed: false, adoptionMutationAllowed: false, cleanupMutationAllowed: false, writesCommitted: false };
  plan.planHash = hashCanonical({ ...plan, planHash: undefined }); return deepFreeze(plan);
}

function createCreatorHistoryReconciliationPlan(rawInput = {}) {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput) || Buffer.isBuffer(rawInput) || utilTypes.isProxy(rawInput) || Object.getPrototypeOf(rawInput) !== Object.prototype) throw new Error('Creator history-reconciliation input must be a plain non-proxy object.');
  const schemaDescriptor = Object.getOwnPropertyDescriptor(rawInput, 'schema');
  if (schemaDescriptor && (!schemaDescriptor.enumerable || !Object.prototype.hasOwnProperty.call(schemaDescriptor, 'value'))) throw new Error('Creator history-reconciliation input schema must be an own enumerable data property.');
  if (schemaDescriptor?.value === 'ikemaker.sff-creator-recovery-history-reconciliation-input') {
    return require('./sff_creator_recovery_history_reconciliation_plan').createCreatorRecoveryHistoryReconciliationPlan(rawInput);
  }
  return createLegacyCreatorHistoryReconciliationPlan(rawInput);
}

module.exports = { OUTCOMES, createCreatorHistoryReconciliationPlan };
