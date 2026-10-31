'use strict';

const zlib = require('zlib');

function paeth(a, b, c) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }

function alphaMaskFromPng(buffer, threshold = 1, limits = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 33 || buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Axis analysis requires a valid PNG image.');
  let offset = 8, width = 0, height = 0, bitDepth = 0, colorType = -1, interlace = 0, transparency = null;
  const data = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset), end = offset + 12 + length;
    if (end > buffer.length) throw new Error('PNG chunk exceeds the image bounds.');
    const type = buffer.toString('ascii', offset + 4, offset + 8), body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); bitDepth = body[8]; colorType = body[9]; interlace = body[12]; }
    else if (type === 'tRNS') transparency = Buffer.from(body);
    else if (type === 'IDAT') data.push(body);
    offset = end; if (type === 'IEND') break;
  }
  const maximumPixels = Math.max(1, Number(limits.maximumPixels) || 16000000);
  if (!width || !height || width * height > maximumPixels || !Number.isSafeInteger(width * height)) throw new Error(`Axis analysis image exceeds the ${maximumPixels.toLocaleString()}-pixel safety limit.`);
  if (bitDepth !== 8 || interlace !== 0) throw new Error('Axis analysis currently supports non-interlaced 8-bit PNG sprites.');
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 })[colorType];
  if (!channels) throw new Error(`Axis analysis does not support PNG color type ${colorType}.`);
  const rowBytes = width * channels, expectedBytes = height * (rowBytes + 1), inflated = zlib.inflateSync(Buffer.concat(data), { maxOutputLength: expectedBytes });
  if (inflated.length !== height * (rowBytes + 1)) throw new Error('PNG scanline size does not match its dimensions.');
  const pixels = Buffer.alloc(width * height * channels), previous = Buffer.alloc(rowBytes), row = Buffer.alloc(rowBytes);
  let source = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[source++];
    for (let x = 0; x < rowBytes; x += 1) {
      const raw = inflated[source++], left = x >= channels ? row[x - channels] : 0, up = previous[x], upperLeft = x >= channels ? previous[x - channels] : 0;
      row[x] = (raw + (filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? paeth(left, up, upperLeft) : (() => { throw new Error(`Unsupported PNG filter ${filter}.`); })())) & 255;
    }
    row.copy(pixels, y * rowBytes); row.copy(previous);
  }
  const mask = new Uint8Array(width * height), alphaThreshold = Math.max(0, Math.min(255, Number(threshold) || 0));
  for (let index = 0; index < width * height; index += 1) {
    const at = index * channels;
    let alpha = 255;
    if (colorType === 6) alpha = pixels[at + 3];
    else if (colorType === 4) alpha = pixels[at + 1];
    else if (colorType === 3) alpha = transparency && pixels[at] < transparency.length ? transparency[pixels[at]] : 255;
    else if (colorType === 0 && transparency?.length >= 2 && pixels[at] === transparency.readUInt16BE(0)) alpha = 0;
    else if (colorType === 2 && transparency?.length >= 6 && pixels[at] === transparency.readUInt16BE(0) && pixels[at + 1] === transparency.readUInt16BE(2) && pixels[at + 2] === transparency.readUInt16BE(4)) alpha = 0;
    mask[index] = alpha >= alphaThreshold ? 1 : 0;
  }
  return Object.freeze({ width, height, mask });
}

module.exports = { alphaMaskFromPng };
