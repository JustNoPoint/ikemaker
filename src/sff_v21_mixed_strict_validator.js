'use strict';

// Independent acceptance gate for mixed SFF v2.1 PNG8/PNG24/PNG32 output.
// It does not import the writer or the general SFF reader.

const crypto = require('crypto');
const fs = require('fs');
const { decodePng } = require('./palette_index_organizer_model');
const { inspectPreparedPng } = require('./sff_source_preparation');
const { assertSffV21Png8 } = require('./sff_v21_strict_validator');

const ID = 'ikemaker-sff-v21-mixed-png-strict';
const VERSION = 1;
const PROFILE = 'sff-v2.1-png8-png24-png32-strict-v1';
const SIGNATURE = Buffer.from('ElecbyteSpr\0', 'latin1');
const VERSION_21 = Buffer.from([0, 1, 0, 2]);
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const FORMATS = new Map([[10, { name: 'png8', depth: 8, kind: 'indexed8', colorType: 3, channels: 1 }], [11, { name: 'png24', depth: 24, kind: 'rgb24', colorType: 2, channels: 3 }], [12, { name: 'png32', depth: 32, kind: 'rgba32', colorType: 6, channels: 4 }]]);

function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function fail(message) { throw new Error(`Strict SFF v2.1 mixed PNG validation failed: ${message}`); }
function end(start, size, limit, label) { const result = start + size; if (!Number.isSafeInteger(result) || start < 0 || size < 0 || result > limit) fail(`${label} is outside the archive.`); return result; }
function resolve(rows, index, label) { const seen = new Set(); let row = rows[index]; while (row && !row.dataSize) { if (seen.has(row.index)) fail(`${label} #${index} contains a link cycle.`); seen.add(row.index); if (row.link >= row.index) fail(`${label} #${row.index} does not link backward.`); row = rows[row.link]; } if (!row) fail(`${label} #${index} has a missing link target.`); return row; }
function rgb(decoded) { const out = Buffer.alloc(decoded.width * decoded.height * 3); for (let i = 0, j = 0; i < decoded.rgba.length; i += 4) { out[j++] = decoded.rgba[i]; out[j++] = decoded.rgba[i + 1]; out[j++] = decoded.rgba[i + 2]; } return out; }

function parseHeader(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 64) fail('archive is truncated.');
  if (!bytes.subarray(0, 12).equals(SIGNATURE)) fail('signature is invalid.');
  if (!bytes.subarray(12, 16).equals(VERSION_21) || !bytes.subarray(24, 28).equals(VERSION_21)) fail('primary or compatible version is not SFF 2.1.');
  if (bytes.subarray(16, 24).some(value => value !== 0) || bytes.subarray(28, 36).some(value => value !== 0)) fail('reserved header bytes must be zero.');
  const header = { spriteTable: bytes.readUInt32LE(36), spriteCount: bytes.readUInt32LE(40), paletteTable: bytes.readUInt32LE(44), paletteCount: bytes.readUInt32LE(48), literalData: bytes.readUInt32LE(52), literalLength: bytes.readUInt32LE(56), translatedData: bytes.readUInt32LE(60) };
  end(header.paletteTable, header.paletteCount * 16, bytes.length, 'palette table'); end(header.spriteTable, header.spriteCount * 28, bytes.length, 'sprite table');
  if (header.paletteTable !== 64 || header.spriteTable !== header.paletteTable + header.paletteCount * 16 || header.literalData !== header.spriteTable + header.spriteCount * 28) fail('canonical tables must be contiguous and must not overlap.');
  if (header.literalData < 64 || end(header.literalData, header.literalLength, bytes.length, 'literal-data section') !== bytes.length || header.translatedData !== bytes.length) fail('canonical data-section offsets or archive length are invalid.');
  return header;
}

function parsePalettes(bytes, header) {
  const rows = [];
  for (let index = 0; index < header.paletteCount; index += 1) {
    const at = header.paletteTable + index * 16, row = { index, group: bytes.readUInt16LE(at), number: bytes.readUInt16LE(at + 2), colors: bytes.readUInt16LE(at + 4), link: bytes.readUInt16LE(at + 6), relativeOffset: bytes.readUInt32LE(at + 8), dataSize: bytes.readUInt32LE(at + 12) };
    if (row.colors !== 256) fail(`palette #${index} does not declare 256 colors.`);
    if (row.dataSize) { if (row.link || row.dataSize !== 1024) fail(`stored palette #${index} has invalid storage metadata.`); const start = header.literalData + row.relativeOffset, stop = end(start, row.dataSize, header.literalData + header.literalLength, `palette #${index}`); row.rgbaHash = sha(bytes.subarray(start, stop)); row.dataOffset = start; row.dataRange = { start, end: stop }; row.colorsRgba = Array.from({ length: 256 }, (_, color) => [...bytes.subarray(start + color * 4, start + color * 4 + 4)]); }
    else if (row.relativeOffset) fail(`linked palette #${index} has a nonzero data offset.`);
    rows.push(row);
  }
  rows.forEach(row => { if (!row.dataSize) row.rgbaHash = resolve(rows, row.index, 'palette').rgbaHash; });
  return rows;
}

