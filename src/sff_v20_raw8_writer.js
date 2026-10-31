'use strict';

const crypto = require('crypto');
const { assertSffBuildSpecificationV2 } = require('./sff_build_specification_v2');
const {
  SIGNATURE, PRIMARY_VERSION_2010, COMPATIBLE_VERSION_2000,
  HEADER_SIZE, PALETTE_HEADER_SIZE, SPRITE_HEADER_SIZE, FORMAT_RAW, COLOR_DEPTH_INDEXED8
} = require('./sff_v20_strict_validator');

const MAX_U16 = 0xffff;
const MAX_U32 = 0xffffffff;

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function fail(message) { throw new Error(`Built-in SFF v2.0 RAW8 writer: ${message}`); }
function integer(value, label, minimum, maximum) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) fail(`${label} must be an integer from ${minimum} through ${maximum}; received ${value}.`);
  return result;
}
function u16(value, label) { return integer(value, label, 0, MAX_U16); }
function i16(value, label) { return integer(value, label, -0x8000, 0x7fff); }
function add(left, right, label) {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result > MAX_U32) fail(`${label} exceeds the SFF 32-bit range.`);
  return result;
}
function multiply(left, right, label) {
  const result = left * right;
  if (!Number.isSafeInteger(result) || result > MAX_U32) fail(`${label} exceeds the SFF 32-bit range.`);
  return result;
}
function bufferMap(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Buffer.isBuffer(value)) fail(`${label} must be an entryId-keyed object.`);
  return value;
}

function gateSpecification(specification) {
  assertSffBuildSpecificationV2(specification);
  if (specification.selection.targetId !== 'sff-v2.0' || specification.selection.backendId !== 'ikemaker-builtin-sff-v2.0' || specification.selection.adapter?.id !== 'builtin-v20-raw8') fail('specification must explicitly select the built-in SFF v2.0 RAW8 backend.');
  const encoding = specification.encodingIntent || {}, compression = encoding.compression || {}, crop = encoding.crop || {}, storage = encoding.storage || {}, options = encoding.backendOptions || {};
  if (Object.values(options).some(value => value && Object.keys(value).length)) fail('backend options must be empty for the sealed RAW8 profile.');
  if (encoding.reviewedConversions?.length) fail('reviewed conversions must be completed into new logical sources before writing.');
  if (encoding.paletteMode && encoding.paletteMode !== 'embedded') fail('palette mode must be embedded.');
  const compressionModes = [compression.default, ...Object.values(compression.byEntryId || {})].filter(Boolean);
  if (!compressionModes.length || compressionModes.some(value => value !== 'raw8')) fail('compression must be explicitly raw8.');
  const cropModes = [crop.default, ...Object.values(crop.byEntryId || {})].filter(Boolean);
  if (cropModes.some(value => value !== 'none')) fail('crop must be none.');
  for (const entry of specification.logical.sprites) {
    const expected = entry.contentLinkTargetEntryId ? 'share-identical' : 'preserve-separate';
    const chosen = storage.byEntryId?.[entry.entryId] || storage.spriteDefault || expected;
    if (chosen !== expected) fail(`storage for sprite ${entry.entryId} conflicts with its logical link.`);
  }
  for (const entry of specification.logical.palettes) {
    const expected = entry.contentLinkTargetEntryId ? 'share-identical' : 'preserve-separate';
    const chosen = storage.byEntryId?.[entry.entryId] || storage.paletteDefault || expected;
    if (chosen !== expected) fail(`storage for palette ${entry.entryId} conflicts with its logical link.`);
  }
}

