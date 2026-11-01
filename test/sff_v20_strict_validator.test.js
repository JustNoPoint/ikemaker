'use strict';

const assert = require('assert');
const crypto = require('crypto');
const { createSffBuildSpecificationV2 } = require('../src/sff_build_specification_v2');
const { createSffV20Raw8Bytes } = require('../src/sff_v20_raw8_writer');
const { parseSffV20, validateSffV20Raw8, assertSffV20Raw8 } = require('../src/sff_v20_strict_validator');

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const pixels = Buffer.from([0, 255, 1, 2]);
const colors = Array.from({ length: 256 }, (_, index) => [index, 255 - index, index ^ 0x55, index === 0 ? 0 : 255]);
const D = sha(pixels), H = 'b'.repeat(64);
const spec = createSffBuildSpecificationV2({
  planId: 'v20-validator', selection: { targetId: 'sff-v2.0', backendId: 'ikemaker-builtin-sff-v2.0' }, archive: { identity: 'validator.sff' },
  logical: { sourceRoot: 'input', sprites: [{ entryId: 'sprite:0', group: 2, number: 3, width: 2, height: 2, axisX: -4, axisY: 5, pixels: { kind: 'indexed8', decodedHash: D }, paletteEntryId: 'palette:0', source: { relativePath: 'a.png', byteHash: H, decodedHash: D } }], palettes: [{ entryId: 'palette:0', group: 1, number: 1, colors, source: { relativePath: 'a.act', byteHash: H } }] },
  encodingIntent: { compression: { default: 'raw8' }, crop: { default: 'none' }, storage: {}, paletteMode: 'embedded', backendOptions: {} }
});
const candidate = createSffV20Raw8Bytes(spec, { decodedPixelsByEntryId: { 'sprite:0': pixels } });
const parsed = parseSffV20(candidate);
assert.strictEqual(parsed.header.primaryVersion, '2.0.1.0'); assert.strictEqual(parsed.header.compatibleVersion, '2.0.0.0');
assertSffV20Raw8(candidate, spec);

function rejected(mutator, pattern) {
  const copy = Buffer.from(candidate); mutator(copy);
  const report = validateSffV20Raw8(copy, spec);
  assert.strictEqual(report.ok, false); assert(report.errors.some(error => pattern.test(error)), report.errors.join('\n'));
}
rejected(buffer => buffer[24] = 1, /compatible version 2\.0\.0\.0/);
rejected(buffer => buffer[12] = 9, /does not recognize primary/);
rejected(buffer => buffer[76] = 1, /comment area/);
rejected(buffer => buffer.writeUInt32LE(511, 44), /intrudes into the 512-byte/);
rejected(buffer => buffer.writeUInt32LE(0xffffffff, 48), /declares .* palettes/);
rejected(buffer => buffer.writeUInt32LE(buffer.length, 52), /overlap|outside|LData/);
rejected(buffer => { const sprite = buffer.readUInt32LE(36); buffer[sprite + 14] = 10; }, /outside raw8/);
rejected(buffer => { const sprite = buffer.readUInt32LE(36); buffer.writeUInt32LE(3, sprite + 20); }, /stores 3 bytes; expected exactly 4/);
rejected(buffer => { const sprite = buffer.readUInt32LE(36); buffer.writeUInt16LE(1, sprite + 24); }, /missing palette/);
rejected(buffer => { const sprite = buffer.readUInt32LE(36); buffer.writeUInt16LE(1, sprite + 26); }, /outside raw8|TData|outside the SFF file/);
rejected(buffer => { const palette = buffer.readUInt32LE(44); const ldata = buffer.readUInt32LE(52); buffer[ldata + 3] = 255; }, /reserved alpha byte at index 0/);
rejected(buffer => { const sprite = buffer.readUInt32LE(36); buffer.writeUInt16LE(1, sprite + 12); }, /Stored sprite .* zero link field/);
rejected(buffer => { const palette = buffer.readUInt32LE(44); buffer.writeUInt16LE(1, palette + 6); }, /Stored palette .* zero link field/);
rejected(buffer => { buffer.writeUInt32LE(buffer.readUInt32LE(56) + 1, 56); }, /outside the SFF file|exactly where TData begins/);