function parseSprites(bytes, header, palettes, limits) {
  const rows = []; let totalPixels = 0;
  for (let index = 0; index < header.spriteCount; index += 1) {
    const at = header.spriteTable + index * 28, row = { index, group: bytes.readUInt16LE(at), number: bytes.readUInt16LE(at + 2), width: bytes.readUInt16LE(at + 4), height: bytes.readUInt16LE(at + 6), axisX: bytes.readInt16LE(at + 8), axisY: bytes.readInt16LE(at + 10), link: bytes.readUInt16LE(at + 12), format: bytes[at + 14], colorDepth: bytes[at + 15], relativeOffset: bytes.readUInt32LE(at + 16), dataSize: bytes.readUInt32LE(at + 20), paletteIndex: bytes.readUInt16LE(at + 24), flags: bytes.readUInt16LE(at + 26) };
    const profile = FORMATS.get(row.format); if (!profile || row.colorDepth !== profile.depth) fail(`sprite #${index} has unsupported format/depth ${row.format}/${row.colorDepth}.`);
    if (!row.width || !row.height || row.flags) fail(`sprite #${index} has invalid dimensions or flags.`);
    if (row.format === 10 && row.paletteIndex >= palettes.length) fail(`indexed sprite #${index} assigns a missing palette.`);
    if (row.width * row.height > limits.decodedPixels) fail(`sprite #${index} exceeds the decoded pixel limit.`);
    if (row.dataSize) {
      if (row.link || row.dataSize < 12) fail(`stored sprite #${index} has invalid storage metadata.`);
      const start = header.literalData + row.relativeOffset, stop = end(start, row.dataSize, header.literalData + header.literalLength, `sprite #${index}`), declared = bytes.readUInt32LE(start), png = bytes.subarray(start + 4, stop);
      if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) fail(`sprite #${index} has no embedded PNG.`);
      let info, decoded; try { info = inspectPreparedPng(png, `sprite #${index}`); decoded = decodePng(png, { maximumPixels: limits.decodedPixels, maximumDimension: 65535 }); } catch (error) { fail(`sprite #${index} PNG is invalid: ${error.message}`); }
      if (info.colorType !== profile.colorType || info.bitDepth !== 8 || decoded.width !== row.width || decoded.height !== row.height) fail(`sprite #${index} PNG type, depth, or dimensions differ from its header.`);
      const pixels = row.format === 11 ? rgb(decoded) : row.format === 12 ? decoded.rgba : (() => { const indexed = require('./sff_png8_source').readIndexedPng8(png); return indexed.indices || indexed.pixels; })();
      if (!Buffer.isBuffer(pixels)) fail(`sprite #${index} indexed decoder did not return pixels.`);
      if (declared !== pixels.length) fail(`sprite #${index} declares ${declared} decoded bytes; expected ${pixels.length}.`);
      row.decodedHash = sha(pixels); row.decodedIndexHash = row.format === 10 ? row.decodedHash : null; row.decodedPixelHash = row.format === 10 ? null : row.decodedHash; row.pixelKind = profile.kind; row.dataOffset = start; row.dataRange = { start, end: stop }; totalPixels += row.width * row.height;
      if (!Number.isSafeInteger(totalPixels) || totalPixels > limits.decodedPixelsTotal) fail('aggregate decoded pixel limit exceeded.');
    } else if (row.relativeOffset) fail(`linked sprite #${index} has a nonzero data offset.`);
    rows.push(row);
  }
  rows.forEach(row => { if (!row.dataSize) { const owner = resolve(rows, row.index, 'sprite'); if (owner.format !== row.format || owner.colorDepth !== row.colorDepth || owner.width !== row.width || owner.height !== row.height) fail(`linked sprite #${row.index} metadata differs from its owner.`); row.decodedHash = owner.decodedHash; row.decodedIndexHash = owner.decodedIndexHash; row.decodedPixelHash = owner.decodedPixelHash; row.pixelKind = owner.pixelKind; } });
  return rows;
}

