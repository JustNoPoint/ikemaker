'use strict';

const assert = require('assert');
const { parseSffBuffer, paletteRgba } = require('../src/sff_reader');
const { paletteRole, comparePaletteColors, reversePaletteRgb, paletteAco, paletteGpl, palettePackReadme, paletteSwatchPng, bufferWithPaletteReplacement, bufferWithPaletteAssignments, paletteScopedSprites, auditPaletteSetup } = require('../src/palette_editor');

function fixture() {
  const spriteHeaders = 64, paletteHeaders = spriteHeaders + 2 * 28, literal = paletteHeaders + 2 * 16;
  const buffer = Buffer.alloc(literal + 2048);
  Buffer.from('ElecbyteSpr\0', 'latin1').copy(buffer); buffer[12] = 0; buffer[13] = 1; buffer[14] = 0; buffer[15] = 2;
  buffer.writeUInt32LE(spriteHeaders, 36); buffer.writeUInt32LE(2, 40); buffer.writeUInt32LE(paletteHeaders, 44); buffer.writeUInt32LE(2, 48); buffer.writeUInt32LE(literal, 52); buffer.writeUInt32LE(literal + 2048, 60);
  for (let index = 0; index < 2; index += 1) {
    const at = paletteHeaders + index * 16; buffer.writeUInt16LE(1, at); buffer.writeUInt16LE(index, at + 2); buffer.writeUInt16LE(256, at + 4); buffer.writeUInt32LE(index * 1024, at + 8); buffer.writeUInt32LE(1024, at + 12);
    for (let color = 0; color < 256; color += 1) { const p = literal + index * 1024 + color * 4; buffer[p] = color; buffer[p + 1] = index; buffer[p + 2] = 255 - color; buffer[p + 3] = color === 0 ? 0 : 255; }
  }
  for (let index = 0; index < 2; index += 1) {
    const at = spriteHeaders + index * 28; buffer.writeUInt16LE(index ? 59000 : 0, at); buffer.writeUInt16LE(0, at + 2); buffer.writeUInt16LE(1, at + 4); buffer.writeUInt16LE(1, at + 6); buffer[at + 15] = 8; buffer.writeUInt16LE(index ? 0 : 1, at + 24);
  }
  return parseSffBuffer(buffer, 'fixture.sff');
}

