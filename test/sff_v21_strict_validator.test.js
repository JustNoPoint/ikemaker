'use strict';

const assert = require('assert');
const crypto = require('crypto');
const zlib = require('zlib');
const {
  crc32,
  validateSffV21Png8,
  assertSffV21Png8
} = require('../src/sff_v21_strict_validator');

// These generated archives are structural fixtures. They prove rejection and
// reconstruction behavior, not byte parity with SprMake2 or runtime acceptance.

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function chunk(type, data) {
  const name = Buffer.from(type, 'ascii'), result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0); name.copy(result, 4); data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return result;
}

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function filteredRows(pixels, width, height, filters) {
  const rows = Buffer.alloc(height * (width + 1));
  let target = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = filters[y % filters.length]; rows[target++] = filter;
    for (let x = 0; x < width; x += 1) {
      const at = y * width + x, value = pixels[at], left = x ? pixels[at - 1] : 0, up = y ? pixels[at - width] : 0, upperLeft = x && y ? pixels[at - width - 1] : 0;
      const prediction = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? paeth(left, up, upperLeft) : 0;
      rows[target++] = (value - prediction) & 0xff;
    }
  }
  return rows;
}

function indexedPng(width, height, pixels, options = {}) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = options.bitDepth ?? 8; ihdr[9] = options.colorType ?? 3; ihdr[12] = options.interlace ?? 0;
  const plte = Buffer.alloc(768); for (let index = 0; index < 256; index += 1) { plte[index * 3] = index; plte[index * 3 + 1] = 255 - index; plte[index * 3 + 2] = index ^ 0x55; }
  const raw = filteredRows(pixels, width, height, options.filters || [0, 1, 2, 3, 4]);
  const compressed = options.compressed || zlib.deflateSync(raw);
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

function rgbaPalette() {
  return Array.from({ length: 256 }, (_, index) => [index, 255 - index, index ^ 0x55, index === 0 ? 0 : 255]);
}

function structuralFixture(options = {}) {
  const width = 3, height = 5, pixels = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  const png = options.png || indexedPng(width, height, pixels, options.pngOptions);
  const payload = Buffer.alloc(4 + png.length); payload.writeUInt32LE(width * height, 0); png.copy(payload, 4);
  const paletteTable = 64, paletteCount = options.linkedPalette ? 2 : 1, spriteTable = paletteTable + paletteCount * 16, literal = spriteTable + 56;
  const paletteBytes = Buffer.from(rgbaPalette().flat());
  const literalData = Buffer.concat([paletteBytes, payload]);
  const buffer = Buffer.alloc(literal + literalData.length);
  Buffer.from('ElecbyteSpr\0', 'latin1').copy(buffer, 0);
  Buffer.from([0, 1, 0, 2]).copy(buffer, 12);
  Buffer.from([0, 1, 0, 2]).copy(buffer, 24);
  buffer.writeUInt32LE(spriteTable, 36); buffer.writeUInt32LE(2, 40);
  buffer.writeUInt32LE(paletteTable, 44); buffer.writeUInt32LE(paletteCount, 48);
  buffer.writeUInt32LE(literal, 52); buffer.writeUInt32LE(literalData.length, 56); buffer.writeUInt32LE(buffer.length, 60);
  buffer.writeUInt16LE(1, paletteTable); buffer.writeUInt16LE(1, paletteTable + 2); buffer.writeUInt16LE(256, paletteTable + 4); buffer.writeUInt16LE(0, paletteTable + 6); buffer.writeUInt32LE(0, paletteTable + 8); buffer.writeUInt32LE(1024, paletteTable + 12);
  if (options.linkedPalette) {
    const alias = paletteTable + 16; buffer.writeUInt16LE(1, alias); buffer.writeUInt16LE(2, alias + 2); buffer.writeUInt16LE(256, alias + 4); buffer.writeUInt16LE(0, alias + 6);
  }
  buffer.writeUInt16LE(10, spriteTable); buffer.writeUInt16LE(0, spriteTable + 2); buffer.writeUInt16LE(width, spriteTable + 4); buffer.writeUInt16LE(height, spriteTable + 6); buffer.writeInt16LE(-2, spriteTable + 8); buffer.writeInt16LE(7, spriteTable + 10); buffer.writeUInt16LE(0, spriteTable + 12); buffer[spriteTable + 14] = 10; buffer[spriteTable + 15] = 8; buffer.writeUInt32LE(1024, spriteTable + 16); buffer.writeUInt32LE(payload.length, spriteTable + 20); buffer.writeUInt16LE(0, spriteTable + 24); buffer.writeUInt16LE(0, spriteTable + 26);
  const linked = spriteTable + 28;
  buffer.writeUInt16LE(10, linked); buffer.writeUInt16LE(1, linked + 2); buffer.writeUInt16LE(width, linked + 4); buffer.writeUInt16LE(height, linked + 6); buffer.writeInt16LE(1, linked + 8); buffer.writeInt16LE(-3, linked + 10); buffer.writeUInt16LE(0, linked + 12); buffer[linked + 14] = 10; buffer[linked + 15] = 8; buffer.writeUInt16LE(0, linked + 24);
  literalData.copy(buffer, literal);
  return { buffer, pixels, pngOffset: literal + 1024 + 4, paletteOffset: literal, spriteTable, paletteTable };
}

