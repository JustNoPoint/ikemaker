'use strict';

const crypto = require('crypto');

const MODES = Object.freeze(['current', 'marked', 'visible', 'group', 'range', 'work-set', 'all']);

function archiveFingerprint(archive) {
  if (Buffer.isBuffer(archive?.buffer)) return crypto.createHash('sha256').update(archive.buffer).digest('hex').toUpperCase();
  const facts = (archive?.sprites || []).map((sprite, index) => [index, sprite.group, sprite.number, sprite.width, sprite.height, sprite.axisX, sprite.axisY, sprite.paletteIndex, sprite.link]);
  return crypto.createHash('sha256').update(JSON.stringify(facts)).digest('hex').toUpperCase();
}

function stableEntries(archive) {
  return (archive?.sprites || []).map((sprite, archiveIndex) => {
    const identity = `${sprite.group},${sprite.number}`;
    return Object.freeze({ id: identity, identity, archiveIndex, group: sprite.group, number: sprite.number });
  });
}

function snapshot(archive, resource = archive?.filename || '') {
  const entries = stableEntries(archive), counts = new Map();
  for (const entry of entries) counts.set(entry.id, (counts.get(entry.id) || 0) + 1);
  const ambiguousIds = [...counts].filter(([, count]) => count > 1).map(([id]) => id);
  return Object.freeze({ resource: String(resource || ''), fingerprint: archiveFingerprint(archive), entries: Object.freeze(entries), ambiguousIds: Object.freeze(ambiguousIds) });
}

function integer(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(`${label} must be a whole number.`);
  return number;
}

function uniqueSorted(values) { return [...new Set(values)].sort((a, b) => a - b); }

function indicesForRequest(scopeSnapshot, request = {}, workSets = [], options = {}) {
  if (!scopeSnapshot?.fingerprint || !Array.isArray(scopeSnapshot.entries)) throw new Error('The SFF scope snapshot is invalid.');
  if (request.fingerprint && request.fingerprint !== scopeSnapshot.fingerprint) throw new Error('The SFF changed after this scope was chosen. Reopen the scope and review it again.');
  const mode = String(request.mode || '');
  if (!MODES.includes(mode)) throw new Error(`Unsupported SFF batch scope: ${mode || 'none'}.`);
  const available = new Set(scopeSnapshot.entries.map(entry => entry.archiveIndex));
  let indices;
  if (mode === 'current') indices = [integer(request.currentIndex, 'Current sprite index')];
  else if (mode === 'marked') indices = request.markedIndices || [];
  else if (mode === 'visible') indices = request.visibleIndices || [];
  else if (mode === 'group') {
    const group = integer(request.group, 'Group');
    indices = scopeSnapshot.entries.filter(entry => entry.group === group).map(entry => entry.archiveIndex);
  } else if (mode === 'range') {
    const first = integer(request.first, 'First archive position'), last = integer(request.last, 'Last archive position');
    if (first < 0 || last < first || last >= scopeSnapshot.entries.length) throw new Error(`Archive range must be within 0-${Math.max(0, scopeSnapshot.entries.length - 1)} and ordered first-to-last.`);
    indices = scopeSnapshot.entries.slice(first, last + 1).map(entry => entry.archiveIndex);
  } else if (mode === 'work-set') {
    const item = workSets.find(value => value.id === request.workSetId);
    if (!item) throw new Error('The selected SFF work set no longer exists.');
    if (item.fingerprint !== scopeSnapshot.fingerprint) throw new Error(`Work set “${item.name}” belongs to an older version of this SFF. Recreate it before applying changes.`);
    if (item.version >= 2 && Array.isArray(item.physicalEntries)) {
      indices = item.physicalEntries.map(value => {
        const index = integer(value.archiveIndex, 'Saved physical sprite index'), entry = scopeSnapshot.entries[index];
        return entry && entry.id === value.identity ? index : null;
      }).filter(Number.isInteger);
      if (indices.length !== item.physicalEntries.length) throw new Error(`Work set “${item.name}” contains physical sprite occurrences that are no longer present.`);
    } else {
      const ambiguousSaved = (item.entryIds || []).filter(id => scopeSnapshot.ambiguousIds.includes(id));
      if (ambiguousSaved.length) throw new Error(`Work set “${item.name}” cannot resolve repeated identities from its older format. Recreate it.`);
      const byId = new Map(scopeSnapshot.entries.map(entry => [entry.id, entry.archiveIndex]));
      indices = (item.entryIds || []).map(id => byId.get(id)).filter(Number.isInteger);
      if (indices.length !== (item.entryIds || []).length) throw new Error(`Work set “${item.name}” contains sprites that are no longer present.`);
    }
  } else indices = scopeSnapshot.entries.map(entry => entry.archiveIndex);
  const requestedIndices = (indices || []).map(value => integer(value, 'Sprite index'));
  const unavailableIndices = uniqueSorted(requestedIndices.filter(value => !available.has(value)));
  if (unavailableIndices.length) throw new Error(`The chosen SFF batch scope references missing physical sprite index${unavailableIndices.length === 1 ? '' : 'es'} ${unavailableIndices.slice(0, 10).join(', ')}${unavailableIndices.length > 10 ? ', …' : ''}. Reopen the scope; no partial subset was accepted.`);
  indices = uniqueSorted(requestedIndices);
  if (!indices.length) throw new Error('The chosen SFF batch scope contains no sprites.');
  const chosen = scopeSnapshot.entries.filter(entry => indices.includes(entry.archiveIndex));
  const ambiguous = [...new Set(chosen.map(entry => entry.id).filter(id => scopeSnapshot.ambiguousIds.includes(id)))];
  if (ambiguous.length && !options.allowDuplicateIdentities) throw new Error(`The chosen scope contains duplicate SFF identities (${ambiguous.slice(0, 5).join(', ')}${ambiguous.length > 5 ? ', …' : ''}). Mutation is blocked until those identities are made unique.`);
  return indices;
}

