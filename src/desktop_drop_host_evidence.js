'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { SURFACES, DEFAULT_LIMITS, createDropSession, admitDesktopDrop } = require('./desktop_drop_intake_contract');

function hashFileBounded(filename, byteLength, maximumBytes, fsApi = fs, isCancelled = () => false) {
  if (!Number.isSafeInteger(byteLength) || byteLength < 1 || byteLength > maximumBytes) return '';
  const hash = crypto.createHash('sha256'), descriptor = fsApi.openSync(filename, 'r'), chunk = Buffer.allocUnsafe(Math.min(1024 * 1024, byteLength));
  try {
    let offset = 0;
    while (offset < byteLength) {
      if (isCancelled()) { const error = new Error('Desktop-drop intake cancelled.'); error.code = 'IKEMAKER_DROP_CANCELLED'; throw error; }
      const read = fsApi.readSync(descriptor, chunk, 0, Math.min(chunk.length, byteLength - offset), offset);
      if (!read) throw new Error('File ended before its reported size.');
      hash.update(chunk.subarray(0, read)); offset += read;
    }
  } finally { fsApi.closeSync(descriptor); }
  return hash.digest('hex');
}

function readHeader(filename, maximumBytes, fsApi = fs) {
  const descriptor = fsApi.openSync(filename, 'r'), buffer = Buffer.alloc(maximumBytes);
  try { const read = fsApi.readSync(descriptor, buffer, 0, maximumBytes, 0); return buffer.subarray(0, read); }
  finally { fsApi.closeSync(descriptor); }
}

function exactCanonicalPath(filename, fsApi = fs) {
  const resolved = path.resolve(String(filename || ''));
  const canonical = fsApi.realpathSync.native ? fsApi.realpathSync.native(resolved) : fsApi.realpathSync(resolved);
  return path.resolve(canonical);
}

function gifFrameCount(bytes) {
  if (bytes.length < 13 || !/^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6))) throw new Error('Malformed GIF header.');
  let offset = 13, frames = 0; const packed = bytes[10]; if (packed & 0x80) offset += 3 * (2 ** ((packed & 7) + 1));
  const skipBlocks = () => { while (offset < bytes.length) { const size = bytes[offset++]; if (!size) return; offset += size; if (offset > bytes.length) throw new Error('Malformed GIF data block.'); } throw new Error('Unterminated GIF data block.'); };
  while (offset < bytes.length) {
    const marker = bytes[offset++];
    if (marker === 0x3b) break;
    if (marker === 0x21) { if (offset >= bytes.length) throw new Error('Malformed GIF extension.'); offset += 1; skipBlocks(); continue; }
    if (marker !== 0x2c || offset + 9 > bytes.length) throw new Error('Malformed GIF image descriptor.');
    const imagePacked = bytes[offset + 8]; offset += 9; if (imagePacked & 0x80) offset += 3 * (2 ** ((imagePacked & 7) + 1));
    if (offset >= bytes.length) throw new Error('Malformed GIF image data.'); offset += 1; skipBlocks(); frames += 1;
  }
  if (!frames) throw new Error('GIF contains no image frames.');
  return frames;
}

function inspectImageDimensions(filename, format, fsApi = fs) {
  const bytes = fsApi.readFileSync(filename), kind = String(format || '').toLowerCase(); let width = 0, height = 0, frames = 1;
  if (kind === 'png') { if (bytes.length < 24) throw new Error('Malformed PNG header.'); width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20); }
  else if (kind === 'gif') { if (bytes.length < 10) throw new Error('Malformed GIF header.'); width = bytes.readUInt16LE(6); height = bytes.readUInt16LE(8); frames = gifFrameCount(bytes); }
  else if (kind === 'bmp') { if (bytes.length < 26) throw new Error('Malformed BMP header.'); width = Math.abs(bytes.readInt32LE(18)); height = Math.abs(bytes.readInt32LE(22)); }
  else if (kind === 'pcx') { if (bytes.length < 12) throw new Error('Malformed PCX header.'); width = bytes.readUInt16LE(8) - bytes.readUInt16LE(4) + 1; height = bytes.readUInt16LE(10) - bytes.readUInt16LE(6) + 1; }
  else if (kind === 'psd') { if (bytes.length < 26) throw new Error('Malformed PSD header.'); height = bytes.readUInt32BE(14); width = bytes.readUInt32BE(18); }
  else throw new Error('Unsupported image format.');
  const pixelCount = width * height * frames;
  if (![width, height, frames, pixelCount].every(value => Number.isSafeInteger(value) && value >= 1)) throw new Error('Malformed decoded image dimensions.');
  return { width, height, frames, pixelCount };
}

