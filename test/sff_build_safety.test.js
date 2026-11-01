'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SEPARATE, SHARE, storagePolicy, copyApprovedSnapshot, candidatePath, captureTarget, preserveTargetBackup, adoptCandidate, adoptCandidateWithArtifacts } = require('../src/sff_build_safety');

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex').toUpperCase();

(async () => {
  assert.deepStrictEqual(storagePolicy({ sprites: 'preserve', palettes: 'link' }), { sprites: SEPARATE, palettes: SHARE });
  assert.deepStrictEqual(storagePolicy({}, { sprites: SEPARATE, palettes: SEPARATE }), { sprites: SEPARATE, palettes: SEPARATE });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-sff-build-safety-'));
  try {
    const source = path.join(root, 'source.png'), snapshot = path.join(root, 'input', 'sprite.png');
    fs.mkdirSync(path.dirname(snapshot)); fs.writeFileSync(source, 'approved-pixels');
    await copyApprovedSnapshot(fs, source, snapshot, sha('approved-pixels'));
    assert.strictEqual(fs.readFileSync(snapshot, 'utf8'), 'approved-pixels', 'the validated snapshot, not a later source read, becomes build input');
    fs.writeFileSync(source, 'changed-pixels');
    await assert.rejects(copyApprovedSnapshot(fs, source, snapshot, sha('approved-pixels')), /changed after approval/);
    assert.strictEqual(fs.readFileSync(snapshot, 'utf8'), 'approved-pixels', 'a rejected source snapshot must not replace the last approved input');

    const target = path.join(root, 'active.sff'), candidate = candidatePath(root, target);
    fs.writeFileSync(target, 'active-v1'); const baseline = captureTarget(fs, target); fs.writeFileSync(candidate, 'verified-candidate');
    const backup = preserveTargetBackup(fs, baseline, { directory: path.join(root, 'backups'), journal: false });
    assert.strictEqual(fs.readFileSync(backup.path, 'utf8'), 'active-v1');
    assert.strictEqual(backup.hash, baseline.hash, 'the durable backup must verify as the exact reviewed active target');
    assert.strictEqual(preserveTargetBackup(fs, baseline, { directory: path.join(root, 'backups'), journal: false }).path, backup.path, 'the same reviewed target reuses its immutable content-addressed backup');
    adoptCandidate(fs, candidate, baseline, { label: 'test-adoption', journal: false });
    assert.strictEqual(fs.readFileSync(target, 'utf8'), 'verified-candidate');
    const stale = captureTarget(fs, target); fs.writeFileSync(target, 'outside-change'); fs.writeFileSync(candidate, 'candidate-v2');
    assert.throws(() => adoptCandidate(fs, candidate, stale, { label: 'test-stale-adoption', journal: false }), /changed after it was loaded/);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), 'outside-change', 'stale adoption must never overwrite the active SFF');
    const pairedBaseline = captureTarget(fs, target), sidecar = path.join(root, '.ikemen-tools', 'lifecycle.json'), sidecarBaseline = captureTarget(fs, sidecar);
    const paired = adoptCandidateWithArtifacts(fs, Buffer.from('atomic-candidate'), pairedBaseline, [{ snapshot: sidecarBaseline, content: '{"version":1}\n' }], { label: 'atomic-sff-and-lifecycle', journal: false });
    assert.strictEqual(paired.length, 2); assert.strictEqual(fs.readFileSync(target, 'utf8'), 'atomic-candidate'); assert.strictEqual(fs.readFileSync(sidecar, 'utf8'), '{"version":1}\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log('SFF build snapshot, candidate adoption, and reviewed duplicate-policy tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
