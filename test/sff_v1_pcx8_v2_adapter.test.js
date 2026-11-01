'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { cases, generate } = require('../tools/generate_sff_v1_runtime_certification_fixtures');
const { REQUIRED_CHECKS } = require('../src/sff_runtime_certification');
const { hashCanonical } = require('../src/sff_capability_report');
const { createAdapterRequest } = require('../src/sff_backend_adapter_contract');
const { createV1Pcx8Candidate } = require('../src/sff_v1_pcx8_v2_adapter');

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function completed(result) {
  const ledger = JSON.parse(JSON.stringify(result.ledger)), evidenceArtifacts = {};
  for (const platform of ledger.platforms.filter(item => item.required)) {
    platform.tester = 'adapter fixture'; platform.testedAt = '2026-10-09T12:00:00.000Z'; platform.osVersion = platform.platformId; platform.ikemenBuild = 'engine-specific-physical-fixture';
    for (const fixture of platform.fixtures) for (const check of REQUIRED_CHECKS) { const bytes = Buffer.from(`${platform.platformId}:${fixture.fixtureId}:${check}`), id = `${platform.platformId}/${fixture.fixtureId}/${check}.bin`; fixture.checks[check] = 'pass'; fixture.checkEvidence[check] = [{ id, sha256: sha(bytes), description: 'Exact physical fixture evidence.' }]; evidenceArtifacts[id] = bytes.toString('base64'); }
  }
  return { ledger, evidenceArtifacts };
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-v1-adapter-'));
try {
  const generated = generate(path.join(root, 'certification')), done = completed(generated), evidence = { certification: { manifestText: generated.manifestBytes.toString('utf8'), ledgerText: JSON.stringify(done.ledger), evidenceArtifacts: done.evidenceArtifacts } };
  const fixture = cases().find(item => item.id === 'direct-link'), spec = fixture.specification;
  const sourceSnapshotSeal = { sources: [...spec.logical.sprites, ...spec.logical.palettes].map(entry => ({ entryId: entry.entryId, relativePath: entry.source.relativePath, byteHash: entry.source.byteHash, decodedHash: entry.source.decodedHash || null, kind: entry.source.kind })) };
  const request = createAdapterRequest({ specification: spec, expectedSpecificationHash: spec.specificationHash, capabilityRequest: { evidence }, sourceSnapshotSeal, expectedSourceSnapshotHash: hashCanonical(sourceSnapshotSeal) });
  const first = createV1Pcx8Candidate(request, fixture.sourceBytesByEntryId), repeat = createV1Pcx8Candidate(request, fixture.sourceBytesByEntryId);
  assert.strictEqual(first.byteHash, repeat.byteHash); assert.deepStrictEqual(first.readBytes(), repeat.readBytes()); assert.strictEqual(first.adoptionAllowed, false); assert.strictEqual(first.semanticComparison.byteEqualityRequired, false); assert.strictEqual(first.semanticComparison.primaryVersion, '1.0.1.0'); assert(Object.values(first.semanticComparison.checks).every(Boolean));
  const copy = first.readBytes(); copy[0] ^= 0xff; assert.notDeepStrictEqual(copy, first.readBytes());
  assert.throws(() => createV1Pcx8Candidate(request, { ...fixture.sourceBytesByEntryId, 'sprite:base': Buffer.from('changed') }), /source bytes drifted/);
  assert.throws(() => createV1Pcx8Candidate(request, { ...fixture.sourceBytesByEntryId, extra: Buffer.alloc(0) }), /exactly every sealed entryId/);
  console.log('Built-in SFF v1.01 PCX8 adapter is sealed, semantic, deterministic, candidate-only, and copy-on-read');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
