'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { generate } = require('../tools/generate_sff_v1_runtime_certification_fixtures');
const { REQUIRED_CHECKS, validateCertificationLedger, validateCertificationEvidence } = require('../src/sff_runtime_certification');
const { requireSffBackend } = require('../src/sff_backend_registry');
const { assertSffV1Pcx8 } = require('../src/sff_v1_pcx8_strict_validator');

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function completed(result) {
  const ledger = JSON.parse(JSON.stringify(result.ledger)), evidenceArtifacts = {};
  for (const platform of ledger.platforms.filter(item => item.required)) {
    platform.tester = 'physical fixture'; platform.testedAt = '2026-10-09T12:00:00.000Z'; platform.osVersion = platform.platformId; platform.ikemenBuild = 'engine-specific-physical-fixture';
    for (const fixture of platform.fixtures) for (const check of REQUIRED_CHECKS) { const bytes = Buffer.from(`${platform.platformId}:${fixture.fixtureId}:${check}`), id = `${platform.platformId}/${fixture.fixtureId}/${check}.bin`; fixture.checks[check] = 'pass'; fixture.checkEvidence[check] = [{ id, sha256: sha(bytes), description: 'Exact physical fixture evidence.' }]; evidenceArtifacts[id] = bytes.toString('base64'); }
  }
  return { ledger, evidenceArtifacts };
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-v1-runtime-certification-'));
try {
  const first = generate(path.join(root, 'first')), repeat = generate(path.join(root, 'repeat'));
  assert.strictEqual(first.manifest.targetId, 'sff-v1'); assert.strictEqual(first.manifest.backendId, 'ikemaker-builtin-sff-v1');
  assert.deepStrictEqual(first.manifest.adapter, { id: 'builtin-v1-pcx8', version: 1 }); assert.strictEqual(first.manifest.adoptionAllowed, false);
  assert.deepStrictEqual(first.manifest.fixtures, repeat.manifest.fixtures); assert.strictEqual(sha(first.manifestBytes), 'd07d13fc64af4b26d65736e38e0fd262d57435bbb1853204a9b9f6c1dfefc3a0');
  assert(requireSffBackend('ikemaker-builtin-sff-v1').certificationManifestHashes.includes(sha(first.manifestBytes)));
  for (const fixture of first.manifest.fixtures) { const bytes = fs.readFileSync(path.join(first.root, fixture.filename)); assert.strictEqual(sha(bytes), fixture.byteHash); assertSffV1Pcx8(bytes); }
  const pending = validateCertificationLedger(first.manifest, first.manifestBytes, first.ledger); assert.strictEqual(pending.valid, true); assert.strictEqual(pending.physicalGateSatisfied, false);
  const done = completed(first), passed = validateCertificationLedger(first.manifest, first.manifestBytes, done.ledger); assert.strictEqual(passed.physicalGateSatisfied, true); assert.strictEqual(passed.adoptionAllowed, false);
  const evidence = { manifestText: first.manifestBytes.toString('utf8'), ledgerText: JSON.stringify(done.ledger), evidenceArtifacts: done.evidenceArtifacts };
  const exact = validateCertificationEvidence(requireSffBackend('ikemaker-builtin-sff-v1'), 'sff-v1', evidence); assert.strictEqual(exact.valid, true, exact.error); assert.strictEqual(exact.adoptionAllowed, false);
  console.log('SFF v1.01 PCX8 certification kit is deterministic, pinned, engine-specific, and adoption-disabled');
} finally { fs.rmSync(root, { recursive: true, force: true }); }

module.exports = { completed };
