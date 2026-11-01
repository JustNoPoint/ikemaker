'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { hashCanonical } = require('../src/sff_capability_report');
const { dispatchCreatorApprovedCandidate } = require('../src/sff_creator_candidate_dispatch');
const { verifyCreatorCandidateBuilt, verifySavedCreatorCandidateBuiltEvidence } = require('../src/sff_creator_candidate_built_verifier');
const { buildFixture, certification, kits } = require('./sff_creator_candidate_dispatch.test');

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-candidate-built-verifier-'));
const golden = {
  'sff-v1': ['486ca48f4375df22e0bda3dca5ae5681c400058f23616b28a3b13e87f6b43f57', '935719dd10464dcf7f0b8c27c99f0cd3496dd76bfccbd28da07dab17fb4311fe', '16c4731e6e3f20e994053c192ae1a1371797505b2b6be86cf32c72d72344af49'],
  'sff-v2.0': ['70ce462f8166f37d0d60b804f598ea0fc736c6e9bf2cd0d8162bb56d7ad24f93', '77546b8002b2c78b76cf6378b83519ea2bc44bf24d1644fe7b56d2418cda7d78', 'dfd1c0b4b7bb34be20508ee812ead8674d6eb6fca3c31d2f1cefa16676808482'],
  'sff-v2.1': ['409fa4e13a159b35e350bacaf0764e7ede4315cda08f90519f1afd541c455ccb', '44f74c58ffca1766478fa33fcbeb5be0b04f4be5e0b95b8bbf49bdbb20b276af', 'b9eeca94d41abe5b43652d6c4e177e874f70dcded5b5a98c35a1b31818e5d9c8']
};
function normalized(value) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) { const bytes = Buffer.from(value); return { kind: 'bytes', byteHash: sha(bytes), byteLength: bytes.length }; }
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).map(key => [key, normalized(value[key])]));
  return value;
}
function cloneAuthority(value) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return Buffer.from(value);
  if (Array.isArray(value)) return value.map(cloneAuthority);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneAuthority(child)]));
  return value;
}
function verifierInput(fixture, dispatched) {
  const receiptBytes = Buffer.from(JSON.stringify(dispatched.receipt, null, 2));
  return { approvedRequestInput: fixture.input.approvedRequestInput, expectedApprovedRequestReplayInputHash: hashCanonical(normalized(fixture.input.approvedRequestInput)), approvedRequestEnvelopeArtifactBytes: fixture.input.approvedRequestEnvelopeArtifactBytes, expectedApprovedRequestEnvelopeArtifactByteHash: fixture.input.expectedApprovedRequestEnvelopeArtifactByteHash, expectedRequestHash: fixture.input.expectedRequestHash, expectedSpecificationHash: fixture.input.expectedSpecificationHash, expectedApprovalReceiptHash: fixture.input.expectedApprovalReceiptHash, expectedSourceSnapshotHash: fixture.input.expectedSourceSnapshotHash, sourceBytesByEntryId: fixture.input.sourceBytesByEntryId, expectedSourceValidationHash: dispatched.receipt.sourceValidationHash, candidateBytes: dispatched.readCandidateBytes(), expectedCandidateByteHash: dispatched.receipt.candidateByteHash, candidateDispatchReceiptArtifactBytes: receiptBytes, expectedCandidateDispatchReceiptArtifactByteHash: sha(receiptBytes), expectedCandidateDispatchReceiptHash: dispatched.receiptHash };
}
function withRehashedReceipt(input, mutate) {
  const receipt = JSON.parse(input.candidateDispatchReceiptArtifactBytes.toString('utf8'));
  mutate(receipt);
  const bytes = Buffer.from(JSON.stringify(receipt));
  return { ...input, candidateDispatchReceiptArtifactBytes: bytes, expectedCandidateDispatchReceiptArtifactByteHash: sha(bytes), expectedCandidateDispatchReceiptHash: hashCanonical(receipt) };
}
function savedVerifierInput(candidateEvidenceInput, verification, formatting = 2) {
  const { copyCandidateBytes, ...metadata } = verification;
  const bytes = Buffer.from(JSON.stringify(metadata, null, formatting));
  return { candidateEvidenceInput, candidateEvidenceVerificationArtifactBytes: bytes, expectedCandidateEvidenceVerificationArtifactByteHash: sha(bytes), expectedCandidateEvidenceVerificationHash: metadata.verificationHash };
}
function withRehashedVerification(input, mutate) {
  const verification = JSON.parse(input.candidateEvidenceVerificationArtifactBytes.toString('utf8'));
  mutate(verification);
  const { verificationHash: ignored, ...core } = verification;
  verification.verificationHash = hashCanonical(core);
  const bytes = Buffer.from(JSON.stringify(verification));
  return { ...input, candidateEvidenceVerificationArtifactBytes: bytes, expectedCandidateEvidenceVerificationArtifactByteHash: sha(bytes), expectedCandidateEvidenceVerificationHash: verification.verificationHash };
}
function assertDeepFrozen(value) { if (!value || typeof value !== 'object') return; assert.ok(Object.isFrozen(value)); Object.values(value).forEach(assertDeepFrozen); }

