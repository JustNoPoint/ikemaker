'use strict';

const { readSff, paletteRgba } = require('./sff_reader');

function identity(group, index) {
  return `${Number(group)},${Number(index)}`;
}

function colorsEqual(a, b) { return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((color, index) => color.length === b[index]?.length && color.every((value, channel) => Number(value) === Number(b[index][channel]))); }

function verifyBuiltArchive(filename, expectedSprites, expectedPalettes = null) {
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
  return {
    ok: missing.length === 0 && unexpected.length === 0 && duplicates.length === 0 && archive.sprites.length === (expectedSprites || []).length && missingPalettes.length === 0 && changedPalettes.length === 0 && brokenAliases.length === 0 && unexpectedPalettes.length === 0 && duplicatePaletteIds.length === 0 && assignmentMismatches.length === 0 && (!expectedPalettes || (archive.palettes || []).length === expectedPalettes.length),
    expectedCount: (expectedSprites || []).length,
    actualCount: archive.sprites.length,
    missing,
    unexpected,
    duplicates, missingPalettes, changedPalettes, brokenAliases, unexpectedPalettes, duplicatePaletteIds, assignmentMismatches
  };
}

function assertBuiltArchive(filename, expectedSprites, expectedPalettes) {
  const result = verifyBuiltArchive(filename, expectedSprites, expectedPalettes);
  if (result.ok) return result;
  const details = [];
  if (result.expectedCount !== result.actualCount) details.push(`sprite count ${result.actualCount}; expected ${result.expectedCount}`);
  if (result.missing.length) details.push(`missing identities: ${result.missing.slice(0, 20).join(' ')}`);
  if (result.unexpected.length) details.push(`unexpected identities: ${result.unexpected.slice(0, 20).join(' ')}`);
  if (result.duplicates.length) details.push(`duplicate identities: ${result.duplicates.slice(0, 20).join(' ')}`);
  if (result.missingPalettes.length) details.push(`missing palettes: ${result.missingPalettes.slice(0, 20).join(' ')}`);
  if (result.changedPalettes.length) details.push(`palette color mismatch: ${result.changedPalettes.slice(0, 20).join(' ')}`);
  if (result.brokenAliases.length) details.push(`palette link mismatch: ${result.brokenAliases.slice(0, 20).join(' ')}`);
  if (result.unexpectedPalettes.length) details.push(`unexpected palettes: ${result.unexpectedPalettes.slice(0, 20).join(' ')}`);
  if (result.duplicatePaletteIds.length) details.push(`duplicate palette IDs: ${result.duplicatePaletteIds.slice(0, 20).join(' ')}`);
  if (result.assignmentMismatches.length) details.push(`sprite palette assignment mismatch: ${result.assignmentMismatches.slice(0, 20).join(' ')}`);
  throw new Error(`Compiled SFF does not match its approved manifest (${details.join('; ')}). The SFF was not accepted.`);
}

module.exports = { verifyBuiltArchive, assertBuiltArchive };
