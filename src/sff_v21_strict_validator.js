'use strict';

// This module is intentionally independent of sff_reader and every SFF writer.
// It is the fail-closed acceptance gate for the first built-in-writer profile:
// SFF v2.1, indexed 8-bit PNG sprite payloads, and RGBA SFF palettes.

const crypto = require('crypto');
const fs = require('fs');
const zlib = require('zlib');

const SFF_V21_PNG8_VALIDATOR_ID = 'ikemaker-sff-v21-png8-strict';
const SFF_V21_PNG8_VALIDATOR_VERSION = 2;
const SFF_V21_PNG8_VALIDATOR_PROFILE = 'sff-v2.1-png8-strict-v2';

const SIGNATURE = Buffer.from('ElecbyteSpr\0', 'latin1');
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const VERSION_21 = Buffer.from([0, 1, 0, 2]);
const HEADER_SIZE = 64;
const SPRITE_HEADER_SIZE = 28;
const PALETTE_HEADER_SIZE = 16;
const FORMAT_PNG8 = 10;
const COLOR_DEPTH_INDEXED8 = 8;
const DEFAULT_LIMITS = Object.freeze({ sprites: 1000000, palettes: 65536, decodedPixels: 100000000, decodedPixelsTotal: 100000000 });

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

let crcTable;
function crc32(buffer) {
  if (!crcTable) {
    crcTable = Array.from({ length: 256 }, (_, value) => {
      let crc = value;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
      return crc >>> 0;
    });
  }
  let crc = 0xffffffff;
  for (const value of buffer) crc = crcTable[(crc ^ value) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function requireBuffer(input) {
  if (Buffer.isBuffer(input)) return { buffer: input, filename: '' };
  if (input instanceof Uint8Array) return { buffer: Buffer.from(input), filename: '' };
  if (typeof input === 'string' && input) return { buffer: fs.readFileSync(input), filename: input };
  throw new Error('Strict SFF validation requires a Buffer, Uint8Array, or filename.');
}

function checkedEnd(offset, size, limit, label) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0) {
    throw new Error(`${label} has an invalid offset or size.`);
  }
  const end = offset + size;
  if (!Number.isSafeInteger(end) || end > limit) throw new Error(`${label} range ${offset}+${size} exceeds ${limit} bytes.`);
  return end;
}

function checkedTableRange(offset, count, stride, length, label) {
  if (!Number.isSafeInteger(count) || count < 0) throw new Error(`${label} count is invalid.`);
  if (count && offset < HEADER_SIZE) throw new Error(`${label} begins inside the SFF header.`);
  const size = count * stride;
  if (!Number.isSafeInteger(size)) throw new Error(`${label} size overflows the safe integer range.`);
  return { label, start: offset, end: checkedEnd(offset, size, length, label), size };
}

function nonEmpty(range) { return range.end > range.start; }

function assertRangesDoNotOverlap(ranges, label) {
  const ordered = ranges.filter(nonEmpty).sort((left, right) => left.start - right.start || left.end - right.end);
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1], current = ordered[index];
    if (current.start < previous.end) {
      throw new Error(`${label}: ${previous.label} [${previous.start},${previous.end}) overlaps ${current.label} [${current.start},${current.end}).`);
    }
  }
}

function assertExactCoverage(section, ranges, label) {
  const ordered = ranges.filter(nonEmpty).sort((left, right) => left.start - right.start || left.end - right.end);
  let cursor = section.start;
  for (const range of ordered) {
    if (range.start !== cursor) throw new Error(`${label} has ${range.start > cursor ? 'unreferenced bytes' : 'overlapping data'} at [${Math.min(cursor, range.start)},${Math.max(cursor, range.start)}).`);
    cursor = range.end;
  }
  if (cursor !== section.end) throw new Error(`${label} has unreferenced bytes at [${cursor},${section.end}).`);
}

function assertZeroPaddedCoverage(buffer, section, ranges, label) {
  const ordered = ranges.filter(nonEmpty).sort((left, right) => left.start - right.start || left.end - right.end);
  let cursor = section.start;
  for (const range of ordered) {
    if (range.start < cursor) throw new Error(`${label} has overlapping data at [${range.start},${cursor}).`);
    if (range.start > cursor) assertZeroes(buffer, cursor, range.start, `${label} compatibility padding`);
    cursor = range.end;
  }
  if (cursor < section.end) assertZeroes(buffer, cursor, section.end, `${label} compatibility padding`);
}

