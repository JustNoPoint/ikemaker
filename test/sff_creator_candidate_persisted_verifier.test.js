'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { hashCanonical } = require('../src/sff_capability_report');
const { buildFixture, certification, kits } = require('./sff_creator_candidate_dispatch.test');
const { dispatchCreatorApprovedCandidate } = require('../src/sff_creator_candidate_dispatch');
const { verifyCreatorCandidateBuilt } = require('../src/sff_creator_candidate_built_verifier');
const { persistCreatorCandidate } = require('../src/sff_creator_candidate_persistence');
const { persistenceInput } = require('./sff_creator_candidate_persistence.test');
const { verifySavedCreatorCandidatePersistedEvidence } = require('../src/sff_creator_candidate_persisted_verifier');

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function normalized(value) { if (Buffer.isBuffer(value) || value instanceof Uint8Array) { const bytes = Buffer.from(value); return { kind: 'bytes', byteHash: sha(bytes), byteLength: bytes.length }; } if (Array.isArray(value)) return value.map(normalized); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).map(key => [key, normalized(value[key])])); return value; }
function builtInput(fixture, dispatched) { const receiptBytes = Buffer.from(JSON.stringify(dispatched.receipt, null, 2)), input = { approvedRequestInput: fixture.input.approvedRequestInput, expectedApprovedRequestReplayInputHash: hashCanonical(normalized(fixture.input.approvedRequestInput)), approvedRequestEnvelopeArtifactBytes: fixture.input.approvedRequestEnvelopeArtifactBytes, expectedApprovedRequestEnvelopeArtifactByteHash: fixture.input.expectedApprovedRequestEnvelopeArtifactByteHash, expectedRequestHash: fixture.input.expectedRequestHash, expectedSpecificationHash: fixture.input.expectedSpecificationHash, expectedApprovalReceiptHash: fixture.input.expectedApprovalReceiptHash, expectedSourceSnapshotHash: fixture.input.expectedSourceSnapshotHash, sourceBytesByEntryId: fixture.input.sourceBytesByEntryId, expectedSourceValidationHash: dispatched.receipt.sourceValidationHash, candidateBytes: dispatched.readCandidateBytes(), expectedCandidateByteHash: dispatched.receipt.candidateByteHash, candidateDispatchReceiptArtifactBytes: receiptBytes, expectedCandidateDispatchReceiptArtifactByteHash: sha(receiptBytes), expectedCandidateDispatchReceiptHash: dispatched.receiptHash }, verified = verifyCreatorCandidateBuilt(input), { copyCandidateBytes, ...metadata } = verified, artifact = Buffer.from(JSON.stringify(metadata, null, 2)); return { candidateEvidenceInput: input, candidateEvidenceVerificationArtifactBytes: artifact, expectedCandidateEvidenceVerificationArtifactByteHash: sha(artifact), expectedCandidateEvidenceVerificationHash: metadata.verificationHash }; }
function verifierInput(candidateBuiltEvidenceInput, persisted) { const bytes = Buffer.from(JSON.stringify(persisted.receipt, null, 2)); return { candidateBuiltEvidenceInput, candidatePersistenceReceiptArtifactBytes: bytes, expectedCandidatePersistenceReceiptArtifactByteHash: sha(bytes), expectedCandidatePersistenceReceiptHash: hashCanonical(persisted.receipt), expectedStagingCandidatePath: persisted.stagingCandidatePath }; }
function tamper(input, mutate, formatting = 0) { const receipt = JSON.parse(input.candidatePersistenceReceiptArtifactBytes.toString('utf8')); mutate(receipt); const bytes = Buffer.from(JSON.stringify(receipt, null, formatting)); return { ...input, candidatePersistenceReceiptArtifactBytes: bytes, expectedCandidatePersistenceReceiptArtifactByteHash: sha(bytes), expectedCandidatePersistenceReceiptHash: hashCanonical(receipt) }; }
function deepFrozen(value) { if (!value || typeof value !== 'object') return; assert(Object.isFrozen(value)); Object.values(value).forEach(deepFrozen); }

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-persisted-verifier-'));
try {
  const certifications = Object.fromEntries(Object.entries(kits).map(([targetId, kit]) => [targetId, certification(kit.generate(path.join(root, `cert-${targetId.replace(/[^a-z0-9]/gi, '_')}`)))])), activeDir = path.join(root, 'active'); fs.mkdirSync(activeDir); const activePath = path.join(activeDir, 'active.sff'), activeBytes = Buffer.from('stable active archive'); fs.writeFileSync(activePath, activeBytes); const records = {};
  for (const targetId of Object.keys(kits)) {
    const fixture = buildFixture(targetId, certifications[targetId]), dispatched = dispatchCreatorApprovedCandidate(fixture.input), savedBuilt = builtInput(fixture, dispatched), staging = path.join(root, `staging-${targetId.replace(/[^a-z0-9]/gi, '_')}`); fs.mkdirSync(staging); const persisted = persistCreatorCandidate(persistenceInput(fixture.input, staging, activePath, `${targetId.replace(/[^a-z0-9]/gi, '-')}.sff`)), input = verifierInput(savedBuilt, persisted), verified = verifySavedCreatorCandidatePersistedEvidence(input), repeated = verifySavedCreatorCandidatePersistedEvidence(input); records[targetId] = { fixture, savedBuilt, persisted, input, verified };
    assert.strictEqual(verified.status, 'verified'); assert.strictEqual(verified.observationClass, 'filesystem-read-only'); assert.strictEqual(verified.currentStateGuaranteed, false); assert.strictEqual(verified.receiptHash, input.expectedCandidatePersistenceReceiptHash); assert.strictEqual(verified.receiptArtifactByteHash, input.expectedCandidatePersistenceReceiptArtifactByteHash); assert.strictEqual(verified.candidateBuiltVerificationHash, savedBuilt.expectedCandidateEvidenceVerificationHash); assert.deepStrictEqual(verified.copyCandidateBytes(), dispatched.readCandidateBytes()); assert.deepStrictEqual(verified.effects, { writes: false, processes: false, approvalsGranted: false, backendExecution: false, adoptionAllowed: false, activeArchiveModified: false, historyAppended: false });
    const first = verified.copyCandidateBytes(), second = verified.copyCandidateBytes(); first[0] ^= 0xff; assert.notDeepStrictEqual(first, second); assert.deepStrictEqual(second, repeated.copyCandidateBytes()); deepFrozen(verified.receipt); deepFrozen(verified.effects); assert(Object.isFrozen(verified)); assert.deepStrictEqual(fs.readFileSync(activePath), activeBytes);
  }

  const base = records['sff-v2.1'].input, parsed = JSON.parse(base.candidatePersistenceReceiptArtifactBytes.toString('utf8')), reordered = Buffer.from(JSON.stringify({ writesCommitted: parsed.writesCommitted, ...parsed }, null, 4)), reformatted = verifySavedCreatorCandidatePersistedEvidence({ ...base, candidatePersistenceReceiptArtifactBytes: reordered, expectedCandidatePersistenceReceiptArtifactByteHash: sha(reordered) }); assert.strictEqual(reformatted.receiptHash, base.expectedCandidatePersistenceReceiptHash); assert.notStrictEqual(reformatted.receiptArtifactByteHash, base.expectedCandidatePersistenceReceiptArtifactByteHash);
  const directBindings = ['candidateDispatchReceiptArtifactByteHash', 'candidateDispatchReceiptHash', 'requestHash', 'specificationHash', 'logicalHash', 'approvalReceiptHash', 'sourceSnapshotHash', 'capabilitySnapshotHash', 'sourceValidationHash', 'candidateByteHash', 'semanticComparisonHash', 'dispatchReceiptHash']; for (const field of directBindings) assert.throws(() => verifySavedCreatorCandidatePersistedEvidence(tamper(base, receipt => { receipt[field] = 'f'.repeat(64); })), /does not exactly match|drift/i, field);
  for (const field of ['candidatePersisted', 'writesCommitted', 'activeArchiveModified', 'adoptionAllowed', 'byteEqualityRequired']) assert.throws(() => verifySavedCreatorCandidatePersistedEvidence(tamper(base, receipt => { receipt[field] = !receipt[field]; })), /contradictory/, field);
  assert.throws(() => verifySavedCreatorCandidatePersistedEvidence(tamper(base, receipt => { receipt.selection.adapter.id = 'forged'; })), /does not exactly match/);
  assert.throws(() => verifySavedCreatorCandidatePersistedEvidence(tamper(base, receipt => { receipt.persistenceValidation.strictReportHash = 'f'.repeat(64); receipt.persistenceValidationHash = hashCanonical(receipt.persistenceValidation); })), /persistenceValidation does not exactly match/);
  assert.throws(() => verifySavedCreatorCandidatePersistedEvidence(tamper(base, receipt => { receipt.persistenceValidationHash = 'f'.repeat(64); })), /persistenceValidationHash/);
  assert.throws(() => verifySavedCreatorCandidatePersistedEvidence(tamper(base, receipt => { receipt.activeArchive.identity.inode = '0'; })), /active archive observation drifted/);
  assert.throws(() => verifySavedCreatorCandidatePersistedEvidence(tamper(base, receipt => { receipt.stagingDirectory.identity.inode = '0'; })), /stagingDirectory identity drifted/);
  assert.throws(() => verifySavedCreatorCandidatePersistedEvidence(tamper(base, receipt => { receipt.extra = true; })), /closed fields/); assert.throws(() => verifySavedCreatorCandidatePersistedEvidence(tamper(base, receipt => { delete receipt.selection; })), /closed fields/);
  for (const [field, value] of [['fileFsync', 'unsupported-by-platform'], ['parentDirectoryFsync', 'failed'], ['directoryFsyncAfterPublish', 'failed'], ['directoryFsyncAfterCleanup', 'failed'], ['directoryFsync', 'completed']]) assert.throws(() => verifySavedCreatorCandidatePersistedEvidence(tamper(base, receipt => { receipt[field] = value; })), /Fsync|sync truth/i);
  for (const filename of ['../escape.sff', 'bad.txt', 'CON.sff', 'bad:name.sff']) assert.throws(() => verifySavedCreatorCandidatePersistedEvidence(tamper(base, receipt => { receipt.relativeCandidateFilename = filename; })), /safe relative/);
  assert.throws(() => verifySavedCreatorCandidatePersistedEvidence({ ...base, expectedStagingCandidatePath: path.join(root, 'elsewhere.sff') }), /retained staging candidate path/);
  assert.throws(() => verifySavedCreatorCandidatePersistedEvidence(tamper(base, receipt => { receipt.persistedByteLength = Number.MAX_SAFE_INTEGER; })), /authority disagree|bounded length|type, link count/i);
  assert.throws(() => verifySavedCreatorCandidatePersistedEvidence(tamper(base, receipt => { receipt.activeArchive.byteLength += 1; })), /bounded length|type, link count/i);

  const hardAlias = path.join(root, 'active-hardlink.sff'); fs.linkSync(activePath, hardAlias); assert.doesNotThrow(() => verifySavedCreatorCandidatePersistedEvidence(base)); fs.unlinkSync(hardAlias);
  const candidateAlias = path.join(root, 'candidate-hardlink.sff'); fs.linkSync(base.expectedStagingCandidatePath, candidateAlias); assert.throws(() => verifySavedCreatorCandidatePersistedEvidence(base), /link count/); fs.unlinkSync(candidateAlias);
  const candidateOriginal = fs.readFileSync(base.expectedStagingCandidatePath), candidateRename = `${base.expectedStagingCandidatePath}.real`; fs.renameSync(base.expectedStagingCandidatePath, candidateRename); let candidateSymlink = false; try { try { fs.symlinkSync(candidateRename, base.expectedStagingCandidatePath, 'file'); candidateSymlink = true; } catch (error) { if (error.code !== 'EPERM') throw error; } if (candidateSymlink) assert.throws(() => verifySavedCreatorCandidatePersistedEvidence(base), /symbolic-link|type, link count/); } finally { if (candidateSymlink) fs.unlinkSync(base.expectedStagingCandidatePath); fs.renameSync(candidateRename, base.expectedStagingCandidatePath); } assert.deepStrictEqual(fs.readFileSync(base.expectedStagingCandidatePath), candidateOriginal);
  const activeOriginal = fs.readFileSync(activePath); fs.writeFileSync(activePath, Buffer.from('active drift')); assert.throws(() => verifySavedCreatorCandidatePersistedEvidence(base), /bounded length|drifted/); fs.writeFileSync(activePath, activeOriginal);
  const activeRenamed = `${activePath}.original`; fs.renameSync(activePath, activeRenamed); fs.writeFileSync(activePath, activeOriginal); assert.throws(() => verifySavedCreatorCandidatePersistedEvidence(base), /active archive observation drifted/); fs.unlinkSync(activePath); fs.renameSync(activeRenamed, activePath);
  const candidateBytes = fs.readFileSync(base.expectedStagingCandidatePath); fs.writeFileSync(base.expectedStagingCandidatePath, Buffer.from('candidate drift')); assert.throws(() => verifySavedCreatorCandidatePersistedEvidence(base), /bounded length|contradict/i); fs.writeFileSync(base.expectedStagingCandidatePath, candidateBytes);
  let traps = 0, getters = 0; const proxy = new Proxy({}, { get() { traps += 1; throw new Error('get'); }, ownKeys() { traps += 1; throw new Error('keys'); }, getPrototypeOf() { traps += 1; throw new Error('proto'); } }); assert.throws(() => verifySavedCreatorCandidatePersistedEvidence(proxy), /Proxy/); assert.strictEqual(traps, 0); const accessor = { ...base }; delete accessor.candidatePersistenceReceiptArtifactBytes; Object.defineProperty(accessor, 'candidatePersistenceReceiptArtifactBytes', { enumerable: true, get() { getters += 1; throw new Error('getter'); } }); assert.throws(() => verifySavedCreatorCandidatePersistedEvidence(accessor), /data property/); assert.strictEqual(getters, 0); assert.throws(() => verifySavedCreatorCandidatePersistedEvidence({ ...base, extra: true }), /exactly/); assert.throws(() => verifySavedCreatorCandidatePersistedEvidence({ ...base, [Symbol('hidden')]: true }), /exactly/);
  const nestedAccessorBuilt = { ...base.candidateBuiltEvidenceInput }; delete nestedAccessorBuilt.candidateEvidenceInput; Object.defineProperty(nestedAccessorBuilt, 'candidateEvidenceInput', { enumerable: true, get() { getters += 1; throw new Error('nested getter'); } }); assert.throws(() => verifySavedCreatorCandidatePersistedEvidence({ ...base, candidateBuiltEvidenceInput: nestedAccessorBuilt }), /data property/); assert.strictEqual(getters, 0);
  const nestedProxy = new Proxy({}, { get() { traps += 1; throw new Error('nested get'); }, ownKeys() { traps += 1; throw new Error('nested keys'); }, getPrototypeOf() { traps += 1; throw new Error('nested proto'); } }); assert.throws(() => verifySavedCreatorCandidatePersistedEvidence({ ...base, candidateBuiltEvidenceInput: { ...base.candidateBuiltEvidenceInput, candidateEvidenceInput: nestedProxy } }), /prox/i); assert.strictEqual(traps, 0);
  assert.throws(() => verifySavedCreatorCandidatePersistedEvidence({ ...base, candidateBuiltEvidenceInput: { ...base.candidateBuiltEvidenceInput, [Symbol('nested')]: true } }), /symbols/);
  const cyclicBuilt = { ...base.candidateBuiltEvidenceInput }; cyclicBuilt.cycle = cyclicBuilt; assert.throws(() => verifySavedCreatorCandidatePersistedEvidence({ ...base, candidateBuiltEvidenceInput: cyclicBuilt }), /cyclic/);

  // The complete nested d1 authority is snapshotted before the first filesystem
  // callback. Mutating the caller-owned graph during a read cannot change the
  // request used by the verifier. Count Buffer.equals calls only after reads
  // begin to prove the explicit persisted-vs-sealed-candidate comparison ran.
  const callerDecision = base.candidateBuiltEvidenceInput.candidateEvidenceInput.approvedRequestInput.approvalDecision;
  const originalDecisionStatus = callerDecision.status, sealedReadSync = fs.readSync, sealedEquals = Buffer.prototype.equals;
  let mutatedCallerDuringRead = false, filesystemReadBegan = false, postReadExactComparisons = 0;
  try {
    fs.readSync = (...args) => {
      const count = sealedReadSync(...args);
      filesystemReadBegan = true;
      if (!mutatedCallerDuringRead) { mutatedCallerDuringRead = true; callerDecision.status = 'caller-mutated-during-read'; }
      return count;
    };
    Buffer.prototype.equals = function instrumentedEquals(other) {
      if (filesystemReadBegan && Buffer.isBuffer(other)) postReadExactComparisons += 1;
      return sealedEquals.call(this, other);
    };
    const sealedResult = verifySavedCreatorCandidatePersistedEvidence(base);
    assert.strictEqual(sealedResult.status, 'verified');
    assert(mutatedCallerDuringRead);
    assert(postReadExactComparisons >= 1, 'persisted bytes must be compared with the sealed CandidateBuilt byte copy after filesystem reads');
  } finally {
    fs.readSync = sealedReadSync;
    Buffer.prototype.equals = sealedEquals;
    callerDecision.status = originalDecisionStatus;
  }

  const raceBytes = fs.readFileSync(base.expectedStagingCandidatePath), originalReadSync = fs.readSync; let raced = false; try { fs.readSync = (...args) => { const count = originalReadSync(...args); if (!raced) { raced = true; fs.appendFileSync(base.expectedStagingCandidatePath, Buffer.from('race')); } return count; }; assert.throws(() => verifySavedCreatorCandidatePersistedEvidence(base), /changed during read|drifted/); } finally { fs.readSync = originalReadSync; fs.writeFileSync(base.expectedStagingCandidatePath, raceBytes); }
  const stagingDirectory = path.dirname(base.expectedStagingCandidatePath), stagingRenamed = `${stagingDirectory}.original`; fs.renameSync(stagingDirectory, stagingRenamed); fs.mkdirSync(stagingDirectory); fs.writeFileSync(path.join(stagingDirectory, path.basename(base.expectedStagingCandidatePath)), raceBytes); assert.throws(() => verifySavedCreatorCandidatePersistedEvidence(base), /stagingDirectory identity drifted/); fs.rmSync(stagingDirectory, { recursive: true, force: true }); fs.renameSync(stagingRenamed, stagingDirectory);
  const stagingLinkTarget = path.join(root, 'staging-link-target'); fs.mkdirSync(stagingLinkTarget); fs.renameSync(stagingDirectory, stagingRenamed); let stagingLink = false; try { try { fs.symlinkSync(stagingLinkTarget, stagingDirectory, 'junction'); stagingLink = true; } catch (error) { if (error.code !== 'EPERM') throw error; } if (stagingLink) assert.throws(() => verifySavedCreatorCandidatePersistedEvidence(base), /symbolic-link|junction|reparse/); } finally { if (stagingLink) fs.unlinkSync(stagingDirectory); fs.renameSync(stagingRenamed, stagingDirectory); }
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'sff_creator_candidate_persisted_verifier.js'), 'utf8'); assert.doesNotMatch(source, /writeFile|appendFile|rename|unlink|linkSync|mkdir|rmdir|spawn|execFile|child_process|vscode/); assert.match(source, /candidate\.bytes\.equals\(sealedBuiltCandidate\)/);
  console.log('Saved CandidatePersisted evidence verifier replays exact SFF-14 authority and performs stable read-only file observations');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
