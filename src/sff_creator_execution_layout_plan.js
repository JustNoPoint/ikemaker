'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { types: utilTypes } = require('util');
const { decodeStrictJsonArtifact } = require('./sff_strict_json_artifact');
const { canonicalize, hashCanonical } = require('./sff_capability_report');
const { approveCreatorAdoptionPlan } = require('./sff_creator_adoption_approval');

const SHA256 = /^[0-9a-f]{64}$/i;
const PROFILE_ID = 'portable-journaled-two-rename-v1';
const INPUT_KEYS = Object.freeze(['adoptionApprovalInput', 'adoptionApprovalReceiptArtifactBytes', 'expectedAdoptionApprovalReceiptArtifactByteHash', 'expectedAdoptionApprovalReceiptHash', 'expectedReplacementCapabilityArtifactByteHash', 'replacementCapabilityArtifactBytes']);
const CAPABILITY_KEYS = Object.freeze(['arch', 'checks', 'evidenceGeneratorVersion', 'filesystem', 'fixtureManifestHash', 'nodeVersion', 'platform', 'profileId', 'profileVersion', 'schema', 'testedAt', 'tester', 'version']);
const CHECK_KEYS = Object.freeze(['directoryFsyncStatus', 'fileFsyncObserved', 'openHandleRenameObserved', 'renameToAbsentObserved']);
const STATES = Object.freeze(['prepared', 'backup_verified', 'candidate_staged', 'aborted_before_replacement', 'replacement_started', 'active_held', 'candidate_installed', 'installed_verified', 'committed', 'cleanup_complete', 'rollback_started', 'failed_install_held', 'active_restored', 'rolled_back', 'manual_recovery_required']);
const TRANSITIONS = Object.freeze({ prepared: Object.freeze(['backup_verified', 'aborted_before_replacement', 'manual_recovery_required']), backup_verified: Object.freeze(['candidate_staged', 'aborted_before_replacement', 'manual_recovery_required']), candidate_staged: Object.freeze(['replacement_started', 'aborted_before_replacement', 'manual_recovery_required']), aborted_before_replacement: Object.freeze([]), replacement_started: Object.freeze(['active_held', 'rollback_started', 'manual_recovery_required']), active_held: Object.freeze(['candidate_installed', 'rollback_started', 'manual_recovery_required']), candidate_installed: Object.freeze(['installed_verified', 'rollback_started', 'manual_recovery_required']), installed_verified: Object.freeze(['committed', 'rollback_started', 'manual_recovery_required']), committed: Object.freeze(['cleanup_complete']), cleanup_complete: Object.freeze([]), rollback_started: Object.freeze(['failed_install_held', 'active_restored', 'manual_recovery_required']), failed_install_held: Object.freeze(['active_restored', 'manual_recovery_required']), active_restored: Object.freeze(['rolled_back', 'manual_recovery_required']), rolled_back: Object.freeze([]), manual_recovery_required: Object.freeze([]) });
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function checkedHash(value, label) { if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(`${label} must be a SHA-256 hash string.`); return value.toLowerCase(); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(deepFreeze); return value; }
function closed(value, keys, label) { if (!value || typeof value !== 'object' || Array.isArray(value) || Buffer.isBuffer(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain non-proxy object.`); const descriptors = Object.getOwnPropertyDescriptors(value), found = Object.keys(descriptors).sort(); if (Object.getOwnPropertySymbols(value).length || JSON.stringify(found) !== JSON.stringify([...keys].sort())) throw new Error(`${label} must contain exactly the reviewed fields.`); for (const key of found) if (!descriptors[key].enumerable || !Object.prototype.hasOwnProperty.call(descriptors[key], 'value')) throw new Error(`${label}.${key} must be an enumerable data property.`); return Object.fromEntries(found.map((key) => [key, descriptors[key].value])); }
function exact(left, right, label) { if (JSON.stringify(canonicalize(left, label)) !== JSON.stringify(canonicalize(right, label))) throw new Error(`${label} does not exactly match rederived authority.`); }
function platformKey(value) { return process.platform === 'win32' || process.platform === 'darwin' ? String(value).toLowerCase() : String(value); }
function statIdentity(stat) { return { device: String(stat.dev), inode: String(stat.ino) }; }
function sameIdentity(stat, identity) { return String(stat.dev) === String(identity?.device) && String(stat.ino) === String(identity?.inode); }
function leaf(parent, name) { if (!/^[A-Za-z0-9._-]{1,220}$/.test(name) || path.basename(name) !== name) throw new Error(`Derived execution basename is unsafe: ${name}`); const result = path.join(parent, name); if (path.dirname(result) !== parent) throw new Error('Derived execution path escaped its active directory.'); return result; }

function createCreatorExecutionLayoutPlan(rawInput = {}) {
  const input = closed(rawInput, INPUT_KEYS, 'Creator execution-layout input'), rederived = approveCreatorAdoptionPlan(input.adoptionApprovalInput);
  const savedApproval = decodeStrictJsonArtifact(input.adoptionApprovalReceiptArtifactBytes, 'Creator adoption approval receipt'), approvalArtifactHash = sha(savedApproval.bytes), expectedApprovalArtifactHash = checkedHash(input.expectedAdoptionApprovalReceiptArtifactByteHash, 'expectedAdoptionApprovalReceiptArtifactByteHash'), expectedApprovalHash = checkedHash(input.expectedAdoptionApprovalReceiptHash, 'expectedAdoptionApprovalReceiptHash');
  if (approvalArtifactHash !== expectedApprovalArtifactHash || hashCanonical(savedApproval.parsed) !== expectedApprovalHash || rederived.receiptHash !== expectedApprovalHash) throw new Error('Adoption approval artifact or independently retained receipt hash drifted.');
  exact(savedApproval.parsed, rederived.receipt, 'saved adoption approval receipt');
  if (rederived.receipt.executionAllowed !== false || rederived.receipt.adoptionAllowed !== false || rederived.receipt.currentStateGuaranteed !== false || rederived.receipt.adoptionPlanApproved !== true) throw new Error('Adoption approval receipt is outside the pure reviewed-plan authority.');

  const capabilityArtifact = decodeStrictJsonArtifact(input.replacementCapabilityArtifactBytes, 'Replacement capability evidence'), capabilityArtifactHash = sha(capabilityArtifact.bytes), expectedCapabilityHash = checkedHash(input.expectedReplacementCapabilityArtifactByteHash, 'expectedReplacementCapabilityArtifactByteHash');
  if (capabilityArtifactHash !== expectedCapabilityHash) throw new Error('Replacement capability artifact byte hash does not match the independently retained hash.');
  const capability = closed(capabilityArtifact.parsed, CAPABILITY_KEYS, 'replacement capability evidence'); closed(capability.checks, CHECK_KEYS, 'replacement capability evidence.checks'); closed(capability.filesystem, ['device', 'parentRealpath'], 'replacement capability evidence.filesystem');
  if (capability.schema !== 'ikemaker.sff-replacement-capability-evidence' || capability.version !== 1 || capability.profileId !== PROFILE_ID || capability.profileVersion !== 1 || !SHA256.test(String(capability.fixtureManifestHash || ''))) throw new Error('Replacement capability evidence has an unsupported schema, profile, or fixture hash.');
  if (!Number.isSafeInteger(capability.evidenceGeneratorVersion) || capability.evidenceGeneratorVersion < 1 || typeof capability.tester !== 'string' || !capability.tester.trim() || capability.tester.length > 200 || typeof capability.testedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(capability.testedAt)) throw new Error('Replacement capability evidence provenance is malformed.');
  if (typeof capability.platform !== 'string' || typeof capability.arch !== 'string' || typeof capability.nodeVersion !== 'string' || typeof capability.filesystem.parentRealpath !== 'string' || typeof capability.filesystem.device !== 'string') throw new Error('Replacement capability environment binding is malformed.');

  const active = rederived.receipt.active, activeDirectory = path.dirname(active.realpath), directoryRealpath = fs.realpathSync.native(activeDirectory), directoryStat = fs.statSync(directoryRealpath, { bigint: true });
  if (!directoryStat.isDirectory() || path.resolve(directoryRealpath) !== path.resolve(activeDirectory)) throw new Error('Approved active directory identity or realpath drifted.');
  const blockers = [], risks = ['external-path-race-not-excluded', 'non-atomic-two-rename-window'];
  if (!['win32', 'linux', 'darwin'].includes(process.platform)) blockers.push('replacement-platform-contract-unavailable');
  if (capability.platform !== process.platform || capability.arch !== process.arch || capability.nodeVersion !== process.version || platformKey(path.resolve(capability.filesystem.parentRealpath)) !== platformKey(path.resolve(directoryRealpath)) || String(capability.filesystem.device) !== String(directoryStat.dev)) blockers.push('replacement-capability-environment-drift');
  if (capability.checks.renameToAbsentObserved !== true || capability.checks.fileFsyncObserved !== true || capability.checks.openHandleRenameObserved !== true) blockers.push('replacement-capability-required-check-failed');
  if (!['completed', 'unsupported-by-platform'].includes(capability.checks.directoryFsyncStatus)) blockers.push('replacement-capability-directory-fsync-invalid');
  if (capability.checks.directoryFsyncStatus !== 'completed') risks.push('directory-entry-durability-unproven');

  const operationId = expectedApprovalHash;
  const paths = {
    destinationPath: rederived.receipt.paths.destinationPath, backupPath: rederived.receipt.paths.backupPath, replacementTempPath: rederived.receipt.paths.replacementTempPath,
    leasePath: leaf(directoryRealpath, `.ikemaker-sff-${operationId}.lease`), backupPartialPath: leaf(directoryRealpath, `.ikemaker-sff-${operationId}.backup.partial`),
    rollbackHoldPath: leaf(directoryRealpath, `.ikemaker-sff-${operationId}.rollback-hold.sff`), failedInstallHoldPath: leaf(directoryRealpath, `.ikemaker-sff-${operationId}.failed-install.sff`), rollbackTempPath: leaf(directoryRealpath, `.ikemaker-sff-${operationId}.rollback-temp.sff`)
  };
  paths.journalPaths = Object.fromEntries(STATES.map((state, index) => [state, leaf(directoryRealpath, `.ikemaker-sff-${operationId}.journal.${String(index).padStart(2, '0')}-${state}.json`)]));
  const allPaths = [...Object.values(paths).filter((value) => typeof value === 'string'), ...Object.values(paths.journalPaths)], keys = allPaths.map(platformKey);
  if (new Set(keys).size !== keys.length) blockers.push('execution-path-alias');
  for (const filename of allPaths) if (path.dirname(path.resolve(filename)) !== path.resolve(directoryRealpath)) blockers.push('execution-path-escaped-active-directory');
  if (path.resolve(paths.destinationPath) !== path.resolve(active.realpath)) blockers.push('destination-path-drift');
  const inventory = fs.readdirSync(directoryRealpath).sort(), foldedInventory = new Set(inventory.map(platformKey)), observations = {};
  for (const [name, filename] of Object.entries({ ...paths, ...paths.journalPaths })) if (typeof filename === 'string') { const isDestination = name === 'destinationPath'; const exists = foldedInventory.has(platformKey(path.basename(filename))) || fs.existsSync(filename); observations[name] = { basename: path.basename(filename), exists }; if (isDestination ? !exists : exists) blockers.push(isDestination ? 'destination-missing' : `execution-path-exists:${name}`); }
  const directoryObservation = { directoryRealpath, directoryIdentity: statIdentity(directoryStat), inventory, observations }, directoryObservationHash = hashCanonical(directoryObservation);
  const stateMachine = {
    id: 'ikemaker.sff-portable-two-rename-recovery', version: 1, states: STATES, transitions: TRANSITIONS,
    journalRecordContract: {
      schema: 'ikemaker.sff-creator-execution-journal-record', version: 1, appendOnlyExclusiveCreate: true, hashAlgorithm: 'sha256-canonical-json', hashChained: true, directorySyncAfterRecord: true,
      requiredFields: ['schema', 'version', 'operationId', 'layoutApprovalReceiptHash', 'sequence', 'state', 'previousState', 'previousRecordHash', 'observedPaths', 'recordHash'],
      observedPathFields: ['path', 'exists', 'identity', 'byteHash', 'byteLength'], firstPreviousState: null, firstPreviousRecordHash: null
    },
    rollbackPreference: ['rollbackHoldPath', 'backupPath-via-rollbackTempPath'], cancellationBeforeReplacementStarted: 'write-aborted-before-replacement', cancellationAfterReplacementStarted: 'deferred-until-installed-or-rolled-back'
  };
  const plan = {
    schema: 'ikemaker.sff-creator-execution-layout-plan', version: 1, adoptionApprovalReceiptArtifactByteHash: approvalArtifactHash, adoptionApprovalReceiptHash: expectedApprovalHash,
    approvedObservationPlanHash: rederived.receipt.approvedObservationPlanHash, adoptionPlanArtifactByteHash: rederived.receipt.adoptionPlanArtifactByteHash, persistedReceiptArtifactByteHash: rederived.receipt.persistedReceiptArtifactByteHash, persistedReceiptHash: rederived.receipt.persistedReceiptHash, candidateDispatchReceiptHash: rederived.receipt.candidateDispatchReceiptHash,
    requestHash: rederived.receipt.requestHash, specificationHash: rederived.receipt.specificationHash, logicalHash: rederived.receipt.logicalHash, projectionApprovalReceiptHash: rederived.receipt.approvalReceiptHash,
    sourceSnapshotHash: rederived.receipt.sourceSnapshotHash, sourceValidationHash: rederived.receipt.sourceValidationHash, capabilitySnapshotHash: rederived.receipt.capabilitySnapshotHash, persistenceValidationHash: rederived.receipt.persistenceValidationHash, adoptionApprovalDecisionHash: rederived.receipt.approvalDecisionHash,
    active: rederived.receipt.active, candidate: rederived.receipt.candidate,
    activeDirectory: { path: activeDirectory, realpath: directoryRealpath, identity: statIdentity(directoryStat), device: String(directoryStat.dev) }, paths, replacementProfile: { id: PROFILE_ID, version: 1, atomic: false, crashDurabilityGuaranteed: false, capabilityBasis: 'platform-contract-plus-caller-retained-host-observation', independentlyCertified: false, directoryFsyncObserved: capability.checks.directoryFsyncStatus === 'completed', capabilityArtifactByteHash: capabilityArtifactHash, capability },
    stateMachine, stateMachineHash: hashCanonical(stateMachine), rollback: { oldActiveByteHash: active.byteHash, candidateByteHash: rederived.receipt.candidate.byteHash, fallbackBackupByteHash: rederived.receipt.rollback.sourceByteHash },
    directoryObservation, directoryObservationHash, blockers: [...new Set(blockers)].sort(), risks: [...new Set(risks)].sort(), reviewRequired: true, executionLayoutApproved: false, executionAuthorityGranted: false, executionAllowed: false, writesCommitted: false, adoptionCompleted: false, activeArchiveModified: false, currentStateGuaranteed: false, byteEqualityRequired: false
  };
  plan.layoutPlanHash = hashCanonical({ ...plan, layoutPlanHash: undefined }); return deepFreeze(plan);
}

module.exports = { PROFILE_ID, STATES, TRANSITIONS, createCreatorExecutionLayoutPlan };
