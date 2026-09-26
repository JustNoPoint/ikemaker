'use strict';

const fs = require('fs');
const zlib = require('zlib');

const SIGNATURE = 'ElecbyteSpr\0';
function friendlyVersion(version = []) { return Array.isArray(version) && version.length >= 3 ? `${Number(version[0]) || 0}.${Number(version[2]) || 0}` : String(version || '?'); }

function ensure(buffer, offset, size, label) {
  if (!Number.isInteger(offset) || offset < 0 || offset + size > buffer.length) {
    throw new Error(`${label} is outside the SFF file (offset ${offset}, size ${size}).`);
  }
}

function u16(buffer, offset) { ensure(buffer, offset, 2, 'uint16'); return buffer.readUInt16LE(offset); }
function i16(buffer, offset) { ensure(buffer, offset, 2, 'int16'); return buffer.readInt16LE(offset); }
function u32(buffer, offset) { ensure(buffer, offset, 4, 'uint32'); return buffer.readUInt32LE(offset); }

function findPcxPalette(buffer, start, end) {
  for (let offset = end - 769; offset >= start; offset -= 1) if (buffer[offset] === 0x0c) return offset;
  return Math.max(start, end - 769);
}

function parseSffV1(buffer, filename, version) {
  ensure(buffer, 0, 32, 'SFF v1 header');
  const header = {
    version,
    firstSpriteHeaderOffset: u32(buffer, 24),
    numberOfSprites: u32(buffer, 20),
    firstPaletteHeaderOffset: 0,
    numberOfPalettes: 0,
    literalDataOffset: 0,
    translatedDataOffset: 0,
    spriteHeaderSize: 32,
    legacy: true
  };
  if (header.numberOfSprites > 1000000) throw new Error('SFF v1 header contains an unreasonable sprite count.');
  const palettes = [], sprites = [];
  let at = header.firstSpriteHeaderOffset, previousDataSprite = null;
  for (let index = 0; index < header.numberOfSprites; index += 1) {
    ensure(buffer, at, 32, `SFF v1 sprite header ${index}`);
    const nextOffset = u32(buffer, at), dataSize = u32(buffer, at + 4), link = u16(buffer, at + 16), paletteSame = buffer[at + 18] !== 0;
    const sprite = {
      index, group: u16(buffer, at + 12), number: u16(buffer, at + 14),
      width: 0, height: 0, axisX: i16(buffer, at + 8), axisY: i16(buffer, at + 10),
      link, format: 1, colorDepth: 8, relativeOffset: at + 32, dataSize,
      paletteIndex: 0, flags: 0, dataOffset: at + 32, headerOffset: at,
      nextHeaderOffset: nextOffset, legacy: true
    };
    if (dataSize > 0) {
      const pcx = at + 32;
      ensure(buffer, pcx, 128, `SFF v1 PCX header ${index}`);
      if (buffer[pcx + 3] !== 8 || buffer[pcx + 65] !== 1) throw new Error(`SFF v1 sprite ${sprite.group},${sprite.number} is not an 8-bit single-plane PCX.`);
      sprite.width = u16(buffer, pcx + 8) - u16(buffer, pcx + 4) + 1;
      sprite.height = u16(buffer, pcx + 10) - u16(buffer, pcx + 6) + 1;
      const blockEnd = nextOffset > pcx ? nextOffset : Math.min(buffer.length, pcx + dataSize);
      let pixelEnd = blockEnd;
      if (!paletteSame || !previousDataSprite) {
        const marker = findPcxPalette(buffer, pcx + 128, blockEnd);
        ensure(buffer, marker + 1, 768, `SFF v1 PCX palette ${index}`);
        const colorsRgba = [];
        for (let color = 0; color < 256; color += 1) {
          const offset = marker + 1 + color * 3;
          colorsRgba.push([buffer[offset], buffer[offset + 1], buffer[offset + 2], color === 0 ? 0 : 255]);
        }
        sprite.paletteIndex = palettes.length;
        palettes.push({ index: palettes.length, group: 0, number: palettes.length, colors: 256, link: 0, dataOffset: marker + 1, dataSize: 768, colorsRgba, legacy: true });
        pixelEnd = marker;
      } else sprite.paletteIndex = previousDataSprite.paletteIndex;
      sprite.dataOffset = pcx + 128;
      sprite.dataSize = Math.max(0, pixelEnd - sprite.dataOffset);
      sprite.pcx = { encoding: buffer[pcx + 2], bytesPerLine: u16(buffer, pcx + 66) };
      previousDataSprite = sprite;
    }
    sprites.push(sprite);
    if (index + 1 < header.numberOfSprites) {
      if (!nextOffset || nextOffset <= at) throw new Error(`SFF v1 sprite chain ended early at archive index ${index}.`);
      at = nextOffset;
    }
  }
  for (const sprite of sprites) if (sprite.dataSize === 0) {
    const source = sprites[sprite.link];
    if (source) { sprite.width = source.width; sprite.height = source.height; sprite.paletteIndex = source.paletteIndex; sprite.pcx = source.pcx; }
  }
  header.numberOfPalettes = palettes.length;
  return { filename, buffer, header, palettes, sprites };
}

