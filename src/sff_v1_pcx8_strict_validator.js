'use strict';

const crypto = require('crypto');
const { assertSffBuildSpecificationV2 } = require('./sff_build_specification_v2');
const SIGNATURE = Buffer.from('ElecbyteSpr\0', 'latin1');
const VERSION_1010 = Buffer.from([0, 1, 0, 1]);
const HEADER_SIZE = 512;
const SUBHEADER_SIZE = 32;

const SFF_V1_PCX8_VALIDATOR_ID = 'ikemaker-sff-v1-pcx8-strict';
const SFF_V1_PCX8_VALIDATOR_VERSION = 1;
const SFF_V1_PCX8_VALIDATOR_PROFILE = 'sff-v1.01-pcx8-individual-successive-strict-v1';
const DEFAULT_LIMITS = Object.freeze({ sprites: 1000000, decodedPixels: 100000000, decodedPixelsTotal: 100000000, archiveBytes: 0xffffffff });

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function zeroes(buffer, start, end, label) { for (let at = start; at < end; at += 1) if (buffer[at] !== 0) throw new Error(`${label} must be zero; byte ${at} is ${buffer[at]}.`); }
function range(start, size, maximum, label) {
  const end = start + size;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(size) || start < 0 || size < 0 || !Number.isSafeInteger(end) || end < start || end > maximum) throw new Error(`${label} is outside the SFF file.`);
  return end;
}
function canonicalRle(buffer) {
  const chunks = [];
  for (let at = 0; at < buffer.length;) {
    const value = buffer[at]; let run = 1;
    while (at + run < buffer.length && buffer[at + run] === value && run < 63) run += 1;
    chunks.push(run > 1 || value >= 0xc0 ? Buffer.from([0xc0 | run, value]) : Buffer.from([value])); at += run;
  }
  return Buffer.concat(chunks);
}
function decodeRleRows(buffer, start, end, bytesPerLine, height, label) {
  const expected = bytesPerLine * height, output = Buffer.alloc(expected); let source = start;
  for (let row = 0; row < height; row += 1) {
    let target = row * bytesPerLine, remaining = bytesPerLine;
    while (remaining > 0) {
      if (source >= end) throw new Error(`${label} ends before PCX row ${row} is complete.`);
      const token = buffer[source++]; let count = 1, value = token;
      if ((token & 0xc0) === 0xc0) {
        count = token & 0x3f; if (!count) throw new Error(`${label} contains a zero-length PCX run.`);
        if (source >= end) throw new Error(`${label} ends inside a PCX run.`); value = buffer[source++];
      }
      if (count > remaining) throw new Error(`${label} PCX run crosses row ${row}.`);
      output.fill(value, target, target + count); target += count; remaining -= count;
    }
  }
  if (source !== end) throw new Error(`${label} has trailing compressed bytes.`);
  return output;
}
function parseStoredPcx(buffer, row, previousPalette, limits) {
  const start = row.headerOffset + SUBHEADER_SIZE, physicalLength = row.nextOffset - start;
  const expectedPhysical = row.declaredLength - (row.paletteSame ? 768 : 0);
  if (row.declaredLength < 897 || expectedPhysical !== physicalLength) throw new Error(`sprite #${row.index} declared PCX length does not match the canonical ${row.paletteSame ? 'omitted-palette' : 'own-palette'} layout.`);
  range(start, physicalLength, buffer.length, `sprite #${row.index} PCX`);
  if (buffer[start] !== 0x0a || buffer[start + 1] !== 5 || buffer[start + 2] !== 1 || buffer[start + 3] !== 8) throw new Error(`sprite #${row.index} has unsupported PCX manufacturer/version/encoding/depth.`);
  const xmin = buffer.readUInt16LE(start + 4), ymin = buffer.readUInt16LE(start + 6), xmax = buffer.readUInt16LE(start + 8), ymax = buffer.readUInt16LE(start + 10);
  if (xmin !== 0 || ymin !== 0 || xmax < xmin || ymax < ymin) throw new Error(`sprite #${row.index} has noncanonical PCX coordinates.`);
  row.width = xmax + 1; row.height = ymax + 1;
  if (buffer.readUInt16LE(start + 12) !== row.width || buffer.readUInt16LE(start + 14) !== row.height) throw new Error(`sprite #${row.index} has noncanonical PCX DPI fields.`);
  zeroes(buffer, start + 16, start + 65, `sprite #${row.index} PCX reserved/header palette bytes`);
  if (buffer[start + 65] !== 1) throw new Error(`sprite #${row.index} PCX must use one plane.`);
  const bytesPerLine = buffer.readUInt16LE(start + 66), expectedStride = row.width + (row.width & 1);
  if (bytesPerLine !== expectedStride || bytesPerLine < row.width) throw new Error(`sprite #${row.index} has noncanonical PCX bytesPerLine.`);
  if (buffer.readUInt16LE(start + 68) !== 1) throw new Error(`sprite #${row.index} PCX paletteInfo must be 1.`);
  zeroes(buffer, start + 70, start + 128, `sprite #${row.index} PCX reserved tail`);
  const decodedLength = bytesPerLine * row.height;
  if (!Number.isSafeInteger(decodedLength) || decodedLength > limits.decodedPixels + row.height) throw new Error(`sprite #${row.index} decoded PCX size exceeds the configured limit.`);
  const marker = row.paletteSame ? row.nextOffset - 1 : row.nextOffset - 769;
  if (marker < start + 128 || buffer[marker] !== 0x0c) throw new Error(`sprite #${row.index} has a missing or misplaced PCX palette marker.`);
  const decodedRows = decodeRleRows(buffer, start + 128, marker, bytesPerLine, row.height, `sprite #${row.index}`);
  const canonical = Buffer.concat(Array.from({ length: row.height }, (_, y) => canonicalRle(decodedRows.subarray(y * bytesPerLine, (y + 1) * bytesPerLine))));
  if (!canonical.equals(buffer.subarray(start + 128, marker))) throw new Error(`sprite #${row.index} PCX RLE is valid but not canonical.`);
  const indexes = Buffer.alloc(row.width * row.height);
  for (let y = 0; y < row.height; y += 1) decodedRows.copy(indexes, y * row.width, y * bytesPerLine, y * bytesPerLine + row.width);
  for (let y = 0; y < row.height; y += 1) for (let x = row.width; x < bytesPerLine; x += 1) if (decodedRows[y * bytesPerLine + x] !== 0) throw new Error(`sprite #${row.index} PCX row padding must use index 0.`);
  let paletteRgb;
  if (row.paletteSame) {
    if (!previousPalette) throw new Error(`sprite #${row.index} cannot reuse a palette before one is stored.`);
    paletteRgb = previousPalette;
  } else paletteRgb = Buffer.from(buffer.subarray(marker + 1, marker + 769));
  row.bytesPerLine = bytesPerLine; row.decodedIndexes = indexes; row.decodedIndexHash = sha256(indexes); row.effectivePaletteRgb = Buffer.from(paletteRgb); row.paletteRgbHash = sha256(paletteRgb);
}

