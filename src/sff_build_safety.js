'use strict';

const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { hash, transactionalWrite, transactionalWriteSet } = require('./mutation_safety');

// This module is the narrow write authority for immutable SFF build snapshots
// and verified-candidate adoption. It never serializes an SFF itself.
const WRITE_AUTHORITY = 'reviewed-sff-build-snapshot-and-adoption';

const SEPARATE = 'preserve-separate';
const SHARE = 'share-identical';
const activeTargetLeases = new Map();
const PRIVATE_RUN_MARKER = '.ikemaker-private-sff-run.json';

function duplicatePolicy(value, fallback = SHARE) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === SEPARATE || normalized === 'preserve' || normalized === 'separate') return SEPARATE;
  if (normalized === SHARE || normalized === 'share' || normalized === 'link') return SHARE;
  return fallback;
}

function storagePolicy(input = {}, fallback = {}) {
  const value = input && typeof input === 'object' ? input : {};
  return {
    sprites: duplicatePolicy(value.sprites ?? value.spriteDuplicatePolicy, duplicatePolicy(fallback.sprites, SHARE)),
    palettes: duplicatePolicy(value.palettes ?? value.paletteDuplicatePolicy, duplicatePolicy(fallback.palettes, SHARE))
  };
}

function fileHash(filename) {
  return new Promise((resolve, reject) => {
    const digest = crypto.createHash('sha256'), stream = require('fs').createReadStream(filename);
    stream.on('error', reject);
    stream.on('data', (chunk) => digest.update(chunk));
    stream.on('end', () => resolve(digest.digest('hex').toUpperCase()));
  });
}