function parseSffBuffer(buffer, filename = '') {
  ensure(buffer, 0, 16, 'SFF header');
  if (buffer.subarray(0, 12).toString('latin1') !== SIGNATURE) throw new Error('Unrecognized SFF signature.');
  const version = [buffer[15], buffer[14], buffer[13], buffer[12]];
  if (version[0] === 1) return parseSffV1(buffer, filename, version);
  if (version[0] !== 2) throw new Error(`SFF v${version.join('.')} is not previewable; supported versions are v1.x and v2.x.`);
  ensure(buffer, 0, 64, 'SFF v2 header');
  const header = {
    version,
    firstSpriteHeaderOffset: u32(buffer, 36),
    numberOfSprites: u32(buffer, 40),
    firstPaletteHeaderOffset: u32(buffer, 44),
    numberOfPalettes: u32(buffer, 48),
    literalDataOffset: u32(buffer, 52),
    translatedDataOffset: u32(buffer, 60),
    spriteHeaderSize: 28,
    legacy: false
  };
  if (header.numberOfSprites > 1000000 || header.numberOfPalettes > 100000) throw new Error('SFF header contains unreasonable entry counts.');

  const palettes = [];
  for (let index = 0; index < header.numberOfPalettes; index += 1) {
    const at = header.firstPaletteHeaderOffset + index * 16;
    ensure(buffer, at, 16, `palette header ${index}`);
    palettes.push({
      index,
      group: u16(buffer, at), number: u16(buffer, at + 2), colors: u16(buffer, at + 4),
      link: u16(buffer, at + 6), dataOffset: u32(buffer, at + 8), dataSize: u32(buffer, at + 12)
    });
  }

  const sprites = [];
  for (let index = 0; index < header.numberOfSprites; index += 1) {
    const at = header.firstSpriteHeaderOffset + index * 28;
    ensure(buffer, at, 28, `sprite header ${index}`);
    const flags = u16(buffer, at + 26);
    const relativeOffset = u32(buffer, at + 16);
    sprites.push({
      index,
      group: u16(buffer, at), number: u16(buffer, at + 2),
      width: u16(buffer, at + 4), height: u16(buffer, at + 6),
      axisX: i16(buffer, at + 8), axisY: i16(buffer, at + 10),
      link: u16(buffer, at + 12), format: buffer[at + 14], colorDepth: buffer[at + 15],
      relativeOffset, dataSize: u32(buffer, at + 20), paletteIndex: u16(buffer, at + 24), flags,
      dataOffset: relativeOffset + ((flags & 1) === 0 ? header.literalDataOffset : header.translatedDataOffset),
      headerOffset: at, legacy: false
    });
  }
  return { filename, buffer, header, palettes, sprites };
}

function readSff(filename) { return parseSffBuffer(fs.readFileSync(filename), filename); }

function resolvedSprite(archive, sprite, seen = new Set()) {
  if (sprite.dataSize !== 0) return sprite;
  if (seen.has(sprite.index)) throw new Error(`Circular linked sprite at ${sprite.group},${sprite.number}.`);
  seen.add(sprite.index);
  const linked = archive.sprites[sprite.link];
  if (!linked) throw new Error(`Sprite ${sprite.group},${sprite.number} links to missing sprite index ${sprite.link}.`);
  return resolvedSprite(archive, linked, seen);
}