function reviewedSpecification(pixels, colors = rgbaPalette(), linkedPalette = false) {
  const decodedHash = sha256(pixels);
  return {
    target: { sffVersion: '2.1' },
    sprites: [
      { entryId: 'sprite:0', group: 10, number: 0, axisX: -2, axisY: 7, colorDepth: 8, format: 'png8', compression: 'png8', paletteId: 'palette:1,1', crop: { mode: 'none', axisDeltaX: 0, axisDeltaY: 0 }, source: { width: 3, height: 5, decodedHash } },
      { entryId: 'sprite:1', group: 10, number: 1, axisX: 1, axisY: -3, colorDepth: 8, format: 'png8', compression: 'png8', paletteId: '1,1', linkTargetEntryId: 'sprite:0', crop: { mode: 'none', axisDeltaX: 0, axisDeltaY: 0 }, source: { width: 3, height: 5, decodedHash } }
    ],
    palettes: [
      { entryId: 'palette:1,1', group: 1, number: 1, tableOrder: 'sff', colors },
      ...(linkedPalette ? [{ entryId: 'palette:1,2', group: 1, number: 2, tableOrder: 'sff', colors, linkTargetEntryId: 'palette:1,1' }] : [])
    ]
  };
}

function changed(source, mutate) { const copy = Buffer.from(source); mutate(copy); return copy; }
function fails(buffer, pattern, specification = null) {
  const report = validateSffV21Png8(buffer, specification);
  assert.strictEqual(report.ok, false, 'malformed structural fixture must fail closed');
  assert.match(report.errors.join('; '), pattern);
}

const fixture = structuralFixture(), specification = reviewedSpecification(fixture.pixels);
const report = assertSffV21Png8(fixture.buffer, specification);
assert.strictEqual(report.evidence, 'structural-validation');
assert.strictEqual(report.compatibilityProfile, 'canonical');
assert.deepStrictEqual(report.physicalOrder.map((entry) => `${entry.group},${entry.number}`), ['10,0', '10,1']);
assert.strictEqual(report.sprites[0].axisX, -2);
assert.strictEqual(report.sprites[1].axisY, -3);
assert.strictEqual(report.sprites[0].decodedIndexHash, sha256(fixture.pixels), 'all PNG filters must reconstruct exact palette indices');
assert.strictEqual(report.sprites[1].decodedIndexHash, report.sprites[0].decodedIndexHash, 'linked sprites must inherit exact decoded bytes');
const linkedPaletteFixture = structuralFixture({ linkedPalette: true });
const linkedPaletteReport = assertSffV21Png8(linkedPaletteFixture.buffer, reviewedSpecification(linkedPaletteFixture.pixels, rgbaPalette(), true));
assert.strictEqual(linkedPaletteReport.palettes[1].link, 0);
assert.strictEqual(linkedPaletteReport.palettes[1].dataSize, 0);

