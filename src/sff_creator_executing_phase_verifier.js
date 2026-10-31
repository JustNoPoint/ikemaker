'use strict';

const { hashCanonical } = require('./sff_capability_report');
const { types: { isProxy } } = require('util');
const { readCreatorOperationVaultCheckpointSnapshot } = require('./sff_creator_operation_vault');
const { REVIEWED_EXECUTING_INTENT_MANIFEST_NAME, verifyCreatorExecutingIntentRouteBridgeFromVault, verifyCreatorReviewedExecutingIntentRouteFromVault } = require('./sff_creator_lifecycle_route_bridge');
const { verifySavedCreatorExecutionResultFromVault } = require('./sff_creator_saved_execution_result_verifier');

const INTENT_MANIFEST = 'execution-approved-executing-intent-route-manifest';
const REVIEWED_INTENT_MANIFEST = REVIEWED_EXECUTING_INTENT_MANIFEST_NAME;
const RESULT_MANIFEST = 'executing-result-captured-route-manifest';
const LOCATOR_KEYS = Object.freeze(['expectedLatestCheckpointHash', 'expectedManifestArtifactByteHash', 'expectedManifestAuthorityHash', 'expectedManifestHash', 'expectedOperationId', 'expectedVaultRoot', 'manifestArtifactName', 'operationDirectory']);
const INTENT_KEYS = Object.freeze(['currentStateGuaranteed', 'effects', 'executionIntentReceipt', 'executionIntentReceiptHash', 'executorAuthorityDescriptor', 'executorAuthorityDescriptorHash', 'lifecycleState', 'observationClass', 'operationId', 'routeId', 'schema', 'semanticHeadRecordHash', 'status', 'version']);
const RESULT_KEYS = Object.freeze(['adapterId', 'backendId', 'capturedObservationClass', 'classificationAllowed', 'currentStateGuaranteed', 'effects', 'evidenceClass', 'executionIntentMetadata', 'executionIntentVerificationHash', 'executorAuthorityDescriptor', 'executorAuthorityDescriptorHash', 'historyAllowed', 'journalChainHash', 'journalDescriptors', 'lifecycleState', 'operationId', 'outcomeClass', 'outcomeReceiptArtifactByteHash', 'outcomeReceiptHash', 'partialJournalEvidence', 'phase', 'priorExecutingHeadRecordHash', 'priorSnapshotAuthorityHash', 'resultManifestArtifactByteHash', 'resultManifestAuthorityHash', 'resultManifestHash', 'schema', 'semanticHeadRecordHash', 'status', 'targetId', 'version']);
const SHA = /^[0-9a-f]{64}$/;

function fail(message) { throw new Error(`Executing phase verifier: ${message}`); }
function isPlain(value) { if (value === null || typeof value !== 'object' || isProxy(value) || Array.isArray(value) || Buffer.isBuffer(value) || ArrayBuffer.isView(value)) return false; const proto = Object.getPrototypeOf(value); return proto === Object.prototype || proto === null; }
function closed(raw, keys, label) { if (!isPlain(raw) || Object.getOwnPropertySymbols(raw).length) fail(`${label} must be a plain closed object.`); const descriptors = Object.getOwnPropertyDescriptors(raw), own = Object.keys(descriptors).sort(); if (own.length !== keys.length || own.some((key, index) => key !== [...keys].sort()[index])) fail(`${label} fields drifted.`); const out = {}; for (const key of keys) { const descriptor = descriptors[key]; if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value') || Object.hasOwn(descriptor, 'get') || Object.hasOwn(descriptor, 'set')) fail(`${label}.${key} must be an enumerable data property.`); out[key] = descriptor.value; } return out; }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }
function pureMetadata(raw, copyName, expectedKeys) { if (!isPlain(raw)) fail('underlying verifier result shape drifted.'); const descriptors = Object.getOwnPropertyDescriptors(raw), keys = Object.keys(descriptors).filter(key => key !== copyName).sort(); if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== [...expectedKeys].sort()[index]) || typeof descriptors[copyName]?.value !== 'function' || !descriptors[copyName].enumerable) fail('underlying verifier metadata fields drifted.'); const out = {}; for (const key of keys) { const descriptor = descriptors[key]; if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail('underlying verifier exposed an accessor or hidden authority.'); if (typeof descriptor.value === 'function' || Buffer.isBuffer(descriptor.value) || ArrayBuffer.isView(descriptor.value)) fail('underlying verifier metadata is not JSON-only.'); out[key] = descriptor.value; } return JSON.parse(JSON.stringify(out)); }
function b1(locator) { return { operationDirectory: locator.operationDirectory, expectedOperationId: locator.expectedOperationId, expectedLatestCheckpointHash: locator.expectedLatestCheckpointHash, expectedVaultRoot: locator.expectedVaultRoot }; }

