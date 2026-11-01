'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { hashCanonical } = require('../src/sff_capability_report');
const { createCreatorAttemptBoundExecutionResultCaptureForTest, createCreatorExecutionResultCaptureForTest } = require('../src/sff_creator_execution_result_capture');
const { appendCreatorOperationCheckpoint, createCreatorOperationVault, readCreatorOperationVaultCheckpointSnapshot } = require('../src/sff_creator_operation_vault');
const { createCreatorCommandGatePlan } = require('../src/sff_creator_command_gate');
const { createCreatorExecutionDispatchAuthority } = require('../src/sff_creator_execution_dispatch_authority');
const { executeCreatorAdoption } = require('../src/sff_creator_transactional_executor');
const { createCreatorExecutionOutcomeVerifierForTest } = require('../src/sff_creator_execution_outcome_verifier');
const { verifySavedCreatorExecutionResultFromVault } = require('../src/sff_creator_saved_execution_result_verifier');
const { verifyCreatorExecutingPhaseFromVault } = require('../src/sff_creator_executing_phase_verifier');
const { createRealExecutingIntentFixture } = require('./helpers/sff_creator_executing_intent_fixture');

function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function h(label) { return sha(Buffer.from(label)); }
function json(value) { return Buffer.from(`${JSON.stringify(value)}\n`); }
function identity(filename) { const stat = fs.statSync(filename, { bigint: true }); return { device: String(stat.dev), inode: String(stat.ino) }; }