function itemEvidence(filename, surface, limits, inspectImage, fsApi = fs, isCancelled = () => false, inspectSound, remaining = {}) {
  const presented = path.resolve(String(filename || ''));
  let canonical = '', byteLength = 0, contentInspected = false;
  try {
    const stat = fsApi.lstatSync(presented); canonical = exactCanonicalPath(presented, fsApi); byteLength = stat.size;
    if (stat.isSymbolicLink()) throw new Error('symbolic-link');
    if (stat.isDirectory()) return { kind: 'folder', path: presented, canonicalPathEvidence: canonical };
    if (!stat.isFile()) throw new Error('unsupported-filesystem-entry');
    const format = path.extname(presented).slice(1).toLowerCase();
    // Reject by metadata before any decoder, validator, hash, or whole-file read.
    if (stat.size > limits.maxFileBytes) return {
      kind: 'file', path: presented, canonicalPathEvidence: canonical,
      byteLength: stat.size, byteHash: '', headerBytes: Buffer.alloc(0),
      evidenceError: 'per-file-byte-limit-exceeded'
    };
    if (Number.isFinite(remaining.bytes) && stat.size > remaining.bytes) return {
      kind: 'file', path: presented, canonicalPathEvidence: canonical,
      byteLength: stat.size, byteHash: '', headerBytes: Buffer.alloc(0),
      evidenceError: 'aggregate-byte-limit-exceeded'
    };
    if (surface === SURFACES.SFF && Number.isFinite(remaining.pixels) && remaining.pixels < 1) return {
      kind: 'file', path: presented, canonicalPathEvidence: canonical,
      byteLength: stat.size, byteHash: '', headerBytes: Buffer.alloc(0),
      evidenceError: 'aggregate-decoded-pixel-limit-exceeded'
    };
    contentInspected = true;
    const decodedPixels = surface === SURFACES.SFF && typeof inspectImage === 'function' ? inspectImage(presented, format) : undefined;
    if (decodedPixels && Number.isFinite(remaining.pixels) && Number(decodedPixels.pixelCount) > remaining.pixels) return {
      kind: 'file', path: presented, canonicalPathEvidence: canonical,
      byteLength: stat.size, byteHash: '', headerBytes: Buffer.alloc(0), decodedPixels,
      evidenceError: 'aggregate-decoded-pixel-limit-exceeded'
    };
    const soundEvidence = surface === SURFACES.SND && typeof inspectSound === 'function' ? inspectSound(presented, format, fsApi) : undefined;
    return {
      kind: 'file', path: presented, canonicalPathEvidence: canonical,
      byteLength: stat.size, byteHash: hashFileBounded(presented, stat.size, limits.maxFileBytes, fsApi, isCancelled),
      headerBytes: readHeader(presented, limits.maxHeaderBytes, fsApi), decodedPixels, soundEvidence, contentInspected
    };
  } catch (error) {
    if (error?.code === 'IKEMAKER_DROP_CANCELLED') throw error;
    return { kind: 'file', path: presented, canonicalPathEvidence: canonical, byteLength, byteHash: '', headerBytes: Buffer.alloc(0), contentInspected, evidenceError: String(error?.message || error) };
  }
}

