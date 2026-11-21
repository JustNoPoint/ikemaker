'use strict';

const { promisify } = require('util');
const inflateRaw = promisify(require('zlib').inflateRaw);
const { crc32 } = require('./sff_png8_source');

const MiB = 1024 * 1024;
const LIMITS = Object.freeze({
  workbookBytes: 24 * MiB, directoryBytes: 2 * MiB, entries: 2048,
  xmlBytes: 3 * MiB, indexedXmlBytes: 4 * MiB, compressionRatio: 500
});
const UTF8 = new TextDecoder('utf-8', { fatal: true });
const WORKBOOK = 'xl/workbook.xml';
const RELATIONSHIPS = 'xl/_rels/workbook.xml.rels';

function invalid() {
  return new Error('The workbook package is damaged or uses an unsupported ZIP layout.');
}

function packageEnd(bytes) {
  // A ZIP comment may consume up to 65,535 bytes after the end record.
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 22 - 65535); offset--) {
    if (bytes.readUInt32LE(offset) === 0x06054b50 && offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length) {
      return offset;
    }
  }
  throw invalid();
}

function decodePartName(bytes) {
  let name;
  try { name = UTF8.decode(bytes); }
  catch (_) { throw invalid(); }
  if (!name || name.length > 512 || /[\\:\u0000-\u001f\u007f]/.test(name) ||
      name.replace(/\/$/, '').split('/').some(segment => !segment || segment === '.' || segment === '..')) {
    throw invalid();
  }
  return name;
}

function extraFields(bytes, from, length) {
  const end = from + length;
  while (from < end) {
    if (from + 4 > end) throw invalid();
    const type = bytes.readUInt16LE(from);
    if (type === 1) throw new Error('This workbook uses ZIP64, which Bible preview does not support.');
    from += 4 + bytes.readUInt16LE(from + 2);
  }
  if (from !== end) throw invalid();
}

function descriptorEnd(bytes, offset, boundary, entry) {
  const matches = from => from + 12 <= boundary && bytes.readUInt32LE(from) === entry.crc &&
    bytes.readUInt32LE(from + 4) === entry.compressed && bytes.readUInt32LE(from + 8) === entry.size;
  if (offset + 4 <= boundary && bytes.readUInt32LE(offset) === 0x08074b50 && matches(offset + 4)) return offset + 16;
  if (matches(offset)) return offset + 12;
  throw invalid();
}

function localRecord(bytes, boundary, entry, nameBytes) {
  const { local, flags, method, crc, compressed, size } = entry;
  if (local + 30 > boundary || bytes.readUInt32LE(local) !== 0x04034b50 ||
      bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method) throw invalid();
  const nameLength = bytes.readUInt16LE(local + 26), extraLength = bytes.readUInt16LE(local + 28);
  const extraStart = local + 30 + nameLength;
  const start = extraStart + extraLength, dataEnd = start + compressed;
  if (dataEnd > boundary || !bytes.subarray(local + 30, extraStart).equals(nameBytes)) throw invalid();
  extraFields(bytes, extraStart, extraLength);
  for (const [offset, expected] of [[14, crc], [18, compressed], [22, size]]) {
    const value = bytes.readUInt32LE(local + offset);
    if (value !== expected && (!(flags & 8) || value !== 0)) throw invalid();
  }
  return { start, dataEnd, end: flags & 8 ? descriptorEnd(bytes, dataEnd, boundary, entry) : dataEnd };
}