function assertZeroes(buffer, start, end, label) {
  for (let offset = start; offset < end; offset += 1) {
    if (buffer[offset] !== 0) throw new Error(`${label} must be zero; byte ${offset} is ${buffer[offset]}.`);
  }
}

function u16(buffer, offset) { return buffer.readUInt16LE(offset); }
function i16(buffer, offset) { return buffer.readInt16LE(offset); }
function u32(buffer, offset) { return buffer.readUInt32LE(offset); }

function parseHeader(buffer, limits) {
  if (buffer.length < HEADER_SIZE) throw new Error(`SFF v2.1 header is truncated (${buffer.length} of ${HEADER_SIZE} bytes).`);
  if (!buffer.subarray(0, SIGNATURE.length).equals(SIGNATURE)) throw new Error('SFF signature is not ElecbyteSpr\\0.');
  if (!buffer.subarray(12, 16).equals(VERSION_21)) throw new Error(`Strict profile requires SFF v2.1.0.0; version bytes are ${buffer.subarray(12, 16).toString('hex')}.`);
  assertZeroes(buffer, 16, 24, 'SFF v2.1 reserved header bytes 0x10-0x17');
  if (!buffer.subarray(24, 28).equals(VERSION_21)) throw new Error(`Strict profile requires a v2.1.0.0 compatible-version field; bytes are ${buffer.subarray(24, 28).toString('hex')}.`);
  assertZeroes(buffer, 28, 36, 'SFF v2.1 reserved header bytes 0x1c-0x23');

  const header = {
    version: '2.1.0.0',
    compatibilityVersion: '2.1.0.0',
    firstSpriteHeaderOffset: u32(buffer, 36),
    numberOfSprites: u32(buffer, 40),
    firstPaletteHeaderOffset: u32(buffer, 44),
    numberOfPalettes: u32(buffer, 48),
    literalDataOffset: u32(buffer, 52),
    literalDataLength: u32(buffer, 56),
    translatedDataOffset: u32(buffer, 60)
  };
  if (header.numberOfSprites > limits.sprites) throw new Error(`SFF declares ${header.numberOfSprites} sprites; strict limit is ${limits.sprites}.`);
  if (header.numberOfPalettes > limits.palettes) throw new Error(`SFF declares ${header.numberOfPalettes} palettes; strict limit is ${limits.palettes}.`);

  const spriteTable = checkedTableRange(header.firstSpriteHeaderOffset, header.numberOfSprites, SPRITE_HEADER_SIZE, buffer.length, 'sprite table');
  const paletteTable = checkedTableRange(header.firstPaletteHeaderOffset, header.numberOfPalettes, PALETTE_HEADER_SIZE, buffer.length, 'palette table');
  if (header.literalDataOffset < HEADER_SIZE || header.literalDataOffset > buffer.length) throw new Error('literal-data offset is outside the SFF body.');
  const literalData = { label: 'literal-data section', start: header.literalDataOffset, end: checkedEnd(header.literalDataOffset, header.literalDataLength, buffer.length, 'literal-data section') };
  if (header.translatedDataOffset < HEADER_SIZE || header.translatedDataOffset > buffer.length) throw new Error('translated-data offset is outside the SFF body.');
  const translatedData = { label: 'translated-data section', start: header.translatedDataOffset, end: buffer.length };
  assertRangesDoNotOverlap([
    { label: 'SFF header', start: 0, end: HEADER_SIZE },
    spriteTable,
    paletteTable,
    literalData,
    translatedData
  ], 'SFF top-level ranges overlap');
  return { ...header, ranges: { spriteTable, paletteTable, literalData, translatedData } };
}

