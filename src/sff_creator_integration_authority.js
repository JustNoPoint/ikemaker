'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { types: utilTypes } = require('util');
const { canonicalize, hashCanonical } = require('./sff_capability_report');
const { specificationHash } = require('./sff_build_specification');
const { readCreatorOperationVaultCheckpointSnapshot } = require('./sff_creator_operation_vault');
const { decodeStrictJsonArtifact } = require('./sff_strict_json_artifact');

const ARTIFACT_NAME = 'sff13-integration-authority';
const SPECIFICATION_ARTIFACT_NAME = 'legacy-sff-build-specification';
const ROUTE_ARTIFACT_NAME = 'built-in-route-envelope';
const STATE_ROOT_ARTIFACT_NAME = 'sff13-state-root-authority';
const SHA = /^[0-9a-f]{64}$/;
const ROUTES = Object.freeze({
  'sff-v1': Object.freeze({ backendId: 'ikemaker-builtin-sff-v1', adapterId: 'builtin-v1-pcx8' }),
  'sff-v2.0': Object.freeze({ backendId: 'ikemaker-builtin-sff-v2.0', adapterId: 'builtin-v20-raw8' }),
  'sff-v2.1': Object.freeze({ backendId: 'ikemaker-builtin-sff-v21-png8-prerelease', adapterId: 'builtin-v21-png8' })
});
const CREATE_KEYS = Object.freeze(['candidateBuiltParentVaultLocator', 'expectedRouteEnvelopeArtifactByteHash', 'expectedRouteEnvelopeHash', 'expectedSpecificationArtifactByteHash', 'expectedSpecificationHash', 'expectedStateRootAuthorityArtifactByteHash', 'routeEnvelopeArtifactBytes', 'specificationArtifactBytes', 'stateRootAuthorityArtifactBytes']);
const VERIFY_KEYS = Object.freeze(['expectedIntegrationAuthorityArtifactByteHash', 'expectedIntegrationAuthorityHash', 'stateRootAuthorityArtifactBytes', 'vaultLocator']);

