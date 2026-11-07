'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { types: utilTypes } = require('util');
const { decodeStrictJsonArtifact } = require('./sff_strict_json_artifact');
const { canonicalize, hashCanonical } = require('./sff_capability_report');
const { dispatchCreatorApprovedCandidate } = require('./sff_creator_candidate_dispatch');
const { assertSffV1Pcx8 } = require('./sff_v1_pcx8_strict_validator');
const { assertSffV20Raw8 } = require('./sff_v20_strict_validator');
const { assertSffV21Mixed: assertSffV21Png8 } = require('./sff_v21_mixed_strict_validator');

const SHA256 = /^[0-9a-f]{64}$/i;
const ACTIVE_INSPECTION_LIMIT = 256 * 1024 * 1024;
const { assertTemporaryRecovery } = require('./sff_creator_temporary_recovery');
const INPUT_KEYS = Object.freeze(['backupBasename', 'expectedApprovalReceiptHash', 'expectedCandidateByteHash', 'expectedCandidateDispatchReceiptHash', 'expectedPersistedReceiptArtifactByteHash', 'expectedPersistedReceiptHash', 'expectedPersistenceValidationHash', 'expectedRequestHash', 'expectedSourceSnapshotHash', 'expectedSourceValidationHash', 'expectedSpecificationHash', 'persistedReceiptArtifactBytes', 'persistenceInput']);
const PERSISTED_KEYS = Object.freeze(['activeArchive', 'activeArchiveModified', 'adoptionAllowed', 'approvalReceiptHash', 'byteEqualityRequired', 'candidateByteHash', 'candidateByteLength', 'candidateDispatchReceiptArtifactByteHash', 'candidateDispatchReceiptHash', 'candidatePersisted', 'capabilitySnapshotHash', 'directoryFsync', 'directoryFsyncAfterCleanup', 'directoryFsyncAfterPublish', 'dispatchReceiptHash', 'fileFsync', 'logicalHash', 'parentDirectoryFsync', 'persistedByteHash', 'persistedByteLength', 'persistenceValidation', 'persistenceValidationHash', 'relativeCandidateFilename', 'requestHash', 'schema', 'selection', 'semanticComparisonHash', 'sourceSnapshotHash', 'sourceValidationHash', 'specificationHash', 'stagingDirectory', 'version', 'writesCommitted']);
const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function checkedHash(value, label) { const result = String(value || '').toLowerCase(); if (!SHA256.test(result)) throw new Error(`${label} must be a SHA-256 hash.`); return result; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(deepFreeze); return value; }
function exactKeys(value, expected, label) { if (!value || typeof value !== 'object' || Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain non-proxy object.`); const descriptors = Object.getOwnPropertyDescriptors(value), keys = Object.keys(descriptors).sort(); if (Object.getOwnPropertySymbols(value).length || JSON.stringify(keys) !== JSON.stringify([...expected].sort())) throw new Error(`${label} must contain exactly the reviewed fields.`); for (const key of keys) if (!descriptors[key].enumerable || !Object.prototype.hasOwnProperty.call(descriptors[key], 'value')) throw new Error(`${label}.${key} must be an enumerable data property.`); return Object.fromEntries(keys.map((key) => [key, descriptors[key].value])); }
function safeBackupName(value) { const name = String(value || ''); if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,123}$/.test(name) || WINDOWS_DEVICE.test(name) || /[ .]$/.test(name) || path.basename(name) !== name) throw new Error('backupBasename must be a conservative ASCII basename.'); return name; }
function pathKey(value) { const resolved = path.resolve(value); return ['win32', 'darwin'].includes(process.platform) ? resolved.toLowerCase() : resolved; }
function within(candidate, root) { const relative = path.relative(path.resolve(root), path.resolve(candidate)); return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)); }
function statIdentity(stat) { return { device: typeof stat.dev === 'bigint' ? stat.dev.toString() : String(stat.dev), inode: typeof stat.ino === 'bigint' ? stat.ino.toString() : String(stat.ino) }; }
function sameIdentity(stat, identity) { return String(stat.dev) === String(identity?.device) && String(stat.ino) === String(identity?.inode); }
function stableStat(stat) { return [String(stat.dev), String(stat.ino), String(stat.size), String(stat.mtimeNs ?? stat.mtimeMs), String(stat.ctimeNs ?? stat.ctimeMs)].join(':'); }
function assertNoLinkAncestors(filename, label) { const resolved = path.resolve(filename), parsed = path.parse(resolved), pieces = path.relative(parsed.root, resolved).split(path.sep).filter(Boolean); let current = parsed.root; for (const piece of pieces) { current = path.join(current, piece); const stat = fs.lstatSync(current, { bigint: true }); if (stat.isSymbolicLink()) throw new Error(`${label} must not contain a symbolic-link, junction, or reparse path.`); } return resolved; }
function openNoFollow(filename) { return fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0)); }
function captureFile(filename, label, keepBytesLimit, options = {}) {
  const resolved = assertNoLinkAncestors(filename, label), before = fs.lstatSync(resolved, { bigint: true }); if (!before.isFile()) throw new Error(`${label} must be an existing regular file.`);
  const realpath = fs.realpathSync.native(resolved), handle = openNoFollow(resolved), digest = crypto.createHash('sha256'); let opened, afterHandle, retained = null;
  try {
    opened = fs.fstatSync(handle, { bigint: true }); if (!opened.isFile() || opened.size < (options.allowEmpty ? 0n : 1n) || opened.size > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${label} has an unsupported size.`);
    const size = Number(opened.size), keep = size <= keepBytesLimit; if (keep) retained = Buffer.alloc(size); const chunk = Buffer.alloc(Math.min(1024 * 1024, size)); let position = 0;
    while (position < size) { const count = fs.readSync(handle, chunk, 0, Math.min(chunk.length, size - position), position); if (!count) throw new Error(`${label} ended before its recorded length.`); digest.update(chunk.subarray(0, count)); if (keep) chunk.copy(retained, position, 0, count); position += count; }
    afterHandle = fs.fstatSync(handle, { bigint: true });
  } finally { fs.closeSync(handle); }
  const after = fs.lstatSync(resolved, { bigint: true }), afterRealpath = fs.realpathSync.native(resolved);
  if (stableStat(before) !== stableStat(opened) || stableStat(opened) !== stableStat(afterHandle) || stableStat(afterHandle) !== stableStat(after) || pathKey(realpath) !== pathKey(afterRealpath)) throw new Error(`${label} changed while it was inspected.`);
  return { path: resolved, realpath, identity: statIdentity(opened), byteHash: digest.digest('hex'), byteLength: Number(opened.size), bytes: retained };
}