function fixture(tag, targetId = 'sff-v2.1', options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `ikemaker-result-capture-${tag}-`));
  const operationDirectory = path.join(root, 'vault', h(tag)); fs.mkdirSync(operationDirectory, { recursive: true });
  const executorDescriptor = { schema: 'ikemaker.sff-creator-executor-authority-descriptor', version: 1, projection: { executionLayoutApprovalInput: 'fixture', executionLayoutApprovalReceiptArtifactBytes: 'fixture' }, hashes: { expectedExecutionLayoutApprovalReceiptArtifactByteHash: h('approval-artifact'), expectedExecutionLayoutApprovalReceiptHash: h('approval'), expectedExecutionLayoutPlanHash: h('layout') } }, executorDescriptorBytes = json(executorDescriptor);
  const manifestCore = { schema: 'ikemaker.sff-creator-lifecycle-route-manifest', version: 1, routeId: 'execution-approved-to-executing-intent-v1', lifecycleState: 'Executing', normalizedRouteInput: { intent: 'start-approved-execution' }, parentManifestArtifactName: 'layout-review-execution-approved-route-manifest', parentManifestArtifactByteHash: h(`${tag}-parent-bytes`), parentManifestHash: h(`${tag}-parent-manifest`), parentManifestAuthorityHash: h(`${tag}-parent-authority`), parentManifest: { retained: true }, parentHeadRecordHash: h(`${tag}-prior-head`), operationId: h(`${tag}-operation`), workspaceId: h(`${tag}-workspace`), targetId, backendId: `backend-${targetId}`, adapterId: `adapter-${targetId}`, activePath: path.join(root, 'active.sff'), candidatePath: path.join(root, 'candidate.sff'), historyRoot: path.join(root, 'history'), executionLayoutApprovalReceiptHash: h('approval'), executionIntentReceiptArtifactName: 'sff17c-execution-intent-receipt', executionIntentReceiptArtifactByteHash: h(`${tag}-intent-bytes`), executionIntentReceiptHash: h(`${tag}-intent`), executionIntentReceiptAuthorityHash: h(`${tag}-intent-authority`), executorAuthorityDescriptorArtifactName: 'sff17c-executor-authority-descriptor', executorAuthorityDescriptorArtifactByteHash: sha(executorDescriptorBytes), executorAuthorityDescriptorHash: hashCanonical(executorDescriptor), executorAuthorityDescriptorAuthorityHash: h(`${tag}-descriptor-authority`), payloadInventory: [], payloadAuthorities: [] };
  const parentManifest = { ...manifestCore, manifestHash: hashCanonical(manifestCore) }, parentManifestBytes = json(parentManifest);
  const retainedArtifact = Buffer.from(`artifact-${tag}`), retainedBinary = Buffer.from(`binary-${tag}`);
  const locator = { operationDirectory, expectedOperationId: manifestCore.operationId, expectedLatestCheckpointHash: h(`${tag}-head`), expectedVaultRoot: path.join(root, 'vault'), manifestArtifactName: 'execution-approved-executing-intent-route-manifest', expectedManifestArtifactByteHash: sha(parentManifestBytes), expectedManifestAuthorityHash: h(`${tag}-manifest-authority`), expectedManifestHash: parentManifest.manifestHash };
  const artifacts = [{ name: locator.manifestArtifactName, path: path.join(operationDirectory, 'manifest'), byteHash: sha(parentManifestBytes), byteLength: parentManifestBytes.length, authorityHash: locator.expectedManifestAuthorityHash, identity: { device: '1', inode: '1' } }, { name: 'retained-artifact', path: path.join(operationDirectory, 'artifact'), byteHash: sha(retainedArtifact), byteLength: retainedArtifact.length, authorityHash: h(`${tag}-artifact-authority`), identity: { device: '1', inode: '2' } }, { name: manifestCore.executorAuthorityDescriptorArtifactName, path: path.join(operationDirectory, 'executor-descriptor'), byteHash: sha(executorDescriptorBytes), byteLength: executorDescriptorBytes.length, authorityHash: manifestCore.executorAuthorityDescriptorAuthorityHash, identity: { device: '1', inode: '4' } }];
  const binaries = [{ name: 'retained-binary', path: path.join(operationDirectory, 'binary'), byteHash: sha(retainedBinary), byteLength: retainedBinary.length, authorityHash: h(`${tag}-binary-authority`), identity: { device: '1', inode: '3' } }];
  const authorities = [{ name: locator.manifestArtifactName, hash: locator.expectedManifestAuthorityHash }, { name: 'retained-artifact', hash: artifacts[1].authorityHash }, { name: manifestCore.executorAuthorityDescriptorArtifactName, hash: artifacts[2].authorityHash }, { name: 'retained-binary', hash: binaries[0].authorityHash }];
  if (options.extraCount) for (let i = 0; i < options.extraCount; i++) { const name = `extra-${String(i).padStart(3, '0')}`, bytes = Buffer.from([i & 255]); artifacts.push({ name, path: path.join(operationDirectory, name), byteHash: sha(bytes), byteLength: bytes.length, authorityHash: h(`${tag}-${name}`), identity: { device: '1', inode: String(10 + i) } }); authorities.push({ name, hash: h(`${tag}-${name}`) }); }
  const bytesByName = new Map([[locator.manifestArtifactName, parentManifestBytes], ['retained-artifact', retainedArtifact], [manifestCore.executorAuthorityDescriptorArtifactName, executorDescriptorBytes], ['retained-binary', retainedBinary]]);
  for (const row of artifacts.slice(3)) bytesByName.set(row.name, Buffer.from([Number(row.name.slice(-3)) & 255]));
  const authority = { lifecycleState: 'Executing', semanticHeadRecordHash: locator.expectedLatestCheckpointHash, operationId: locator.expectedOperationId, workspaceId: h(`${tag}-workspace`), targetId, backendId: `backend-${targetId}`, adapterId: `adapter-${targetId}`, activePath: path.join(root, 'active.sff'), candidatePath: path.join(root, 'candidate.sff'), historyRoot: path.join(root, 'history'), artifacts, binaries, artifactAuthorities: authorities, chain: [{ sequence: 0, recordHash: locator.expectedLatestCheckpointHash }] };
  const journalRows = [];
  for (let sequence = 0; sequence < 2; sequence++) { const state = sequence === 0 ? 'prepared' : 'aborted_before_replacement', filename = path.join(root, `journal-${sequence}.json`), record = { schema: 'journal', version: 1, state, sequence, recordHash: h(`${tag}-record-${sequence}`) }, bytes = json(record); fs.writeFileSync(filename, bytes); journalRows.push({ state, sequence, path: filename, recordHash: record.recordHash, fileByteHash: sha(bytes), byteLength: bytes.length, identity: identity(filename) }); }
  let partial = null;
  if (options.partial) { const filename = path.join(root, 'journal-partial.bin'), bytes = Buffer.from('opaque-not-json'); fs.writeFileSync(filename, bytes); partial = { state: 'manual_recovery_required', path: filename, fileByteHash: sha(bytes), byteLength: bytes.length, identity: identity(filename) }; }
  const verification = { schema: 'ikemaker.sff-creator-execution-outcome-verification', version: 1, status: 'verified', outcomeClass: options.outcomeClass || (options.partial ? 'uncertain-failure' : 'aborted-before-replacement'), outcomeReceiptArtifactByteHash: null, outcomeReceiptHash: null, journalDescriptors: journalRows, journalChainHash: h(`${tag}-chain`), partialJournalEvidence: partial, parentIntentVerificationHash: h(`${tag}-intent`), parentSnapshotAuthorityHash: hashCanonical(authority), authoritySummary: { operationId: locator.expectedOperationId, workspaceId: authority.workspaceId, targetId, backendId: authority.backendId, adapterId: authority.adapterId, executionLayoutApprovalReceiptArtifactByteHash: h('approval-artifact'), executionLayoutApprovalReceiptHash: h('approval'), executionLayoutPlanHash: h('layout'), activeByteHash: h('active'), candidateByteHash: h('candidate') }, observedOutcome: { retained: true }, classificationAllowed: false, historyAllowed: false, currentStateGuaranteed: false, verifierEffects: { writes: false, processes: false, approvalsGranted: false, backendExecution: false } };
  const receipt = { schema: 'fixture-outcome', version: 1, operationId: locator.expectedOperationId, targetId }, receiptBytes = json(receipt); verification.outcomeReceiptArtifactByteHash = sha(receiptBytes); verification.outcomeReceiptHash = hashCanonical(receipt);
  let reads = 0, drift = false;
  function snapshot() { reads++; const copy = JSON.parse(JSON.stringify(authority)); if (drift && reads > 1) copy.workspaceId = h('drift'); return { authority: copy, readArtifactBytes(name) { if (!bytesByName.has(name)) throw new Error('unknown artifact'); return Buffer.from(bytesByName.get(name)); }, readBinaryBytes(name) { if (!bytesByName.has(name)) throw new Error('unknown binary'); return Buffer.from(bytesByName.get(name)); } }; }
  const capture = createCreatorExecutionResultCaptureForTest({ readSnapshot: snapshot, verifyOutcome() { return JSON.parse(JSON.stringify(verification)); } });
  const input = { executingIntentVaultLocator: locator, outcomeReceiptArtifactBytes: receiptBytes, expectedOutcomeReceiptArtifactByteHash: sha(receiptBytes), expectedOutcomeReceiptHash: hashCanonical(receipt) };
  return { root, authority, bytesByName, capture, input, locator, journalRows, verification, get reads() { return reads; }, setDrift() { drift = true; } };
}