function resolveScope(scopeSnapshot, request = {}, workSets = [], options = {}) {
  const indices = indicesForRequest(scopeSnapshot, request, workSets, options);
  const identities = indices.map(index => scopeSnapshot.entries.find(entry => entry.archiveIndex === index).id);
  const body = { schemaVersion: options.allowDuplicateIdentities ? 2 : 1, assetKind: 'sff-sprite', resource: scopeSnapshot.resource, sourceFingerprint: scopeSnapshot.fingerprint, mode: request.mode, identities, ...(options.allowDuplicateIdentities ? { physicalEntries: indices.map((archiveIndex, position) => ({ archiveIndex, identity: identities[position] })) } : {}), resolvedCount: identities.length };
  return Object.freeze({ ...body, resolutionHash: crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex').toUpperCase(), indices: Object.freeze(indices) });
}

function createWorkSet(scopeSnapshot, name, indices, options = {}) {
  const cleanName = String(name || '').trim();
  if (!cleanName || cleanName.length > 80) throw new Error('Work set name must contain 1–80 characters.');
  const requested = uniqueSorted((indices || []).map(value => integer(value, 'Saved sprite index'))), available = new Set(scopeSnapshot.entries.map(entry => entry.archiveIndex));
  const missing = requested.filter(index => !available.has(index));
  if (missing.length) throw new Error(`The work set references missing physical sprite index${missing.length === 1 ? '' : 'es'} ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ', …' : ''}. Nothing was saved.`);
  const selected = new Set(requested);
  const entries = scopeSnapshot.entries.filter(entry => selected.has(entry.archiveIndex));
  const ambiguous = entries.filter(entry => scopeSnapshot.ambiguousIds.includes(entry.id)).map(entry => entry.id);
  if (ambiguous.length && !options.allowDuplicateIdentities) throw new Error(`A work set cannot save ambiguous duplicate identities: ${[...new Set(ambiguous)].join(', ')}.`);
  const physical = Boolean(options.allowDuplicateIdentities), entryIds = entries.map(entry => physical ? `${entry.id}@${entry.archiveIndex}` : entry.id);
  if (!entryIds.length) throw new Error('Select at least one sprite before saving a work set.');
  const id = crypto.createHash('sha256').update(scopeSnapshot.fingerprint).update('\0').update(cleanName.toLowerCase()).digest('hex').slice(0, 20);
  return Object.freeze({ version: physical ? 2 : 1, id, name: cleanName, fingerprint: scopeSnapshot.fingerprint, entryIds: Object.freeze(entryIds), ...(physical ? { physicalEntries: Object.freeze(entries.map(entry => Object.freeze({ archiveIndex: entry.archiveIndex, identity: entry.identity }))) } : {}) });
}

function sanitizeWorkSets(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set(), result = [];
  for (const value of values.slice(0, 100)) {
    const id = String(value?.id || ''), name = String(value?.name || '').trim(), fingerprint = String(value?.fingerprint || '');
    const rawEntryIds = Array.isArray(value?.entryIds) ? value.entryIds.map(String).filter(Boolean) : [], version = value?.version >= 2 ? 2 : 1;
    if (rawEntryIds.length > 100000 || new Set(rawEntryIds).size !== rawEntryIds.length) continue;
    const entryIds = rawEntryIds;
    if (!/^[a-f0-9]{20}$/i.test(id) || !name || name.length > 80 || !/^[A-F0-9]{64}$/.test(fingerprint) || !entryIds.length || seen.has(id)) continue;
    if (version === 2 && (!Array.isArray(value?.physicalEntries) || value.physicalEntries.length > 100000)) continue;
    const physicalEntries = version === 2 ? value.physicalEntries.map(item => ({ archiveIndex: Number(item?.archiveIndex), identity: String(item?.identity || '') })).filter(item => Number.isSafeInteger(item.archiveIndex) && item.archiveIndex >= 0 && item.identity) : [];
    if (version === 2 && (physicalEntries.length !== entryIds.length || new Set(physicalEntries.map(item => item.archiveIndex)).size !== physicalEntries.length || physicalEntries.some((item, index) => entryIds[index] !== `${item.identity}@${item.archiveIndex}`))) continue;
    seen.add(id); result.push({ version, id, name, fingerprint, entryIds, ...(version === 2 ? { physicalEntries } : {}) });
  }
  return result;
}

module.exports = { MODES, archiveFingerprint, snapshot, indicesForRequest, resolveScope, createWorkSet, sanitizeWorkSets };
