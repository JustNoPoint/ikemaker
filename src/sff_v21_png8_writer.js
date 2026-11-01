'use strict';

// Deterministic encoder for the first deliberately narrow built-in SFF
// profile. This module does not adopt archives and does not depend on the SFF
// validator. The backend wrapper is responsible for independent acceptance.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { SFF_BUILD_SPECIFICATION_VERSION, specificationHash } = require('./sff_build_specification');
const { readIndexedPng8, canonicalizeEmbeddedPng8 } = require('./sff_png8_source');

const SIGNATURE = Buffer.from('ElecbyteSpr\0', 'latin1');
const VERSION_21 = Buffer.from([0, 1, 0, 2]);
const HEADER_SIZE = 64;
const PALETTE_HEADER_SIZE = 16;
const SPRITE_HEADER_SIZE = 28;
const FORMAT_PNG8 = 10;
const COLOR_DEPTH_INDEXED8 = 8;
const MAX_U16 = 0xffff;
const MAX_U32 = 0xffffffff;
const SUPPORTED_REQUIREMENTS = new Set([
  'sff-v2.1',
  'preserve-authored-physical-order',
  'immutable-source-snapshots',
  'candidate-before-adoption',
  'sprite-png8',
  'embedded-palettes',
  'sprite-data-linking',
  'palette-data-linking'
]);

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function fail(message) { throw new Error(`Built-in SFF v2.1 PNG8 writer: ${message}`); }

function checkedInteger(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    fail(`${label} must be an integer from ${minimum} through ${maximum}; received ${value}.`);
  }
  return number;
}

function checkedSize(value, label) { return checkedInteger(value, label, 0, MAX_U32); }
function checkedU16(value, label) { return checkedInteger(value, label, 0, MAX_U16); }
function checkedI16(value, label) { return checkedInteger(value, label, -0x8000, 0x7fff); }
function checkedLinkIndex(value, label) {
  const target = Number(value);
  if (!Number.isSafeInteger(target) || target < 0 || target > MAX_U16) {
    fail(`${label} link target physical index ${value} exceeds the SFF v2.1 PNG8 profile's 0–65535 link field.`);
  }
  return target;
}

function checkedAdd(left, right, label) {
  const value = left + right;
  if (!Number.isSafeInteger(value) || value > MAX_U32) fail(`${label} exceeds the SFF v2.1 32-bit range.`);
  return value;
}

function checkedMultiply(left, right, label) {
  const value = left * right;
  if (!Number.isSafeInteger(value) || value > MAX_U32) fail(`${label} exceeds the SFF v2.1 32-bit range.`);
  return value;
}

function normalizePortablePath(value, label) {
  const relative = String(value || '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (!relative || /^(?:[A-Za-z]:\/|\/|\\\\)/.test(relative) || relative.split('/').includes('..')) {
    fail(`${label} must be a portable path inside the execution snapshot.`);
  }
  return relative;
}

function sourceReader(options = {}) {
  if (typeof options.readSource === 'function') return (relativePath, sprite) => options.readSource(relativePath, sprite);
  if (options.sources instanceof Map) return relativePath => options.sources.get(relativePath);
  if (options.sources && typeof options.sources === 'object') return relativePath => options.sources[relativePath];
  const root = path.resolve(String(options.executionRoot || ''));
  if (!options.executionRoot) fail('executionRoot, sources, or readSource is required to resolve immutable source snapshots.');
  return relativePath => {
    const filename = path.resolve(root, ...relativePath.split('/'));
    if (filename !== root && !filename.startsWith(`${root}${path.sep}`)) fail(`source path escapes the execution snapshot: ${relativePath}.`);
    return fs.readFileSync(filename);
  };
}