fails(changed(fixture.buffer, buffer => { buffer[0] ^= 1; }), /signature/);
fails(changed(fixture.buffer, buffer => { buffer[13] = 0; }), /requires SFF v2\.1/);
fails(changed(fixture.buffer, buffer => { buffer[16] = 1; }), /reserved header/);
fails(changed(fixture.buffer, buffer => { buffer[25] = 0; }), /compatible-version/);
fails(changed(fixture.buffer, buffer => { buffer.writeUInt32LE(64, 36); }), /overlaps/);
fails(changed(fixture.buffer, buffer => { buffer.writeUInt32LE(0xffffffff, 40); }), /strict limit/);
fails(changed(fixture.buffer, buffer => { buffer.writeUInt32LE(65537, 48); }), /strict limit/);
fails(changed(fixture.buffer, buffer => { buffer.writeUInt32LE(0, fixture.spriteTable + 16); }), /stored SFF data blocks overlap/);
fails(changed(fixture.buffer, buffer => { buffer.writeUInt32LE(1, fixture.spriteTable + 28 + 16); }), /nonzero unused data offset/);
fails(changed(fixture.buffer, buffer => { buffer.writeUInt16LE(1, fixture.spriteTable + 28 + 26); }), /nonzero unused data flags/);
fails(changed(fixture.buffer, buffer => { buffer[fixture.spriteTable + 14] = 11; }), /unsupported format/);
fails(changed(fixture.buffer, buffer => { buffer[fixture.spriteTable + 15] = 24; }), /unsupported color depth/);
fails(changed(fixture.buffer, buffer => { buffer.writeUInt16LE(9, fixture.spriteTable + 24); }), /missing palette/);

const linkCycle = changed(fixture.buffer, buffer => {
  buffer.writeUInt32LE(0, fixture.spriteTable + 16); buffer.writeUInt32LE(0, fixture.spriteTable + 20); buffer.writeUInt16LE(1, fixture.spriteTable + 12);
  buffer.writeUInt16LE(0, fixture.spriteTable + 28 + 12);
});
fails(linkCycle, /link cycle/);
fails(changed(linkedPaletteFixture.buffer, buffer => { buffer.writeUInt32LE(1, linkedPaletteFixture.paletteTable + 16 + 8); }), /nonzero unused data offset/);
fails(changed(linkedPaletteFixture.buffer, buffer => { buffer.writeUInt16LE(1, linkedPaletteFixture.paletteTable + 16 + 2); }), /duplicates physical palette identity/);

const trailingSection = Buffer.concat([fixture.buffer, Buffer.from([0])]);
fails(trailingSection, /translated-data section has unreferenced bytes/);
const literalGap = Buffer.concat([fixture.buffer, Buffer.from([0])]); literalGap.writeUInt32LE(fixture.buffer.readUInt32LE(56) + 1, 56); literalGap.writeUInt32LE(literalGap.length, 60);
fails(literalGap, /literal-data section has unreferenced bytes/);
const aggregateReport = validateSffV21Png8(fixture.buffer, null, { limits: { decodedPixelsTotal: 14 } });
assert.strictEqual(aggregateReport.ok, false); assert.match(aggregateReport.errors.join('; '), /aggregate limit is 14/);

const padded = Buffer.concat([fixture.buffer.subarray(0, 64), Buffer.alloc(16), fixture.buffer.subarray(64)]);
for (const offset of [36, 44, 52, 60]) padded.writeUInt32LE(fixture.buffer.readUInt32LE(offset) + 16, offset);
assert.strictEqual(validateSffV21Png8(padded, specification).ok, false, 'canonical validation rejects even zero-filled layout gaps');
const paddedCompatibility = assertSffV21Png8(padded, specification, { compatibilityProfile: 'sprmake2-v2.1' });
assert.strictEqual(paddedCompatibility.compatibilityProfile, 'sprmake2-v2.1');
const nonzeroPadding = Buffer.from(padded); nonzeroPadding[70] = 1;
const nonzeroPaddingReport = validateSffV21Png8(nonzeroPadding, specification, { compatibilityProfile: 'sprmake2-v2.1' });
assert.strictEqual(nonzeroPaddingReport.ok, false); assert.match(nonzeroPaddingReport.errors.join('; '), /compatibility padding must be zero/);
const compatibleLinkedOffset = changed(fixture.buffer, buffer => { buffer.writeUInt32LE(1024, fixture.spriteTable + 28 + 16); });
assertSffV21Png8(compatibleLinkedOffset, specification, { compatibilityProfile: 'sprmake2-v2.1' });
const unknownCompatibility = validateSffV21Png8(fixture.buffer, specification, { compatibilityProfile: 'unknown' });
assert.strictEqual(unknownCompatibility.ok, false); assert.match(unknownCompatibility.errors.join('; '), /Unknown SFF compatibility profile/);