function buildCreatorExecutingPhaseVerifier(dependencies) {
  const readSnapshot = dependencies?.readSnapshot || readCreatorOperationVaultCheckpointSnapshot;
  const verifyIntent = dependencies?.verifyIntent || verifyCreatorExecutingIntentRouteBridgeFromVault;
  const verifyResult = dependencies?.verifyResult || verifySavedCreatorExecutionResultFromVault;
  return function verifyCreatorExecutingPhaseFromVault(rawLocator) {
    const locator = closed(rawLocator, LOCATOR_KEYS, 'locator');
    for (const key of ['expectedLatestCheckpointHash', 'expectedManifestArtifactByteHash', 'expectedManifestAuthorityHash', 'expectedManifestHash', 'expectedOperationId']) if (typeof locator[key] !== 'string' || !SHA.test(locator[key])) fail(`${key} must be an exact SHA-256 hash.`);
    if (![INTENT_MANIFEST, REVIEWED_INTENT_MANIFEST, RESULT_MANIFEST].includes(locator.manifestArtifactName) || typeof locator.operationDirectory !== 'string' || !locator.operationDirectory || typeof locator.expectedVaultRoot !== 'string' || !locator.expectedVaultRoot) fail('locator root or selected phase manifest is invalid.');
    const before = readSnapshot(b1(locator));
    if (!before || !before.authority || before.authority.lifecycleState !== 'Executing') fail('vault head is not Executing.');
    const artifacts = before.authority.artifacts, authorities = before.authority.artifactAuthorities;
    if (!Array.isArray(artifacts) || !Array.isArray(authorities)) fail('vault snapshot authority is incomplete.');
    const detected = [INTENT_MANIFEST, REVIEWED_INTENT_MANIFEST, RESULT_MANIFEST].filter(name => artifacts.filter(row => row.name === name).length === 1 && authorities.filter(row => row.name === name).length === 1);
    const mentioned = [INTENT_MANIFEST, REVIEWED_INTENT_MANIFEST, RESULT_MANIFEST].filter(name => artifacts.some(row => row.name === name) || authorities.some(row => row.name === name));
    if (detected.length !== 1 || mentioned.length !== 1) fail('Executing phase root must be an exact descriptor/named-authority XOR.');
    const rootName = detected[0], descriptor = artifacts.find(row => row.name === rootName), named = authorities.find(row => row.name === rootName);
    if (rootName !== locator.manifestArtifactName || descriptor.byteHash !== locator.expectedManifestArtifactByteHash || descriptor.authorityHash !== locator.expectedManifestAuthorityHash || named.hash !== locator.expectedManifestAuthorityHash) fail('selected phase-root descriptor or named authority drifted.');
    const isIntent = [INTENT_MANIFEST, REVIEWED_INTENT_MANIFEST].includes(rootName), verification = isIntent ? (rootName === REVIEWED_INTENT_MANIFEST ? verifyCreatorReviewedExecutingIntentRouteFromVault(locator) : verifyIntent(locator)) : verifyResult(locator);
    const pure = pureMetadata(verification, isIntent ? 'copyExecutorInput' : 'copySavedOutcomeEvidence', isIntent ? INTENT_KEYS : RESULT_KEYS);
    if (pure.operationId !== before.authority.operationId || pure.lifecycleState !== 'Executing' || pure.semanticHeadRecordHash !== before.authority.semanticHeadRecordHash) fail('underlying phase verification does not bind the current head.');
    const after = readSnapshot(b1(locator));
    if (hashCanonical(after.authority) !== hashCanonical(before.authority) || JSON.stringify(after.authority) !== JSON.stringify(before.authority)) fail('vault authority changed during Executing phase verification.');
    const phase = isIntent ? 'ExecutionIntentRecorded' : 'ResultCaptured';
    const evidenceClass = isIntent ? 'execution-intent-recorded-evidence' : 'result-captured-evidence';
    const routeId = pure.routeId || 'executing-intent-to-result-captured-v1';
    return freeze({ schema: 'ikemaker.sff-creator-executing-phase-verification', version: 1, status: 'verified', lifecycleState: 'Executing', phase, routeId, evidenceClass, observationClass: 'filesystem-read-only', operationId: before.authority.operationId, workspaceId: before.authority.workspaceId, targetId: before.authority.targetId, backendId: before.authority.backendId, adapterId: before.authority.adapterId, operationDirectory: locator.operationDirectory, vaultRoot: locator.expectedVaultRoot, activePath: before.authority.activePath, candidatePath: before.authority.candidatePath, historyRoot: before.authority.historyRoot, vaultRootSealHash: hashCanonical(before.authority.vaultRootSeal), workspaceRootSealHash: hashCanonical(before.authority.workspaceRootSeal), activeParentSealHash: hashCanonical(before.authority.activeParentSeal), candidateParentSealHash: hashCanonical(before.authority.candidateParentSeal), historyRootSealHash: hashCanonical(before.authority.historyRootSeal), semanticHeadRecordHash: before.authority.semanticHeadRecordHash, selectedManifestArtifactName: rootName, selectedManifestArtifactByteHash: descriptor.byteHash, selectedManifestHash: locator.expectedManifestHash, selectedManifestAuthorityHash: named.hash, snapshotAuthorityHash: hashCanonical(before.authority), underlyingVerificationHash: hashCanonical(pure), currentStateGuaranteed: false, classificationAllowed: false, historyAllowed: false, executionAuthorityGranted: false, executionAllowed: false, executionStarted: false, writesAllowed: false, effects: { writes: false, processes: false, approvalsGranted: false, backendExecution: false, executionStarted: false, activeArchiveModified: false, historyAppended: false } });
  };
}

const verifyCreatorExecutingPhaseFromVault = buildCreatorExecutingPhaseVerifier();
function createCreatorExecutingPhaseVerifierForTest(raw) { const deps = closed(raw, ['readSnapshot', 'verifyIntent', 'verifyResult'], 'test dependencies'); for (const value of Object.values(deps)) if (typeof value !== 'function') fail('test dependencies must be functions.'); return buildCreatorExecutingPhaseVerifier(deps); }

module.exports = { INTENT_MANIFEST, REVIEWED_INTENT_MANIFEST, RESULT_MANIFEST, createCreatorExecutingPhaseVerifierForTest, verifyCreatorExecutingPhaseFromVault };
