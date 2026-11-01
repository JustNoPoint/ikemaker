'use strict';

const assert = require('assert');
const crypto = require('crypto');
const { createSffBuildSpecification } = require('../src/sff_build_specification');
const { createSffV21Png8Bytes } = require('../src/sff_v21_png8_writer');
const { validateSffV21Png8 } = require('../src/sff_v21_strict_validator');
const { encodeIndexed } = require('../src/sff_palette_remap');
const { readIndexedPng8 } = require('../src/sff_png8_source');

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
let state = 0x5ff21c0d;
function random() { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; }
function between(minimum, maximum) { return minimum + (random() % (maximum - minimum + 1)); }

function palette(seed) {
  return Array.from({ length: 256 }, (_, index) => [
    (index * 29 + seed * 7) & 255,
    (index * 11 + seed * 31) & 255,
    (255 - index * 3 + seed) & 255,
    index % (seed % 13 + 3) === 0 ? (index * 17 + seed) & 255 : 255
  ]);
}

function sourceFixture(caseNumber, imageNumber) {
  const width = between(1, 17), height = between(1, 13), colors = palette(caseNumber * 19 + imageNumber), indices = Buffer.alloc(width * height);
  for (let index = 0; index < indices.length; index += 1) indices[index] = (random() + index * 37 + imageNumber) & 255;
  const png = encodeIndexed(width, height, indices, colors), decoded = readIndexedPng8(png), relativePath = `input/case-${caseNumber}-image-${imageNumber}.png`;
  return { width, height, colors, png, relativePath, source: { relativePath, byteHash: sha256(png), decodedHash: decoded.decodedHash, width, height, provenance: { kind: 'deterministic-property-matrix', seed: '5ff21c0d', caseNumber, imageNumber } } };
}

function identityValue(caseNumber, ordinal, boundary) {
  if (boundary === 0) return 0;
  if (boundary === 1) return 65535;
  return (caseNumber * 997 + ordinal * 7919 + random()) & 65535;
}

function axisValue(caseNumber, ordinal, boundary) {
  if (boundary === 0) return -32768;
  if (boundary === 1) return 32767;
  return ((caseNumber * 4001 + ordinal * 1237 + random()) & 65535) - 32768;
}

