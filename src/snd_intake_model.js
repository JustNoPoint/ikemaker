'use strict';

const crypto = require('crypto');
const { SURFACES } = require('./desktop_drop_intake_contract');

const MAX_ID = 2147483647;
const ACTIONS = Object.freeze(['replace', 'skip', 'next-free', 'manual']);
const stable = value => Array.isArray(value) ? `[${value.map(stable).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}` : JSON.stringify(value);
const hash = value => crypto.createHash('sha256').update(stable(value)).digest('hex');
function deepFreeze(value, seen = new Set()) { if (!value || typeof value !== 'object' || seen.has(value)) return value; seen.add(value); Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child, seen); return value; }
function id(value, label) { const number = Number(value); if (!Number.isSafeInteger(number) || number < 0 || number > MAX_ID) throw new Error(`${label} must be an integer from 0 through ${MAX_ID}.`); return number; }
function cleanManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.entries) || typeof manifest.output !== 'string' || !manifest.output.trim()) throw new Error('A valid SndMaker manifest is required.');
  const seen = new Set(), entries = manifest.entries.map((entry, ordinal) => { const group = id(entry.group, `Manifest row ${ordinal + 1} group`), index = id(entry.index, `Manifest row ${ordinal + 1} index`), identity = `${group},${index}`; if (seen.has(identity)) throw new Error(`The SndMaker manifest contains duplicate identity ${identity}.`); seen.add(identity); if (typeof entry.source !== 'string' || !entry.source.trim()) throw new Error(`Manifest row ${ordinal + 1} has no WAV source.`); return { source: entry.source, group, index }; });
  return { output: manifest.output, entries };
}
function manifestFingerprint(manifest) { return hash(cleanManifest(manifest)); }
function identity(group, index) { return `${group},${index}`; }
function nextFree(group, occupied, start = 0) { for (let index = id(start, 'Starting index'); index <= MAX_ID; index += 1) if (!occupied.has(identity(group, index))) return index; throw new Error(`Group ${group} has no available sound index.`); }
function validateCandidate(candidate) {
  if (!candidate || candidate.schema !== 'ikemaker.desktop-drop-candidate' || candidate.surface !== SURFACES.SND || !Array.isArray(candidate.records) || !candidate.records.length) throw new Error('A non-empty admitted SND desktop-drop candidate is required.');
  if (!/^[a-f0-9]{64}$/.test(String(candidate.candidateId || '')) || candidate.records.some(record => record.status !== 'admitted' || record.format !== 'wav' || record.kind !== 'file' || !/^[a-f0-9]{64}$/.test(String(record.identity || '')))) throw new Error('The SND desktop-drop candidate is malformed or contains a non-WAV source.');
  return candidate;
}
function destination(value = {}) {
  const kind = ['append', 'group', 'replace-or-insert'].includes(value.kind) ? value.kind : 'append';
  const group = id(value.group ?? 0, 'Destination group');
  const index = kind === 'replace-or-insert' ? id(value.index, 'Destination index') : id(value.startIndex ?? 0, 'Starting index');
  return { kind, group, index };
}
function createDraft({ manifest, manifestPath = '', candidate, targetFingerprint, destinationHint } = {}) {
  const clean = cleanManifest(manifest), fingerprint = manifestFingerprint(clean), admitted = validateCandidate(candidate), hint = destination(destinationHint);
  if (targetFingerprint && String(targetFingerprint) !== fingerprint) throw new Error('The SndMaker manifest changed before dropped sounds could be staged.');
  const occupied = new Set(clean.entries.map(entry => identity(entry.group, entry.index))), reserved = new Set(occupied), rows = [];
  let cursor = hint.index;
  for (const record of admitted.records) {
    let index = cursor, state = 'ready', action = 'add';
    if (hint.kind === 'replace-or-insert' && rows.length === 0 && occupied.has(identity(hint.group, hint.index))) { state = 'collision'; action = 'review'; }
    else { index = nextFree(hint.group, reserved, cursor); reserved.add(identity(hint.group, index)); cursor = index + 1; }
    const rowId = hash({ candidateId: admitted.candidateId, sourceIdentity: record.identity, sourceOrdinal: record.sourceOrdinal });
    rows.push({ rowId, sourceIdentity: record.identity, sourceOrdinal: record.sourceOrdinal, sourcePath: record.canonicalPath, sourceHash: record.byteHash, sourceBytes: record.byteLength, group: hint.group, index, state, action });
  }
  const body = { schema: 'ikemaker.snd-intake-draft', version: 1, manifestPath: String(manifestPath || ''), manifestFingerprint: fingerprint, candidateId: admitted.candidateId, destination: hint, rows };
  return deepFreeze({ ...body, draftId: hash(body) });
}
function resolveRow(draft, rowId, resolution = {}, manifest) {
  if (!draft || draft.schema !== 'ikemaker.snd-intake-draft' || !Array.isArray(draft.rows)) throw new Error('The SND intake draft is invalid.');
  if (!ACTIONS.includes(resolution.action)) throw new Error('Choose Replace, Skip, Next Free, or Manual for this sound.');
  const clean = cleanManifest(manifest), fingerprint = manifestFingerprint(clean); if (fingerprint !== draft.manifestFingerprint) throw new Error('The SndMaker manifest changed after intake review began.');
  const at = draft.rows.findIndex(row => row.rowId === rowId); if (at < 0) throw new Error('The selected dropped sound is missing or stale.');
  const occupied = new Set(clean.entries.map(entry => identity(entry.group, entry.index)));
  for (const [index, row] of draft.rows.entries()) if (index !== at && row.state === 'ready' && row.action !== 'skip') occupied.add(identity(row.group, row.index));
  const row = { ...draft.rows[at] };
  if (resolution.action === 'skip') { row.state = 'skipped'; row.action = 'skip'; }
  else if (resolution.action === 'replace') { if (!occupied.has(identity(row.group, row.index))) throw new Error('Replace requires an existing manifest identity.'); row.state = 'ready'; row.action = 'replace'; }
  else if (resolution.action === 'next-free') { row.group = id(resolution.group ?? row.group, 'Destination group'); row.index = nextFree(row.group, occupied, resolution.startIndex ?? row.index); row.state = 'ready'; row.action = 'add'; }
  else { row.group = id(resolution.group, 'Destination group'); row.index = id(resolution.index, 'Destination index'); if (occupied.has(identity(row.group, row.index))) throw new Error(`Manual destination ${row.group},${row.index} is already occupied or proposed.`); row.state = 'ready'; row.action = 'add'; }
  const rows = draft.rows.map((item, index) => index === at ? row : { ...item }), body = { schema: draft.schema, version: 1, manifestPath: draft.manifestPath, manifestFingerprint: draft.manifestFingerprint, candidateId: draft.candidateId, destination: { ...draft.destination }, rows };
  return deepFreeze({ ...body, draftId: hash(body) });
}
function planDraft(draft, manifest, currentCandidateId = draft?.candidateId) {
  if (!draft || draft.schema !== 'ikemaker.snd-intake-draft' || !Array.isArray(draft.rows) || !draft.rows.length) throw new Error('The SND intake draft is empty or invalid.');
  const clean = cleanManifest(manifest), fingerprint = manifestFingerprint(clean); if (fingerprint !== draft.manifestFingerprint) throw new Error('The SndMaker manifest changed after intake review began.');
  if (currentCandidateId !== draft.candidateId) throw new Error('The desktop-drop candidate changed after intake review began.');
  const unresolved = draft.rows.filter(row => row.state === 'collision' || row.action === 'review'); if (unresolved.length) throw new Error(`${unresolved.length} dropped sound collision${unresolved.length === 1 ? '' : 's'} still require review.`);
  const occupied = new Map(clean.entries.map((entry, index) => [identity(entry.group, entry.index), index])), proposed = new Set(), operations = [];
  for (const row of draft.rows) {
    if (row.action === 'skip') { operations.push({ rowId: row.rowId, action: 'skip', sourceIdentity: row.sourceIdentity }); continue; }
    const key = identity(row.group, row.index); if (proposed.has(key)) throw new Error(`Dropped sounds contain duplicate proposed identity ${key}.`); proposed.add(key);
    if (row.action === 'replace' && !occupied.has(key)) throw new Error(`Replacement target ${key} is no longer present.`);
    if (row.action === 'add' && occupied.has(key)) throw new Error(`Added sound destination ${key} became occupied.`);
    operations.push({ rowId: row.rowId, action: row.action, sourceIdentity: row.sourceIdentity, sourcePath: row.sourcePath, sourceHash: row.sourceHash, sourceBytes: row.sourceBytes, group: row.group, index: row.index, replacedManifestOrdinal: row.action === 'replace' ? occupied.get(key) : null });
  }
  const body = { schema: 'ikemaker.snd-intake-plan', version: 1, manifestPath: draft.manifestPath, manifestFingerprint: fingerprint, candidateId: draft.candidateId, draftId: draft.draftId, operations };
  return deepFreeze({ ...body, planId: hash(body) });
}
function materializeManifest(plan, manifest, sourceFor) {
  if (!plan || plan.schema !== 'ikemaker.snd-intake-plan' || !Array.isArray(plan.operations)) throw new Error('The SND intake plan is invalid.');
  if (manifestFingerprint(manifest) !== plan.manifestFingerprint) throw new Error('The SndMaker manifest changed before the intake plan could be materialized.');
  if (typeof sourceFor !== 'function') throw new Error('A reviewed project-local WAV source resolver is required.');
  const next = cleanManifest(manifest);
  for (const operation of plan.operations) {
    if (operation.action === 'skip') continue;
    const source = sourceFor(operation); if (typeof source !== 'string' || !source.trim()) throw new Error(`No retained WAV source was supplied for ${operation.group},${operation.index}.`);
    const entry = { source, group: operation.group, index: operation.index };
    if (operation.action === 'replace') next.entries[operation.replacedManifestOrdinal] = entry; else next.entries.push(entry);
  }
  return next;
}

module.exports = { MAX_ID, ACTIONS, manifestFingerprint, createDraft, resolveRow, planDraft, materializeManifest };
