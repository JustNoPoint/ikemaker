'use strict';

const { readSff, paletteRgba } = require('./sff_reader');

function identity(group, index) {
  return `${Number(group)},${Number(index)}`;
}

function colorsEqual(a, b) { return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((color, index) => color.length === b[index]?.length && color.every((value, channel) => Number(value) === Number(b[index][channel]))); }

function firstDefined(object, names) {
  for (const name of names) if (object && object[name] !== undefined && object[name] !== null && object[name] !== '') return object[name];
  return undefined;
}

function expectedFormat(value) {
  if (value === undefined) return undefined;
  if (Number.isInteger(Number(value))) return Number(value);
  return { raw: 0, rle8: 2, rle5: 3, lz5: 4, png8: 10, png24: 11, png32: 12 }[String(value).trim().toLowerCase()];
}

function linkErrors(entries, label) {
  const errors = [];
  for (const entry of entries || []) {
    if (Number(entry.dataSize) !== 0) continue;
    const seen = new Set([entry.index]);
    let cursor = entry;
    while (Number(cursor.dataSize) === 0) {
      const target = Number(cursor.link);
      if (!Number.isSafeInteger(target) || target < 0 || target >= entries.length) {
        errors.push(`${label} #${entry.index} links outside the archive to #${cursor.link}`);
        break;
      }
      if (seen.has(target)) {
        errors.push(`${label} #${entry.index} contains a link cycle through #${target}`);
        break;
      }
      seen.add(target);
      cursor = entries[target];
    }
  }
  return errors;
}

function dataBoundsErrors(archive) {
  if (!Buffer.isBuffer(archive.buffer)) return [];
  const errors = [];
  for (const [kind, entries] of [['sprite', archive.sprites || []], ['palette', archive.palettes || []]]) {
    for (const entry of entries) {
      if (!Number(entry.dataSize)) continue;
      const offset = kind === 'palette' && !entry.legacy ? Number(archive.header.literalDataOffset) + Number(entry.dataOffset) : Number(entry.dataOffset);
      const size = Number(entry.dataSize);
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 || offset + size > archive.buffer.length) {
        errors.push(`${kind} #${entry.index} data range ${offset}+${size} exceeds ${archive.buffer.length}`);
      }
    }
  }
  return errors;
}