function resolvedPalette(archive, paletteIndex, seen = new Set()) {
  const palette = archive.palettes[paletteIndex];
  if (!palette) return null;
  if (palette.dataSize !== 0) return palette;
  if (seen.has(paletteIndex)) throw new Error(`Circular linked palette at index ${paletteIndex}.`);
  seen.add(paletteIndex);
  return resolvedPalette(archive, palette.link, seen);
}

function paletteRgba(archive, paletteIndex) {
  const palette = resolvedPalette(archive, paletteIndex);
  if (!palette) return null;
  if (palette.colorsRgba) return palette.colorsRgba.map((color) => [...color]);
  const offset = archive.header.literalDataOffset + palette.dataOffset;
  ensure(archive.buffer, offset, palette.dataSize, `palette data ${palette.index}`);
  const colors = [];
  for (let at = 0; at + 3 < palette.dataSize && colors.length < 256; at += 4) {
    colors.push([...archive.buffer.subarray(offset + at, offset + at + 4)]);
  }
  while (colors.length < 256) colors.push([0, 0, 0, 0]);
  return colors;
}

function paletteAct(colors) {
  if (!Array.isArray(colors)) throw new Error('Palette colors are missing.');
  const output = Buffer.alloc(768);
  for (let index = 0; index < 256; index += 1) {
    const color = colors[index] || [0, 0, 0, index === 0 ? 0 : 255];
    output[index * 3] = Number(color[0]) || 0;
    output[index * 3 + 1] = Number(color[1]) || 0;
    output[index * 3 + 2] = Number(color[2]) || 0;
  }
  return output;
}

function actRgba(buffer) {
  if (!Buffer.isBuffer(buffer) || ![768, 772].includes(buffer.length)) {
    throw new Error('ACT palettes must contain 768 bytes, or 772 bytes with Adobe metadata.');
  }
  const colors = [];
  const transparentIndex = buffer.length === 772 ? buffer.readUInt16BE(770) : 0;
  for (let index = 0; index < 256; index += 1) {
    colors.push([buffer[index * 3], buffer[index * 3 + 1], buffer[index * 3 + 2], index === transparentIndex ? 0 : 255]);
  }
  return colors;
}

function rle8(data, expected) {
  const out = Buffer.alloc(expected); let i = 0; let j = 0;
  while (j < expected && i < data.length) {
    let count = 1; let value = data[i++];
    if ((value & 0xc0) === 0x40) { count = value & 0x3f; if (i >= data.length) break; value = data[i++]; }
    while (count-- > 0 && j < expected) out[j++] = value;
  }
  if (j !== expected) throw new Error(`RLE8 decoded ${j} of ${expected} pixels.`);
  return out;
}

function rle5(data, expected) {
  const out = Buffer.alloc(expected); let i = 0; let j = 0;
  while (j < expected && i + 1 < data.length) {
    let runLength = data[i++]; let dataLength = data[i] & 0x7f; let color = 0;
    if ((data[i] & 0x80) !== 0) { i += 1; if (i >= data.length) break; color = data[i]; }
    i += 1;
    while (true) {
      if (j < expected) out[j++] = color;
      runLength -= 1;
      if (runLength < 0) {
        dataLength -= 1;
        if (dataLength < 0) break;
        if (i >= data.length) break;
        color = data[i] & 0x1f; runLength = data[i] >> 5; i += 1;
      }
    }
  }
  if (j !== expected) throw new Error(`RLE5 decoded ${j} of ${expected} pixels.`);
  return out;
}

