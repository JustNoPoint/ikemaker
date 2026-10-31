'use strict';

const assert = require('assert');
const crypto = require('crypto');
const { createSffBuildSpecificationV2 } = require('../src/sff_build_specification_v2');
const { createSffV1Pcx8Bytes } = require('../src/sff_v1_pcx8_writer');
const { assertSffV1Pcx8, validateSffV1Pcx8 } = require('../src/sff_v1_pcx8_strict_validator');

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const H = 'a'.repeat(64);
const colors = seed => Array.from({ length: 256 }, (_, index) => [(index + seed) & 255, (255 - index + seed) & 255, (index * 3 + seed) & 255, index === 0 ? 0 : 255]);
function palette(id, number, value = colors(number)) { return { entryId: id, group: 0, number, colors: value, source: { relativePath: `${id}.act`, byteHash: H, provenance: { fixture: true } } }; }
function sprite(id, group, number, width, height, pixels, paletteEntryId, extra = {}) { const decodedHash = sha(pixels); return { entryId: id, group, number, width, height, axisX: extra.axisX || 0, axisY: extra.axisY || 0, pixels: { kind: 'indexed8', decodedHash }, paletteEntryId, ...(extra.link ? { contentLinkTargetEntryId: extra.link } : {}), source: { kind: 'complete-image', relativePath: `${id}.png`, byteHash: H, decodedHash, provenance: { fixture: true } } }; }
function spec(sprites, palettes, choices, planId = 'v1-pcx8') { return createSffBuildSpecificationV2({ planId, selection: { targetId: 'sff-v1', backendId: 'ikemaker-builtin-sff-v1' }, archive: { identity: `${planId}.sff` }, logical: { sourceRoot: 'input', sprites, palettes, provenance: { fixture: true } }, encodingIntent: { compression: { default: 'pcx-rle8' }, crop: { default: 'none' }, storage: { byEntryId: Object.fromEntries(sprites.filter(row => row.contentLinkTargetEntryId).map(row => [row.entryId, 'share-identical'])) }, paletteMode: 'individual-successive', backendOptions: { 'ikemaker-builtin-sff-v1': { paletteBySpriteEntryId: choices } } }, capabilityRequest: { requiredFeatures: ['transparency.index0-binary'] }, review: { reviewer: 'structural-fixture' } }); }

const p0 = palette('palette:0', 0), p1 = palette('palette:1', 1);
const pixelsA = Buffer.from([0xc0, 0xc0, 0xc0, 1, 2, 3]);
const pixelsB = Buffer.from([4, 5, 6, 7]);
const sprites = [
  sprite('sprite:a', 5, 9, 3, 2, pixelsA, p0.entryId, { axisX: -32768, axisY: 32767 }),
  sprite('sprite:b', 5, 9, 2, 2, pixelsB, p1.entryId),
  sprite('sprite:c', 7, 1, 3, 2, pixelsA, p0.entryId),
  sprite('sprite:link', 7, 2, 3, 2, pixelsA, p0.entryId, { link: 'sprite:c' })
];
const choices = { 'sprite:a': 'own', 'sprite:b': 'own', 'sprite:c': 'own', 'sprite:link': 'previous' };
const reviewed = spec(sprites, [p0, p1], choices), decoded = { 'sprite:a': pixelsA, 'sprite:b': pixelsB, 'sprite:c': pixelsA, 'sprite:link': pixelsA };
const first = createSffV1Pcx8Bytes(reviewed, { decodedPixelsByEntryId: decoded }), repeat = createSffV1Pcx8Bytes(reviewed, { decodedPixelsByEntryId: decoded });
assert.deepStrictEqual(first, repeat); assert.deepStrictEqual([...first.subarray(12, 16)], [0, 1, 0, 1]);
assert.strictEqual(first.length > 512, true); assert.strictEqual(first.readUInt32LE(16), 2); assert.strictEqual(first.readUInt32LE(20), 4); assert.strictEqual(first.readUInt32LE(24), 512); assert.strictEqual(first.readUInt32LE(28), 32); assert.strictEqual(first[32], 0);
const report = assertSffV1Pcx8(first, reviewed);
assert.deepStrictEqual(report.sprites.map(row => [row.group, row.number]), [[5, 9], [5, 9], [7, 1], [7, 2]]);
assert.deepStrictEqual(report.sprites.map(row => row.declaredLength ? null : row.link), [null, null, null, 2]);
assert.strictEqual(report.sprites.at(-1).nextOffset, first.length); assert.deepStrictEqual(report.sprites[0].decodedIndexes, pixelsA);

const reuseSprites = [sprite('sprite:0', 0, 0, 1, 1, Buffer.from([0xc0]), p0.entryId), sprite('sprite:1', 0, 1, 1, 1, Buffer.from([0xc0]), p0.entryId)];
const reuseSpec = spec(reuseSprites, [p0], { 'sprite:0': 'own', 'sprite:1': 'previous' }, 'reuse');
const reuse = createSffV1Pcx8Bytes(reuseSpec, { decodedPixelsByEntryId: { 'sprite:0': Buffer.from([0xc0]), 'sprite:1': Buffer.from([0xc0]) } }), reuseReport = assertSffV1Pcx8(reuse, reuseSpec);
const second = reuseReport.sprites[1]; assert.strictEqual(second.nextOffset - (second.headerOffset + 32 + second.declaredLength), -768, 'SprMaker-style declared size retains omitted RGB bytes'); assert.strictEqual(second.nextOffset, reuse.length);

const empty = spec([], [], {}, 'empty'), emptyBytes = createSffV1Pcx8Bytes(empty, { decodedPixelsByEntryId: {} }); assert.strictEqual(emptyBytes.length, 512); assertSffV1Pcx8(emptyBytes, empty);
const rowBoundaryPixels = Buffer.from([0, 0, 0, 0]);
const rowBoundarySprite = sprite('sprite:row-boundary', 0, 0, 2, 2, rowBoundaryPixels, p0.entryId);
const rowBoundarySpec = spec([rowBoundarySprite], [p0], { 'sprite:row-boundary': 'own' }, 'row-boundary');
assert.doesNotThrow(() => assertSffV1Pcx8(
  createSffV1Pcx8Bytes(rowBoundarySpec, { decodedPixelsByEntryId: { 'sprite:row-boundary': rowBoundaryPixels } }),
  rowBoundarySpec
), 'canonical RLE remains independently valid when one row ends with the value that begins the next row');
assert.throws(() => createSffV1Pcx8Bytes(spec(reuseSprites, [p0], { 'sprite:0': 'previous', 'sprite:1': 'previous' }), { decodedPixelsByEntryId: { 'sprite:0': Buffer.from([0xc0]), 'sprite:1': Buffer.from([0xc0]) } }), /reuse only the immediately previous|first sprite/);
const mutation = Buffer.from(first); mutation[32] = 1; assert.strictEqual(validateSffV1Pcx8(mutation).ok, false);
const trailing = Buffer.concat([first, Buffer.from([0])]); assert.strictEqual(validateSffV1Pcx8(trailing).ok, false);

console.log('Built-in SFF v1.01 PCX8 writer is deterministic, packed, RLE-safe, palette-explicit, link-aware, and preserves the SprMaker omission quirk');
