'use strict';

const nodeFs = require('fs');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');
const { parseSndBuffer, soundBuffer } = require('./snd_reader');
const { hash, transactionalWrite } = require('./mutation_safety');
const { captureTarget, preserveTargetBackup, adoptCandidate, withTargetLease } = require('./sff_build_safety');

function sha(value) { return crypto.createHash('sha256').update(value).digest('hex').toUpperCase(); }
function verifyCandidate(bytes, prepared) {
  const archive = parseSndBuffer(bytes, prepared.candidate), expected = prepared.entries;
  if (archive.issues.length || archive.entries.length !== expected.length) throw new Error(`The private SndMaker candidate failed structural verification: ${archive.issues.join(' ') || `expected ${expected.length} sounds, found ${archive.entries.length}`}.`);
  for (let index = 0; index < expected.length; index += 1) { const actual = archive.entries[index], wanted = expected[index], content = soundBuffer(archive, actual); if (`${actual.group},${actual.index}` !== wanted.identity || sha(content) !== wanted.byteHash || content.length !== wanted.byteLength) throw new Error(`Private SndMaker candidate sound #${index} differs from the reviewed ${wanted.identity} input.`); }
  return Object.freeze({ archive, byteHash: sha(bytes), byteLength: bytes.length });
}
async function executeSndTransferPackage(prepared, options = {}) {
  if (prepared?.schema !== 'ikemaker.snd-transfer-build-package' || prepared?.version !== 1 || !Array.isArray(prepared.entries)) throw new TypeError('A reviewed SND Transfer build package is required.');
  const fs = options.fs || nodeFs, spawnSync = options.spawnSync || childProcess.spawnSync, destination = path.resolve(String(options.destination || '')), executable = path.resolve(String(options.executable || ''));
  if (!destination || !fs.existsSync(destination)) throw new Error('The exact Destination SND is unavailable.'); if (!executable || (!options.spawnSync && !fs.existsSync(executable))) throw new Error('The configured SndMaker executable is unavailable.'); if (typeof options.confirmAdoption !== 'function') throw new Error('SND Transfer Apply requires an explicit post-build adoption confirmation.');
  return withTargetLease(destination, async () => {
    const baseline = captureTarget(fs, destination); if (String(baseline.hash).toUpperCase() !== String(options.destinationFingerprint || '').toUpperCase()) throw new Error('The Destination SND changed after review. Nothing was built or adopted.');
    const manifestText = fs.readFileSync(prepared.manifestPath, 'utf8'); if (fs.existsSync(prepared.candidate)) fs.unlinkSync(prepared.candidate);
    const run = spawnSync(executable, [], { cwd: prepared.packageRoot, input: manifestText, encoding: 'utf8', windowsHide: true });
    if (run?.error || run?.status !== 0) throw run?.error || new Error(run?.stderr || run?.stdout || `SndMaker exited with ${run?.status}.`);
    if (!fs.existsSync(prepared.candidate)) throw new Error('SndMaker reported success but did not create the private candidate. The active SND is unchanged.');
    const candidateBytes = fs.readFileSync(prepared.candidate), verified = verifyCandidate(candidateBytes, prepared), current = captureTarget(fs, destination);
    if (current.hash !== baseline.hash || current.exists !== baseline.exists) throw new Error('The Destination SND changed while its private candidate was built. Nothing was adopted.');
    const approved = await options.confirmAdoption({ candidateHash: verified.byteHash, byteLength: verified.byteLength, soundCount: verified.archive.entries.length, identities: verified.archive.entries.map(entry => entry.identity) });
    if (approved !== true) return Object.freeze({ cancelled: true, adopted: false, candidateHash: verified.byteHash, destinationUnchanged: captureTarget(fs, destination).hash === baseline.hash });
    const durableBackup = preserveTargetBackup(fs, baseline, { journalRoot: path.dirname(destination), label: 'preserve-snd-before-reviewed-transfer' }), adoption = adoptCandidate(fs, { bytes: candidateBytes, hash: hash(candidateBytes) }, baseline, { label: 'adopt-reviewed-snd-transfer', backup: false, journal: true, journalRoot: path.dirname(destination) }), final = captureTarget(fs, destination);
    const receipt = { schema: 'ikemaker.snd-transfer-execution-receipt', version: 1, createdAt: new Date().toISOString(), analysisIdentity: prepared.analysisIdentity, planIdentity: prepared.planIdentity, evidenceFingerprint: prepared.evidenceFingerprint, candidateFingerprint: verified.byteHash, destinationBeforeFingerprint: String(baseline.hash).toUpperCase(), destinationAfterFingerprint: String(final.hash).toUpperCase(), backup: { path: durableBackup.path, fingerprint: String(durableBackup.hash).toUpperCase() }, entries: prepared.entries };
    const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`), receiptPath = path.join(prepared.packageRoot, `snd-transfer-receipt-${sha(receiptBytes).slice(0, 16)}.json`);
    let receiptWarning = '';
    try { transactionalWrite(fs, receiptPath, receiptBytes, { label: 'snd-transfer-execution-receipt', allowExisting: false, backup: false, journal: false }); }
    catch (error) { receiptWarning = `The SND was adopted and backed up, but its transfer receipt could not be saved: ${error.message}`; }
    return Object.freeze({ cancelled: false, adopted: true, candidateHash: verified.byteHash, destinationFingerprint: String(final.hash).toUpperCase(), durableBackup: Object.freeze(durableBackup), adoption: Object.freeze(adoption), receiptPath: receiptWarning ? null : receiptPath, receiptWarning });
  });
}

module.exports = { verifyCandidate, executeSndTransferPackage };
