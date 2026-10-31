'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createCreatorCertificationEvidenceLoader, pickCreatorCertificationEvidence } = require('../src/sff_creator_certification_evidence_intake');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-cert-intake-'));
  try {
  const evidenceRoot = path.join(root, 'evidence'), nested = path.join(evidenceRoot, 'windows-x64', 'fixture');
  fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(path.join(nested, 'load.bin'), 'load-proof');
  const manifestPath = path.join(root, 'manifest.json'), ledgerPath = path.join(root, 'ledger.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ kind: 'manifest' }));
  fs.writeFileSync(ledgerPath, JSON.stringify({ platforms: [{ fixtures: [{ checkEvidence: { load: [{ id: 'windows-x64/fixture/load.bin' }] } }] }] }));
  let received;
  const load = createCreatorCertificationEvidenceLoader({ requireBackend(id) { return { id }; }, validate(backend, targetId, certification) { received = { backend, targetId, certification }; return { valid: true, validation: { physicalGateSatisfied: true } }; } });
  const result = load({ targetId: 'sff-v2.1', backendId: 'backend-v21', manifestPath, ledgerPath, evidenceRoot });
  assert.strictEqual(result.status, 'certification-evidence-ready');
  assert.strictEqual(result.evidenceArtifactCount, 1);
  assert.strictEqual(Buffer.from(received.certification.evidenceArtifacts['windows-x64/fixture/load.bin'], 'base64').toString(), 'load-proof');
  assert.strictEqual(result.freshCapabilityRequest.evidence.certification.ledgerText, fs.readFileSync(ledgerPath, 'utf8'));

  const traversalLedger = path.join(root, 'traversal.json');
  fs.writeFileSync(traversalLedger, JSON.stringify({ platforms: [{ fixtures: [{ checkEvidence: { load: [{ id: '../outside.bin' }] } }] }] }));
  fs.writeFileSync(path.join(root, 'outside.bin'), 'outside');
  assert.throws(() => load({ targetId: 'sff-v2.1', backendId: 'backend-v21', manifestPath, ledgerPath: traversalLedger, evidenceRoot }), /escapes/);

  const duplicateLedger = path.join(root, 'duplicate.json');
  fs.writeFileSync(duplicateLedger, JSON.stringify({ platforms: [{ fixtures: [{ checkEvidence: { load: [{ id: 'windows-x64/fixture/load.bin' }], reopen: [{ id: 'windows-x64/fixture/load.bin' }] } }] }] }));
  assert.throws(() => load({ targetId: 'sff-v2.1', backendId: 'backend-v21', manifestPath, ledgerPath: duplicateLedger, evidenceRoot }), /reuses/);
  assert.throws(() => load({ targetId: 'sff-v1', backendId: 'backend-v1', manifestPath, ledgerPath, evidenceRoot }), /v2\.0 and v2\.1/);
  const mismatchedIdentityFs = { ...fs, realpathSync: Object.assign(filename => fs.realpathSync(filename), { native: filename => fs.realpathSync.native(filename) }) };
  mismatchedIdentityFs.lstatSync = filename => {
    const stat = fs.lstatSync(filename);
    if (path.resolve(filename) !== path.resolve(manifestPath)) return stat;
    return { ...stat, ino: `${stat.ino}-raced`, isFile: () => stat.isFile(), isSymbolicLink: () => stat.isSymbolicLink(), isDirectory: () => stat.isDirectory() };
  };
  const racedLoad = createCreatorCertificationEvidenceLoader({ fs: mismatchedIdentityFs, requireBackend(id) { return { id }; }, validate() { throw new Error('identity-raced input must not reach validation'); } });
  assert.throws(() => racedLoad({ targetId: 'sff-v2.1', backendId: 'backend-v21', manifestPath, ledgerPath, evidenceRoot }), /changed before it was read/);
  const picks = [[{ fsPath: manifestPath }], [{ fsPath: ledgerPath }], [{ fsPath: evidenceRoot }]], seen = [];
  const picked = await pickCreatorCertificationEvidence({ window: { async showOpenDialog(options) { seen.push(options); return picks.shift(); } } }, { targetId: 'sff-v2.1', backendId: 'backend-v21' }, load);
  assert.strictEqual(picked.status, 'certification-evidence-ready');
  assert.deepStrictEqual(seen.map(item => [item.canSelectFiles, item.canSelectFolders]), [[true, false], [true, false], [false, true]]);
  console.log('SFF Creator certification intake bounds and validates exact manifest, ledger, and rooted physical evidence without fabricating capability data');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
