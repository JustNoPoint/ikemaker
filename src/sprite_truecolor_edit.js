'use strict';

const crypto = require('crypto');
const zlib = require('zlib');
const { spritePng, friendlyVersion, rgbaPng } = require('./sff_reader');
const { decodePng } = require('./palette_index_organizer_model');
const { crc32 } = require('./palette_indexed_png');

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
function chunk(type, data) {
  const name = Buffer.from(type), out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0); name.copy(out, 4); data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return out;
}
function rgbPng(width, height, rgba) {
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const from = (y * width + x) * 4, to = y * (width * 3 + 1) + 1 + x * 3;
    raw[to] = rgba[from]; raw[to + 1] = rgba[from + 1]; raw[to + 2] = rgba[from + 2];
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function exactPlane(archive, sprite) {
  if (sprite.dataSize === 0) throw new Error(`Sprite ${sprite.group},${sprite.number} is linked to physical sprite ${sprite.link}. Select and edit that physical source, or use SFF Creator to review a detached replacement before changing this link.`);
  if (friendlyVersion(archive.header?.version) !== '2.1' || ![[0, 24], [0, 32], [11, 24], [12, 32]].some(([format, depth]) => sprite.format === format && sprite.colorDepth === depth)) throw new Error('Truecolor pixel editing requires a direct raw24, raw32, PNG24, or PNG32 sprite in SFF v2.1. Open this sprite in an external image editor for other formats.');
  const count = sprite.width * sprite.height;
  if (!Number.isSafeInteger(count) || count < 1 || count > 1000000) throw new Error('Truecolor pixel editing is limited to one million pixels. Use an external image editor for this sprite.');
  const decoded = decodePng(spritePng(archive, sprite), { maximumDimension: 8192, maximumPixels: 1000000 });
  if (decoded.width !== sprite.width || decoded.height !== sprite.height || decoded.colorType !== (sprite.format === 11 ? 2 : 6) || decoded.bitDepth !== 8) throw new Error('The decoded truecolor image does not match its SFF sprite header. Use an external image editor and the reviewed Creator import.');
  const rgba = Buffer.from(decoded.rgba);
  const token = crypto.createHash('sha256').update(archive.buffer).update(`${sprite.index}:${sprite.group}:${sprite.number}:${sprite.format}:${sprite.width}:${sprite.height}:`).update(rgba).digest('hex');
  return { width: sprite.width, height: sprite.height, kind: sprite.colorDepth === 24 ? 'rgb24' : 'rgba32', rgba, token, sourceFormat: sprite.format === 0 ? 'raw' : 'png' };
}
function reviewPixels(plane, submitted) {
  if (submitted?.token !== plane.token) throw new Error('The truecolor sprite changed since this edit opened. Refresh it before review.');
  if (typeof submitted.pixels !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(submitted.pixels) || submitted.pixels.length > Math.ceil(plane.rgba.length / 3) * 4 + 4) throw new Error('The RGBA pixel payload is invalid.');
  const rgba = Buffer.from(submitted.pixels, 'base64');
  if (rgba.length !== plane.width * plane.height * 4) throw new Error('The RGBA pixel payload does not match the selected sprite dimensions.');
  if (plane.kind === 'rgb24' && rgba.some((value, index) => index % 4 === 3 && value !== 255)) throw new Error('This RGB24 sprite has no alpha channel. Edit RGB only, or convert it explicitly in SFF Creator.');
  const changed = !rgba.equals(plane.rgba), bytes = plane.kind === 'rgb24' ? rgbPng(plane.width, plane.height, rgba) : rgbaPng(plane.width, plane.height, rgba);
  const reopened = decodePng(bytes, { maximumDimension: 8192, maximumPixels: 1000000 });
  if (reopened.colorType !== (plane.kind === 'rgb24' ? 2 : 6) || !reopened.rgba.equals(rgba)) throw new Error('Truecolor edit could not be verified after PNG encoding.');
  return { bytes, rgba, changed, colorDepth: plane.kind === 'rgb24' ? 24 : 32, pixelHash: sha(rgba) };
}

module.exports = { exactPlane, reviewPixels, rgbPng };
