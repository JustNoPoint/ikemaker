'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { hashCanonical } = require('../src/sff_capability_report');
const { INTENT_MANIFEST, RESULT_MANIFEST, createCreatorStructuralPhaseRootInspectorForTest, inspectCreatorStructuralExecutingPhaseRoot } = require('../src/sff_creator_structural_phase_root_inspector');
const { createRealExecutingIntentFixture } = require('./helpers/sff_creator_executing_intent_fixture');

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const h = text => sha(Buffer.from(text));
const json = value => Buffer.from(`${JSON.stringify(value)}\n`);
const seals = tag => ({ vaultRootSeal: { tag: `${tag}-vault` }, workspaceRootSeal: { tag: `${tag}-workspace` }, activeParentSeal: { tag: `${tag}-active` }, candidateParentSeal: { tag: `${tag}-candidate` }, historyRootSeal: { tag: `${tag}-history` } });
function clone(value) { return JSON.parse(JSON.stringify(value)); }

function synthetic(targetId, kind, tag = `${targetId}-${kind}`) {
  const operationId = h(`${tag}-operation`), workspaceId = h(`${tag}-workspace`), priorHash = h(`${tag}-prior`), headHash = h(`${tag}-head`), operationDirectory = path.resolve('synthetic', h(tag)), vaultRoot = path.dirname(operationDirectory), activePath = path.resolve('synthetic', tag, 'active.sff'), candidatePath = path.resolve('synthetic', tag, 'candidate.sff'), historyRoot = path.resolve('synthetic', tag, 'history'), backendId = `backend-${targetId}`, adapterId = `adapter-${targetId}`;
  const priorLifecycle = kind === 'intent' ? 'ExecutionApproved' : 'Executing';
  const common = { operationId, workspaceId, targetId, backendId, adapterId, activePath, candidatePath, historyRoot, parentHeadRecordHash: priorHash };
  let core;
  if (kind === 'intent') core = { schema: 'ikemaker.sff-creator-lifecycle-route-manifest', version: 1, routeId: 'execution-approved-to-executing-intent-v1', lifecycleState: 'Executing', normalizedRouteInput: { intent: 'start-approved-execution' }, parentManifestArtifactName: 'layout-review-execution-approved-route-manifest', parentManifestArtifactByteHash: h(`${tag}-parent-bytes`), parentManifestHash: h(`${tag}-parent-manifest`), parentManifestAuthorityHash: h(`${tag}-parent-authority`), parentManifest: { retained: true }, ...common, executionLayoutApprovalReceiptHash: h(`${tag}-approval`), executionIntentReceiptArtifactName: 'sff17c-execution-intent-receipt', executionIntentReceiptArtifactByteHash: h(`${tag}-intent-byte`), executionIntentReceiptHash: h(`${tag}-intent`), executionIntentReceiptAuthorityHash: h(`${tag}-intent-auth`), executorAuthorityDescriptorArtifactName: 'sff17c-executor-authority-descriptor', executorAuthorityDescriptorArtifactByteHash: h(`${tag}-descriptor-byte`), executorAuthorityDescriptorHash: h(`${tag}-descriptor`), executorAuthorityDescriptorAuthorityHash: h(`${tag}-descriptor-auth`), payloadInventory: [], payloadAuthorities: [] };
  else {
    const parentManifestArtifactByteHash = h(`${tag}-parent-bytes`), parentManifestAuthorityHash = h(`${tag}-parent-authority`);
    core = { schema: kind === 'attempt' ? 'ikemaker.sff-creator-attempt-bound-execution-result-capture-manifest' : 'ikemaker.sff-creator-execution-result-capture-manifest', version: kind === 'attempt' ? 2 : 1, routeId: 'executing-intent-to-result-captured-v1', lifecycleState: 'Executing', phase: 'ResultCaptured', ...common, outcomeClass: 'committed', outcomeReceiptArtifactName: 'sff17d-execution-outcome-receipt', outcomeReceiptArtifactByteHash: h(`${tag}-receipt-byte`), outcomeReceiptHash: h(`${tag}-receipt`), outcomeReceiptAuthorityHash: h(`${tag}-receipt-auth`), verificationArtifactName: 'sff17d-execution-outcome-verification', verificationArtifactByteHash: h(`${tag}-verification-byte`), verificationHash: h(`${tag}-verification`), verificationAuthorityHash: h(`${tag}-verification-auth`), journalChainHash: h(`${tag}-chain`), journalRetention: [], partialJournalRetention: null, parentManifestArtifactName: INTENT_MANIFEST, parentManifestArtifactByteHash, parentManifestHash: h(`${tag}-parent-manifest`), parentManifestAuthorityHash, parentManifest: { retained: true }, payloadInventory: [], payloadAuthorities: [], scope: { kind: 'returned-outcome-gap-only' } };
    if (kind === 'attempt') Object.assign(core, { executionAttemptAuthorityArtifactName: 'sff17d-execution-attempt-authority', executionAttemptAuthorityArtifactByteHash: h(`${tag}-attempt-byte`), executionAttemptAuthoritySemanticHash: h(`${tag}-attempt-semantic`), executionAttemptAuthorityNamedAuthorityHash: h(`${tag}-attempt-auth`), executionAttemptId: h(`${tag}-attempt-id`), executionDispatchCorrelationHash: h(`${tag}-correlation`), retainedIntentAuthorityVerificationHash: h(`${tag}-retained`), preMutationReadinessDurablyRetained: false, liveReadinessHistoricalAuthority: false, executionAttemptCorrelationOnly: true, classificationAuthorityGranted: false, recoveryAuthorityGranted: false, historyAuthorityGranted: false });
  }
  const manifest = { ...core, manifestHash: hashCanonical(core) }, bytes = json(manifest), byteHash = sha(bytes), name = kind === 'intent' ? INTENT_MANIFEST : RESULT_MANIFEST;
  const authorityHash = kind === 'intent' ? hashCanonical({ domain: 'ikemaker.sff-creator-lifecycle-route-manifest-authority', version: 1, routeId: core.routeId, manifestArtifactName: name, manifestArtifactByteHash: byteHash, manifestHash: manifest.manifestHash, lifecycleState: 'Executing', operationId, parentHeadRecordHash: priorHash }) : hashCanonical(kind === 'attempt' ? { domain: 'ikemaker.sff-creator-attempt-bound-result-captured-route-manifest-authority', version: 2, artifactName: name, artifactByteHash: byteHash, manifestHash: manifest.manifestHash, routeId: core.routeId, lifecycleState: 'Executing', phase: 'ResultCaptured', parentHeadRecordHash: priorHash, operationId, targetId, backendId, adapterId, executionAttemptId: core.executionAttemptId, executionDispatchCorrelationHash: core.executionDispatchCorrelationHash, retainedIntentAuthorityVerificationHash: core.retainedIntentAuthorityVerificationHash, executionAttemptAuthoritySemanticHash: core.executionAttemptAuthoritySemanticHash, payloadAuthorities: core.payloadAuthorities } : { domain: 'ikemaker.sff-creator-result-captured-route-manifest-authority', version: 1, artifactName: name, artifactByteHash: byteHash, manifestHash: manifest.manifestHash, routeId: core.routeId, lifecycleState: 'Executing', phase: 'ResultCaptured', parentHeadRecordHash: priorHash, operationId, targetId, backendId, adapterId, payloadAuthorities: core.payloadAuthorities });
  const artifacts = [{ name, path: path.join(operationDirectory, `${name}.json`), byteHash, byteLength: bytes.length, authorityHash, identity: { device: '1', inode: '2' } }], artifactAuthorities = [{ name, hash: authorityHash }], bytesByName = new Map([[name, bytes]]);
  const authority = { schema: 'fixture-snapshot', version: 1, operationDirectory, operationId, workspaceId, targetId, backendId, adapterId, activePath, candidatePath, historyRoot, lifecycleState: 'Executing', semanticHeadRecordHash: headHash, artifacts, binaries: [], artifactAuthorities, terminalHistoryEvidence: null, headCheckpoint: { previousCheckpointHash: priorHash }, chain: [{ sequence: 0, lifecycleState: priorLifecycle, recordHash: priorHash }, { sequence: 1, lifecycleState: 'Executing', previousCheckpointHash: priorHash, recordHash: headHash }], ...seals(tag) };
  const locator = { operationDirectory, expectedOperationId: operationId, expectedLatestCheckpointHash: headHash, expectedVaultRoot: vaultRoot, manifestArtifactName: name, expectedManifestArtifactByteHash: byteHash, expectedManifestHash: manifest.manifestHash, expectedManifestAuthorityHash: authorityHash };
  const snapshot = () => ({ authority: clone(authority), readArtifactBytes(requested) { if (!bytesByName.has(requested)) throw new Error('unknown retained artifact'); return Buffer.from(bytesByName.get(requested)); } });
  return { locator, authority, manifest, bytes, snapshot };
}