function actualVaultFixture(tag, targetId) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `ikemaker-result-capture-b1-${tag}-`)), workspace = path.join(root, 'workspace'), vaultRoot = path.join(root, 'vault'), historyRoot = path.join(root, 'history'); for (const dir of [workspace, vaultRoot, historyRoot]) fs.mkdirSync(dir);
  const activePath = path.join(workspace, 'active.sff'), candidatePath = path.join(workspace, 'candidate.sff'); fs.writeFileSync(activePath, 'old'); fs.writeFileSync(candidatePath, 'candidate');
  const operationId = h(`actual-${tag}`), workspaceId = h(`actual-${tag}-workspace`), backendId = `backend-${targetId}`, adapterId = `adapter-${targetId}`, descriptor = { schema: 'ikemaker.sff-creator-executor-authority-descriptor', version: 1, projection: { executionLayoutApprovalInput: 'fixture', executionLayoutApprovalReceiptArtifactBytes: 'fixture' }, hashes: { expectedExecutionLayoutApprovalReceiptArtifactByteHash: h('approval-artifact'), expectedExecutionLayoutApprovalReceiptHash: h('approval'), expectedExecutionLayoutPlanHash: h('layout') } }, descriptorBytes = json(descriptor), descriptorAuthority = h(`${tag}-descriptor-authority`), manifestCore = { schema: 'ikemaker.sff-creator-lifecycle-route-manifest', version: 1, routeId: 'execution-approved-to-executing-intent-v1', lifecycleState: 'Executing', normalizedRouteInput: { intent: 'start-approved-execution' }, parentManifestArtifactName: 'layout-review-execution-approved-route-manifest', parentManifestArtifactByteHash: h(`${tag}-parent-bytes`), parentManifestHash: h(`${tag}-parent-manifest`), parentManifestAuthorityHash: h(`${tag}-parent-authority`), parentManifest: { retained: true }, parentHeadRecordHash: h(`${tag}-prior-head`), operationId, workspaceId, targetId, backendId, adapterId, activePath, candidatePath, historyRoot, executionLayoutApprovalReceiptHash: h('approval'), executionIntentReceiptArtifactName: 'sff17c-execution-intent-receipt', executionIntentReceiptArtifactByteHash: h(`${tag}-intent-bytes`), executionIntentReceiptHash: h(`${tag}-intent`), executionIntentReceiptAuthorityHash: h(`${tag}-intent-authority`), executorAuthorityDescriptorArtifactName: 'sff17c-executor-authority-descriptor', executorAuthorityDescriptorArtifactByteHash: sha(descriptorBytes), executorAuthorityDescriptorHash: hashCanonical(descriptor), executorAuthorityDescriptorAuthorityHash: descriptorAuthority, payloadInventory: [], payloadAuthorities: [] }, manifest = { ...manifestCore, manifestHash: hashCanonical(manifestCore) }, manifestBytes = json(manifest), manifestAuthority = h(`actual-${tag}-manifest-authority`);
  const seedBytes = json({ kind: 'fixture-seed', tag }), seedAuthority = h(`${tag}-seed-authority`), common = { vaultRoot, workspaceRoot: workspace, workspaceId, operationId, targetId, backendId, adapterId, activePath, candidatePath, historyRoot, terminalHistoryEvidence: null, artifactAuthorities: [{ name: 'fixture-seed', hash: seedAuthority }], artifacts: [{ name: 'fixture-seed', bytes: seedBytes, expectedByteHash: sha(seedBytes), authorityHash: seedAuthority }], binaries: [] };
  let receipt = createCreatorOperationVault({ ...common, lifecycleState: 'Draft' });
  for (const state of ['ProjectionReview', 'ProjectionApproved', 'RequestReady', 'CandidateBuilt', 'CandidatePersisted', 'AdoptionReview', 'AdoptionApproved', 'LayoutReview', 'ExecutionApproved']) receipt = appendCreatorOperationCheckpoint({ ...common, operationDirectory: receipt.operationDirectory, expectedPreviousCheckpointHash: receipt.latestCheckpointHash, mutationId: h(`${tag}-${state}`), lifecycleState: state });
  receipt = appendCreatorOperationCheckpoint({ ...common, operationDirectory: receipt.operationDirectory, expectedPreviousCheckpointHash: receipt.latestCheckpointHash, mutationId: h(`${tag}-Executing`), lifecycleState: 'Executing', artifactAuthorities: [...common.artifactAuthorities, { name: 'execution-approved-executing-intent-route-manifest', hash: manifestAuthority }, { name: manifestCore.executorAuthorityDescriptorArtifactName, hash: descriptorAuthority }], artifacts: [...common.artifacts, { name: 'execution-approved-executing-intent-route-manifest', bytes: manifestBytes, expectedByteHash: sha(manifestBytes), authorityHash: manifestAuthority }, { name: manifestCore.executorAuthorityDescriptorArtifactName, bytes: descriptorBytes, expectedByteHash: sha(descriptorBytes), authorityHash: descriptorAuthority }] });
  const locator = { operationDirectory: receipt.operationDirectory, expectedOperationId: operationId, expectedLatestCheckpointHash: receipt.latestCheckpointHash, expectedVaultRoot: vaultRoot, manifestArtifactName: 'execution-approved-executing-intent-route-manifest', expectedManifestArtifactByteHash: sha(manifestBytes), expectedManifestAuthorityHash: manifestAuthority, expectedManifestHash: manifest.manifestHash }, snapshot = readCreatorOperationVaultCheckpointSnapshot({ operationDirectory: receipt.operationDirectory, expectedOperationId: operationId, expectedLatestCheckpointHash: receipt.latestCheckpointHash, expectedVaultRoot: vaultRoot });
  const journalPath = path.join(root, 'journal.json'), record = { state: 'prepared', sequence: 0, recordHash: h(`${tag}-journal-record`) }, journalBytes = json(record); fs.writeFileSync(journalPath, journalBytes); const receiptValue = { schema: 'fixture-outcome', version: 1, operationId }, outcomeBytes = json(receiptValue), verification = { schema: 'ikemaker.sff-creator-execution-outcome-verification', version: 1, status: 'verified', outcomeClass: 'manual-recovery-required', outcomeReceiptArtifactByteHash: sha(outcomeBytes), outcomeReceiptHash: hashCanonical(receiptValue), journalDescriptors: [{ state: 'prepared', sequence: 0, path: journalPath, recordHash: record.recordHash, fileByteHash: sha(journalBytes), byteLength: journalBytes.length, identity: identity(journalPath) }], journalChainHash: h(`${tag}-chain`), partialJournalEvidence: null, parentSnapshotAuthorityHash: hashCanonical(snapshot.authority), authoritySummary: { operationId, workspaceId: common.workspaceId, targetId, backendId: common.backendId, adapterId: common.adapterId, executionLayoutApprovalReceiptArtifactByteHash: h('approval-artifact'), executionLayoutApprovalReceiptHash: h('approval'), executionLayoutPlanHash: h('layout'), activeByteHash: h('active'), candidateByteHash: h('candidate') }, observedOutcome: {}, classificationAllowed: false, historyAllowed: false, currentStateGuaranteed: false, verifierEffects: { writes: false, processes: false, approvalsGranted: false, backendExecution: false } };
  return { root, common, locator, snapshot, verification, input: { executingIntentVaultLocator: locator, outcomeReceiptArtifactBytes: outcomeBytes, expectedOutcomeReceiptArtifactByteHash: sha(outcomeBytes), expectedOutcomeReceiptHash: hashCanonical(receiptValue) } };
}