function parsePalettes(buffer, header, compatibilityProfile) {
  const palettes = [], identities = new Set();
  for (let index = 0; index < header.numberOfPalettes; index += 1) {
    const offset = header.firstPaletteHeaderOffset + index * PALETTE_HEADER_SIZE;
    const palette = {
      index,
      group: u16(buffer, offset),
      number: u16(buffer, offset + 2),
      colors: u16(buffer, offset + 4),
      link: u16(buffer, offset + 6),
      relativeOffset: u32(buffer, offset + 8),
      dataSize: u32(buffer, offset + 12),
      headerOffset: offset
    };
    if (palette.colors !== 256) throw new Error(`Palette #${index} declares ${palette.colors} colors; the strict PNG8 writer profile requires 256.`);
    const identity = `${palette.group},${palette.number}`;
    if (identities.has(identity)) throw new Error(`Palette #${index} duplicates physical palette identity ${identity}.`);
    identities.add(identity);
    if (palette.dataSize) {
      if (palette.link !== 0) throw new Error(`Stored palette #${index} has a nonzero link field.`);
      if (palette.dataSize !== palette.colors * 4) throw new Error(`Palette #${index} stores ${palette.dataSize} bytes; expected ${palette.colors * 4} RGBA bytes.`);
      palette.dataOffset = header.literalDataOffset + palette.relativeOffset;
      const end = checkedEnd(palette.dataOffset, palette.dataSize, header.ranges.literalData.end, `palette #${index} data`);
      if (palette.dataOffset < header.ranges.literalData.start) throw new Error(`Palette #${index} data begins before the literal-data section.`);
      palette.dataRange = { label: `palette #${index} data`, start: palette.dataOffset, end };
      palette.colorsRgba = Array.from({ length: palette.colors }, (_, color) => [...buffer.subarray(palette.dataOffset + color * 4, palette.dataOffset + color * 4 + 4)]);
      palette.rgbaHash = sha256(buffer.subarray(palette.dataOffset, end));
    } else {
      if (palette.relativeOffset !== 0 && compatibilityProfile !== 'sprmake2-v2.1') throw new Error(`Linked palette #${index} has a nonzero unused data offset.`);
      if (compatibilityProfile === 'sprmake2-v2.1' && palette.relativeOffset > header.literalDataLength) throw new Error(`Linked palette #${index} has an out-of-range compatibility data offset.`);
      palette.dataOffset = null;
      palette.dataRange = null;
      palette.colorsRgba = null;
      palette.rgbaHash = null;
    }
    palettes.push(palette);
  }
  validateLinks(palettes, 'palette');
  for (const palette of palettes) {
    if (palette.dataSize) continue;
    const target = resolveLink(palettes, palette.index, 'palette');
    if (target.colors !== palette.colors) throw new Error(`Linked palette #${palette.index} color count differs from target #${target.index}.`);
  }
  return palettes;
}