function preparePalettes(specification) {
  const logical = specification.logical.palettes;
  if (logical.length > MAX_U16 + 1) fail(`palette count ${logical.length} exceeds 16-bit physical addressing.`);
  const positions = new Map();
  const palettes = logical.map((entry, index) => {
    const label = `palette ${entry.entryId || `#${index}`}`;
    if (positions.has(entry.entryId)) fail(`${label} repeats an entryId.`);
    if (!Array.isArray(entry.colors) || entry.colors.length !== 256) fail(`${label} must contain exactly 256 RGBA colors.`);
    const colors = Buffer.alloc(1024);
    entry.colors.forEach((color, colorIndex) => {
      if (!Array.isArray(color) || color.length !== 4) fail(`${label} color ${colorIndex} must be RGBA.`);
      const expectedAlpha = colorIndex === 0 ? 0 : 255;
      if (integer(color[3], `${label} color ${colorIndex} alpha`, 0, 255) !== expectedAlpha) fail(`${label} uses alpha ${color[3]} at index ${colorIndex}; MUGEN 1.0 RAW8 requires index 0 transparent and all other indexes opaque.`);
      for (let channel = 0; channel < 4; channel += 1) colors[colorIndex * 4 + channel] = integer(color[channel], `${label} color ${colorIndex} channel ${channel}`, 0, 255);
    });
    positions.set(entry.entryId, index);
    return { entryId: entry.entryId, group: u16(entry.group, `${label} group`), number: u16(entry.number, `${label} number`), colors, contentLinkTargetEntryId: entry.contentLinkTargetEntryId || null, link: 0, dataSize: 1024 };
  });
  for (let index = 0; index < palettes.length; index += 1) {
    const palette = palettes[index];
    if (!palette.contentLinkTargetEntryId) continue;
    const target = positions.get(palette.contentLinkTargetEntryId);
    if (!Number.isInteger(target) || target >= index) fail(`palette ${palette.entryId} must link backward to an earlier palette.`);
    if (!palette.colors.equals(palettes[target].colors)) fail(`palette ${palette.entryId} colors differ from link target ${palette.contentLinkTargetEntryId}.`);
    palette.link = target; palette.dataSize = 0;
  }
  return { palettes, positions };
}

function prepareSprites(specification, decodedPixelsByEntryId, paletteState) {
  const logical = specification.logical.sprites;
  if (logical.length > MAX_U16 + 1) fail(`sprite count ${logical.length} exceeds the strict profile's 16-bit link addressing.`);
  const supplied = bufferMap(decodedPixelsByEntryId, 'decodedPixelsByEntryId'), keys = Object.keys(supplied), expectedIds = new Set(logical.map(entry => entry.entryId));
  if (keys.length !== expectedIds.size || keys.some(key => !expectedIds.has(key))) fail('decodedPixelsByEntryId must contain exactly every logical sprite entryId and no extras.');
  const positions = new Map();
  const sprites = logical.map((entry, index) => {
    const label = `sprite ${entry.entryId || `#${index}`}`;
    if (positions.has(entry.entryId)) fail(`${label} repeats an entryId.`);
    if (entry.pixels?.kind !== 'indexed8' || entry.source?.kind !== 'complete-image') fail(`${label} must be a complete-image indexed8 source.`);
    const width = u16(entry.width, `${label} width`), height = u16(entry.height, `${label} height`);
    if (!width || !height) fail(`${label} dimensions must be nonzero.`);
    const pixelCount = multiply(width, height, `${label} pixel count`);
    let pixels = supplied[entry.entryId];
    if (pixels instanceof Uint8Array && !Buffer.isBuffer(pixels)) pixels = Buffer.from(pixels);
    if (!Buffer.isBuffer(pixels) || pixels.length !== pixelCount) fail(`${label} requires exactly ${pixelCount} decoded index bytes.`);
    const decodedHash = sha256(pixels);
    if (decodedHash !== String(entry.pixels.decodedHash || '').toLowerCase() || decodedHash !== String(entry.source.decodedHash || '').toLowerCase()) fail(`${label} decoded index bytes drifted from the sealed logical source.`);
    const paletteIndex = paletteState.positions.get(entry.paletteEntryId);
    if (!Number.isInteger(paletteIndex)) fail(`${label} assigns missing palette ${entry.paletteEntryId || '(none)'}.`);
    positions.set(entry.entryId, index);
    return { entryId: entry.entryId, group: u16(entry.group, `${label} group`), number: u16(entry.number, `${label} number`), width, height, axisX: i16(entry.axisX, `${label} axisX`), axisY: i16(entry.axisY, `${label} axisY`), pixels: Buffer.from(pixels), decodedHash, paletteIndex, contentLinkTargetEntryId: entry.contentLinkTargetEntryId || null, link: 0, dataSize: pixelCount };
  });
  for (let index = 0; index < sprites.length; index += 1) {
    const sprite = sprites[index];
    if (!sprite.contentLinkTargetEntryId) continue;
    const target = positions.get(sprite.contentLinkTargetEntryId);
    if (!Number.isInteger(target) || target >= index) fail(`sprite ${sprite.entryId} must link backward to an earlier sprite.`);
    const owner = sprites[target];
    if (sprite.width !== owner.width || sprite.height !== owner.height || sprite.decodedHash !== owner.decodedHash) fail(`sprite ${sprite.entryId} pixels or dimensions differ from link target ${sprite.contentLinkTargetEntryId}.`);
    sprite.link = target; sprite.dataSize = 0;
  }
  return sprites;
}