function assertCanonicalSpecification(specification) {
  if (!specification || typeof specification !== 'object') fail('a reviewed SFF build specification is required.');
  if (specification.schema !== 'ikemaker.sff-build-specification' || specification.version !== SFF_BUILD_SPECIFICATION_VERSION) {
    fail(`specification must use ikemaker.sff-build-specification v${SFF_BUILD_SPECIFICATION_VERSION}.`);
  }
  if (String(specification.target?.sffVersion) !== '2.1') fail(`only SFF 2.1 is supported; requested ${specification.target?.sffVersion || 'unknown'}.`);
  const expectedHash = specificationHash(specification);
  if (!/^[0-9a-f]{64}$/i.test(String(specification.specificationHash || '')) || specification.specificationHash.toLowerCase() !== expectedHash) {
    fail('specification hash is missing or does not match the reviewed content.');
  }
  for (const requirement of specification.requirements || []) {
    if (!SUPPORTED_REQUIREMENTS.has(requirement)) fail(`unsupported reviewed requirement ${requirement}.`);
  }
  if (!Array.isArray(specification.sprites)) fail('the full-rebuild profile requires a reviewed sprite list.');
  if (!Array.isArray(specification.palettes)) fail('the full-rebuild profile requires a reviewed palette list.');
  if (specification.sprites.length && !specification.palettes.length) fail('every PNG8 sprite requires an explicit 256-color SFF palette.');
  if (!specification.sprites.length && specification.palettes.length) fail('the narrow profile permits a completely empty archive, but not an unproven palette-only archive.');
}

function preparePalettes(specification) {
  if (specification.palettes.length > MAX_U16 + 1) fail(`palette count ${specification.palettes.length} exceeds indexed sprite assignment capacity.`);
  const entryPositions = new Map(), identityPositions = new Map();
  const palettes = specification.palettes.map((palette, index) => {
    const label = `palette ${palette.entryId || `#${index}`}`;
    const entryId = String(palette.entryId || '').trim();
    if (!entryId || entryId.length > 500) fail(`${label} requires a bounded non-empty entryId.`);
    if (entryPositions.has(entryId)) fail(`${label} repeats an entryId.`);
    if (!['preserve-separate', 'share-identical'].includes(palette.duplicatePolicy)) fail(`${label} requests unsupported duplicate policy ${palette.duplicatePolicy}.`);
    if (String(palette.tableOrder || '').toLowerCase() !== 'sff') fail(`${label} colors must already be normalized to SFF index order.`);
    const group = checkedU16(palette.group, `${label} group`), number = checkedU16(palette.number, `${label} number`);
    const identity = `${group},${number}`;
    if (identityPositions.has(identity)) fail(`${label} duplicates palette identity ${identity}; exact palette assignment would be ambiguous.`);
    if (!Array.isArray(palette.colors) || palette.colors.length !== 256) fail(`${label} must contain exactly 256 RGBA colors.`);
    const colors = Buffer.alloc(1024);
    palette.colors.forEach((color, colorIndex) => {
      if (!Array.isArray(color) || color.length !== 4) fail(`${label} color ${colorIndex} must be RGBA.`);
      color.forEach((channel, channelIndex) => { colors[colorIndex * 4 + channelIndex] = checkedInteger(channel, `${label} color ${colorIndex} channel ${channelIndex}`, 0, 255); });
    });
    entryPositions.set(entryId, index);
    identityPositions.set(identity, index);
    return { entryId, group, number, colors, linkTargetEntryId: palette.linkTargetEntryId || null, duplicatePolicy: palette.duplicatePolicy, source: palette };
  });
  palettes.forEach((palette, index) => {
    if (!palette.linkTargetEntryId) { palette.link = 0; palette.dataSize = 1024; return; }
    const target = entryPositions.get(palette.linkTargetEntryId), label = `palette ${palette.entryId || `#${index}`}`;
    if (!Number.isInteger(target) || target >= index) fail(`${label} must link backward to an earlier reviewed palette entry.`);
    if (palette.duplicatePolicy !== 'share-identical') fail(`${label} can only link when duplicatePolicy is share-identical.`);
    if (!palette.colors.equals(palettes[target].colors)) fail(`${label} cannot link to ${palette.linkTargetEntryId}; their reviewed RGBA tables differ.`);
    palette.link = checkedLinkIndex(target, label); palette.dataSize = 0;
  });
  return { palettes, entryPositions, identityPositions };
}

