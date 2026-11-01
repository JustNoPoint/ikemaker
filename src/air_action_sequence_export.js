'use strict';

const crypto = require('crypto');
const path = require('path');
const { spritePng, rgbaPng } = require('./sff_reader');
const { transactionalWriteSet } = require('./mutation_safety');

const MAX_ACTION_ELEMENTS = 10000;
const MAX_EXPORT_BYTES = 512 * 1024 * 1024;
const MAX_SPRITE_PIXELS = 16 * 1024 * 1024;
const MAX_UNIQUE_PIXELS = 64 * 1024 * 1024;
const MAX_CANDIDATE_EVIDENCE = 32;

function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function safeName(value, fallback = 'air') { return String(value || fallback).replace(/[^a-z0-9._-]+/gi, '_').replace(/^[_ .-]+|[_ .-]+$/g, '') || fallback; }
function assertHash(value, label) { if (!/^[a-f0-9]{64}$/i.test(String(value || ''))) throw new Error(`${label} hash is invalid.`); return String(value).toLowerCase(); }

function readBoundedStableFile(fs, filename, maximumBytes, label = 'Source') {
  const target = path.resolve(String(filename || '')), handle = fs.openSync(target, 'r');
  try {
    const before = fs.fstatSync(handle);
    if (!before.isFile() || before.size < 0 || before.size > maximumBytes) throw new Error(`${label} exceeds the ${maximumBytes}-byte admission limit.`);
    const buffer = Buffer.alloc(before.size + 1), count = fs.readSync(handle, buffer, 0, buffer.length, 0), after = fs.fstatSync(handle);
    if (count !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || (before.ino && after.ino && before.ino !== after.ino)) throw new Error(`${label} changed while it was being admitted. Reopen the export.`);
    return buffer.subarray(0, count);
  } finally { fs.closeSync(handle); }
}

