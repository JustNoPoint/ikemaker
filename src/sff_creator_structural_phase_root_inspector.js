'use strict';

const crypto = require('crypto');
const path = require('path');
const { types: { isProxy } } = require('util');
const { hashCanonical } = require('./sff_capability_report');
const { decodeStrictJsonArtifact } = require('./sff_strict_json_artifact');
const { readCreatorOperationVaultCheckpointSnapshot } = require('./sff_creator_operation_vault');

const INTENT_MANIFEST = 'execution-approved-executing-intent-route-manifest';
const REVIEWED_INTENT_MANIFEST = 'reviewed-execution-approved-executing-intent-route-manifest';
const RESULT_MANIFEST = 'executing-result-captured-route-manifest';
const LOCATOR_KEYS = Object.freeze(['expectedLatestCheckpointHash', 'expectedManifestArtifactByteHash', 'expectedManifestAuthorityHash', 'expectedManifestHash', 'expectedOperationId', 'expectedVaultRoot', 'manifestArtifactName', 'operationDirectory']);
const INTENT_KEYS = Object.freeze(['schema', 'version', 'routeId', 'lifecycleState', 'normalizedRouteInput', 'parentManifestArtifactName', 'parentManifestArtifactByteHash', 'parentManifestHash', 'parentManifestAuthorityHash', 'parentManifest', 'parentHeadRecordHash', 'operationId', 'workspaceId', 'targetId', 'backendId', 'adapterId', 'activePath', 'candidatePath', 'historyRoot', 'executionLayoutApprovalReceiptHash', 'executionIntentReceiptArtifactName', 'executionIntentReceiptArtifactByteHash', 'executionIntentReceiptHash', 'executionIntentReceiptAuthorityHash', 'executorAuthorityDescriptorArtifactName', 'executorAuthorityDescriptorArtifactByteHash', 'executorAuthorityDescriptorHash', 'executorAuthorityDescriptorAuthorityHash', 'payloadInventory', 'payloadAuthorities', 'manifestHash']);
const REVIEWED_INTENT_KEYS = Object.freeze([...INTENT_KEYS, 'productionReviews']);
const RESULT_KEYS = Object.freeze(['activePath', 'adapterId', 'backendId', 'candidatePath', 'historyRoot', 'journalChainHash', 'journalRetention', 'lifecycleState', 'manifestHash', 'operationId', 'outcomeClass', 'outcomeReceiptArtifactByteHash', 'outcomeReceiptArtifactName', 'outcomeReceiptAuthorityHash', 'outcomeReceiptHash', 'parentHeadRecordHash', 'parentManifest', 'parentManifestArtifactByteHash', 'parentManifestArtifactName', 'parentManifestAuthorityHash', 'parentManifestHash', 'partialJournalRetention', 'payloadAuthorities', 'payloadInventory', 'phase', 'routeId', 'schema', 'scope', 'targetId', 'verificationArtifactByteHash', 'verificationArtifactName', 'verificationAuthorityHash', 'verificationHash', 'version', 'workspaceId']);
const ATTEMPT_KEYS = Object.freeze([...RESULT_KEYS, 'classificationAuthorityGranted', 'executionAttemptAuthorityArtifactByteHash', 'executionAttemptAuthorityArtifactName', 'executionAttemptAuthorityNamedAuthorityHash', 'executionAttemptAuthoritySemanticHash', 'executionAttemptCorrelationOnly', 'executionAttemptId', 'executionDispatchCorrelationHash', 'historyAuthorityGranted', 'liveReadinessHistoricalAuthority', 'preMutationReadinessDurablyRetained', 'recoveryAuthorityGranted', 'retainedIntentAuthorityVerificationHash']);
const SHA = /^[0-9a-f]{64}$/;