for (const target of ['sff-v1', 'sff-v2.0', 'sff-v2.1']) {
  const f = fixture(target.replace('.', '-'), target), before = fs.readdirSync(f.root).sort(), plan = f.capture(f.input);
  assert.strictEqual(plan.status, 'append-ready'); assert.strictEqual(plan.lifecycleState, 'Executing'); assert.strictEqual(plan.phase, 'ResultCaptured'); assert.strictEqual(plan.scope.kind, 'returned-outcome-gap-only'); assert.strictEqual(plan.scope.discoversUnreturnedOutcome, false); assert.strictEqual(f.reads, 2); assert(Object.isFrozen(plan)); assert(Object.values(plan.effects).every(value => value === false));
  assert.strictEqual(plan.manifest.parentManifestArtifactByteHash, f.locator.expectedManifestArtifactByteHash); assert.strictEqual(plan.manifest.parentHeadRecordHash, f.locator.expectedLatestCheckpointHash); assert.strictEqual(plan.manifest.journalRetention.length, 2); assert(plan.manifest.journalRetention.every((row, index) => row.artifactName.startsWith(`sff17d-j00${index}-`)));
  assert(!plan.appendPayload.artifacts.some(row => row.name === f.locator.manifestArtifactName)); assert(plan.appendPayload.artifacts.some(row => row.name === 'retained-artifact')); assert(plan.appendPayload.binaries.some(row => row.name === 'retained-binary'));
  const one = plan.copyAppendPayload(), two = plan.copyAppendPayload(); one.artifacts[0].bytes[0] ^= 255; assert.notDeepStrictEqual(one.artifacts[0].bytes, two.artifacts[0].bytes); assert.deepStrictEqual(fs.readdirSync(f.root).sort(), before);
  const repeat = f.capture(f.input); assert.strictEqual(repeat.manifestHash, plan.manifestHash); assert.strictEqual(repeat.manifestAuthorityHash, plan.manifestAuthorityHash);
  if (target === 'sff-v2.1') {
    const receiptAuthority = hashCanonical({ domain: 'ikemaker.sff-creator-result-captured-outcome-receipt-authority', version: 1, artifactName: 'sff17d-execution-outcome-receipt', artifactByteHash: f.input.expectedOutcomeReceiptArtifactByteHash, artifactByteLength: f.input.outcomeReceiptArtifactBytes.length, semanticReceiptHash: f.input.expectedOutcomeReceiptHash, parentHeadRecordHash: f.locator.expectedLatestCheckpointHash, operationId: f.locator.expectedOperationId, executionLayoutApprovalReceiptHash: f.verification.authoritySummary.executionLayoutApprovalReceiptHash, outcomeClass: f.verification.outcomeClass });
    assert.strictEqual(plan.manifest.outcomeReceiptAuthorityHash, receiptAuthority);
    const verificationRow = plan.manifest.payloadInventory.find(row => row.name === 'sff17d-execution-outcome-verification'), verificationAuthority = hashCanonical({ domain: 'ikemaker.sff-creator-result-captured-verification-authority', version: 1, artifactName: 'sff17d-execution-outcome-verification', artifactByteHash: verificationRow.byteHash, artifactByteLength: verificationRow.byteLength, verificationHash: plan.manifest.verificationHash, receiptArtifactByteHash: f.input.expectedOutcomeReceiptArtifactByteHash, semanticReceiptHash: f.input.expectedOutcomeReceiptHash, parentHeadRecordHash: f.locator.expectedLatestCheckpointHash, parentSnapshotAuthorityHash: f.verification.parentSnapshotAuthorityHash, validJournalChainHash: f.verification.journalChainHash, partialJournalDescriptorHash: null });
    assert.strictEqual(plan.manifest.verificationAuthorityHash, verificationAuthority);
    for (const retained of plan.manifest.journalRetention) assert.strictEqual(retained.authorityHash, hashCanonical({ domain: 'ikemaker.sff-creator-result-captured-valid-journal-authority', version: 1, artifactName: retained.artifactName, originalApprovedPath: retained.originalApprovedPath, state: retained.state, sequence: retained.sequence, identity: retained.identity, artifactByteHash: retained.artifactByteHash, artifactByteLength: retained.artifactByteLength, recordHash: retained.recordHash, semanticReceiptHash: f.input.expectedOutcomeReceiptHash, validJournalChainHash: f.verification.journalChainHash, parentHeadRecordHash: f.locator.expectedLatestCheckpointHash, operationId: f.locator.expectedOperationId }));
    assert.strictEqual(plan.manifestAuthorityHash, hashCanonical({ domain: 'ikemaker.sff-creator-result-captured-route-manifest-authority', version: 1, artifactName: 'executing-result-captured-route-manifest', artifactByteHash: plan.manifestArtifactByteHash, manifestHash: plan.manifestHash, routeId: 'executing-intent-to-result-captured-v1', lifecycleState: 'Executing', phase: 'ResultCaptured', parentHeadRecordHash: f.locator.expectedLatestCheckpointHash, operationId: f.locator.expectedOperationId, targetId: f.authority.targetId, backendId: f.authority.backendId, adapterId: f.authority.adapterId, payloadAuthorities: plan.manifest.payloadAuthorities }));
  }
  fs.rmSync(f.root, { recursive: true, force: true });
}