function directory(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > LIMITS.workbookBytes) throw new Error('Workbook preview supports files up to 24 MB.');
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'))) {
    throw new Error('Bible preview needs an unencrypted .xlsx or .xlsm workbook. Save an unprotected .xlsx copy in Excel.');
  }
  const end = packageEnd(bytes);
  const count = bytes.readUInt16LE(end + 10), size = bytes.readUInt32LE(end + 12), start = bytes.readUInt32LE(end + 16);
  if (count === 0xffff || size === 0xffffffff || start === 0xffffffff) {
    throw new Error('This workbook uses ZIP64, which Bible preview does not support.');
  }
  if (bytes.readUInt32LE(end + 4) !== 0 || bytes.readUInt16LE(end + 8) !== count) {
    throw new Error('This workbook spans several ZIP volumes, which Bible preview does not support.');
  }
  if (!count || count > LIMITS.entries || size > LIMITS.directoryBytes || start + size !== end) throw invalid();
  const seen = new Set(), entries = new Map();
  let offset = start;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50 || bytes.readUInt16LE(offset + 34) !== 0) throw invalid();
    const nameLength = bytes.readUInt16LE(offset + 28), extraLength = bytes.readUInt16LE(offset + 30);
    const nameStart = offset + 46, extraStart = nameStart + nameLength;
    const next = extraStart + extraLength + bytes.readUInt16LE(offset + 32);
    if (next > end) throw invalid();
    const nameBytes = bytes.subarray(nameStart, extraStart), name = decodePartName(nameBytes);
    const key = name.toLowerCase();
    if (seen.has(key)) throw invalid();
    seen.add(key);
    extraFields(bytes, extraStart, extraLength);
    const entry = {
      flags: bytes.readUInt16LE(offset + 8), method: bytes.readUInt16LE(offset + 10),
      crc: bytes.readUInt32LE(offset + 16), compressed: bytes.readUInt32LE(offset + 20),
      size: bytes.readUInt32LE(offset + 24), local: bytes.readUInt32LE(offset + 42)
    };
    if (entry.flags & 1) throw new Error('Encrypted workbooks require an unprotected .xlsx copy for Bible preview.');
    if ((entry.flags & ~0x080e) !== 0 || ![0, 8].includes(entry.method) ||
        (entry.method === 0 && entry.compressed !== entry.size)) throw invalid();
    entries.set(name, { ...entry, ...localRecord(bytes, start, entry, nameBytes) });
    offset = next;
  }
  if (offset !== end) throw invalid();
  const spans = [...entries.values()].sort((a, b) => a.local - b.local);
  for (let i = 1; i < spans.length; i++) {
    if (spans[i - 1].end > spans[i].local) throw invalid();
  }
  return entries;
}

function xmlPart(bytes) {
  let xml;
  try { xml = UTF8.decode(bytes); }
  catch (_) { throw new Error('The workbook XML uses an unsupported text encoding.'); }
  const encoding = /^<\?xml\s+[^?]*?\bencoding\s*=\s*(['"])([^'"]+)\1/i.exec(xml)?.[2];
  if (encoding && !/^UTF-8$/i.test(encoding)) throw new Error('The workbook XML uses an unsupported text encoding.');
  if (/<\s*!\s*(DOCTYPE|ENTITY)\b/i.test(xml) || xml.includes('\0')) throw new Error('The workbook XML contains an unsupported declaration.');
  return xml;
}

function openWorkbook(bytes) {
  const entries = directory(bytes);
  if (!entries.has(WORKBOOK) || !entries.has(RELATIONSHIPS)) {
    throw new Error('This file does not have an Excel Open XML workbook and worksheet directory.');
  }

  async function xml(name, maximum = LIMITS.xmlBytes) {
    const entry = entries.get(name);
    if (!entry) throw new Error('A referenced workbook part is missing.');
    if (entry.size > maximum || entry.size > Math.max(65536, entry.compressed * LIMITS.compressionRatio)) {
      throw new Error('This workbook part exceeds Bible’s preview limits.');
    }
    const input = bytes.subarray(entry.start, entry.dataEnd);
    let output = input;
    if (entry.method === 8) {
      let result;
      try { result = await inflateRaw(input, { maxOutputLength: Math.max(1, entry.size), info: true }); }
      catch (_) { throw invalid(); }
      if (result.engine.bytesWritten !== input.length) throw invalid();
      output = result.buffer;
    }
    if (output.length !== entry.size || crc32(output) !== entry.crc) throw invalid();
    return xmlPart(output);
  }

  return {
    async index() {
      if (entries.get(WORKBOOK).size + entries.get(RELATIONSHIPS).size > LIMITS.indexedXmlBytes) {
        throw new Error('The workbook index exceeds Bible’s preview limits.');
      }
      const workbook = await xml(WORKBOOK);
      const relationships = await xml(RELATIONSHIPS);
      return { workbook, relationships };
    },
    xml(name) {
      if (typeof name !== 'string' || !/^xl\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.xml$/.test(name) ||
          name.split('/').some(segment => segment === '..' || segment === '.')) {
        throw new Error('This workbook references an unsupported local XML part.');
      }
      return xml(name);
    }
  };
}

module.exports = { LIMITS, openWorkbook };
