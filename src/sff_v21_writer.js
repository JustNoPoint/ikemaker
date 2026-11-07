'use strict';

// Mixed SFF v2.1 writer. Pure indexed builds deliberately delegate to the
// certified PNG8 writer so its bytes and validation contract cannot drift.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createSffV21Png8Bytes } = require('./sff_v21_png8_writer');
const { readIndexedPng8, canonicalizeEmbeddedPng8 } = require('./sff_png8_source');
const { decodePng } = require('./palette_index_organizer_model');
const { SFF_BUILD_SPECIFICATION_VERSION, specificationHash } = require('./sff_build_specification');

const SIGNATURE = Buffer.from('ElecbyteSpr\0', 'latin1');
const VERSION_21 = Buffer.from([0, 1, 0, 2]);
const HEADER_SIZE = 64, PALETTE_HEADER_SIZE = 16, SPRITE_HEADER_SIZE = 28;
const FORMATS = Object.freeze({ png8: 10, png24: 11, png32: 12 });
const DEPTHS = Object.freeze({ png8: 8, png24: 24, png32: 32 });
const KINDS = Object.freeze({ png8: 'indexed8', png24: 'rgb24', png32: 'rgba32' });
const MAX_U16 = 0xffff, MAX_U32 = 0xffffffff;