for (const outcomeClass of ['committed', 'committed-cleanup-required', 'aborted-before-replacement', 'rolled-back', 'manual-recovery-required', 'uncertain-failure']) {
  const f = fixture(`outcome-${outcomeClass}`, 'sff-v2.1', { outcomeClass }), plan = f.capture(f.input); assert.strictEqual(plan.manifest.outcomeClass, outcomeClass); fs.rmSync(f.root, { recursive: true, force: true });
}

for (const target of ['sff-v1', 'sff-v2.0', 'sff-v2.1']) {
  const f = actualVaultFixture(`real-${target.replace('.', '-')}`, target), capture = createCreatorExecutionResultCaptureForTest({ verifyOutcome() { return JSON.parse(JSON.stringify(f.verification)); } }), before = fs.readdirSync(f.locator.operationDirectory).sort(), plan = capture(f.input);
  assert.strictEqual(plan.status, 'append-ready'); assert.strictEqual(plan.manifest.targetId, target); assert.strictEqual(plan.expectedPreviousCheckpointHash, f.locator.expectedLatestCheckpointHash);
  const inherited = f.snapshot.authority.artifacts.filter(row => row.name !== f.locator.manifestArtifactName).map(row => row.name).sort(); for (const name of inherited) assert(plan.appendPayload.artifacts.some(row => row.name === name));
  const copied = plan.copyAppendPayload(); assert.deepStrictEqual(copied.artifactAuthorities, plan.appendPayload.artifactAuthorities); assert.deepStrictEqual(fs.readdirSync(f.locator.operationDirectory).sort(), before);
  const child = appendCreatorOperationCheckpoint({ ...f.common, operationDirectory: f.locator.operationDirectory, expectedPreviousCheckpointHash: f.locator.expectedLatestCheckpointHash, mutationId: h(`result-captured-${target}`), lifecycleState: 'Executing', ...copied }); const childSnapshot = readCreatorOperationVaultCheckpointSnapshot({ operationDirectory: f.locator.operationDirectory, expectedOperationId: f.locator.expectedOperationId, expectedLatestCheckpointHash: child.latestCheckpointHash, expectedVaultRoot: f.locator.expectedVaultRoot }); assert(childSnapshot.authority.artifacts.some(row => row.name === plan.manifestArtifactName)); assert(!childSnapshot.authority.artifacts.some(row => row.name === f.locator.manifestArtifactName)); fs.rmSync(f.root, { recursive: true, force: true });
}

{
  const f = fixture('partial', 'sff-v2.1', { partial: true }), plan = f.capture(f.input);
  assert.strictEqual(plan.manifest.outcomeClass, 'uncertain-failure'); assert(plan.manifest.partialJournalRetention); assert(plan.appendPayload.binaries.some(row => row.name === 'sff17d-journal-opaque-partial')); fs.rmSync(f.root, { recursive: true, force: true });
}

{
  const f = fixture('partial-authority', 'sff-v2.1', { partial: true }), plan = f.capture(f.input), row = plan.manifest.partialJournalRetention;
  assert.strictEqual(row.authorityHash, hashCanonical({ domain: 'ikemaker.sff-creator-result-captured-opaque-partial-journal-authority', version: 1, artifactName: 'sff17d-journal-opaque-partial', role: 'opaque-partial-journal', approvedState: row.approvedState, originalApprovedPath: row.originalApprovedPath, identity: row.identity, artifactByteHash: row.artifactByteHash, artifactByteLength: row.artifactByteLength, journalUncertain: true, semanticReceiptHash: f.input.expectedOutcomeReceiptHash, parentHeadRecordHash: f.locator.expectedLatestCheckpointHash, operationId: f.locator.expectedOperationId })); fs.rmSync(f.root, { recursive: true, force: true });
}

{
  const f = fixture('capacity', 'sff-v2.1', { extraCount: 123 }), plan = f.capture(f.input);
  assert.strictEqual(plan.status, 'checkpoint-capability-blocked'); assert.strictEqual(plan.reason, 'payload-count-exceeds-128'); assert.strictEqual('appendPayload' in plan, false); assert.strictEqual('copyAppendPayload' in plan, false); assert.strictEqual(plan.capacity.operationConservativeProjection.capacityReserved, false); fs.rmSync(f.root, { recursive: true, force: true });
}

{
  const f = fixture('drift'); f.setDrift(); assert.throws(() => f.capture(f.input), /full parent snapshot authority changed/); fs.rmSync(f.root, { recursive: true, force: true });
}

{
  const f = fixture('journal-drift'); fs.appendFileSync(f.journalRows[0].path, 'x'); assert.throws(() => f.capture(f.input), /journal reread does not match|semantic authority/); fs.rmSync(f.root, { recursive: true, force: true });
}

