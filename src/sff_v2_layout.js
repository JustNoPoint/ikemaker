'use strict';

// SFF v2.x top-level layout audit and repair.
//
// Every SFF v2 header is 512 bytes. Offset 64 holds the translated-data (TDATA)
// length and 68..511 are reserved/comment bytes. Older IKEMaker writers used a
// 64-byte header and placed the palette table at offset 64, so the first
// palette's group/number were read by MUGEN as the TDATA length. In-place edits
// (palette Save/Replace, palette assignment, axis, group rename) preserve
// whatever layout the file already has, so such a file stayed broken after an
// ordinary Save. This module detects that layout and rebuilds it canonically
// without changing any palette, sprite header value or payload byte.

const HEADER_SIZE = 512;
const SIGNATURE = Buffer.from('ElecbyteSpr\0', 'latin1');
const VERSION_20 = Buffer.from([0, 0, 0, 2]);
const VERSION_21 = Buffer.from([0, 1, 0, 2]);
// asset_templates.blankSff('2.1') used to write these bytes (reads as 2.1.0.0).
const MISLABELED_21 = Buffer.from([0, 0, 1, 2]);

const u32 = (buffer, at) => buffer.readUInt32LE(at);

function isSffV2(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 16 && buffer.subarray(0, 12).equals(SIGNATURE) && buffer[15] === 2;
}

function sffV2LayoutIssues(buffer) {
  if (!isSffV2(buffer)) return [];
  const issues = [];
  if (buffer.length < HEADER_SIZE) issues.push({ code: 'header-truncated', detail: `the file is ${buffer.length} bytes; an SFF v2 header is ${HEADER_SIZE} bytes.` });
  const version = buffer.subarray(12, 16), compatible = buffer.length >= 28 ? buffer.subarray(24, 28) : Buffer.alloc(0);
  if (version.equals(MISLABELED_21)) issues.push({ code: 'version-mislabeled', detail: `version bytes 00 00 01 02 (compatible ${compatible.toString('hex')}) are not a MUGEN SFF version; SFF v2.01 is 00 01 00 02.` });
  if (buffer.length < 68) return issues;
  const spriteTable = u32(buffer, 36), sprites = u32(buffer, 40), paletteTable = u32(buffer, 44), palettes = u32(buffer, 48);
  const literalData = u32(buffer, 52), literalLength = u32(buffer, 56), translatedData = u32(buffer, 60), translatedLength = u32(buffer, 64);
  if (sprites && spriteTable < HEADER_SIZE) issues.push({ code: 'sprite-table-in-header', detail: `the sprite table starts at ${spriteTable}, inside the ${HEADER_SIZE}-byte header.` });
  if (palettes && paletteTable < HEADER_SIZE) issues.push({ code: 'palette-table-in-header', detail: `the palette table starts at ${paletteTable}, inside the ${HEADER_SIZE}-byte header (offset 64 is the TDATA length).` });
  if ((literalLength || sprites || palettes) && literalData < HEADER_SIZE) issues.push({ code: 'literal-data-in-header', detail: `literal data starts at ${literalData}, inside the ${HEADER_SIZE}-byte header.` });
  if (translatedData < Math.min(HEADER_SIZE, buffer.length) || translatedData > buffer.length || translatedData + translatedLength > buffer.length) issues.push({ code: 'translated-data-out-of-range', detail: `TDATA offset ${translatedData} + length ${translatedLength} does not fit the ${buffer.length}-byte file.` });
  return issues;
}

function blankCanonical(source) {
  const output = Buffer.alloc(HEADER_SIZE);
  SIGNATURE.copy(output, 0);
  const version = source.subarray(12, 16).equals(VERSION_20) ? VERSION_20 : VERSION_21;
  version.copy(output, 12); version.copy(output, 24);
  output.writeUInt32LE(HEADER_SIZE, 36); output.writeUInt32LE(HEADER_SIZE, 44); output.writeUInt32LE(HEADER_SIZE, 52); output.writeUInt32LE(HEADER_SIZE, 60);
  return output;
}

// Returns { buffer, repaired, issues }. When the layout is already sound the
// input buffer is returned unchanged (same object).
function canonicalSffV2Layout(buffer, filename = '') {
  const issues = sffV2LayoutIssues(buffer);
  if (!issues.length) return { buffer, repaired: false, issues };
  const sprites = buffer.length >= 44 ? u32(buffer, 40) : 0, palettes = buffer.length >= 52 ? u32(buffer, 48) : 0;
  if (!sprites && !palettes) return { buffer: blankCanonical(buffer), repaired: true, issues };
  let input = buffer;
  const version = buffer.subarray(12, 16), compatible = buffer.subarray(24, 28);
  if (version.equals(MISLABELED_21)) {
    input = Buffer.from(buffer);
    VERSION_21.copy(input, 12); VERSION_21.copy(input, 24);
  } else if ((version.equals(VERSION_20) || version.equals(VERSION_21)) && !compatible.equals(version)) {
    // A rebuild is needed anyway; write the compatible-version Elecbyte tools use.
    input = Buffer.from(buffer);
    version.copy(input, 24);
  }
  const { parseSffBuffer } = require('./sff_reader');
  const { relayoutSffV2 } = require('./sff_direct_delete');
  const archive = parseSffBuffer(input, filename);
  // Older compact writers never stored translated data, so the bogus TDATA
  // length cannot move a sprite. Refuse rather than guess if one claims to.
  const translated = archive.sprites.filter(sprite => sprite.dataSize && (sprite.flags & 1));
  if (translated.length && issues.some(issue => issue.code === 'palette-table-in-header')) throw new Error('SFF layout repair: a compact-header archive declares translated sprite data, so its TDATA length cannot be trusted. Rebuild it from sources instead.');
  const rebuilt = relayoutSffV2(archive).buffer;
  const remaining = sffV2LayoutIssues(rebuilt);
  if (remaining.length) throw new Error(`SFF layout repair did not produce a canonical archive: ${remaining.map(issue => issue.code).join(', ')}.`);
  return { buffer: rebuilt, repaired: true, issues };
}

function layoutRepairNotice(result) {
  if (!result?.repaired) return '';
  return ` The file also had a non-standard SFF v2 header layout (${result.issues.map(issue => issue.code).join(', ')}) that can crash MUGEN; it was rewritten with the standard 512-byte header. No palette, sprite or image values changed.`;
}

module.exports = { HEADER_SIZE, sffV2LayoutIssues, canonicalSffV2Layout, layoutRepairNotice };
