'use strict';

const crypto = require('crypto');

const MODES = Object.freeze(['current', 'marked', 'visible', 'group', 'range', 'work-set', 'all']);

function archiveFingerprint(archive) {
  if (Buffer.isBuffer(archive?.buffer)) return crypto.createHash('sha256').update(archive.buffer).digest('hex').toUpperCase();
  const facts = (archive?.entries || []).map((entry, archiveIndex) => [archiveIndex, entry.group, entry.index, entry.dataSize, entry.dataOffset]);
  return crypto.createHash('sha256').update(JSON.stringify(facts)).digest('hex').toUpperCase();
}

function stableEntries(archive) {
  return (archive?.entries || []).map((entry, archiveIndex) => {
    const physicalIndex = Number.isInteger(entry.archiveIndex) ? entry.archiveIndex : archiveIndex;
    const identity = `${entry.group},${entry.index}`;
    return Object.freeze({ id: identity, identity, archiveIndex: physicalIndex, group: entry.group, index: entry.index });
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

function indicesForRequest(scopeSnapshot, request = {}, workSets = []) {
  if (!scopeSnapshot?.fingerprint || !Array.isArray(scopeSnapshot.entries)) throw new Error('The SND scope snapshot is invalid.');
  if (request.fingerprint && request.fingerprint !== scopeSnapshot.fingerprint) throw new Error('The SND changed after this scope was chosen. Reopen the scope and review it again.');
  const mode = String(request.mode || '');
  if (!MODES.includes(mode)) throw new Error(`Unsupported SND batch scope: ${mode || 'none'}.`);
  const available = new Set(scopeSnapshot.entries.map(entry => entry.archiveIndex));
  let indices;
  if (mode === 'current') indices = [integer(request.currentIndex, 'Current sound index')];
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
    if (!item) throw new Error('The selected SND work set no longer exists.');
    if (item.fingerprint !== scopeSnapshot.fingerprint) throw new Error(`Work set “${item.name}” belongs to an older version of this SND. Recreate it before applying changes.`);
    const byId = new Map(scopeSnapshot.entries.map(entry => [entry.id, entry.archiveIndex]));
    indices = (item.entryIds || []).map(id => byId.get(id)).filter(Number.isInteger);
    if (indices.length !== (item.entryIds || []).length) throw new Error(`Work set “${item.name}” contains sounds that are no longer present.`);
  } else indices = scopeSnapshot.entries.map(entry => entry.archiveIndex);
  indices = uniqueSorted((indices || []).map(value => integer(value, 'Sound index')).filter(value => available.has(value)));
  if (!indices.length) throw new Error('The chosen SND batch scope contains no sounds.');
  const chosen = scopeSnapshot.entries.filter(entry => indices.includes(entry.archiveIndex));
  const ambiguous = [...new Set(chosen.map(entry => entry.id).filter(id => scopeSnapshot.ambiguousIds.includes(id)))];
  if (ambiguous.length) throw new Error(`The chosen scope contains duplicate SND identities (${ambiguous.slice(0, 5).join(', ')}${ambiguous.length > 5 ? ', …' : ''}). Mutation is blocked until those identities are made unique.`);
  return indices;
}

function resolveScope(scopeSnapshot, request = {}, workSets = []) {
  const indices = indicesForRequest(scopeSnapshot, request, workSets);
  const identities = indices.map(index => scopeSnapshot.entries.find(entry => entry.archiveIndex === index).id);
  const body = { schemaVersion: 1, assetKind: 'snd-sound', resource: scopeSnapshot.resource, sourceFingerprint: scopeSnapshot.fingerprint, mode: request.mode, identities, resolvedCount: identities.length };
  return Object.freeze({ ...body, resolutionHash: crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex').toUpperCase(), indices: Object.freeze(indices) });
}

function createWorkSet(scopeSnapshot, name, indices) {
  const cleanName = String(name || '').trim();
  if (!cleanName || cleanName.length > 80) throw new Error('Work set name must contain 1–80 characters.');
  const selected = new Set(uniqueSorted(indices || []));
  const entries = scopeSnapshot.entries.filter(entry => selected.has(entry.archiveIndex));
  const ambiguous = entries.filter(entry => scopeSnapshot.ambiguousIds.includes(entry.id)).map(entry => entry.id);
  if (ambiguous.length) throw new Error(`A work set cannot save ambiguous duplicate identities: ${[...new Set(ambiguous)].join(', ')}.`);
  const entryIds = entries.map(entry => entry.id);
  if (!entryIds.length) throw new Error('Select at least one sound before saving a work set.');
  const id = crypto.createHash('sha256').update(scopeSnapshot.fingerprint).update('\0').update(cleanName.toLowerCase()).digest('hex').slice(0, 20);
  return Object.freeze({ version: 1, id, name: cleanName, fingerprint: scopeSnapshot.fingerprint, entryIds: Object.freeze(entryIds) });
}

module.exports = { MODES, archiveFingerprint, snapshot, indicesForRequest, resolveScope, createWorkSet };
