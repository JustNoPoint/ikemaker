'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { cases, generate } = require('../tools/generate_sff_v20_runtime_certification_fixtures');
const { REQUIRED_CHECKS } = require('../src/sff_runtime_certification');
const { hashCanonical } = require('../src/sff_capability_report');
const { createAdapterRequest } = require('../src/sff_backend_adapter_contract');
const { createV20Raw8Candidate } = require('../src/sff_v20_raw8_v2_adapter');

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function certification(result) {
  const ledger = JSON.parse(JSON.stringify(result.ledger)), evidenceArtifacts = {};
  for (const platform of ledger.platforms.filter(item => item.required)) {
    platform.tester = 'adapter fixture'; platform.testedAt = '2026-10-09T12:00:00.000Z'; platform.osVersion = platform.platformId; platform.ikemenBuild = 'physical-fixture-build';
    for (const fixture of platform.fixtures) for (const check of REQUIRED_CHECKS) {
      const bytes = Buffer.from(`${platform.platformId}:${fixture.fixtureId}:${check}`), id = `${platform.platformId}/${fixture.fixtureId}/${check}.bin`;
      fixture.checks[check] = 'pass'; fixture.checkEvidence[check] = [{ id, sha256: sha(bytes), description: 'Exact physical fixture evidence.' }]; evidenceArtifacts[id] = bytes.toString('base64');
    }
  }
  return { manifestText: result.manifestBytes.toString('utf8'), ledgerText: JSON.stringify(ledger), evidenceArtifacts };
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-v20-adapter-'));
try {
  const generated = generate(path.join(root, 'certification')), evidence = { certification: certification(generated) };
  const fixture = cases().find(item => item.id === 'direct-links'), spec = fixture.specification;
  const sourceSnapshotSeal = { sources: [...spec.logical.sprites, ...spec.logical.palettes].map(entry => ({ entryId: entry.entryId, relativePath: entry.source.relativePath, byteHash: entry.source.byteHash, decodedHash: entry.source.decodedHash || null, kind: entry.source.kind })) };
  const request = createAdapterRequest({ specification: spec, expectedSpecificationHash: spec.specificationHash, capabilityRequest: { evidence }, sourceSnapshotSeal, expectedSourceSnapshotHash: hashCanonical(sourceSnapshotSeal) });
  const first = createV20Raw8Candidate(request, fixture.sourceBytesByEntryId), second = createV20Raw8Candidate(request, fixture.sourceBytesByEntryId);
  assert.strictEqual(first.byteHash, second.byteHash); assert.deepStrictEqual(first.readBytes(), second.readBytes());
  assert.strictEqual(first.adoptionAllowed, false); assert.strictEqual(first.semanticComparison.byteEqualityRequired, false);
  assert.strictEqual(first.semanticComparison.primaryVersion, '2.0.1.0'); assert.strictEqual(first.semanticComparison.compatibleVersion, '2.0.0.0');
  assert(Object.values(first.semanticComparison.checks).every(Boolean));
  const copy = first.readBytes(); copy[0] ^= 0xff; assert.notDeepStrictEqual(copy, first.readBytes(), 'candidate bytes are copy-on-read');
  const drifted = { ...fixture.sourceBytesByEntryId, 'sprite:base': Buffer.from('changed') };
  assert.throws(() => createV20Raw8Candidate(request, drifted), /source bytes drifted/);
  assert.throws(() => createV20Raw8Candidate(request, { ...fixture.sourceBytesByEntryId, extra: Buffer.alloc(0) }), /exactly every sealed entryId/);
  console.log('Built-in SFF v2.0 RAW8 v2 adapter is sealed, semantic, deterministic, candidate-only, and copy-on-read');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