for (const target of ['sff-v1', 'sff-v2.0', 'sff-v2.1']) for (const kind of ['intent', 'base', 'attempt']) {
  const f = synthetic(target, kind), inspect = createCreatorStructuralPhaseRootInspectorForTest({ readSnapshot: f.snapshot }), result = inspect(f.locator);
  assert.strictEqual(result.phase, kind === 'intent' ? 'ExecutionIntentRecorded' : 'ResultCaptured');
  assert.strictEqual(result.manifestVariant, kind === 'intent' ? 'execution-intent-v1' : kind === 'attempt' ? 'result-captured-attempt-bound-v2' : 'result-captured-base-v1');
  assert.strictEqual(result.targetId, target); assert.strictEqual(result.structuralOnly, true); assert.strictEqual(result.underlyingSemanticVerificationPerformed, false); assert(Object.isFrozen(result)); assert(Object.values(result.effects).every(value => value === false)); assert(!JSON.stringify(result).includes('copy'));
}

// Contract attacks reach the structural validator, including self-rehashed roots.
for (const mutate of [
  m => { m.routeId = 'wrong-route'; }, m => { m.lifecycleState = 'Completed'; }, m => { m.operationId = h('wrong-op'); },
  m => { m.workspaceId = h('wrong-workspace'); }, m => { m.targetId = 'sff-v9'; }, m => { m.activePath += '.wrong'; }, m => { m.extra = true; }
]) {
  const f = synthetic('sff-v2.1', 'attempt', `attack-${Math.random()}`), changed = clone(f.manifest); mutate(changed); const old = changed.manifestHash; delete changed.manifestHash; changed.manifestHash = hashCanonical(changed); const changedBytes = json(changed), changedHash = sha(changedBytes); f.authority.artifacts.find(row => row.name === RESULT_MANIFEST).byteHash = changedHash; f.authority.artifacts.find(row => row.name === RESULT_MANIFEST).byteLength = changedBytes.length; f.locator.expectedManifestArtifactByteHash = changedHash; f.locator.expectedManifestHash = changed.manifestHash; const base = f.snapshot; f.snapshot = () => { const s = base(); s.authority = clone(f.authority); s.readArtifactBytes = name => name === RESULT_MANIFEST ? Buffer.from(changedBytes) : base().readArtifactBytes(name); return s; }; void old; assert.throws(() => createCreatorStructuralPhaseRootInspectorForTest({ readSnapshot: f.snapshot })(f.locator), /inspector/);
}
{
  const f = synthetic('sff-v2.1', 'base', 'bad-parent'), authority = clone(f.authority); authority.headCheckpoint.previousCheckpointHash = h('different-parent'); const inspect = createCreatorStructuralPhaseRootInspectorForTest({ readSnapshot: () => ({ authority: clone(authority), readArtifactBytes: f.snapshot().readArtifactBytes }) }); assert.throws(() => inspect(f.locator), /immediate prior/);
}
{
  const f = synthetic('sff-v2.1', 'base', 'xor'), authority = clone(f.authority); authority.artifacts.push(clone(authority.artifacts.find(row => row.name === RESULT_MANIFEST))); assert.throws(() => createCreatorStructuralPhaseRootInspectorForTest({ readSnapshot: () => ({ authority: clone(authority), readArtifactBytes: f.snapshot().readArtifactBytes }) })(f.locator), /duplicated/);
}
{
  const result = synthetic('sff-v2.1', 'base', 'both-roots'), intent = synthetic('sff-v2.1', 'intent', 'independent-valid-intent'), authority = clone(result.authority), intentDescriptor = clone(intent.authority.artifacts[0]), intentAuthority = clone(intent.authority.artifactAuthorities[0]); authority.artifacts.push(intentDescriptor); authority.artifactAuthorities.push(intentAuthority);
  const readArtifactBytes = name => name === RESULT_MANIFEST ? Buffer.from(result.bytes) : Buffer.from(intent.bytes);
  assert.throws(() => createCreatorStructuralPhaseRootInspectorForTest({ readSnapshot: () => ({ authority: clone(authority), readArtifactBytes }) })(result.locator), /exact descriptor\/named-authority XOR/);
}
{
  const f = synthetic('sff-v2.1', 'base', 'neither-root'), authority = clone(f.authority); authority.artifacts = []; authority.artifactAuthorities = [];
  assert.throws(() => createCreatorStructuralPhaseRootInspectorForTest({ readSnapshot: () => ({ authority: clone(authority), readArtifactBytes: f.snapshot().readArtifactBytes }) })(f.locator), /exact descriptor\/named-authority XOR/);
}
{
  const f = synthetic('sff-v2.1', 'attempt', 'locator-mismatch'), locator = { ...f.locator, expectedManifestHash: h('wrong') }; assert.throws(() => createCreatorStructuralPhaseRootInspectorForTest({ readSnapshot: f.snapshot })(locator), /semantic hash/);
}
{
  let traps = 0; const proxy = new Proxy({}, { ownKeys() { traps++; return []; }, getPrototypeOf() { traps++; throw new Error('trap'); } }); assert.throws(() => inspectCreatorStructuralExecutingPhaseRoot(proxy), /plain closed/); assert.strictEqual(traps, 0);
  const f = synthetic('sff-v2.1', 'intent', 'getter'); const raw = { ...f.locator }; Object.defineProperty(raw, 'operationDirectory', { enumerable: true, get() { traps++; throw new Error('getter'); } }); assert.throws(() => inspectCreatorStructuralExecutingPhaseRoot(raw), /data property/); assert.strictEqual(traps, 0);
}
{
  const f = synthetic('sff-v2.1', 'attempt', 'toctou'); let calls = 0; const inspect = createCreatorStructuralPhaseRootInspectorForTest({ readSnapshot() { calls++; const s = f.snapshot(); if (calls > 1) s.authority.artifacts.find(row => row.name === RESULT_MANIFEST).identity.inode = '999'; return s; } }); assert.throws(() => inspect(f.locator), /changed during inspection/);
}