function strictReport(targetId, bytes, specification = null) {
  if (targetId === 'sff-v1') { const report = assertSffV1Pcx8(bytes, specification); return { report, hash: hashCanonical({ kind: report.kind, profile: report.profile, version: report.header.version, groupCount: report.header.groupCount, spriteCount: report.sprites.length }) }; }
  if (targetId === 'sff-v2.0') { const report = assertSffV20Raw8(bytes, specification, { compatibilityProfile: 'canonical' }); return { report, hash: hashCanonical({ kind: report.kind, profile: report.profile, primaryVersion: report.primaryVersion, compatibleVersion: report.compatibleVersion, spriteCount: report.sprites.length, paletteCount: report.palettes.length }) }; }
  if (targetId === 'sff-v2.1') { const report = assertSffV21Png8(bytes, null, { compatibilityProfile: 'canonical' }); return { report, hash: hashCanonical(report) }; }
  throw new Error(`No certified validator exists for ${targetId}.`);
}
function inspectActive(bytes) {
  if (!bytes) return { status: 'not-performed-size-limit', recognizedVersion: null, successes: [], errors: [], report: null, targetId: null };
  const attempts = [
    ['sff-v1', () => assertSffV1Pcx8(bytes, null)], ['sff-v2.0', () => assertSffV20Raw8(bytes, null, { compatibilityProfile: 'canonical' })], ['sff-v2.1', () => assertSffV21Png8(bytes, null, { compatibilityProfile: 'canonical' })]
  ], successes = [], errors = [];
  for (const [targetId, run] of attempts) { try { successes.push({ targetId, report: run() }); } catch (error) { errors.push({ targetId, message: error.message }); } }
  const signature = bytes.length >= 16 && bytes.subarray(0, 12).toString('latin1') === 'ElecbyteSpr\0', recognizedVersion = signature ? Array.from(bytes.subarray(12, 16)).join('.') : null;
  if (successes.length === 1) return { status: 'recognized-supported-profile', recognizedVersion, successes: successes.map((item) => item.targetId), errors, report: successes[0].report, targetId: successes[0].targetId };
  if (successes.length > 1) return { status: 'ambiguous-certified-profiles', recognizedVersion, successes: successes.map((item) => item.targetId), errors, report: null, targetId: null };
  return { status: signature ? 'recognized-version-unsupported-profile' : 'unrecognized-or-corrupt', recognizedVersion, successes: [], errors, report: null, targetId: null };
}
function resolve(entries, index) { let current = entries[index], guard = 0; while (current && !Number(current.dataSize) && guard++ <= entries.length) current = entries[Number(current.link)]; return current || null; }
function semanticModel(inspection) {
  const report = inspection.report; if (!report) return null;
  const v1 = inspection.targetId === 'sff-v1', sprites = report.sprites || [], palettes = report.palettes || [], counts = new Map();
  return sprites.map((sprite) => {
    const identity = `${sprite.group},${sprite.number}`, ordinal = counts.get(identity) || 0; counts.set(identity, ordinal + 1);
    const trueColor = sprite.format === 11 || sprite.format === 12;
    const palette = !v1 && !trueColor ? palettes[Number(sprite.paletteIndex)] : null, effective = palette ? resolve(palettes, Number(palette.index)) : null;
    const colors = effective?.colorsRgba, rgbHash = Array.isArray(colors) ? sha(Buffer.from(colors.flatMap((color) => color.slice(0, 3)))) : null;
    return { key: `${identity}#${ordinal}`, physicalIndex: Number(sprite.index), identity, occurrenceOrdinal: ordinal, axis: [Number(sprite.axisX), Number(sprite.axisY)], dimensions: [Number(sprite.width), Number(sprite.height)], decodedIndexHash: sprite.resolvedDecodedIndexHash || sprite.decodedIndexHash || sprite.decodedPixelHash || null, linkPhysicalIndex: Number(sprite.dataSize) ? null : Number(sprite.link), effectivePaletteRgbHash: v1 ? sprite.paletteRgbHash || null : rgbHash, paletteIdentity: v1 ? null : palette ? `${palette.group},${palette.number}` : null, transparencyHash: Array.isArray(colors) ? sha(Buffer.from(colors.map((color) => color[3]))) : null };
  });
}
function compareModels(activeInspection, candidateInspection) {
  const active = semanticModel(activeInspection), candidate = semanticModel(candidateInspection), categories = {};
  const names = { identities: 'identity', axes: 'axis', dimensions: 'dimensions', decodedPixels: 'decodedIndexHash', links: 'linkPhysicalIndex', paletteAssignments: 'paletteIdentity', paletteValues: 'effectivePaletteRgbHash', transparency: 'transparencyHash' };
  if (!active || !candidate) for (const name of ['order', ...Object.keys(names)]) categories[name] = { equal: 0, changed: 0, added: 0, removed: 0, unknown: 1, samples: ['Active archive semantics are unavailable.'] };
  else {
    const activeByKey = new Map(active.map((item) => [item.key, item])), candidateByKey = new Map(candidate.map((item) => [item.key, item]));
    const added = [...candidateByKey.keys()].filter((key) => !activeByKey.has(key)), removed = [...activeByKey.keys()].filter((key) => !candidateByKey.has(key));
    categories.order = { equal: JSON.stringify(active.map((item) => item.key)) === JSON.stringify(candidate.map((item) => item.key)) ? 1 : 0, changed: JSON.stringify(active.map((item) => item.key)) === JSON.stringify(candidate.map((item) => item.key)) ? 0 : 1, added: added.length, removed: removed.length, unknown: 0, samples: [] };
    for (const [name, field] of Object.entries(names)) {
      let equal = 0, changed = 0, unknown = 0; const samples = [];
      for (const [entryKey, wanted] of candidateByKey) { const found = activeByKey.get(entryKey); if (!found) continue; const left = found[field], right = wanted[field]; if (field === 'linkPhysicalIndex' && left == null && right == null) equal += 1; else if (left == null || right == null) { unknown += 1; if (samples.length < 20) samples.push(`${entryKey}: not comparable between active and candidate formats`); } else if (JSON.stringify(left) === JSON.stringify(right)) equal += 1; else { changed += 1; if (samples.length < 20) samples.push(`${entryKey}: active=${JSON.stringify(left)} candidate=${JSON.stringify(right)}`); } }
      categories[name] = { equal, changed, added: added.length, removed: removed.length, unknown, samples, addedSamples: added.slice(0, 20), removedSamples: removed.slice(0, 20) };
    }
  }
  const totals = Object.fromEntries(Object.entries(categories).map(([name, value]) => [name, { changed: value.changed, added: value.added, removed: value.removed, unknown: value.unknown }]));
  const outcome = (names) => {
    const selected = names.map((name) => categories[name]);
    if (selected.some((item) => item.changed || item.added || item.removed)) return 'different';
    if (selected.some((item) => item.unknown)) return 'unknown';
    return 'equal';
  };
  const semanticEquivalence = outcome(Object.keys(categories)), renderEquivalence = outcome(['order', 'axes', 'dimensions', 'decodedPixels', 'paletteValues', 'transparency']);
  return { categories, totals, semanticEquivalence, renderEquivalence, fullRenderEquivalent: renderEquivalence === 'equal' };
}

