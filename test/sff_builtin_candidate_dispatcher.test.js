'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const v1Kit = require('../tools/generate_sff_v1_runtime_certification_fixtures');
const v20Kit = require('../tools/generate_sff_v20_runtime_certification_fixtures');
const v21Kit = require('../tools/generate_sff_runtime_certification_fixtures');
const { REQUIRED_CHECKS } = require('../src/sff_runtime_certification');
const { createAdapterRequest } = require('../src/sff_backend_adapter_contract');
const { createSffBuildSpecificationV2, deepFreeze } = require('../src/sff_build_specification_v2');
const { hashCanonical } = require('../src/sff_capability_report');
const { listBuiltInCandidateAdapters, dispatchBuiltInCandidate } = require('../src/sff_builtin_candidate_dispatcher');
const { encodeIndexed } = require('../src/sff_palette_remap');
const { readIndexedPng8 } = require('../src/sff_png8_source');

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
function certification(generated) {
  const ledger = JSON.parse(JSON.stringify(generated.ledger)), evidenceArtifacts = {};
  for (const platform of ledger.platforms.filter((item) => item.required)) {
    platform.tester = 'dispatcher fixture'; platform.testedAt = '2026-10-09T12:00:00.000Z'; platform.osVersion = platform.platformId; platform.ikemenBuild = 'sealed-dispatch-fixture';
    for (const fixture of platform.fixtures) for (const check of REQUIRED_CHECKS) {
      const bytes = Buffer.from(`${platform.platformId}:${fixture.fixtureId}:${check}:dispatcher`), id = `${platform.platformId}/${fixture.fixtureId}/${check}.bin`;
      fixture.checks[check] = 'pass'; fixture.checkEvidence[check] = [{ id, sha256: sha(bytes), description: 'Exact physical dispatcher fixture evidence.' }]; evidenceArtifacts[id] = bytes.toString('base64');
    }
  }
  const manifestText = generated.manifestBytes ? generated.manifestBytes.toString('utf8') : fs.readFileSync(generated.manifestPath, 'utf8');
  return { certification: { manifestText, ledgerText: JSON.stringify(ledger), evidenceArtifacts } };
}
function requestFor(fixture, evidence) {
  const specification = fixture.specification, sourceSnapshotSeal = { sources: [...specification.logical.sprites, ...specification.logical.palettes].map((entry) => ({ entryId: entry.entryId, relativePath: entry.source.relativePath, byteHash: entry.source.byteHash, decodedHash: entry.source.decodedHash || null, kind: entry.source.kind })) };
  const request = createAdapterRequest({ specification, expectedSpecificationHash: specification.specificationHash, capabilityRequest: { evidence }, sourceSnapshotSeal, expectedSourceSnapshotHash: hashCanonical(sourceSnapshotSeal) });
  return { request, sourceBytesByEntryId: fixture.sourceBytesByEntryId };
}
function externalRequest(targetId, backendId) {
  const bytes = Buffer.from(`${targetId}:${backendId}`), byteHash = sha(bytes), decodedHash = sha(Buffer.from('decoded'));
  const backend = require('../src/sff_backend_registry').requireSffBackend(backendId), evidence = { tool: { available: true, byteHash: 'a'.repeat(64), version: 'fixture' }, targetProbe: { status: 'passed', targetId, observedTargetId: targetId, backendId, adapterId: backend.adapter.id, adapterVersion: backend.adapter.version, toolByteHash: 'a'.repeat(64), outputByteHash: 'b'.repeat(64), validatorId: `strict-${targetId}`, validatorVersion: 1, semanticComparisonPassed: true } };
  const specification = createSffBuildSpecificationV2({ planId: `external-${targetId}`, selection: { targetId, backendId }, archive: { identity: 'external.sff' }, logical: { sourceRoot: 'input', sprites: [{ entryId: 'sprite:external', group: 0, number: 0, width: 1, height: 1, pixels: { kind: 'indexed8', decodedHash }, source: { relativePath: 'input/external.png', byteHash, decodedHash } }], palettes: [] }, capabilityRequest: { evidence } });
  const seal = { sources: [{ entryId: 'sprite:external', relativePath: 'input/external.png', byteHash, decodedHash, kind: 'complete-image' }] };
  return { request: createAdapterRequest({ specification, expectedSpecificationHash: specification.specificationHash, sourceSnapshotSeal: seal, expectedSourceSnapshotHash: hashCanonical(seal), capabilityRequest: { evidence } }), sourceBytesByEntryId: { 'sprite:external': bytes } };
}
function v21Fixture(evidence) {
  const colors = Array.from({ length: 256 }, (_, index) => [index, (index * 3) & 255, 255 - index, index === 0 ? 0 : 255]);
  const png = encodeIndexed(2, 2, Buffer.from([0, 1, 2, 3]), colors), decoded = readIndexedPng8(png), paletteBytes = Buffer.from(colors.flat());
  const specification = createSffBuildSpecificationV2({ planId: 'dispatcher-v21', selection: { targetId: 'sff-v2.1', backendId: 'ikemaker-builtin-sff-v21-png8-prerelease' }, archive: { identity: 'candidate.sff' }, logical: { sourceRoot: 'input', sprites: [{ entryId: 'sprite:a', group: 3, number: 7, width: 2, height: 2, axisX: -4, axisY: 9, pixels: { kind: 'indexed8', decodedHash: decoded.decodedHash }, paletteEntryId: 'palette:a', source: { relativePath: 'input/a.png', byteHash: sha(png), decodedHash: decoded.decodedHash } }, { entryId: 'sprite:b', group: 3, number: 8, width: 2, height: 2, axisX: 4, axisY: -9, pixels: { kind: 'indexed8', decodedHash: decoded.decodedHash }, paletteEntryId: 'palette:b', contentLinkTargetEntryId: 'sprite:a', source: { relativePath: 'input/a.png', byteHash: sha(png), decodedHash: decoded.decodedHash } }], palettes: [{ entryId: 'palette:a', group: 1, number: 1, colors, source: { relativePath: 'input/pal.rgba', byteHash: sha(paletteBytes) } }, { entryId: 'palette:b', group: 1, number: 2, colors, contentLinkTargetEntryId: 'palette:a', source: { relativePath: 'input/pal.rgba', byteHash: sha(paletteBytes) } }] }, encodingIntent: { compression: { default: 'png8' }, crop: { default: 'none' }, paletteMode: 'embedded', storage: { byEntryId: { 'sprite:a': 'preserve-separate', 'sprite:b': 'share-identical', 'palette:a': 'preserve-separate', 'palette:b': 'share-identical' } }, backendOptions: { 'ikemaker-builtin-sff-v21-png8-prerelease': {} } }, capabilityRequest: { evidence } });
  return { specification, sourceBytesByEntryId: { 'sprite:a': png, 'sprite:b': png, 'palette:a': paletteBytes, 'palette:b': paletteBytes } };
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-dispatcher-'));
try {
  const catalog = listBuiltInCandidateAdapters();
  assert(Object.isFrozen(catalog)); assert.strictEqual(catalog.length, 3);
  assert(catalog.every((entry) => Object.isFrozen(entry) && entry.candidateAdapterImplemented === true && entry.processExecutionRequired === false && entry.adoptionSupported === false && entry.requiresValidatedAdapterRequest === true));
  assert.deepStrictEqual(catalog.map((entry) => entry.backendId), ['ikemaker-builtin-sff-v1', 'ikemaker-builtin-sff-v2.0', 'ikemaker-builtin-sff-v21-png8-prerelease']);
  assert.throws(() => { catalog[0].backendId = 'changed'; }, TypeError);

  const definitions = [
    { kit: v1Kit, id: 'direct-link', folder: 'v1' },
    { kit: v20Kit, id: 'direct-links', folder: 'v20' },
    { kit: v21Kit, id: 'linked-data', folder: 'v21' }
  ];
  const successful = [];
  for (const definition of definitions) {
    const generated = definition.kit.generate(path.join(root, definition.folder)), evidence = certification(generated), fixture = definition.folder === 'v21' ? v21Fixture(evidence) : definition.kit.cases().find((item) => item.id === definition.id);
    assert(fixture, `missing ${definition.folder} fixture ${definition.id}`);
    const input = requestFor(fixture, evidence), before = Object.fromEntries(Object.entries(input.sourceBytesByEntryId).map(([key, value]) => [key, Buffer.from(value)]));
    const first = dispatchBuiltInCandidate({ ...input, expectedRequestHash: input.request.requestHash }), repeat = dispatchBuiltInCandidate({ ...input, expectedRequestHash: input.request.requestHash });
    assert.strictEqual(first.byteHash, repeat.byteHash); assert.deepStrictEqual(first.readBytes(), repeat.readBytes()); assert(Object.isFrozen(first)); assert(Object.isFrozen(first.dispatch));
    assert.strictEqual(first.dispatch.requestHash, input.request.requestHash); assert.strictEqual(first.dispatch.byteEqualityRequired, false); assert.strictEqual(first.adoptionAllowed, false); assert(Object.values(first.semanticComparison.checks).every(Boolean));
    const copy = first.readBytes(); copy[0] ^= 0xff; assert.notDeepStrictEqual(copy, first.readBytes());
    for (const [key, value] of Object.entries(before)) assert.deepStrictEqual(input.sourceBytesByEntryId[key], value, `${definition.folder} input bytes mutated`);
    const keys = Object.keys(input.sourceBytesByEntryId), firstKey = keys[0], typed = { ...input.sourceBytesByEntryId, [firstKey]: new Uint8Array(input.sourceBytesByEntryId[firstKey]) };
    assert.strictEqual(dispatchBuiltInCandidate({ request: input.request, expectedRequestHash: input.request.requestHash, sourceBytesByEntryId: typed }).byteHash, first.byteHash);
    assert.throws(() => dispatchBuiltInCandidate({ request: input.request, expectedRequestHash: 'f'.repeat(64), sourceBytesByEntryId: input.sourceBytesByEntryId }), /request seal drift/);
    assert.throws(() => dispatchBuiltInCandidate({ request: input.request, expectedRequestHash: input.request.requestHash, sourceBytesByEntryId: { ...input.sourceBytesByEntryId, extra: Buffer.alloc(0) } }), /exactly every sealed entryId/);
    const missing = { ...input.sourceBytesByEntryId }; delete missing[firstKey]; assert.throws(() => dispatchBuiltInCandidate({ request: input.request, expectedRequestHash: input.request.requestHash, sourceBytesByEntryId: missing }), /exactly every sealed entryId/);
    assert.throws(() => dispatchBuiltInCandidate({ request: input.request, expectedRequestHash: input.request.requestHash, sourceBytesByEntryId: { ...input.sourceBytesByEntryId, [firstKey]: 'not bytes' } }), /Buffer or Uint8Array/);
    assert.throws(() => dispatchBuiltInCandidate({ request: input.request, expectedRequestHash: input.request.requestHash, sourceBytesByEntryId: { ...input.sourceBytesByEntryId, [firstKey]: Buffer.from('drift') } }), /source bytes drifted/);
    const accessor = { ...input.sourceBytesByEntryId }; Object.defineProperty(accessor, firstKey, { enumerable: true, get: () => input.sourceBytesByEntryId[firstKey] });
    assert.throws(() => dispatchBuiltInCandidate({ request: input.request, expectedRequestHash: input.request.requestHash, sourceBytesByEntryId: accessor }), /inert data property/);
    const proxied = new Proxy(input.sourceBytesByEntryId, {});
    assert.throws(() => dispatchBuiltInCandidate({ request: input.request, expectedRequestHash: input.request.requestHash, sourceBytesByEntryId: proxied }), /non-proxy/);
    successful.push({ input, first });
  }

  for (const backendId of ['sprmake2-sff-v2.0', 'sprmake2-sff-v2.1']) {
    const targetId = backendId.endsWith('v2.0') ? 'sff-v2.0' : 'sff-v2.1', input = externalRequest(targetId, backendId);
    assert.throws(() => dispatchBuiltInCandidate({ ...input, expectedRequestHash: input.request.requestHash }), /not an implemented built-in/);
  }
  assert.throws(() => dispatchBuiltInCandidate({ request: undefined, expectedRequestHash: 'a'.repeat(64), sourceBytesByEntryId: {} }), /valid SFF adapter request/);

  const original = successful[0].input.request, clone = JSON.parse(JSON.stringify(original));
  clone.backendId = 'elecbyte-sprmaker-sff-v1'; clone.requestHash = hashCanonical({ ...clone, requestHash: undefined, specification: undefined }); deepFreeze(clone);
  assert.throws(() => dispatchBuiltInCandidate({ request: clone, expectedRequestHash: clone.requestHash, sourceBytesByEntryId: successful[0].input.sourceBytesByEntryId }), /target, backend, or adapter identity drifted/);

  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'sff_builtin_candidate_dispatcher.js'), 'utf8');
  assert(!/require\(['"](?:fs|child_process|vscode)['"]\)/.test(source)); assert(!/\b(?:writeFile|spawn|execFile|randomUUID|Date\.now)\b/.test(source));
  console.log('Built-in SFF candidate dispatcher routes only exact sealed v1/v2.0/v2.1 adapters and remains candidate-only, semantic, copy-safe, deterministic, and pure');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
