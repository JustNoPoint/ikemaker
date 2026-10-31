'use strict';

const crypto = require('crypto');
const { assertSffBuildSpecificationV2 } = require('./sff_build_specification_v2');

const SIGNATURE = Buffer.from('ElecbyteSpr\0', 'latin1');
const PRIMARY_VERSION_2010 = Buffer.from([0, 1, 0, 2]);
const PRIMARY_VERSION_2000 = Buffer.from([0, 0, 0, 2]);
const COMPATIBLE_VERSION_2000 = Buffer.from([0, 0, 0, 2]);
const HEADER_SIZE = 512;
const PALETTE_HEADER_SIZE = 16;
const SPRITE_HEADER_SIZE = 28;
const FORMAT_RAW = 0;
const COLOR_DEPTH_INDEXED8 = 8;
const SFF_V20_RAW8_VALIDATOR_ID = 'ikemaker-sff-v20-raw8-strict';
const SFF_V20_RAW8_VALIDATOR_VERSION = 1;
const SFF_V20_RAW8_VALIDATOR_PROFILE = 'sff-v2.0-raw8-strict-v1';
const DEFAULT_LIMITS = Object.freeze({ sprites: 1000000, palettes: 65536, decodedPixels: 100000000, decodedPixelsTotal: 100000000, archiveBytes: 0xffffffff });

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function checkedEnd(start, size, maximum, label) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(size) || start < 0 || size < 0) throw new Error(`${label} has an invalid range.`);
  const end = start + size;
  if (!Number.isSafeInteger(end) || end < start || end > maximum) throw new Error(`${label} is outside the SFF file.`);
  return end;
}
function checkedTableRange(start, count, stride, maximum, label) {
  if (!Number.isSafeInteger(count) || count < 0) throw new Error(`${label} has an invalid count.`);
  const size = count * stride;
  if (!Number.isSafeInteger(size)) throw new Error(`${label} size overflows safe arithmetic.`);
  const end = checkedEnd(start, size, maximum, label);
  if (count && start < HEADER_SIZE) throw new Error(`${label} intrudes into the 512-byte SFF header.`);
  return { label, start, end };
}
function assertNoOverlap(ranges, label) {
  const nonempty = ranges.filter(range => range.end > range.start).sort((a, b) => a.start - b.start || a.end - b.end);
  for (let index = 1; index < nonempty.length; index += 1) if (nonempty[index].start < nonempty[index - 1].end) {
    throw new Error(`${label}: ${nonempty[index - 1].label} overlaps ${nonempty[index].label}.`);
  }
}
function assertZeroes(buffer, start, end, label) {
  for (let offset = start; offset < end; offset += 1) if (buffer[offset] !== 0) throw new Error(`${label} must be zero; byte ${offset} is ${buffer[offset]}.`);
}
function u16(buffer, offset) { return buffer.readUInt16LE(offset); }
function i16(buffer, offset) { return buffer.readInt16LE(offset); }
function u32(buffer, offset) { return buffer.readUInt32LE(offset); }
function versionText(bytes) { return `${bytes[3]}.${bytes[2]}.${bytes[1]}.${bytes[0]}`; }

