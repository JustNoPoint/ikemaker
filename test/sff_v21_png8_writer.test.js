'use strict';

const assert = require('assert');
const crypto = require('crypto');
const zlib = require('zlib');
const { createSffBuildSpecification, specificationHash } = require('../src/sff_build_specification');
const { crc32, readIndexedPng8, canonicalizeEmbeddedPng8 } = require('../src/sff_png8_source');
const { checkedLinkIndex, createSffV21Png8Bytes } = require('../src/sff_v21_png8_writer');
const { BUILTIN_SFF_V21_PNG8_BACKEND, BUILTIN_SFF_V21_PNG8_PRERELEASE_BACKEND, createBuiltInCompareCandidate, createBuiltInPreReleaseCandidate } = require('../src/sff_builtin_backend');
const { assertSffV21Png8 } = require('../src/sff_v21_strict_validator');

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii'), result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  name.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return result;
}

function palette(seed = 0) {
  return Array.from({ length: 256 }, (_, index) => [
    (index + seed) & 0xff,
    (255 - index + seed) & 0xff,
    (index * 17 + seed) & 0xff,
    index === 0 ? 0 : (191 + index + seed) & 0xff
  ]);
}

function indexedPng(width, height, indices, colors) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 3;
  const plte = Buffer.from(colors.flatMap(color => color.slice(0, 3)));
  const trns = Buffer.from(colors.map(color => color[3]));
  const scanlines = Buffer.alloc(height * (width + 1));
  for (let row = 0; row < height; row += 1) {
    scanlines[row * (width + 1)] = 0;
    indices.copy(scanlines, row * (width + 1) + 1, row * width, (row + 1) * width);
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', ihdr),
    pngChunk('PLTE', plte),
    pngChunk('tRNS', trns),
    pngChunk('IDAT', zlib.deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

const colorsA = palette(0), colorsB = palette(23);
const indicesA = Buffer.from([0, 1, 2, 3, 4, 5]);
const indicesB = Buffer.from([9, 8, 7, 6]);
const pngA = indexedPng(3, 2, indicesA, colorsA);
const pngB = indexedPng(2, 2, indicesB, colorsB);
const sources = new Map([['input/a.png', pngA], ['input/b.png', pngB]]);

for (const alpha of [
  [0, ...Array(255).fill(255)],
  [0, 0, 128, ...Array(253).fill(255)],
  [64, 128, 192, ...Array(253).fill(255)],
  Array(256).fill(255)
]) {
  const colors = palette(7).map((color, index) => [...color.slice(0, 3), alpha[index]]), sourcePng = indexedPng(3, 2, indicesA, colors), compact = canonicalizeEmbeddedPng8(sourcePng);
  assert(compact.length < sourcePng.length, 'trailing fully opaque alpha entries are omitted from the embedded PNG');
  assert.deepStrictEqual(readIndexedPng8(compact).colors, readIndexedPng8(sourcePng).colors, 'tRNS compaction preserves exact RGBA meaning');
  assert.strictEqual(readIndexedPng8(compact).decodedHash, readIndexedPng8(sourcePng).decodedHash, 'tRNS compaction preserves indexed pixels');
  assert.deepStrictEqual(canonicalizeEmbeddedPng8(sourcePng), compact, 'embedded PNG canonicalization is deterministic');
}

function source(relativePath, png, width, height, indices) {
  return { relativePath, byteHash: sha256(png), decodedHash: sha256(indices), width, height, provenance: { kind: 'writer-test' } };
}

function makeSpecification(overrides = {}) {
  const input = {
    planId: 'writer-test-plan',
    sourceRoot: 'input',
    target: { archiveIdentity: 'candidate.sff', archiveFingerprint: null, sffVersion: '2.1' },
    requirements: ['sff-v2.1', 'preserve-authored-physical-order', 'immutable-source-snapshots', 'candidate-before-adoption', 'sprite-png8', 'embedded-palettes'],
    sprites: [
      { entryId: 'sprite:b', group: 20, number: 7, axisX: -4, axisY: 11, colorDepth: 8, format: 'png8', compression: 'png8', paletteId: 'palette:b', duplicatePolicy: 'preserve-separate', crop: { mode: 'none', axisDeltaX: 0, axisDeltaY: 0 }, source: source('input/b.png', pngB, 2, 2, indicesB) },
      { entryId: 'sprite:a', group: 10, number: 3, axisX: 320, axisY: -200, colorDepth: 8, format: 'png8', compression: 'png8', paletteId: '1,1', duplicatePolicy: 'preserve-separate', crop: { mode: 'none', axisDeltaX: 0, axisDeltaY: 0 }, source: source('input/a.png', pngA, 3, 2, indicesA) }
    ],
    palettes: [
      { entryId: 'palette:a', group: 1, number: 1, tableOrder: 'sff', duplicatePolicy: 'preserve-separate', colors: colorsA, source: source('input/a.png', pngA, 3, 2, indicesA) },
      { entryId: 'palette:b', group: 1, number: 2, tableOrder: 'sff', duplicatePolicy: 'preserve-separate', colors: colorsB, source: source('input/b.png', pngB, 2, 2, indicesB) }
    ],
    decisions: [],
    options: { shared: { fullRebuild: true }, backends: {} }
  };
  return createSffBuildSpecification({ ...input, ...overrides });
}

function rejects(specification, pattern, selectedSources = sources) {
  assert.throws(() => createSffV21Png8Bytes(specification, { sources: selectedSources }), pattern);
}

function changedSpecification(original, change) {
  const copy = JSON.parse(JSON.stringify(original));
  change(copy);
  copy.specificationHash = specificationHash(copy);
  return copy;
}

const specification = makeSpecification();
assert.strictEqual(checkedLinkIndex(65535, 'boundary sprite'), 65535);
assert.throws(() => checkedLinkIndex(65536, 'overflow sprite'), /link target physical index 65536 exceeds .*0–65535 link field/);
assert.throws(() => checkedLinkIndex(-1, 'negative sprite'), /link target physical index -1 exceeds/);
const first = createSffV21Png8Bytes(specification, { sources });
const second = createSffV21Png8Bytes(specification, { sources });
assert.deepStrictEqual(first, second, 'the same reviewed specification and snapshots must produce identical bytes');

const report = assertSffV21Png8(first, specification);
assert.deepStrictEqual(report.physicalOrder.map(item => `${item.group},${item.number}`), ['20,7', '10,3'], 'authored physical sprite order must be preserved');
assert.deepStrictEqual(report.palettes.map(item => `${item.group},${item.number}`), ['1,1', '1,2'], 'authored physical palette order must be preserved');
assert.strictEqual(report.sprites[0].paletteIndex, 1);
assert.strictEqual(report.sprites[1].paletteIndex, 0);
assert.strictEqual(report.sprites[0].axisX, -4);
assert.strictEqual(report.sprites[1].axisY, -200);

const candidate = createBuiltInCompareCandidate(specification, { sources });
assert.deepStrictEqual(candidate.bytes, first);
assert.strictEqual(candidate.kind, 'private-compare-candidate');
assert.strictEqual(candidate.adoptionAllowed, false);
assert.strictEqual(candidate.validation.status, 'passed');
assert.strictEqual(candidate.validation.profile, 'sff-v2.1-png8-strict-v2');
assert.strictEqual(candidate.byteHash, sha256(first));
assert.strictEqual(BUILTIN_SFF_V21_PNG8_BACKEND.mode, 'compare-only');
assert.strictEqual(BUILTIN_SFF_V21_PNG8_BACKEND.adoptionSupported, false);
assert.strictEqual(BUILTIN_SFF_V21_PNG8_BACKEND.linksSupported, true);
assert.strictEqual(BUILTIN_SFF_V21_PNG8_BACKEND.fullRebuildOnly, true);
assert.strictEqual(BUILTIN_SFF_V21_PNG8_BACKEND.emptyArchiveSupported, true);
assert.deepStrictEqual(BUILTIN_SFF_V21_PNG8_BACKEND.cropModes, ['none', 'before-axis', 'after-axis']);
assert.strictEqual(Object.prototype.hasOwnProperty.call(candidate, 'adopt'), false);
const preReleaseCandidate = createBuiltInPreReleaseCandidate(specification, { sources });
assert.deepStrictEqual(preReleaseCandidate.bytes, first, 'pre-release and compare-only modes must serialize the same deterministic built-in bytes');
assert.strictEqual(preReleaseCandidate.kind, 'private-prerelease-comparison-candidate');
assert.strictEqual(preReleaseCandidate.adoptionAllowed, false);
assert.strictEqual(preReleaseCandidate.comparisonRequired, true);
assert.strictEqual(preReleaseCandidate.validation.compatibilityProfile, 'canonical');
assert.strictEqual(BUILTIN_SFF_V21_PNG8_PRERELEASE_BACKEND.mode, 'prerelease-comparison-output');
assert.strictEqual(BUILTIN_SFF_V21_PNG8_PRERELEASE_BACKEND.adoptionSupported, false);
assert.strictEqual(BUILTIN_SFF_V21_PNG8_PRERELEASE_BACKEND.requiresSprMake2Comparison, true);

rejects(makeSpecification({ sprites: [{ ...specification.sprites[0], format: 'png24', compression: 'png24', colorDepth: 24 }] }), /only indexed PNG8\/PNG8 depth 8/);
const emptySpecification = makeSpecification({ sprites: [], palettes: [] });
const emptyBytes = createSffV21Png8Bytes(emptySpecification);
assert.strictEqual(emptyBytes.length, 64, 'a reviewed empty archive contains only the deterministic SFF v2.1 header');
assertSffV21Png8(emptyBytes, emptySpecification);
rejects(makeSpecification({ sprites: [], palettes: specification.palettes }), /not an unproven palette-only archive/);
rejects(changedSpecification(specification, copy => { copy.sprites[0].compression = 'lz5'; }), /no quantization or alternate compression/);
const beforeAxisSpecification = makeSpecification({ sprites: [{ ...specification.sprites[0], crop: { mode: 'before-axis', axisDeltaX: 0, axisDeltaY: 0 } }] });
const beforeAxisBytes = createSffV21Png8Bytes(beforeAxisSpecification, { sources });
assertSffV21Png8(beforeAxisBytes, beforeAxisSpecification);
assert.strictEqual(beforeAxisBytes.readUInt16LE(64 + 32 + 4), 2, 'reviewed before-axis snapshots retain their prepared width');
const afterAxisSpecification = makeSpecification({ sprites: [{ ...specification.sprites[0], axisX: -4, crop: { mode: 'after-axis', axisDeltaX: -1, axisDeltaY: 0 }, source: { ...specification.sprites[0].source, provenance: { kind: 'approved-manifest-source', preparation: { kind: 'after-axis-crop', bounds: '1,0,2,2', outputByteHash: specification.sprites[0].source.byteHash, axisDeltaX: -1, axisDeltaY: 0 } } } }, specification.sprites[1]] });
const afterAxisBytes = createSffV21Png8Bytes(afterAxisSpecification, { sources });
const afterAxisReport = assertSffV21Png8(afterAxisBytes, afterAxisSpecification);
assert.strictEqual(afterAxisReport.sprites[0].axisX, -5, 'the built-in writer applies the sealed after-axis crop delta exactly once');
rejects(changedSpecification(afterAxisSpecification, copy => { copy.sprites[0].crop.axisDeltaX = 0; }), /does not preserve the reviewed crop origin/);
rejects(makeSpecification({ sprites: [{ ...specification.sprites[0], crop: { mode: 'autocrop', axisDeltaX: 0, axisDeltaY: 0 } }] }), /accepts none or an already prepared reviewed crop snapshot only/);
const repeatedIdentitySpecification = makeSpecification({ sprites: [
  specification.sprites[0],
  { ...specification.sprites[1], entryId: 'sprite:repeated-identity', group: specification.sprites[0].group, number: specification.sprites[0].number }
] });
const repeatedIdentityReport = assertSffV21Png8(createSffV21Png8Bytes(repeatedIdentitySpecification, { sources }), repeatedIdentitySpecification);
assert.deepStrictEqual(repeatedIdentityReport.physicalOrder.map(item => `${item.group},${item.number}`), ['20,7', '20,7'], 'repeated group/index identities remain separate reviewed physical entries');
const linkedSpecification = makeSpecification({
  sprites: [
    specification.sprites[0],
    { ...specification.sprites[0], entryId: 'sprite:b-link', group: 20, number: 8, axisX: 14, axisY: -9, duplicatePolicy: 'share-identical', linkTargetEntryId: 'sprite:b' }
  ],
  palettes: [
    specification.palettes[0],
    { ...specification.palettes[0], entryId: 'palette:a-link', group: 1, number: 3, duplicatePolicy: 'share-identical', linkTargetEntryId: 'palette:a' },
    specification.palettes[1]
  ]
});
const linkedBytes = createSffV21Png8Bytes(linkedSpecification, { sources });
const linkedReport = assertSffV21Png8(linkedBytes, linkedSpecification);
assert.strictEqual(linkedReport.sprites[1].dataSize, 0);
assert.strictEqual(linkedReport.sprites[1].link, 0);
assert.strictEqual(linkedReport.sprites[1].axisX, 14, 'linked entries retain their own axes');
assert.strictEqual(linkedReport.palettes[1].dataSize, 0);
assert.strictEqual(linkedReport.palettes[1].link, 0);
assert(linkedBytes.length < createSffV21Png8Bytes(makeSpecification({
  sprites: [specification.sprites[0], { ...specification.sprites[0], entryId: 'sprite:b-copy', group: 20, number: 8 }],
  palettes: [specification.palettes[0], { ...specification.palettes[0], entryId: 'palette:a-copy', group: 1, number: 3 }, specification.palettes[1]]
}), { sources }).length, 'reviewed links must omit duplicate literal payloads');
rejects(changedSpecification(linkedSpecification, copy => { copy.sprites[1].source.decodedHash = '0'.repeat(64); }), /decoded index hash .* does not match reviewed/);
rejects(changedSpecification(linkedSpecification, copy => { copy.palettes[1].colors[4][0] ^= 1; }), /RGBA tables differ/);
assert.throws(() => makeSpecification({ sprites: [{ ...specification.sprites[0], group: 70000 }] }), /sprites\[0\]\.group must be an integer from 0 through 65535/);
rejects(makeSpecification({ requirements: [...specification.requirements, 'incremental-in-place-rewrite'] }), /unsupported reviewed requirement incremental-in-place-rewrite/);
rejects(changedSpecification(specification, copy => { copy.sprites[0].entryId = ''; }), /bounded non-empty entryId/);
rejects(changedSpecification(specification, copy => { copy.palettes[0].entryId = ''; }), /bounded non-empty entryId/);
rejects(changedSpecification(specification, copy => { copy.palettes[0].tableOrder = 'reversed'; }), /normalized to SFF index order/);

const wrongPalette = palette(99);
const storedPaletteOverrideSpecification = makeSpecification({ palettes: [{ ...specification.palettes[1], colors: wrongPalette, source: { ...specification.palettes[1].source, provenance: { kind: 'portable-sprmake2-recipe-palette' } } }, specification.palettes[0]] });
const storedPaletteOverrideReport = assertSffV21Png8(createSffV21Png8Bytes(storedPaletteOverrideSpecification, { sources }), storedPaletteOverrideSpecification);
assert.strictEqual(storedPaletteOverrideReport.sprites[0].paletteIndex, 0, 'an explicit stored palette remains authoritative even when the PNG PLTE is different');
const changedSource = new Map(sources); changedSource.set('input/b.png', Buffer.concat([pngB, Buffer.from([0])]));
rejects(specification, /source byte hash .* does not match reviewed/, changedSource);
rejects(makeSpecification({ sprites: [{ ...specification.sprites[0], source: { ...specification.sprites[0].source, decodedHash: null } }] }), /does not match reviewed missing hash/);

const wrongVersion = changedSpecification(specification, copy => { copy.target.sffVersion = '2.0'; });
rejects(wrongVersion, /only SFF 2\.1 is supported/);
const tampered = JSON.parse(JSON.stringify(specification));
tampered.sprites[0].axisX = 44;
rejects(tampered, /specification hash is missing or does not match/);

console.log('built-in deterministic SFF v2.1 PNG8 writer and compare-only backend tests passed');
