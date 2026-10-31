'use strict';

const crypto = require('crypto');
const { createSffBuildSpecificationV2 } = require('../../src/sff_build_specification_v2');
const { encodeIndexed } = require('../../src/sff_palette_remap');
const { readIndexedPng8 } = require('../../src/sff_png8_source');
const { encodePcx } = require('../../src/sff_v1_pcx8_writer');
const { DERIVATION_PROFILE } = require('../../src/sff_v1_sprmaker_staging_contract');

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function makeFixture(options = {}) {
  const colors = Array.from({ length: 256 }, (_, index) => [index, 255 - index, (index * 3) & 255, index === 0 ? 0 : 255]);
  const indices = Buffer.from([0, 1, 2, 3]), png = encodeIndexed(2, 2, indices, colors), decoded = readIndexedPng8(png), sourceHash = sha(png);
  const palette = { entryId: 'palette:0', group: 0, number: 0, colors, source: { kind: 'complete-image', relativePath: 'input/palette.png', byteHash: sourceHash, decodedHash: decoded.decodedHash, provenance: { fixture: true } } };
  const sprite = (entryId, number) => ({ entryId, group: 10, number, width: 2, height: 2, axisX: number ? -7 : 5, axisY: number ? 9 : -3, pixels: { kind: 'indexed8', decodedHash: decoded.decodedHash }, paletteEntryId: palette.entryId, source: { kind: 'complete-image', relativePath: `input/${entryId}.png`, byteHash: sourceHash, decodedHash: decoded.decodedHash, provenance: { fixture: true } } });
  const sprites = options.single ? [sprite('sprite:0', 0)] : [sprite('sprite:0', 0), sprite('sprite:1', 1)], choices = Object.fromEntries(sprites.map((row, index) => [row.entryId, options.previous && index === 1 ? 'previous' : 'own']));
  const specification = createSffBuildSpecificationV2({ planId: options.previous ? 'sprmaker-previous' : 'sprmaker-own', selection: { targetId: 'sff-v1', backendId: 'elecbyte-sprmaker-sff-v1' }, archive: { identity: 'candidate.sff' }, logical: { sourceRoot: 'input', sprites, palettes: [palette], provenance: { fixture: true } }, encodingIntent: { compression: { default: 'pcx-rle8' }, crop: { default: 'none' }, storage: { spriteDefault: 'preserve-separate' }, paletteMode: 'individual-successive', backendOptions: { 'elecbyte-sprmaker-sff-v1': { paletteBySpriteEntryId: choices } } }, capabilityRequest: { requiredFeatures: ['transparency.index0-binary'] }, review: { fixture: true } });
  const rgb = Buffer.from(colors.flatMap(color => color.slice(0, 3))), pcx = encodePcx(2, 2, indices, rgb, false).physical, derivedPcxByEntryId = {};
  for (const row of sprites) derivedPcxByEntryId[row.entryId] = { bytes: pcx, byteHash: sha(pcx), sourceByteHash: row.source.byteHash, decodedHash: row.pixels.decodedHash, derivationProfile: DERIVATION_PROFILE };
  return { specification, sprites, palette, colors, indices, png, sourceHash, choices, pcx, derivedPcxByEntryId };
}
module.exports = { sha, makeFixture };