function uninspectedLimitEvidence(filename) {
  const presented = path.resolve(String(filename || ''));
  return { kind: 'file', path: presented, canonicalPathEvidence: presented, byteLength: 0, byteHash: '', headerBytes: Buffer.alloc(0), evidenceError: 'item-count-limit-exceeded' };
}

async function prepareDesktopDropAsync({ surface, generation, sessionNonce, paths, limits, inspectImage, inspectSound, fsApi = fs, isCancelled = () => false, onProgress = () => {} } = {}) {
  const session = createDropSession({ surface, generation, sessionNonce, limits }), input = Array.from(paths || []).slice(0, session.limits.maxItems + 1), items = [];
  let remainingBytes = session.limits.maxAggregateBytes, remainingPixels = session.limits.maxAggregateDecodedPixels;
  for (let index = 0; index < input.length; index += 1) {
    if (isCancelled()) return Object.freeze({ session, items: Object.freeze(items), admission: admitDesktopDrop({ session, currentSession: session, items, cancelled: true }) });
    onProgress({ completed: index, total: input.length, path: String(input[index]) });
    try {
      const item = index >= session.limits.maxItems ? uninspectedLimitEvidence(input[index]) : itemEvidence(input[index], surface, session.limits, inspectImage, fsApi, isCancelled, inspectSound, { bytes: remainingBytes, pixels: remainingPixels }); items.push(item);
      if (item.contentInspected && item.kind === 'file') { remainingBytes = Math.max(0, remainingBytes - item.byteLength); if (item.decodedPixels) remainingPixels = Math.max(0, remainingPixels - item.decodedPixels.pixelCount); }
      else if (item.evidenceError === 'aggregate-byte-limit-exceeded') remainingBytes = 0;
      else if (item.evidenceError === 'aggregate-decoded-pixel-limit-exceeded') remainingPixels = 0;
    }
    catch (error) { if (error?.code === 'IKEMAKER_DROP_CANCELLED') return Object.freeze({ session, items: Object.freeze(items), admission: admitDesktopDrop({ session, currentSession: session, items, cancelled: true }) }); throw error; }
    await new Promise(resolve => setImmediate(resolve));
  }
  onProgress({ completed: input.length, total: input.length, path: '' });
  return Object.freeze({ session, items: Object.freeze(items), admission: admitDesktopDrop({ session, currentSession: session, items }) });
}

function prepareDesktopDrop({ surface, generation, sessionNonce, paths, limits, inspectImage, inspectSound, fsApi = fs } = {}) {
  const session = createDropSession({ surface, generation, sessionNonce, limits });
  let remainingBytes = session.limits.maxAggregateBytes, remainingPixels = session.limits.maxAggregateDecodedPixels;
  const items = [];
  for (const [index, filename] of Array.from(paths || []).slice(0, session.limits.maxItems + 1).entries()) {
    const item = index >= session.limits.maxItems ? uninspectedLimitEvidence(filename) : itemEvidence(filename, surface, session.limits, inspectImage, fsApi, () => false, inspectSound, { bytes: remainingBytes, pixels: remainingPixels }); items.push(item);
    if (item.contentInspected && item.kind === 'file') { remainingBytes = Math.max(0, remainingBytes - item.byteLength); if (item.decodedPixels) remainingPixels = Math.max(0, remainingPixels - item.decodedPixels.pixelCount); }
    else if (item.evidenceError === 'aggregate-byte-limit-exceeded') remainingBytes = 0;
    else if (item.evidenceError === 'aggregate-decoded-pixel-limit-exceeded') remainingPixels = 0;
  }
  const admission = admitDesktopDrop({ session, currentSession: session, items });
  return Object.freeze({ session, items: Object.freeze(items), admission });
}

module.exports = { hashFileBounded, readHeader, exactCanonicalPath, gifFrameCount, inspectImageDimensions, itemEvidence, prepareDesktopDrop, prepareDesktopDropAsync, SURFACES, DEFAULT_LIMITS };