try {
  const evidence = Object.fromEntries(Object.entries(kits).map(([targetId, kit]) => [targetId, certification(kit.generate(path.join(root, targetId.replace(/[^a-z0-9]/gi, '_'))))]));
  const records = {};
  for (const targetId of Object.keys(kits)) {
    const fixture = buildFixture(targetId, evidence[targetId]), dispatched = dispatchCreatorApprovedCandidate(fixture.input), input = verifierInput(fixture, dispatched), verified = verifyCreatorCandidateBuilt(input), repeat = verifyCreatorCandidateBuilt(input);
    records[targetId] = { fixture, dispatched, input, verified };
    assert.deepStrictEqual(verified.receipt, dispatched.receipt);
    assert.strictEqual(verified.candidateDispatchReceiptHash, dispatched.receiptHash);
    assert.deepStrictEqual([verified.verificationHash, verified.candidateDispatchReceiptHash], golden[targetId].slice(0, 2));
    assert.strictEqual(verified.verificationHash, repeat.verificationHash);
    assert.strictEqual(verified.schema, 'ikemaker.sff-creator-candidate-evidence-verification');
    assert.strictEqual(verified.status, 'verified'); assert.strictEqual(verified.observationClass, 'in-memory');
    assert.strictEqual(verified.approvedRequestReplayInputHash, input.expectedApprovedRequestReplayInputHash);
    assert.strictEqual(verified.approvedRequestEnvelopeArtifactByteHash, input.expectedApprovedRequestEnvelopeArtifactByteHash);
    for (const [field, expected] of Object.entries({ requestHash: dispatched.receipt.requestHash, specificationHash: dispatched.receipt.specificationHash, logicalHash: dispatched.receipt.logicalHash, approvalReceiptHash: dispatched.receipt.approvalReceiptHash, sourceSnapshotHash: dispatched.receipt.sourceSnapshotHash, capabilitySnapshotHash: dispatched.receipt.capabilitySnapshotHash, sourceValidationHash: dispatched.receipt.sourceValidationHash, candidateDispatchReceiptArtifactByteHash: input.expectedCandidateDispatchReceiptArtifactByteHash, candidateDispatchReceiptHash: dispatched.receiptHash, candidateByteHash: dispatched.receipt.candidateByteHash, candidateByteLength: dispatched.receipt.candidateByteLength, validationHash: hashCanonical(dispatched.receipt.validation), semanticComparisonHash: hashCanonical(dispatched.receipt.semanticComparison), dispatchHash: hashCanonical(dispatched.receipt.dispatch) })) assert.strictEqual(verified[field], expected, field);
    assert.deepStrictEqual(verified.selection, dispatched.receipt.selection);
    assert.strictEqual(verified.effects.candidateCreated, true);
    assert.strictEqual(verified.effects.sourceBytesValidated, true);
    for (const flag of ['writesCommitted', 'processesStarted', 'approvalsGranted', 'backendExecution', 'adoptionAllowed', 'activeArchiveModified', 'historyAppended']) assert.strictEqual(verified.effects[flag], false);
    const { copyCandidateBytes, verificationHash, ...completeMetadata } = verified;
    assert.strictEqual(hashCanonical(completeMetadata), verificationHash);
    assertDeepFrozen(verified.receipt); assert.ok(Object.isFrozen(verified));
    assert.doesNotThrow(() => JSON.stringify(verified));
    const first = verified.copyCandidateBytes(), second = verified.copyCandidateBytes(); first[0] ^= 0xff; assert.notDeepStrictEqual(first, second); assert.deepStrictEqual(second, dispatched.readCandidateBytes());
    const savedInput = savedVerifierInput(input, verified), saved = verifySavedCreatorCandidateBuiltEvidence(savedInput), savedRepeat = verifySavedCreatorCandidateBuiltEvidence(savedInput);
    assert.deepStrictEqual([verified.verificationHash, verified.candidateDispatchReceiptHash, savedInput.expectedCandidateEvidenceVerificationArtifactByteHash], golden[targetId]);
    records[targetId].savedInput = savedInput; records[targetId].saved = saved;
    assert.strictEqual(saved.schema, 'ikemaker.sff-creator-saved-candidate-evidence-verification');
    assert.strictEqual(saved.verificationHash, verified.verificationHash);
    assert.strictEqual(saved.verificationArtifactByteHash, savedInput.expectedCandidateEvidenceVerificationArtifactByteHash);
    assert.deepStrictEqual(saved.verification, { ...completeMetadata, verificationHash });
    assert.deepStrictEqual(saved.effects, { writes: false, processes: false, approvalsGranted: false, backendExecution: false });
    assert.strictEqual(saved.status, 'verified'); assert.strictEqual(saved.observationClass, 'in-memory');
    const { copyCandidateBytes: savedCopy, ...savedMetadata } = saved, { copyCandidateBytes: repeatCopy, ...repeatMetadata } = savedRepeat;
    assert.deepStrictEqual(savedMetadata, repeatMetadata); assertDeepFrozen(saved.verification); assertDeepFrozen(saved.effects); assert.ok(Object.isFrozen(saved));
    const savedFirst = saved.copyCandidateBytes(), savedSecond = saved.copyCandidateBytes(); savedFirst[0] ^= 0xff; assert.notDeepStrictEqual(savedFirst, savedSecond); assert.deepStrictEqual(savedSecond, dispatched.readCandidateBytes());
  }

  const base = records['sff-v2.1'].input;
  let traps = 0, getters = 0;
  const rawProxy = new Proxy({}, { get() { traps += 1; throw new Error('get'); }, ownKeys() { traps += 1; throw new Error('keys'); }, getPrototypeOf() { traps += 1; throw new Error('proto'); } });
  assert.throws(() => verifyCreatorCandidateBuilt(rawProxy), /must not be a Proxy/); assert.strictEqual(traps, 0);
  const rootAccessor = { ...base }; delete rootAccessor.approvedRequestInput; Object.defineProperty(rootAccessor, 'approvedRequestInput', { enumerable: true, get() { getters += 1; throw new Error('getter'); } });
  assert.throws(() => verifyCreatorCandidateBuilt(rootAccessor), /data property/); assert.strictEqual(getters, 0);
  const nested = { ...base.approvedRequestInput }; Object.defineProperty(nested, 'targetId', { enumerable: true, get() { getters += 1; throw new Error('nested getter'); } });
  assert.throws(() => verifyCreatorCandidateBuilt({ ...base, approvedRequestInput: nested }), /data property/); assert.strictEqual(getters, 0);
  const nestedProxy = new Proxy(base.approvedRequestInput, { get() { traps += 1; throw new Error('nested get'); }, getPrototypeOf() { traps += 1; throw new Error('nested proto'); } });
  assert.throws(() => verifyCreatorCandidateBuilt({ ...base, approvedRequestInput: nestedProxy }), /must not contain proxies/); assert.strictEqual(traps, 0);
  assert.throws(() => verifyCreatorCandidateBuilt({ ...base, extra: true }), /contain exactly/);
  assert.throws(() => verifyCreatorCandidateBuilt({ ...base, [Symbol('hidden')]: true }), /contain exactly/);
  const hidden = { ...base }; Object.defineProperty(hidden, 'candidateBytes', { value: base.candidateBytes, enumerable: false }); assert.throws(() => verifyCreatorCandidateBuilt(hidden), /data property|contain exactly/);
  assert.throws(() => verifyCreatorCandidateBuilt({ ...base, expectedApprovedRequestReplayInputHash: 'f'.repeat(64) }), /replay authority hash/);
  assert.throws(() => verifyCreatorCandidateBuilt({ ...base, expectedRequestHash: 'f'.repeat(64) }), /upstream authority/);
  assert.throws(() => verifyCreatorCandidateBuilt({ ...base, expectedSourceValidationHash: 'f'.repeat(64) }), /source validation receipt hash/);
  assert.throws(() => verifyCreatorCandidateBuilt({ ...base, candidateBytes: Buffer.from('not-sff'), expectedCandidateByteHash: sha(Buffer.from('not-sff')) }), /validation|header|SFF/i);
  const changedReceipt = JSON.parse(base.candidateDispatchReceiptArtifactBytes.toString('utf8')); changedReceipt.writesCommitted = true; const changedBytes = Buffer.from(JSON.stringify(changedReceipt));
  assert.throws(() => verifyCreatorCandidateBuilt({ ...base, candidateDispatchReceiptArtifactBytes: changedBytes, expectedCandidateDispatchReceiptArtifactByteHash: sha(changedBytes), expectedCandidateDispatchReceiptHash: hashCanonical(changedReceipt) }), /receipt hash drifted|does not exactly match/);
  assert.throws(() => verifyCreatorCandidateBuilt(withRehashedReceipt(base, receipt => { receipt.semanticComparison.entries[0].axis[0] += 1; })), /receipt hash drifted|does not exactly match/);
  assert.throws(() => verifyCreatorCandidateBuilt(withRehashedReceipt(base, receipt => { const replacement = { ...receipt.sourceValidationReceipt.sources[0], byteHash: 'a'.repeat(64) }; receipt.sourceValidationReceipt.sources[0] = replacement; receipt.sourceValidationHash = hashCanonical(receipt.sourceValidationReceipt); })), /receipt hash drifted|does not exactly match/);
  for (const mutate of [
    row => { row.axis[0] += 1; },
    row => { row.identity[0] += 1; },
    row => { row.paletteIndex = row.paletteIndex === 0 ? 1 : 0; },
    row => { row.link = row.link === null ? 0 : null; }
  ]) assert.throws(() => verifyCreatorCandidateBuilt(withRehashedReceipt(base, receipt => mutate(receipt.semanticComparison.entries[0]))), /receipt hash drifted|does not exactly match/);
  const coherentReplayForge = cloneAuthority(base.approvedRequestInput);
  coherentReplayForge.approvalDecision.confirmations = { ...coherentReplayForge.approvalDecision.confirmations, reviewedSourceSnapshot: !coherentReplayForge.approvalDecision.confirmations.reviewedSourceSnapshot };
  const coherentlyRehashedReceipt = withRehashedReceipt({ ...base, approvedRequestInput: coherentReplayForge }, receipt => { receipt.semanticComparison.entries[0].identity[1] += 1; });
  assert.throws(() => verifyCreatorCandidateBuilt(coherentlyRehashedReceipt), /replay authority hash drifted/);
  const swapped = records['sff-v2.0'].input;
  assert.throws(() => verifyCreatorCandidateBuilt({ ...base, approvedRequestEnvelopeArtifactBytes: swapped.approvedRequestEnvelopeArtifactBytes, expectedApprovedRequestEnvelopeArtifactByteHash: swapped.expectedApprovedRequestEnvelopeArtifactByteHash }), /does not exactly match|upstream authority/);
  const sourceId = Object.keys(base.sourceBytesByEntryId)[0]; assert.throws(() => verifyCreatorCandidateBuilt({ ...base, sourceBytesByEntryId: { ...base.sourceBytesByEntryId, [sourceId]: Buffer.from('drift') } }), /bytes drifted/i);

  const savedBase = records['sff-v2.1'].savedInput;
  const savedMetadata = JSON.parse(savedBase.candidateEvidenceVerificationArtifactBytes.toString('utf8'));
  const reversed = Object.fromEntries(Object.entries(savedMetadata).reverse()), reorderedBytes = Buffer.from(`\n  ${JSON.stringify(reversed)}\n`);
  const reordered = verifySavedCreatorCandidateBuiltEvidence({ ...savedBase, candidateEvidenceVerificationArtifactBytes: reorderedBytes, expectedCandidateEvidenceVerificationArtifactByteHash: sha(reorderedBytes) });
  assert.strictEqual(reordered.verificationHash, savedMetadata.verificationHash); assert.notStrictEqual(reordered.verificationArtifactByteHash, savedBase.expectedCandidateEvidenceVerificationArtifactByteHash);
  assert.throws(() => verifySavedCreatorCandidateBuiltEvidence({ ...savedBase, expectedCandidateEvidenceVerificationArtifactByteHash: 'f'.repeat(64) }), /artifact byte hash drifted/);
  assert.throws(() => verifySavedCreatorCandidateBuiltEvidence({ ...savedBase, expectedCandidateEvidenceVerificationHash: 'f'.repeat(64) }), /verification hash drifted/);
  assert.throws(() => verifySavedCreatorCandidateBuiltEvidence(withRehashedVerification(savedBase, value => { value.receipt.semanticComparison.entries[0].extra = true; })), /does not exactly match/);
  assert.throws(() => verifySavedCreatorCandidateBuiltEvidence(withRehashedVerification(savedBase, value => { delete value.receipt.semanticComparison.entries[0].axis; })), /does not exactly match/);
  assert.throws(() => verifySavedCreatorCandidateBuiltEvidence(withRehashedVerification(savedBase, value => { value.requestHash = 'a'.repeat(64); })), /does not exactly match/);
  const unrehashable = JSON.parse(savedBase.candidateEvidenceVerificationArtifactBytes.toString('utf8')); unrehashable.receipt.validation.strictReportHash = 'b'.repeat(64); const unrehashableBytes = Buffer.from(JSON.stringify(unrehashable));
  assert.throws(() => verifySavedCreatorCandidateBuiltEvidence({ ...savedBase, candidateEvidenceVerificationArtifactBytes: unrehashableBytes, expectedCandidateEvidenceVerificationArtifactByteHash: sha(unrehashableBytes) }), /verification hash drifted/);
  assert.throws(() => verifySavedCreatorCandidateBuiltEvidence({ ...savedBase, candidateEvidenceInput: { ...base, expectedRequestHash: 'f'.repeat(64) } }), /upstream authority/);
  assert.throws(() => verifySavedCreatorCandidateBuiltEvidence({ ...savedBase, candidateEvidenceInput: { ...base, sourceBytesByEntryId: { ...base.sourceBytesByEntryId, [sourceId]: Buffer.from('stale') } } }), /bytes drifted/i);
  assert.throws(() => verifySavedCreatorCandidateBuiltEvidence({ ...savedBase, candidateEvidenceInput: { ...base, candidateBytes: Buffer.from('stale'), expectedCandidateByteHash: sha(Buffer.from('stale')) } }), /validation|header|SFF/i);
  let savedTraps = 0, savedGetters = 0;
  const savedProxy = new Proxy({}, { get() { savedTraps += 1; throw new Error('get'); }, ownKeys() { savedTraps += 1; throw new Error('keys'); }, getPrototypeOf() { savedTraps += 1; throw new Error('proto'); } });
  assert.throws(() => verifySavedCreatorCandidateBuiltEvidence(savedProxy), /must not be a Proxy/); assert.strictEqual(savedTraps, 0);
  const savedAccessor = { ...savedBase }; delete savedAccessor.candidateEvidenceVerificationArtifactBytes; Object.defineProperty(savedAccessor, 'candidateEvidenceVerificationArtifactBytes', { enumerable: true, get() { savedGetters += 1; throw new Error('getter'); } });
  assert.throws(() => verifySavedCreatorCandidateBuiltEvidence(savedAccessor), /data property/); assert.strictEqual(savedGetters, 0);
  const proxiedCandidateInput = new Proxy(base, { get() { savedTraps += 1; throw new Error('nested get'); }, ownKeys() { savedTraps += 1; throw new Error('nested keys'); }, getPrototypeOf() { savedTraps += 1; throw new Error('nested proto'); } });
  assert.throws(() => verifySavedCreatorCandidateBuiltEvidence({ ...savedBase, candidateEvidenceInput: proxiedCandidateInput }), /must not be a Proxy/); assert.strictEqual(savedTraps, 0);
  const proxiedHash = new Proxy({}, { get() { savedTraps += 1; throw new Error('hash get'); }, getPrototypeOf() { savedTraps += 1; throw new Error('hash proto'); } });
  assert.throws(() => verifySavedCreatorCandidateBuiltEvidence({ ...savedBase, expectedCandidateEvidenceVerificationHash: proxiedHash }), /must be a SHA-256 hash/); assert.strictEqual(savedTraps, 0);
  assert.throws(() => verifySavedCreatorCandidateBuiltEvidence({ ...savedBase, extra: true }), /exactly the approved four fields/);
  assert.throws(() => verifySavedCreatorCandidateBuiltEvidence({ ...savedBase, [Symbol('hidden')]: true }), /exactly the approved four fields/);

  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'sff_creator_candidate_built_verifier.js'), 'utf8');
  assert.doesNotMatch(source, /require\(['"](?:fs|child_process|vscode|\.\/sff_builtin_candidate_dispatcher|\.\/sff_backend_registry|.*writer|.*approval)['"]\)/);
  assert.doesNotMatch(source, /writeFile|spawn|execFile|dispatchBuiltInCandidate|createV\d/i);
  console.log('Creator CandidateBuilt verifier reconstructs exact SFF-13 authority without dispatch or effects');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
