'use strict';

const crypto = require('crypto');
const { assertSffBuildSpecificationV2 } = require('./sff_build_specification_v2');

const SIGNATURE = Buffer.from('ElecbyteSpr\0', 'latin1');
const VERSION_1010 = Buffer.from([0, 1, 0, 1]);
const HEADER_SIZE = 512;
const SUBHEADER_SIZE = 32;
const MAX_U32 = 0xffffffff;
const MAX_DECODED_PIXELS = 100000000;
const MAX_DECODED_PIXELS_TOTAL = 100000000;

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function fail(message) { throw new Error(`Built-in SFF v1.01 PCX8 writer: ${message}`); }
function integer(value, label, minimum, maximum) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) fail(`${label} must be an integer from ${minimum} through ${maximum}; received ${value}.`);
  return result;
}
function checkedAdd(left, right, label) {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < left || result > MAX_U32) fail(`${label} exceeds the SFF 32-bit range.`);
  return result;
}
function checkedMultiply(left, right, label) {
  const result = left * right;
  if (!Number.isSafeInteger(result) || result > MAX_U32) fail(`${label} exceeds the SFF 32-bit range.`);
  return result;
}
function byteMap(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Buffer.isBuffer(value)) fail(`${label} must be an entryId-keyed object.`);
  return value;
}
function rgbBytes(palette, label) {
  if (!Array.isArray(palette.colors) || palette.colors.length !== 256) fail(`${label} must contain exactly 256 RGBA colors.`);
  const result = Buffer.alloc(768);
  palette.colors.forEach((color, index) => {
    if (!Array.isArray(color) || color.length !== 4) fail(`${label} color ${index} must be RGBA.`);
    const expectedAlpha = index === 0 ? 0 : 255;
    if (integer(color[3], `${label} color ${index} alpha`, 0, 255) !== expectedAlpha) fail(`${label} requires index 0 transparent and every other index opaque.`);
    for (let channel = 0; channel < 3; channel += 1) result[index * 3 + channel] = integer(color[channel], `${label} color ${index} channel ${channel}`, 0, 255);
  });
  return result;
}

function gateSpecification(specification) {
  assertSffBuildSpecificationV2(specification);
  if (specification.selection.targetId !== 'sff-v1' || specification.selection.backendId !== 'ikemaker-builtin-sff-v1' || specification.selection.adapter?.id !== 'builtin-v1-pcx8') fail('specification must explicitly select the built-in SFF v1.01 PCX8 backend.');
  const encoding = specification.encodingIntent || {}, compression = encoding.compression || {}, crop = encoding.crop || {}, storage = encoding.storage || {};
  if (encoding.reviewedConversions?.length) fail('reviewed conversions must be completed into sealed indexed sources before writing.');
  if (encoding.paletteMode !== 'individual-successive') fail('paletteMode must explicitly be individual-successive; global shared-palette mode is not certified.');
  const compressionModes = [compression.default, ...Object.values(compression.byEntryId || {})].filter(Boolean);
  if (!compressionModes.length || compressionModes.some(value => value !== 'pcx-rle8')) fail('compression must explicitly be pcx-rle8.');
  if ([crop.default, ...Object.values(crop.byEntryId || {})].filter(Boolean).some(value => value !== 'none')) fail('crop must be none.');
  const options = encoding.backendOptions?.['ikemaker-builtin-sff-v1'] || {};
  const activeOther = Object.entries(encoding.backendOptions || {}).filter(([key, value]) => key !== 'ikemaker-builtin-sff-v1' && value && Object.keys(value).length);
  if (activeOther.length) fail('only the selected backend may have active backend options.');
  const allowed = new Set(['paletteBySpriteEntryId']);
  if (Object.keys(options).some(key => !allowed.has(key))) fail('backend options contain an unsupported field.');
  const decisions = options.paletteBySpriteEntryId;
  if (!decisions || typeof decisions !== 'object' || Array.isArray(decisions)) fail('paletteBySpriteEntryId must explicitly choose own or previous for every sprite.');
  const spriteIds = new Set(specification.logical.sprites.map(entry => entry.entryId));
  if (Object.keys(decisions).length !== spriteIds.size || Object.keys(decisions).some(key => !spriteIds.has(key))) fail('paletteBySpriteEntryId must contain exactly every sprite entryId and no extras.');
  for (const [entryId, decision] of Object.entries(decisions)) if (!['own', 'previous'].includes(decision)) fail(`palette decision for ${entryId} must be own or previous.`);
  const paletteIds = new Set();
  specification.logical.palettes.forEach((palette, index) => {
    if (palette.group !== 0 || palette.number !== index) fail(`palette ${palette.entryId} must use synthetic identity 0,${index}.`);
    if (palette.contentLinkTargetEntryId) fail(`palette ${palette.entryId} cannot use a v2-style content link in SFF v1.`);
    paletteIds.add(palette.entryId);
  });
  const firstUses = [];
  for (const sprite of specification.logical.sprites) {
    if (!sprite.paletteEntryId || !paletteIds.has(sprite.paletteEntryId)) fail(`sprite ${sprite.entryId} must reference one logical palette.`);
    if (!firstUses.includes(sprite.paletteEntryId)) firstUses.push(sprite.paletteEntryId);
    const expected = sprite.contentLinkTargetEntryId ? 'share-identical' : 'preserve-separate';
    const selected = storage.byEntryId?.[sprite.entryId] || storage.spriteDefault || expected;
    if (selected !== expected) fail(`storage for sprite ${sprite.entryId} conflicts with its logical link.`);
  }
  if (firstUses.length !== specification.logical.palettes.length || firstUses.some((id, index) => id !== specification.logical.palettes[index].entryId)) fail('logical palette order must equal first physical sprite-use order, and every palette must be used.');
  return decisions;
}

