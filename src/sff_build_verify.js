'use strict';

const { readSff } = require('./sff_reader');

function identity(group, index) {
  return `${Number(group)},${Number(index)}`;
}

function verifyBuiltArchive(filename, expectedSprites) {
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
  return {
    ok: missing.length === 0 && unexpected.length === 0 && duplicates.length === 0 && archive.sprites.length === (expectedSprites || []).length,
    expectedCount: (expectedSprites || []).length,
    actualCount: archive.sprites.length,
    missing,
    unexpected,
    duplicates
  };
}

function assertBuiltArchive(filename, expectedSprites) {
  const result = verifyBuiltArchive(filename, expectedSprites);
  if (result.ok) return result;
  const details = [];
  if (result.expectedCount !== result.actualCount) details.push(`sprite count ${result.actualCount}; expected ${result.expectedCount}`);
  if (result.missing.length) details.push(`missing identities: ${result.missing.slice(0, 20).join(' ')}`);
  if (result.unexpected.length) details.push(`unexpected identities: ${result.unexpected.slice(0, 20).join(' ')}`);
  if (result.duplicates.length) details.push(`duplicate identities: ${result.duplicates.slice(0, 20).join(' ')}`);
  throw new Error(`Compiled SFF does not match its approved manifest (${details.join('; ')}). The SFF was not accepted.`);
}

module.exports = { verifyBuiltArchive, assertBuiltArchive };