function lz5(data, expected) {
  const out = Buffer.alloc(expected); if (!data.length) return out;
  let i = 0; let j = 0; let control = data[i++]; let controlShift = 0; let recycle = 0; let recycleBits = 0;
  while (j < expected && i < data.length) {
    let value = data[i++]; let count;
    if ((control & (1 << controlShift)) !== 0) {
      if ((value & 0x3f) === 0) { if (i + 1 >= data.length) break; value = (value << 2 | data[i++]) + 1; count = data[i++] + 2; }
      else {
        recycle |= (value & 0xc0) >> recycleBits; recycleBits += 2; count = value & 0x3f;
        if (recycleBits < 8) { if (i >= data.length) break; value = data[i++] + 1; }
        else { value = recycle + 1; recycle = 0; recycleBits = 0; }
      }
      for (; count >= 0 && j < expected; count -= 1) { if (j - value < 0) throw new Error('Invalid LZ5 back-reference.'); out[j] = out[j - value]; j += 1; }
    } else {
      if ((value & 0xe0) === 0) { if (i >= data.length) break; count = data[i++] + 8; }
      else { count = value >> 5; value &= 0x1f; }
      while (count-- > 0 && j < expected) out[j++] = value;
    }
    controlShift += 1;
    if (controlShift >= 8) { if (i >= data.length) break; control = data[i++]; controlShift = 0; }
  }
  if (j !== expected) throw new Error(`LZ5 decoded ${j} of ${expected} pixels.`);
  return out;
}

let crcTable;
function crc32(buffer) {
  if (!crcTable) crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  let crc = 0xffffffff; for (const value of buffer) crc = crcTable[(crc ^ value) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type); const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0); name.copy(result, 4); data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length); return result;
}

function rgbaPng(width, height, rgba) {
  if (!width || !height || rgba.length !== width * height * 4) throw new Error('Invalid RGBA image dimensions.');
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) rgba.copy(scanlines, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))]);
}

function indexedPngWithSffPalette(png, palette) {
  // SFF v2 format 10 stores indexed PNG pixels, but the authoritative colors
  // live in the SFF palette table. Replace the PNG's placeholder palette so
  // the preview matches what IKEMEN renders in-game.
  if (png.length < 8 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('Embedded sprite is not a valid PNG.');
  }
  const rgb = Buffer.alloc(256 * 3);
  const alpha = Buffer.alloc(256);
  for (let index = 0; index < 256; index += 1) {
    const color = palette[index] || [0, 0, 0, 0];
    rgb[index * 3] = color[0]; rgb[index * 3 + 1] = color[1]; rgb[index * 3 + 2] = color[2];
    alpha[index] = color[3];
  }
  const chunks = [png.subarray(0, 8)];
  let offset = 8;
  let paletteWritten = false;
  while (offset + 12 <= png.length) {
    const size = png.readUInt32BE(offset);
    ensure(png, offset, size + 12, 'embedded PNG chunk');
    const type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'PLTE') {
      chunks.push(chunk('PLTE', rgb), chunk('tRNS', alpha));
      paletteWritten = true;
    } else if (type !== 'tRNS') {
      if (type === 'IDAT' && !paletteWritten) {
        chunks.push(chunk('PLTE', rgb), chunk('tRNS', alpha));
        paletteWritten = true;
      }
      chunks.push(png.subarray(offset, offset + size + 12));
    }
    offset += size + 12;
    if (type === 'IEND') break;
  }
  return Buffer.concat(chunks);
}

function pcx8(data, width, height, bytesPerLine, encoded) {
  const stride = Math.max(width, bytesPerLine || width), expected = stride * height;
  let decoded;
  if (!encoded) {
    if (data.length < expected) throw new Error(`PCX contains ${data.length} of ${expected} expected pixel bytes.`);
    decoded = data.subarray(0, expected);
  } else {
    decoded = Buffer.alloc(expected); let source = 0; let target = 0;
    while (target < expected && source < data.length) {
      let count = 1, value = data[source++];
      if ((value & 0xc0) === 0xc0) { count = value & 0x3f; if (source >= data.length) break; value = data[source++]; }
      while (count-- > 0 && target < expected) decoded[target++] = value;
    }
    if (target !== expected) throw new Error(`PCX RLE decoded ${target} of ${expected} pixels.`);
  }
  if (stride === width) return decoded;
  const pixels = Buffer.alloc(width * height);
  for (let y = 0; y < height; y += 1) decoded.copy(pixels, y * width, y * stride, y * stride + width);
  return pixels;
}

