'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { generate } = require('../tools/generate_sff_v20_runtime_certification_fixtures');
const { REQUIRED_CHECKS, validateCertificationLedger, validateCertificationEvidence } = require('../src/sff_runtime_certification');
const { requireSffBackend } = require('../src/sff_backend_registry');
const { assertSffV20Raw8 } = require('../src/sff_v20_strict_validator');

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function completedEvidence(result) {
  const ledger = JSON.parse(JSON.stringify(result.ledger)), evidenceArtifacts = {};
  for (const platform of ledger.platforms.filter(item => item.required)) {
    platform.tester = 'physical test fixture'; platform.testedAt = '2026-10-09T12:00:00.000Z'; platform.osVersion = `${platform.platformId} fixture host`; platform.ikemenBuild = platform.platformId.startsWith('windows') ? 'MUGEN 1.0 + IKEMEN nightly' : 'IKEMEN nightly';
    for (const fixture of platform.fixtures) for (const check of REQUIRED_CHECKS) {
      const bytes = Buffer.from(`${platform.platformId}:${fixture.fixtureId}:${check}`), id = `${platform.platformId}/${fixture.fixtureId}/${check}.png`;
      fixture.checks[check] = 'pass'; fixture.checkEvidence[check] = [{ id, sha256: sha(bytes), description: `Fixture evidence for ${check}.` }]; evidenceArtifacts[id] = bytes.toString('base64');
    }
  }
  return { ledger, evidenceArtifacts };
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-v20-runtime-certification-'));
try {
  const first = generate(path.join(root, 'first')), repeat = generate(path.join(root, 'repeat'));
  assert.strictEqual(first.manifest.targetId, 'sff-v2.0'); assert.strictEqual(first.manifest.backendId, 'ikemaker-builtin-sff-v2.0');
  assert.deepStrictEqual(first.manifest.adapter, { id: 'builtin-v20-raw8', version: 1 });
  assert.strictEqual(first.manifest.writerProfile, 'sff-v2.0-raw8-compare-only'); assert.strictEqual(first.manifest.adoptionAllowed, false);
  assert.strictEqual(first.manifest.fixtures.length, 5); assert.deepStrictEqual(first.manifest.fixtures, repeat.manifest.fixtures);
  assert.strictEqual(sha(first.manifestBytes), '85cc7ab7741c822c05ba43dc7df596710599c9990e66732475089dd36a370e43');
  assert(requireSffBackend('ikemaker-builtin-sff-v2.0').certificationManifestHashes.includes(sha(first.manifestBytes)));
  for (const fixture of first.manifest.fixtures) {
    const bytes = fs.readFileSync(path.join(first.root, fixture.filename)); assert.strictEqual(sha(bytes), fixture.byteHash); assertSffV20Raw8(bytes);
    assert.strictEqual(sha(fs.readFileSync(path.join(first.root, ...fixture.specification.filename.split('/')))), fixture.specification.byteHash);
    assert.strictEqual(sha(fs.readFileSync(path.join(first.root, ...fixture.strictValidation.filename.split('/')))), fixture.strictValidation.byteHash);
  }
  const pending = validateCertificationLedger(first.manifest, first.manifestBytes, first.ledger);
  assert.strictEqual(pending.valid, true); assert.strictEqual(pending.physicalGateSatisfied, false);
  const completed = completedEvidence(first), passed = validateCertificationLedger(first.manifest, first.manifestBytes, completed.ledger);
  assert.strictEqual(passed.physicalGateSatisfied, true); assert.strictEqual(passed.adoptionAllowed, false);
  const exact = validateCertificationEvidence(requireSffBackend('ikemaker-builtin-sff-v2.0'), 'sff-v2.0', { manifestText: first.manifestBytes.toString('utf8'), ledgerText: JSON.stringify(completed.ledger), evidenceArtifacts: completed.evidenceArtifacts });
  assert.strictEqual(exact.valid, true, exact.error); assert.strictEqual(exact.adoptionAllowed, false);
  const missing = { ...completed.evidenceArtifacts }; delete missing[Object.keys(missing)[0]];
  assert.strictEqual(validateCertificationEvidence(requireSffBackend('ikemaker-builtin-sff-v2.0'), 'sff-v2.0', { manifestText: first.manifestBytes.toString('utf8'), ledgerText: JSON.stringify(completed.ledger), evidenceArtifacts: missing }).valid, false);
  console.log('SFF v2.0 RAW8 certification kit is deterministic, pinned, exact-evidence-bound, and adoption-disabled');
} finally { fs.rmSync(root, { recursive: true, force: true }); }

module.exports = { completedEvidence };
