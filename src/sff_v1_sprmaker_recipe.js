'use strict';

const crypto = require('crypto');
const { assertSffBuildSpecificationV2 } = require('./sff_build_specification_v2');
const { hashCanonical } = require('./sff_capability_report');

const OUTPUT_ALIAS = 'OUTPUT.SFF';
const MAX_SPRITES = 1000000;
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(freeze); return value; }
function alias(index) { if (!Number.isSafeInteger(index) || index < 0 || index >= MAX_SPRITES) throw new Error('SprMaker recipe supports at most 1,000,000 sprites.'); return `S${String(index).padStart(6, '0')}.PCX`; }
function integer(value, label, min, max) { if (!/^-?\d+$/.test(String(value))) throw new Error(`${label} must use canonical decimal integer text.`); const result = Number(value); if (!Number.isSafeInteger(result) || result < min || result > max) throw new Error(`${label} must be an integer from ${min} through ${max}.`); return result; }
function decisions(specification) { const value = specification.encodingIntent?.backendOptions?.['elecbyte-sprmaker-sff-v1']?.paletteBySpriteEntryId; if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('SprMaker recipe requires explicit paletteBySpriteEntryId decisions.'); return value; }
function gate(specification) {
  assertSffBuildSpecificationV2(specification);
  if (specification.selection.targetId !== 'sff-v1' || specification.selection.backendId !== 'elecbyte-sprmaker-sff-v1' || specification.selection.adapter?.id !== 'sprmaker-v1') throw new Error('SprMaker recipe requires the explicit external SFF v1 backend.');
  if (specification.logical.sprites.length > MAX_SPRITES) throw new Error('SprMaker recipe sprite count exceeds the bounded alias space.');
  if (specification.logical.sprites.some(row => row.contentLinkTargetEntryId)) throw new Error('SprMaker automatic duplicate linking is unproven and must remain off.');
  if (specification.logical.palettes.some(row => row.contentLinkTargetEntryId)) throw new Error('SprMaker v1 recipe cannot encode palette-table links.');
  if (specification.encodingIntent.paletteMode !== 'individual-successive') throw new Error('SprMaker global shared-palette mode is not execution-ready.');
  const compression = [specification.encodingIntent.compression?.default, ...Object.values(specification.encodingIntent.compression?.byEntryId || {})].filter(Boolean);
  if (!compression.length || compression.some(value => value !== 'pcx-rle8')) throw new Error('SprMaker recipe requires explicit PCX RLE8 input.');
  if ([specification.encodingIntent.crop?.default, ...Object.values(specification.encodingIntent.crop?.byEntryId || {})].filter(Boolean).some(value => value !== 'none')) throw new Error('SprMaker automatic crop is unproven and must remain off.');
  const paletteIds = new Set(), firstUses = [];
  specification.logical.palettes.forEach((palette, index) => { if (palette.group !== 0 || palette.number !== index || palette.contentLinkTargetEntryId) throw new Error(`SprMaker logical palette ${palette.entryId} must be synthetic 0,${index} without links.`); if (!Array.isArray(palette.colors) || palette.colors.length !== 256 || palette.colors.some((color, colorIndex) => !Array.isArray(color) || color.length !== 4 || color[3] !== (colorIndex === 0 ? 0 : 255))) throw new Error(`SprMaker logical palette ${palette.entryId} must be binary-transparent RGBA256.`); paletteIds.add(palette.entryId); });
  const choice = decisions(specification), ids = new Set(specification.logical.sprites.map(row => row.entryId));
  if (Object.keys(choice).length !== ids.size || Object.keys(choice).some(id => !ids.has(id))) throw new Error('SprMaker palette decisions must contain exactly every sprite entryId.');
  let previousPalette = null;
  for (const row of specification.logical.sprites) { if (!paletteIds.has(row.paletteEntryId)) throw new Error(`SprMaker sprite ${row.entryId} references a missing logical palette.`); if (!firstUses.includes(row.paletteEntryId)) firstUses.push(row.paletteEntryId); if (!['own', 'previous'].includes(choice[row.entryId])) throw new Error(`SprMaker palette decision for ${row.entryId} is invalid.`); if (choice[row.entryId] === 'previous' && (!previousPalette || previousPalette !== row.paletteEntryId)) throw new Error(`SprMaker sprite ${row.entryId} may reuse only the immediately previous logical palette.`); const storage = specification.encodingIntent.storage?.byEntryId?.[row.entryId] || specification.encodingIntent.storage?.spriteDefault || 'preserve-separate'; if (storage !== 'preserve-separate') throw new Error(`SprMaker sprite ${row.entryId} must disable automatic duplicate linking.`); previousPalette = row.paletteEntryId; }
  if (firstUses.length !== specification.logical.palettes.length || firstUses.some((id, index) => id !== specification.logical.palettes[index].entryId)) throw new Error('SprMaker logical palette order must equal first sprite-use order, with every palette used.');
  return choice;
}
function parseGeneratedSprMakerRecipe(value) {
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) throw new Error('Exact generated SprMaker recipe bytes are required.');
  const bytes = Buffer.from(value);
  if (!bytes.length || bytes.length > 32 * 1024 * 1024 || bytes.some(byte => byte > 0x7f || byte === 0)) throw new Error('Generated SprMaker recipe must be bounded 7-bit ASCII.');
  const text = bytes.toString('ascii'); if (!text.endsWith('\r\n') || /(^|[^\r])\n|\r(?!\n)/.test(text)) throw new Error('Generated SprMaker recipe must use exact CRLF lines.');
  const lines = text.slice(0, -2).split('\r\n'); if (lines.shift() !== OUTPUT_ALIAS) throw new Error('Generated SprMaker output alias drifted.');
  const rows = []; let at = 0;
  while (at < lines.length) {
    let paletteDecision = 'own';
    if (lines[at] === '#') { if (lines[at + 1] !== '1' || lines[at + 2] !== '2') throw new Error('Generated SprMaker palette prompt sequence is invalid.'); paletteDecision = 'previous'; at += 3; }
    const sourceAlias = lines[at++], match = /^S(\d{6})\.PCX$/.exec(sourceAlias || ''); if (!match || Number(match[1]) !== rows.length) throw new Error('Generated SprMaker PCX aliases must be ordered deterministic 8.3 names.');
    if (at + 4 > lines.length) throw new Error('Generated SprMaker sprite row is truncated.');
    rows.push({ sourceAlias, group: integer(lines[at++], 'sprite group', 0, 65535), number: integer(lines[at++], 'sprite number', 0, 65535), axisX: integer(lines[at++], 'sprite axis X', -32768, 32767), axisY: integer(lines[at++], 'sprite axis Y', -32768, 32767), paletteDecision });
  }
  return freeze({ outputAlias: OUTPUT_ALIAS, rows, byteHash: sha(bytes), byteLength: bytes.length });
}
function createSprMakerRecipe(specification) {
  const choice = gate(specification), lines = [OUTPUT_ALIAS], rows = specification.logical.sprites.map((entry, index) => {
    const paletteDecision = choice[entry.entryId], sourceAlias = alias(index);
    if (paletteDecision === 'previous') lines.push('#', '1', '2');
    lines.push(sourceAlias, String(entry.group), String(entry.number), String(entry.axisX), String(entry.axisY));
    return { entryId: entry.entryId, sourceAlias, group: entry.group, number: entry.number, axisX: entry.axisX, axisY: entry.axisY, paletteEntryId: entry.paletteEntryId, paletteDecision };
  });
  const recipeBytes = Buffer.from(`${lines.join('\r\n')}\r\n`, 'ascii');
  const parsed = parseGeneratedSprMakerRecipe(recipeBytes), expectedRows = rows.map(({ entryId, paletteEntryId, ...row }) => row);
  if (JSON.stringify(parsed.rows) !== JSON.stringify(expectedRows)) throw new Error('Generated SprMaker recipe did not round-trip independently.');
  const metadata = { schema: 'ikemaker.sff-v1-sprmaker-recipe', version: 1, specificationHash: specification.specificationHash, outputAlias: OUTPUT_ALIAS, arguments: [], stdinByteHash: sha(recipeBytes), stdinByteLength: recipeBytes.length, encoding: 'ascii-crlf', rows, unprovenFeatures: rows.some(row => row.paletteDecision === 'previous') ? ['palette.previous'] : [], executable: false };
  metadata.recipeHash = hashCanonical(metadata); const sealed = Buffer.from(recipeBytes);
  return Object.freeze({ ...freeze(metadata), readBytes: () => Buffer.from(sealed) });
}
function assertSprMakerRecipe(value, expectedHash = value?.recipeHash) {
  const copy = { ...value }; delete copy.recipeHash; delete copy.readBytes;
  if (value?.schema !== 'ikemaker.sff-v1-sprmaker-recipe' || value.version !== 1 || value.recipeHash !== expectedHash || hashCanonical(copy) !== value.recipeHash || typeof value.readBytes !== 'function' || sha(value.readBytes()) !== value.stdinByteHash || value.outputAlias !== OUTPUT_ALIAS || value.encoding !== 'ascii-crlf' || value.executable !== false || !Array.isArray(value.arguments) || value.arguments.length !== 0 || !Array.isArray(value.rows) || !Array.isArray(value.unprovenFeatures)) throw new Error('SprMaker recipe contract drifted.');
  const parsed = parseGeneratedSprMakerRecipe(value.readBytes()), rows = value.rows.map(({ entryId, paletteEntryId, ...row }) => row);
  const unproven = parsed.rows.some(row => row.paletteDecision === 'previous') ? ['palette.previous'] : [];
  if (parsed.outputAlias !== value.outputAlias || parsed.byteHash !== value.stdinByteHash || parsed.byteLength !== value.stdinByteLength || JSON.stringify(parsed.rows) !== JSON.stringify(rows) || JSON.stringify(value.unprovenFeatures) !== JSON.stringify(unproven)) throw new Error('SprMaker recipe bytes and metadata disagree.');
  return value;
}

module.exports = { OUTPUT_ALIAS, MAX_SPRITES, createSprMakerRecipe, assertSprMakerRecipe, parseGeneratedSprMakerRecipe };
