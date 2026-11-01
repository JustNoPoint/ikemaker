'use strict';

const crypto = require('crypto');
const { archiveFingerprint } = require('./snd_transfer_model');
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex').toUpperCase(); }
function freeze(value, seen = new Set()) { if (!value || typeof value !== 'object' || seen.has(value)) return value; seen.add(value); for (const item of Object.values(value)) freeze(item, seen); return Object.freeze(value); }
function plain(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError(`${label} must be a plain object.`); return value; }
function integer(value, label) { if (!Number.isSafeInteger(value) || value < 0 || value > 2147483647) throw new TypeError(`${label} must be a whole number from 0 through 2147483647.`); return value; }
function key(group, index) { return `${group},${index}`; }
function nextFree(group, occupied, start) { let index = Math.max(0, Number.isSafeInteger(start) ? start : 0); while (occupied.has(key(group, index))) index += 1; return index; }
function planSndTransferResolution({ analysis, destinationArchive, decisions }) {
  if (analysis?.schema !== 'ikemaker.snd-transfer-analysis' || analysis?.version !== 1) throw new TypeError('A current SND Transfer analysis is required.');
  if (archiveFingerprint(destinationArchive) !== analysis.destinationFingerprint) throw new Error('The Destination SND changed after review.');
  if (!Array.isArray(decisions) || decisions.length > analysis.items.length) throw new TypeError('SND Transfer decisions must be a bounded array.');
  const byId = new Map(); for (const [position, decision] of decisions.entries()) { plain(decision, `SND Transfer decision ${position + 1}`); for (const name of Object.keys(decision)) if (!['id', 'action', 'group', 'index', 'startIndex', 'destinationPhysicalIndex'].includes(name)) throw new TypeError(`SND Transfer decision contains unsupported field ${name}.`); if (typeof decision.id !== 'string' || byId.has(decision.id)) throw new Error('SND Transfer decisions require unique item identities.'); byId.set(decision.id, decision); }
  const occupied = new Set(destinationArchive.entries.map(entry => key(entry.group, entry.index))), replacements = new Set(), reserved = new Set(occupied), items = [], unresolved = [];
  for (const source of analysis.items) {
    const decision = byId.get(source.id); if (!decision) { unresolved.push({ id: source.id, gate: 'identity', choices: source.destinationConflict.choices }); continue; }
    const action = String(decision.action || ''); if (!source.destinationConflict.choices.includes(action)) throw new Error(`${source.id} uses an unavailable conflict action ${action || '(blank)'}.`);
    if (action === 'skip') { items.push({ id: source.id, sourcePhysicalIndex: source.physicalIndex, action: 'skip' }); continue; }
    let group = source.group, index = source.index, destinationPhysicalIndex = null;
    if (action === 'add-next-free') { group = Number.isSafeInteger(decision.group) ? integer(decision.group, 'Destination sound group') : group; index = nextFree(group, reserved, decision.startIndex); }
    else if (action === 'manual-identity') { group = integer(decision.group, 'Destination sound group'); index = integer(decision.index, 'Destination sound index'); if (reserved.has(key(group, index))) throw new Error(`${source.id} manual identity ${key(group, index)} is occupied or already reserved.`); }
    else if (action === 'replace-existing') { const candidates = source.destinationConflict.physicalIndices; destinationPhysicalIndex = decision.destinationPhysicalIndex ?? candidates[0]; if (candidates.length !== 1 || destinationPhysicalIndex !== candidates[0] || replacements.has(destinationPhysicalIndex)) throw new Error(`${source.id} does not identify one unused exact Destination occurrence to replace.`); replacements.add(destinationPhysicalIndex); }
    else if (action === 'preserve-identity' && reserved.has(key(group, index))) throw new Error(`${source.id} cannot preserve an occupied sound identity.`);
    reserved.add(key(group, index)); items.push({ id: source.id, sourcePhysicalIndex: source.physicalIndex, action: action === 'replace-existing' ? 'replace' : 'add', destinationGroup: group, destinationIndex: index, destinationPhysicalIndex, contentFingerprint: source.contentFingerprint, metadataFingerprint: source.metadataFingerprint });
  }
  for (const id of byId.keys()) if (!analysis.items.some(item => item.id === id)) throw new Error(`SND Transfer decisions contain stale item ${id}.`);
  const basis = { analysisIdentity: analysis.analysisIdentity, items, unresolved };
  return freeze({ schema: 'ikemaker.snd-transfer-resolution-plan', version: 1, analysisIdentity: analysis.analysisIdentity, planIdentity: sha(Buffer.from(JSON.stringify(basis))), status: unresolved.length ? 'blocked' : 'ready', items, unresolved, effects: { filesystem: false, persistence: false, sourceMutation: false, destinationMutation: false, autosave: false } });
}
module.exports = { planSndTransferResolution };
