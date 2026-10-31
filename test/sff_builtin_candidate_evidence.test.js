'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildFixture, certification, kits } = require('./sff_creator_candidate_dispatch.test');
const { createV1Pcx8Candidate } = require('../src/sff_v1_pcx8_v2_adapter');
const { createV20Raw8Candidate } = require('../src/sff_v20_raw8_v2_adapter');
const { createV21Png8Candidate } = require('../src/sff_v21_png8_v2_adapter');
const {
  BUILT_IN_CANDIDATE_TARGETS,
  assertBuiltInCandidateSpecificationProfile,
  assertBuiltInCandidateRequestProfile,
  assertCandidateByteCeiling,
  projectV21RequestSpecification,
  deriveBuiltInCandidateEvidence
} = require('../src/sff_builtin_candidate_evidence');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-builtin-candidate-evidence-'));
const adapters = { 'sff-v1': createV1Pcx8Candidate, 'sff-v2.0': createV20Raw8Candidate, 'sff-v2.1': createV21Png8Candidate };
const golden = {
  'sff-v1': ['718fd8235e9f8720a0aaf0dde7125bb92934a47c350ec8ef8d3bec5a1bccfea8', '055cfd0685891a037550341e6a7bbaf21c8fb74156960400f0363e215d87c40a'],
  'sff-v2.0': ['d4446f10dafc28506969382549bd2db0364fb77dd341545fff9a2875a53137bd', '5a1af74abf7279d4f761a9be05ef62dcb472da36f824e020dc9fe062843eafde'],
  'sff-v2.1': ['b475d67c3a2655bef1950627db35d9411b4dfa038f2235e3c8d6e3e94759e120', '21f150cba522b57e4a2fb20523de45b89e38bceefebe0ad08041e4a5f7fc6a74']
};
const clone = value => JSON.parse(JSON.stringify(value));
function mutate(specification, callback) { const copy = clone(specification); callback(copy); return copy; }
function assertDeepFrozen(value) { if (!value || typeof value !== 'object') return; assert.ok(Object.isFrozen(value)); Object.values(value).forEach(assertDeepFrozen); }