function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function fail(message) { throw new Error(`Built-in SFF v2.1 writer: ${message}`); }
function integer(value, label, min, max) { const n = Number(value); if (!Number.isSafeInteger(n) || n < min || n > max) fail(`${label} must be an integer from ${min} through ${max}; received ${value}.`); return n; }
function u16(value, label) { return integer(value, label, 0, MAX_U16); }
function i16(value, label) { return integer(value, label, -0x8000, 0x7fff); }
function add(a, b, label) { const n = a + b; if (!Number.isSafeInteger(n) || n > MAX_U32) fail(`${label} exceeds the SFF v2.1 32-bit range.`); return n; }
function multiply(a, b, label) { const n = a * b; if (!Number.isSafeInteger(n) || n > MAX_U32) fail(`${label} exceeds the SFF v2.1 32-bit range.`); return n; }
function portable(value, label) { const result = String(value || '').trim().replace(/\\/g, '/').replace(/^\.\//, ''); if (!result || /^(?:[A-Za-z]:\/|\/)/.test(result) || result.split('/').includes('..')) fail(`${label} must be a portable path inside the execution snapshot.`); return result; }
function reader(options) { if (typeof options.readSource === 'function') return options.readSource; if (options.sources instanceof Map) return p => options.sources.get(p); if (options.sources && typeof options.sources === 'object') return p => options.sources[p]; const root = path.resolve(String(options.executionRoot || '')); if (!options.executionRoot) fail('executionRoot, sources, or readSource is required.'); return p => { const file = path.resolve(root, ...p.split('/')); if (file !== root && !file.startsWith(`${root}${path.sep}`)) fail(`source path escapes the execution snapshot: ${p}.`); return fs.readFileSync(file); }; }

function assertSpecification(spec) {
  if (!spec || spec.schema !== 'ikemaker.sff-build-specification' || spec.version !== SFF_BUILD_SPECIFICATION_VERSION) fail(`specification must use ikemaker.sff-build-specification v${SFF_BUILD_SPECIFICATION_VERSION}.`);
  if (String(spec.target?.sffVersion) !== '2.1') fail('only SFF 2.1 is supported.');
  if (String(spec.specificationHash || '').toLowerCase() !== specificationHash(spec)) fail('specification hash is missing or does not match the reviewed content.');
  if (!Array.isArray(spec.sprites) || !Array.isArray(spec.palettes)) fail('reviewed sprite and palette lists are required.');
  require('./sff_png8_optimization').assertLegacyOptimization(spec);
}

function preparePalettes(spec) {
  const ids = new Map(), identities = new Map();
  const rows = spec.palettes.map((entry, index) => {
    const label = `palette ${entry.entryId || `#${index}`}`, entryId = String(entry.entryId || '').trim();
    if (!entryId || ids.has(entryId)) fail(`${label} has a missing or repeated entryId.`);
    const group = u16(entry.group, `${label} group`), number = u16(entry.number, `${label} number`), identity = `${group},${number}`;
    if (identities.has(identity)) fail(`${label} duplicates palette identity ${identity}.`);
    if (String(entry.tableOrder || '').toLowerCase() !== 'sff' || !Array.isArray(entry.colors) || entry.colors.length !== 256) fail(`${label} must contain exactly 256 RGBA colors in SFF order.`);
    const colors = Buffer.alloc(1024); entry.colors.forEach((color, c) => { if (!Array.isArray(color) || color.length !== 4) fail(`${label} color ${c} must be RGBA.`); color.forEach((v, channel) => { colors[c * 4 + channel] = integer(v, `${label} color ${c} channel ${channel}`, 0, 255); }); });
    ids.set(entryId, index); identities.set(identity, index);
    return { entryId, group, number, colors, linkTargetEntryId: entry.linkTargetEntryId || null, duplicatePolicy: entry.duplicatePolicy, link: 0, dataSize: 1024 };
  });
  rows.forEach((row, index) => { if (!row.linkTargetEntryId) return; const target = ids.get(row.linkTargetEntryId); if (!Number.isInteger(target) || target >= index || row.duplicatePolicy !== 'share-identical' || !row.colors.equals(rows[target].colors)) fail(`palette ${row.entryId} has an invalid or non-identical link.`); row.link = target; row.dataSize = 0; });
  return { rows, ids, identities };
}

function pixelBytes(decoded, format) {
  if (format === 'png32') return decoded.rgba;
  const rgb = Buffer.alloc(decoded.width * decoded.height * 3);
  for (let i = 0, j = 0; i < decoded.rgba.length; i += 4) { rgb[j++] = decoded.rgba[i]; rgb[j++] = decoded.rgba[i + 1]; rgb[j++] = decoded.rgba[i + 2]; }
  return rgb;
}

function prepareSprites(spec, options, palettes) {
  const read = spec.sprites.length ? reader(options) : null, ids = new Map();
  const rows = spec.sprites.map((entry, index) => {
    const label = `sprite ${entry.entryId || `#${index}`}`, entryId = String(entry.entryId || '').trim();
    if (!entryId || ids.has(entryId)) fail(`${label} has a missing or repeated entryId.`);
    const format = String(entry.format || '').toLowerCase(), compression = String(entry.compression || '').toLowerCase();
    if (!Object.hasOwn(FORMATS, format) || compression !== format || Number(entry.colorDepth) !== DEPTHS[format]) fail(`${label} must use matching png8/8, png24/24, or png32/32 format, compression, and depth.`);
    const crop = String(entry.crop?.mode || 'none'); if (crop !== 'none') fail(`${label} true-color build path currently requires a prepared no-crop source.`);
    const width = u16(entry.source?.width, `${label} width`), height = u16(entry.source?.height, `${label} height`); if (!width || !height) fail(`${label} dimensions must be nonzero.`);
    const relativePath = portable(entry.source?.relativePath, `${label} source.relativePath`); let png = read(relativePath, entry); if (png instanceof Uint8Array && !Buffer.isBuffer(png)) png = Buffer.from(png); if (!Buffer.isBuffer(png)) fail(`${label} source was not found or was not bytes.`);
    const byteHash = sha(png), wantedByteHash = String(entry.source?.byteHash || '').toLowerCase(); if (!/^[0-9a-f]{64}$/.test(wantedByteHash) || byteHash !== wantedByteHash) fail(`${label} source byte hash does not match its reviewed snapshot.`);
    let decodedHash, decodedLength;
    if (format === 'png8') {
      let decoded; try { decoded = readIndexedPng8(png, { maxPixels: options.maxPixels }); } catch (error) { fail(`${label} is not accepted PNG8: ${error.message}`); }
      if (decoded.width !== width || decoded.height !== height) fail(`${label} PNG dimensions do not match its review.`);
      decodedHash = decoded.decodedHash; decodedLength = width * height; png = canonicalizeEmbeddedPng8(png, { maxPixels: options.maxPixels }); png = require('./sff_png8_optimization').optimizedPng8(png, spec, { maxPixels: options.maxPixels });
    } else {
      let decoded; try { decoded = decodePng(png, { maximumPixels: options.maxPixels || 100000000, maximumDimension: 65535 }); } catch (error) { fail(`${label} is not accepted true-color PNG: ${error.message}`); }
      const expectedType = format === 'png24' ? 2 : 6;
      if (decoded.colorType !== expectedType || decoded.bitDepth !== 8) fail(`${label} must be an 8-bit PNG color type ${expectedType} for ${format}.`);
      if (decoded.width !== width || decoded.height !== height) fail(`${label} PNG dimensions do not match its review.`);
      const pixels = pixelBytes(decoded, format); decodedHash = sha(pixels); decodedLength = pixels.length;
    }
    const wantedDecodedHash = String(entry.source?.decodedHash || '').toLowerCase(); if (!/^[0-9a-f]{64}$/.test(wantedDecodedHash) || decodedHash !== wantedDecodedHash) fail(`${label} decoded ${KINDS[format]} hash does not match its reviewed snapshot.`);
    let paletteIndex = 0;
    if (format === 'png8') { const ref = String(entry.paletteId || '').trim(), found = palettes.ids.has(ref) ? palettes.ids.get(ref) : palettes.identities.get(ref.replace(/\s+/g, '')); if (found === undefined) fail(`${label} requires an explicit existing paletteId.`); paletteIndex = found; }
    const row = { entryId, group: u16(entry.group, `${label} group`), number: u16(entry.number, `${label} number`), width, height, axisX: i16(entry.axisX, `${label} axisX`), axisY: i16(entry.axisY, `${label} axisY`), format, formatCode: FORMATS[format], colorDepth: DEPTHS[format], decodedHash, decodedLength, paletteIndex, png, linkTargetEntryId: entry.linkTargetEntryId || null, duplicatePolicy: entry.duplicatePolicy, link: 0, dataSize: add(4, png.length, `${label} payload size`) };
    ids.set(entryId, index); return row;
  });
  rows.forEach((row, index) => { if (!row.linkTargetEntryId) return; const target = ids.get(row.linkTargetEntryId), owner = rows[target]; if (!Number.isInteger(target) || target >= index || row.duplicatePolicy !== 'share-identical' || !owner || row.format !== owner.format || row.width !== owner.width || row.height !== owner.height || row.decodedHash !== owner.decodedHash) fail(`sprite ${row.entryId} has an invalid or non-identical link.`); row.link = target; row.dataSize = 0; });
  return rows;
}

function createSffV21Bytes(specification, options = {}) {
  assertSpecification(specification);
  if (specification.sprites.every(sprite => String(sprite.format).toLowerCase() === 'png8')) return createSffV21Png8Bytes(specification, options);
  const palettes = preparePalettes(specification), sprites = prepareSprites(specification, options, palettes);
  const paletteTable = HEADER_SIZE, spriteTable = add(paletteTable, multiply(palettes.rows.length, PALETTE_HEADER_SIZE, 'palette table'), 'sprite table'), literalData = add(spriteTable, multiply(sprites.length, SPRITE_HEADER_SIZE, 'sprite table'), 'literal data');
  let literalLength = palettes.rows.reduce((sum, row) => add(sum, row.dataSize, 'palette data'), 0); for (const row of sprites) literalLength = add(literalLength, row.dataSize, 'sprite data');
  const total = add(literalData, literalLength, 'archive size'), output = Buffer.alloc(total);
  SIGNATURE.copy(output, 0); VERSION_21.copy(output, 12); VERSION_21.copy(output, 24); output.writeUInt32LE(spriteTable, 36); output.writeUInt32LE(sprites.length, 40); output.writeUInt32LE(paletteTable, 44); output.writeUInt32LE(palettes.rows.length, 48); output.writeUInt32LE(literalData, 52); output.writeUInt32LE(literalLength, 56); output.writeUInt32LE(total, 60);
  let dataOffset = 0;
  palettes.rows.forEach((row, index) => { const at = paletteTable + index * PALETTE_HEADER_SIZE; output.writeUInt16LE(row.group, at); output.writeUInt16LE(row.number, at + 2); output.writeUInt16LE(256, at + 4); output.writeUInt16LE(row.link, at + 6); output.writeUInt32LE(row.dataSize ? dataOffset : 0, at + 8); output.writeUInt32LE(row.dataSize, at + 12); if (row.dataSize) { row.colors.copy(output, literalData + dataOffset); dataOffset += row.dataSize; } });
  sprites.forEach((row, index) => { const at = spriteTable + index * SPRITE_HEADER_SIZE; output.writeUInt16LE(row.group, at); output.writeUInt16LE(row.number, at + 2); output.writeUInt16LE(row.width, at + 4); output.writeUInt16LE(row.height, at + 6); output.writeInt16LE(row.axisX, at + 8); output.writeInt16LE(row.axisY, at + 10); output.writeUInt16LE(row.link, at + 12); output[at + 14] = row.formatCode; output[at + 15] = row.colorDepth; output.writeUInt32LE(row.dataSize ? dataOffset : 0, at + 16); output.writeUInt32LE(row.dataSize, at + 20); output.writeUInt16LE(row.paletteIndex, at + 24); if (row.dataSize) { output.writeUInt32LE(row.decodedLength, literalData + dataOffset); row.png.copy(output, literalData + dataOffset + 4); dataOffset += row.dataSize; } });
  if (dataOffset !== literalLength) fail('internal literal-data layout mismatch.');
  return output;
}

module.exports = { FORMATS, DEPTHS, KINDS, createSffV21Bytes };