async function copyApprovedSnapshot(fs, source, destination, expectedHash) {
  const temporary = path.join(path.dirname(destination), `.${path.basename(destination)}.${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.snapshot`);
  try {
    fs.copyFileSync(source, temporary);
    const actual = await fileHash(temporary);
    if (actual !== String(expectedHash || '').trim().toUpperCase()) throw new Error(`Source changed after approval: ${source}`);
    if (fs.existsSync(destination)) fs.unlinkSync(destination);
    fs.renameSync(temporary, destination);
    return actual;
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function candidatePath(outputDirectory, target) {
  return path.join(path.resolve(outputDirectory), `.ikemaker-candidate-${path.basename(target)}`);
}

function targetLeaseKey(target) {
  const resolved = path.resolve(target);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

async function withTargetLease(target, operation) {
  const key = targetLeaseKey(target);
  if (activeTargetLeases.has(key)) throw new Error(`An SFF build or adoption is already running for this target: ${path.resolve(target)}`);
  const lease = Object.freeze({ key, target: path.resolve(target), acquiredAt: new Date().toISOString() });
  activeTargetLeases.set(key, lease);
  try { return await operation(lease); }
  finally { if (activeTargetLeases.get(key) === lease) activeTargetLeases.delete(key); }
}

function createPrivateRun(fs, target, options = {}) {
  const parent = path.resolve(options.parent || os.tmpdir());
  fs.mkdirSync(parent, { recursive: true });
  const directory = fs.mkdtempSync(path.join(parent, 'ikemaker-sff-run-'));
  const token = crypto.randomBytes(24).toString('hex');
  const marker = path.join(directory, PRIVATE_RUN_MARKER);
  fs.writeFileSync(marker, `${JSON.stringify({ version: 1, token, target: path.resolve(target) })}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return Object.freeze({ directory, marker, token, target: path.resolve(target), candidate: path.join(directory, `candidate-${path.basename(target)}`) });
}

function cleanupPrivateRun(fs, run) {
  if (!run?.directory || !run?.marker || !run?.token) throw new Error('Refusing to clean an unowned SFF run directory.');
  const directory = path.resolve(run.directory), marker = path.resolve(run.marker);
  if (path.dirname(marker) !== directory || path.basename(marker) !== PRIVATE_RUN_MARKER || !fs.existsSync(marker)) throw new Error('Refusing to clean an SFF run directory without its ownership marker.');
  let recorded;
  try { recorded = JSON.parse(fs.readFileSync(marker, 'utf8')); } catch (_) { throw new Error('Refusing to clean an SFF run directory with an invalid ownership marker.'); }
  if (recorded.token !== run.token || path.resolve(recorded.target || '') !== path.resolve(run.target || '')) throw new Error('Refusing to clean an SFF run directory whose ownership marker does not match.');
  fs.rmSync(directory, { recursive: true, force: false });
}

function loadCandidateBytes(fs, candidate) {
  if (!fs.existsSync(candidate)) throw new Error(`The SFF candidate is missing: ${candidate}`);
  const bytes = fs.readFileSync(candidate);
  return Object.freeze({ bytes, hash: hash(bytes), source: path.resolve(candidate) });
}

function verifyLoadedCandidate(fs, loaded, verifier, options = {}) {
  if (!loaded || !Buffer.isBuffer(loaded.bytes) || !loaded.hash) throw new Error('Candidate verification requires loaded SFF bytes and their hash.');
  if (hash(loaded.bytes) !== loaded.hash) throw new Error('The loaded SFF candidate bytes changed before verification.');
  const directory = path.resolve(options.directory || path.dirname(loaded.source));
  const verificationPath = path.join(directory, `.verify-${process.pid}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}.sff`);
  fs.writeFileSync(verificationPath, loaded.bytes, { flag: 'wx', mode: 0o600 });
  try {
    const result = verifier(verificationPath);
    const after = fs.readFileSync(verificationPath);
    if (hash(after) !== loaded.hash) throw new Error('The sealed SFF verification copy changed during validation.');
    return Object.freeze({ ...loaded, bytes: Buffer.from(loaded.bytes), verification: result });
  } finally {
    if (fs.existsSync(verificationPath)) fs.unlinkSync(verificationPath);
  }
}

function captureTarget(fs, target) {
  const filename = path.resolve(target), exists = fs.existsSync(filename), content = exists ? fs.readFileSync(filename) : Buffer.alloc(0);
  return { filename, exists, hash: hash(content) };
}

function preserveTargetBackup(fs, snapshot, options = {}) {
  if (!snapshot?.filename || !snapshot.exists || !snapshot.hash) throw new Error('A durable SFF backup requires an existing reviewed target snapshot.');
  const bytes = fs.readFileSync(snapshot.filename), observed = hash(bytes);
  if (observed !== snapshot.hash) throw new Error('The active SFF changed before its durable backup could be preserved. Nothing was adopted.');
  const directory = path.resolve(options.directory || path.join(path.dirname(snapshot.filename), 'backups'));
  const extension = path.extname(snapshot.filename) || '.sff', base = path.basename(snapshot.filename, path.extname(snapshot.filename));
  const filename = path.join(directory, `${base}.before-ikemaker-${snapshot.hash.slice(0, 16)}${extension}`);
  if (fs.existsSync(filename)) {
    const existing = fs.readFileSync(filename);
    if (hash(existing) !== snapshot.hash || !existing.equals(bytes)) throw new Error(`The durable backup path contains different bytes: ${filename}`);
  } else transactionalWrite(fs, filename, bytes, { label: options.label || 'preserve-active-sff-before-adoption', allowExisting: false, backup: false, journal: options.journal !== false, journalRoot: options.journalRoot || path.dirname(snapshot.filename) });
  const restored = fs.readFileSync(filename), restoredHash = hash(restored);
  if (restoredHash !== snapshot.hash || !restored.equals(bytes)) throw new Error('Durable SFF backup verification failed. Nothing was adopted.');
  return Object.freeze({ path: filename, hash: restoredHash, bytes: restored.length, source: snapshot.filename });
}

function adoptCandidate(fs, candidate, snapshot, options = {}) {
  if (!snapshot?.filename) throw new Error('The candidate has no reviewed adoption target.');
  const content = Buffer.isBuffer(candidate) ? candidate : candidate?.bytes;
  if (!Buffer.isBuffer(content)) {
    if (!fs.existsSync(candidate)) throw new Error(`The verified SFF candidate is missing: ${candidate}`);
    return adoptCandidate(fs, loadCandidateBytes(fs, candidate), snapshot, options);
  }
  if (candidate?.hash && hash(content) !== candidate.hash) throw new Error('The verified SFF candidate bytes no longer match their approved hash.');
  return transactionalWrite(fs, snapshot.filename, content, {
    ...options,
    expectedHash: snapshot.hash,
    ...(snapshot.exists ? {} : { allowExisting: false })
  });
}

function adoptCandidateWithArtifacts(fs, candidate, snapshot, artifacts = [], options = {}) {
  if (!snapshot?.filename) throw new Error('The candidate has no reviewed adoption target.');
  const content = Buffer.isBuffer(candidate) ? candidate : candidate?.bytes;
  if (!Buffer.isBuffer(content)) throw new Error('Atomic SFF adoption requires already loaded and verified candidate bytes.');
  if (candidate?.hash && hash(content) !== candidate.hash) throw new Error('The verified SFF candidate bytes no longer match their approved hash.');
  const expectedHashes = { [path.resolve(snapshot.filename)]: snapshot.hash };
  const writes = [[snapshot.filename, content]];
  for (const artifact of artifacts) {
    if (!artifact?.snapshot?.filename || artifact.content == null) throw new Error('Atomic SFF adoption received an incomplete companion artifact.');
    expectedHashes[path.resolve(artifact.snapshot.filename)] = artifact.snapshot.hash;
    writes.push([artifact.snapshot.filename, artifact.content]);
  }
  return transactionalWriteSet(fs, writes, {
    ...options, expectedHashes, aggregateJournal: true
  });
}

module.exports = {
  WRITE_AUTHORITY, SEPARATE, SHARE, duplicatePolicy, storagePolicy, copyApprovedSnapshot, candidatePath,
  captureTarget, preserveTargetBackup, adoptCandidate, adoptCandidateWithArtifacts, withTargetLease, createPrivateRun, cleanupPrivateRun, loadCandidateBytes,
  verifyLoadedCandidate, PRIVATE_RUN_MARKER
};