try {
  assert.deepStrictEqual(Object.keys(BUILT_IN_CANDIDATE_TARGETS), ['sff-v1', 'sff-v2.0', 'sff-v2.1']);
  const fixtures = {};
  for (const [targetId, kit] of Object.entries(kits)) {
    const generated = kit.generate(path.join(root, targetId.replace(/[^a-z0-9]/gi, '_'))), fixture = buildFixture(targetId, certification(generated)), request = fixture.requestEnvelope.request;
    const candidate = adapters[targetId](request, fixture.input.sourceBytesByEntryId), bytes = candidate.readBytes(), evidence = deriveBuiltInCandidateEvidence({ request, candidateBytes: bytes });
    fixtures[targetId] = { fixture, request, candidate, bytes, evidence };
    assertBuiltInCandidateRequestProfile(request, targetId);
    assert.strictEqual(evidence.byteHash, candidate.byteHash);
    assert.deepStrictEqual([evidence.byteHash, evidence.validation.strictReportHash], golden[targetId]);
    assert.deepStrictEqual(evidence.validation, candidate.validation);
    assert.deepStrictEqual(evidence.semanticComparison, candidate.semanticComparison);
    assert.strictEqual(evidence.validation.strictReportHash, candidate.validation.strictReportHash);
    assert.ok(Object.values(evidence.semanticComparison.checks).every(Boolean));
    assertDeepFrozen(evidence);
    const drifted = Buffer.from(bytes); drifted[drifted.length - 1] ^= 1;
    assert.throws(() => deriveBuiltInCandidateEvidence({ request, candidateBytes: drifted }), /strict|validation|canonical|trailing|palette|payload|coverage|PNG|PCX|SFF/i);
    assert.throws(() => deriveBuiltInCandidateEvidence({ request, candidateBytes: new Proxy(bytes, {}) }), /non-proxy Buffer/);
    assert.throws(() => deriveBuiltInCandidateEvidence({ request, candidateBytes: new Uint8Array(bytes) }), /non-proxy Buffer/);
  }

  assert.throws(() => assertBuiltInCandidateRequestProfile(fixtures['sff-v1'].request, 'sff-v2.0'), /selection does not match/);
  assert.throws(() => assertBuiltInCandidateRequestProfile(new Proxy(fixtures['sff-v1'].request, {}), 'sff-v1'), /must not be a Proxy/);
  assert.throws(() => deriveBuiltInCandidateEvidence(), /plain object/);
  let traps = 0;
  const trappedInput = new Proxy({}, { get() { traps += 1; throw new Error('get trap executed'); }, ownKeys() { traps += 1; throw new Error('ownKeys trap executed'); }, getOwnPropertyDescriptor() { traps += 1; throw new Error('descriptor trap executed'); }, getPrototypeOf() { traps += 1; throw new Error('prototype trap executed'); } });
  assert.throws(() => deriveBuiltInCandidateEvidence(trappedInput), /must not be a Proxy/);
  assert.strictEqual(traps, 0);
  const safeRequest = fixtures['sff-v1'].request, safeBytes = fixtures['sff-v1'].bytes;
  let getters = 0;
  const requestGetter = { candidateBytes: safeBytes }; Object.defineProperty(requestGetter, 'request', { enumerable: true, get() { getters += 1; throw new Error('request getter executed'); } });
  assert.throws(() => deriveBuiltInCandidateEvidence(requestGetter), /data properties/); assert.strictEqual(getters, 0);
  const candidateGetter = { request: safeRequest }; Object.defineProperty(candidateGetter, 'candidateBytes', { enumerable: true, get() { getters += 1; throw new Error('candidate getter executed'); } });
  assert.throws(() => deriveBuiltInCandidateEvidence(candidateGetter), /data properties/); assert.strictEqual(getters, 0);
  let requestTraps = 0;
  const proxiedRequest = new Proxy(safeRequest, { get() { requestTraps += 1; throw new Error('request get trap executed'); }, getPrototypeOf() { requestTraps += 1; throw new Error('request prototype trap executed'); } });
  assert.throws(() => deriveBuiltInCandidateEvidence({ request: proxiedRequest, candidateBytes: safeBytes }), /request must not be a Proxy/); assert.strictEqual(requestTraps, 0);
  const nestedProxyRequest = { ...safeRequest, specification: new Proxy(safeRequest.specification, { get() { requestTraps += 1; throw new Error('nested request get trap executed'); }, ownKeys() { requestTraps += 1; throw new Error('nested request ownKeys trap executed'); }, getPrototypeOf() { requestTraps += 1; throw new Error('nested request prototype trap executed'); } }) };
  assert.throws(() => deriveBuiltInCandidateEvidence({ request: nestedProxyRequest, candidateBytes: safeBytes }), /non-proxy JSON data/); assert.strictEqual(requestTraps, 0);
  const nestedAccessorSpecification = { ...safeRequest.specification }; Object.defineProperty(nestedAccessorSpecification, 'logical', { enumerable: true, get() { getters += 1; throw new Error('nested logical getter executed'); } });
  assert.throws(() => deriveBuiltInCandidateEvidence({ request: { ...safeRequest, specification: nestedAccessorSpecification }, candidateBytes: safeBytes }), /accessor/); assert.strictEqual(getters, 0);
  const withSymbol = { request: safeRequest, candidateBytes: safeBytes, [Symbol('hidden')]: true };
  assert.throws(() => deriveBuiltInCandidateEvidence(withSymbol), /exactly request and candidateBytes/);
  const nonEnumerable = { request: safeRequest }; Object.defineProperty(nonEnumerable, 'candidateBytes', { value: safeBytes, enumerable: false });
  assert.throws(() => deriveBuiltInCandidateEvidence(nonEnumerable), /data properties/);
  const extraGetter = { request: safeRequest, candidateBytes: safeBytes }; Object.defineProperty(extraGetter, 'extra', { enumerable: true, get() { getters += 1; throw new Error('extra getter executed'); } });
  assert.throws(() => deriveBuiltInCandidateEvidence(extraGetter), /exactly request and candidateBytes/); assert.strictEqual(getters, 0);
  assert.throws(() => deriveBuiltInCandidateEvidence([safeRequest, safeBytes]), /plain object/);
  assert.throws(() => deriveBuiltInCandidateEvidence(Buffer.alloc(0)), /plain object/);
  for (const targetId of Object.keys(BUILT_IN_CANDIDATE_TARGETS)) {
    const ceiling = BUILT_IN_CANDIDATE_TARGETS[targetId].byteCeiling;
    assert.strictEqual(assertCandidateByteCeiling(targetId, ceiling), ceiling);
    assert.throws(() => assertCandidateByteCeiling(targetId, ceiling + 1), /preparse ceiling/);
  }
  assert.throws(() => assertCandidateByteCeiling('unknown', 0), /not supported/);

  for (const targetId of Object.keys(fixtures)) {
    const specification = fixtures[targetId].request.specification;
    assertBuiltInCandidateSpecificationProfile(specification, targetId);
    assert.throws(() => assertBuiltInCandidateSpecificationProfile(mutate(specification, spec => { spec.encodingIntent.reviewedConversions = [{ id: 'unapplied' }]; }), targetId), /reviewed conversions/);
    assert.throws(() => assertBuiltInCandidateSpecificationProfile(mutate(specification, spec => { spec.encodingIntent.crop.default = 'before-axis'; }), targetId), /crop/);
    assert.throws(() => assertBuiltInCandidateSpecificationProfile(mutate(specification, spec => { spec.encodingIntent.compression.default = 'unsupported'; }), targetId), /compression/);
    assert.throws(() => assertBuiltInCandidateSpecificationProfile(mutate(specification, spec => { spec.encodingIntent.paletteMode = 'global'; }), targetId), /palette/i);
    const first = specification.logical.sprites[0].entryId;
    assert.throws(() => assertBuiltInCandidateSpecificationProfile(mutate(specification, spec => { spec.encodingIntent.storage.byEntryId[first] = 'share-identical'; }), targetId), /storage/);
    assert.throws(() => assertBuiltInCandidateSpecificationProfile(mutate(specification, spec => { spec.encodingIntent.backendOptions.foreign = { enabled: true }; }), targetId), /backend options|selected backend/);
  }

  const v1 = fixtures['sff-v1'].request.specification;
  assert.throws(() => assertBuiltInCandidateSpecificationProfile(mutate(v1, spec => { spec.encodingIntent.backendOptions['ikemaker-builtin-sff-v1'].paletteBySpriteEntryId[spec.logical.sprites[0].entryId] = 'invalid'; }), 'sff-v1'), /palette decision/);
  const v21 = fixtures['sff-v2.1'].request, projected = projectV21RequestSpecification(v21), repeated = projectV21RequestSpecification(v21);
  assert.deepStrictEqual(projected, repeated);
  assertDeepFrozen(projected);
  assert.strictEqual(projected.target.sffVersion, '2.1');
  assert.strictEqual(projected.options.shared.v2SpecificationHash, v21.specificationHash);
  assert.strictEqual(projected.sprites[0].source.provenance.v2EntryId, v21.specification.logical.sprites[0].entryId);
  assert.strictEqual(projected.palettes[0].source.provenance.v2EntryId, v21.specification.logical.palettes[0].entryId);
  const projectedCopy = clone(projected); projectedCopy.sprites[0].axisX += 1;
  assert.notDeepStrictEqual(projectedCopy, projectV21RequestSpecification(v21));

  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'sff_builtin_candidate_evidence.js'), 'utf8');
  assert.doesNotMatch(source, /require\(['"](?:fs|child_process|vscode)['"]\)/);
  assert.doesNotMatch(source, /require\(['"].*writer['"]\)/);
  assert.doesNotMatch(source, /backend[_-]?dispatch|writeFile|spawn|execFile/i);

  console.log('Built-in candidate evidence rederives exact frozen v1/v2.0/v2.1 validation and semantic authority');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