// A real B1 head remains identifiable after live active bytes mutate; B1 rejects unsafe inventory first.
{
  const real = createRealExecutingIntentFixture('sff-v2.1', 'structural-phase-root');
  try {
    fs.writeFileSync(real.common.activePath, Buffer.from('post-mutation-active-bytes'));
    const result = inspectCreatorStructuralExecutingPhaseRoot(real.locator); assert.strictEqual(result.phase, 'ExecutionIntentRecorded');
    const foreign = path.join(real.locator.operationDirectory, 'FOREIGN.case-alias'); fs.writeFileSync(foreign, 'foreign'); assert.throws(() => inspectCreatorStructuralExecutingPhaseRoot(real.locator)); fs.unlinkSync(foreign);
    const linked = path.join(real.locator.operationDirectory, 'foreign-hardlink'); fs.linkSync(real.common.activePath, linked); assert.throws(() => inspectCreatorStructuralExecutingPhaseRoot(real.locator)); fs.unlinkSync(linked);
    const partial = path.join(real.locator.operationDirectory, 'checkpoint_999999.json.partial'); fs.writeFileSync(partial, 'partial'); assert.throws(() => inspectCreatorStructuralExecutingPhaseRoot(real.locator)); fs.unlinkSync(partial);
    const lock = path.join(real.locator.operationDirectory, 'mutation.lock'); fs.writeFileSync(lock, '{}'); assert.throws(() => inspectCreatorStructuralExecutingPhaseRoot(real.locator)); fs.unlinkSync(lock);
    if (process.platform !== 'win32') { const link = path.join(real.locator.operationDirectory, 'foreign-symlink'); fs.symlinkSync(real.common.activePath, link); assert.throws(() => inspectCreatorStructuralExecutingPhaseRoot(real.locator)); fs.unlinkSync(link); }
  } finally { fs.rmSync(real.root, { recursive: true, force: true }); }
}

console.log('sff_creator_structural_phase_root_inspector.test.js: all tests passed');
