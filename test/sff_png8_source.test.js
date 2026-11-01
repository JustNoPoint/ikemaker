'use strict';

const assert = require('assert');
const crypto = require('crypto');
const zlib = require('zlib');
const { crc32, readIndexedPng8 } = require('../src/sff_png8_source');

function chunk(type, data) {
  const name = Buffer.from(type), result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0); name.copy(result, 4); data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return result;
}
function png8(width, height, indices) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 3;
  const palette = Buffer.alloc(768); for (let i = 0; i < 256; i += 1) { palette[i * 3] = i; palette[i * 3 + 1] = 255 - i; palette[i * 3 + 2] = i ^ 0x55; }
  const alpha = Buffer.from([0, 128, 255]), raw = Buffer.alloc(height * (width + 1));
  for (let y = 0; y < height; y += 1) { raw[y * (width + 1)] = 0; indices.copy(raw, y * (width + 1) + 1, y * width, (y + 1) * width); }
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('PLTE', palette), chunk('tRNS', alpha), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const indices = Buffer.from([0, 1, 2, 3, 4, 255]), png = png8(3, 2, indices), decoded = readIndexedPng8(png);
assert.deepStrictEqual([decoded.width, decoded.height], [3, 2]);
assert.deepStrictEqual(decoded.indices, indices);
assert.strictEqual(decoded.decodedHash, crypto.createHash('sha256').update(indices).digest('hex'));
assert.deepStrictEqual(decoded.colors[0], [0, 255, 0x55, 0]);
assert.deepStrictEqual(decoded.colors[1], [1, 254, 0x54, 128]);
assert.deepStrictEqual(decoded.colors[2], [2, 253, 0x57, 255]);
assert.deepStrictEqual(decoded.colors[255], [255, 0, 0xaa, 255]);

const bad = Buffer.from(png); bad[bad.length - 1] ^= 1;
assert.throws(() => readIndexedPng8(bad), /CRC/);
const rgba = Buffer.from(png); rgba[25] = 6;
assert.throws(() => readIndexedPng8(rgba), /CRC|indexed PNG/);
const beforeIdat = 8 + 25 + 780 + 15;
const reservedBit = Buffer.concat([png.subarray(0, beforeIdat), chunk('abca', Buffer.alloc(0)), png.subarray(beforeIdat)]);
assert.throws(() => readIndexedPng8(reservedBit), /lowercase reserved type bit/);

console.log('SFF PNG8 source decoding, index hashing, palette RGBA, and CRC tests passed');