function parseHeader(buffer, limits) {
  if (!Buffer.isBuffer(buffer)) throw new Error('SFF bytes must be a Buffer.');
  if (buffer.length < HEADER_SIZE) throw new Error(`SFF v2.0 header is truncated (${buffer.length} of ${HEADER_SIZE} bytes).`);
  if (buffer.length > limits.archiveBytes) throw new Error(`SFF archive exceeds the configured ${limits.archiveBytes}-byte limit.`);
  if (!buffer.subarray(0, 12).equals(SIGNATURE)) throw new Error('SFF signature is not ElecbyteSpr\\0.');
  const primaryBytes = buffer.subarray(12, 16), compatibleBytes = buffer.subarray(24, 28);
  if (!primaryBytes.equals(PRIMARY_VERSION_2010) && !primaryBytes.equals(PRIMARY_VERSION_2000)) throw new Error(`SFF v2.0 parser does not recognize primary version ${versionText(primaryBytes)}.`);
  if (!compatibleBytes.equals(COMPATIBLE_VERSION_2000)) throw new Error(`SFF v2.0 parser requires compatible version 2.0.0.0; received ${versionText(compatibleBytes)}.`);
  assertZeroes(buffer, 16, 24, 'SFF v2.0 reserved header bytes 0x10-0x17');
  assertZeroes(buffer, 28, 36, 'SFF v2.0 reserved header bytes 0x1c-0x23');
  assertZeroes(buffer, 68, 76, 'SFF v2.0 reserved header bytes 0x44-0x4b');
  const header = {
    primaryVersion: versionText(primaryBytes), compatibleVersion: versionText(compatibleBytes),
    firstSpriteHeaderOffset: u32(buffer, 36), numberOfSprites: u32(buffer, 40),
    firstPaletteHeaderOffset: u32(buffer, 44), numberOfPalettes: u32(buffer, 48),
    literalDataOffset: u32(buffer, 52), literalDataLength: u32(buffer, 56),
    translatedDataOffset: u32(buffer, 60), translatedDataLength: u32(buffer, 64)
  };
  if (header.numberOfSprites > limits.sprites) throw new Error(`SFF declares ${header.numberOfSprites} sprites; limit is ${limits.sprites}.`);
  if (header.numberOfPalettes > limits.palettes) throw new Error(`SFF declares ${header.numberOfPalettes} palettes; limit is ${limits.palettes}.`);
  const spriteTable = checkedTableRange(header.firstSpriteHeaderOffset, header.numberOfSprites, SPRITE_HEADER_SIZE, buffer.length, 'sprite table');
  const paletteTable = checkedTableRange(header.firstPaletteHeaderOffset, header.numberOfPalettes, PALETTE_HEADER_SIZE, buffer.length, 'palette table');
  if (header.literalDataOffset < HEADER_SIZE || header.literalDataOffset > buffer.length) throw new Error('LData offset is outside the SFF body.');
  if (header.translatedDataOffset < HEADER_SIZE || header.translatedDataOffset > buffer.length) throw new Error('TData offset is outside the SFF body.');
  const literalData = { label: 'LData section', start: header.literalDataOffset, end: checkedEnd(header.literalDataOffset, header.literalDataLength, buffer.length, 'LData section') };
  const translatedData = { label: 'TData section', start: header.translatedDataOffset, end: checkedEnd(header.translatedDataOffset, header.translatedDataLength, buffer.length, 'TData section') };
  assertNoOverlap([{ label: 'SFF header', start: 0, end: HEADER_SIZE }, paletteTable, spriteTable, literalData, translatedData], 'SFF top-level layout overlaps');
  return { ...header, ranges: { paletteTable, spriteTable, literalData, translatedData } };
}

function validateBackwardLinks(entries, kind) {
  for (const entry of entries) if (entry.dataSize === 0) {
    if (entry.link >= entry.index) throw new Error(`${kind} #${entry.index} must link backward; target is #${entry.link}.`);
    const seen = new Set([entry.index]); let cursor = entry;
    while (cursor.dataSize === 0) {
      if (seen.has(cursor.link)) throw new Error(`${kind} link cycle begins at #${entry.index}.`);
      seen.add(cursor.link); cursor = entries[cursor.link];
      if (!cursor) throw new Error(`${kind} #${entry.index} links outside the physical table.`);
    }
  }
}
function resolveStored(entries, index, kind) {
  const seen = new Set(); let entry = entries[index];
  while (entry && entry.dataSize === 0) {
    if (seen.has(entry.index)) throw new Error(`${kind} link cycle at #${entry.index}.`);
    seen.add(entry.index); entry = entries[entry.link];
  }
  if (!entry) throw new Error(`${kind} #${index} has a missing link target.`);
  return entry;
}

