'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const reader = require('../src/sff_reader');

const original = reader.readSff, originalPaletteRgba = reader.paletteRgba;
const modulePath = require.resolve('../src/sff_build_verify');
try {
  let archiveFixture = { sprites: [
    { group: 120, number: 0, paletteIndex: 0 }, { group: 120, number: 1, paletteIndex: 0 },
    { group: 5000, number: 0 }, { group: 5000, number: 10 }
  ], palettes: [{ group: 1, number: 1, index: 0, link: 0, dataSize: 768 }, { group: 1, number: 2, index: 1, link: 0, dataSize: 0 }] };
  reader.readSff = () => archiveFixture;
  reader.paletteRgba = (_archive, index) => Array.from({ length: 256 }, () => index === 9 ? [9, 9, 9, 255] : [1, 2, 3, 255]);
  delete require.cache[modulePath];
  let verify = require('../src/sff_build_verify');
  const expected = [{ group: 120, index: 0 }, { group: 120, index: 1 }, { group: 5000, index: 0 }, { group: 5000, index: 10 }];
  assert.strictEqual(verify.verifyBuiltArchive('built.sff', expected).ok, true);
  assert.throws(() => verify.assertBuiltArchive('built.sff', [...expected.slice(0, 3), { group: 5000, index: 1 }]), /missing identities: 5000,1/);
  assert.throws(() => verify.assertBuiltArchive('built.sff', expected.slice(0, 3)), /unexpected identities: 5000,10/);
  const colors = Array.from({ length: 256 }, () => [1, 2, 3, 255]);
  assert.strictEqual(verify.verifyBuiltArchive('built.sff', expected, [{ group: 1, number: 1, colors }, { group: 1, number: 2, colors, aliasOf: { group: 1, number: 1 } }]).ok, true);
  assert.throws(() => verify.assertBuiltArchive('built.sff', expected, [{ group: 1, number: 9, colors }]), /missing palettes: 1,9/);
  assert.throws(() => verify.assertBuiltArchive('built.sff', expected, [{ group: 1, number: 2, colors, aliasOf: { group: 9, number: 9 } }]), /palette link mismatch/);
  assert.throws(() => verify.assertBuiltArchive('built.sff', [{ ...expected[0], palette: '1,2' }, ...expected.slice(1)], [{ group: 1, number: 1, colors }, { group: 1, number: 2, colors, aliasOf: { group: 1, number: 1 } }]), /sprite palette assignment mismatch/);
  archiveFixture = { ...archiveFixture, palettes: [...archiveFixture.palettes, { group: 9, number: 9, index: 2, link: 2, dataSize: 768 }] };
  assert.throws(() => verify.assertBuiltArchive('built.sff', expected, [{ group: 1, number: 1, colors }, { group: 1, number: 2, colors, aliasOf: { group: 1, number: 1 } }]), /unexpected palettes: 9,9/);
  archiveFixture = { ...archiveFixture, palettes: [{ group: 1, number: 1, index: 0, link: 0, dataSize: 768 }, { group: 1, number: 1, index: 1, link: 0, dataSize: 0 }] };
  assert.throws(() => verify.assertBuiltArchive('built.sff', expected, [{ group: 1, number: 1, colors }, { group: 1, number: 2, colors, aliasOf: { group: 1, number: 1 } }]), /duplicate palette IDs/);
  archiveFixture = { ...archiveFixture, palettes: [{ group: 1, number: 1, index: 0, link: 0, dataSize: 768 }, { group: 1, number: 2, index: 1, link: 0, dataSize: 768 }] };
  assert.throws(() => verify.assertBuiltArchive('built.sff', expected, [{ group: 1, number: 1, colors }, { group: 1, number: 2, colors, aliasOf: { group: 1, number: 1 } }]), /palette link mismatch/);
  archiveFixture = { ...archiveFixture, palettes: [{ group: 1, number: 1, index: 9, link: 0, dataSize: 768 }] };
  assert.throws(() => verify.assertBuiltArchive('built.sff', expected, [{ group: 1, number: 1, colors }]), /palette color mismatch/);
} finally {
  reader.readSff = original;
  reader.paletteRgba = originalPaletteRgba;
  delete require.cache[modulePath];
}

console.log('Compiled SFF manifest verification tests passed');