for (const [tag, mutate, pattern] of [
  ['snapshot-hash', f => { f.verification.parentSnapshotAuthorityHash = h('wrong-snapshot'); }, /snapshot authority hash/],
  ['summary-selection', f => { f.verification.authoritySummary.targetId = 'sff-v1'; }, /authority summary targetId/],
  ['summary-layout', f => { f.verification.authoritySummary.executionLayoutPlanHash = h('wrong-layout'); }, /SFF17 authority summary/],
  ['stale-head', f => { f.authority.semanticHeadRecordHash = h('later-head'); f.verification.parentSnapshotAuthorityHash = hashCanonical(f.authority); }, /exact Executing intent head/],
  ['manifest-authority', f => { f.locator.expectedManifestAuthorityHash = h('substituted'); }, /named authority/]
]) {
  const f = fixture(tag); mutate(f); assert.throws(() => f.capture(f.input), pattern); fs.rmSync(f.root, { recursive: true, force: true });
}

{
  const f = fixture('manifest-self-rehash'), value = JSON.parse(f.bytesByName.get(f.locator.manifestArtifactName).toString('utf8')); value.extra = 'self-rehashed'; delete value.manifestHash; value.manifestHash = hashCanonical(value); const bytes = json(value), row = f.authority.artifacts.find(item => item.name === f.locator.manifestArtifactName); Object.assign(row, { byteHash: sha(bytes), byteLength: bytes.length }); f.bytesByName.set(f.locator.manifestArtifactName, bytes); f.locator.expectedManifestArtifactByteHash = sha(bytes); f.locator.expectedManifestHash = value.manifestHash; f.verification.parentSnapshotAuthorityHash = hashCanonical(f.authority); assert.throws(() => f.capture(f.input), /closed fields/); fs.rmSync(f.root, { recursive: true, force: true });
}

{
  const f = fixture('descriptor-authority-substitution'), descriptorName = 'sff17c-executor-authority-descriptor', substituted = h('substituted-descriptor-authority'); f.authority.artifacts.find(row => row.name === descriptorName).authorityHash = substituted; f.authority.artifactAuthorities.find(row => row.name === descriptorName).hash = substituted; f.verification.parentSnapshotAuthorityHash = hashCanonical(f.authority); assert.throws(() => f.capture(f.input), /descriptor named authority/); fs.rmSync(f.root, { recursive: true, force: true });
}

{
  const f = fixture('hardlink-journal'), alias = path.join(f.root, 'journal-hardlink.json'); fs.linkSync(f.journalRows[0].path, alias); assert.throws(() => f.capture(f.input), /single-link/); fs.rmSync(f.root, { recursive: true, force: true });
}

{
  const f = fixture('symlink-journal'), alias = path.join(f.root, 'journal-symlink.json');
  try { fs.symlinkSync(f.journalRows[0].path, alias, 'file'); f.verification.journalDescriptors[0].path = alias; assert.throws(() => f.capture(f.input), /non-link/); } catch (error) { if (!['EPERM', 'EACCES'].includes(error.code)) throw error; }
  fs.rmSync(f.root, { recursive: true, force: true });
}

{
  const f = fixture('oversize-journal'), filename = f.journalRows[0].path, bytes = Buffer.alloc(1024 * 1024 + 1); fs.writeFileSync(filename, bytes); Object.assign(f.verification.journalDescriptors[0], { fileByteHash: sha(bytes), byteLength: bytes.length, identity: identity(filename) }); assert.throws(() => f.capture(f.input), /exceeds its byte bound/); fs.rmSync(f.root, { recursive: true, force: true });
}

{
  const f = fixture('reserved-collision'), bytes = Buffer.from('collision'), name = 'sff17d-execution-outcome-receipt', row = { name, path: path.join(f.locator.operationDirectory, name), byteHash: sha(bytes), byteLength: bytes.length, authorityHash: h('collision-authority'), identity: { device: '1', inode: '900' } }; f.authority.artifacts.push(row); f.authority.artifactAuthorities.push({ name, hash: row.authorityHash }); f.bytesByName.set(name, bytes); f.verification.parentSnapshotAuthorityHash = hashCanonical(f.authority); assert.throws(() => f.capture(f.input), /reserved name collides/); fs.rmSync(f.root, { recursive: true, force: true });
}

{
  const f = fixture('byte-capacity'), sparse = path.join(f.locator.operationDirectory, 'large-existing.bin'); fs.writeFileSync(sparse, Buffer.alloc(0)); fs.truncateSync(sparse, 181 * 1024 * 1024); const plan = f.capture(f.input); assert.strictEqual(plan.status, 'checkpoint-capability-blocked'); assert.strictEqual(plan.reason, 'operation-bytes-exceed-192MiB'); assert.strictEqual(plan.capacityReserved, false); fs.rmSync(f.root, { recursive: true, force: true });
}

{
  const f = fixture('boundary'); let touched = 0; const proxy = new Proxy({}, { ownKeys() { touched++; throw new Error('trap'); } }); assert.throws(() => f.capture(proxy), /non-Proxy/); assert.strictEqual(touched, 0);
  const accessor = { ...f.input }; Object.defineProperty(accessor, 'expectedOutcomeReceiptHash', { enumerable: true, get() { touched++; throw new Error('getter'); } }); assert.throws(() => f.capture(accessor), /data property/); assert.strictEqual(touched, 0);
  assert.throws(() => f.capture({ ...f.input, extra: true }), /exactly the approved fields/);
  assert.throws(() => f.capture({ ...f.input, outcomeReceiptArtifactBytes: Buffer.alloc(4 * 1024 * 1024 + 1) }), /4 MiB/);
  fs.rmSync(f.root, { recursive: true, force: true });
}