function parseSffV1Pcx8(buffer, options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) };
  if (!Buffer.isBuffer(buffer)) throw new Error('SFF bytes must be a Buffer.');
  if (buffer.length < HEADER_SIZE) throw new Error('SFF v1.01 header is truncated.');
  if (buffer.length > limits.archiveBytes) throw new Error('SFF archive exceeds the configured byte limit.');
  if (!buffer.subarray(0, 12).equals(SIGNATURE)) throw new Error('SFF signature is not ElecbyteSpr\\0.');
  if (!buffer.subarray(12, 16).equals(VERSION_1010)) throw new Error('Strict SFF v1.01 profile requires version 1.0.1.0.');
  const groupCount = buffer.readUInt32LE(16), spriteCount = buffer.readUInt32LE(20), firstOffset = buffer.readUInt32LE(24), subheaderSize = buffer.readUInt32LE(28), paletteType = buffer[32];
  if (spriteCount > limits.sprites) throw new Error(`SFF declares ${spriteCount} sprites; limit is ${limits.sprites}.`);
  if (firstOffset !== HEADER_SIZE || subheaderSize !== SUBHEADER_SIZE || paletteType !== 0) throw new Error('Strict profile requires first subheader 512, size 32, and individual palette type 0.');
  zeroes(buffer, 33, HEADER_SIZE, 'canonical SFF v1.01 reserved/comment area');
  const sprites = []; let cursor = HEADER_SIZE, previousPalette = null, decodedPixelsTotal = 0;
  for (let index = 0; index < spriteCount; index += 1) {
    range(cursor, SUBHEADER_SIZE, buffer.length, `sprite #${index} subheader`);
    const row = { index, headerOffset: cursor, nextOffset: buffer.readUInt32LE(cursor), declaredLength: buffer.readUInt32LE(cursor + 4), axisX: buffer.readInt16LE(cursor + 8), axisY: buffer.readInt16LE(cursor + 10), group: buffer.readUInt16LE(cursor + 12), number: buffer.readUInt16LE(cursor + 14), link: buffer.readUInt16LE(cursor + 16), paletteSame: buffer[cursor + 18] !== 0 };
    if (buffer[cursor + 18] > 1) throw new Error(`sprite #${index} paletteSame must be 0 or 1.`);
    zeroes(buffer, cursor + 19, cursor + 32, `sprite #${index} reserved bytes`);
    if (row.nextOffset <= cursor || row.nextOffset > buffer.length) throw new Error(`sprite #${index} has a non-forward or out-of-range next offset.`);
    if (row.declaredLength === 0) {
      if (row.nextOffset !== cursor + SUBHEADER_SIZE) throw new Error(`linked sprite #${index} must have no physical payload.`);
      if (!row.paletteSame) throw new Error(`linked sprite #${index} must set paletteSame=1.`);
      if (row.link >= index) throw new Error(`linked sprite #${index} must target an earlier stored sprite.`);
      const owner = sprites[row.link]; if (!owner || owner.declaredLength === 0) throw new Error(`linked sprite #${index} cannot target a linked row.`);
      if (!previousPalette || !owner.effectivePaletteRgb.equals(previousPalette)) throw new Error(`linked sprite #${index} palette is ambiguous or differs from the previous effective palette.`);
      row.width = owner.width; row.height = owner.height; row.decodedIndexes = owner.decodedIndexes; row.decodedIndexHash = owner.decodedIndexHash; row.effectivePaletteRgb = Buffer.from(previousPalette); row.paletteRgbHash = sha256(previousPalette);
    } else {
      if (row.link !== 0) throw new Error(`stored sprite #${index} must have link field 0.`);
      if (index === 0 && row.paletteSame) throw new Error('the first stored sprite must own a palette.');
      parseStoredPcx(buffer, row, previousPalette, limits);
    }
    const pixelCount = row.width * row.height; decodedPixelsTotal += pixelCount;
    if (!Number.isSafeInteger(pixelCount) || pixelCount > limits.decodedPixels || !Number.isSafeInteger(decodedPixelsTotal) || decodedPixelsTotal > limits.decodedPixelsTotal) throw new Error('decoded sprite pixels exceed configured limits.');
    previousPalette = row.effectivePaletteRgb; sprites.push(row); cursor = row.nextOffset;
  }
  if (cursor !== buffer.length) throw new Error('SFF sprite chain must end exactly at EOF with no gap or trailing bytes.');
  const actualGroups = new Set(sprites.map(row => row.group)).size;
  if (groupCount !== actualGroups) throw new Error(`SFF group count ${groupCount} does not match ${actualGroups} distinct stored groups.`);
  return { header: { version: '1.0.1.0', groupCount, spriteCount, firstOffset, subheaderSize, paletteType }, sprites };
}

