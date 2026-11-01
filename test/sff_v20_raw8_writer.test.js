'use strict';

const assert = require('assert');
const crypto = require('crypto');
const { createSffBuildSpecificationV2 } = require('../src/sff_build_specification_v2');
const { createSffV20Raw8Bytes } = require('../src/sff_v20_raw8_writer');
const { assertSffV20Raw8 } = require('../src/sff_v20_strict_validator');

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const H = 'a'.repeat(64);
const colors = seed => Array.from({ length: 256 }, (_, index) => [(index + seed) & 255, (255 - index + seed) & 255, (index * 3 + seed) & 255, index === 0 ? 0 : 255]);
const pixelsA = Buffer.from([0, 1, 254, 255, 33, 77]);
const pixelsB = Buffer.from([255, 0, 128, 64]);

function palette(entryId, group, number, paletteColors, linkTargetEntryId = null) {
  return { entryId, group, number, colors: paletteColors, ...(linkTargetEntryId ? { contentLinkTargetEntryId: linkTargetEntryId } : {}), source: { relativePath: `${entryId}.act`, byteHash: H, provenance: { fixture: true } } };
}
function sprite(entryId, group, number, width, height, axisX, axisY, pixels, paletteEntryId, linkTargetEntryId = null) {
  const decodedHash = sha(pixels);
  return { entryId, group, number, width, height, axisX, axisY, pixels: { kind: 'indexed8', decodedHash }, paletteEntryId, ...(linkTargetEntryId ? { contentLinkTargetEntryId: linkTargetEntryId } : {}), source: { kind: 'complete-image', relativePath: `${entryId}.png`, byteHash: H, decodedHash, provenance: { fixture: true } } };
}
function specification(overrides = {}) {
  const paletteA = palette('palette:a', 1, 1, colors(0));
  const paletteLink = palette('palette:a-link', 1, 2, colors(0), 'palette:a');
  const sprites = [
    sprite('sprite:a', 10, 20, 3, 2, -32768, 32767, pixelsA, 'palette:a'),
    sprite('sprite:a-link', 10, 20, 3, 2, 7, -9, pixelsA, 'palette:a-link', 'sprite:a'),
    sprite('sprite:b', 65535, 65535, 2, 2, 32767, -32768, pixelsB, 'palette:a')
  ];
  return createSffBuildSpecificationV2({
    planId: overrides.planId || 'v20-raw8-writer', selection: { targetId: 'sff-v2.0', backendId: 'ikemaker-builtin-sff-v2.0' },
    archive: { identity: 'candidate.sff' }, logical: { sourceRoot: 'input', sprites: overrides.sprites || sprites, palettes: overrides.palettes || [paletteA, paletteLink], provenance: { fixture: true } },
    encodingIntent: overrides.encodingIntent || { compression: { default: 'raw8' }, crop: { default: 'none' }, storage: { byEntryId: { 'sprite:a-link': 'share-identical', 'palette:a-link': 'share-identical' } }, paletteMode: 'embedded', backendOptions: { 'ikemaker-builtin-sff-v2.0': {} } },
    capabilityRequest: { requiredFeatures: ['transparency.index0-binary'] }, review: { reviewer: 'automated-structural-fixture' }
  });
}

const spec = specification(), decoded = { 'sprite:a': pixelsA, 'sprite:a-link': pixelsA, 'sprite:b': pixelsB };
const first = createSffV20Raw8Bytes(spec, { decodedPixelsByEntryId: decoded });
const second = createSffV20Raw8Bytes(spec, { decodedPixelsByEntryId: decoded });
assert.deepStrictEqual(second, first, 'the same sealed logical content must produce deterministic bytes');
assert.strictEqual(first.length, 512 + 2 * 16 + 3 * 28 + 1024 + pixelsA.length + pixelsB.length);
assert.deepStrictEqual([...first.subarray(12, 16)], [0, 1, 0, 2]);
assert.deepStrictEqual([...first.subarray(24, 28)], [0, 0, 0, 2]);
assert.strictEqual(first.readUInt32LE(44), 512);
assert.strictEqual(first.readUInt32LE(36), 512 + 32);
assert.strictEqual(first.readUInt32LE(52), 512 + 32 + 84);
assert.strictEqual(first.readUInt32LE(60), first.length);
assert.strictEqual(first.readUInt32LE(64), 0);
const report = assertSffV20Raw8(first, spec);
assert.strictEqual(report.primaryVersion, '2.0.1.0');
assert.strictEqual(report.compatibleVersion, '2.0.0.0');
assert.deepStrictEqual(report.sprites.map(item => [item.group, item.number]), [[10, 20], [10, 20], [65535, 65535]], 'physical order and repeated identities are preserved');
assert.deepStrictEqual(report.sprites.map(item => item.dataSize ? null : item.link), [null, 0, null]);
assert.deepStrictEqual(report.palettes.map(item => item.dataSize ? null : item.link), [null, 0]);
assert.strictEqual(report.sprites[0].decodedIndexes[0], 0); assert.strictEqual(report.sprites[0].decodedIndexes[3], 255);

