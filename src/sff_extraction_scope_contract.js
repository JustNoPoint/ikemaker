'use strict';

const crypto = require('crypto');
const { parseSffBuffer, friendlyVersion } = require('./sff_reader');
const { canonicalize, hashCanonical } = require('./sff_capability_report');

const EXTRACTION_SNAPSHOT_VERSION = 1;
const MODES = Object.freeze(['current', 'marked', 'visible', 'group', 'range', 'named-work-set', 'all']);
const SHA256 = /^[0-9a-f]{64}$/i;
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(freeze); return value; }
function integer(value, label, min = 0) { const n = Number(value); if (!Number.isSafeInteger(n) || n < min) throw new Error(`${label} must be an integer of at least ${min}.`); return n; }
function boundedText(value, label, maximum = 160) { const text = String(value || '').trim(); if (!text || text.length > maximum || /[\u0000-\u001f]/.test(text)) throw new Error(`${label} is invalid.`); return text; }
function requiredHash(value, label) { const result = String(value || '').toLowerCase(); if (!SHA256.test(result)) throw new Error(`${label} must be a SHA-256 hash.`); return result; }
function signedInteger(value, label) { const n = Number(value); if (!Number.isSafeInteger(n)) throw new Error(`${label} must be a safe integer.`); return n; }

function createExtractionSnapshot(input = {}, options = {}) {
  if (!Buffer.isBuffer(input.archiveBytes) && !(input.archiveBytes instanceof Uint8Array)) throw new Error('Exact SFF archiveBytes are required.');
  const bytes = Buffer.from(input.archiveBytes), parse = options.parse || parseSffBuffer, archive = parse(Buffer.from(bytes), String(input.resourceIdentity || ''));
  if (!archive || !Array.isArray(archive.sprites)) throw new Error('The SFF parser returned no physical sprite table.');
  const entries = archive.sprites.map((sprite, physicalIndex) => ({
    entryId: `sprite@${physicalIndex}`, physicalIndex, group: integer(sprite.group, `sprite ${physicalIndex} group`), number: integer(sprite.number, `sprite ${physicalIndex} number`), identity: `${sprite.group},${sprite.number}`,
    width: integer(sprite.width, `sprite ${physicalIndex} width`), height: integer(sprite.height, `sprite ${physicalIndex} height`), axisX: signedInteger(sprite.axisX ?? 0, `sprite ${physicalIndex} axisX`), axisY: signedInteger(sprite.axisY ?? 0, `sprite ${physicalIndex} axisY`),
    palettePhysicalIndex: Number.isSafeInteger(Number(sprite.paletteIndex)) ? Number(sprite.paletteIndex) : null,
    storageKind: Number(sprite.dataSize) > 0 ? 'stored' : 'linked', linkPhysicalIndex: Number(sprite.dataSize) > 0 ? null : integer(sprite.link, `sprite ${physicalIndex} link`),
    format: Number(sprite.format), colorDepth: Number(sprite.colorDepth), dataOffset: Number(sprite.dataOffset), dataSize: Number(sprite.dataSize), headerOffset: Number(sprite.headerOffset), legacy: sprite.legacy === true, flags: Number(sprite.flags) || 0
  }));
  const snapshot = { schema: 'ikemaker.sff-extraction-snapshot', version: EXTRACTION_SNAPSHOT_VERSION, resourceIdentity: boundedText(input.resourceIdentity || 'SFF archive', 'resourceIdentity'), archiveByteHash: sha(bytes), archiveByteLength: bytes.length, sffVersion: friendlyVersion(archive.header?.version), parser: { id: options.parserId || 'ikemaker-sff-reader', version: Number(options.parserVersion) || 1 }, entries };
  snapshot.snapshotHash = hashCanonical(snapshot); return freeze(snapshot);
}

function assertSnapshot(snapshot) { const copy = { ...snapshot }; delete copy.snapshotHash; if (!snapshot || snapshot.schema !== 'ikemaker.sff-extraction-snapshot' || snapshot.version !== 1 || hashCanonical(copy) !== snapshot.snapshotHash) throw new Error('SFF extraction snapshot is missing or drifted.'); return snapshot; }
function assertBound(scope, snapshot) { if (requiredHash(scope.archiveByteHash, 'scope archiveByteHash') !== snapshot.archiveByteHash || requiredHash(scope.snapshotHash, 'scope snapshotHash') !== snapshot.snapshotHash) throw new Error('Extraction scope is stale for the reviewed archive snapshot.'); }
function indexes(value, label) { if (!Array.isArray(value)) throw new Error(`${label} must be an array of physical indices.`); return [...new Set(value.map((item) => integer(item, label)))]; }

