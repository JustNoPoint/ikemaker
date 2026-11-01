'use strict';

const crypto = require('crypto');
const path = require('path');
const { transactionalWriteSet } = require('./mutation_safety');

const MAX_SEQUENCE_FRAMES = 10000;

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function safePrefix(value, fallback = 'frame') {
  return String(value || fallback).trim().replace(/[^a-z0-9._-]+/gi, '_').replace(/^[_ .-]+|[_ .-]+$/g, '') || fallback;
}

function wholeNumber(value, label, minimum = 0) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum) throw new Error(`${label} must be a whole number of at least ${minimum}.`);
  return number;
}

function sourceProvenance(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const result = {
    kind: String(source.kind || 'extracted-image-sequence'),
    path: source.path ? path.resolve(String(source.path)) : null,
    sha256: /^[a-f0-9]{64}$/i.test(String(source.sha256 || '')) ? String(source.sha256).toLowerCase() : null
  };
  if (source.mode) result.mode = String(source.mode);
  return result;
}

function pageProvenance(value) {
  if (!Array.isArray(value)) return undefined;
  return value.map(page => ({ index: Number(page?.index), name: String(page?.name || '') })).filter(page => Number.isSafeInteger(page.index));
}

function planFrameSequenceExport(fs, frames, destination, options = {}) {
  if (!Array.isArray(frames) || !frames.length) throw new Error('At least one extracted PNG frame is required.');
  if (frames.length > MAX_SEQUENCE_FRAMES) throw new Error(`A frame sequence may contain at most ${MAX_SEQUENCE_FRAMES} images.`);
  const root = path.resolve(destination || '');
  if (!destination || (fs.existsSync(root) && !fs.statSync(root).isDirectory())) throw new Error('Choose a destination folder for the PNG sequence.');
  const prefix = safePrefix(options.prefix, 'frame'), start = wholeNumber(options.start ?? 0, 'First frame number'), padding = wholeNumber(options.padding ?? 5, 'Filename padding', 1);
  if (padding > 12) throw new Error('Filename padding may not exceed 12 digits.');
  const planned = frames.map((raw, index) => {
    const source = path.resolve(typeof raw === 'string' ? raw : raw?.filename || '');
    if (!source || !fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error(`Extracted frame ${index + 1} is missing.`);
    if (path.extname(source).toLowerCase() !== '.png') throw new Error(`Extracted frame ${index + 1} is not a PNG: ${source}`);
    const data = fs.readFileSync(source), number = start + index, outputName = `${prefix}_${String(number).padStart(padding, '0')}.png`, target = path.resolve(root, outputName);
    if (path.dirname(target) !== root) throw new Error(`Unsafe PNG sequence output name: ${outputName}`);
    const item = {
      source, sourceHash: sha256(data), sourceOrdinal: Number.isSafeInteger(Number(raw?.sourceOrdinal)) ? Number(raw.sourceOrdinal) : Number.isSafeInteger(Number(raw?.ordinal)) ? Number(raw.ordinal) : index,
      outputName, target
    };
    if (raw && Object.prototype.hasOwnProperty.call(raw, 'delayMs') && Number.isFinite(Number(raw.delayMs))) item.delayMs = Math.max(0, Number(raw.delayMs));
    if (raw?.role) item.role = String(raw.role);
    if (raw?.label) item.label = String(raw.label);
    const pages = pageProvenance(raw?.pages); if (pages) item.pages = pages;
    return item;
  });
  const duplicate = planned.find((item, index) => planned.findIndex(other => other.target.toLowerCase() === item.target.toLowerCase()) !== index);
  if (duplicate) throw new Error(`The PNG sequence would create the same filename more than once: ${duplicate.outputName}`);
  const manifestName = `${prefix}_sequence.json`, manifestTarget = path.resolve(root, manifestName);
  const collision = [...planned, { target: manifestTarget }].find(item => fs.existsSync(item.target));
  if (collision) throw new Error(`A PNG sequence file already exists and will not be replaced: ${collision.target}`);
  const provenance = sourceProvenance(options.source);
  const manifest = {
    version: 1, source: provenance, export: { prefix, start, padding },
    frames: planned.map(item => ({
      filename: item.outputName, sourceOrdinal: item.sourceOrdinal,
      ...(Object.prototype.hasOwnProperty.call(item, 'delayMs') ? { delayMs: item.delayMs } : {}),
      ...(item.label ? { label: item.label } : {}), ...(item.role ? { role: item.role } : {}), ...(item.pages ? { pages: item.pages } : {})
    }))
  };
  return { version: 1, destination: root, prefix, start, padding, source: provenance, manifestName, manifestTarget, manifest, frames: planned };
}

function executeFrameSequenceExport(fs, plan, options = {}) {
  if (!plan || plan.version !== 1 || !Array.isArray(plan.frames) || !plan.frames.length) throw new Error('A reviewed PNG sequence export plan is required.');
  const writes = plan.frames.map((item, index) => {
    if (!item?.source || !item?.target || !fs.existsSync(item.source)) throw new Error(`Extracted frame ${index + 1} is no longer available.`);
    const data = fs.readFileSync(item.source);
    if (sha256(data) !== item.sourceHash) throw new Error(`Extracted frame ${index + 1} changed after review and was not exported: ${item.source}`);
    if (fs.existsSync(item.target)) throw new Error(`A PNG sequence file appeared after review and will not be replaced: ${item.target}`);
    return [item.target, data];
  });
  if (!plan.manifestTarget || !plan.manifest || fs.existsSync(plan.manifestTarget)) throw new Error(`The PNG sequence provenance manifest cannot be created without replacing a file: ${plan.manifestTarget || '(missing target)'}`);
  writes.push([plan.manifestTarget, `${JSON.stringify(plan.manifest, null, 2)}\n`]);
  const results = transactionalWriteSet(fs, writes, { label: options.label || 'export-frame-sequence', allowExisting: false, backup: false, journal: false });
  return { destination: plan.destination, manifest: plan.manifestTarget, frames: plan.frames.map((item, index) => ({ ...item, bytes: results[index].bytes, outputHash: results[index].afterHash })) };
}

module.exports = { MAX_SEQUENCE_FRAMES, safePrefix, sourceProvenance, planFrameSequenceExport, executeFrameSequenceExport };
