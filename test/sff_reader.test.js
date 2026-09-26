'use strict';

const assert = require('assert');
const { parseSffBuffer, paletteRgba, paletteAct, actRgba, spritePng } = require('../src/sff_reader');

function fixture() {
  const spriteHeaders = 64;
  const paletteHeaders = spriteHeaders + 56;
  const literal = paletteHeaders + 16;
  const buffer = Buffer.alloc(literal + 1028);
  buffer.write('ElecbyteSpr\0', 0, 'latin1');
  buffer[12] = 0; buffer[13] = 0; buffer[14] = 1; buffer[15] = 2;
  buffer.writeUInt32LE(spriteHeaders, 36); buffer.writeUInt32LE(2, 40);
  buffer.writeUInt32LE(paletteHeaders, 44); buffer.writeUInt32LE(1, 48);
  buffer.writeUInt32LE(literal, 52); buffer.writeUInt32LE(literal, 60);
  buffer.writeUInt16LE(1, paletteHeaders); buffer.writeUInt16LE(1, paletteHeaders + 2);
  buffer.writeUInt16LE(256, paletteHeaders + 4); buffer.writeUInt32LE(0, paletteHeaders + 8); buffer.writeUInt32LE(1024, paletteHeaders + 12);
  // Transparent, red, green, blue.
  Buffer.from([0, 0, 0, 0, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]).copy(buffer, literal);
  buffer.writeUInt16LE(200, spriteHeaders); buffer.writeUInt16LE(0, spriteHeaders + 2);
  buffer.writeUInt16LE(2, spriteHeaders + 4); buffer.writeUInt16LE(2, spriteHeaders + 6);
  buffer.writeInt16LE(1, spriteHeaders + 8); buffer.writeInt16LE(2, spriteHeaders + 10);
  buffer[spriteHeaders + 14] = 0; buffer[spriteHeaders + 15] = 8;
  buffer.writeUInt32LE(1024, spriteHeaders + 16); buffer.writeUInt32LE(4, spriteHeaders + 20);
  Buffer.from([1, 2, 3, 0]).copy(buffer, literal + 1024);
  const linked = spriteHeaders + 28;
  buffer.writeUInt16LE(200, linked); buffer.writeUInt16LE(1, linked + 2);
  buffer.writeUInt16LE(2, linked + 4); buffer.writeUInt16LE(2, linked + 6);
  buffer.writeInt16LE(-2, linked + 8); buffer.writeInt16LE(3, linked + 10);
  buffer.writeUInt16LE(0, linked + 12); buffer[linked + 14] = 0; buffer[linked + 15] = 8;
  return buffer;
}

function legacyFixture() {
  const first = 512, pcx = first + 32, second = pcx + 128 + 4 + 1 + 768;
  const buffer = Buffer.alloc(second + 32);
  buffer.write('ElecbyteSpr\0', 0, 'latin1');
  buffer[12] = 0; buffer[13] = 1; buffer[14] = 0; buffer[15] = 1;
  buffer.writeUInt32LE(2, 20); buffer.writeUInt32LE(first, 24); buffer.writeUInt32LE(32, 28);
  buffer.writeUInt32LE(second, first); buffer.writeUInt32LE(second - pcx, first + 4);
  buffer.writeInt16LE(3, first + 8); buffer.writeInt16LE(4, first + 10);
  buffer.writeUInt16LE(9000, first + 12); buffer.writeUInt16LE(0, first + 14);
  buffer[pcx] = 0x0a; buffer[pcx + 1] = 5; buffer[pcx + 2] = 0; buffer[pcx + 3] = 8;
  buffer.writeUInt16LE(1, pcx + 8); buffer.writeUInt16LE(1, pcx + 10);
  buffer[pcx + 65] = 1; buffer.writeUInt16LE(2, pcx + 66);
  Buffer.from([1, 2, 3, 0]).copy(buffer, pcx + 128);
  buffer[pcx + 132] = 0x0c;
  Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255]).copy(buffer, pcx + 133 + 3);
  buffer.writeInt16LE(-2, second + 8); buffer.writeInt16LE(5, second + 10);
  buffer.writeUInt16LE(9000, second + 12); buffer.writeUInt16LE(1, second + 14);
  buffer.writeUInt16LE(0, second + 16);
  return buffer;
}