{
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'sff_creator_execution_result_capture.js'), 'utf8');
  assert(!/writeFile|appendFile|renameSync|unlinkSync|mkdirSync|child_process|vscode|executeCreatorAdoption/.test(source));
}

for (const targetId of ['sff-v1', 'sff-v2.0', 'sff-v2.1']) {
  const real = createRealExecutingIntentFixture(targetId, `attempt-capture-${targetId}`);
  try {
    const gate = createCreatorCommandGatePlan({ commandId: 'execute-approved-intent', executingIntentVaultLocator: real.locator });
    const dispatch = createCreatorExecutionDispatchAuthority({ commandId: 'execute-approved-intent', executingIntentVaultLocator: real.locator, expectedCommandGatePlanHash: gate.commandGatePlanHash, executionAttemptId: h(`attempt-${targetId}`) });
    const receipt = executeCreatorAdoption(real.executorInput, {}).receipt, receiptBytes = json(receipt);
    const captureInput = { executingIntentVaultLocator: real.locator, outcomeReceiptArtifactBytes: receiptBytes, expectedOutcomeReceiptArtifactByteHash: sha(receiptBytes), expectedOutcomeReceiptHash: hashCanonical(receipt) };
    const verification = createCreatorExecutionOutcomeVerifierForTest({ hydrateIntent() { return real.intentVerification; }, readSnapshot(input) { return readCreatorOperationVaultCheckpointSnapshot(input); } })(captureInput);
    const captureBase = createCreatorExecutionResultCaptureForTest({ verifyOutcome() { return verification; } }), captureAttempt = createCreatorAttemptBoundExecutionResultCaptureForTest({ captureBase });
    const beforeBase = captureBase(captureInput), plan = captureAttempt({ executionResultCaptureInput: captureInput, executionDispatchAuthority: dispatch }), afterBase = captureBase(captureInput);
    assert.strictEqual(beforeBase.manifestArtifactByteHash, afterBase.manifestArtifactByteHash, 'attempt wrapper must not change base capture bytes');
    assert.strictEqual(plan.schema, 'ikemaker.sff-creator-attempt-bound-execution-result-capture-plan'); assert.strictEqual(plan.version, 2);
    assert.strictEqual(plan.preMutationReadinessDurablyRetained, false); assert.strictEqual(plan.liveReadinessHistoricalAuthority, false); assert.strictEqual(plan.executionAttemptCorrelationOnly, true); assert.strictEqual(plan.classificationAuthorityGranted, false); assert.strictEqual(plan.recoveryAuthorityGranted, false); assert.strictEqual(plan.historyAuthorityGranted, false);
    assert(!Object.hasOwn(plan, 'manifest')); assert(!Object.hasOwn(plan, 'attemptArtifact')); assert(!Object.hasOwn(plan, 'attemptCore'));
    const payload = plan.copyAppendPayload(), attemptRow = payload.artifacts.find(row => row.name === 'sff17d-execution-attempt-authority'), manifestRow = payload.artifacts.find(row => row.name === plan.manifestArtifactName), attempt = JSON.parse(attemptRow.bytes), manifest = JSON.parse(manifestRow.bytes);
    const { attemptAuthoritySemanticHash, ...attemptCore } = attempt; assert.strictEqual(attemptAuthoritySemanticHash, hashCanonical(attemptCore));
    assert.strictEqual(attempt.preMutationReadinessDurablyRetained, false); assert.strictEqual(attempt.liveReadinessHistoricalAuthority, false); assert.strictEqual(attempt.executionAttemptCorrelationOnly, true); assert.strictEqual(attempt.classificationAuthorityGranted, false); assert.strictEqual(attempt.recoveryAuthorityGranted, false); assert.strictEqual(attempt.historyAuthorityGranted, false);
    const correlationCore = { domain: 'ikemaker.sff-creator-execution-attempt-correlation', version: 1, executionAttemptId: dispatch.executionAttemptId, operationId: manifest.operationId, parentHeadRecordHash: manifest.parentHeadRecordHash, selection: dispatch.selection, retainedIntentAuthorityVerificationHash: dispatch.retainedIntentAuthorityVerificationHash };
    assert.strictEqual(attempt.executionDispatchCorrelationHash, hashCanonical(correlationCore));
    assert.strictEqual(attemptRow.authorityHash, hashCanonical({ domain: 'ikemaker.sff-creator-execution-attempt-authority-artifact-authority', version: 2, artifactName: attemptRow.name, artifactByteHash: sha(attemptRow.bytes), artifactByteLength: attemptRow.bytes.length, attemptAuthoritySemanticHash, executionDispatchCorrelationHash: attempt.executionDispatchCorrelationHash, executionAttemptId: attempt.executionAttemptId, retainedIntentAuthorityVerificationHash: attempt.retainedIntentAuthorityVerificationHash, parentHeadRecordHash: manifest.parentHeadRecordHash, operationId: manifest.operationId }));
    const { manifestHash, ...manifestCore } = manifest; assert.strictEqual(manifestHash, hashCanonical(manifestCore));
    assert.strictEqual(manifest.preMutationReadinessDurablyRetained, false); assert.strictEqual(manifest.liveReadinessHistoricalAuthority, false); assert.strictEqual(manifest.executionAttemptCorrelationOnly, true); assert.strictEqual(manifest.classificationAuthorityGranted, false); assert.strictEqual(manifest.recoveryAuthorityGranted, false); assert.strictEqual(manifest.historyAuthorityGranted, false);
    assert.strictEqual(plan.mutationId, hashCanonical({ domain: 'ikemaker.sff-creator-attempt-bound-result-capture-mutation', version: 2, operationId: manifest.operationId, parentHeadRecordHash: manifest.parentHeadRecordHash, manifestHash, executionAttemptId: dispatch.executionAttemptId, executionDispatchCorrelationHash: attempt.executionDispatchCorrelationHash, retainedIntentAuthorityVerificationHash: dispatch.retainedIntentAuthorityVerificationHash, executionAttemptAuthorityArtifactByteHash: sha(attemptRow.bytes), executionAttemptAuthoritySemanticHash: attemptAuthoritySemanticHash }));
    const persisted = JSON.stringify({ attempt, manifest, plan: { ...plan, appendPayload: undefined } }); assert(!persisted.includes('liveIntentReadinessVerificationHash')); assert(!persisted.includes('executorInputAuthorityComparisonHash')); assert(!persisted.includes('executionDispatchAuthority'));
    assert(!JSON.stringify(manifest).includes(plan.mutationId), 'mutation id must not be persisted in the manifest');
    if (targetId === 'sff-v2.1') {
      const reject = mutate => { const changed = JSON.parse(JSON.stringify(dispatch)); mutate(changed); changed.executionAttemptAuthorityHash = hashCanonical(changed.attemptAuthority); assert.throws(() => captureAttempt({ executionResultCaptureInput: captureInput, executionDispatchAuthority: changed }), /dispatch authority|attempt authority|captured parent/i); };
      const rewrittenEphemeral = JSON.parse(JSON.stringify(dispatch)); rewrittenEphemeral.liveIntentReadinessVerificationHash = h('rewritten-live'); rewrittenEphemeral.executorInputAuthorityComparisonHash = h('rewritten-comparison'); rewrittenEphemeral.attemptAuthority.liveIntentReadinessVerificationHash = rewrittenEphemeral.liveIntentReadinessVerificationHash; rewrittenEphemeral.attemptAuthority.executorInputAuthorityComparisonHash = rewrittenEphemeral.executorInputAuthorityComparisonHash; rewrittenEphemeral.executionAttemptAuthorityHash = hashCanonical(rewrittenEphemeral.attemptAuthority); const rewrittenPlan = captureAttempt({ executionResultCaptureInput: captureInput, executionDispatchAuthority: rewrittenEphemeral }); assert.strictEqual(rewrittenPlan.manifestHash, plan.manifestHash); assert.strictEqual(rewrittenPlan.manifestAuthorityHash, plan.manifestAuthorityHash); assert.strictEqual(rewrittenPlan.mutationId, plan.mutationId);
      reject(value => { value.snapshotAuthorityHash = h('wrong-snapshot'); value.attemptAuthority.snapshotAuthorityHash = value.snapshotAuthorityHash; });
      reject(value => { value.retainedIntentAuthorityVerificationHash = h('wrong-retained-intent'); value.attemptAuthority.retainedIntentAuthorityVerificationHash = value.retainedIntentAuthorityVerificationHash; });
      reject(value => { value.operationId = h('wrong-operation'); value.attemptAuthority.operationId = value.operationId; value.attemptAuthority.locatorAuthority.operationId = value.operationId; });
      reject(value => { value.semanticHeadRecordHash = h('wrong-head'); value.attemptAuthority.semanticHeadRecordHash = value.semanticHeadRecordHash; value.attemptAuthority.locatorAuthority.semanticHeadRecordHash = value.semanticHeadRecordHash; });
      reject(value => { value.selection.targetId = 'sff-v1'; value.attemptAuthority.selection.targetId = 'sff-v1'; });
      reject(value => { value.executorAuthorityDescriptorHash = h('wrong-descriptor'); value.attemptAuthority.executorAuthorityDescriptorHash = value.executorAuthorityDescriptorHash; });
      reject(value => { value.attemptAuthority.locatorAuthority.manifestHash = h('wrong-parent-manifest'); });
      const v1 = JSON.parse(JSON.stringify(dispatch)); v1.version = 1; v1.attemptAuthority.version = 1; v1.executionAttemptAuthorityHash = hashCanonical(v1.attemptAuthority); assert.throws(() => captureAttempt({ executionResultCaptureInput: captureInput, executionDispatchAuthority: v1 }), /D-D3a v2 contract/i);
      const extra = JSON.parse(JSON.stringify(dispatch)); extra.extra = true; assert.throws(() => captureAttempt({ executionResultCaptureInput: captureInput, executionDispatchAuthority: extra }), /closed fields/);
    }
    const child = appendCreatorOperationCheckpoint({ ...real.common, operationDirectory: real.locator.operationDirectory, expectedPreviousCheckpointHash: real.locator.expectedLatestCheckpointHash, mutationId: plan.mutationId, lifecycleState: 'Executing', ...payload });
    const locator = { operationDirectory: real.locator.operationDirectory, expectedOperationId: real.locator.expectedOperationId, expectedLatestCheckpointHash: child.latestCheckpointHash, expectedVaultRoot: real.locator.expectedVaultRoot, manifestArtifactName: plan.manifestArtifactName, expectedManifestArtifactByteHash: plan.manifestArtifactByteHash, expectedManifestAuthorityHash: plan.manifestAuthorityHash, expectedManifestHash: plan.manifestHash };
    const saved = verifySavedCreatorExecutionResultFromVault(locator), phase = verifyCreatorExecutingPhaseFromVault(locator);
    assert.strictEqual(saved.outcomeClass, 'committed'); assert.strictEqual(saved.classificationAllowed, false); assert.strictEqual(saved.historyAllowed, false); assert.strictEqual(phase.phase, 'ResultCaptured'); assert.strictEqual(phase.evidenceClass, 'result-captured-evidence');
  } finally { fs.rmSync(real.root, { recursive: true, force: true }); }
}

console.log('sff_creator_execution_result_capture tests passed');
