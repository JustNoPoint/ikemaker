'use strict';

const crypto = require('crypto');
const zlib = require('zlib');

const SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
let crcTable;

function crc32(buffer) {
  if (!crcTable) crcTable = Array.from({ length: 256 }, (_, value) => {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    return crc >>> 0;
  });
  let crc = 0xffffffff;
  for (const value of buffer) crc = crcTable[(crc ^ value) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii'), result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0); name.copy(result, 4); data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return result;
}

function paeth(a, b, c) {
  const estimate = a + b - c, da = Math.abs(estimate - a), db = Math.abs(estimate - b), dc = Math.abs(estimate - c);
  return da <= db && da <= dc ? a : db <= dc ? b : c;
}

function readIndexedPng8(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8 || !buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('Source sprite is not a PNG.');
  const maxPixels = Number(options.maxPixels || 100000000);
  let offset = 8, width = 0, height = 0, palette = null, alpha = null, ended = false, sawIdat = false;
  const idat = [];
  while (offset < buffer.length) {
    if (buffer.length - offset < 12) throw new Error('Source PNG has a truncated chunk header.');
    const size = buffer.readUInt32BE(offset), end = offset + size + 12;
    if (!Number.isSafeInteger(end) || end > buffer.length) throw new Error('Source PNG chunk exceeds the file.');
    const type = buffer.toString('ascii', offset + 4, offset + 8), data = buffer.subarray(offset + 8, offset + 8 + size);
    if (!/^[A-Za-z]{4}$/.test(type) || type[2] !== type[2].toUpperCase()) throw new Error('Source PNG has invalid chunk type bytes or a lowercase reserved type bit.');
    const storedCrc = buffer.readUInt32BE(offset + 8 + size), actualCrc = crc32(buffer.subarray(offset + 4, offset + 8 + size));
    if (storedCrc !== actualCrc) throw new Error(`Source PNG ${type} CRC is invalid.`);
    if (type === 'IHDR') {
      if (offset !== 8 || size !== 13 || width) throw new Error('Source PNG has an invalid IHDR.');
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      if (!width || !height || width * height > maxPixels) throw new Error('Source PNG dimensions exceed the reviewed limit.');
      if (data[8] !== 8 || data[9] !== 3 || data[10] !== 0 || data[11] !== 0 || data[12] !== 0) throw new Error('Built-in SFF PNG8 requires noninterlaced 8-bit indexed PNG input.');
    } else if (type === 'PLTE') {
      if (!width || palette || sawIdat || size !== 768) throw new Error('Source PNG must contain one 256-color PLTE before IDAT.');
      palette = Buffer.from(data);
    } else if (type === 'tRNS') {
      if (!palette || sawIdat || alpha || size > 256) throw new Error('Source PNG has an invalid tRNS chunk.');
      alpha = Buffer.from(data);
    } else if (type === 'IDAT') {
      if (!palette || ended) throw new Error('Source PNG IDAT chunks must be consecutive after PLTE.');
      sawIdat = true; idat.push(data);
    } else if (type === 'IEND') {
      if (!sawIdat || size !== 0) throw new Error('Source PNG has an invalid IEND.');
      offset = end;
      if (offset !== buffer.length) throw new Error('Source PNG contains bytes after IEND.');
      break;
    } else if (sawIdat) ended = true;
    offset = end;
  }
  if (!width || !palette || !sawIdat || offset !== buffer.length) throw new Error('Source PNG is missing required indexed chunks.');
  let raw;
  try { raw = zlib.inflateSync(Buffer.concat(idat), { maxOutputLength: height * (width + 1) + 1 }); }
  catch (error) { throw new Error(`Source PNG pixel stream is invalid: ${error.message}`); }
  if (raw.length !== height * (width + 1)) throw new Error(`Source PNG decoded ${raw.length} scanline bytes; expected ${height * (width + 1)}.`);
  const indices = Buffer.alloc(width * height);
  let source = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[source++];
    if (filter > 4) throw new Error(`Source PNG row ${y} uses unsupported filter ${filter}.`);
    for (let x = 0; x < width; x += 1) {
      const at = y * width + x, encoded = raw[source++];
      const left = x ? indices[at - 1] : 0, up = y ? indices[at - width] : 0, upperLeft = x && y ? indices[at - width - 1] : 0;
      const predicted = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : paeth(left, up, upperLeft);
      indices[at] = (encoded + predicted) & 0xff;
    }
  }
  const colors = Array.from({ length: 256 }, (_, index) => [palette[index * 3], palette[index * 3 + 1], palette[index * 3 + 2], alpha && index < alpha.length ? alpha[index] : 255]);
  return { width, height, indices, decodedHash: crypto.createHash('sha256').update(indices).digest('hex'), colors };
}

function canonicalizeEmbeddedPng8(buffer, options = {}) {
  const before = readIndexedPng8(buffer, options), chunks = [SIGNATURE];
  let offset = 8;
  while (offset < buffer.length) {
    const size = buffer.readUInt32BE(offset), end = offset + size + 12, type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type !== 'tRNS') chunks.push(buffer.subarray(offset, end));
    else {
      const alpha = buffer.subarray(offset + 8, offset + 8 + size);
      let retained = alpha.length;
      while (retained > 0 && alpha[retained - 1] === 255) retained -= 1;
      if (retained) chunks.push(pngChunk('tRNS', alpha.subarray(0, retained)));
    }
    offset = end;
  }
  const canonical = Buffer.concat(chunks), after = readIndexedPng8(canonical, options);
  if (before.width !== after.width || before.height !== after.height || before.decodedHash !== after.decodedHash || JSON.stringify(before.colors) !== JSON.stringify(after.colors)) throw new Error('Canonical PNG transparency compaction changed reviewed sprite semantics.');
  return canonical;
}

module.exports = { crc32, readIndexedPng8, canonicalizeEmbeddedPng8 };
