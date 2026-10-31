'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { hashCanonical } = require('../src/sff_capability_report');
const { validateCreatorSourceEvidence } = require('../src/sff_creator_source_evidence');
const { dispatchCreatorApprovedCandidate } = require('../src/sff_creator_candidate_dispatch');
const { buildFixture, certification, kits } = require('./sff_creator_candidate_dispatch.test');
const { encodeIndexed } = require('../src/sff_palette_remap');

const golden = { 'sff-v1': 'c409305d75073db8537e4f571fed039333bb5523402db426eecc937b9054b629', 'sff-v2.0': '65bf80093ff024374cc46973f6ac2ee7e78629c1156c3cb71c68f9f57aeb81b6', 'sff-v2.1': '7bf22999a12b4b209fa788b5c1d69c0d5cc091cfb41eb6397414e32171a8a8be' };
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-source-evidence-'));
function assertDeepFrozen(value) { if (!value || typeof value !== 'object') return; assert.ok(Object.isFrozen(value)); Object.values(value).forEach(assertDeepFrozen); }

try {
  const evidence = Object.fromEntries(Object.entries(kits).map(([targetId, kit]) => [targetId, certification(kit.generate(path.join(root, targetId.replace(/[^a-z0-9]/gi, '_'))))]));
  const fixtures = {};
  for (const targetId of Object.keys(kits)) {
    const fixture = buildFixture(targetId, evidence[targetId]), request = fixture.requestEnvelope.request, source = validateCreatorSourceEvidence({ request, sourceBytesByEntryId: fixture.input.sourceBytesByEntryId }), dispatched = dispatchCreatorApprovedCandidate(fixture.input);
    fixtures[targetId] = { fixture, request, source };
    assert.strictEqual(source.receiptHash, golden[targetId]);
    assert.strictEqual(source.receiptHash, hashCanonical(source.receipt));
    assert.deepStrictEqual(source.receipt, dispatched.receipt.sourceValidationReceipt);
    assert.strictEqual(source.receiptHash, dispatched.receipt.sourceValidationHash);
    assert.strictEqual(source.sourceBytesValidated, true);
    for (const flag of ['candidateCreated', 'writesCommitted', 'processesStarted', 'approvalsGranted', 'backendExecution', 'adoptionAllowed']) assert.strictEqual(source[flag], false);
    assertDeepFrozen(source.receipt);
    assert.ok(Object.isFrozen(source));
    assert.doesNotThrow(() => JSON.stringify(source));
    const first = source.copySourceBytesByEntryId(), second = source.copySourceBytesByEntryId(), entryId = Object.keys(first)[0], original = Buffer.from(second[entryId]);
    first[entryId][0] ^= 0xff;
    assert.deepStrictEqual(second[entryId], original);
    assert.deepStrictEqual(source.copySourceBytesByEntryId()[entryId], original);
    fixture.input.sourceBytesByEntryId[entryId][0] ^= 0xff;
    assert.deepStrictEqual(source.copySourceBytesByEntryId()[entryId], original);
    fixture.input.sourceBytesByEntryId[entryId][0] ^= 0xff;
    assert.strictEqual(source.receipt.sources[0].verification, 'byte-hash-and-indexed-pixels-verified');
    assert.strictEqual(source.receipt.sources[1].semanticUse, targetId === 'sff-v1' ? 'candidate-indexed-palette' : 'provenance-only');
    assert.strictEqual(source.receipt.sources[1].verification, targetId === 'sff-v1' ? 'byte-hash-and-palette-colors-verified' : 'byte-hash-verified-not-decoded-for-candidate');
  }

  const base = fixtures['sff-v2.1'], input = { request: base.request, sourceBytesByEntryId: base.fixture.input.sourceBytesByEntryId };
  let traps = 0, getters = 0;
  const rawProxy = new Proxy({}, { get() { traps += 1; throw new Error('raw get'); }, ownKeys() { traps += 1; throw new Error('raw keys'); }, getPrototypeOf() { traps += 1; throw new Error('raw proto'); } });
  assert.throws(() => validateCreatorSourceEvidence(rawProxy), /must not be a Proxy/); assert.strictEqual(traps, 0);
  const requestGetter = { sourceBytesByEntryId: input.sourceBytesByEntryId }; Object.defineProperty(requestGetter, 'request', { enumerable: true, get() { getters += 1; throw new Error('request getter'); } });
  assert.throws(() => validateCreatorSourceEvidence(requestGetter), /data properties/); assert.strictEqual(getters, 0);
  const sourcesGetter = { request: input.request }; Object.defineProperty(sourcesGetter, 'sourceBytesByEntryId', { enumerable: true, get() { getters += 1; throw new Error('source getter'); } });
  assert.throws(() => validateCreatorSourceEvidence(sourcesGetter), /data properties/); assert.strictEqual(getters, 0);
  const requestProxy = new Proxy(input.request, { get() { traps += 1; throw new Error('request get'); }, getPrototypeOf() { traps += 1; throw new Error('request proto'); } });
  assert.throws(() => validateCreatorSourceEvidence({ request: requestProxy, sourceBytesByEntryId: input.sourceBytesByEntryId }), /request must not be a Proxy/); assert.strictEqual(traps, 0);
  const nested = { ...input.request, specification: new Proxy(input.request.specification, { get() { traps += 1; throw new Error('nested get'); }, getPrototypeOf() { traps += 1; throw new Error('nested proto'); } }) };
  assert.throws(() => validateCreatorSourceEvidence({ request: nested, sourceBytesByEntryId: input.sourceBytesByEntryId }), /non-proxy JSON/); assert.strictEqual(traps, 0);
  const sourceProxy = new Proxy(input.sourceBytesByEntryId, { get() { traps += 1; throw new Error('source map get'); }, getPrototypeOf() { traps += 1; throw new Error('source map proto'); } });
  assert.throws(() => validateCreatorSourceEvidence({ request: input.request, sourceBytesByEntryId: sourceProxy }), /non-proxy/); assert.strictEqual(traps, 0);
  const firstId = Object.keys(input.sourceBytesByEntryId)[0], accessorVault = { ...input.sourceBytesByEntryId }; Object.defineProperty(accessorVault, firstId, { enumerable: true, get() { getters += 1; throw new Error('byte getter'); } });
  assert.throws(() => validateCreatorSourceEvidence({ request: input.request, sourceBytesByEntryId: accessorVault }), /inert data property/); assert.strictEqual(getters, 0);
  const byteProxy = new Proxy(input.sourceBytesByEntryId[firstId], { get() { traps += 1; throw new Error('byte get'); }, getPrototypeOf() { traps += 1; throw new Error('byte proto'); } });
  assert.throws(() => validateCreatorSourceEvidence({ request: input.request, sourceBytesByEntryId: { ...input.sourceBytesByEntryId, [firstId]: byteProxy } }), /must not be a proxy/); assert.strictEqual(traps, 0);
  assert.throws(() => validateCreatorSourceEvidence({ ...input, extra: true }), /exactly request and sourceBytesByEntryId/);
  assert.throws(() => validateCreatorSourceEvidence({ ...input, [Symbol('hidden')]: true }), /exactly request and sourceBytesByEntryId/);
  const hidden = { request: input.request }; Object.defineProperty(hidden, 'sourceBytesByEntryId', { value: input.sourceBytesByEntryId, enumerable: false }); assert.throws(() => validateCreatorSourceEvidence(hidden), /data properties/);
  assert.throws(() => validateCreatorSourceEvidence({ request: input.request, sourceBytesByEntryId: { ...input.sourceBytesByEntryId, extra: Buffer.alloc(0) } }), /exactly every sealed entryId/);
  assert.throws(() => validateCreatorSourceEvidence({ request: input.request, sourceBytesByEntryId: { ...input.sourceBytesByEntryId, [firstId]: Buffer.from('drift') } }), /bytes drifted/i);

  const colors = Array.from({ length: 256 }, (_, index) => [index, (index * 3) & 255, 255 - index, index === 0 ? 0 : 255]), paletteIndexes = Buffer.from(Array.from({ length: 256 }, (_, index) => index));
  const v1Mismatch = buildFixture('sff-v1', evidence['sff-v1'], { paletteBytes: encodeIndexed(16, 16, paletteIndexes, colors.map((color, index) => [color[0], color[1], (color[2] + (index === 1 ? 1 : 0)) & 255, color[3]])) });
  assert.throws(() => validateCreatorSourceEvidence({ request: v1Mismatch.requestEnvelope.request, sourceBytesByEntryId: v1Mismatch.input.sourceBytesByEntryId }), /palette colors drifted/i);
  const v20Provenance = buildFixture('sff-v2.0', evidence['sff-v2.0'], { paletteBytes: Buffer.from('sealed provenance only') }), accepted = validateCreatorSourceEvidence({ request: v20Provenance.requestEnvelope.request, sourceBytesByEntryId: v20Provenance.input.sourceBytesByEntryId });
  assert.strictEqual(accepted.receipt.sources[1].verification, 'byte-hash-verified-not-decoded-for-candidate');

  const sourceText = fs.readFileSync(path.join(__dirname, '..', 'src', 'sff_creator_source_evidence.js'), 'utf8');
  assert.doesNotMatch(sourceText, /require\(['"](?:fs|child_process|vscode)['"]\)/);
  assert.doesNotMatch(sourceText, /writeFile|spawn|execFile|backend[_-]?dispatch/i);
  console.log('Creator source evidence validates exact copied source bytes with frozen no-effect receipts');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