const partial = colors(0); partial[1] = [...partial[1].slice(0, 3), 128];
assert.throws(() => createSffV20Raw8Bytes(specification({ palettes: [palette('palette:a', 1, 1, partial)] , sprites: [sprite('sprite:a', 1, 1, 3, 2, 0, 0, pixelsA, 'palette:a')] }), { decodedPixelsByEntryId: { 'sprite:a': pixelsA } }), /requires index 0 transparent/);
assert.throws(() => createSffV20Raw8Bytes(spec, { decodedPixelsByEntryId: { ...decoded, extra: pixelsA } }), /exactly every logical sprite/);
assert.throws(() => createSffV20Raw8Bytes(spec, { decodedPixelsByEntryId: { ...decoded, 'sprite:b': Buffer.from([1, 2, 3, 4]) } }), /drifted/);
assert.throws(() => createSffV20Raw8Bytes(specification({ encodingIntent: { compression: { default: 'png8' }, crop: { default: 'none' }, storage: {}, paletteMode: 'embedded', backendOptions: {} } }), { decodedPixelsByEntryId: decoded }), /explicitly raw8/);

const multiSprites = [
  sprite('sprite:0', 0, 0, 3, 2, 0, 0, pixelsA, 'palette:a'),
  sprite('sprite:1', 0, 1, 3, 2, 0, 0, pixelsA, 'palette:a', 'sprite:0'),
  sprite('sprite:2', 0, 2, 3, 2, 0, 0, pixelsA, 'palette:a', 'sprite:1')
];
const multi = specification({ sprites: multiSprites, palettes: [palette('palette:a', 1, 1, colors(0))] });
const multiBytes = createSffV20Raw8Bytes(multi, { decodedPixelsByEntryId: { 'sprite:0': pixelsA, 'sprite:1': pixelsA, 'sprite:2': pixelsA } });
const multiReport = assertSffV20Raw8(multiBytes, multi);
assert.deepStrictEqual(multiReport.sprites.map(item => item.dataSize ? null : item.link), [null, 0, 1], 'valid backward sprite chains preserve each reviewed physical hop');
assert.deepStrictEqual(multiReport.sprites.map(item => item.resolvedDecodedIndexHash), [sha(pixelsA), sha(pixelsA), sha(pixelsA)], 'every sprite hop resolves to the same stored RAW8 owner');
const forwardSpriteSpec = specification({
  sprites: [sprite('sprite:0', 0, 0, 3, 2, 0, 0, pixelsA, 'palette:a', 'sprite:1'), sprite('sprite:1', 0, 1, 3, 2, 0, 0, pixelsA, 'palette:a')],
  palettes: [palette('palette:a', 1, 1, colors(0))]
});
assert.throws(() => createSffV20Raw8Bytes(forwardSpriteSpec, { decodedPixelsByEntryId: { 'sprite:0': pixelsA, 'sprite:1': pixelsA } }), /must link backward/, 'forward sprite links remain outside the supported SFF v2.0 profile');

const multiPalettes = [
  palette('palette:0', 1, 1, colors(0)),
  palette('palette:1', 1, 2, colors(0), 'palette:0'),
  palette('palette:2', 1, 3, colors(0), 'palette:1')
];
const multiPaletteSpec = specification({ sprites: [sprite('sprite:0', 0, 0, 3, 2, 0, 0, pixelsA, 'palette:2')], palettes: multiPalettes });
const multiPaletteBytes = createSffV20Raw8Bytes(multiPaletteSpec, { decodedPixelsByEntryId: { 'sprite:0': pixelsA } });
const multiPaletteReport = assertSffV20Raw8(multiPaletteBytes, multiPaletteSpec);
assert.deepStrictEqual(multiPaletteReport.palettes.map(item => item.dataSize ? null : item.link), [null, 0, 1], 'valid backward palette chains preserve each reviewed physical hop');
assert.strictEqual(multiPaletteReport.sprites[0].paletteIndex, 2, 'a sprite can retain its reviewed assignment to the final palette in a valid backward chain');
assert.strictEqual(multiPaletteReport.sprites[0].resolvedDecodedIndexHash, sha(pixelsA), 'the strict validator resolves the assigned palette chain to its stored owner');
const forwardPaletteSpec = specification({
  sprites: [sprite('sprite:0', 0, 0, 3, 2, 0, 0, pixelsA, 'palette:0')],
  palettes: [palette('palette:0', 1, 1, colors(0), 'palette:1'), palette('palette:1', 1, 2, colors(0))]
});
assert.throws(() => createSffV20Raw8Bytes(forwardPaletteSpec, { decodedPixelsByEntryId: { 'sprite:0': pixelsA } }), /must link backward/, 'forward palette links remain outside the supported SFF v2.0 profile');

const empty = specification({ sprites: [], palettes: [], planId: 'v20-empty' });
const emptyBytes = createSffV20Raw8Bytes(empty, { decodedPixelsByEntryId: {} });
assert.strictEqual(emptyBytes.length, 512); assertSffV20Raw8(emptyBytes, empty);

console.log('Built-in SFF v2.0 RAW8 writer is deterministic, bounded, binary-transparent, link-aware, and 512-byte-header correct');