function parsePalettes(buffer, header) {
  const palettes = [];
  for (let index = 0; index < header.numberOfPalettes; index += 1) {
    const at = header.firstPaletteHeaderOffset + index * PALETTE_HEADER_SIZE;
    const palette = { index, group: u16(buffer, at), number: u16(buffer, at + 2), colors: u16(buffer, at + 4), link: u16(buffer, at + 6), relativeOffset: u32(buffer, at + 8), dataSize: u32(buffer, at + 12), headerOffset: at };
    if (palette.colors < 1 || palette.colors > 256) throw new Error(`Palette #${index} declares invalid color count ${palette.colors}.`);
    if (palette.dataSize) {
      if (palette.link !== 0) throw new Error(`Stored palette #${palette.index} must have a zero link field.`);
      if (palette.dataSize !== palette.colors * 4) throw new Error(`Palette #${index} stores ${palette.dataSize} bytes; expected ${palette.colors * 4}.`);
      const start = header.literalDataOffset + palette.relativeOffset, end = checkedEnd(start, palette.dataSize, header.ranges.literalData.end, `palette #${index} data`);
      if (start < header.ranges.literalData.start) throw new Error(`Palette #${index} begins before LData.`);
      palette.dataRange = { label: `palette #${index} data`, start, end };
      palette.storedBytes = Buffer.from(buffer.subarray(start, end));
      palette.colorsRgba = Array.from({ length: palette.colors }, (_, color) => {
        const offset = color * 4;
        return [palette.storedBytes[offset], palette.storedBytes[offset + 1], palette.storedBytes[offset + 2], color === 0 ? 0 : 255];
      });
      palette.rgbaHash = sha256(Buffer.from(palette.colorsRgba.flat()));
    } else {
      palette.dataRange = null; palette.storedBytes = null; palette.colorsRgba = null; palette.rgbaHash = null;
    }
    palettes.push(palette);
  }
  validateBackwardLinks(palettes, 'palette');
  for (const palette of palettes) if (!palette.dataSize) {
    const owner = resolveStored(palettes, palette.index, 'palette');
    if (owner.colors !== palette.colors) throw new Error(`Linked palette #${palette.index} color count differs from stored owner #${owner.index}.`);
  }
  return palettes;
}

