'use strict';

const assert = require('assert');
const crypto = require('crypto');
const { createSffBuildSpecification } = require('../src/sff_build_specification');
const { createSffV21Png8Bytes } = require('../src/sff_v21_png8_writer');
const { validateSffV21Png8 } = require('../src/sff_v21_strict_validator');
const { encodeIndexed } = require('../src/sff_palette_remap');
const { readIndexedPng8 } = require('../src/sff_png8_source');

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const palette = seed => Array.from({ length: 256 }, (_, index) => [(index * 17 + seed) & 255, (255 - index + seed) & 255, (index * 3 + seed) & 255, index % 11 === 0 ? index : 255]);

function fixture(name, width, height, indices, colors) {
  const png = encodeIndexed(width, height, Buffer.from(indices), colors), decoded = readIndexedPng8(png);
  return { name, png, source: { relativePath: `input/${name}.png`, byteHash: sha256(png), decodedHash: decoded.decodedHash, width, height, provenance: { kind: 'golden-matrix' } } };
}

const minimalImage = fixture('minimal', 1, 1, [0], palette(0));
const boundaryImage = fixture('boundary', 3, 2, [0, 1, 254, 255, 33, 77], palette(9));
const storedOverrideColors = palette(77);
const afterAxisImage = { ...boundaryImage, source: { ...boundaryImage.source, provenance: { kind: 'approved-manifest-source', preparation: { kind: 'after-axis-crop', bounds: '1,1,3,2', outputByteHash: boundaryImage.source.byteHash, axisDeltaX: -1, axisDeltaY: -1, originalAxis: '101,-99' } } } };
const sources = new Map([[minimalImage.source.relativePath, minimalImage.png], [boundaryImage.source.relativePath, boundaryImage.png]]);
const paletteEntry = (entryId, group, number, image, linkTargetEntryId = null) => ({ entryId, group, number, tableOrder: 'sff', duplicatePolicy: linkTargetEntryId ? 'share-identical' : 'preserve-separate', ...(linkTargetEntryId ? { linkTargetEntryId } : {}), colors: readIndexedPng8(image.png).colors, source: image.source });
const spriteEntry = (entryId, group, number, axisX, axisY, image, paletteId, linkTargetEntryId = null) => ({ entryId, group, number, axisX, axisY, colorDepth: 8, format: 'png8', compression: 'png8', paletteId, duplicatePolicy: linkTargetEntryId ? 'share-identical' : 'preserve-separate', ...(linkTargetEntryId ? { linkTargetEntryId } : {}), crop: { mode: 'none', axisDeltaX: 0, axisDeltaY: 0 }, source: image.source });
const specification = (planId, sprites, palettes) => createSffBuildSpecification({
  planId, sourceRoot: 'input', target: { archiveIdentity: `${planId}.sff`, archiveFingerprint: null, sffVersion: '2.1' }, sprites, palettes,
  requirements: ['sff-v2.1', 'preserve-authored-physical-order', 'immutable-source-snapshots', 'candidate-before-adoption', 'sprite-png8', 'embedded-palettes'], decisions: [], options: { shared: { goldenMatrix: true }, backends: {} }
});

