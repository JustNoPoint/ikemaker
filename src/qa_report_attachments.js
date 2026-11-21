'use strict';

// Images a reporter explicitly adds to a QA report. Each picked file is
// validated (format sniffed from its bytes, bounded size and dimensions) and
// copied into the game's .ikemen/workflows/qa-attachments folder, named by its
// SHA-256. Nothing is uploaded. These are "user-added" images, distinct from
// any tool-collected debug evidence.

const fsDefault = require('fs');
const path = require('path');
const crypto = require('crypto');

const LIMITS = Object.freeze({ bytes: 8 * 1024 * 1024, side: 8192, pixels: 40 * 1000 * 1000, perReport: 12, totalBytes: 48 * 1024 * 1024, fieldChars: 60000, nameChars: 200 });
const EXTENSIONS = Object.freeze({ png: 'png', jpeg: 'jpg', gif: 'gif', webp: 'webp' });
const PICKER_FILTERS = Object.freeze({ Images: ['png', 'jpg', 'jpeg', 'gif', 'webp'] });
const ORIGIN = 'user-added';

function fileName(record) { return `${record.id}.${EXTENSIONS[record.format]}`; }
function sha256(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
function oneLine(value, maximum) { return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, maximum); }

function checkedDimensions(format, width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw new Error(`The ${format.toUpperCase()} image has invalid dimensions.`);
  if (width > LIMITS.side || height > LIMITS.side || width * height > LIMITS.pixels) throw new Error(`The image is ${width}×${height}; the limit is ${LIMITS.side} pixels per side and ${LIMITS.pixels / 1e6} megapixels.`);
  return { format, width, height };
}

function jpegDimensions(buffer) {
  let offset = 2;
  for (let guard = 0; guard < 4096 && offset + 4 <= buffer.length; guard += 1) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    if (marker === 0xff) { offset += 1; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
    if (marker === 0xd9 || marker === 0xda) break;
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buffer.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 7) break;
      return checkedDimensions('jpeg', buffer.readUInt16BE(offset + 7), buffer.readUInt16BE(offset + 5));
    }
    offset += 2 + length;
  }
  throw new Error('The JPEG image has no readable frame header.');
}

function webpDimensions(buffer) {
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X' && buffer.length >= 30) return checkedDimensions('webp', buffer.readUIntLE(24, 3) + 1, buffer.readUIntLE(27, 3) + 1);
  if (chunk === 'VP8L' && buffer.length >= 25 && buffer[20] === 0x2f) { const bits = buffer.readUInt32LE(21); return checkedDimensions('webp', (bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1); }
  if (chunk === 'VP8 ' && buffer.length >= 30 && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) return checkedDimensions('webp', buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff);
  throw new Error('The WebP image has no readable header.');
}

// Format comes from the bytes, never from the file extension.
function sniffImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) throw new Error('The file is too small to be a supported image.');
  if (buffer.length >= 24 && buffer.readUInt32BE(0) === 0x89504e47 && buffer.readUInt32BE(4) === 0x0d0a1a0a && buffer.toString('ascii', 12, 16) === 'IHDR') return checkedDimensions('png', buffer.readUInt32BE(16), buffer.readUInt32BE(20));
  if (/^GIF8[79]a$/.test(buffer.toString('ascii', 0, 6))) return checkedDimensions('gif', buffer.readUInt16LE(6), buffer.readUInt16LE(8));
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return jpegDimensions(buffer);
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return webpDimensions(buffer);
  throw new Error('Only PNG, JPEG, GIF and WebP images can be added.');
}

const STORE_COMPONENTS = Object.freeze(['.ikemen', 'workflows', 'qa-attachments']);
const samePath = (left, right) => process.platform === 'win32' ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase() : path.resolve(left) === path.resolve(right);
function storeDirectory(gameRoot) { return path.join(path.resolve(gameRoot), ...STORE_COMPONENTS); }

// Resolves the attachment folder as exactly <real game root>/.ikemen/workflows/
// qa-attachments. Every existing component must be a real directory (not a
// symbolic link or junction) whose canonical path is that exact location.
// With create, missing components are made one at a time and re-checked.
// Returns { path, exists } or throws; nothing is written outside the root.
function resolveStore(gameRoot, options = {}) {
  const fs = options.fs || fsDefault, realpath = (value) => (fs.realpathSync.native || fs.realpathSync)(value);
  let current = realpath(path.resolve(gameRoot));
  if (!fs.lstatSync(current).isDirectory()) throw new Error('The game folder is not a directory.');
  for (const component of STORE_COMPONENTS) {
    const next = path.join(current, component);
    let stat = null;
    try { stat = fs.lstatSync(next); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!stat) {
      if (!options.create) return { path: path.join(current, ...STORE_COMPONENTS.slice(STORE_COMPONENTS.indexOf(component))), exists: false };
      try { fs.mkdirSync(next); } catch (error) { if (error.code !== 'EEXIST') throw error; }
      stat = fs.lstatSync(next);
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`The QA attachments path contains a link or non-folder at ${component}; nothing was read or written.`);
    if (!samePath(realpath(next), next)) throw new Error(`The QA attachments path is redirected at ${component} (link or junction); nothing was read or written.`);
    current = next;
  }
  return { path: current, exists: true };
}