function linkedPaletteFixture() {
  const paletteHeaders = 64, literal = paletteHeaders + 32, buffer = Buffer.alloc(literal + 1024);
  buffer.write('ElecbyteSpr\0', 0, 'latin1'); buffer[12] = 0; buffer[13] = 1; buffer[14] = 0; buffer[15] = 2;
  buffer.writeUInt32LE(64, 36); buffer.writeUInt32LE(0, 40); buffer.writeUInt32LE(paletteHeaders, 44); buffer.writeUInt32LE(2, 48); buffer.writeUInt32LE(literal, 52); buffer.writeUInt32LE(literal + 1024, 60);
  buffer.writeUInt16LE(1, paletteHeaders); buffer.writeUInt16LE(1, paletteHeaders + 2); buffer.writeUInt16LE(256, paletteHeaders + 4); buffer.writeUInt32LE(0, paletteHeaders + 8); buffer.writeUInt32LE(1024, paletteHeaders + 12);
  const alias = paletteHeaders + 16; buffer.writeUInt16LE(2, alias); buffer.writeUInt16LE(1, alias + 2); buffer.writeUInt16LE(256, alias + 4); buffer.writeUInt16LE(0, alias + 6); buffer.writeUInt32LE(0, alias + 8); buffer.writeUInt32LE(0, alias + 12);
  for (let index = 0; index < 256; index += 1) { const at = literal + index * 4; buffer[at] = index; buffer[at + 1] = 255 - index; buffer[at + 2] = 40; buffer[at + 3] = index === 0 ? 0 : 255; }
  return buffer;
}

const archive = parseSffBuffer(fixture(), 'fixture.sff');
assert.strictEqual(archive.header.version.join('.'), '2.1.0.0');
assert.strictEqual(archive.sprites.length, 2);
assert.deepStrictEqual([archive.sprites[0].group, archive.sprites[0].number], [200, 0]);
assert.deepStrictEqual([archive.sprites[1].axisX, archive.sprites[1].axisY], [-2, 3]);
const direct = spritePng(archive, archive.sprites[0]);
const linked = spritePng(archive, archive.sprites[1]);
assert.strictEqual(direct.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
assert.deepStrictEqual(direct, linked);
const colors = paletteRgba(archive, 0);
assert.deepStrictEqual(colors[1], [255, 0, 0, 255]);
const act = paletteAct(colors);
assert.strictEqual(act.length, 768);
assert.deepStrictEqual(actRgba(act)[1], [255, 0, 0, 255]);
assert.strictEqual(actRgba(act)[0][3], 0);
const blueOverride = colors.map((color) => [...color]);
blueOverride[1] = [0, 0, 255, 255];
assert.notDeepStrictEqual(spritePng(archive, archive.sprites[0], blueOverride), direct);
const paletteAliases = parseSffBuffer(linkedPaletteFixture(), 'linked-palettes.sff');
assert.deepStrictEqual(paletteAliases.palettes.map((palette) => [palette.group, palette.number]), [[1, 1], [2, 1]]);
assert.strictEqual(paletteAliases.palettes[1].dataSize, 0);
assert.strictEqual(paletteAliases.palettes[1].link, 0);
assert.deepStrictEqual(paletteRgba(paletteAliases, 1), paletteRgba(paletteAliases, 0), '2,1 must remain addressable while sharing 1,1 color data');
const fiveBitFixture = fixture(); fiveBitFixture[64 + 15] = 5;
const fiveBit = parseSffBuffer(fiveBitFixture, 'five-bit.sff');
assert.strictEqual(spritePng(fiveBit, fiveBit.sprites[0]).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
const legacy = parseSffBuffer(legacyFixture(), 'legacy.sff');
assert.strictEqual(legacy.header.version.join('.'), '1.0.1.0');
assert.deepStrictEqual([legacy.sprites[0].width, legacy.sprites[0].height], [2, 2]);
assert.deepStrictEqual([legacy.sprites[1].width, legacy.sprites[1].height], [2, 2]);
assert.deepStrictEqual([legacy.sprites[1].axisX, legacy.sprites[1].axisY], [-2, 5]);
assert.deepStrictEqual(paletteRgba(legacy, 0)[1], [255, 0, 0, 255]);
assert.strictEqual(spritePng(legacy, legacy.sprites[0]).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
assert.deepStrictEqual(spritePng(legacy, legacy.sprites[0]), spritePng(legacy, legacy.sprites[1]));
console.log('SFF reader tests passed.');