const archive = fixture();
assert.strictEqual(paletteRole(archive.palettes[0]), 'Full-CS master');
assert.strictEqual(paletteRole(archive.palettes[1]), 'P1 default palette');
assert.strictEqual(paletteRole({ group: 1, number: 2 }), 'P2 default palette');
assert.strictEqual(paletteRole({ group: 2, number: 1 }), 'Character transformation 1 · color 1');
const replacement = paletteRgba(archive, 1).map((color) => [...color]); replacement[20] = [9, 8, 7, 255];
assert.deepStrictEqual(comparePaletteColors(paletteRgba(archive, 1), replacement).changedIndices, [20]);
const reversed = reversePaletteRgb(paletteRgba(archive, 1));
assert.deepStrictEqual(reversed[0].slice(0, 3), paletteRgba(archive, 1)[255].slice(0, 3));
assert.strictEqual(reversed[0][3], 0);
assert.strictEqual(comparePaletteColors(paletteRgba(archive, 1), reversePaletteRgb(reversed)).exact, true);
const aco = paletteAco(paletteRgba(archive, 1));
assert.strictEqual(aco.readUInt16BE(0), 1); assert.strictEqual(aco.readUInt16BE(2), 256); assert(aco.includes(Buffer.from('0049006e00640065007800200030003000300000', 'hex')));
const gpl = paletteGpl(paletteRgba(archive, 1), 'Ryu 1,1');
assert.match(gpl, /^GIMP Palette\nName: Ryu 1,1\nColumns: 16\nChannels: RGBA/m); assert.match(gpl, /\n\s*0\s+1\s+255\s+0 Index 000\n/); assert.strictEqual(gpl.trim().split('\n').length, 261);
const packReadme = palettePackReadme('Ryu_palette_1_1'); assert.match(packReadme, /Ryu_palette_1_1_Aseprite\.gpl/); assert.match(packReadme, /Do not sort, deduplicate, or optimize/);
const swatch = paletteSwatchPng(paletteRgba(archive, 1));
assert.strictEqual(swatch.subarray(0, 8).toString('hex'), '89504e470d0a1a0a'); assert.strictEqual(swatch.readUInt32BE(16), 256); assert.strictEqual(swatch.readUInt32BE(20), 256);
const written = bufferWithPaletteReplacement(archive, 1, replacement);
const changed = parseSffBuffer(written.buffer, 'changed.sff');
assert.deepStrictEqual(paletteRgba(changed, 1)[20], [9, 8, 7, 255]);
const assignmentArchive = fixture();
assignmentArchive.sprites[0].dataSize = 16;
assignmentArchive.sprites[1].dataSize = 0;
assignmentArchive.sprites[1].link = 0;
const assigned = bufferWithPaletteAssignments(assignmentArchive, [0], 0);
assert.strictEqual(assigned.changedCount, 1);
assert.strictEqual(parseSffBuffer(assigned.buffer, 'assigned.sff').sprites[0].paletteIndex, 0);
assert.strictEqual(parseSffBuffer(assigned.buffer, 'assigned.sff').sprites[1].paletteIndex, 0);
assert.throws(() => bufferWithPaletteAssignments(assignmentArchive, [1], 0), /linked destination.*detach\/rebuild/i);
assert.throws(() => bufferWithPaletteAssignments(assignmentArchive, [99], 0), /does not exist/);
const sharedBuffer = Buffer.alloc(64 + 3 * 28);
const sharedArchive = {
  buffer: sharedBuffer,
  header: { firstSpriteHeaderOffset: 64 },
  palettes: [{ group: 1, number: 0 }, { group: 1, number: 1 }],
  sprites: [
    { index: 0, group: 0, number: 0, colorDepth: 8, dataSize: 32, paletteIndex: 1 },
    { index: 1, group: 0, number: 1, colorDepth: 8, dataSize: 24, paletteIndex: 1 },
    { index: 2, group: 0, number: 2, colorDepth: 8, dataSize: 0, link: 0, paletteIndex: 1 }
  ]
};
for (const sprite of sharedArchive.sprites) sharedBuffer.writeUInt16LE(sprite.paletteIndex, 64 + sprite.index * 28 + 24);
const sharedAssignment = bufferWithPaletteAssignments(sharedArchive, [0, 1], 0);
assert.strictEqual(sharedAssignment.changedCount, 2);
assert.deepStrictEqual(sharedAssignment.changedIndices, [0, 1]);
assert.strictEqual(sharedAssignment.buffer.readUInt16LE(64 + 24), 0);
assert.strictEqual(sharedAssignment.buffer.readUInt16LE(64 + 28 + 24), 0);
assert.strictEqual(sharedAssignment.buffer.readUInt16LE(64 + 56 + 24), 1, 'linked destination header is not rewritten');
assert.strictEqual(sharedArchive.palettes.length, 2, 'bulk assignment reuses one palette and never creates a palette per sprite');
const scope = paletteScopedSprites([
  { colorDepth: 8, paletteIndex: 1, dataSize: 20, id: 'source-with-dependents' },
  { colorDepth: 8, paletteIndex: 1, dataSize: 0, link: 0, id: 'linked-destination' },
  { colorDepth: 8, paletteIndex: 2, dataSize: 20, id: 'other-or-fx' },
  { colorDepth: 32, paletteIndex: 1, id: 'true-color' }
], 1);
assert.deepStrictEqual(scope.matching.map((sprite) => sprite.id), ['source-with-dependents'], 'a physical source remains eligible even when another sprite links to it');
assert.strictEqual(scope.skippedLinkedDestinations, 1);
assert.strictEqual(scope.skippedOtherPalettes, 1);
assert.strictEqual(scope.skippedNonIndexed, 1);
assert.throws(() => paletteScopedSprites([], -1), /valid source palette index/);
assert.strictEqual(auditPaletteSetup(archive, 'jnp').exact, true);

console.log('palette editor tests passed');