// Reads at most LIMITS.bytes through one file descriptor. The file must be a
// regular, non-link file whose identity and size stay the same from lstat to
// the end of the read; growth or shrinkage while reading is refused.
function readBounded(fs, filename) {
  const before = fs.lstatSync(filename);
  if (before.isSymbolicLink()) throw new Error('Links are not accepted; choose the image file itself.');
  if (!before.isFile()) throw new Error('Choose an image file.');
  if (before.size > LIMITS.bytes) throw new Error(`The image is larger than ${LIMITS.bytes / 1024 / 1024} MiB.`);
  const descriptor = fs.openSync(filename, 'r');
  try {
    const opened = fs.fstatSync(descriptor);
    if (!opened.isFile() || opened.size !== before.size || opened.ino !== before.ino || opened.dev !== before.dev) throw new Error('The image changed while it was being read.');
    const content = Buffer.alloc(opened.size);
    let offset = 0;
    while (offset < content.length) {
      const read = fs.readSync(descriptor, content, offset, content.length - offset, offset);
      if (read <= 0) break;
      offset += read;
    }
    const extra = Buffer.alloc(1);
    if (offset !== content.length || fs.readSync(descriptor, extra, 0, 1, content.length) !== 0) throw new Error('The image changed while it was being read.');
    const after = fs.fstatSync(descriptor);
    if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs) throw new Error('The image changed while it was being read.');
    return content;
  } finally { fs.closeSync(descriptor); }
}

// Exclusive create of a temporary file inside the verified folder, then rename.
function writeNew(fs, directory, name, content) {
  const temporary = path.join(directory, `.${name}.${crypto.randomBytes(8).toString('hex')}.tmp`), target = path.join(directory, name);
  const descriptor = fs.openSync(temporary, 'wx');
  try {
    let offset = 0;
    while (offset < content.length) offset += fs.writeSync(descriptor, content, offset, content.length - offset);
    fs.fsyncSync(descriptor);
  } finally { fs.closeSync(descriptor); }
  try { fs.renameSync(temporary, target); } catch (error) { try { fs.unlinkSync(temporary); } catch (_) { /* best effort */ } throw error; }
  return target;
}

function normalizeImage(item) {
  if (!item || typeof item !== 'object') return null;
  const id = String(item.id || '').toLowerCase(), bytes = Number(item.bytes), width = Number(item.width), height = Number(item.height);
  if (!/^[a-f0-9]{64}$/.test(id) || !Object.hasOwn(EXTENSIONS, item.format) || item.origin !== ORIGIN) return null;
  if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > LIMITS.bytes) return null;
  try { checkedDimensions(item.format, width, height); } catch (_) { return null; }
  const addedAt = oneLine(item.addedAt, 64);
  return { id, format: item.format, bytes, width, height, originalName: oneLine(item.originalName, LIMITS.nameChars) || `image.${EXTENSIONS[item.format]}`, addedAt: addedAt && !Number.isNaN(Date.parse(addedAt)) ? addedAt : '', origin: ORIGIN };
}

// Record-shape validation only (no filesystem); duplicates and excess dropped.
function normalizeImages(list) {
  if (!Array.isArray(list)) return [];
  const output = [], seen = new Set();
  for (const item of list) {
    const image = normalizeImage(item);
    if (!image || seen.has(image.id)) continue;
    seen.add(image.id); output.push(image);
    if (output.length >= LIMITS.perReport) break;
  }
  return output;
}

function parseImageField(text) {
  const value = String(text || '');
  if (!value.trim() || value.length > LIMITS.fieldChars) return [];
  try { return normalizeImages(JSON.parse(value)); } catch (_) { return []; }
}

// Copies one explicitly chosen file into the verified store (content-addressed;
// an identical existing copy is reused after its hash is checked).
function importImage(gameRoot, sourcePath, options = {}) {
  const fs = options.fs || fsDefault, content = readBounded(fs, sourcePath), info = sniffImage(content), id = sha256(content);
  const record = { id, format: info.format, bytes: content.length, width: info.width, height: info.height, originalName: oneLine(path.basename(sourcePath), LIMITS.nameChars), addedAt: options.now || new Date().toISOString(), origin: ORIGIN };
  const store = resolveStore(gameRoot, { fs, create: true }).path, name = fileName(record), target = path.join(store, name);
  let existing = null;
  try { existing = fs.lstatSync(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing) { if (sha256(readBounded(fs, target)) !== id) throw new Error('A different file already occupies this attachment name. Review the qa-attachments folder.'); }
  else writeNew(fs, store, name, content);
  return record;
}

// Re-checks client-supplied records against the stored files in the verified
// store. Only images whose stored bytes still hash to their ID are kept;
// metadata is re-derived from the file, except the original name and time.
function verifyImages(gameRoot, list, options = {}) {
  const fs = options.fs || fsDefault, images = [], missing = [];
  let store = '', total = 0;
  try { const resolved = resolveStore(gameRoot, { fs }); if (resolved.exists) store = resolved.path; } catch (_) { store = ''; }
  for (const record of normalizeImages(list)) {
    try {
      if (!store) throw new Error('store unavailable');
      const content = readBounded(fs, path.join(store, fileName(record)));
      if (sha256(content) !== record.id) throw new Error('changed');
      const info = sniffImage(content);
      if (info.format !== record.format || total + content.length > LIMITS.totalBytes) throw new Error('mismatch');
      total += content.length;
      images.push({ ...record, bytes: content.length, width: info.width, height: info.height });
    } catch (_) { missing.push(record); }
  }
  return { images, missing };
}

// Folder the webview may preview from: the canonical store path, or '' when
// any existing component is a link, junction or not a folder.
function previewDirectory(gameRoot, options = {}) {
  try { return resolveStore(gameRoot, { fs: options.fs }).path; } catch (_) { return ''; }
}

module.exports = { LIMITS, EXTENSIONS, PICKER_FILTERS, ORIGIN, STORE_COMPONENTS, storeDirectory, resolveStore, previewDirectory, readBounded, fileName, sniffImage, normalizeImages, parseImageField, importImage, verifyImages };