function createNamedWorkSet(input = {}, snapshot) {
  assertSnapshot(snapshot); const name = boundedText(input.name, 'work-set name', 80), id = boundedText(input.id, 'work-set id', 96);
  const selected = indexes(input.physicalIndices, 'work-set physical index'); if (!selected.length) throw new Error('Named work set cannot be empty.');
  const rows = selected.map((physicalIndex) => { const entry = snapshot.entries[physicalIndex]; if (!entry) throw new Error(`Named work set references missing physical index ${physicalIndex}.`); return { entryId: entry.entryId, physicalIndex, group: entry.group, number: entry.number }; });
  const workSet = { schema: 'ikemaker.sff-extraction-work-set', version: 1, id, name, archiveByteHash: snapshot.archiveByteHash, snapshotHash: snapshot.snapshotHash, rows };
  workSet.workSetHash = hashCanonical(workSet); return freeze(workSet);
}
function validateWorkSet(workSet, snapshot) {
  if (workSet?.schema !== 'ikemaker.sff-extraction-work-set' || workSet.version !== 1) throw new Error('Named work set v1 is required; identity-only legacy work sets need an explicit adapter.');
  const sealed = { ...workSet }; delete sealed.workSetHash;
  if (!SHA256.test(String(workSet.workSetHash || '')) || hashCanonical(sealed) !== String(workSet.workSetHash).toLowerCase()) throw new Error('Named work set seal is missing or drifted.');
  assertBound(workSet, snapshot); const seen = new Set();
  for (const row of workSet.rows || []) { const entry = snapshot.entries[row.physicalIndex]; if (!entry || entry.entryId !== row.entryId || entry.group !== row.group || entry.number !== row.number || seen.has(row.physicalIndex)) throw new Error('Named work set contains stale, duplicate, or mismatched physical rows.'); seen.add(row.physicalIndex); }
  if (!seen.size) throw new Error('Named work set cannot be empty.'); return workSet;
}

function resolveExtractionScope(snapshot, scope = {}) {
  assertSnapshot(snapshot); const mode = String(scope.mode || ''); if (!MODES.includes(mode)) throw new Error(`Unsupported extraction scope ${mode || '(missing)'}.`);
  let selected;
  if (mode === 'all') selected = snapshot.entries.map((entry) => entry.physicalIndex);
  else if (mode === 'group') { const group = integer(scope.group, 'scope group'); selected = snapshot.entries.filter((entry) => entry.group === group).map((entry) => entry.physicalIndex); }
  else if (mode === 'range') { assertBound(scope, snapshot); const start = integer(scope.start, 'range start'), end = integer(scope.end, 'range end'); if (end < start) throw new Error('Extraction range end precedes start.'); selected = Array.from({ length: end - start + 1 }, (_, offset) => start + offset); }
  else if (mode === 'named-work-set') { const workSet = validateWorkSet(scope.workSet, snapshot); selected = workSet.rows.map((row) => row.physicalIndex); }
  else { assertBound(scope, snapshot); selected = indexes(mode === 'current' ? [scope.physicalIndex] : scope.physicalIndices, `${mode} physical index`); }
  selected = [...new Set(selected)].sort((a, b) => a - b); if (!selected.length) throw new Error(`Extraction scope ${mode} is empty.`);
  const physicalEntries = selected.map((index) => { const entry = snapshot.entries[index]; if (!entry) throw new Error(`Extraction scope references missing physical index ${index}.`); return entry; });
  const result = { schema: 'ikemaker.sff-extraction-selection', version: 1, archiveByteHash: snapshot.archiveByteHash, snapshotHash: snapshot.snapshotHash, mode, physicalEntries };
  result.selectionHash = hashCanonical(result); return freeze(result);
}

module.exports = { EXTRACTION_SNAPSHOT_VERSION, MODES, createExtractionSnapshot, assertSnapshot, createNamedWorkSet, validateWorkSet, resolveExtractionScope };