function parseSpriteHeaders(buffer, header, palettes, compatibilityProfile) {
  const sprites = [];
  for (let index = 0; index < header.numberOfSprites; index += 1) {
    const offset = header.firstSpriteHeaderOffset + index * SPRITE_HEADER_SIZE;
    const flags = u16(buffer, offset + 26);
    const sprite = {
      index,
      group: u16(buffer, offset),
      number: u16(buffer, offset + 2),
      width: u16(buffer, offset + 4),
      height: u16(buffer, offset + 6),
      axisX: i16(buffer, offset + 8),
      axisY: i16(buffer, offset + 10),
      link: u16(buffer, offset + 12),
      format: buffer[offset + 14],
      colorDepth: buffer[offset + 15],
      relativeOffset: u32(buffer, offset + 16),
      dataSize: u32(buffer, offset + 20),
      paletteIndex: u16(buffer, offset + 24),
      flags,
      headerOffset: offset
    };
    if (!sprite.width || !sprite.height) throw new Error(`Sprite #${index} has invalid dimensions ${sprite.width}x${sprite.height}.`);
    if (sprite.format !== FORMAT_PNG8) throw new Error(`Sprite #${index} uses unsupported format ${sprite.format}; strict profile accepts PNG8 format 10 only.`);
    if (sprite.colorDepth !== COLOR_DEPTH_INDEXED8) throw new Error(`Sprite #${index} uses unsupported color depth ${sprite.colorDepth}; strict profile accepts indexed depth 8 only.`);
    if (sprite.paletteIndex >= palettes.length) throw new Error(`Sprite #${index} assigns missing palette index ${sprite.paletteIndex}.`);
    if ((flags & ~1) !== 0) throw new Error(`Sprite #${index} uses unsupported flags 0x${flags.toString(16)}.`);
    if (sprite.dataSize) {
      if (sprite.link !== 0) throw new Error(`Stored sprite #${index} has a nonzero link field.`);
      const section = flags === 0 ? header.ranges.literalData : header.ranges.translatedData;
      sprite.dataOffset = section.start + sprite.relativeOffset;
      const end = checkedEnd(sprite.dataOffset, sprite.dataSize, section.end, `sprite #${index} data`);
      if (sprite.dataOffset < section.start) throw new Error(`Sprite #${index} data begins before its selected data section.`);
      sprite.dataRange = { label: `sprite #${index} data`, start: sprite.dataOffset, end };
    } else {
      if (sprite.relativeOffset !== 0 && compatibilityProfile !== 'sprmake2-v2.1') throw new Error(`Linked sprite #${index} has a nonzero unused data offset.`);
      if (flags !== 0 && compatibilityProfile !== 'sprmake2-v2.1') throw new Error(`Linked sprite #${index} has nonzero unused data flags.`);
      if (compatibilityProfile === 'sprmake2-v2.1' && sprite.relativeOffset > (flags === 0 ? header.literalDataLength : header.ranges.translatedData.end - header.ranges.translatedData.start)) throw new Error(`Linked sprite #${index} has an out-of-range compatibility data offset.`);
      sprite.dataOffset = null;
      sprite.dataRange = null;
    }
    sprites.push(sprite);
  }
  validateLinks(sprites, 'sprite');
  for (const sprite of sprites) {
    if (sprite.dataSize) continue;
    const target = resolveLink(sprites, sprite.index, 'sprite');
    if (target.width !== sprite.width || target.height !== sprite.height || target.format !== sprite.format || target.colorDepth !== sprite.colorDepth) {
      throw new Error(`Linked sprite #${sprite.index} metadata does not match stored target #${target.index}.`);
    }
    if (compatibilityProfile === 'sprmake2-v2.1' && sprite.flags !== target.flags) throw new Error(`Linked sprite #${sprite.index} compatibility flags differ from stored target #${target.index}.`);
  }
  return sprites;
}

function validateLinks(entries, label) {
  for (const entry of entries) {
    if (entry.dataSize) continue;
    if (!Number.isInteger(entry.link) || entry.link < 0 || entry.link >= entries.length) throw new Error(`${label} #${entry.index} links outside the table to #${entry.link}.`);
    resolveLink(entries, entry.index, label);
    if (entry.link >= entry.index) throw new Error(`${label} #${entry.index} must link backward to an earlier physical entry; found #${entry.link}.`);
  }
}

function resolveLink(entries, index, label) {
  const seen = new Set();
  let entry = entries[index];
  while (entry && !entry.dataSize) {
    if (seen.has(entry.index)) throw new Error(`${label} #${index} contains a link cycle through #${entry.index}.`);
    seen.add(entry.index);
    entry = entries[entry.link];
  }
  if (!entry) throw new Error(`${label} #${index} does not resolve to stored data.`);
  return entry;
}

function paeth(a, b, c) {
  const estimate = a + b - c, da = Math.abs(estimate - a), db = Math.abs(estimate - b), dc = Math.abs(estimate - c);
  return da <= db && da <= dc ? a : db <= dc ? b : c;
}

function reconstructIndexedRows(raw, width, height) {
  const expected = height * (width + 1);
  if (raw.length !== expected) throw new Error(`PNG inflated to ${raw.length} bytes; expected ${expected} filtered scanline bytes.`);
  const pixels = Buffer.alloc(width * height);
  let source = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[source++];
    if (filter > 4) throw new Error(`PNG row ${y} uses unsupported filter ${filter}.`);
    for (let x = 0; x < width; x += 1) {
      const encoded = raw[source++], at = y * width + x;
      const left = x ? pixels[at - 1] : 0, up = y ? pixels[at - width] : 0, upperLeft = x && y ? pixels[at - width - 1] : 0;
      const prediction = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : paeth(left, up, upperLeft);
      pixels[at] = (encoded + prediction) & 0xff;
    }
  }
  return pixels;
}