function parseSprites(buffer, header, palettes, limits) {
  const sprites = []; let decodedPixelsTotal = 0;
  for (let index = 0; index < header.numberOfSprites; index += 1) {
    const at = header.firstSpriteHeaderOffset + index * SPRITE_HEADER_SIZE;
    const flags = u16(buffer, at + 26), relativeOffset = u32(buffer, at + 16), dataSize = u32(buffer, at + 20);
    if (flags & ~1) throw new Error(`Sprite #${index} uses unsupported data flags ${flags}.`);
    const sprite = { index, group: u16(buffer, at), number: u16(buffer, at + 2), width: u16(buffer, at + 4), height: u16(buffer, at + 6), axisX: i16(buffer, at + 8), axisY: i16(buffer, at + 10), link: u16(buffer, at + 12), format: buffer[at + 14], colorDepth: buffer[at + 15], relativeOffset, dataSize, paletteIndex: u16(buffer, at + 24), flags, headerOffset: at };
    const pixels = sprite.width * sprite.height;
    if (!Number.isSafeInteger(pixels) || pixels > limits.decodedPixels) throw new Error(`Sprite #${index} decoded pixel count exceeds the configured limit.`);
    decodedPixelsTotal += pixels;
    if (!Number.isSafeInteger(decodedPixelsTotal) || decodedPixelsTotal > limits.decodedPixelsTotal) throw new Error('Aggregate decoded sprite pixels exceed the configured limit.');
    if (sprite.paletteIndex >= palettes.length) throw new Error(`Sprite #${index} assigns missing palette #${sprite.paletteIndex}.`);
    if (dataSize) {
      const section = flags === 0 ? header.ranges.literalData : header.ranges.translatedData;
      const start = section.start + relativeOffset, end = checkedEnd(start, dataSize, section.end, `sprite #${index} data`);
      if (start < section.start) throw new Error(`Sprite #${index} begins before its selected data section.`);
      sprite.dataRange = { label: `sprite #${index} data`, start, end };
      if (sprite.format === FORMAT_RAW && sprite.colorDepth === COLOR_DEPTH_INDEXED8) {
        if (!sprite.width || !sprite.height) throw new Error(`Stored raw sprite #${index} must have nonzero dimensions.`);
        if (dataSize !== pixels) throw new Error(`Raw sprite #${index} stores ${dataSize} bytes; expected exactly ${pixels}.`);
        sprite.decodedIndexes = Buffer.from(buffer.subarray(start, end));
        sprite.decodedIndexHash = sha256(sprite.decodedIndexes);
      } else { sprite.decodedIndexes = null; sprite.decodedIndexHash = null; }
    } else { sprite.dataRange = null; sprite.decodedIndexes = null; sprite.decodedIndexHash = null; }
    sprites.push(sprite);
  }
  validateBackwardLinks(sprites, 'sprite');
  for (const sprite of sprites) {
    const owner = resolveStored(sprites, sprite.index, 'sprite');
    if (!sprite.dataSize && (owner.width !== sprite.width || owner.height !== sprite.height || owner.format !== sprite.format || owner.colorDepth !== sprite.colorDepth)) throw new Error(`Linked sprite #${sprite.index} metadata differs from stored owner #${owner.index}.`);
    if (owner.decodedIndexes) {
      const palette = resolveStored(palettes, sprite.paletteIndex, 'palette');
      for (const value of owner.decodedIndexes) if (value >= palette.colors) throw new Error(`Sprite #${sprite.index} uses palette index ${value} outside its ${palette.colors}-color palette.`);
      sprite.resolvedDecodedIndexHash = owner.decodedIndexHash;
    } else sprite.resolvedDecodedIndexHash = null;
  }
  return sprites;
}

function parseSffV20(buffer, options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) };
  const header = parseHeader(buffer, limits), palettes = parsePalettes(buffer, header), sprites = parseSprites(buffer, header, palettes, limits);
  const payloadRanges = [...palettes.map(item => item.dataRange), ...sprites.map(item => item.dataRange)].filter(Boolean);
  assertNoOverlap(payloadRanges, 'SFF payload ranges overlap');
  return { header, palettes, sprites };
}

