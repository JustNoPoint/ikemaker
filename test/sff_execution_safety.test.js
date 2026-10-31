'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  withTargetLease, createPrivateRun, cleanupPrivateRun, loadCandidateBytes,
  verifyLoadedCandidate, captureTarget, adoptCandidate
} = require('../src/sff_build_safety');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-sff-execution-safety-'));
  try {
    const target = path.join(root, 'active.sff');
    fs.writeFileSync(target, 'active-v1');

    const first = createPrivateRun(fs, target, { parent: root });
    const second = createPrivateRun(fs, target, { parent: root });
    assert.notStrictEqual(first.directory, second.directory, 'every execution receives a unique private directory');
    assert.notStrictEqual(first.candidate, second.candidate, 'every execution receives a unique candidate path');

    let release;
    const held = withTargetLease(target, () => new Promise((resolve) => { release = resolve; }));
    await new Promise((resolve) => setImmediate(resolve));
    await assert.rejects(withTargetLease(target, async () => {}), /already running/, 'overlapping builds for one target are rejected');
    assert.strictEqual(await withTargetLease(path.join(root, 'other.sff'), async () => 'parallel-other-target'), 'parallel-other-target');
    release('finished');
    assert.strictEqual(await held, 'finished');
    assert.strictEqual(await withTargetLease(target, async () => 'lease-released'), 'lease-released');

    fs.writeFileSync(first.candidate, 'candidate-before-swap');
    const loaded = loadCandidateBytes(fs, first.candidate);
    const verified = verifyLoadedCandidate(fs, loaded, (sealedPath) => {
      assert.strictEqual(fs.readFileSync(sealedPath, 'utf8'), 'candidate-before-swap');
      fs.writeFileSync(first.candidate, 'candidate-after-swap');
      return { ok: true };
    }, { directory: first.directory });
    const snapshot = captureTarget(fs, target);
    adoptCandidate(fs, verified, snapshot, { label: 'exact-verified-byte-adoption', journal: false });
    assert.strictEqual(fs.readFileSync(target, 'utf8'), 'candidate-before-swap', 'adoption uses the exact loaded and verified bytes, not a later candidate-path read');

    const stale = captureTarget(fs, target);
    fs.writeFileSync(target, 'outside-target-change');
    assert.throws(() => adoptCandidate(fs, verified, stale, { label: 'stale-target', journal: false }), /changed after it was loaded/);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), 'outside-target-change', 'target drift blocks adoption without overwriting external changes');

    const userPackageInput = path.join(root, 'exported-package', 'input', 'user-owned.png');
    fs.mkdirSync(path.dirname(userPackageInput), { recursive: true });
    fs.writeFileSync(userPackageInput, 'keep-me');
    cleanupPrivateRun(fs, first);
    cleanupPrivateRun(fs, second);
    assert.strictEqual(fs.readFileSync(userPackageInput, 'utf8'), 'keep-me', 'private-run cleanup cannot delete exported package inputs');
    assert.throws(() => cleanupPrivateRun(fs, { directory: path.dirname(userPackageInput), marker: path.join(path.dirname(userPackageInput), '.ikemaker-private-sff-run.json'), token: 'forged', target }), /Refusing to clean/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log('SFF unique execution paths, target leases, exact-byte adoption, drift blocking, and cleanup boundaries passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