function parseIndexedPng(buffer, label, expectedWidth, expectedHeight, limits) {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`${label} has an invalid embedded PNG signature.`);
  const chunks = [], idat = [];
  let offset = 8, sawIhdr = false, sawPlte = false, sawTrns = false, sawIdat = false, endedIdat = false, sawIend = false;
  let width = 0, height = 0, paletteEntries = 0;
  while (offset < buffer.length) {
    if (buffer.length - offset < 12) throw new Error(`${label} has a truncated PNG chunk header at ${offset}.`);
    const size = buffer.readUInt32BE(offset), type = buffer.toString('ascii', offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) throw new Error(`${label} contains invalid PNG chunk type bytes at ${offset + 4}.`);
    if (type[2] !== type[2].toUpperCase()) throw new Error(`${label} PNG chunk ${type} uses the reserved lowercase third type letter.`);
    const chunkEnd = checkedEnd(offset, size + 12, buffer.length, `${label} PNG ${type} chunk`);
    const data = buffer.subarray(offset + 8, offset + 8 + size), storedCrc = buffer.readUInt32BE(offset + 8 + size);
    const computedCrc = crc32(buffer.subarray(offset + 4, offset + 8 + size));
    if (storedCrc !== computedCrc) throw new Error(`${label} PNG ${type} chunk has CRC ${storedCrc.toString(16)}; expected ${computedCrc.toString(16)}.`);
    if (!sawIhdr && type !== 'IHDR') throw new Error(`${label} PNG does not begin with IHDR.`);
    if (type === 'IHDR') {
      if (sawIhdr || chunks.length) throw new Error(`${label} PNG contains a misplaced or duplicate IHDR.`);
      if (size !== 13) throw new Error(`${label} PNG IHDR length is ${size}; expected 13.`);
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      if (!width || !height || width !== expectedWidth || height !== expectedHeight) throw new Error(`${label} PNG dimensions ${width}x${height} do not match sprite header ${expectedWidth}x${expectedHeight}.`);
      if (data[8] !== 8 || data[9] !== 3) throw new Error(`${label} PNG must use indexed color type 3 at 8-bit depth.`);
      if (data[10] !== 0 || data[11] !== 0 || data[12] !== 0) throw new Error(`${label} PNG must use standard compression/filter methods and noninterlaced scanlines.`);
      const pixels = width * height;
      if (!Number.isSafeInteger(pixels) || pixels > limits.decodedPixels) throw new Error(`${label} PNG declares ${pixels} pixels; strict limit is ${limits.decodedPixels}.`);
      sawIhdr = true;
    } else if (type === 'PLTE') {
      if (sawPlte || sawIdat) throw new Error(`${label} PNG contains a misplaced or duplicate PLTE.`);
      if (size !== 768) throw new Error(`${label} PNG PLTE contains ${size} bytes; strict PNG8 profile requires 256 RGB entries.`);
      paletteEntries = size / 3; sawPlte = true;
    } else if (type === 'tRNS') {
      if (!sawPlte || sawTrns || sawIdat || size > paletteEntries) throw new Error(`${label} PNG tRNS is duplicated, misplaced or exceeds its PLTE.`);
      sawTrns = true;
    } else if (type === 'IDAT') {
      if (!sawPlte) throw new Error(`${label} PNG IDAT appears before the required PLTE.`);
      if (endedIdat) throw new Error(`${label} PNG IDAT chunks are not consecutive.`);
      sawIdat = true; idat.push(data);
    } else if (type === 'IEND') {
      if (!sawIdat || sawIend || size !== 0) throw new Error(`${label} PNG has an invalid IEND.`);
      sawIend = true;
    } else {
      if (sawIdat) endedIdat = true;
      if (type[0] === type[0].toUpperCase()) throw new Error(`${label} PNG contains unsupported critical chunk ${type}.`);
    }
    chunks.push({ type, size, offset });
    offset = chunkEnd;
    if (type === 'IEND') break;
  }
  if (!sawIend) throw new Error(`${label} PNG is missing IEND.`);
  if (offset !== buffer.length) throw new Error(`${label} PNG has ${buffer.length - offset} trailing byte(s) after IEND.`);
  const compressed = Buffer.concat(idat);
  let inflatedResult;
  try {
    inflatedResult = zlib.inflateSync(compressed, { maxOutputLength: height * (width + 1) + 1, info: true });
  } catch (error) {
    throw new Error(`${label} PNG deflate stream is invalid or exceeds the expected scanline size: ${error.message}`);
  }
  const raw = Buffer.isBuffer(inflatedResult) ? inflatedResult : inflatedResult.buffer;
  if (inflatedResult?.engine && Number.isInteger(inflatedResult.engine.bytesWritten) && inflatedResult.engine.bytesWritten !== compressed.length) {
    throw new Error(`${label} PNG deflate stream leaves ${compressed.length - inflatedResult.engine.bytesWritten} trailing compressed byte(s).`);
  }
  const pixels = reconstructIndexedRows(raw, width, height);
  for (const pixel of pixels) if (pixel >= paletteEntries) throw new Error(`${label} PNG uses palette index ${pixel} outside its ${paletteEntries}-entry PLTE.`);
  return { width, height, chunks, pixels, decodedIndexHash: sha256(pixels) };
}