function fail(message) { throw new Error(`Structural Executing phase-root inspector: ${message}`); }
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function isPlain(value) { if (value === null || typeof value !== 'object' || isProxy(value) || Array.isArray(value) || Buffer.isBuffer(value) || ArrayBuffer.isView(value)) return false; const proto = Object.getPrototypeOf(value); return proto === Object.prototype || proto === null; }
function exactKeys(value, keys, label) { if (!isPlain(value) || Object.getOwnPropertySymbols(value).length || Object.keys(value).length !== keys.length || Object.keys(value).sort().some((key, index) => key !== [...keys].sort()[index])) fail(`${label} fields drifted.`); }
function closed(raw, keys, label) { if (!isPlain(raw) || Object.getOwnPropertySymbols(raw).length) fail(`${label} must be a plain closed object.`); const descriptors = Object.getOwnPropertyDescriptors(raw), own = Object.keys(descriptors).sort(); if (own.length !== keys.length || own.some((key, index) => key !== [...keys].sort()[index])) fail(`${label} fields drifted.`); const out = {}; for (const key of keys) { const descriptor = descriptors[key]; if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value') || Object.hasOwn(descriptor, 'get') || Object.hasOwn(descriptor, 'set')) fail(`${label}.${key} must be an enumerable data property.`); out[key] = descriptor.value; } return out; }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }
function platformPath(value) { return process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value); }
function samePath(left, right) { return typeof left === 'string' && typeof right === 'string' && platformPath(left) === platformPath(right); }
function b1(locator) { return { operationDirectory: locator.operationDirectory, expectedOperationId: locator.expectedOperationId, expectedLatestCheckpointHash: locator.expectedLatestCheckpointHash, expectedVaultRoot: locator.expectedVaultRoot }; }
function rowsNamed(rows, name) { return Array.isArray(rows) ? rows.filter(row => row && row.name === name) : []; }
function identical(left, right) { return JSON.stringify(left) === JSON.stringify(right) && hashCanonical(left) === hashCanonical(right); }
function validateCommon(manifest, authority) {
  for (const key of ['operationId', 'workspaceId', 'targetId', 'backendId', 'adapterId']) if (manifest[key] !== authority[key]) fail(`${key} does not bind the current checkpoint.`);
  for (const key of ['activePath', 'candidatePath', 'historyRoot']) if (!samePath(manifest[key], authority[key])) fail(`${key} does not bind the current checkpoint.`);
  if (!Array.isArray(manifest.payloadInventory) || !Array.isArray(manifest.payloadAuthorities)) fail('manifest payload tables are invalid.');
  for (const row of manifest.payloadInventory) { exactKeys(row, ['authorityHash', 'byteHash', 'byteLength', 'name', 'storage'], 'payload inventory row'); if (!['artifact', 'binary'].includes(row.storage) || typeof row.name !== 'string' || !SHA.test(row.byteHash) || !SHA.test(row.authorityHash) || !Number.isSafeInteger(row.byteLength) || row.byteLength < 0) fail('payload inventory row is invalid.'); }
  for (const row of manifest.payloadAuthorities) { exactKeys(row, ['hash', 'name'], 'payload authority row'); if (typeof row.name !== 'string' || !SHA.test(row.hash)) fail('payload authority row is invalid.'); }
}

function selectRoot(authority, locator) {
  if (!Array.isArray(authority.artifacts) || !Array.isArray(authority.artifactAuthorities)) fail('snapshot payload authority is incomplete.');
  const intentNames = [INTENT_MANIFEST, REVIEWED_INTENT_MANIFEST], intentDescriptors = intentNames.flatMap(name => rowsNamed(authority.artifacts, name)), intentAuthorities = intentNames.flatMap(name => rowsNamed(authority.artifactAuthorities, name)), intentD = intentDescriptors, intentA = intentAuthorities;
  const resultD = rowsNamed(authority.artifacts, RESULT_MANIFEST), resultA = rowsNamed(authority.artifactAuthorities, RESULT_MANIFEST);
  if (intentD.length > 1 || intentA.length > 1 || resultD.length > 1 || resultA.length > 1) fail('phase-root descriptor or named authority is duplicated.');
  if ((intentD.length === 1) !== (intentA.length === 1) || (resultD.length === 1) !== (resultA.length === 1)) fail('phase-root descriptor and named authority are not paired.');
  const hasResult = resultD.length === 1, hasIntent = intentD.length === 1;
  if (hasIntent === hasResult) fail('fixed phase roots must satisfy an exact descriptor/named-authority XOR.');
  const rootName = hasResult ? RESULT_MANIFEST : intentD[0].name;
  if (locator.manifestArtifactName !== rootName) fail('locator does not select the detected phase root.');
  return { rootName, descriptor: (hasResult ? resultD : intentD)[0], named: (hasResult ? resultA : intentA)[0] };
}

function buildInspector(readSnapshot) {
  return function inspectCreatorStructuralExecutingPhaseRoot(rawLocator) {
    const locator = closed(rawLocator, LOCATOR_KEYS, 'locator');
    for (const key of ['expectedLatestCheckpointHash', 'expectedManifestArtifactByteHash', 'expectedManifestAuthorityHash', 'expectedManifestHash', 'expectedOperationId']) if (typeof locator[key] !== 'string' || !SHA.test(locator[key])) fail(`${key} must be an exact SHA-256 hash.`);
    if (![INTENT_MANIFEST, REVIEWED_INTENT_MANIFEST, RESULT_MANIFEST].includes(locator.manifestArtifactName) || typeof locator.operationDirectory !== 'string' || !locator.operationDirectory || typeof locator.expectedVaultRoot !== 'string' || !locator.expectedVaultRoot) fail('locator paths or manifest name are invalid.');
    const before = readSnapshot(b1(locator));
    if (!before || !before.authority || before.authority.lifecycleState !== 'Executing') fail('vault head is not Executing.');
    const selected = selectRoot(before.authority, locator);
    if (selected.descriptor.byteHash !== locator.expectedManifestArtifactByteHash || selected.descriptor.authorityHash !== locator.expectedManifestAuthorityHash || selected.named.hash !== locator.expectedManifestAuthorityHash) fail('selected descriptor or named authority does not match the locator.');
    const bytes = before.readArtifactBytes(selected.rootName);
    if (!Buffer.isBuffer(bytes) || sha(bytes) !== locator.expectedManifestArtifactByteHash || bytes.length !== selected.descriptor.byteLength) fail('selected phase-root bytes drifted.');
    const manifest = decodeStrictJsonArtifact(bytes, 'Executing phase-root manifest').parsed;
    const attempt = selected.rootName === RESULT_MANIFEST && manifest.schema === 'ikemaker.sff-creator-attempt-bound-execution-result-capture-manifest';
    exactKeys(manifest, selected.rootName === INTENT_MANIFEST ? INTENT_KEYS : selected.rootName === REVIEWED_INTENT_MANIFEST ? REVIEWED_INTENT_KEYS : attempt ? ATTEMPT_KEYS : RESULT_KEYS, 'phase-root manifest');
    const { manifestHash, ...manifestCore } = manifest;
    if (!SHA.test(manifestHash) || hashCanonical(manifestCore) !== manifestHash || manifestHash !== locator.expectedManifestHash) fail('manifest semantic hash drifted.');
    const chain = before.authority.chain, prior = Array.isArray(chain) ? chain[chain.length - 2] : null;
    if (!prior || prior.recordHash !== manifest.parentHeadRecordHash || before.authority.headCheckpoint?.previousCheckpointHash !== prior.recordHash) fail('phase root is not bound to the immediate prior checkpoint.');
    validateCommon(manifest, before.authority);
    let phase, variant, routeId, expectedAuthority;
    if ([INTENT_MANIFEST, REVIEWED_INTENT_MANIFEST].includes(selected.rootName)) {
      const reviewed = selected.rootName === REVIEWED_INTENT_MANIFEST; if (manifest.schema !== (reviewed ? 'ikemaker.sff-creator-reviewed-executing-intent-route-manifest' : 'ikemaker.sff-creator-lifecycle-route-manifest') || manifest.version !== 1 || manifest.routeId !== 'execution-approved-to-executing-intent-v1' || manifest.lifecycleState !== 'Executing' || prior.lifecycleState !== 'ExecutionApproved') fail('intent phase-root contract or parent lifecycle drifted.');
      exactKeys(manifest.normalizedRouteInput, ['intent'], 'intent normalizedRouteInput');
      if (manifest.normalizedRouteInput.intent !== 'start-approved-execution') fail('intent literal drifted.');
      expectedAuthority = hashCanonical({ domain: reviewed ? 'ikemaker.sff-creator-reviewed-executing-intent-manifest-authority' : 'ikemaker.sff-creator-lifecycle-route-manifest-authority', version: 1, routeId: manifest.routeId, manifestArtifactName: selected.rootName, manifestArtifactByteHash: sha(bytes), manifestHash, lifecycleState: 'Executing', operationId: manifest.operationId, parentHeadRecordHash: prior.recordHash });
      phase = 'ExecutionIntentRecorded'; variant = reviewed ? 'reviewed-execution-intent-v1' : 'execution-intent-v1'; routeId = manifest.routeId;
    } else {
      if (!['ikemaker.sff-creator-execution-result-capture-manifest', 'ikemaker.sff-creator-attempt-bound-execution-result-capture-manifest'].includes(manifest.schema) || manifest.version !== (attempt ? 2 : 1) || manifest.routeId !== 'executing-intent-to-result-captured-v1' || manifest.lifecycleState !== 'Executing' || manifest.phase !== 'ResultCaptured' || prior.lifecycleState !== 'Executing') fail('ResultCaptured phase-root contract or parent lifecycle drifted.');
      expectedAuthority = hashCanonical(attempt ? { domain: 'ikemaker.sff-creator-attempt-bound-result-captured-route-manifest-authority', version: 2, artifactName: RESULT_MANIFEST, artifactByteHash: sha(bytes), manifestHash, routeId: manifest.routeId, lifecycleState: 'Executing', phase: 'ResultCaptured', parentHeadRecordHash: prior.recordHash, operationId: manifest.operationId, targetId: manifest.targetId, backendId: manifest.backendId, adapterId: manifest.adapterId, executionAttemptId: manifest.executionAttemptId, executionDispatchCorrelationHash: manifest.executionDispatchCorrelationHash, retainedIntentAuthorityVerificationHash: manifest.retainedIntentAuthorityVerificationHash, executionAttemptAuthoritySemanticHash: manifest.executionAttemptAuthoritySemanticHash, payloadAuthorities: manifest.payloadAuthorities } : { domain: 'ikemaker.sff-creator-result-captured-route-manifest-authority', version: 1, artifactName: RESULT_MANIFEST, artifactByteHash: sha(bytes), manifestHash, routeId: manifest.routeId, lifecycleState: 'Executing', phase: 'ResultCaptured', parentHeadRecordHash: prior.recordHash, operationId: manifest.operationId, targetId: manifest.targetId, backendId: manifest.backendId, adapterId: manifest.adapterId, payloadAuthorities: manifest.payloadAuthorities });
      phase = 'ResultCaptured'; variant = attempt ? 'result-captured-attempt-bound-v2' : 'result-captured-base-v1'; routeId = manifest.routeId;
    }
    if (expectedAuthority !== locator.expectedManifestAuthorityHash) fail('phase-root named authority formula drifted.');
    const after = readSnapshot(b1(locator)), selectedAfter = selectRoot(after.authority, locator), bytesAfter = after.readArtifactBytes(selected.rootName);
    if (!identical(before.authority, after.authority) || !identical(selected.descriptor, selectedAfter.descriptor) || !identical(selected.named, selectedAfter.named) || !Buffer.isBuffer(bytesAfter) || !bytes.equals(bytesAfter) || sha(bytesAfter) !== locator.expectedManifestArtifactByteHash) fail('vault or selected phase root changed during inspection.');
    return freeze({ schema: 'ikemaker.sff-creator-structural-executing-phase-root-inspection', version: 1, status: 'verified', lifecycleState: 'Executing', phase, manifestVariant: variant, routeId, operationId: before.authority.operationId, workspaceId: before.authority.workspaceId, targetId: before.authority.targetId, backendId: before.authority.backendId, adapterId: before.authority.adapterId, operationDirectory: locator.operationDirectory, vaultRoot: locator.expectedVaultRoot, activePath: before.authority.activePath, candidatePath: before.authority.candidatePath, historyRoot: before.authority.historyRoot, vaultRootSealHash: hashCanonical(before.authority.vaultRootSeal), workspaceRootSealHash: hashCanonical(before.authority.workspaceRootSeal), activeParentSealHash: hashCanonical(before.authority.activeParentSeal), candidateParentSealHash: hashCanonical(before.authority.candidateParentSeal), historyRootSealHash: hashCanonical(before.authority.historyRootSeal), semanticHeadRecordHash: before.authority.semanticHeadRecordHash, parentHeadRecordHash: prior.recordHash, parentLifecycleState: prior.lifecycleState, selectedManifestArtifactName: selected.rootName, selectedManifestArtifactByteHash: locator.expectedManifestArtifactByteHash, selectedManifestArtifactByteLength: bytes.length, selectedManifestHash: manifestHash, selectedManifestAuthorityHash: expectedAuthority, snapshotAuthorityHash: hashCanonical(before.authority), observationClass: 'filesystem-read-only', structuralOnly: true, underlyingSemanticVerificationPerformed: false, currentStateGuaranteed: false, classificationAllowed: false, historyAllowed: false, recoveryAuthorityGranted: false, executionAuthorityGranted: false, executionAllowed: false, executionStarted: false, writesAllowed: false, effects: { writes: false, processes: false, approvalsGranted: false, backendExecution: false, executionStarted: false, activeArchiveModified: false, historyAppended: false } });
  };
}

const inspectCreatorStructuralExecutingPhaseRoot = buildInspector(readCreatorOperationVaultCheckpointSnapshot);
function createCreatorStructuralPhaseRootInspectorForTest(raw) { const deps = closed(raw, ['readSnapshot'], 'test dependencies'); if (typeof deps.readSnapshot !== 'function') fail('test readSnapshot must be a function.'); return buildInspector(deps.readSnapshot); }

module.exports = { INTENT_MANIFEST, REVIEWED_INTENT_MANIFEST, RESULT_MANIFEST, createCreatorStructuralPhaseRootInspectorForTest, inspectCreatorStructuralExecutingPhaseRoot };