function assertCanonicalLayout(buffer, parsed, compatibilityProfile) {
  const { header, palettes, sprites } = parsed;
  if (header.primaryVersion !== '2.0.1.0' || header.compatibleVersion !== '2.0.0.0') throw new Error(`Strict RAW8 profile requires primary 2.0.1.0 and compatible 2.0.0.0; found ${header.primaryVersion}/${header.compatibleVersion}.`);
  if (!['canonical', 'sprmake2-v2.0-raw8'].includes(compatibilityProfile)) throw new Error(`Unknown SFF v2.0 compatibility profile ${compatibilityProfile}.`);
  if (compatibilityProfile === 'canonical') assertZeroes(buffer, 76, HEADER_SIZE, 'canonical SFF v2.0 comment area');
  const expectedPalette = HEADER_SIZE, expectedSprite = expectedPalette + palettes.length * PALETTE_HEADER_SIZE, expectedLiteral = expectedSprite + sprites.length * SPRITE_HEADER_SIZE;
  if (header.firstPaletteHeaderOffset !== expectedPalette || header.firstSpriteHeaderOffset !== expectedSprite || header.literalDataOffset !== expectedLiteral) throw new Error('Strict RAW8 profile requires palette table, sprite table, and LData to be contiguously ordered after the 512-byte header.');
  if (header.translatedDataLength !== 0 || header.translatedDataOffset !== buffer.length) throw new Error('Strict RAW8 profile requires empty TData positioned at EOF.');
  if (header.literalDataOffset + header.literalDataLength !== header.translatedDataOffset) throw new Error('Strict RAW8 profile requires LData to end exactly where TData begins.');
  let cursor = header.literalDataOffset;
  for (const palette of palettes) {
    if (palette.colors !== 256) throw new Error(`Palette #${palette.index} must contain exactly 256 colors.`);
    if (palette.dataSize) {
      if (palette.dataRange.start !== cursor) throw new Error(`Palette #${palette.index} is not in canonical packed LData order.`);
      for (let color = 0; color < 256; color += 1) {
        const alpha = palette.storedBytes[color * 4 + 3], expected = color === 0 ? 0 : 255;
        if (alpha !== expected) throw new Error(`Palette #${palette.index} reserved alpha byte at index ${color} is ${alpha}; canonical binary value is ${expected}.`);
      }
      cursor = palette.dataRange.end;
    } else if (palette.relativeOffset !== 0) {
      if (compatibilityProfile === 'canonical') throw new Error(`Linked palette #${palette.index} must have zero unused data offset.`);
      if (palette.relativeOffset > header.literalDataLength) throw new Error(`Linked palette #${palette.index} has an out-of-range compatibility data offset.`);
    }
  }
  for (const sprite of sprites) {
    if (sprite.format !== FORMAT_RAW || sprite.colorDepth !== COLOR_DEPTH_INDEXED8 || sprite.flags !== 0) throw new Error(`Sprite #${sprite.index} is outside raw8/LData profile (format ${sprite.format}, depth ${sprite.colorDepth}, flags ${sprite.flags}).`);
    if (sprite.dataSize) {
      if (sprite.link !== 0) throw new Error(`Stored sprite #${sprite.index} must have a zero link field.`);
      if (sprite.dataRange.start !== cursor) throw new Error(`Sprite #${sprite.index} is not in canonical packed LData order.`);
      cursor = sprite.dataRange.end;
    } else if (sprite.relativeOffset !== 0) {
      if (compatibilityProfile === 'canonical') throw new Error(`Linked sprite #${sprite.index} must have zero unused data offset.`);
      if (sprite.relativeOffset > header.literalDataLength) throw new Error(`Linked sprite #${sprite.index} has an out-of-range compatibility data offset.`);
    }
  }
  if (cursor !== header.ranges.literalData.end || cursor !== buffer.length) throw new Error('Strict RAW8 profile has unexplained LData or trailing bytes.');
}

