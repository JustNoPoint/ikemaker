'use strict';

const crypto = require('crypto');
const path = require('path');
const { pathToFileURL } = require('url');

const LANGUAGES = new Set(['zss', 'ikemen-cns']);
const ACCESS = new Set(['read', 'write', 'read-write']);
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const canonicalPath = (value) => path.resolve(String(value || ''));
const canonicalUri = (value) => pathToFileURL(canonicalPath(value)).toString();
const plain = (value) => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
};

function scopeSha(registry = {}) {
  const owner = canonicalUri(registry.def || registry.root || registry.currentFile || process.cwd());
  const dependencies = [...new Set((registry.dependencies || registry.indexedFiles || []).map(canonicalUri))].sort();
  return sha(JSON.stringify(['map-scope-v1', owner, String(registry.projectId || ''), dependencies]));
}

function entryReference(entry, registry) {
  return freeze({ type: 'map-entry-v1', scopeSha: scopeSha(registry), normalizedName: String(entry?.name || '').toLowerCase(), displayName: String(entry?.name || '') });
}

function occurrenceReferences(registry = {}) {
  const scope = scopeSha(registry), projected = [];
  for (const entry of registry.entries || []) {
    for (const item of entry.occurrences || []) {
      const fileUri = canonicalUri(item.filename), language = String(item.language || ''), access = String(item.access || '');
      const rawSignatureSha = sha(JSON.stringify(['map-occurrence-v1', scope, String(item.name || entry.name || '').toLowerCase(), String(item.name || entry.name || ''), fileUri, language, access, String(item.source || '')]));
      projected.push({ entry, item, raw: { type: 'map-occurrence-v1', scopeSha: scope, normalizedName: String(item.name || entry.name || '').toLowerCase(), fileUri, language, access, rawSignatureSha } });
    }
  }
  const counts = new Map();
  for (const row of projected) counts.set(row.raw.rawSignatureSha, (counts.get(row.raw.rawSignatureSha) || 0) + 1);
  const seen = new Map();
  return projected.map((row) => {
    const occurrence = seen.get(row.raw.rawSignatureSha) || 0;
    seen.set(row.raw.rawSignatureSha, occurrence + 1);
    return { ...row, reference: freeze({ ...row.raw, occurrence, matchCount: counts.get(row.raw.rawSignatureSha) }) };
  });
}

function validEntryReference(value) {
  return exact(value, ['type', 'scopeSha', 'normalizedName', 'displayName']) && value.type === 'map-entry-v1' && /^[0-9a-f]{64}$/.test(value.scopeSha) && typeof value.normalizedName === 'string' && Buffer.byteLength(value.normalizedName, 'utf8') > 0 && Buffer.byteLength(value.normalizedName, 'utf8') <= 512 && value.normalizedName === value.normalizedName.toLowerCase() && typeof value.displayName === 'string' && Buffer.byteLength(value.displayName, 'utf8') > 0 && Buffer.byteLength(value.displayName, 'utf8') <= 512 && value.displayName.toLowerCase() === value.normalizedName;
}

function validOccurrenceReference(value) {
  return exact(value, ['type', 'scopeSha', 'normalizedName', 'fileUri', 'language', 'access', 'rawSignatureSha', 'occurrence', 'matchCount']) && value.type === 'map-occurrence-v1' && /^[0-9a-f]{64}$/.test(value.scopeSha) && typeof value.normalizedName === 'string' && value.normalizedName === value.normalizedName.toLowerCase() && Buffer.byteLength(value.normalizedName, 'utf8') > 0 && Buffer.byteLength(value.normalizedName, 'utf8') <= 512 && typeof value.fileUri === 'string' && value.fileUri.startsWith('file:') && Buffer.byteLength(value.fileUri, 'utf8') <= 4096 && LANGUAGES.has(value.language) && ACCESS.has(value.access) && /^[0-9a-f]{64}$/.test(value.rawSignatureSha) && Number.isInteger(value.occurrence) && value.occurrence >= 0 && value.occurrence <= 9999 && Number.isInteger(value.matchCount) && value.matchCount >= 1 && value.matchCount <= 10000 && value.occurrence < value.matchCount;
}

function resolveOccurrence(registry, reference) {
  if (!validOccurrenceReference(reference) || reference.scopeSha !== scopeSha(registry)) return null;
  const matches = occurrenceReferences(registry).filter((row) => row.reference.rawSignatureSha === reference.rawSignatureSha);
  if (matches.length !== reference.matchCount) return null;
  const selected = matches[reference.occurrence];
  return selected && JSON.stringify(selected.reference) === JSON.stringify(reference) ? selected : null;
}

module.exports = { sha, canonicalPath, canonicalUri, plain, exact, freeze, scopeSha, entryReference, occurrenceReferences, validEntryReference, validOccurrenceReference, resolveOccurrence };