function planAirActionSequence(fs, input) {
  const action = input?.action, archive = input?.archive, destination = path.resolve(String(input?.destination || ''));
  if (!action || !Number.isSafeInteger(Number(action.number)) || !Array.isArray(action.frames) || !action.frames.length) throw new Error('Choose one non-empty AIR Action to export.');
  if (action.frames.length > MAX_ACTION_ELEMENTS) throw new Error(`An AIR Action export may contain at most ${MAX_ACTION_ELEMENTS} elements.`);
  if (!destination || (fs.existsSync(destination) && !fs.statSync(destination).isDirectory())) throw new Error('Choose a destination folder for the AIR Action sequence.');
  if (!archive || !Array.isArray(archive.sprites)) throw new Error('The assigned SFF archive is unavailable.');
  const airPath = path.resolve(String(input.airPath || '')), sffPath = path.resolve(String(input.sffPath || ''));
  const airHash = assertHash(input.airHash, 'AIR source'), sffHash = assertHash(input.sffHash, 'SFF source');
  const prefix = `${safeName(path.basename(airPath, path.extname(airPath)))}_action_${action.number}`;
  const inventory = new Map();
  for (const sprite of archive.sprites) { const key = `${sprite.group},${sprite.number}`, row = inventory.get(key) || []; row.push(sprite); inventory.set(key, row); }
  const transparent = rgbaPng(1, 1, Buffer.alloc(4)), frames = [], writes = [], encoded = new Map(), admitted = new Set();
  let aggregateBytes = 0, aggregateUniquePixels = 0, drawable = 0, blank = 0, missing = 0, ambiguous = 0;
  for (let element = 0; element < action.frames.length; element += 1) {
    const frame = action.frames[element], ordinal = String(element + 1).padStart(5, '0'), candidates = frame.group >= 0 ? (inventory.get(`${frame.group},${frame.index}`) || []) : [], sprite = candidates.length === 1 ? candidates[0] : null;
    const status = frame.group < 0 ? 'blank' : candidates.length > 1 ? 'ambiguous-sprite' : sprite ? 'sprite' : 'missing-sprite';
    if (status === 'sprite') drawable += 1; else if (status === 'blank') blank += 1; else if (status === 'ambiguous-sprite') ambiguous += 1; else missing += 1;
    const selectedPalette = Number(input.paletteForGroup?.(frame.group)), paletteIndex = status === 'sprite' && sprite.colorDepth === 8 && Number.isInteger(selectedPalette) ? selectedPalette : null;
    let bytes = transparent;
    if (status === 'sprite') {
      const pixels = Number(sprite.width) * Number(sprite.height), key = `${sprite.index}:${paletteIndex}`;
      if (!Number.isSafeInteger(pixels) || pixels < 1 || pixels > MAX_SPRITE_PIXELS) throw new Error(`Sprite ${frame.group},${frame.index} exceeds the 16-megapixel export limit.`);
      if (!admitted.has(key)) { admitted.add(key); aggregateUniquePixels += pixels; if (aggregateUniquePixels > MAX_UNIQUE_PIXELS) throw new Error('The AIR Action exceeds the 64-megapixel unique sprite decode limit.'); }
      if (!encoded.has(key)) encoded.set(key, spritePng(archive, sprite, paletteIndex));
      bytes = encoded.get(key);
    }
    aggregateBytes += bytes.length; if (aggregateBytes > MAX_EXPORT_BYTES) throw new Error('The AIR Action PNG sequence exceeds the 512 MiB export limit.');
    const filename = `${prefix}_element_${ordinal}.png`, target = path.resolve(destination, filename);
    if (path.dirname(target) !== destination) throw new Error('The AIR Action export produced an unsafe filename.');
    if (fs.existsSync(target)) throw new Error(`An AIR Action export file already exists and will not be replaced: ${target}`);
    writes.push([target, bytes]);
    frames.push({ element, filename, status, group: Number(frame.group), index: Number(frame.index), x: Number(frame.x) || 0, y: Number(frame.y) || 0, rawTicks: Number.isFinite(Number(frame.rawTime)) ? Number(frame.rawTime) : Number(frame.time), flags: String(frame.flags || ''), paletteIndex, sourceSpritePhysicalIndex: sprite?.index ?? null, candidatePhysicalIndices: candidates.length > 1 ? candidates.slice(0, MAX_CANDIDATE_EVIDENCE).map(item => item.index) : undefined, candidateCount: candidates.length > 1 ? candidates.length : undefined, omittedCandidateCount: candidates.length > MAX_CANDIDATE_EVIDENCE ? candidates.length - MAX_CANDIDATE_EVIDENCE : undefined, pngSha256: sha(bytes) });
  }
  const manifestTarget = path.resolve(destination, `${prefix}_sequence.json`);
  if (fs.existsSync(manifestTarget)) throw new Error(`An AIR Action export manifest already exists and will not be replaced: ${manifestTarget}`);
  const manifest = { schema: 'ikemaker.air-action-png-sequence', version: 1, source: { airPath, airSha256: airHash, sffPath, sffSha256: sffHash }, action: { number: Number(action.number), line: Number(action.line) || null, loopStartElement: Number.isInteger(action.loopStart) ? action.loopStart : null, elementCount: frames.length }, summary: { drawable, blank, missing, ambiguous, pngBytes: aggregateBytes }, frames };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  if (aggregateBytes + manifestBytes.length > MAX_EXPORT_BYTES) throw new Error('The AIR Action PNG sequence and manifest exceed the 512 MiB export limit.');
  writes.push([manifestTarget, manifestBytes]);
  return { version: 1, destination, airPath, sffPath, airHash, sffHash, manifestTarget, manifest, writes };
}

function executeAirActionSequence(fs, plan) {
  if (!plan || plan.version !== 1 || !Array.isArray(plan.writes) || plan.writes.length < 2) throw new Error('A reviewed AIR Action export plan is required.');
  if (sha(readBoundedStableFile(fs, plan.airPath, 16 * 1024 * 1024, 'AIR source')) !== plan.airHash) throw new Error('The AIR source changed after review. Reopen the export; nothing was written.');
  if (sha(readBoundedStableFile(fs, plan.sffPath, MAX_EXPORT_BYTES, 'SFF source')) !== plan.sffHash) throw new Error('The connected SFF changed after review. Reopen the export; nothing was written.');
  for (const [target] of plan.writes) if (fs.existsSync(target)) throw new Error(`An AIR Action export file appeared after review and will not be replaced: ${target}`);
  const results = transactionalWriteSet(fs, plan.writes, { label: 'export-air-action-png-sequence', allowExisting: false, backup: false, journal: false });
  return { destination: plan.destination, manifest: plan.manifestTarget, files: results.length };
}

module.exports = { MAX_ACTION_ELEMENTS, MAX_EXPORT_BYTES, MAX_SPRITE_PIXELS, MAX_UNIQUE_PIXELS, MAX_CANDIDATE_EVIDENCE, safeName, readBoundedStableFile, planAirActionSequence, executeAirActionSequence };
