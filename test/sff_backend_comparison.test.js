'use strict';

const assert = require('assert');
const crypto = require('crypto');
const zlib = require('zlib');
const { createSffBuildSpecification } = require('../src/sff_build_specification');
const { crc32 } = require('../src/sff_png8_source');
const { createSffV21Png8Bytes } = require('../src/sff_v21_png8_writer');
const { compareSffBackends } = require('../src/sff_backend_comparison');

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii'), result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0); name.copy(result, 4); data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return result;
}

function makePng(colors, indices) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 3;
  const rows = Buffer.from([0, indices[0], indices[1], 0, indices[2], indices[3]]);
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'), pngChunk('IHDR', ihdr),
    pngChunk('PLTE', Buffer.from(colors.flatMap(color => color.slice(0, 3)))),
    pngChunk('tRNS', Buffer.from(colors.map(color => color[3]))),
    pngChunk('IDAT', zlib.deflateSync(rows)), pngChunk('IEND', Buffer.alloc(0))
  ]);
}

const colors = Array.from({ length: 256 }, (_, index) => [index, 255 - index, (index * 13) & 255, index ? 255 : 0]);
const indices = Buffer.from([0, 1, 2, 3]);
const png = makePng(colors, indices);
const specification = createSffBuildSpecification({
  planId: 'compare-test-plan', sourceRoot: 'input',
  target: { archiveIdentity: 'active.sff', archiveFingerprint: null, sffVersion: '2.1' },
  requirements: ['sff-v2.1', 'preserve-authored-physical-order', 'immutable-source-snapshots', 'candidate-before-adoption', 'sprite-png8', 'embedded-palettes'],
  sprites: [{
    entryId: 'sprite:0', group: 7, number: 3, axisX: -4, axisY: 9,
    colorDepth: 8, format: 'png8', compression: 'png8', paletteId: 'palette:0',
    duplicatePolicy: 'preserve-separate', crop: { mode: 'none', axisDeltaX: 0, axisDeltaY: 0 },
    source: { relativePath: 'input/sprite.png', byteHash: sha256(png), decodedHash: sha256(indices), width: 2, height: 2, provenance: { kind: 'test' } }
  }],
  palettes: [{
    entryId: 'palette:0', group: 1, number: 1, tableOrder: 'sff', duplicatePolicy: 'preserve-separate', colors,
    source: { relativePath: 'input/sprite.png', byteHash: sha256(png), decodedHash: sha256(indices), width: 2, height: 2, provenance: { kind: 'test' } }
  }],
  decisions: [], options: { shared: { fullRebuild: true }, backends: {} }
});
const sources = new Map([['input/sprite.png', png]]);
const canonical = createSffV21Png8Bytes(specification, { sources });

// SprMake2's named compatibility profile permits zero-filled layout padding;
// arbitrary unreferenced bytes remain corruption. This changes candidate bytes
// without changing any sprite or palette meaning.
const byteDifferent = Buffer.concat([canonical, Buffer.alloc(3)]);
const report = compareSffBackends({
  specification, sprMake2CandidateBytes: byteDifferent,
  builtInOptions: { sources }
});
assert.strictEqual(report.status, 'equivalent');
assert.strictEqual(report.semanticEquivalent, true);
assert.strictEqual(report.byteEquivalent, false);
assert.notStrictEqual(report.candidates.sprMake2.byteHash, report.candidates.builtIn.byteHash);
assert.strictEqual(report.candidates.sprMake2.byteLength, canonical.length + 3);
assert.deepStrictEqual(report.semantic.sprMake2, report.semantic.builtIn);
assert.deepStrictEqual(report.adoption, {
  attempted: false, sprMake2CandidateAdopted: false, builtInCandidateAdopted: false, supportedByThisWorkflow: false
});
assert.strictEqual(Object.prototype.hasOwnProperty.call(report, 'adopt'), false);
const suppliedBuiltIn = compareSffBackends({ specification, sprMake2CandidateBytes: byteDifferent, builtInCandidateBytes: canonical, builtInBackendId: 'ikemaker-builtin-sff-v21-png8-prerelease' }, { createBuiltIn: () => { throw new Error('prebuilt candidate must not be regenerated'); } });
assert.strictEqual(suppliedBuiltIn.status, 'equivalent');
assert.strictEqual(suppliedBuiltIn.candidates.builtIn.backendId, 'ikemaker-builtin-sff-v21-png8-prerelease');
const validationOrder = [];
compareSffBackends({ specification, sprMake2CandidateBytes: Buffer.from([1]), builtInCandidateBytes: Buffer.from([2]) }, {
  validate: (bytes) => { validationOrder.push(bytes[0]); return syntheticValidation(-4); }
});
assert.deepStrictEqual(validationOrder, [2, 1], 'pre-release comparison independently validates the in-house candidate before SprMake2');

const wrongAxis = Buffer.from(canonical);
const spriteTable = wrongAxis.readUInt32LE(36);
wrongAxis.writeInt16LE(44, spriteTable + 8);
assert.throws(() => compareSffBackends({ specification, sprMake2CandidateBytes: wrongAxis, builtInOptions: { sources } }), /axes 44,9 do not match reviewed -4,9/);

const driftedSources = new Map(sources);
driftedSources.set('input/sprite.png', Buffer.concat([png, Buffer.from([0])]));
assert.throws(() => compareSffBackends({ specification, sprMake2CandidateBytes: canonical, builtInOptions: { sources: driftedSources } }), /source byte hash .* does not match reviewed/);

const mutable = JSON.parse(JSON.stringify(specification));
assert.throws(() => compareSffBackends({ specification: mutable, sprMake2CandidateBytes: canonical, builtInOptions: { sources } }), /requires an immutable specification/);

function syntheticValidation(axisX) {
  return {
    profile: 'synthetic-strict-profile',
    palettes: [{ index: 0, group: 1, number: 1, colors: 256, link: 0, dataSize: 1024, rgbaHash: 'colors' }],
    sprites: [{ index: 0, group: 7, number: 3, width: 2, height: 2, axisX, axisY: 9, format: 10, colorDepth: 8, paletteIndex: 0, link: 0, dataSize: 80, decodedIndexHash: sha256(indices) }]
  };
}
let validationCall = 0;
assert.throws(() => compareSffBackends({ specification, sprMake2CandidateBytes: Buffer.from([1]) }, {
  validate: () => syntheticValidation(validationCall++ ? -4 : 99),
  createBuiltIn: () => ({
    adoptionAllowed: false,
    backend: { id: 'synthetic-built-in', adoptionSupported: false },
    bytes: Buffer.from([2])
  })
}), (error) => {
  assert.strictEqual(error.name, 'SffCandidateComparisonError');
  assert.strictEqual(error.report.status, 'rejected-semantic-mismatch');
  assert.strictEqual(error.report.firstDifference.path, 'semantic.sprites[0].axis[0]');
  assert.strictEqual(error.report.adoption.attempted, false);
  return true;
});

console.log('SFF backend comparison proves semantic equivalence without byte identity or candidate adoption');