function verifyBuiltArchive(filename, expectedSprites, expectedPalettes = null, options = {}) {
  const archive = readSff(filename);
  const expected = new Map();
  const actual = new Map();
  for (const sprite of expectedSprites || []) {
    const key = identity(sprite.group ?? sprite.Group ?? sprite.ComputedGroup, sprite.index ?? sprite.Index ?? sprite.ImageIndex);
    expected.set(key, (expected.get(key) || 0) + 1);
  }
  for (const sprite of archive.sprites || []) {
    const key = identity(sprite.group, sprite.number);
    actual.set(key, (actual.get(key) || 0) + 1);
  }
  const missing = [], unexpected = [], duplicates = [];
  for (const [key, count] of expected) {
    const found = actual.get(key) || 0;
    if (found < count) missing.push(key);
    if (found > count) duplicates.push(key);
  }
  for (const [key, count] of actual) {
    const wanted = expected.get(key) || 0;
    if (count > wanted && wanted === 0) unexpected.push(key);
    if (count > 1 && wanted <= 1 && !duplicates.includes(key)) duplicates.push(key);
  }
  const expectedOrder = (expectedSprites || []).map((sprite) => identity(sprite.group ?? sprite.Group ?? sprite.ComputedGroup, sprite.index ?? sprite.Index ?? sprite.ImageIndex));
  const actualOrder = (archive.sprites || []).map((sprite) => identity(sprite.group, sprite.number));
  const orderMismatches = [];
  for (let index = 0; index < Math.max(expectedOrder.length, actualOrder.length); index++) {
    if (expectedOrder[index] !== actualOrder[index]) orderMismatches.push({ position: index, expected: expectedOrder[index] ?? 'none', actual: actualOrder[index] ?? 'none' });
  }
  const paletteCounts = new Map(), paletteById = new Map(); for (const palette of archive.palettes || []) { const key = identity(palette.group, palette.number); paletteCounts.set(key, (paletteCounts.get(key) || 0) + 1); if (!paletteById.has(key)) paletteById.set(key, palette); }
  const expectedPaletteIds = new Set((expectedPalettes || []).map((palette) => identity(palette.group, palette.number))), missingPalettes = [], changedPalettes = [], brokenAliases = [], unexpectedPalettes = expectedPalettes ? [...paletteById.keys()].filter((key) => !expectedPaletteIds.has(key)) : [], duplicatePaletteIds = expectedPalettes ? [...paletteCounts].filter(([, count]) => count > 1).map(([key]) => key) : [], assignmentMismatches = [];
  for (const expectedPalette of expectedPalettes || []) {
    const key = identity(expectedPalette.group, expectedPalette.number), palette = paletteById.get(key);
    if (!palette) { missingPalettes.push(key); continue; }
    if (!colorsEqual(paletteRgba(archive, palette.index), expectedPalette.colors)) changedPalettes.push(key);
    if (expectedPalette.aliasOf) { const target = paletteById.get(identity(expectedPalette.aliasOf.group, expectedPalette.aliasOf.number)); if (!target || palette.dataSize !== 0 || palette.link !== target.index) brokenAliases.push(`${key}→${identity(expectedPalette.aliasOf.group, expectedPalette.aliasOf.number)}`); }
  }
  const actualSprites = new Map((archive.sprites || []).map((sprite) => [identity(sprite.group, sprite.number), sprite]));
  for (const expectedSprite of expectedSprites || []) { const wanted = String(expectedSprite.palette ?? expectedSprite.Palette ?? ''); if (!/^\d+\s*,\s*\d+$/.test(wanted)) continue; const sprite = actualSprites.get(identity(expectedSprite.group ?? expectedSprite.Group ?? expectedSprite.ComputedGroup, expectedSprite.index ?? expectedSprite.Index ?? expectedSprite.ImageIndex)), palette = sprite && archive.palettes?.[sprite.paletteIndex], actualId = palette ? identity(palette.group, palette.number) : 'none'; if (actualId !== wanted.replace(/\s+/g, '')) assignmentMismatches.push(`${identity(expectedSprite.group ?? expectedSprite.Group ?? expectedSprite.ComputedGroup, expectedSprite.index ?? expectedSprite.Index ?? expectedSprite.ImageIndex)}:${actualId}≠${wanted}`); }
  const spriteMetadataMismatches = [];
  for (const expectedSprite of expectedSprites || []) {
    const key = identity(expectedSprite.group ?? expectedSprite.Group ?? expectedSprite.ComputedGroup, expectedSprite.index ?? expectedSprite.Index ?? expectedSprite.ImageIndex);
    const sprite = actualSprites.get(key);
    if (!sprite) continue;
    const checks = [
      ['width', firstDefined(expectedSprite, ['width', 'Width']), sprite.width],
      ['height', firstDefined(expectedSprite, ['height', 'Height']), sprite.height],
      ['axisX', firstDefined(expectedSprite, ['axisX', 'AxisX']), sprite.axisX],
      ['axisY', firstDefined(expectedSprite, ['axisY', 'AxisY']), sprite.axisY],
      ['colorDepth', firstDefined(expectedSprite, ['colorDepth', 'ColorDepth']), sprite.colorDepth]
    ];
    const format = expectedFormat(firstDefined(expectedSprite, ['format', 'Format']));
    if (format !== undefined) checks.push(['format', format, sprite.format]);
    const link = firstDefined(expectedSprite, ['link', 'Link', 'linkTargetPhysicalOrder']);
    if (link !== undefined) checks.push(['link', Number(link), sprite.link]);
    for (const [field, wanted, found] of checks) if (wanted !== undefined && Number(wanted) !== Number(found)) spriteMetadataMismatches.push(`${key}.${field}:${found}≠${wanted}`);
  }
  const requiredVersion = String(options.sffVersion || '').trim();
  const actualVersion = Array.isArray(archive.header?.version) ? `${Number(archive.header.version[0])}.${Number(archive.header.version[2])}` : '';
  const archiveVersionMismatch = requiredVersion && actualVersion !== requiredVersion ? `${actualVersion || 'unknown'}≠${requiredVersion}` : '';
  const spriteLinkErrors = linkErrors(archive.sprites, 'sprite');
  const paletteLinkErrors = linkErrors(archive.palettes, 'palette');
  const rangeErrors = dataBoundsErrors(archive);
  return {
    ok: missing.length === 0 && unexpected.length === 0 && duplicates.length === 0 && orderMismatches.length === 0 && archive.sprites.length === (expectedSprites || []).length && missingPalettes.length === 0 && changedPalettes.length === 0 && brokenAliases.length === 0 && unexpectedPalettes.length === 0 && duplicatePaletteIds.length === 0 && assignmentMismatches.length === 0 && spriteMetadataMismatches.length === 0 && !archiveVersionMismatch && spriteLinkErrors.length === 0 && paletteLinkErrors.length === 0 && rangeErrors.length === 0 && (!expectedPalettes || (archive.palettes || []).length === expectedPalettes.length),
    expectedCount: (expectedSprites || []).length,
    actualCount: archive.sprites.length,
    missing,
    unexpected,
    duplicates, orderMismatches, missingPalettes, changedPalettes, brokenAliases, unexpectedPalettes, duplicatePaletteIds, assignmentMismatches,
    spriteMetadataMismatches, archiveVersionMismatch, spriteLinkErrors, paletteLinkErrors, rangeErrors
  };
}

