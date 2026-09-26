'use strict';

const fs = require('fs');
const path = require('path');
const { readSff } = require('../src/sff_reader');
const { pngPaletteRgba } = require('../src/palette_library');

function paletteBytes(filename) {
  const colors = pngPaletteRgba(fs.readFileSync(filename));
  if (!Array.isArray(colors) || colors.length !== 256) throw new Error(`${filename} does not contain a 256-color indexed palette.`);
  return Buffer.from(colors.flatMap((color, index) => [Number(color[0]) || 0, Number(color[1]) || 0, Number(color[2]) || 0, index === 0 ? 0 : (Number.isFinite(Number(color[3])) ? Number(color[3]) : 255)]));
}

function repair(filename, masterPng, defaultPng, alternatePng, output) {
  const archive = readSff(filename);
  if (archive.header.legacy || archive.header.version[0] !== 2) throw new Error('This repair requires an SFF v2.x archive.');
  const palettes = [paletteBytes(masterPng), paletteBytes(defaultPng), paletteBytes(alternatePng)];
  const oldPaletteEnd = Math.max(0, ...(archive.palettes || []).map((item) => item.dataOffset + item.dataSize));
  const newPaletteBytes = Buffer.concat(palettes), headerGrowth = palettes.length * 16 - archive.header.numberOfPalettes * 16;
  const newSpriteHeaderOffset = archive.header.firstSpriteHeaderOffset + headerGrowth;
  const newLiteralOffset = archive.header.literalDataOffset + headerGrowth;
  const dataGrowth = newPaletteBytes.length - oldPaletteEnd;
  const spriteHeaders = Buffer.from(archive.buffer.subarray(archive.header.firstSpriteHeaderOffset, archive.header.literalDataOffset));
  for (let index = 0; index < archive.sprites.length; index += 1) {
    const at = index * archive.header.spriteHeaderSize;
    const relative = spriteHeaders.readUInt32LE(at + 16);
    if (archive.sprites[index].dataSize > 0) spriteHeaders.writeUInt32LE(relative + dataGrowth, at + 16);
    if (archive.sprites[index].colorDepth === 8) spriteHeaders.writeUInt16LE(1, at + 24);
  }
  const prefix = Buffer.from(archive.buffer.subarray(0, archive.header.firstPaletteHeaderOffset));
  prefix.writeUInt32LE(newSpriteHeaderOffset, 36);
  prefix.writeUInt32LE(palettes.length, 48);
  prefix.writeUInt32LE(newLiteralOffset, 52);
  const originalTranslated = archive.header.translatedDataOffset;
  if (originalTranslated) prefix.writeUInt32LE(originalTranslated + headerGrowth + dataGrowth, 60);
  const paletteHeaders = Buffer.alloc(palettes.length * 16);
  for (let index = 0; index < palettes.length; index += 1) {
    const at = index * 16;
    paletteHeaders.writeUInt16LE(1, at);
    paletteHeaders.writeUInt16LE(index, at + 2);
    paletteHeaders.writeUInt16LE(256, at + 4);
    paletteHeaders.writeUInt16LE(0, at + 6);
    paletteHeaders.writeUInt32LE(index * 1024, at + 8);
    paletteHeaders.writeUInt32LE(1024, at + 12);
  }
  const spriteData = archive.buffer.subarray(archive.header.literalDataOffset + oldPaletteEnd);
  const result = Buffer.concat([prefix, paletteHeaders, spriteHeaders, newPaletteBytes, spriteData]);
  fs.writeFileSync(output, result);
  const checked = readSff(output);
  const ids = checked.palettes.map((item) => `${item.group},${item.number}`);
  if (ids.join('|') !== '1,0|1,1|1,2') throw new Error(`Repaired palette IDs failed validation: ${ids.join(', ')}`);
  if (!checked.sprites.every((item) => item.colorDepth !== 8 || item.paletteIndex === 1)) throw new Error('Not every indexed sprite was assigned to palette 1,1.');
  return { sprites: checked.sprites.length, palettes: ids, bytes: result.length };
}

if (require.main === module) {
  const [filename, masterPng, defaultPng, alternatePng, output] = process.argv.slice(2).map((item) => path.resolve(item));
  if (!output) throw new Error('Usage: node repair-sff-palette-table.js input.sff master.png default.png alternate.png output.sff');
  process.stdout.write(`${JSON.stringify(repair(filename, masterPng, defaultPng, alternatePng, output), null, 2)}\n`);
}

module.exports = { repair };
