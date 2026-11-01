'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildFixture, certification, kits } = require('./sff_creator_candidate_dispatch.test');
const { dispatchCreatorApprovedCandidate } = require('../src/sff_creator_candidate_dispatch');
const { persistCreatorCandidate, persistCreatorCandidateToReservedPath } = require('../src/sff_creator_candidate_persistence');

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
function persistenceInput(dispatchInput, stagingParent, activeArchivePath, filename = 'candidate.sff') {
  const dispatched = dispatchCreatorApprovedCandidate(dispatchInput), receiptBytes = Buffer.from(JSON.stringify(dispatched.receipt, null, 2));
  return { candidateDispatchInput: dispatchInput, candidateDispatchReceiptArtifactBytes: receiptBytes, expectedCandidateDispatchReceiptArtifactByteHash: sha(receiptBytes), expectedCandidateDispatchReceiptHash: dispatched.receiptHash, expectedRequestHash: dispatched.receipt.requestHash, expectedSpecificationHash: dispatched.receipt.specificationHash, expectedApprovalReceiptHash: dispatched.receipt.approvalReceiptHash, expectedSourceSnapshotHash: dispatched.receipt.sourceSnapshotHash, expectedCandidateByteHash: dispatched.receipt.candidateByteHash, candidateBytes: dispatched.readCandidateBytes(), stagingParent, candidateFilename: filename, activeArchivePath, protectedRoots: [path.dirname(activeArchivePath)] };
}