function decodeSprites(buffer, sprites, limits) {
  let totalPixels = 0;
  for (const sprite of sprites) {
    if (!sprite.dataSize) continue;
    if (sprite.dataSize < 4 + PNG_SIGNATURE.length) throw new Error(`Sprite #${sprite.index} PNG payload is truncated.`);
    const declaredPixels = u32(buffer, sprite.dataOffset), expectedPixels = sprite.width * sprite.height;
    totalPixels += expectedPixels;
    if (!Number.isSafeInteger(totalPixels) || totalPixels > limits.decodedPixelsTotal) throw new Error(`Stored sprites declare ${totalPixels} decoded pixels in total; strict aggregate limit is ${limits.decodedPixelsTotal}.`);
    if (declaredPixels !== expectedPixels) throw new Error(`Sprite #${sprite.index} declares ${declaredPixels} decoded bytes; expected ${expectedPixels}.`);
    const png = buffer.subarray(sprite.dataOffset + 4, sprite.dataOffset + sprite.dataSize);
    const decoded = parseIndexedPng(png, `sprite #${sprite.index}`, sprite.width, sprite.height, limits);
    sprite.decodedIndexHash = decoded.decodedIndexHash;
    sprite.pngChunks = decoded.chunks;
  }
  for (const sprite of sprites) {
    if (sprite.dataSize) continue;
    const target = resolveLink(sprites, sprite.index, 'sprite');
    sprite.decodedIndexHash = target.decodedIndexHash;
    sprite.pngChunks = target.pngChunks;
  }
}

function expectedFormat(value) {
  if (Number(value) === FORMAT_PNG8) return FORMAT_PNG8;
  return String(value || '').trim().toLowerCase() === 'png8' ? FORMAT_PNG8 : null;
}

function paletteIdentity(palette) { return `${palette.group},${palette.number}`; }