function createCreatorAdoptionPlan(rawInput = {}) {
  const input = exactKeys(rawInput, rawInput && !utilTypes.isProxy(rawInput) && Object.hasOwn(rawInput,'recovery') ? [...INPUT_KEYS, 'recovery'] : INPUT_KEYS, 'Creator adoption-plan input'), persistenceInput = input.persistenceInput;
  const persistenceKeys = ['activeArchivePath', 'candidateBytes', 'candidateDispatchInput', 'candidateDispatchReceiptArtifactBytes', 'candidateFilename', 'expectedApprovalReceiptHash', 'expectedCandidateByteHash', 'expectedCandidateDispatchReceiptArtifactByteHash', 'expectedCandidateDispatchReceiptHash', 'expectedRequestHash', 'expectedSourceSnapshotHash', 'expectedSpecificationHash', 'protectedRoots', 'stagingParent'];
  exactKeys(persistenceInput, persistenceKeys, 'persistenceInput');
  const rederived = dispatchCreatorApprovedCandidate(persistenceInput.candidateDispatchInput), saved = decodeStrictJsonArtifact(input.persistedReceiptArtifactBytes, 'Persisted Creator candidate receipt'), receipt = saved.parsed;
  exactKeys(receipt, PERSISTED_KEYS, 'persisted receipt');
  const expected = { artifactHash: checkedHash(input.expectedPersistedReceiptArtifactByteHash, 'expectedPersistedReceiptArtifactByteHash'), receiptHash: checkedHash(input.expectedPersistedReceiptHash, 'expectedPersistedReceiptHash'), dispatchHash: checkedHash(input.expectedCandidateDispatchReceiptHash, 'expectedCandidateDispatchReceiptHash'), requestHash: checkedHash(input.expectedRequestHash, 'expectedRequestHash'), specificationHash: checkedHash(input.expectedSpecificationHash, 'expectedSpecificationHash'), approvalHash: checkedHash(input.expectedApprovalReceiptHash, 'expectedApprovalReceiptHash'), sourceHash: checkedHash(input.expectedSourceSnapshotHash, 'expectedSourceSnapshotHash'), sourceValidationHash: checkedHash(input.expectedSourceValidationHash, 'expectedSourceValidationHash'), candidateHash: checkedHash(input.expectedCandidateByteHash, 'expectedCandidateByteHash'), persistenceValidationHash: checkedHash(input.expectedPersistenceValidationHash, 'expectedPersistenceValidationHash') };
  if (sha(saved.bytes) !== expected.artifactHash || hashCanonical(receipt) !== expected.receiptHash) throw new Error('Persisted receipt artifact or independently retained receipt hash drifted.');
  if (rederived.receiptHash !== expected.dispatchHash || receipt.candidateDispatchReceiptHash !== expected.dispatchHash || receipt.requestHash !== expected.requestHash || receipt.specificationHash !== expected.specificationHash || receipt.approvalReceiptHash !== expected.approvalHash || receipt.sourceSnapshotHash !== expected.sourceHash || receipt.sourceValidationHash !== expected.sourceValidationHash || receipt.candidateByteHash !== expected.candidateHash || receipt.persistenceValidationHash !== expected.persistenceValidationHash || hashCanonical(receipt.persistenceValidation) !== expected.persistenceValidationHash) throw new Error('Persisted receipt does not match independently retained upstream authority.');
  if (receipt.logicalHash !== rederived.receipt.logicalHash || receipt.capabilitySnapshotHash !== rederived.receipt.capabilitySnapshotHash || receipt.semanticComparisonHash !== hashCanonical(rederived.receipt.semanticComparison) || receipt.dispatchReceiptHash !== hashCanonical(rederived.receipt.dispatch) || receipt.candidatePersisted !== true || receipt.writesCommitted !== true || receipt.activeArchiveModified !== false || receipt.adoptionAllowed !== false || receipt.byteEqualityRequired !== false) throw new Error('Persisted receipt is not exactly bound to the rederived candidate-only authority.');
  if (pathKey(persistenceInput.activeArchivePath) !== pathKey(receipt.activeArchive.path)) throw new Error('persistenceInput activeArchivePath does not match the sealed SFF-14 destination authority.');

  const stagingRoot = assertNoLinkAncestors(receipt.stagingDirectory.realpath, 'stagingDirectory'), stagingStat = fs.statSync(stagingRoot, { bigint: true });
  if (!stagingStat.isDirectory() || !sameIdentity(stagingStat, receipt.stagingDirectory.identity) || pathKey(fs.realpathSync.native(stagingRoot)) !== pathKey(receipt.stagingDirectory.realpath)) throw new Error('Persisted staging-directory identity drifted.');
  const candidatePath = path.join(stagingRoot, receipt.relativeCandidateFilename); if (!within(candidatePath, stagingRoot)) throw new Error('Persisted candidate path escaped its sealed staging directory.');
  const candidate = captureFile(candidatePath, 'persistedCandidate', receipt.candidateByteLength);
  if (candidate.byteHash !== expected.candidateHash || candidate.byteLength !== receipt.candidateByteLength || candidate.byteHash !== receipt.persistedByteHash || candidate.byteLength !== receipt.persistedByteLength) throw new Error('Persisted candidate bytes drifted from SFF-14 authority.');
  const candidateStrict = strictReport(receipt.selection.targetId, candidate.bytes, null); if (candidateStrict.hash !== receipt.persistenceValidation.strictReportHash || candidateStrict.hash !== rederived.receipt.validation.strictReportHash) throw new Error('Persisted candidate strict-validator binding drifted.');
  const candidateInspection = { status: 'recognized-supported-profile', targetId: receipt.selection.targetId, report: candidateStrict.report };

  const active = captureFile(receipt.activeArchive.path, 'activeArchive', ACTIVE_INSPECTION_LIMIT, { allowEmpty: true });
  if (pathKey(active.realpath) !== pathKey(receipt.activeArchive.realpath) || !sameIdentity({ dev: active.identity.device, ino: active.identity.inode }, receipt.activeArchive.identity)) throw new Error('Active archive path or identity drifted from SFF-14 authority.');
  const activeDriftedSincePersistence = active.byteHash !== receipt.activeArchive.byteHash || active.byteLength !== receipt.activeArchive.byteLength;
  const activeInspection = inspectActive(active.bytes), comparison = compareModels(activeInspection, candidateInspection), backupName = safeBackupName(input.backupBasename), activeDirectory = path.dirname(active.realpath);
  if(Object.hasOwn(input,'recovery')&&!input.recovery)throw new Error('Recovery descriptor is required when supplied.');
  const backupDirectory = input.recovery ? assertTemporaryRecovery(input.recovery, active.realpath) : activeDirectory;
  const backupPath = path.join(backupDirectory, backupName), replacementTempPath = path.join(activeDirectory, `.ikemaker-install-${expected.candidateHash.slice(0, 16)}.sff.partial`), caseFold = ['win32', 'darwin'].includes(process.platform), inventory = new Set(fs.readdirSync(activeDirectory).map((name) => caseFold ? name.toLowerCase() : name));
  const backupCollision = fs.readdirSync(backupDirectory).some(name => (caseFold ? name.toLowerCase() : name) === (caseFold ? backupName.toLowerCase() : backupName)), tempName = path.basename(replacementTempPath), replacementTempCollision = inventory.has(caseFold ? tempName.toLowerCase() : tempName);
  const risks = [];
  if (activeDriftedSincePersistence) risks.push('active-archive-drifted-since-persistence');
  if (activeInspection.status !== 'recognized-supported-profile') risks.push(`active-inspection-${activeInspection.status}`);
  if (activeInspection.targetId && activeInspection.targetId !== receipt.selection.targetId) risks.push('archive-format-change');
  if (Object.values(comparison.categories).some((item) => item.unknown > 0)) risks.push('semantic-comparison-has-unknowns');
  if (backupCollision) risks.push('backup-path-collision'); if (replacementTempCollision) risks.push('replacement-temp-path-collision');
  const blockers = [...(activeDriftedSincePersistence ? ['active-archive-drift'] : []), ...(backupCollision ? ['backup-path-exists'] : []), ...(replacementTempCollision ? ['replacement-temp-path-exists'] : []), ...(activeInspection.status === 'ambiguous-certified-profiles' ? ['ambiguous-active-format'] : [])];
  const plan = {
    schema: 'ikemaker.sff-creator-adoption-plan', version: 1, persistedReceiptArtifactByteHash: expected.artifactHash, persistedReceiptHash: expected.receiptHash,
    candidateDispatchReceiptHash: expected.dispatchHash, requestHash: expected.requestHash, specificationHash: expected.specificationHash, logicalHash: receipt.logicalHash, approvalReceiptHash: expected.approvalHash, sourceSnapshotHash: expected.sourceHash, sourceValidationHash: expected.sourceValidationHash, capabilitySnapshotHash: receipt.capabilitySnapshotHash, persistenceValidationHash: expected.persistenceValidationHash,
    candidate: { path: candidate.realpath, identity: candidate.identity, byteHash: candidate.byteHash, byteLength: candidate.byteLength, validatorId: receipt.persistenceValidation.validatorId, validatorVersion: receipt.persistenceValidation.validatorVersion, strictReportHash: candidateStrict.hash, targetId: receipt.selection.targetId },
    active: { path: active.path, realpath: active.realpath, identity: active.identity, byteHash: active.byteHash, byteLength: active.byteLength, fingerprintAtPersistence: receipt.activeArchive, driftedSincePersistence: activeDriftedSincePersistence, inspection: { status: activeInspection.status, targetId: activeInspection.targetId, recognizedVersion: activeInspection.recognizedVersion, successfulProfiles: activeInspection.successes, errors: activeInspection.errors } },
    comparison, summary: comparison.totals, risks: [...new Set(risks)].sort(), blockers: [...new Set(blockers)].sort(),
    proposedPaths: { backupPath, replacementTempPath, destinationPath: active.realpath, backupExists: backupCollision, replacementTempExists: replacementTempCollision },
    rollback: { ...(input.recovery ? { recovery: input.recovery } : {}), sourceByteHash: active.byteHash, proposedInstalledByteHash: candidate.byteHash, rollbackTargetByteHash: active.byteHash },
    eligibleForReview: true, standardAdoptionEligible: blockers.length === 0 && risks.length === 0, requiresElevatedReview: risks.length > 0, reviewRequired: true, humanReviewComplete: false,
    backupCreated: false, replacementCommitted: false, activeArchiveModified: false, adoptionAllowed: false, byteEqualityRequired: false
  };
  plan.planHash = hashCanonical({ ...plan, planHash: undefined }); return deepFreeze(plan);
}

module.exports = { ACTIVE_INSPECTION_LIMIT, createCreatorAdoptionPlan };
