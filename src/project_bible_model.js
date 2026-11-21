'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { setTimeout: delay } = require('timers/promises');
const { hash } = require('./mutation_safety');
const registryModel = require('./project_registry');
const { imageDimensions } = require('./artist_intake_model');
const { gifFrameCount } = require('./desktop_drop_host_evidence');
const { LIMITS: WORKBOOK_LIMITS, openWorkbook } = require('./project_bible_workbook');

const MiB = 1024 * 1024;
const LIMITS = Object.freeze({
  textBytes: 384 * 1024, imageBytes: 6 * MiB, imagePixels: 16000000, imageDimension: 8192,
  batchFiles: 24, batchBytes: 64 * MiB, entryCount: 1000, imageReferences: 12,
  inlineImageBytes: 8 * MiB, inlineImagePixels: 32000000, animationPixels: 64000000, ownerBytes: 256 * MiB
});
const FORMAT_FILTERS = Object.freeze({
  'Bible documents': ['md', 'txt', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'xlsx', 'xlsm'],
  'All files': ['*']
});
const ENTRY_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const IMAGE_MIME = Object.freeze({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' });
const OWNER_TYPES = Object.freeze({ game: ['projects', 'Game'], work: ['workProjects', 'Work project'], team: ['teams', 'Team'] });

function pathKey(filename) {
  const absolute = path.resolve(filename);
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

function lstat(filename) {
  try { return fs.lstatSync(filename); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function exactChild(parent, name, kind, create = false) {
  const filename = path.join(parent, name);
  let stat = lstat(filename);
  if (!stat && create) {
    try { fs.mkdirSync(filename); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    stat = lstat(filename);
  }
  if (!stat) return null;
  if (stat.isSymbolicLink() || !stat[kind]() || pathKey(fs.realpathSync(filename)) !== pathKey(filename)) {
    throw new Error('Bible storage contains a linked or unexpected file or folder.');
  }
  return filename;
}

function readBounded(filename, maxBytes) {
  const expected = fs.lstatSync(filename);
  if (!expected.isFile() || expected.isSymbolicLink() || pathKey(fs.realpathSync(filename)) !== pathKey(filename)) {
    throw new Error('Choose a regular local file without a link or junction in its path.');
  }
  if (expected.size > maxBytes) throw new Error(`The file exceeds the ${Math.round(maxBytes / 1024).toLocaleString('en')} KB preview limit.`);
  const descriptor = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const actual = fs.fstatSync(descriptor);
    if (!actual.isFile() || actual.dev !== expected.dev || actual.ino !== expected.ino || actual.size !== expected.size) throw new Error('The file changed while opening.');
    const bytes = Buffer.alloc(actual.size);
    let offset = 0;
    while (offset < bytes.length) {
      const read = fs.readSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (read === 0) throw new Error('The file changed while reading.');
      offset += read;
    }
    const completed = fs.fstatSync(descriptor);
    if (completed.size !== actual.size || completed.mtimeMs !== actual.mtimeMs) throw new Error('The file changed while reading.');
    return bytes;
  } finally {
    fs.closeSync(descriptor);
  }
}

function readBibleRegistry(filename) {
  if (typeof filename !== 'string' || !path.isAbsolute(filename) ||
      path.basename(filename).toLowerCase() !== 'project-registry.json' ||
      path.basename(path.dirname(filename)).toLowerCase() !== '.ikemen') {
    throw new Error('Open the Bible from a game, work project, or team in Project & Team Manager.');
  }
  const root = fs.realpathSync(path.dirname(path.dirname(filename)));
  const metadata = exactChild(root, path.basename(path.dirname(filename)), 'isDirectory');
  const registryFile = metadata && exactChild(metadata, path.basename(filename), 'isFile');
  if (!registryFile) throw new Error('Save this project registry before opening its Bible.');
  const raw = JSON.parse(decodeText(readBounded(registryFile, 4 * MiB)));
  return { registry: registryModel.normalize(raw), registryFile, metadata };
}

function resolveBibleOwner(filename, selected) {
  const type = selected && Object.hasOwn(OWNER_TYPES, selected.kind) && OWNER_TYPES[selected.kind];
  if (!type || typeof selected.id !== 'string' || !selected.id || selected.id.length > 256) throw new Error('Select an exact Bible owner.');
  const { registry, registryFile, metadata } = readBibleRegistry(filename);
  const matches = registry[type[0]].filter(item => item.id === selected.id);
  if (matches.length !== 1) throw new Error('The Bible owner could not be uniquely identified in this project registry.');
  return {
    registryFile, metadata, kind: selected.kind, id: selected.id, name: matches[0].name, label: type[1],
    key: JSON.stringify([pathKey(registryFile), selected.kind, selected.id])
  };
}

function fileFormat(name) {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.md' || ext === '.txt') return { kind: 'text', ext, maxBytes: LIMITS.textBytes };
  if (Object.hasOwn(IMAGE_MIME, ext)) return { kind: 'image', ext, maxBytes: LIMITS.imageBytes };
  if (ext === '.xlsx' || ext === '.xlsm') return { kind: 'workbook', ext, maxBytes: WORKBOOK_LIMITS.workbookBytes };
  if (ext === '.xls' || ext === '.xlsb') throw new Error('Save a .xlsx copy in Excel to preview this workbook in the Bible.');
  throw new Error('Choose a Markdown or text file, PNG, JPEG, GIF, WebP, or an .xlsx or .xlsm workbook.');
}

function decodeText(bytes) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch (_) { throw new Error('Save the document as UTF-8 text to preview it in the Bible.'); }
  if (text.includes('\0')) throw new Error('The file is not a supported text document.');
  return text;
}

function jpegSize(bytes) {
  if (bytes.length < 4 || bytes.readUInt16BE(0) !== 0xffd8) return null;
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    if (marker === 0xff) { offset++; continue; }
    if (marker === 0xd9 || marker === 0xda) break;
    const size = bytes.readUInt16BE(offset + 2);
    if (size < 2 || offset + 2 + size > bytes.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && size >= 8) {
      return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
    }
    offset += 2 + size;
  }
  return null;
}

function webpSize(bytes) {
  if (bytes.length < 26 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP' ||
      bytes.readUInt32LE(4) + 8 !== bytes.length || bytes.readUInt32LE(16) + 20 > bytes.length) return null;
  const chunk = bytes.toString('ascii', 12, 16), length = bytes.readUInt32LE(16);
  if (chunk === 'VP8X' && length === 10) return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
  if (chunk === 'VP8L' && length >= 5 && bytes[20] === 0x2f) {
    const size = bytes.readUInt32LE(21);
    return { width: 1 + (size & 0x3fff), height: 1 + ((size >>> 14) & 0x3fff) };
  }
  if (chunk === 'VP8 ' && length >= 10 && bytes.toString('hex', 23, 26) === '9d012a') {
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

function imageFrames(bytes, ext) {
  if (ext === '.gif') return gifFrameCount(bytes);
  if (ext !== '.png' && ext !== '.webp') return 1;
  let frames = 0, declared = 1;
  for (let offset = ext === '.png' ? 8 : 12; offset + 8 <= bytes.length;) {
    if (ext === '.png') {
      const length = bytes.readUInt32BE(offset);
      if (offset + 12 + length > bytes.length) break;
      const name = bytes.toString('ascii', offset + 4, offset + 8);
      if (name === 'acTL' && length === 8) declared = bytes.readUInt32BE(offset + 8);
      if (name === 'fcTL') frames++;
      offset += 12 + length;
    } else {
      const length = bytes.readUInt32LE(offset + 4);
      if (offset + 8 + length > bytes.length) break;
      if (bytes.toString('ascii', offset, offset + 4) === 'ANMF') frames++;
      offset += 8 + length + (length % 2);
    }
  }
  return Math.max(declared, frames);
}

function validateImage(bytes, ext) {
  let size;
  if (ext === '.jpg' || ext === '.jpeg') size = jpegSize(bytes);
  else if (ext === '.webp') size = webpSize(bytes);
  else {
    if (ext === '.png' && (bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a' || bytes.toString('ascii', 12, 16) !== 'IHDR')) {
      throw new Error('The image does not contain a valid PNG signature.');
    }
    size = imageDimensions(bytes, ext);
    if ('.' + size.format !== ext) size = null;
  }
  if (!size || size.width < 1 || size.height < 1 || size.width > LIMITS.imageDimension ||
      size.height > LIMITS.imageDimension || size.width * size.height > LIMITS.imagePixels) {
    throw new Error('This image is damaged or its dimensions exceed the Bible preview limit.');
  }
  const cost = size.width * size.height * imageFrames(bytes, ext);
  if (cost > LIMITS.animationPixels) throw new Error('The image animation exceeds the Bible preview limit.');
  return cost;
}

function imageUri(bytes, ext) {
  return `data:${IMAGE_MIME[ext]};base64,${bytes.toString('base64')}`;
}

function validateTitle(value) {
  const title = typeof value === 'string' ? value.trim() : '';
  if (!title || title.length > 120 || /[\u0000-\u001f\u007f]/.test(title)) throw new Error('Enter a title of 1 to 120 characters.');
  return title;
}

function noteFilename(title) {
  const stem = title.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '-').replace(/[. ]+$/, '').slice(0, 70);
  return (!stem || /^(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i.test(stem) ? 'Note-' : '') + stem + '.md';
}

function payloadName(data, format) {
  if (format.kind !== 'text') return 'document' + format.ext;
  const title = data.createdHere ? data.title : path.basename(data.name, path.extname(data.name));
  return noteFilename(title).replace(/\.md$/, format.ext);
}

function validProvenance(metadata) {
  const original = metadata.original;
  return original && typeof original.name === 'string' && original.name === metadata.name &&
    Number.isSafeInteger(original.bytes) && original.bytes >= 0 &&
    typeof original.addedAt === 'string' && Number.isFinite(Date.parse(original.addedAt)) &&
    typeof original.sha256 === 'string' && /^[a-f0-9]{64}$/.test(original.sha256);
}

async function publishDirectory(temporary, destination) {
  for (const pause of [0, 40, 90]) {
    if (pause) await delay(pause);
    if (lstat(destination)) throw new Error('The Bible document ID is in use. Try adding the document again.');
    try { fs.renameSync(temporary, destination); return; }
    catch (error) {
      if (!['EPERM', 'EBUSY'].includes(error.code) || pause === 90) throw error;
    }
  }
}

function markdownImages(text) {
  const references = new Set();
  for (const match of text.matchAll(/!\[[^\]\r\n]{0,200}\]\(([^)\r\n]{1,240})\)/g)) {
    references.add(match[1].trim());
    if (references.size === LIMITS.imageReferences) break;
  }
  return [...references];
}

class BibleStore {
  constructor(owner) {
    this.owner = owner;
  }

  folder(create = false) {
    const metadata = exactChild(path.dirname(this.owner.metadata), path.basename(this.owner.metadata), 'isDirectory');
    if (!metadata) throw new Error('The Bible’s project metadata folder is unavailable.');
    const shelf = exactChild(metadata, 'bible', 'isDirectory', create);
    const owners = shelf && exactChild(shelf, this.owner.kind, 'isDirectory', create);
    return owners && exactChild(owners, hash(this.owner.id), 'isDirectory', create);
  }

  entry(id, folder = this.folder()) {
    if (!ENTRY_ID.test(id || '') || !folder) throw new Error('That document is unavailable in the selected Bible.');
    const directory = exactChild(folder, id, 'isDirectory');
    const metadata = directory && exactChild(directory, 'entry.json', 'isFile');
    if (!metadata) throw new Error('That document is unavailable in the selected Bible.');
    const data = JSON.parse(decodeText(readBounded(metadata, 4096)));
    if (data.version !== 1 || typeof data.name !== 'string' || data.name.length > 255 ||
        typeof data.title !== 'string' || data.title.length > 255 ||
        (data.createdHere !== true && !validProvenance(data))) throw new Error('A Bible document has incomplete local metadata.');
    const formats = fileFormat(data.name);
    const createdHere = data.createdHere === true && formats.ext === '.md';
    const filename = exactChild(directory, payloadName({ ...data, createdHere }, formats), 'isFile');
    if (!filename) throw new Error('A Bible document copy is missing.');
    return { id, name: data.name, title: data.title, createdHere, filename,
      bytes: fs.statSync(filename).size, original: createdHere ? null : data.original, ...formats };
  }

  list() {
    const folder = this.folder();
    if (!folder) return { documents: [], unavailable: 0, bytes: 0 };
    const documents = [];
    let unavailable = 0, scanned = 0, bytes = 0;
    const directory = fs.opendirSync(folder);
    try {
      for (let entry; (entry = directory.readSync()) !== null;) {
        if (++scanned > LIMITS.entryCount + 100) throw new Error('This Bible exceeds its directory preview limit.');
        if (!ENTRY_ID.test(entry.name)) continue;
        try {
          const current = this.entry(entry.name, folder);
          bytes += current.bytes;
          const { id, name, title, kind, createdHere, original } = current;
          documents.push({ id, name, title, kind, createdHere, original });
        } catch (_) { unavailable++; }
      }
    } finally {
      directory.closeSync();
    }
    documents.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }) || a.id.localeCompare(b.id));
    return { documents, unavailable, bytes };
  }

  async publish(data, bytes) {
    const { documents, unavailable, bytes: currentBytes } = this.list();
    if (documents.length + unavailable >= LIMITS.entryCount) throw new Error('This Bible has reached its 1,000-document limit.');
    if (currentBytes + bytes.length > LIMITS.ownerBytes) throw new Error('This Bible has reached its 256 MB storage limit.');
    const folder = this.folder(true), id = randomUUID(), destination = path.join(folder, id);
    const temporary = fs.mkdtempSync(path.join(folder, '.adding-'));
    const payload = path.join(temporary, payloadName(data, fileFormat(data.name)));
    const metadata = path.join(temporary, 'entry.json');
    try {
      fs.writeFileSync(payload, bytes, { flag: 'wx' });
      fs.writeFileSync(metadata, JSON.stringify({ version: 1, ...data }) + '\n', { flag: 'wx' });
      await publishDirectory(temporary, destination);
    } catch (error) {
      try {
        for (const filename of [payload, metadata]) {
          if (lstat(filename)) fs.unlinkSync(filename);
        }
        fs.rmdirSync(temporary);
      } catch (_) {
        throw new Error('The document could not be added. A staging folder remains in Bible storage.', { cause: error });
      }
      throw error;
    }
    return id;
  }

  createNote(value) {
    const title = validateTitle(value);
    return this.publish({ title, name: noteFilename(title), createdHere: true }, Buffer.from(`# ${title}\n\n`));
  }

  async addFiles(filenames) {
    if (!Array.isArray(filenames) || filenames.length > LIMITS.batchFiles) throw new Error('Choose up to 24 files per add.');
    const added = [], failed = [];
    let total = 0;
    for (const filename of filenames) {
      const name = path.basename(filename);
      try {
        const format = fileFormat(name);
        const bytes = readBounded(filename, Math.min(format.maxBytes, LIMITS.batchBytes - total));
        total += bytes.length;
        if (format.kind === 'text') decodeText(bytes);
        if (format.kind === 'image') validateImage(bytes, format.ext);
        if (format.kind === 'workbook') openWorkbook(bytes);
        const original = { name, bytes: bytes.length, sha256: hash(bytes), addedAt: new Date().toISOString() };
        added.push(await this.publish({ title: name, name, createdHere: false, original }, bytes));
      } catch (error) {
        failed.push({ name, message: error.message });
      }
    }
    return { added, failed };
  }

  preview(id) {
    const document = this.entry(id);
    const bytes = readBounded(document.filename, document.maxBytes);
    if (document.kind === 'workbook') return { kind: 'workbook', archive: openWorkbook(bytes) };
    if (document.kind === 'image') {
      validateImage(bytes, document.ext);
      return { kind: 'image', src: imageUri(bytes, document.ext) };
    }
    const text = decodeText(bytes);
    if (document.ext !== '.md') return { kind: 'text', text };
    const references = markdownImages(text), images = [];
    if (!references.length) return { kind: 'markdown', text, images };
    const candidates = this.list().documents.filter(item => item.kind === 'image');
    let loaded = 0, pixels = 0;
    for (const reference of references) {
      const matches = /^bible:/i.test(reference)
        ? candidates.filter(item => item.id === reference.slice(6))
        : candidates.filter(item => reference === item.name || reference === './' + item.name);
      if (matches.length !== 1) continue;
      try {
        const image = this.entry(matches[0].id);
        const imageBytes = readBounded(image.filename, Math.min(image.maxBytes, LIMITS.inlineImageBytes - loaded));
        const cost = validateImage(imageBytes, image.ext);
        if (pixels + cost > LIMITS.inlineImagePixels) continue;
        images.push({ reference, src: imageUri(imageBytes, image.ext) });
        loaded += imageBytes.length;
        pixels += cost;
      } catch (_) { /* The preview labels any unresolved image reference. */ }
    }
    return { kind: 'markdown', text, images };
  }
}

module.exports = { BibleStore, FORMAT_FILTERS, LIMITS, readBibleRegistry, resolveBibleOwner, validateTitle };