const hashes = [];
let linkedSprites = 0, linkedPalettes = 0, repeatedIdentities = 0;
for (let caseNumber = 0; caseNumber < 32; caseNumber += 1) {
  const imageCount = between(1, 4), images = Array.from({ length: imageCount }, (_, imageNumber) => sourceFixture(caseNumber, imageNumber));
  const sources = new Map(images.map(image => [image.relativePath, image.png])), palettes = [];
  for (let imageNumber = 0; imageNumber < images.length; imageNumber += 1) {
    const image = images[imageNumber], baseId = `palette:${caseNumber}:${imageNumber}:base`;
    palettes.push({ entryId: baseId, group: identityValue(caseNumber, imageNumber, caseNumber === 0 && imageNumber === 0 ? 0 : -1), number: identityValue(caseNumber, imageNumber + 17, caseNumber === 1 && imageNumber === 0 ? 1 : -1), tableOrder: 'sff', duplicatePolicy: 'preserve-separate', colors: image.colors, source: image.source });
    if ((caseNumber + imageNumber) % 3 === 0) palettes.push({ entryId: `palette:${caseNumber}:${imageNumber}:link`, group: identityValue(caseNumber, imageNumber + 31, -1), number: identityValue(caseNumber, imageNumber + 47, -1), tableOrder: 'sff', duplicatePolicy: 'share-identical', linkTargetEntryId: baseId, colors: image.colors, source: image.source });
  }

  const spriteCount = between(1, 10), sprites = [], compatible = new Map();
  for (let ordinal = 0; ordinal < spriteCount; ordinal += 1) {
    const imageNumber = between(0, images.length - 1), image = images[imageNumber], paletteChoices = palettes.filter(item => item.source.relativePath === image.relativePath), assignedPalette = paletteChoices[between(0, paletteChoices.length - 1)], signature = `${imageNumber}:${assignedPalette.entryId}`, possibleTargets = compatible.get(signature) || [], shouldLink = possibleTargets.length && (random() & 3) === 0, linkTargetEntryId = shouldLink ? possibleTargets[possibleTargets.length - 1] : null;
    const entryId = `sprite:${caseNumber}:${ordinal}`, repeated = ordinal > 0 && caseNumber % 7 === 0;
    sprites.push({
      entryId,
      group: repeated ? sprites[0].group : identityValue(caseNumber, ordinal, caseNumber === 0 && ordinal === 0 ? 0 : caseNumber === 1 && ordinal === 0 ? 1 : -1),
      number: repeated ? sprites[0].number : identityValue(caseNumber, ordinal + 101, caseNumber === 2 && ordinal === 0 ? 1 : -1),
      axisX: axisValue(caseNumber, ordinal, caseNumber === 0 && ordinal === 0 ? 0 : caseNumber === 1 && ordinal === 0 ? 1 : -1),
      axisY: axisValue(caseNumber, ordinal + 53, caseNumber === 2 && ordinal === 0 ? 0 : caseNumber === 3 && ordinal === 0 ? 1 : -1),
      colorDepth: 8, format: 'png8', compression: 'png8', paletteId: assignedPalette.entryId,
      duplicatePolicy: linkTargetEntryId ? 'share-identical' : 'preserve-separate',
      ...(linkTargetEntryId ? { linkTargetEntryId } : {}),
      crop: { mode: 'none', axisDeltaX: 0, axisDeltaY: 0 }, source: image.source
    });
    possibleTargets.push(entryId); compatible.set(signature, possibleTargets);
  }

  const specification = createSffBuildSpecification({
    planId: `property-${caseNumber}`, sourceRoot: 'input', target: { archiveIdentity: `property-${caseNumber}.sff`, archiveFingerprint: null, sffVersion: '2.1' },
    requirements: ['sff-v2.1', 'preserve-authored-physical-order', 'immutable-source-snapshots', 'candidate-before-adoption', 'sprite-png8', 'embedded-palettes'],
    sprites, palettes, decisions: [], options: { shared: { certification: 'deterministic-property-matrix', seed: '5ff21c0d', caseNumber }, backends: {} }
  });
  const first = createSffV21Png8Bytes(specification, { sources }), second = createSffV21Png8Bytes(specification, { sources });
  assert.deepStrictEqual(second, first, `property case ${caseNumber} is not byte deterministic`);
  const report = validateSffV21Png8(first, specification);
  assert.strictEqual(report.ok, true, `property case ${caseNumber}: ${report.errors.join('; ')}`);
  assert.deepStrictEqual(report.physicalOrder.map(item => [item.group, item.number]), sprites.map(item => [item.group, item.number]), `property case ${caseNumber} changed physical sprite order`);
  assert.deepStrictEqual(report.sprites.map(item => [item.axisX, item.axisY]), sprites.map(item => [item.axisX, item.axisY]), `property case ${caseNumber} changed axes`);
  assert.deepStrictEqual(report.palettes.map(item => [item.group, item.number]), palettes.map(item => [item.group, item.number]), `property case ${caseNumber} changed palette order`);
  linkedSprites += report.sprites.filter(item => item.dataSize === 0).length;
  linkedPalettes += report.palettes.filter(item => item.dataSize === 0).length;
  repeatedIdentities += sprites.length - new Set(sprites.map(item => `${item.group},${item.number}`)).size;
  hashes.push(sha256(first));
  const corruptReservedByte = Buffer.from(first); corruptReservedByte[16] ^= 1;
  assert.strictEqual(validateSffV21Png8(corruptReservedByte, specification).ok, false, `property case ${caseNumber} accepted a corrupted reserved header byte`);
}

const corpusHash = sha256(Buffer.from(hashes.join('\n')));
assert(linkedSprites >= 8, `seeded corpus unexpectedly exercised only ${linkedSprites} linked sprites`);
assert(linkedPalettes >= 20, `seeded corpus unexpectedly exercised only ${linkedPalettes} linked palettes`);
assert(repeatedIdentities >= 4, `seeded corpus unexpectedly exercised only ${repeatedIdentities} repeated physical identities`);
// Rebaselined for lossless trailing-opaque tRNS canonicalization in embedded PNG8 data.
assert.strictEqual(corpusHash, '4faedc510f60bfd99ba20784ab16cadfffee9db3535c18c0f24183356f5e1094', 'the seeded built-in writer property corpus changed');
console.log(`Built-in SFF PNG8 deterministic property matrix passed 32 archives · ${linkedSprites} sprite links · ${linkedPalettes} palette links · ${repeatedIdentities} repeated identities · corpus ${corpusHash}`);