function runTests() { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-creator-persistence-')); try {
  const certifications = {}, fixtures = {};
  for (const [targetId, kit] of Object.entries(kits)) certifications[targetId] = certification(kit.generate(path.join(root, `cert-${targetId.replace(/[^a-z0-9]/gi, '_')}`)));
  const protectedRoot = path.join(root, 'active-character'); fs.mkdirSync(protectedRoot); const activeArchivePath = path.join(protectedRoot, 'active.sff'); fs.writeFileSync(activeArchivePath, Buffer.from('active archive remains unchanged')); const activeBefore = fs.readFileSync(activeArchivePath);
  for (const targetId of Object.keys(kits)) {
    const fixture = buildFixture(targetId, certifications[targetId]); fixtures[targetId] = fixture;
    const stagingParent = path.join(root, `staging-${targetId.replace(/[^a-z0-9]/gi, '_')}`); fs.mkdirSync(stagingParent);
    const input = persistenceInput(fixture.input, stagingParent, activeArchivePath, `${targetId.replace(/[^a-z0-9]/gi, '-')}.sff`), result = persistCreatorCandidate(input);
    assert(Object.isFrozen(result)); assert(Object.isFrozen(result.receipt)); assert.strictEqual(result.receipt.selection.targetId, targetId); assert.strictEqual(result.receipt.candidatePersisted, true); assert.strictEqual(result.receipt.writesCommitted, true); assert.strictEqual(result.receipt.activeArchiveModified, false); assert.strictEqual(result.receipt.adoptionAllowed, false); assert.strictEqual(result.receipt.byteEqualityRequired, false); assert.strictEqual(result.receipt.fileFsync, 'completed'); assert(['completed', 'unsupported-by-platform'].includes(result.receipt.directoryFsync));
    assert.strictEqual(result.receipt.activeArchive.path, path.resolve(activeArchivePath)); assert.strictEqual(result.receipt.activeArchive.byteHash, sha(activeBefore)); assert.strictEqual(result.receipt.activeArchive.byteLength, activeBefore.length);
    assert.strictEqual(sha(fs.readFileSync(result.stagingCandidatePath)), input.expectedCandidateByteHash); assert.deepStrictEqual(fs.readFileSync(activeArchivePath), activeBefore);
    assert.throws(() => persistCreatorCandidate(input), /already exists/);
  }

  const fixture = fixtures['sff-v2.1'], firstParent = path.join(root, 'formatting-parent'); fs.mkdirSync(firstParent); const base = persistenceInput(fixture.input, firstParent, activeArchivePath);
  const reservedRoot = path.join(root, 'reserved-candidates'); fs.mkdirSync(reservedRoot); const { stagingParent: ignoredParent, candidateFilename: ignoredName, ...reservedBase } = base, reservedCandidatePath = path.join(reservedRoot, `${sha(Buffer.from('pre-operation-reservation'))}.sff`), reserved = persistCreatorCandidateToReservedPath({ ...reservedBase, reservedCandidatePath });
  assert.strictEqual(reserved.stagingCandidatePath, reservedCandidatePath); assert.strictEqual(sha(fs.readFileSync(reservedCandidatePath)), base.expectedCandidateByteHash); assert.deepStrictEqual(fs.readFileSync(activeArchivePath), activeBefore);
  const retainedReserved = fs.readFileSync(reservedCandidatePath); assert.throws(() => persistCreatorCandidateToReservedPath({ ...reservedBase, reservedCandidatePath }), /already exists/); assert.deepStrictEqual(fs.readFileSync(reservedCandidatePath), retainedReserved);
  assert.throws(() => persistCreatorCandidateToReservedPath({ ...reservedBase, reservedCandidatePath: path.join(reservedRoot, 'candidate.sff') }), /SHA-256 reservation basename/);
  const parsed = JSON.parse(base.candidateDispatchReceiptArtifactBytes.toString('utf8')), reordered = Buffer.from(JSON.stringify({ sourceSnapshotHash: parsed.sourceSnapshotHash, ...parsed }, null, 4));
  assert(persistCreatorCandidate({ ...base, candidateDispatchReceiptArtifactBytes: reordered, expectedCandidateDispatchReceiptArtifactByteHash: sha(reordered) }));
  for (const key of ['expectedCandidateDispatchReceiptArtifactByteHash', 'expectedCandidateDispatchReceiptHash', 'expectedRequestHash', 'expectedSpecificationHash', 'expectedApprovalReceiptHash', 'expectedSourceSnapshotHash', 'expectedCandidateByteHash']) {
    const parent = path.join(root, `bad-${key}`); fs.mkdirSync(parent); assert.throws(() => persistCreatorCandidate({ ...base, stagingParent: parent, [key]: 'f'.repeat(64) }), /hash|authority|match/i); assert.strictEqual(fs.readdirSync(parent).length, 0, `${key} fails before filesystem mutation`);
  }
  const badBytesParent = path.join(root, 'bad-bytes'); fs.mkdirSync(badBytesParent); assert.throws(() => persistCreatorCandidate({ ...base, stagingParent: badBytesParent, candidateBytes: Buffer.from('wrong') }), /candidate bytes/i); assert.strictEqual(fs.readdirSync(badBytesParent).length, 0);
  const proxiedBytesParent = path.join(root, 'proxied-bytes'); fs.mkdirSync(proxiedBytesParent); assert.throws(() => persistCreatorCandidate({ ...base, stagingParent: proxiedBytesParent, candidateBytes: new Proxy(base.candidateBytes, {}) }), /non-proxy Buffer/); assert.strictEqual(fs.readdirSync(proxiedBytesParent).length, 0);
  const tamperedReceipt = { ...parsed, writesCommitted: true }, tamperedReceiptBytes = Buffer.from(JSON.stringify(tamperedReceipt)); const tamperedParent = path.join(root, 'tampered-receipt'); fs.mkdirSync(tamperedParent); assert.throws(() => persistCreatorCandidate({ ...base, stagingParent: tamperedParent, candidateDispatchReceiptArtifactBytes: tamperedReceiptBytes, expectedCandidateDispatchReceiptArtifactByteHash: sha(tamperedReceiptBytes), expectedCandidateDispatchReceiptHash: require('../src/sff_capability_report').hashCanonical(tamperedReceipt) }), /does not exactly match/); assert.strictEqual(fs.readdirSync(tamperedParent).length, 0);

  for (const [index, filename] of ['../escape.sff', 'C:\\escape.sff', '\\\\server\\share\\x.sff', 'bad:name.sff', 'CON.sff', 'trailingspace .sff', 'bad.txt', '.sff'].entries()) {
    const parent = path.join(root, `bad-name-${index}`); fs.mkdirSync(parent); assert.throws(() => persistCreatorCandidate({ ...base, stagingParent: parent, candidateFilename: filename }), /candidateFilename/); assert.strictEqual(fs.readdirSync(parent).length, 0);
  }
  const protectedParent = path.join(protectedRoot, 'staging'); fs.mkdirSync(protectedParent); assert.throws(() => persistCreatorCandidate({ ...base, stagingParent: protectedParent }), /must not overlap/); assert.strictEqual(fs.readdirSync(protectedParent).length, 0);
  assert.throws(() => persistCreatorCandidate({ ...base, stagingParent: root }), /must not overlap/, 'a broad staging parent may not contain a protected workspace');
  assert.throws(() => persistCreatorCandidate({ ...base, protectedRoots: new Proxy(base.protectedRoots, {}) }), /non-proxy/);
  const failedPublishParent = path.join(root, 'failed-publish'); fs.mkdirSync(failedPublishParent); const originalLinkSync = fs.linkSync;
  try {
    fs.linkSync = () => { const error = new Error('hard links unavailable'); error.code = 'ENOTSUP'; throw error; };
    assert.throws(() => persistCreatorCandidate({ ...base, stagingParent: failedPublishParent }), /hard links unavailable/);
  } finally { fs.linkSync = originalLinkSync; }
  assert.deepStrictEqual(fs.readdirSync(failedPublishParent), [], 'failed publication cleans the partial and empty private operation directory');
  const failedParentSync = path.join(root, 'failed-parent-sync'); fs.mkdirSync(failedParentSync); const originalFsyncSync = fs.fsyncSync;
  try {
    fs.fsyncSync = () => { const error = new Error('parent sync failed'); error.code = 'EIO'; throw error; };
    assert.throws(() => persistCreatorCandidate({ ...base, stagingParent: failedParentSync }), /parent sync failed/);
  } finally { fs.fsyncSync = originalFsyncSync; }
  assert.deepStrictEqual(fs.readdirSync(failedParentSync), [], 'a parent-directory sync failure does not leave an empty operation directory');
  const unstableActiveParent = path.join(root, 'unstable-active'); fs.mkdirSync(unstableActiveParent); const originalReadSync = fs.readSync; let changedDuringFingerprint = false;
  try {
    fs.readSync = (...args) => { const count = originalReadSync(...args); if (!changedDuringFingerprint) { changedDuringFingerprint = true; fs.appendFileSync(activeArchivePath, Buffer.from('drift')); } return count; };
    assert.throws(() => persistCreatorCandidate({ ...base, stagingParent: unstableActiveParent }), /changed while it was fingerprinted/);
  } finally { fs.readSync = originalReadSync; fs.writeFileSync(activeArchivePath, activeBefore); }
  assert.deepStrictEqual(fs.readdirSync(unstableActiveParent), [], 'an unstable active archive fails before candidate filesystem mutation');
  if (process.platform !== 'win32') {
    const realParent = path.join(root, 'real-parent'); fs.mkdirSync(realParent); const linkedParent = path.join(root, 'linked-parent'); fs.symlinkSync(realParent, linkedParent, 'dir'); assert.throws(() => persistCreatorCandidate({ ...base, stagingParent: linkedParent }), /symbolic-link/); assert.strictEqual(fs.readdirSync(realParent).length, 0);
  }
  assert.throws(() => persistCreatorCandidate({ ...base, overwrite: true }), /contain exactly/);
  assert.deepStrictEqual(fs.readFileSync(activeArchivePath), activeBefore);
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'sff_creator_candidate_persistence.js'), 'utf8'); assert(!/require\(['"](?:child_process|vscode)['"]\)/.test(source)); assert(!/\b(?:spawn|execFile)\b/.test(source));
  console.log('SFF Creator persistence replays the exact candidate, publishes only a synced private no-overwrite file, revalidates it, and never modifies the active archive');
} finally { fs.rmSync(root, { recursive: true, force: true }); } }

if (require.main === module) runTests();
module.exports = { persistenceInput };