function fail(message) { throw new Error(`SFF Creator integration authority: ${message}`); }
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function checkedHash(value, label) { if (typeof value !== 'string' || !SHA.test(value)) fail(`${label} must be a lowercase SHA-256 hash.`); return value; }
function freeze(value) { if (!value || typeof value !== 'object' || Buffer.isBuffer(value) || ArrayBuffer.isView(value) || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
function closed(value, keys, label) { if (!value || typeof value !== 'object' || Array.isArray(value) || Buffer.isBuffer(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(`${label} must contain exactly the required fields.`); const descriptors = Object.getOwnPropertyDescriptors(value); for (const key of keys) if (!descriptors[key]?.enumerable || !Object.prototype.hasOwnProperty.call(descriptors[key], 'value')) fail(`${label}.${key} must be an enumerable data property.`); return Object.fromEntries(keys.map(key => [key, descriptors[key].value])); }
function bytes(value, label) { if (!Buffer.isBuffer(value) || utilTypes.isProxy(value) || !value.length || value.length > 4 * 1024 * 1024) fail(`${label} must be a bounded non-proxy Buffer.`); return Buffer.from(value); }
function samePath(left, right) { const a = path.resolve(left), b = path.resolve(right); return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b; }
function direct(filename, kind) { const lexical = path.resolve(filename), link = fs.lstatSync(lexical, { bigint: true }); if (link.isSymbolicLink() || !(kind === 'directory' ? link.isDirectory() : link.isFile())) fail(`${kind} ${lexical} is linked, replaced, or unavailable.`); const real = fs.realpathSync.native ? fs.realpathSync.native(lexical) : fs.realpathSync(lexical), stat = fs.statSync(real, { bigint: true }); if (!samePath(lexical, real) || String(link.dev) !== String(stat.dev) || String(link.ino) !== String(stat.ino)) fail(`${kind} ${lexical} aliases or changed identity.`); return { path: lexical, realpath: real, identity: { device: String(stat.dev), inode: String(stat.ino) }, byteHash: kind === 'file' ? sha(fs.readFileSync(real)) : undefined }; }
function exact(left, right, label) { if (JSON.stringify(canonicalize(left, label)) !== JSON.stringify(canonicalize(right, label))) fail(`${label} drifted.`); }
function routeCore(envelope) { const { routeEnvelopeHash, ...core } = envelope; return core; }
function verifyStateRootArtifact(rawBytes, expectedByteHash) {
  const artifactBytes = bytes(rawBytes, 'stateRootAuthorityArtifactBytes'), artifactByteHash = sha(artifactBytes); if (artifactByteHash !== checkedHash(expectedByteHash, 'state-root artifact byte hash')) fail('state-root authority artifact bytes drifted.');
  const authority = decodeStrictJsonArtifact(artifactBytes, 'state-root authority artifact').parsed, { authorityHash, ...body } = authority;
  if (authority.schema !== 'ikemaker.sff-creator-state-root-authority' || authority.version !== 1 || checkedHash(authorityHash, 'state-root authorityHash') !== hashCanonical(body) || authority.executionAuthorityGranted !== false || authority.adoptionAllowed !== false || authority.physicalCertificationClaimed !== false) fail('state-root authority is invalid or overclaims authority.');
  const storage = direct(authority.globalStorage.realpath, 'directory'), state = direct(authority.stateRoot.realpath, 'directory'), seal = direct(authority.retainedSeal.path, 'file');
  exact(storage.identity, authority.globalStorage.identity, 'globalStorage identity'); exact(state.identity, authority.stateRoot.identity, 'state-root identity');
  if (!samePath(storage.realpath, authority.globalStorage.realpath) || !samePath(state.realpath, authority.stateRoot.realpath) || seal.byteHash !== authority.retainedSeal.artifactByteHash) fail('state-root retained identity or seal drifted.');
  return { authority, artifactByteHash };
}
function snapshot(locator) { return readCreatorOperationVaultCheckpointSnapshot(closed(locator, ['expectedLatestCheckpointHash', 'expectedOperationId', 'expectedVaultRoot', 'operationDirectory'], 'vault locator')); }

function createCreatorIntegrationAuthority(rawInput) {
  const input = closed(rawInput, CREATE_KEYS, 'creation input'), root = verifyStateRootArtifact(input.stateRootAuthorityArtifactBytes, input.expectedStateRootAuthorityArtifactByteHash), parent = snapshot(input.candidateBuiltParentVaultLocator), a = parent.authority;
  if (a.lifecycleState !== 'RequestReady') fail('integration authority must be created from the exact RequestReady parent.');
  if (!samePath(a.vaultRootSeal.realpath, root.authority.stateRoot.realpath) || a.vaultRootSeal.identity.device !== root.authority.stateRoot.identity.device || a.vaultRootSeal.identity.inode !== root.authority.stateRoot.identity.inode) fail('operation vault is not anchored to the sealed state root.');
  const specificationBytes = bytes(input.specificationArtifactBytes, 'specificationArtifactBytes'), specificationArtifactByteHash = sha(specificationBytes), specification = decodeStrictJsonArtifact(specificationBytes, 'original specification artifact').parsed;
  if (specificationArtifactByteHash !== checkedHash(input.expectedSpecificationArtifactByteHash, 'expectedSpecificationArtifactByteHash') || specification.schema !== 'ikemaker.sff-build-specification' || checkedHash(specification.specificationHash, 'specification.specificationHash') !== checkedHash(input.expectedSpecificationHash, 'expectedSpecificationHash') || specificationHash(specification) !== specification.specificationHash) fail('original specification bytes or semantic hash drifted.');
  const routeBytes = bytes(input.routeEnvelopeArtifactBytes, 'routeEnvelopeArtifactBytes'), routeEnvelopeArtifactByteHash = sha(routeBytes), route = decodeStrictJsonArtifact(routeBytes, 'built-in route envelope').parsed, expectedRouteHash = checkedHash(input.expectedRouteEnvelopeHash, 'expectedRouteEnvelopeHash');
  if (routeEnvelopeArtifactByteHash !== checkedHash(input.expectedRouteEnvelopeArtifactByteHash, 'expectedRouteEnvelopeArtifactByteHash') || route.schema !== 'ikemaker.sff-creator-built-in-route-envelope' || route.version !== 1 || route.routeEnvelopeHash !== expectedRouteHash || sha(Buffer.from(`${JSON.stringify(canonicalize(routeCore(route), 'built-in route envelope'))}\n`)) !== expectedRouteHash) fail('built-in route envelope bytes or hash drifted.');
  const expectedRoute = ROUTES[route.route?.targetId]; if (!expectedRoute || route.route.backendId !== expectedRoute.backendId || route.route.adapterId !== expectedRoute.adapterId || route.specificationHash !== specification.specificationHash || route.specificationArtifactByteHash !== specificationArtifactByteHash) fail('route is not an exact supported built-in specification route.');
  if (a.targetId !== route.route.targetId || a.backendId !== route.route.backendId || a.adapterId !== route.route.adapterId || !samePath(a.activePath, route.target?.path)) fail('vault parent and route target authority differ.');
  const active = direct(a.activePath, 'file'); if (active.byteHash !== route.target.byteHash) fail('active target bytes drifted before CandidateBuilt authority retention.');
  const body = {
    schema: 'ikemaker.sff-creator-integration-authority', version: 1, artifactName: ARTIFACT_NAME,
    operation: { operationId: a.operationId, operationDirectory: a.operationDirectory, requestReadyCheckpointHash: a.semanticHeadRecordHash },
    workspace: { workspaceId: a.workspaceId, root: a.workspaceRootSeal }, stateRoot: { authorityHash: root.authority.authorityHash, artifactByteHash: root.artifactByteHash, root: root.authority.stateRoot, retainedSeal: root.authority.retainedSeal },
    specification: { artifactName: SPECIFICATION_ARTIFACT_NAME, artifactByteHash: specificationArtifactByteHash, specificationHash: specification.specificationHash },
    route: { artifactName: ROUTE_ARTIFACT_NAME, artifactByteHash: routeEnvelopeArtifactByteHash, routeEnvelopeHash: expectedRouteHash, targetId: route.route.targetId, backendId: route.route.backendId, adapterId: route.route.adapterId },
    activeTarget: { path: active.realpath, identity: active.identity, originalByteHash: active.byteHash },
    authorityLimits: { physicalCertificationClaimed: false, executionAuthorityGranted: false, adoptionAllowed: false, historyWriteAuthorityGranted: false }
  };
  const authorityHash = hashCanonical(body), authority = freeze({ ...body, authorityHash }), artifactBytes = Buffer.from(`${JSON.stringify(canonicalize(authority, 'integration authority'))}\n`), artifactByteHash = sha(artifactBytes);
  return freeze({ authority, authorityHash, artifactBytes, artifactByteHash, artifact: { name: ARTIFACT_NAME, bytes: artifactBytes, expectedByteHash: artifactByteHash, authorityHash }, artifactAuthority: { name: ARTIFACT_NAME, hash: authorityHash }, stateRootArtifact: { name: STATE_ROOT_ARTIFACT_NAME, bytes: Buffer.from(input.stateRootAuthorityArtifactBytes), expectedByteHash: root.artifactByteHash, authorityHash: root.authority.authorityHash }, stateRootArtifactAuthority: { name: STATE_ROOT_ARTIFACT_NAME, hash: root.authority.authorityHash } });
}

function verifyCreatorIntegrationAuthorityFromVault(rawInput) {
  const input = closed(rawInput, VERIFY_KEYS, 'verification input'), rootBytes = bytes(input.stateRootAuthorityArtifactBytes, 'stateRootAuthorityArtifactBytes'), root = verifyStateRootArtifact(rootBytes, sha(rootBytes)), retained = snapshot(input.vaultLocator), a = retained.authority;
  const artifactBytes = retained.readArtifactBytes(ARTIFACT_NAME), artifactByteHash = sha(artifactBytes); if (artifactByteHash !== checkedHash(input.expectedIntegrationAuthorityArtifactByteHash, 'expectedIntegrationAuthorityArtifactByteHash')) fail('retained integration authority artifact bytes drifted.');
  const authority = decodeStrictJsonArtifact(artifactBytes, 'retained integration authority').parsed, { authorityHash, ...body } = authority; if (checkedHash(authorityHash, 'integration authorityHash') !== checkedHash(input.expectedIntegrationAuthorityHash, 'expectedIntegrationAuthorityHash') || hashCanonical(body) !== authorityHash) fail('retained integration authority hash drifted.');
  if (authority.artifactName !== ARTIFACT_NAME || authority.operation.operationId !== a.operationId || authority.operation.operationDirectory !== a.operationDirectory || authority.workspace.workspaceId !== a.workspaceId || authority.route.targetId !== a.targetId || authority.route.backendId !== a.backendId || authority.route.adapterId !== a.adapterId || !samePath(authority.activeTarget.path, a.activePath)) fail('integration authority no longer matches vault/workspace/route/target identity.');
  if (authority.stateRoot.authorityHash !== root.authority.authorityHash || authority.stateRoot.artifactByteHash !== root.artifactByteHash || !samePath(a.vaultRootSeal.realpath, root.authority.stateRoot.realpath)) fail('integration authority state-root anchor drifted.');
  const start = a.chain.findIndex(row => row.lifecycleState === 'CandidateBuilt'); if (start < 0) fail('vault chain has no CandidateBuilt authority checkpoint.');
  for (const row of a.chain.slice(start)) { const file = row.artifactFiles.find(item => item.name === ARTIFACT_NAME), named = row.artifactAuthorities.find(item => item.name === ARTIFACT_NAME); if (!file || !named || file.byteHash !== artifactByteHash || file.authorityHash !== authorityHash || named.hash !== authorityHash) fail(`integration authority was not retained immutably at ${row.lifecycleState}.`); }
  const spec = a.artifacts.find(item => item.name === authority.specification.artifactName), route = a.artifacts.find(item => item.name === authority.route.artifactName); if (!spec || spec.byteHash !== authority.specification.artifactByteHash || !route || route.byteHash !== authority.route.artifactByteHash) fail('original specification or route envelope is absent or drifted at the replay head.');
  const active = direct(a.activePath, 'file');
  if (a.lifecycleState !== 'Completed' && (active.byteHash !== authority.activeTarget.originalByteHash || active.identity.device !== authority.activeTarget.identity.device || active.identity.inode !== authority.activeTarget.identity.inode)) fail('active target was replaced or drifted before Completed.');
  if (a.lifecycleState === 'Completed') { const evidence = a.terminalHistoryEvidence, writer = evidence && a.artifacts.find(item => item.name === evidence.writerReceiptArtifactName); if (!writer) fail('Completed replay lacks exact terminal writer evidence.'); const receipt = decodeStrictJsonArtifact(retained.readArtifactBytes(writer.name), 'Completed writer receipt').parsed, recordFile = direct(receipt.final?.path, 'file'); if (recordFile.byteHash !== receipt.historyRecordByteHash || receipt.historyRecordHash !== evidence.historyRecordHash) fail('Completed immutable history record binding drifted.'); const record = decodeStrictJsonArtifact(fs.readFileSync(recordFile.realpath), 'Completed immutable history record').parsed, activeRow = record.reconciliationRows?.find(row => row.name === 'active'); if (!activeRow || activeRow.status !== 'matched' || !samePath(activeRow.path, active.realpath) || activeRow.byteHash !== active.byteHash || record.currentStateHash !== receipt.currentStateHash || record.historyRecordHash !== evidence.historyRecordHash) fail('Completed active target does not match retained terminal reconciliation authority.'); }
  const result = { schema: 'ikemaker.sff-creator-integration-authority-verification', version: 1, status: 'verified', lifecycleState: a.lifecycleState, operationId: a.operationId, workspaceId: a.workspaceId, authorityHash, artifactByteHash, specificationHash: authority.specification.specificationHash, routeEnvelopeHash: authority.route.routeEnvelopeHash, targetId: authority.route.targetId, backendId: authority.route.backendId, adapterId: authority.route.adapterId, activePath: active.realpath, stateRootAuthorityHash: root.authority.authorityHash, retainedFromCandidateBuiltThroughHead: true, physicalCertificationClaimed: false, executionAuthorityGranted: false, adoptionAllowed: false };
  return freeze({ ...result, verificationHash: hashCanonical(result) });
}

function verifyRetainedCreatorIntegrationAuthorityFromVault(vaultLocator) {
  const retained = snapshot(vaultLocator), integration = retained.authority.artifacts.find(row => row.name === ARTIFACT_NAME), state = retained.authority.artifacts.find(row => row.name === STATE_ROOT_ARTIFACT_NAME), named = retained.authority.artifactAuthorities.find(row => row.name === ARTIFACT_NAME);
  if (!integration || !state || !named) fail('required retained integration/state-root authority is missing.');
  return verifyCreatorIntegrationAuthorityFromVault({ vaultLocator, stateRootAuthorityArtifactBytes: retained.readArtifactBytes(STATE_ROOT_ARTIFACT_NAME), expectedIntegrationAuthorityArtifactByteHash: integration.byteHash, expectedIntegrationAuthorityHash: named.hash });
}

module.exports = { ARTIFACT_NAME, ROUTE_ARTIFACT_NAME, SPECIFICATION_ARTIFACT_NAME, STATE_ROOT_ARTIFACT_NAME, createCreatorIntegrationAuthority, verifyCreatorIntegrationAuthorityFromVault, verifyRetainedCreatorIntegrationAuthorityFromVault };