const cases = [
  {
    id: 'empty-archive', expectedHash: '4da36f8b28a3993e7d74073fad61eaf0880db1b4b174922f78663afcb82e95ac',
    spec: specification('golden-empty', [], [])
  },
  {
    id: 'minimal-one-pixel', expectedHash: '4dea50d727d6f682f733cb79854f5d151aa65a36e4c107a0c9b7ac12eb3b86d7',
    spec: specification('golden-minimal', [spriteEntry('sprite:minimal', 0, 0, 0, 0, minimalImage, 'palette:minimal')], [paletteEntry('palette:minimal', 1, 1, minimalImage)])
  },
  {
    id: 'prepared-after-axis', expectedHash: '6bd41e7a1326ab69d12ab783684623b481c0914bf1f398dbf8cb20511e8d43c9',
    spec: specification('golden-after-axis', [{ ...spriteEntry('sprite:after-axis', 21, 5, 101, -99, afterAxisImage, 'palette:after-axis'), crop: { mode: 'after-axis', axisDeltaX: -1, axisDeltaY: -1 } }], [paletteEntry('palette:after-axis', 1, 1, afterAxisImage)])
  },
  {
    id: 'signed-boundaries-and-max-identities', expectedHash: 'd9b5747908224d6d47056b9798140a9f6bd7fde097aa40278c972e713c6fd79e',
    spec: specification('golden-boundary', [
      spriteEntry('sprite:max', 65535, 65535, -32768, 32767, boundaryImage, 'palette:boundary'),
      spriteEntry('sprite:sparse', 0, 65000, 32767, -32768, boundaryImage, 'palette:boundary')
    ], [paletteEntry('palette:boundary', 65535, 65535, boundaryImage)])
  },
  {
    id: 'stored-palette-overrides-png', expectedHash: '430af093c9204f369162f01df535186efdd9882a53986c5b41a371dfc9d43849',
    spec: specification('golden-stored-palette', [spriteEntry('sprite:stored-palette', 12, 34, -27, 61, boundaryImage, 'palette:stored')], [{ ...paletteEntry('palette:stored', 9, 9, boundaryImage), colors: storedOverrideColors, source: { ...boundaryImage.source, provenance: { kind: 'portable-sprmake2-recipe-palette' } } }])
  },
  {
    id: 'multi-hop-backward-links', expectedHash: '0086383a992320f109e410015f5fb06dc8e8cfef75ff82a9e7a1ea9e8dc92ea1',
    spec: specification('golden-link-chain', [
      spriteEntry('sprite:base', 30, 9, -12, 44, boundaryImage, 'palette:base'),
      spriteEntry('sprite:link-1', 2, 500, 5, 6, boundaryImage, 'palette:link-1', 'sprite:base'),
      spriteEntry('sprite:link-2', 4000, 1, 100, -100, boundaryImage, 'palette:link-2', 'sprite:link-1')
    ], [
      paletteEntry('palette:base', 7, 4, boundaryImage),
      paletteEntry('palette:link-1', 7, 200, boundaryImage, 'palette:base'),
      paletteEntry('palette:link-2', 60000, 2, boundaryImage, 'palette:link-1')
    ])
  },
  {
    id: 'repeated-physical-identity', expectedHash: '9ec39dde1c11fb9f8cea87eae01a218bbe70f886585838900ddb651a7cdf088a',
    spec: specification('golden-repeated-identity', [
      spriteEntry('sprite:repeat-a', 3, 7, -4, 9, minimalImage, 'palette:minimal'),
      spriteEntry('sprite:repeat-b', 3, 7, 12, -6, boundaryImage, 'palette:boundary')
    ], [paletteEntry('palette:minimal', 1, 1, minimalImage), paletteEntry('palette:boundary', 1, 2, boundaryImage)])
  }
];

// These hashes intentionally include the lossless embedded-PNG canonical form:
// trailing opaque tRNS entries are omitted while decoded pixels and palette data remain exact.
for (const item of cases) {
  const first = createSffV21Png8Bytes(item.spec, { sources }), second = createSffV21Png8Bytes(item.spec, { sources });
  assert.deepStrictEqual(second, first, `${item.id} must be byte deterministic`);
  const report = validateSffV21Png8(first, item.spec);
  assert.strictEqual(report.ok, true, `${item.id}: ${report.errors.join('; ')}`);
  assert.strictEqual(sha256(first), item.expectedHash, `${item.id} golden bytes changed`);
  if (item.id === 'signed-boundaries-and-max-identities') {
    assert.deepStrictEqual(report.sprites.map(entry => [entry.group, entry.number, entry.axisX, entry.axisY]), [[65535, 65535, -32768, 32767], [0, 65000, 32767, -32768]]);
  }
  if (item.id === 'prepared-after-axis') assert.deepStrictEqual(report.sprites.map(entry => [entry.axisX, entry.axisY]), [[100, -100]]);
  if (item.id === 'stored-palette-overrides-png') {
    assert.notDeepStrictEqual(storedOverrideColors, readIndexedPng8(boundaryImage.png).colors);
    assert.strictEqual(report.sprites[0].paletteIndex, 0, 'stored palette remains authoritative over the source PNG PLTE');
  }
  if (item.id === 'multi-hop-backward-links') {
    assert.deepStrictEqual(report.sprites.map(entry => [entry.dataSize === 0, entry.link]), [[false, 0], [true, 0], [true, 1]]);
    assert.deepStrictEqual(report.palettes.map(entry => [entry.dataSize === 0, entry.link]), [[false, 0], [true, 0], [true, 1]]);
  }
  if (item.id === 'repeated-physical-identity') assert.deepStrictEqual(report.physicalOrder.map(entry => `${entry.group},${entry.number}`), ['3,7', '3,7']);
}

console.log('Built-in SFF PNG8 golden matrix covers empty, minimal, prepared after-axis, boundary, sparse, stored-palette override, repeated-identity and multi-hop linked archives');