const linkedSpec = createSffBuildSpecificationV2({
  planId: 'v20-validator-links', selection: { targetId: 'sff-v2.0', backendId: 'ikemaker-builtin-sff-v2.0' }, archive: { identity: 'validator-links.sff' },
  logical: {
    sourceRoot: 'input',
    sprites: [
      { entryId: 'sprite:base', group: 2, number: 3, width: 2, height: 2, axisX: -4, axisY: 5, pixels: { kind: 'indexed8', decodedHash: D }, paletteEntryId: 'palette:base', source: { relativePath: 'a.png', byteHash: H, decodedHash: D } },
      { entryId: 'sprite:link', group: 2, number: 4, width: 2, height: 2, axisX: 7, axisY: -8, pixels: { kind: 'indexed8', decodedHash: D }, paletteEntryId: 'palette:link', contentLinkTargetEntryId: 'sprite:base', source: { relativePath: 'a.png', byteHash: H, decodedHash: D } }
    ],
    palettes: [
      { entryId: 'palette:base', group: 1, number: 1, colors, source: { relativePath: 'a.act', byteHash: H } },
      { entryId: 'palette:link', group: 1, number: 2, colors, contentLinkTargetEntryId: 'palette:base', source: { relativePath: 'a.act', byteHash: H } }
    ]
  },
  encodingIntent: { compression: { default: 'raw8' }, crop: { default: 'none' }, storage: { byEntryId: { 'sprite:link': 'share-identical', 'palette:link': 'share-identical' } }, paletteMode: 'embedded', backendOptions: {} }
});
const linkedCandidate = createSffV20Raw8Bytes(linkedSpec, { decodedPixelsByEntryId: { 'sprite:base': pixels, 'sprite:link': pixels } });
function rejectedLinked(mutator, pattern) {
  const copy = Buffer.from(linkedCandidate); mutator(copy);
  const report = validateSffV20Raw8(copy, linkedSpec);
  assert.strictEqual(report.ok, false); assert(report.errors.some(error => pattern.test(error)), report.errors.join('\n'));
}
rejectedLinked(buffer => { const palette = buffer.readUInt32LE(44) + 16; buffer.writeUInt16LE(1, palette + 4); }, /color count differs|must contain exactly 256/);
rejectedLinked(buffer => { const palette = buffer.readUInt32LE(44) + 16; buffer.writeUInt16LE(1, palette + 6); }, /must link backward/);
rejectedLinked(buffer => { const palette = buffer.readUInt32LE(44) + 16; buffer.writeUInt32LE(1, palette + 8); }, /zero unused data offset/);
rejectedLinked(buffer => { const sprite = buffer.readUInt32LE(36) + 28; buffer.writeUInt16LE(3, sprite + 4); }, /metadata differs/);
rejectedLinked(buffer => { const sprite = buffer.readUInt32LE(36) + 28; buffer.writeUInt16LE(1, sprite + 12); }, /must link backward/);
rejectedLinked(buffer => { const sprite = buffer.readUInt32LE(36) + 28; buffer.writeUInt32LE(1, sprite + 16); }, /zero unused data offset/);
rejectedLinked(buffer => { const sprite = buffer.readUInt32LE(36); buffer.writeUInt32LE(0, sprite + 16); }, /payload ranges overlap|not in canonical packed LData order/);

const legacyPrimary = Buffer.from(candidate); Buffer.from([0, 0, 0, 2]).copy(legacyPrimary, 12);
assert.strictEqual(parseSffV20(legacyPrimary).header.primaryVersion, '2.0.0.0', 'bounded parser reports an authentic legacy primary tuple without promoting it to canonical output');
assert.throws(() => assertSffV20Raw8(legacyPrimary, spec), /requires primary 2\.0\.1\.0/);

const v21Compatible = Buffer.from(candidate); Buffer.from([0, 1, 0, 2]).copy(v21Compatible, 24);
assert.strictEqual(validateSffV20Raw8(v21Compatible, spec).ok, false, 'shared primary bytes do not infer the v2.1 target when compatibility bytes differ');

console.log('Strict SFF v2.0 RAW8 validator rejects version, layout, format, bounds, palette, and transparency drift');
