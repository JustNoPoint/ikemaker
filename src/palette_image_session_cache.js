'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { LIMITS } = require('./palette_collective_model');

const SCHEMA = 'ikemaker.palette-image-session';
const VERSION = 1;
const MAX_CACHE_BYTES = 384 * 1024 * 1024;
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

function bodyHash(body) { return sha(Buffer.from(JSON.stringify(body))); }
function compressed(buffer) { return zlib.deflateSync(buffer, { level: 6 }).toString('base64'); }
function restored(value, expected, label) {
  if (typeof value !== 'string' || !value.length) throw new Error(`${label} is missing from the saved image session.`);
  const encoded = Buffer.from(value, 'base64');
  if (encoded.length > MAX_CACHE_BYTES) throw new Error(`${label} exceeds the image-session cache limit.`);
  const output = zlib.inflateSync(encoded, { maxOutputLength: expected });
  if (output.length !== expected) throw new Error(`${label} does not match its saved dimensions.`);
  return output;
}

function createImageSessionDocument(collective, session, io = fs) {
  if (collective?.schema !== 'ikemaker.palette-collective' || collective?.version !== 1 || !Array.isArray(collective.images) || !collective.images.length) throw new Error('Save an image session only after opening an exact image batch.');
  let encodedBytes = 0;
  const images = collective.images.map(image => {
    const stat = io.statSync(image.filename);
    if (!stat.isFile()) throw new Error(`Image-session source is no longer a regular file: ${image.filename}`);
    const rgba = compressed(image.decoded.rgba), indices = Buffer.isBuffer(image.decoded.indices) ? compressed(image.decoded.indices) : null;
    encodedBytes += Buffer.byteLength(rgba, 'utf8') + (indices ? Buffer.byteLength(indices, 'utf8') : 0);
    if (encodedBytes > MAX_CACHE_BYTES) throw new Error('The compressed image-session pixel cache exceeds 384 MB. Split this intake into smaller sessions.');
    return {
      imageId: image.imageId,
      filename: path.resolve(image.filename),
      byteHash: image.byteHash,
      byteLength: image.byteLength,
      modifiedTimeMs: stat.mtimeMs,
      width: image.width,
      height: image.height,
      order: image.order,
      colorType: Number(image.decoded.colorType),
      bitDepth: Number(image.decoded.bitDepth),
      colorCounts: clone(image.colorCounts || []),
      rgbaDeflateBase64: rgba,
      indicesDeflateBase64: indices,
      rgbaHash: sha(image.decoded.rgba),
      indicesHash: indices ? sha(image.decoded.indices) : null
    };
  });
  const body = {
    schema: SCHEMA,
    version: VERSION,
    createdAt: new Date().toISOString(),
    inventoryHash: collective.inventoryHash,
    imageCount: collective.imageCount,
    totalPixels: collective.totalPixels,
    entries: clone(collective.entries),
    images,
    workspace: {
      context: clone(session?.context || null),
      collective: clone(session?.collective || {}),
      organizer: clone(session?.organizer || {})
    }
  };
  return { ...body, manifestHash: bodyHash(body) };
}

function parseImageSessionDocument(value, io = fs) {
  const document = Buffer.isBuffer(value) ? JSON.parse(value.toString('utf8')) : typeof value === 'string' ? JSON.parse(value) : clone(value);
  if (!document || document.schema !== SCHEMA || document.version !== VERSION) throw new Error('This is not a supported IKEMaker image-session JSON file.');
  const { manifestHash, ...body } = document;
  if (!/^[0-9a-f]{64}$/i.test(String(manifestHash || '')) || bodyHash(body) !== String(manifestHash).toLowerCase()) throw new Error('The image-session JSON is incomplete or has changed since it was saved.');
  if (!Array.isArray(body.images) || !body.images.length || body.images.length > LIMITS.maximumImages) throw new Error('The saved image-session count is outside IKEMaker safety limits.');
  if (!Array.isArray(body.entries)) throw new Error('The saved image-session color inventory is missing.');
  let totalPixels = 0;
  const images = body.images.map((item, order) => {
    const filename = path.resolve(String(item.filename || '')), stat = io.statSync(filename);
    if (!stat.isFile()) throw new Error(`Saved image-session source is unavailable: ${filename}`);
    if (stat.size !== Number(item.byteLength)) throw new Error(`Saved image-session source size changed: ${path.basename(filename)}`);
    // Matching size and modification time is the fast path. If timestamps moved,
    // prove the exact source bytes before accepting the cached decoded pixels.
    if (Math.abs(stat.mtimeMs - Number(item.modifiedTimeMs)) > 1) {
      const observed = io.readFileSync(filename);
      if (sha(observed) !== String(item.byteHash)) throw new Error(`Saved image-session source changed: ${path.basename(filename)}`);
    }
    const width = Number(item.width), height = Number(item.height), pixels = width * height;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > LIMITS.maximumDimension || height > LIMITS.maximumDimension || !Number.isSafeInteger(pixels)) throw new Error(`Saved image-session dimensions are invalid: ${path.basename(filename)}`);
    totalPixels += pixels;
    if (totalPixels > LIMITS.maximumPixels) throw new Error('The saved image session exceeds the decoded-pixel safety limit.');
    const rgba = restored(item.rgbaDeflateBase64, pixels * 4, `${path.basename(filename)} RGBA cache`), indices = item.indicesDeflateBase64 == null ? null : restored(item.indicesDeflateBase64, pixels, `${path.basename(filename)} index cache`);
    if (sha(rgba) !== String(item.rgbaHash) || indices && sha(indices) !== String(item.indicesHash)) throw new Error(`Saved decoded pixels failed verification: ${path.basename(filename)}`);
    const image = {
      imageId: String(item.imageId), filename, name: path.basename(filename), byteHash: String(item.byteHash), byteLength: Number(item.byteLength), width, height,
      order: Number.isInteger(Number(item.order)) ? Number(item.order) : order,
      decoded: { width, height, colorType: Number(item.colorType), bitDepth: Number(item.bitDepth), rgba, indices },
      colorCounts: clone(item.colorCounts || [])
    };
    Object.defineProperty(image, 'buffer', { enumerable: false, configurable: false, get: () => io.readFileSync(filename) });
    return image;
  });
  const evidence = images.map(({ imageId, filename, byteHash, byteLength, width, height, order }) => ({ imageId, filename, byteHash, byteLength, modifiedTimeMs:io.statSync(filename).mtimeMs, width, height, order }));
  return {
    collective: { schema: 'ikemaker.palette-collective', version: 1, evidence, entries: clone(body.entries), inventoryHash: String(body.inventoryHash), imageCount: images.length, totalPixels, images },
    workspace: clone(body.workspace || {}),
    createdAt: String(body.createdAt || ''),
    manifestHash: String(manifestHash)
  };
}

module.exports = { SCHEMA, VERSION, MAX_CACHE_BYTES, createImageSessionDocument, parseImageSessionDocument };