function compareSpecification(specification, parsed) {
  if (!specification) return [];
  assertSffBuildSpecificationV2(specification); const errors = [];
  if (specification.selection.targetId !== 'sff-v1' || specification.selection.backendId !== 'ikemaker-builtin-sff-v1') errors.push('reviewed specification does not select the built-in SFF v1 backend');
  const logicalSprites = specification.logical.sprites, logicalPalettes = specification.logical.palettes;
  const encoding = specification.encodingIntent || {}, choices = encoding.backendOptions?.['ikemaker-builtin-sff-v1']?.paletteBySpriteEntryId || {};
  if (encoding.paletteMode !== 'individual-successive') errors.push('reviewed specification does not select individual-successive palette mode');
  if ([encoding.compression?.default, ...Object.values(encoding.compression?.byEntryId || {})].filter(Boolean).some(value => value !== 'pcx-rle8')) errors.push('reviewed specification selects non-PCX8 compression');
  if (Object.keys(choices).length !== logicalSprites.length) errors.push('reviewed specification lacks one explicit palette decision per sprite');
  const firstUses = [];
  for (const sprite of logicalSprites) if (!firstUses.includes(sprite.paletteEntryId)) firstUses.push(sprite.paletteEntryId);
  if (firstUses.length !== logicalPalettes.length || firstUses.some((id, index) => id !== logicalPalettes[index].entryId)) errors.push('reviewed palette order is not the exact first-use order');
  logicalPalettes.forEach((entry, index) => {
    if (entry.group !== 0 || entry.number !== index || entry.contentLinkTargetEntryId) errors.push(`logical palette ${entry.entryId} is not canonical synthetic identity 0,${index}`);
    if (!Array.isArray(entry.colors) || entry.colors.length !== 256 || entry.colors.some((color, colorIndex) => !Array.isArray(color) || color.length !== 4 || color[3] !== (colorIndex === 0 ? 0 : 255))) errors.push(`logical palette ${entry.entryId} is not binary-transparent RGBA256`);
  });
  if (logicalSprites.length !== parsed.sprites.length) errors.push(`physical sprite count ${parsed.sprites.length} does not match reviewed count ${logicalSprites.length}`);
  const positions = new Map(logicalSprites.map((entry, index) => [entry.entryId, index]));
  const paletteById = new Map(logicalPalettes.map(entry => [entry.entryId, Buffer.from(entry.colors.flatMap(color => color.slice(0, 3)))]));
  for (let index = 0; index < Math.min(logicalSprites.length, parsed.sprites.length); index += 1) {
    const expected = logicalSprites[index], actual = parsed.sprites[index];
    if (expected.group !== actual.group || expected.number !== actual.number) errors.push(`sprite #${index} identity differs from reviewed ${expected.entryId}`);
    if (expected.axisX !== actual.axisX || expected.axisY !== actual.axisY) errors.push(`sprite #${index} axes differ from reviewed ${expected.entryId}`);
    if (expected.width !== actual.width || expected.height !== actual.height || expected.pixels.decodedHash !== actual.decodedIndexHash) errors.push(`sprite #${index} pixels or dimensions differ from reviewed ${expected.entryId}`);
    const palette = paletteById.get(expected.paletteEntryId); if (!palette || !palette.equals(actual.effectivePaletteRgb)) errors.push(`sprite #${index} effective palette differs from reviewed ${expected.entryId}`);
    const decision = choices[expected.entryId]; if (!['own', 'previous'].includes(decision) || actual.paletteSame !== (decision === 'previous')) errors.push(`sprite #${index} palette storage differs from reviewed ${expected.entryId}`);
    const expectedLink = expected.contentLinkTargetEntryId ? positions.get(expected.contentLinkTargetEntryId) : null, actualLink = actual.declaredLength ? null : actual.link;
    if (expectedLink !== actualLink) errors.push(`sprite #${index} link differs from reviewed ${expected.entryId}`);
  }
  return errors;
}
function validateSffV1Pcx8(buffer, specification = null, options = {}) {
  let parsed = null; const errors = [];
  try { parsed = parseSffV1Pcx8(buffer, options); errors.push(...compareSpecification(specification, parsed)); } catch (error) { errors.push(error.message); }
  return { kind: 'ikemaker-sff-v1-pcx8-strict-validation', validatorId: SFF_V1_PCX8_VALIDATOR_ID, validatorVersion: SFF_V1_PCX8_VALIDATOR_VERSION, profile: SFF_V1_PCX8_VALIDATOR_PROFILE, ok: errors.length === 0, errors, header: parsed?.header || null, sprites: parsed?.sprites || [] };
}
function assertSffV1Pcx8(buffer, specification = null, options = {}) {
  const report = validateSffV1Pcx8(buffer, specification, options);
  if (!report.ok) throw new Error(`Strict SFF v1.01 PCX8 validation failed: ${report.errors.join('; ')}`);
  return report;
}

module.exports = { SFF_V1_PCX8_VALIDATOR_ID, SFF_V1_PCX8_VALIDATOR_VERSION, SFF_V1_PCX8_VALIDATOR_PROFILE, parseSffV1Pcx8, validateSffV1Pcx8, assertSffV1Pcx8 };
