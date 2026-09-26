'use strict';

const assert = require('assert');
const {
  createMasterSnapshot,
  compareMasterSnapshot,
  masterLocation,
  paletteFingerprint
} = require('../src/palette_master');

function archive() {
  const buffer = Buffer.alloc(64);
  for (let index = 0; index < buffer.length; index += 1) buffer[index] = index;
  return {
    filename: 'C:/game/chars/Ryu/Ryu.sff', buffer,
    header: { version: [2, 1, 0, 0], literalDataOffset: 0 },
    palettes: [{ index: 0, group: 1, number: 1, colors: 256, link: 0, dataOffset: 0, dataSize: 64 }],
    sprites: [{ index: 0, group: 0, number: 0, width: 2, height: 2, format: 0, colorDepth: 8, paletteIndex: 0, link: 0, dataOffset: 0, dataSize: 4 }]
  };
}

const original = archive();
const snapshot = createMasterSnapshot(original, 0, 'chars/Ryu/Ryu.sff');
assert.strictEqual(snapshot.immutable, true);
assert.strictEqual(snapshot.palette.colors.length, 256);
assert.strictEqual(snapshot.palette.fingerprint, paletteFingerprint(snapshot.palette.colors));
assert.strictEqual(compareMasterSnapshot(original, snapshot).exact, true);

const changed = archive();
changed.buffer[0] = 255;
const comparison = compareMasterSnapshot(changed, snapshot);
assert.strictEqual(comparison.exact, false);
assert.strictEqual(comparison.paletteChanged, true);
assert.deepStrictEqual(comparison.changedIndexData, ['0,0']);

const location = masterLocation('C:/game/chars/Ryu/Ryu.sff', 'C:/game');
assert(location.json.replace(/\\/g, '/').endsWith('/.ikemen-tools/palette-masters/chars/Ryu/Ryu/master-palette.json'));
console.log('palette master tests passed');