function assertBuiltArchive(filename, expectedSprites, expectedPalettes, options) {
  const result = verifyBuiltArchive(filename, expectedSprites, expectedPalettes, options);
  if (result.ok) return result;
  const details = [];
  if (result.expectedCount !== result.actualCount) details.push(`sprite count ${result.actualCount}; expected ${result.expectedCount}`);
  if (result.missing.length) details.push(`missing identities: ${result.missing.slice(0, 20).join(' ')}`);
  if (result.unexpected.length) details.push(`unexpected identities: ${result.unexpected.slice(0, 20).join(' ')}`);
  if (result.duplicates.length) details.push(`duplicate identities: ${result.duplicates.slice(0, 20).join(' ')}`);
  if (result.orderMismatches.length) details.push(`physical order mismatch: ${result.orderMismatches.slice(0, 20).map((item) => `#${item.position + 1} ${item.actual}≠${item.expected}`).join(' ')}`);
  if (result.missingPalettes.length) details.push(`missing palettes: ${result.missingPalettes.slice(0, 20).join(' ')}`);
  if (result.changedPalettes.length) details.push(`palette color mismatch: ${result.changedPalettes.slice(0, 20).join(' ')}`);
  if (result.brokenAliases.length) details.push(`palette link mismatch: ${result.brokenAliases.slice(0, 20).join(' ')}`);
  if (result.unexpectedPalettes.length) details.push(`unexpected palettes: ${result.unexpectedPalettes.slice(0, 20).join(' ')}`);
  if (result.duplicatePaletteIds.length) details.push(`duplicate palette IDs: ${result.duplicatePaletteIds.slice(0, 20).join(' ')}`);
  if (result.assignmentMismatches.length) details.push(`sprite palette assignment mismatch: ${result.assignmentMismatches.slice(0, 20).join(' ')}`);
  if (result.spriteMetadataMismatches.length) details.push(`sprite metadata mismatch: ${result.spriteMetadataMismatches.slice(0, 20).join(' ')}`);
  if (result.archiveVersionMismatch) details.push(`archive version mismatch: ${result.archiveVersionMismatch}`);
  if (result.spriteLinkErrors.length) details.push(`invalid sprite links: ${result.spriteLinkErrors.slice(0, 20).join(' ')}`);
  if (result.paletteLinkErrors.length) details.push(`invalid palette links: ${result.paletteLinkErrors.slice(0, 20).join(' ')}`);
  if (result.rangeErrors.length) details.push(`invalid data ranges: ${result.rangeErrors.slice(0, 20).join(' ')}`);
  throw new Error(`Compiled SFF does not match its approved manifest (${details.join('; ')}). The SFF was not accepted.`);
}

module.exports = { verifyBuiltArchive, assertBuiltArchive };