function specificationErrors(specification, sprites, palettes) {
  if (!specification) return [];
  const errors = [];
  if (specification.target?.sffVersion && String(specification.target.sffVersion) !== '2.1') errors.push(`reviewed specification targets SFF ${specification.target.sffVersion}, not 2.1`);
  const expectedSprites = Array.isArray(specification.sprites) ? specification.sprites : [];
  if (expectedSprites.length !== sprites.length) errors.push(`physical sprite count ${sprites.length} does not match reviewed count ${expectedSprites.length}`);
  const spriteIds = new Set();
  for (const entry of expectedSprites) {
    const id = String(entry?.entryId || '');
    if (!id || spriteIds.has(id)) errors.push(`reviewed sprite entryId ${id || '(missing)'} is missing or duplicated`);
    spriteIds.add(id);
  }
  const spriteEntryPositions = new Map(expectedSprites.map((entry, index) => [entry.entryId, index]));
  for (let index = 0; index < Math.min(expectedSprites.length, sprites.length); index += 1) {
    const expected = expectedSprites[index], actual = sprites[index], id = expected.entryId || `#${index}`;
    if (Number(expected.group) !== actual.group || Number(expected.number) !== actual.number) errors.push(`physical sprite #${index} is ${actual.group},${actual.number}; reviewed ${expected.group},${expected.number} (${id})`);
    if (expectedFormat(expected.format) !== FORMAT_PNG8 || String(expected.compression || '').trim().toLowerCase() !== 'png8' || Number(expected.colorDepth) !== 8) errors.push(`reviewed sprite ${id} is outside the strict PNG8/PNG8/depth-8 profile`);
    const crop = expected.crop || {}, expectedAxisX = Number(expected.axisX || 0) + Number(crop.axisDeltaX || 0), expectedAxisY = Number(expected.axisY || 0) + Number(crop.axisDeltaY || 0);
    if (actual.axisX !== expectedAxisX || actual.axisY !== expectedAxisY) errors.push(`sprite ${id} axes ${actual.axisX},${actual.axisY} do not match reviewed ${expectedAxisX},${expectedAxisY}`);
    if (!['none', 'before-axis', 'after-axis'].includes(String(crop.mode || ''))) errors.push(`reviewed sprite ${id} uses unsupported crop mode ${crop.mode || '(missing)'}`);
    else {
      if (Number(expected.source?.width) !== actual.width || Number(expected.source?.height) !== actual.height) errors.push(`sprite ${id} dimensions ${actual.width}x${actual.height} do not match reviewed ${expected.source?.width}x${expected.source?.height}`);
    }
    const wantedLink = expected.linkTargetEntryId ? spriteEntryPositions.get(expected.linkTargetEntryId) : undefined;
    if (expected.linkTargetEntryId && wantedLink === undefined) errors.push(`sprite ${id} reviews a missing link target ${expected.linkTargetEntryId}`);
    else if (expected.linkTargetEntryId && (actual.dataSize !== 0 || actual.link !== wantedLink)) errors.push(`sprite ${id} does not link to reviewed physical sprite #${wantedLink}`);
    else if (!expected.linkTargetEntryId && actual.dataSize === 0) errors.push(`sprite ${id} is linked although the reviewed policy requires independent data`);
    const wantedHash = String(expected.source?.decodedHash || '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(wantedHash)) errors.push(`sprite ${id} lacks a reviewed decoded index hash`);
    else if (wantedHash !== actual.decodedIndexHash) errors.push(`sprite ${id} decoded index hash ${actual.decodedIndexHash} does not match reviewed ${wantedHash}`);
  }

  const expectedPalettes = Array.isArray(specification.palettes) ? specification.palettes : [];
  if (expectedPalettes.length !== palettes.length) errors.push(`physical palette count ${palettes.length} does not match reviewed count ${expectedPalettes.length}`);
  const paletteIds = new Set();
  for (const entry of expectedPalettes) {
    const id = String(entry?.entryId || '');
    if (!id || paletteIds.has(id)) errors.push(`reviewed palette entryId ${id || '(missing)'} is missing or duplicated`);
    paletteIds.add(id);
    if (String(entry?.tableOrder || '').toLowerCase() !== 'sff') errors.push(`reviewed palette ${id || '(missing)'} is not normalized to SFF index order`);
  }
  const paletteEntryPositions = new Map(expectedPalettes.map((entry, index) => [entry.entryId, index]));
  for (let index = 0; index < Math.min(expectedPalettes.length, palettes.length); index += 1) {
    const expected = expectedPalettes[index], actual = palettes[index], id = expected.entryId || `#${index}`;
    if (Number(expected.group) !== actual.group || Number(expected.number) !== actual.number) errors.push(`physical palette #${index} is ${paletteIdentity(actual)}; reviewed ${expected.group},${expected.number} (${id})`);
    const wantedLink = expected.linkTargetEntryId ? paletteEntryPositions.get(expected.linkTargetEntryId) : undefined;
    if (expected.linkTargetEntryId && wantedLink === undefined) errors.push(`palette ${id} reviews a missing link target ${expected.linkTargetEntryId}`);
    else if (expected.linkTargetEntryId && (actual.dataSize !== 0 || actual.link !== wantedLink)) errors.push(`palette ${id} does not link to reviewed physical palette #${wantedLink}`);
    else if (!expected.linkTargetEntryId && actual.dataSize === 0) errors.push(`palette ${id} is linked although the reviewed policy requires independent RGBA data`);
    const stored = resolveLink(palettes, actual.index, 'palette'), wantedColors = expected.colors;
    if (!Array.isArray(wantedColors) || wantedColors.length !== 256) errors.push(`palette ${id} lacks the reviewed 256-entry RGBA contract`);
    else {
      for (let color = 0; color < 256; color += 1) {
        if (!Array.isArray(wantedColors[color]) || wantedColors[color].length !== 4 || wantedColors[color].some((channel, channelIndex) => Number(channel) !== stored.colorsRgba[color][channelIndex])) {
          errors.push(`palette ${id} RGBA differs at index ${color}`);
          break;
        }
      }
    }
  }
  const paletteById = new Map(palettes.map((palette) => [paletteIdentity(palette), palette.index]));
  for (let index = 0; index < Math.min(expectedSprites.length, sprites.length); index += 1) {
    const wanted = String(expectedSprites[index].paletteId || '').replace(/\s+/g, '');
    if (!wanted) continue;
    const wantedIndex = paletteEntryPositions.has(wanted) ? paletteEntryPositions.get(wanted) : paletteById.get(wanted);
    if (wantedIndex === undefined) errors.push(`sprite ${expectedSprites[index].entryId || `#${index}`} reviews missing palette ${wanted}`);
    else if (sprites[index].paletteIndex !== wantedIndex) errors.push(`sprite ${expectedSprites[index].entryId || `#${index}`} assigns palette #${sprites[index].paletteIndex}; reviewed #${wantedIndex} (${wanted})`);
  }
  return errors;
}

function validateSffV21Png8(input, specification = null, options = {}) {
  const errors = [];
  let filename = '', header = null, sprites = [], palettes = [];
  try {
    const loaded = requireBuffer(input), buffer = loaded.buffer;
    filename = loaded.filename;
    const compatibilityProfile = options.compatibilityProfile || 'canonical';
    if (!['canonical', 'sprmake2-v2.1'].includes(compatibilityProfile)) throw new Error(`Unknown SFF compatibility profile ${compatibilityProfile}.`);
    const limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) };
    header = parseHeader(buffer, limits);
    palettes = parsePalettes(buffer, header, compatibilityProfile);
    sprites = parseSpriteHeaders(buffer, header, palettes, compatibilityProfile);
    assertRangesDoNotOverlap([
      ...palettes.map((entry) => entry.dataRange).filter(Boolean),
      ...sprites.map((entry) => entry.dataRange).filter(Boolean)
    ], 'stored SFF data blocks overlap');
    const assertCoverage = compatibilityProfile === 'sprmake2-v2.1'
      ? (section, ranges, label) => assertZeroPaddedCoverage(buffer, section, ranges, label)
      : assertExactCoverage;
    assertCoverage({ start: 0, end: buffer.length }, [
      { label: 'SFF header', start: 0, end: HEADER_SIZE }, header.ranges.paletteTable, header.ranges.spriteTable, header.ranges.literalData, header.ranges.translatedData
    ], 'SFF top-level layout');
    assertCoverage(header.ranges.literalData, [
      ...palettes.map(entry => entry.dataRange).filter(Boolean), ...sprites.filter(entry => entry.flags === 0).map(entry => entry.dataRange).filter(Boolean)
    ], 'literal-data section');
    assertCoverage(header.ranges.translatedData, sprites.filter(entry => entry.flags === 1).map(entry => entry.dataRange).filter(Boolean), 'translated-data section');
    decodeSprites(buffer, sprites, limits);
    errors.push(...specificationErrors(specification, sprites, palettes));
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return {
    ok: errors.length === 0,
    profile: SFF_V21_PNG8_VALIDATOR_PROFILE,
    evidence: 'structural-validation',
    compatibilityProfile: options.compatibilityProfile || 'canonical',
    filename,
    errors,
    header,
    palettes,
    sprites,
    physicalOrder: sprites.map((sprite) => ({ index: sprite.index, group: sprite.group, number: sprite.number, decodedIndexHash: sprite.decodedIndexHash }))
  };
}

function assertSffV21Png8(input, specification = null, options = {}) {
  const report = validateSffV21Png8(input, specification, options);
  if (!report.ok) throw new Error(`Strict SFF v2.1 PNG8 validation failed: ${report.errors.join('; ')}`);
  return report;
}

module.exports = {
  SFF_V21_PNG8_VALIDATOR_ID,
  SFF_V21_PNG8_VALIDATOR_VERSION,
  SFF_V21_PNG8_VALIDATOR_PROFILE,
  FORMAT_PNG8,
  COLOR_DEPTH_INDEXED8,
  crc32,
  validateSffV21Png8,
  assertSffV21Png8
};