function paletteForSprite(sprite, label, paletteState) {
  const id = String(sprite.paletteId || '').trim();
  if (!id) fail(`${label} must name an explicit paletteId.`);
  const index = paletteState.entryPositions.has(id) ? paletteState.entryPositions.get(id) : paletteState.identityPositions.get(id.replace(/\s+/g, ''));
  if (index === undefined) fail(`${label} assigns missing palette ${id}.`);
  return { index, palette: paletteState.palettes[index] };
}

function prepareSprites(specification, options, paletteState) {
  const readSource = specification.sprites.length ? sourceReader(options) : null;
  const entryPositions = new Map();
  const sprites = specification.sprites.map((sprite, index) => {
    const label = `sprite ${sprite.entryId || `#${index}`}`;
    const entryId = String(sprite.entryId || '').trim();
    if (!entryId || entryId.length > 500) fail(`${label} requires a bounded non-empty entryId.`);
    if (entryPositions.has(entryId)) fail(`${label} repeats an entryId.`);
    if (!['preserve-separate', 'share-identical'].includes(sprite.duplicatePolicy)) fail(`${label} requests unsupported duplicate policy ${sprite.duplicatePolicy}.`);
    const cropMode = String(sprite.crop?.mode || ''), axisDeltaX = Number(sprite.crop?.axisDeltaX || 0), axisDeltaY = Number(sprite.crop?.axisDeltaY || 0);
    if (!['none', 'before-axis', 'after-axis'].includes(cropMode)) fail(`${label} requests crop mode ${cropMode || 'missing'}; the built-in profile accepts none or an already prepared reviewed crop snapshot only.`);
    if (cropMode !== 'after-axis' && (axisDeltaX !== 0 || axisDeltaY !== 0)) fail(`${label} requests an axis adjustment without a reviewed after-axis crop snapshot.`);
    if (cropMode === 'after-axis') {
      const preparation = sprite.source?.provenance?.preparation, match = /^(\d+),(\d+),(\d+),(\d+)$/.exec(String(preparation?.bounds || ''));
      if (preparation?.kind !== 'after-axis-crop' || !match) fail(`${label} after-axis crop requires sealed preparation evidence and exact source bounds.`);
      const [, left, top, preparedWidth, preparedHeight] = match.map(Number);
      if (axisDeltaX !== -left || axisDeltaY !== -top) fail(`${label} after-axis delta ${axisDeltaX},${axisDeltaY} does not preserve the reviewed crop origin ${left},${top}.`);
      if (Number(sprite.source?.width) !== preparedWidth || Number(sprite.source?.height) !== preparedHeight) fail(`${label} prepared dimensions do not match its reviewed after-axis crop bounds.`);
      if (String(preparation.outputByteHash || '').toLowerCase() !== String(sprite.source?.byteHash || '').toLowerCase()) fail(`${label} prepared output hash does not match its immutable source snapshot.`);
    }
    if (String(sprite.format || '').toLowerCase() !== 'png8' || String(sprite.compression || '').toLowerCase() !== 'png8' || Number(sprite.colorDepth) !== 8) {
      fail(`${label} requires ${sprite.format}/${sprite.compression} depth ${sprite.colorDepth}; only indexed PNG8/PNG8 depth 8 is supported (no quantization or alternate compression).`);
    }
    const group = checkedU16(sprite.group, `${label} group`), number = checkedU16(sprite.number, `${label} number`);
    const reviewedAxisX = checkedI16(sprite.axisX, `${label} axisX`), reviewedAxisY = checkedI16(sprite.axisY, `${label} axisY`);
    const axisX = checkedI16(reviewedAxisX + axisDeltaX, `${label} final axisX`), axisY = checkedI16(reviewedAxisY + axisDeltaY, `${label} final axisY`);
    const width = checkedU16(sprite.source?.width, `${label} width`), height = checkedU16(sprite.source?.height, `${label} height`);
    if (!width || !height) fail(`${label} width and height must be nonzero.`);
    const pixelCount = checkedMultiply(width, height, `${label} decoded pixel count`);
    const relativePath = normalizePortablePath(sprite.source?.relativePath, `${label} source.relativePath`);
    let png = readSource(relativePath, sprite);
    if (png instanceof Uint8Array && !Buffer.isBuffer(png)) png = Buffer.from(png);
    if (!Buffer.isBuffer(png)) fail(`${label} source snapshot ${relativePath} was not found or was not bytes.`);
    const byteHash = sha256(png), expectedByteHash = String(sprite.source?.byteHash || '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(expectedByteHash) || byteHash !== expectedByteHash) fail(`${label} source byte hash ${byteHash} does not match reviewed ${expectedByteHash || 'missing hash'}.`);
    let decoded;
    try { decoded = readIndexedPng8(png, { maxPixels: options.maxPixels }); }
    catch (error) { fail(`${label} source snapshot is not accepted PNG8: ${error.message}`); }
    if (decoded.width !== width || decoded.height !== height) fail(`${label} PNG dimensions ${decoded.width}x${decoded.height} do not match reviewed ${width}x${height}.`);
    const expectedDecodedHash = String(sprite.source?.decodedHash || '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(expectedDecodedHash) || decoded.decodedHash !== expectedDecodedHash) {
      fail(`${label} decoded index hash ${decoded.decodedHash} does not match reviewed ${expectedDecodedHash || 'missing hash'}.`);
    }
    // The immutable specification's explicit paletteId is authoritative. SFF
    // PNG8 stores indexed pixels separately from the archive palette table, and
    // SprMake2 deliberately supports assigning those indexes to a different
    // stored table through sprite.usepal. Keeping the PNG's PLTE as a required
    // equality check would reject valid Master / Stored-FX workflows and would
    // make the built-in comparison profile narrower than the reviewed contract.
    const sourcePngByteHash = byteHash;
    png = canonicalizeEmbeddedPng8(png, { maxPixels: options.maxPixels });
    const embeddedPngByteHash = sha256(png);
    const assigned = paletteForSprite(sprite, label, paletteState);
    const dataSize = checkedAdd(4, png.length, `${label} stored payload size`);
    entryPositions.set(entryId, index);
    return { entryId, group, number, width, height, axisX, axisY, pixelCount, paletteIndex: assigned.index, png, sourcePngByteHash, embeddedPngByteHash, decodedHash: decoded.decodedHash, linkTargetEntryId: sprite.linkTargetEntryId || null, duplicatePolicy: sprite.duplicatePolicy, link: 0, dataSize };
  });
  sprites.forEach((sprite, index) => {
    if (!sprite.linkTargetEntryId) return;
    const target = entryPositions.get(sprite.linkTargetEntryId), label = `sprite ${sprite.entryId || `#${index}`}`;
    if (!Number.isInteger(target) || target >= index) fail(`${label} must link backward to an earlier reviewed sprite entry.`);
    if (sprite.duplicatePolicy !== 'share-identical') fail(`${label} can only link when duplicatePolicy is share-identical.`);
    const source = sprites[target];
    if (sprite.width !== source.width || sprite.height !== source.height || sprite.decodedHash !== source.decodedHash) fail(`${label} cannot link to ${sprite.linkTargetEntryId}; their reviewed decoded pixels or dimensions differ.`);
    sprite.link = checkedLinkIndex(target, label); sprite.dataSize = 0;
  });
  return sprites;
}

function writeHeader(buffer, layout, spriteCount, paletteCount) {
  SIGNATURE.copy(buffer, 0);
  VERSION_21.copy(buffer, 12);
  VERSION_21.copy(buffer, 24);
  buffer.writeUInt32LE(layout.spriteTable, 36);
  buffer.writeUInt32LE(spriteCount, 40);
  buffer.writeUInt32LE(layout.paletteTable, 44);
  buffer.writeUInt32LE(paletteCount, 48);
  buffer.writeUInt32LE(layout.literalData, 52);
  buffer.writeUInt32LE(layout.literalLength, 56);
  buffer.writeUInt32LE(layout.total, 60);
}

function createSffV21Png8Bytes(specification, options = {}) {
  assertCanonicalSpecification(specification);
  const paletteState = preparePalettes(specification);
  const sprites = prepareSprites(specification, options, paletteState);
  const paletteTableSize = checkedMultiply(paletteState.palettes.length, PALETTE_HEADER_SIZE, 'palette table size');
  const spriteTableSize = checkedMultiply(sprites.length, SPRITE_HEADER_SIZE, 'sprite table size');
  const paletteTable = HEADER_SIZE;
  const spriteTable = checkedAdd(paletteTable, paletteTableSize, 'sprite table offset');
  const literalData = checkedAdd(spriteTable, spriteTableSize, 'literal-data offset');
  let literalLength = paletteState.palettes.reduce((total, palette) => checkedAdd(total, palette.dataSize, 'palette data size'), 0);
  for (const sprite of sprites) literalLength = checkedAdd(literalLength, sprite.dataSize, 'literal-data length');
  const total = checkedAdd(literalData, literalLength, 'candidate archive size');
  const buffer = Buffer.alloc(total);
  writeHeader(buffer, { paletteTable, spriteTable, literalData, literalLength, total }, sprites.length, paletteState.palettes.length);

  let dataOffset = 0;
  paletteState.palettes.forEach((palette, index) => {
    const offset = paletteTable + index * PALETTE_HEADER_SIZE;
    buffer.writeUInt16LE(palette.group, offset);
    buffer.writeUInt16LE(palette.number, offset + 2);
    buffer.writeUInt16LE(256, offset + 4);
    buffer.writeUInt16LE(palette.link, offset + 6);
    buffer.writeUInt32LE(palette.dataSize ? dataOffset : 0, offset + 8);
    buffer.writeUInt32LE(palette.dataSize, offset + 12);
    if (palette.dataSize) { palette.colors.copy(buffer, literalData + dataOffset); dataOffset += palette.dataSize; }
  });

  sprites.forEach((sprite, index) => {
    const offset = spriteTable + index * SPRITE_HEADER_SIZE;
    buffer.writeUInt16LE(sprite.group, offset);
    buffer.writeUInt16LE(sprite.number, offset + 2);
    buffer.writeUInt16LE(sprite.width, offset + 4);
    buffer.writeUInt16LE(sprite.height, offset + 6);
    buffer.writeInt16LE(sprite.axisX, offset + 8);
    buffer.writeInt16LE(sprite.axisY, offset + 10);
    buffer.writeUInt16LE(sprite.link, offset + 12);
    buffer[offset + 14] = FORMAT_PNG8;
    buffer[offset + 15] = COLOR_DEPTH_INDEXED8;
    buffer.writeUInt32LE(sprite.dataSize ? dataOffset : 0, offset + 16);
    buffer.writeUInt32LE(sprite.dataSize, offset + 20);
    buffer.writeUInt16LE(sprite.paletteIndex, offset + 24);
    buffer.writeUInt16LE(0, offset + 26);
    if (sprite.dataSize) {
      buffer.writeUInt32LE(sprite.pixelCount, literalData + dataOffset);
      sprite.png.copy(buffer, literalData + dataOffset + 4);
      dataOffset += sprite.dataSize;
    }
  });
  if (dataOffset !== literalLength) fail(`internal layout mismatch (${dataOffset} of ${literalLength} literal bytes written).`);
  return buffer;
}

module.exports = {
  COLOR_DEPTH_INDEXED8,
  FORMAT_PNG8,
  SUPPORTED_REQUIREMENTS,
  checkedLinkIndex,
  createSffV21Png8Bytes
};