function rleRow(row) {
  const chunks = [];
  for (let at = 0; at < row.length;) {
    const value = row[at]; let run = 1;
    while (at + run < row.length && row[at + run] === value && run < 63) run += 1;
    if (run > 1 || value >= 0xc0) chunks.push(Buffer.from([0xc0 | run, value]));
    else chunks.push(Buffer.from([value]));
    at += run;
  }
  return Buffer.concat(chunks);
}

function encodePcx(width, height, pixels, paletteRgb, omitPaletteRgb) {
  const bytesPerLine = width + (width & 1);
  if (bytesPerLine > 0xffff) fail(`width ${width} cannot be represented by the canonical even PCX stride.`);
  const header = Buffer.alloc(128);
  header[0] = 0x0a; header[1] = 5; header[2] = 1; header[3] = 8;
  header.writeUInt16LE(width - 1, 8); header.writeUInt16LE(height - 1, 10);
  header.writeUInt16LE(width, 12); header.writeUInt16LE(height, 14);
  header[65] = 1; header.writeUInt16LE(bytesPerLine, 66); header.writeUInt16LE(1, 68);
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(bytesPerLine); pixels.copy(row, 0, y * width, (y + 1) * width); rows.push(rleRow(row));
  }
  const marker = Buffer.from([0x0c]);
  const physical = Buffer.concat(omitPaletteRgb ? [header, ...rows, marker] : [header, ...rows, marker, paletteRgb]);
  return { physical, declaredLength: physical.length + (omitPaletteRgb ? 768 : 0), bytesPerLine };
}