function indexedSourcePng(width, height, pixels, colors) {
  if (!width || !height || pixels.length !== width * height) throw new Error('Invalid indexed image dimensions.');
  const scanlines = Buffer.alloc(height * (width + 1));
  for (let y = 0; y < height; y++) pixels.copy(scanlines, y * (width + 1) + 1, y * width, (y + 1) * width);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 3;
  const palette = Buffer.alloc(768), alpha = Buffer.alloc(256);
  for (let i = 0; i < 256; i++) { const c = colors[i] || [0,0,0,0]; palette.set(c.slice(0,3), i * 3); alpha[i] = c[3]; }
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('PLTE', palette), chunk('tRNS', alpha), chunk('IDAT', zlib.deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))]);
}

function spritePng(archive, selected, paletteOverride = null, preserveIndices = false) {
  const source = resolvedSprite(archive, selected);
  const paletteIndex = Number.isInteger(paletteOverride) ? paletteOverride : selected.paletteIndex;
  const paletteColors = Array.isArray(paletteOverride) ? paletteOverride : paletteRgba(archive, paletteIndex);
  ensure(archive.buffer, source.dataOffset, source.dataSize, `sprite data ${source.index}`);
  if (source.legacy && source.pcx) {
    if (!paletteColors) throw new Error(`Sprite palette ${paletteIndex} is missing.`);
    const data = archive.buffer.subarray(source.dataOffset, source.dataOffset + source.dataSize);
    const pixels = pcx8(data, source.width, source.height, source.pcx.bytesPerLine, source.pcx.encoding === 1);
    if (preserveIndices) return indexedSourcePng(source.width, source.height, pixels, paletteColors);
    const rgba = Buffer.alloc(source.width * source.height * 4);
    for (let i = 0; i < pixels.length; i += 1) rgba.set(paletteColors[pixels[i]] || [0, 0, 0, 0], i * 4);
    return rgbaPng(source.width, source.height, rgba);
  }
  if ([10, 11, 12].includes(source.format)) {
    if (source.dataSize < 4) throw new Error('Embedded PNG sprite is truncated.');
    const png = archive.buffer.subarray(source.dataOffset + 4, source.dataOffset + source.dataSize);
    if (source.format !== 10) return png;
    if (!paletteColors) throw new Error(`Sprite palette ${paletteIndex} is missing.`);
    return indexedPngWithSffPalette(png, paletteColors);
  }
  const expected = source.width * source.height;
  let pixels;
  if (source.format === 0) pixels = archive.buffer.subarray(source.dataOffset, source.dataOffset + source.dataSize);
  else {
    if (source.dataSize < 4) throw new Error('Compressed sprite is truncated.');
    const data = archive.buffer.subarray(source.dataOffset + 4, source.dataOffset + source.dataSize);
    pixels = source.format === 2 ? rle8(data, expected) : source.format === 3 ? rle5(data, expected) : source.format === 4 ? lz5(data, expected) : null;
    if (!pixels) throw new Error(`Unsupported SFF sprite format ${source.format}.`);
  }
  const rgba = Buffer.alloc(expected * 4);
  if (source.colorDepth === 5 || source.colorDepth === 8) {
    if (!paletteColors) throw new Error(`Sprite palette ${paletteIndex} is missing.`);
    if (preserveIndices) return indexedSourcePng(source.width, source.height, pixels, paletteColors);
    for (let i = 0; i < expected; i += 1) { const color = paletteColors[pixels[i]] || [0, 0, 0, 0]; rgba.set(color, i * 4); }
  } else if (source.colorDepth === 24 || source.colorDepth === 32) {
    const stride = source.colorDepth / 8;
    for (let i = 0; i < expected; i += 1) { rgba[i * 4] = pixels[i * stride]; rgba[i * 4 + 1] = pixels[i * stride + 1]; rgba[i * 4 + 2] = pixels[i * stride + 2]; rgba[i * 4 + 3] = stride === 4 ? pixels[i * stride + 3] : 255; }
  } else throw new Error(`Unsupported color depth ${source.colorDepth}.`);
  return rgbaPng(source.width, source.height, rgba);
}

function spriteDataUri(archive, sprite, paletteOverride = null) { return `data:image/png;base64,${spritePng(archive, sprite, paletteOverride).toString('base64')}`; }

module.exports = { friendlyVersion, parseSffBuffer, readSff, resolvedPalette, paletteRgba, paletteAct, actRgba, spritePng, spriteDataUri, rle8, rle5, lz5, pcx8, rgbaPng, indexedPngWithSffPalette };