fails(changed(fixture.buffer, buffer => { buffer[fixture.pngOffset] ^= 1; }), /PNG signature/);
fails(changed(fixture.buffer, buffer => { buffer.writeUInt32BE(0xffffffff, fixture.pngOffset + 8); }), /range .* exceeds/);
fails(changed(fixture.buffer, buffer => { buffer[fixture.pngOffset + 8 + 8] ^= 1; }), /CRC/);
fails(structuralFixture({ pngOptions: { colorType: 6 } }).buffer, /indexed color type 3/);
fails(structuralFixture({ pngOptions: { interlace: 1 } }).buffer, /noninterlaced/);
fails(structuralFixture({ pngOptions: { compressed: Buffer.from([1, 2, 3]) } }).buffer, /deflate stream is invalid/);
fails(structuralFixture({ pngOptions: { filters: [5] } }).buffer, /unsupported filter 5/);
const basePng = indexedPng(3, 5, fixture.pixels), beforeIdat = 8 + 25 + 780;
const duplicateTrnsPng = Buffer.concat([basePng.subarray(0, beforeIdat), chunk('tRNS', Buffer.alloc(0)), chunk('tRNS', Buffer.alloc(0)), basePng.subarray(beforeIdat)]);
fails(structuralFixture({ png: duplicateTrnsPng }).buffer, /tRNS is duplicated/);
const reservedBitPng = Buffer.concat([basePng.subarray(0, beforeIdat), chunk('abca', Buffer.alloc(0)), basePng.subarray(beforeIdat)]);
fails(structuralFixture({ png: reservedBitPng }).buffer, /reserved lowercase third type letter/);

const reversed = reviewedSpecification(fixture.pixels);
reversed.sprites = [...reversed.sprites].reverse();
fails(fixture.buffer, /physical sprite #0/, reversed);
const wrongHash = reviewedSpecification(fixture.pixels); wrongHash.sprites[0].source.decodedHash = '00'.repeat(32);
fails(fixture.buffer, /decoded index hash/, wrongHash);
const wrongAxes = reviewedSpecification(fixture.pixels); wrongAxes.sprites[0].axisX = 99;
fails(fixture.buffer, /axes/, wrongAxes);
const wrongCompression = reviewedSpecification(fixture.pixels); wrongCompression.sprites[0].compression = 'lz5';
fails(fixture.buffer, /outside the strict PNG8\/PNG8\/depth-8 profile/, wrongCompression);
const wrongCrop = reviewedSpecification(fixture.pixels); wrongCrop.sprites[0].crop.mode = 'autocrop';
fails(fixture.buffer, /unsupported crop mode autocrop/, wrongCrop);
const missingDecodedHash = reviewedSpecification(fixture.pixels); delete missingDecodedHash.sprites[0].source.decodedHash;
fails(fixture.buffer, /lacks a reviewed decoded index hash/, missingDecodedHash);
const duplicateSpriteEntry = reviewedSpecification(fixture.pixels); duplicateSpriteEntry.sprites[1].entryId = duplicateSpriteEntry.sprites[0].entryId;
fails(fixture.buffer, /entryId .* duplicated/, duplicateSpriteEntry);
const wrongPalette = rgbaPalette(); wrongPalette[42] = [1, 2, 3, 4];
fails(fixture.buffer, /RGBA differs at index 42/, reviewedSpecification(fixture.pixels, wrongPalette));
const wrongTableOrder = reviewedSpecification(fixture.pixels); wrongTableOrder.palettes[0].tableOrder = 'reversed';
fails(fixture.buffer, /not normalized to SFF index order/, wrongTableOrder);
const wrongPolicy = reviewedSpecification(fixture.pixels); delete wrongPolicy.sprites[1].linkTargetEntryId;
fails(fixture.buffer, /reviewed policy requires independent data/, wrongPolicy);
const wrongPalettePolicy = reviewedSpecification(linkedPaletteFixture.pixels, rgbaPalette(), true); delete wrongPalettePolicy.palettes[1].linkTargetEntryId;
fails(linkedPaletteFixture.buffer, /independent RGBA data/, wrongPalettePolicy);

console.log('strict SFF v2.1 PNG8 structural validator tests passed (synthetic structural evidence; not SprMake2 parity evidence)');