function createSffV1Pcx8Bytes(specification, options = {}) {
  const decisions = gateSpecification(specification), supplied = byteMap(options.decodedPixelsByEntryId || {}, 'decodedPixelsByEntryId');
  const expectedIds = new Set(specification.logical.sprites.map(entry => entry.entryId));
  if (Object.keys(supplied).length !== expectedIds.size || Object.keys(supplied).some(key => !expectedIds.has(key))) fail('decodedPixelsByEntryId must contain exactly every logical sprite entryId and no extras.');
  const palettes = new Map(specification.logical.palettes.map((entry, index) => [entry.entryId, { entry, index, rgb: rgbBytes(entry, `palette ${entry.entryId}`) }]));
  const positions = new Map(), rows = [];
  let previousPalette = null, aggregatePixels = 0;
  specification.logical.sprites.forEach((entry, index) => {
    const label = `sprite ${entry.entryId || `#${index}`}`;
    if (positions.has(entry.entryId)) fail(`${label} repeats an entryId.`);
    if (entry.pixels?.kind !== 'indexed8' || entry.source?.kind !== 'complete-image') fail(`${label} must be a complete-image indexed8 source.`);
    const width = integer(entry.width, `${label} width`, 1, 0xffff), height = integer(entry.height, `${label} height`, 1, 0xffff);
    const pixelCount = checkedMultiply(width, height, `${label} pixel count`);
    if (pixelCount > MAX_DECODED_PIXELS) fail(`${label} decoded pixel count exceeds ${MAX_DECODED_PIXELS}.`);
    aggregatePixels = checkedAdd(aggregatePixels, pixelCount, 'aggregate decoded pixels');
    if (aggregatePixels > MAX_DECODED_PIXELS_TOTAL) fail(`aggregate decoded pixels exceed ${MAX_DECODED_PIXELS_TOTAL}.`);
    let pixels = supplied[entry.entryId]; if (pixels instanceof Uint8Array && !Buffer.isBuffer(pixels)) pixels = Buffer.from(pixels);
    if (!Buffer.isBuffer(pixels) || pixels.length !== pixelCount) fail(`${label} requires exactly ${pixelCount} decoded index bytes.`);
    const decodedHash = sha256(pixels);
    if (decodedHash !== entry.pixels.decodedHash || decodedHash !== entry.source.decodedHash) fail(`${label} decoded index bytes drifted from the sealed source.`);
    const palette = palettes.get(entry.paletteEntryId); if (!palette) fail(`${label} assigns a missing palette.`);
    positions.set(entry.entryId, index);
    const row = { entry, index, width, height, pixels: Buffer.from(pixels), decodedHash, palette, link: null, paletteSame: false, payload: null, declaredLength: 0 };
    if (entry.contentLinkTargetEntryId) {
      const target = positions.get(entry.contentLinkTargetEntryId);
      if (!Number.isInteger(target) || target >= index) fail(`${label} must link directly backward.`);
      if (target > 0xffff) fail(`${label} link target exceeds 16-bit SFF v1 addressing.`);
      const owner = rows[target];
      if (owner.link !== null) fail(`${label} requests unproven multihop link emission.`);
      if (owner.width !== width || owner.height !== height || owner.decodedHash !== decodedHash || !owner.palette.rgb.equals(palette.rgb)) fail(`${label} differs from its stored link target.`);
      if (!previousPalette || !previousPalette.rgb.equals(palette.rgb)) fail(`${label} linked palette must equal the immediately previous effective palette.`);
      if (decisions[entry.entryId] !== 'previous') fail(`${label} linked rows require explicit previous-palette intent.`);
      row.link = target; row.paletteSame = true;
    } else {
      const reuse = decisions[entry.entryId] === 'previous';
      if (reuse && (!previousPalette || !previousPalette.rgb.equals(palette.rgb))) fail(`${label} can reuse only the immediately previous identical effective palette.`);
      row.paletteSame = reuse;
      const encoded = encodePcx(width, height, row.pixels, palette.rgb, reuse);
      row.payload = encoded.physical; row.declaredLength = encoded.declaredLength; row.bytesPerLine = encoded.bytesPerLine;
    }
    previousPalette = palette; rows.push(row);
  });
  if (rows.length && rows[0].paletteSame) fail('the first sprite must own its palette.');
  let size = HEADER_SIZE;
  for (const row of rows) size = checkedAdd(size, checkedAdd(SUBHEADER_SIZE, row.payload?.length || 0, 'sprite record size'), 'archive size');
  const buffer = Buffer.alloc(size); SIGNATURE.copy(buffer, 0); VERSION_1010.copy(buffer, 12);
  buffer.writeUInt32LE(new Set(rows.map(row => row.entry.group)).size, 16); buffer.writeUInt32LE(rows.length, 20); buffer.writeUInt32LE(HEADER_SIZE, 24); buffer.writeUInt32LE(SUBHEADER_SIZE, 28); buffer[32] = 0;
  let cursor = HEADER_SIZE;
  for (const row of rows) {
    const next = cursor + SUBHEADER_SIZE + (row.payload?.length || 0);
    buffer.writeUInt32LE(next, cursor); buffer.writeUInt32LE(row.declaredLength, cursor + 4);
    buffer.writeInt16LE(integer(row.entry.axisX, `sprite ${row.entry.entryId} axisX`, -0x8000, 0x7fff), cursor + 8);
    buffer.writeInt16LE(integer(row.entry.axisY, `sprite ${row.entry.entryId} axisY`, -0x8000, 0x7fff), cursor + 10);
    buffer.writeUInt16LE(integer(row.entry.group, `sprite ${row.entry.entryId} group`, 0, 0xffff), cursor + 12);
    buffer.writeUInt16LE(integer(row.entry.number, `sprite ${row.entry.entryId} number`, 0, 0xffff), cursor + 14);
    buffer.writeUInt16LE(row.link === null ? 0 : row.link, cursor + 16); buffer[cursor + 18] = row.paletteSame ? 1 : 0;
    if (row.payload) row.payload.copy(buffer, cursor + SUBHEADER_SIZE); cursor = next;
  }
  if (cursor !== buffer.length) fail('internal packed-layout mismatch.');
  return buffer;
}

module.exports = { SIGNATURE, VERSION_1010, HEADER_SIZE, SUBHEADER_SIZE, createSffV1Pcx8Bytes, encodePcx };
