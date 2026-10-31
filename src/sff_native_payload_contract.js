'use strict';

const crypto = require('crypto');
const { parseSffBuffer } = require('./sff_reader');
const { inspectPreparedPng } = require('./sff_source_preparation');
const { assertSnapshot } = require('./sff_extraction_scope_contract');

function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(freeze); return value; }
function range(buffer, offset, length, label) { if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > buffer.length) throw new Error(`${label} is outside the sealed SFF archive.`); return Buffer.from(buffer.subarray(offset, offset + length)); }
function pngLength(bytes) {
  if (bytes.length < 20 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 0;
  let at = 8;
  while (at + 12 <= bytes.length) { const length = bytes.readUInt32BE(at), type = bytes.subarray(at + 4, at + 8).toString('ascii'), end = at + 12 + length; if (end > bytes.length) return 0; at = end; if (type === 'IEND') return at; }
  return 0;
}
function resolveOwner(archive, physicalIndex) {
  let index = physicalIndex; const seen = new Set();
  while (true) { if (seen.has(index)) throw new Error(`Circular SFF sprite link at physical index ${index}.`); seen.add(index); const sprite = archive.sprites[index]; if (!sprite) throw new Error(`Missing SFF sprite physical index ${index}.`); if (Number(sprite.dataSize) > 0) return { index, sprite }; index = Number(sprite.link); }
}
function assertParsedEntry(snapshot, sprite, physicalIndex) {
  const sealed = snapshot.entries[physicalIndex];
  const fields = ['group','number','width','height','axisX','axisY','paletteIndex','format','colorDepth','dataOffset','dataSize','headerOffset'];
  if (!sealed || fields.some((field) => Number(sprite[field]) !== Number(field === 'paletteIndex' ? sealed.palettePhysicalIndex : sealed[field])) || Boolean(sprite.legacy) !== Boolean(sealed.legacy)) throw new Error(`Reparsed SFF sprite ${physicalIndex} does not match the sealed extraction snapshot.`);
  if (sealed.storageKind === 'linked' && Number(sprite.link) !== sealed.linkPhysicalIndex) throw new Error(`Reparsed SFF sprite link ${physicalIndex} does not match the sealed extraction snapshot.`);
}
function inspectNativeSprite(snapshot, archiveBytes, physicalIndex, options = {}) {
  if (!snapshot || !Buffer.isBuffer(archiveBytes) && !(archiveBytes instanceof Uint8Array)) throw new Error('A sealed extraction snapshot and exact archive bytes are required.');
  assertSnapshot(snapshot);
  const bytes = Buffer.from(archiveBytes); if (sha(bytes) !== snapshot.archiveByteHash || bytes.length !== snapshot.archiveByteLength) throw new Error('Archive bytes drifted from the extraction snapshot.');
  const archive = (options.parse || parseSffBuffer)(Buffer.from(bytes), snapshot.resourceIdentity), selected = archive.sprites[physicalIndex];
  if (!selected) throw new Error(`Missing SFF sprite physical index ${physicalIndex}.`);
  assertParsedEntry(snapshot, selected, physicalIndex);
  const resolved = resolveOwner(archive, physicalIndex), linked = resolved.index !== physicalIndex, sprite = resolved.sprite; assertParsedEntry(snapshot, sprite, resolved.index);
  if (linked) return freeze({ kind: 'linked-no-own-payload', selectedPhysicalIndex: physicalIndex, resolvedDataOwnerPhysicalIndex: resolved.index, ownsBytes: false, ownerEvidence: { group: sprite.group, number: sprite.number }, caveats: ['The selected physical entry owns no bytes; decoded export may resolve the linked data owner.'] });

  if (sprite.legacy) {
    const header = Number(sprite.headerOffset), originalSize = range(bytes, header + 4, 4, 'SFF v1 subfile size').readUInt32LE(0), offset = header + 32;
    const nextHeader = range(bytes, header, 4, 'SFF v1 next subfile offset').readUInt32LE(0);
    if (nextHeader && offset + originalSize > nextHeader) throw new Error('SFF v1 PCX subfile overlaps the next physical subheader.');
    const payload = range(bytes, offset, originalSize, 'SFF v1 PCX subfile');
    const headerValid = payload.length >= 128 && payload[0] === 0x0a && [0, 1].includes(payload[2]) && payload[3] === 8 && payload[65] === 1;
    const terminalPalette = payload.length >= 897 && payload[payload.length - 769] === 0x0c;
    const paletteSame = bytes[header + 18] !== 0;
    const standalone = headerValid && terminalPalette && !paletteSame;
    return freeze({ kind: standalone ? 'embedded-native-image' : 'archive-native-payload', selectedPhysicalIndex: physicalIndex, resolvedDataOwnerPhysicalIndex: physicalIndex, ownsBytes: true, mediaType: standalone ? 'image/x-pcx' : 'application/x-ikemen-sff-v1-pcx-payload', offset, length: originalSize, byteHash: sha(payload), paletteSame, caveats: standalone ? [] : ['Palette-suppressed/shared-palette PCX bytes are not an independently usable 256-color PCX.'] });
  }

  const stored = range(bytes, Number(sprite.dataOffset), Number(sprite.dataSize), `SFF v2 sprite payload ${physicalIndex}`);
  if ([10, 11, 12].includes(Number(sprite.format))) {
    if (stored.length < 4) throw new Error('Embedded SFF v2 PNG payload is truncated before its archive prefix.');
    const decodedSize = stored.readUInt32LE(0), bytesPerPixel = Number(sprite.format) === 10 ? 1 : Number(sprite.format) === 11 ? 3 : 4, expectedDecodedSize = Number(sprite.width) * Number(sprite.height) * bytesPerPixel;
    if (!Number.isSafeInteger(expectedDecodedSize) || expectedDecodedSize < 1 || decodedSize !== expectedDecodedSize) throw new Error(`Embedded SFF v2 PNG archive prefix declares ${decodedSize}; expected ${expectedDecodedSize}.`);
    const png = stored.subarray(4), complete = pngLength(png);
    if (!complete || complete !== png.length) throw new Error('Embedded SFF v2 PNG is incomplete or has trailing payload bytes.');
    const pngInfo = inspectPreparedPng(Buffer.from(png), `SFF v2 sprite ${physicalIndex}`);
    if (pngInfo.width !== Number(sprite.width) || pngInfo.height !== Number(sprite.height)) throw new Error('Embedded SFF v2 PNG dimensions do not match its physical sprite header.');
    const requiredColorType = Number(sprite.format) === 10 ? 3 : Number(sprite.format) === 11 ? 2 : 6;
    if (pngInfo.bitDepth !== 8 || pngInfo.colorType !== requiredColorType) throw new Error(`Embedded SFF v2 format ${sprite.format} requires an 8-bit PNG color type ${requiredColorType}.`);
    return freeze({ kind: 'embedded-native-image', selectedPhysicalIndex: physicalIndex, resolvedDataOwnerPhysicalIndex: physicalIndex, ownsBytes: true, mediaType: 'image/png', offset: Number(sprite.dataOffset) + 4, length: png.length, byteHash: sha(png), archivePrefix: { offset: Number(sprite.dataOffset), length: 4, byteHash: sha(stored.subarray(0, 4)), decodedSize }, caveats: Number(sprite.format) === 10 ? ['Indexed PNG pixels use the SFF palette table as authoritative display colors; embedded PLTE colors may differ.'] : [] });
  }
  return freeze({ kind: 'archive-native-payload', selectedPhysicalIndex: physicalIndex, resolvedDataOwnerPhysicalIndex: physicalIndex, ownsBytes: true, mediaType: 'application/x-ikemen-sff-sprite-payload', codec: ({0:'raw',2:'rle8',3:'rle5',4:'lz5'})[Number(sprite.format)] || `unknown-${sprite.format}`, offset: Number(sprite.dataOffset), length: stored.length, byteHash: sha(stored), caveats: ['This archive codec payload is not a standalone image.'] });
}

function copyNativeBytes(archiveBytes, inspection) { if (!inspection?.ownsBytes) throw new Error('The selected entry has no native bytes of its own.'); const bytes = range(Buffer.from(archiveBytes), inspection.offset, inspection.length, 'native extraction range'); if (sha(bytes) !== inspection.byteHash) throw new Error('Native extraction bytes drifted from the inspected archive range.'); return bytes; }

module.exports = { inspectNativeSprite, copyNativeBytes };