function compareSpecification(specification, parsed) {
  if (!specification) return [];
  assertSffBuildSpecificationV2(specification);
  const errors = [], sprites = specification.logical.sprites || [], palettes = specification.logical.palettes || [];
  if (specification.selection.targetId !== 'sff-v2.0') errors.push('reviewed specification does not select target sff-v2.0');
  if (sprites.length !== parsed.sprites.length) errors.push(`physical sprite count ${parsed.sprites.length} does not match reviewed count ${sprites.length}`);
  if (palettes.length !== parsed.palettes.length) errors.push(`physical palette count ${parsed.palettes.length} does not match reviewed count ${palettes.length}`);
  const spritePositions = new Map(sprites.map((entry, index) => [entry.entryId, index])), palettePositions = new Map(palettes.map((entry, index) => [entry.entryId, index]));
  for (let index = 0; index < Math.min(sprites.length, parsed.sprites.length); index += 1) {
    const expected = sprites[index], actual = parsed.sprites[index], owner = resolveStored(parsed.sprites, index, 'sprite');
    if (expected.group !== actual.group || expected.number !== actual.number) errors.push(`sprite #${index} identity differs from reviewed ${expected.entryId}`);
    if (expected.axisX !== actual.axisX || expected.axisY !== actual.axisY) errors.push(`sprite #${index} axes differ from reviewed ${expected.entryId}`);
    if (expected.width !== actual.width || expected.height !== actual.height) errors.push(`sprite #${index} dimensions differ from reviewed ${expected.entryId}`);
    if (expected.pixels?.kind !== 'indexed8' || expected.pixels?.decodedHash !== owner.decodedIndexHash) errors.push(`sprite #${index} decoded indexes differ from reviewed ${expected.entryId}`);
    const expectedPalette = palettePositions.get(expected.paletteEntryId);
    if (expectedPalette === undefined || actual.paletteIndex !== expectedPalette) errors.push(`sprite #${index} palette assignment differs from reviewed ${expected.entryId}`);
    const expectedLink = expected.contentLinkTargetEntryId ? spritePositions.get(expected.contentLinkTargetEntryId) : null;
    const actualLink = actual.dataSize ? null : actual.link;
    if (expectedLink !== actualLink) errors.push(`sprite #${index} storage link differs from reviewed ${expected.entryId}`);
  }
  for (let index = 0; index < Math.min(palettes.length, parsed.palettes.length); index += 1) {
    const expected = palettes[index], actual = parsed.palettes[index], owner = resolveStored(parsed.palettes, index, 'palette');
    if (expected.group !== actual.group || expected.number !== actual.number) errors.push(`palette #${index} identity differs from reviewed ${expected.entryId}`);
    if (!Array.isArray(expected.colors) || expected.colors.length !== 256 || sha256(Buffer.from(expected.colors.flat())) !== owner.rgbaHash) errors.push(`palette #${index} colors differ from reviewed ${expected.entryId}`);
    const expectedLink = expected.contentLinkTargetEntryId ? palettePositions.get(expected.contentLinkTargetEntryId) : null;
    const actualLink = actual.dataSize ? null : actual.link;
    if (expectedLink !== actualLink) errors.push(`palette #${index} storage link differs from reviewed ${expected.entryId}`);
  }
  return errors;
}

function validateSffV20Raw8(buffer, specification = null, options = {}) {
  let parsed = null; const errors = [];
  try {
    parsed = parseSffV20(buffer, options);
    assertCanonicalLayout(buffer, parsed, options.compatibilityProfile || 'canonical');
    errors.push(...compareSpecification(specification, parsed));
  } catch (error) { errors.push(error.message); }
  return {
    kind: 'ikemaker-sff-v20-raw8-strict-validation', validatorId: SFF_V20_RAW8_VALIDATOR_ID,
    validatorVersion: SFF_V20_RAW8_VALIDATOR_VERSION, profile: SFF_V20_RAW8_VALIDATOR_PROFILE,
    compatibilityProfile: options.compatibilityProfile || 'canonical', ok: errors.length === 0, errors,
    primaryVersion: parsed?.header.primaryVersion || null, compatibleVersion: parsed?.header.compatibleVersion || null,
    header: parsed?.header || null, sprites: parsed?.sprites || [], palettes: parsed?.palettes || []
  };
}
function assertSffV20Raw8(buffer, specification = null, options = {}) {
  const report = validateSffV20Raw8(buffer, specification, options);
  if (!report.ok) throw new Error(`Strict SFF v2.0 RAW8 validation failed: ${report.errors.join('; ')}`);
  return report;
}

module.exports = {
  SIGNATURE, PRIMARY_VERSION_2010, PRIMARY_VERSION_2000, COMPATIBLE_VERSION_2000,
  HEADER_SIZE, PALETTE_HEADER_SIZE, SPRITE_HEADER_SIZE, FORMAT_RAW, COLOR_DEPTH_INDEXED8,
  SFF_V20_RAW8_VALIDATOR_ID, SFF_V20_RAW8_VALIDATOR_VERSION, SFF_V20_RAW8_VALIDATOR_PROFILE,
  parseSffV20, validateSffV20Raw8, assertSffV20Raw8, resolveStored
};