function createSffV20Raw8Bytes(specification, options = {}) {
  gateSpecification(specification);
  const paletteState = preparePalettes(specification);
  if (specification.logical.sprites.length && !paletteState.palettes.length) fail('every RAW8 sprite requires an explicit embedded palette.');
  if (!specification.logical.sprites.length && paletteState.palettes.length) fail('the narrow profile permits an empty archive, but not a palette-only archive.');
  const sprites = prepareSprites(specification, options.decodedPixelsByEntryId || {}, paletteState);
  const paletteTable = HEADER_SIZE;
  const spriteTable = add(paletteTable, multiply(paletteState.palettes.length, PALETTE_HEADER_SIZE, 'palette table size'), 'sprite table offset');
  const literalData = add(spriteTable, multiply(sprites.length, SPRITE_HEADER_SIZE, 'sprite table size'), 'LData offset');
  let literalLength = 0;
  for (const palette of paletteState.palettes) literalLength = add(literalLength, palette.dataSize, 'LData palette bytes');
  for (const sprite of sprites) literalLength = add(literalLength, sprite.dataSize, 'LData sprite bytes');
  const translatedData = add(literalData, literalLength, 'TData offset');
  const buffer = Buffer.alloc(translatedData);
  SIGNATURE.copy(buffer, 0); PRIMARY_VERSION_2010.copy(buffer, 12); COMPATIBLE_VERSION_2000.copy(buffer, 24);
  buffer.writeUInt32LE(spriteTable, 36); buffer.writeUInt32LE(sprites.length, 40);
  buffer.writeUInt32LE(paletteTable, 44); buffer.writeUInt32LE(paletteState.palettes.length, 48);
  buffer.writeUInt32LE(literalData, 52); buffer.writeUInt32LE(literalLength, 56);
  buffer.writeUInt32LE(translatedData, 60); buffer.writeUInt32LE(0, 64);
  let dataOffset = 0;
  paletteState.palettes.forEach((palette, index) => {
    const at = paletteTable + index * PALETTE_HEADER_SIZE;
    buffer.writeUInt16LE(palette.group, at); buffer.writeUInt16LE(palette.number, at + 2); buffer.writeUInt16LE(256, at + 4); buffer.writeUInt16LE(palette.link, at + 6);
    buffer.writeUInt32LE(palette.dataSize ? dataOffset : 0, at + 8); buffer.writeUInt32LE(palette.dataSize, at + 12);
    if (palette.dataSize) { palette.colors.copy(buffer, literalData + dataOffset); dataOffset += palette.dataSize; }
  });
  sprites.forEach((sprite, index) => {
    const at = spriteTable + index * SPRITE_HEADER_SIZE;
    buffer.writeUInt16LE(sprite.group, at); buffer.writeUInt16LE(sprite.number, at + 2); buffer.writeUInt16LE(sprite.width, at + 4); buffer.writeUInt16LE(sprite.height, at + 6);
    buffer.writeInt16LE(sprite.axisX, at + 8); buffer.writeInt16LE(sprite.axisY, at + 10); buffer.writeUInt16LE(sprite.link, at + 12);
    buffer[at + 14] = FORMAT_RAW; buffer[at + 15] = COLOR_DEPTH_INDEXED8;
    buffer.writeUInt32LE(sprite.dataSize ? dataOffset : 0, at + 16); buffer.writeUInt32LE(sprite.dataSize, at + 20); buffer.writeUInt16LE(sprite.paletteIndex, at + 24); buffer.writeUInt16LE(0, at + 26);
    if (sprite.dataSize) { sprite.pixels.copy(buffer, literalData + dataOffset); dataOffset += sprite.dataSize; }
  });
  if (dataOffset !== literalLength) fail(`internal LData layout mismatch (${dataOffset} of ${literalLength} bytes written).`);
  return buffer;
}

module.exports = { createSffV20Raw8Bytes };