function validateSpecification(spec, sprites, palettes) {
  if (!spec || !Array.isArray(spec.sprites) || !Array.isArray(spec.palettes)) fail('reviewed specification is required.');
  if (sprites.length !== spec.sprites.length || palettes.length !== spec.palettes.length) fail('physical sprite or palette count differs from review.');
  const spriteIds = new Map(spec.sprites.map((row, index) => [row.entryId, index])), paletteIds = new Map(spec.palettes.map((row, index) => [row.entryId, index]));
  spec.sprites.forEach((expected, index) => {
    const actual = sprites[index], format = String(expected.format || '').toLowerCase(), profile = [...FORMATS.values()].find(row => row.name === format);
    if (!profile || String(expected.compression).toLowerCase() !== format || Number(expected.colorDepth) !== profile.depth) fail(`reviewed sprite ${expected.entryId} has an unsupported encoding.`);
    if (actual.group !== Number(expected.group) || actual.number !== Number(expected.number) || actual.axisX !== Number(expected.axisX) || actual.axisY !== Number(expected.axisY) || actual.width !== Number(expected.source?.width) || actual.height !== Number(expected.source?.height) || actual.format !== [...FORMATS].find(([, value]) => value.name === format)[0]) fail(`sprite ${expected.entryId} metadata differs from review.`);
    if (actual.decodedHash !== String(expected.source?.decodedHash || '').toLowerCase()) fail(`sprite ${expected.entryId} decoded ${profile.kind} pixels differ from review.`);
    const link = expected.linkTargetEntryId ? spriteIds.get(expected.linkTargetEntryId) : null; if ((link == null) !== Boolean(actual.dataSize) || link != null && actual.link !== link) fail(`sprite ${expected.entryId} link policy differs from review.`);
    if (format === 'png8') { const wanted = paletteIds.has(expected.paletteId) ? paletteIds.get(expected.paletteId) : spec.palettes.findIndex(row => `${row.group},${row.number}` === String(expected.paletteId).replace(/\s+/g, '')); if (actual.paletteIndex !== wanted) fail(`sprite ${expected.entryId} palette assignment differs from review.`); }
  });
  spec.palettes.forEach((expected, index) => { const actual = palettes[index], wantedHash = sha(Buffer.from(expected.colors.flat())); if (actual.group !== Number(expected.group) || actual.number !== Number(expected.number) || actual.rgbaHash !== wantedHash) fail(`palette ${expected.entryId} differs from review.`); const link = expected.linkTargetEntryId ? paletteIds.get(expected.linkTargetEntryId) : null; if ((link == null) !== Boolean(actual.dataSize) || link != null && actual.link !== link) fail(`palette ${expected.entryId} link policy differs from review.`); });
}

function assertSffV21Mixed(input, specification, options = {}) {
  const bytes = Buffer.isBuffer(input) ? Buffer.from(input) : typeof input === 'string' ? fs.readFileSync(input) : Buffer.from(input || []);
  if (specification?.sprites?.every(row => String(row.format).toLowerCase() === 'png8')) return assertSffV21Png8(bytes, specification, options);
  // Structural reopen checks have no specification. Preserve the historical
  // indexed report exactly, including its hashes and external compatibility.
  if (!specification && bytes.length >= 64) {
    const table = bytes.readUInt32LE(36), count = bytes.readUInt32LE(40);
    if (table >= 64 && table + count * 28 <= bytes.length && Array.from({ length: count }, (_, index) => bytes[table + index * 28 + 14]).every(format => format === 10)) return assertSffV21Png8(input, null, options);
  }
  if (options.compatibilityProfile && options.compatibilityProfile !== 'canonical') fail('mixed PNG validation currently accepts canonical native archives only.');
  const limits = { sprites: 1000000, palettes: 65536, decodedPixels: 100000000, decodedPixelsTotal: 100000000, ...(options.limits || {}) };
  const header = parseHeader(bytes);
  if (header.spriteCount > limits.sprites || header.paletteCount > limits.palettes) fail('sprite or palette count exceeds the configured limit.');
  const palettes = parsePalettes(bytes, header), sprites = parseSprites(bytes, header, palettes, limits);
  const ranges = [...palettes, ...sprites].map(row => row.dataRange).filter(Boolean).sort((a, b) => a.start - b.start);
  let cursor = header.literalData;
  for (const range of ranges) { if (range.start !== cursor) fail('stored data blocks overlap or leave unreviewed gaps.'); cursor = range.end; }
  if (cursor !== bytes.length) fail('stored data blocks do not cover the literal-data section.');
  if (specification) validateSpecification(specification, sprites, palettes);
  return { ok: true, kind: 'sff-v2.1-mixed-png', profile: PROFILE, compatibilityProfile: 'canonical', header, sprites, palettes, evidence: { archiveByteHash: sha(bytes), spriteCount: sprites.length, paletteCount: palettes.length }, physicalOrder: sprites.map(row => ({ index: row.index, group: row.group, number: row.number, pixelKind: row.pixelKind, decodedHash: row.decodedHash })) };
}

module.exports = { SFF_V21_MIXED_VALIDATOR_ID: ID, SFF_V21_MIXED_VALIDATOR_VERSION: VERSION, SFF_V21_MIXED_VALIDATOR_PROFILE: PROFILE, FORMAT_PNG8: 10, FORMAT_PNG24: 11, FORMAT_PNG32: 12, assertSffV21Mixed };
