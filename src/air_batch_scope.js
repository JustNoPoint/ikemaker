'use strict';

const crypto = require('crypto');

const MODES = Object.freeze(['current', 'marked', 'visible', 'group', 'range', 'work-set', 'all']);
function sourceFingerprint(text) { return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex').toUpperCase(); }
function integer(value, label) { const number = Number(value); if (!Number.isSafeInteger(number)) throw new Error(`${label} must be a whole number.`); return number; }
function uniqueNumbers(values) { return [...new Set((values || []).map(value => integer(value, 'Action number')))]; }

function snapshot(text, actions = [], resource = '') {
  const entries = (actions || []).map((action, sourceOrder) => Object.freeze({ id: String(action.number), number: Number(action.number), sourceOrder: Number.isInteger(action.sourceOrder) ? action.sourceOrder : sourceOrder, group: String(action.category || 'Uncategorized') }));
  const counts = new Map(); for (const entry of entries) counts.set(entry.id, (counts.get(entry.id) || 0) + 1);
  return Object.freeze({ resource: String(resource || ''), fingerprint: sourceFingerprint(text), entries: Object.freeze(entries), ambiguousIds: Object.freeze([...counts].filter(([, count]) => count > 1).map(([id]) => id)) });
}

function numbersForRequest(scopeSnapshot, request = {}, workSets = []) {
  if (!scopeSnapshot?.fingerprint || !Array.isArray(scopeSnapshot.entries)) throw new Error('The AIR scope snapshot is invalid.');
  if (request.fingerprint && request.fingerprint !== scopeSnapshot.fingerprint) throw new Error('The AIR source changed after this scope was chosen. Reopen the scope and review it again.');
  const mode = String(request.mode || ''); if (!MODES.includes(mode)) throw new Error(`Unsupported AIR batch scope: ${mode || 'none'}.`);
  let numbers;
  if (mode === 'current') numbers = [integer(request.currentAction, 'Current action')];
  else if (mode === 'marked') numbers = request.markedActions || [];
  else if (mode === 'visible') numbers = request.visibleActions || [];
  else if (mode === 'group') numbers = scopeSnapshot.entries.filter(entry => entry.group === String(request.group)).map(entry => entry.number);
  else if (mode === 'range') { const first = integer(request.first, 'First action number'), last = integer(request.last, 'Last action number'); if (last < first) throw new Error('The action-number range must be ordered first-to-last.'); numbers = scopeSnapshot.entries.filter(entry => entry.number >= first && entry.number <= last).map(entry => entry.number); }
  else if (mode === 'work-set') {
    const item = workSets.find(value => value.id === request.workSetId); if (!item) throw new Error('The selected AIR work set no longer exists.');
    if (item.fingerprint !== scopeSnapshot.fingerprint) throw new Error(`Work set “${item.name}” belongs to an older revision of this AIR. Recreate it before applying changes.`);
    numbers = (item.entryIds || []).map(Number);
  } else numbers = scopeSnapshot.entries.map(entry => entry.number);
  const available = new Set(scopeSnapshot.entries.map(entry => entry.number));
  numbers = uniqueNumbers(numbers).filter(number => available.has(number)).sort((a, b) => scopeSnapshot.entries.findIndex(entry => entry.number === a) - scopeSnapshot.entries.findIndex(entry => entry.number === b));
  if (!numbers.length) throw new Error('The chosen AIR batch scope contains no animations.');
  const chosenIds = numbers.map(String), ambiguous = chosenIds.filter(id => scopeSnapshot.ambiguousIds.includes(id));
  if (ambiguous.length) throw new Error(`The chosen scope contains duplicate AIR action identities (${[...new Set(ambiguous)].join(', ')}). Mutation is blocked until those action numbers are unique.`);
  if (mode === 'work-set') { const item = workSets.find(value => value.id === request.workSetId), ids = new Set(scopeSnapshot.entries.map(entry => entry.id)), missing = (item.entryIds || []).filter(id => !ids.has(String(id))); if (missing.length) throw new Error(`Work set “${item.name}” contains animations that are no longer present: ${missing.join(', ')}.`); }
  return numbers;
}

function resolveScope(scopeSnapshot, request = {}, workSets = []) {
  const numbers = numbersForRequest(scopeSnapshot, request, workSets), identities = numbers.map(String);
  const body = { schemaVersion: 1, assetKind: 'air-action', resource: scopeSnapshot.resource, sourceFingerprint: scopeSnapshot.fingerprint, mode: request.mode, identities, resolvedCount: identities.length };
  return Object.freeze({ ...body, resolutionHash: crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex').toUpperCase(), numbers: Object.freeze(numbers) });
}

function createWorkSet(scopeSnapshot, name, numbers) {
  const cleanName = String(name || '').trim(); if (!cleanName || cleanName.length > 80) throw new Error('Work set name must contain 1–80 characters.');
  const selected = new Set(uniqueNumbers(numbers)), entries = scopeSnapshot.entries.filter(entry => selected.has(entry.number));
  const ambiguous = entries.filter(entry => scopeSnapshot.ambiguousIds.includes(entry.id)).map(entry => entry.id); if (ambiguous.length) throw new Error(`A work set cannot save ambiguous duplicate action identities: ${[...new Set(ambiguous)].join(', ')}.`);
  const entryIds = entries.map(entry => entry.id); if (!entryIds.length) throw new Error('Select at least one animation before saving a work set.');
  const id = crypto.createHash('sha256').update(scopeSnapshot.fingerprint).update('\0').update(cleanName.toLowerCase()).digest('hex').slice(0, 20);
  return Object.freeze({ version: 1, id, name: cleanName, fingerprint: scopeSnapshot.fingerprint, entryIds: Object.freeze(entryIds) });
}

module.exports = { MODES, sourceFingerprint, snapshot, numbersForRequest, resolveScope, createWorkSet };
