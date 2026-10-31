'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { parseSffBuffer } = require('./sff_reader');

const SCHEMA = 'ikemaker.sff-needs-palette-handoff';
const METHODS = new Set(['single-palette', 'automatic-tiles', 'reviewed-tiles']);
const RETURN_COMMANDS = new Set(['sff.openAddSprites', 'sff.openCreator']);
const MAX_SOURCES = 500;
const MAX_SOURCE_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const MAX_TOTAL_PIXELS = 268435456;
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex').toLowerCase();
const clone = value => JSON.parse(JSON.stringify(value));
const seal = body => digest(Buffer.from(JSON.stringify(body)));
const versionOf = archive => Array.isArray(archive.header?.version) ? `${Number(archive.header.version[0]) || 0}.${Number(archive.header.version[2]) || 0}` : '?';
function stableRead(filename, expectedLength, maximum = Number.MAX_SAFE_INTEGER) { const fd=fs.openSync(filename,'r');try{const before=fs.fstatSync(fd);if(!before.isFile()||before.size!==expectedLength||before.size>maximum)throw new Error(`${path.basename(filename)} changed after Add Sprites review.`);const buffer=Buffer.allocUnsafe(before.size+1);let offset=0;while(offset<buffer.length){const count=fs.readSync(fd,buffer,offset,buffer.length-offset,offset);if(!count)break;offset+=count}const after=fs.fstatSync(fd);if(offset!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.dev!==before.dev||after.ino!==before.ino)throw new Error(`${path.basename(filename)} changed while Palette Workshop was verifying it.`);return buffer.subarray(0,offset)}finally{fs.closeSync(fd)}}

function normalizedSource(source) {
  const filename = path.resolve(String(source.path || source.filename || ''));
  const row = { filename, byteHash: String(source.hash || source.byteHash || '').toLowerCase(), byteLength: Number(source.bytes ?? source.byteLength), width: Number(source.width), height: Number(source.height), bitDepth: Number(source.bitDepth), colorType: Number(source.colorType) };
  if (!filename || !/^[0-9a-f]{64}$/.test(row.byteHash) || !Number.isSafeInteger(row.byteLength) || row.byteLength < 1 || row.byteLength > MAX_SOURCE_BYTES || !Number.isSafeInteger(row.width) || row.width < 1 || !Number.isSafeInteger(row.height) || row.height < 1 || !Number.isSafeInteger(row.bitDepth) || !Number.isSafeInteger(row.colorType)) throw new Error('Needs Palette received invalid source evidence. Choose the images again.');
  return row;
}

function create({ target, sources, tilingMethod, returnContext } = {}) {
  const rows = (Array.isArray(sources) ? sources : []).map(normalizedSource);
  if (!rows.length || rows.length > MAX_SOURCES) throw new Error(`Needs Palette requires 1–${MAX_SOURCES} reviewed PNG sources.`);
  if (!METHODS.has(tilingMethod)) throw new Error('Needs Palette received an unknown tiling method.');
  const body = { schema: SCHEMA, version: 1, target: { filename: path.resolve(String(target?.path || target?.filename || '')), byteHash: String(target?.hash || target?.byteHash || '').toLowerCase(), byteLength: Number(target?.bytes ?? target?.byteLength), sffVersion: String(target?.version || target?.sffVersion || '') }, sources: rows, tilingMethod, returnContext: { command: String(returnContext?.command || 'sff.openAddSprites'), targetPath: path.resolve(String(returnContext?.targetPath || target?.path || target?.filename || '')) } };
  if (!body.target.filename || !/^[0-9a-f]{64}$/.test(body.target.byteHash) || !Number.isSafeInteger(body.target.byteLength) || body.target.byteLength < 1 || !/^\d+\.\d+$/.test(body.target.sffVersion) || !RETURN_COMMANDS.has(body.returnContext.command) || body.returnContext.targetPath !== body.target.filename) throw new Error('Needs Palette received invalid target evidence. Reopen Add Sprites.');
  return Object.freeze({ ...body, handoffHash: seal(body) });
}

function pngShape(bytes, filename) {
  if (bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error(`${path.basename(filename)} is no longer a valid PNG.`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bitDepth: bytes[24], colorType: bytes[25] };
}

function revalidate(handoff) {
  if (!handoff || handoff.schema !== SCHEMA || handoff.version !== 1 || handoff.handoffHash !== seal(Object.fromEntries(Object.entries(handoff).filter(([key]) => key !== 'handoffHash')))) throw new Error('Needs Palette handoff changed outside its owner. Reopen Add Sprites.');
  const created = create(handoff);
  if (created.handoffHash !== handoff.handoffHash) throw new Error('Needs Palette handoff is not canonical. Reopen Add Sprites.');
  const targetBytes = stableRead(created.target.filename,created.target.byteLength), archive = parseSffBuffer(targetBytes,created.target.filename);
  if (digest(targetBytes) !== created.target.byteHash || versionOf(archive) !== created.target.sffVersion) throw new Error('The target SFF changed after Add Sprites review. Reopen the flow.');
  let totalBytes = 0, totalPixels = 0;
  for (const source of created.sources) {
    const bytes = stableRead(source.filename,source.byteLength,MAX_SOURCE_BYTES);
    totalBytes += bytes.length;
    const shape = pngShape(bytes, source.filename), pixels = shape.width * shape.height;
    totalPixels += pixels;
    if (bytes.length !== source.byteLength || digest(bytes) !== source.byteHash || shape.width !== source.width || shape.height !== source.height || shape.bitDepth !== source.bitDepth || shape.colorType !== source.colorType) throw new Error(`${path.basename(source.filename)} changed after Add Sprites review. Choose it again.`);
    if (totalBytes > MAX_TOTAL_BYTES || !Number.isSafeInteger(pixels) || !Number.isSafeInteger(totalPixels) || totalPixels > MAX_TOTAL_PIXELS) throw new Error('The Needs Palette source set exceeds the reviewed intake limits. Split it into smaller batches.');
  }
  return clone(created);
}

function adopt(service, filename, handoff) { const retained=revalidate(handoff),target=path.resolve(filename);if(path.resolve(retained.target.filename)!==target)throw new Error('Needs Palette target no longer matches this Palette Workshop.');return service.mutate(target,{context:{origin:{surface:retained.returnContext.command==='sff.openCreator'?'sff-creator':'sff-add-sprites',kind:'needs-palette'},returnContext:retained.returnContext,needsPaletteHandoff:retained,section:'sources-preflight'}}); }
function clear(service, filename) { const current=service.snapshot(filename);if(!current.context.needsPaletteHandoff)return current;return service.mutate(filename,{context:{needsPaletteHandoff:null,returnContext:null,origin:{surface:'palette-workspace'}}}); }

module.exports = { SCHEMA, METHODS, RETURN_COMMANDS, create, revalidate, adopt, clear };
