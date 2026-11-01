'use strict';

const crypto = require('crypto');
const { types: utilTypes } = require('util');
const { createAirCollisionInspection, deepFreeze, MAX_SOURCE_BYTES } = require('./air_collision_inspection_model');

const MAX_SELECTED_FRAMES = 2048;
const MAX_BOX_CAP = 64;
const MAX_LOCKS = 8192;
const HASH = /^[A-F0-9]{64}$/;
const GROUPS = Object.freeze(['clsn1', 'clsn2']);
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);

function sha(value) { return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').toUpperCase(); }
function canonical(value) { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])); return value; }
function semanticHash(value) { return sha(JSON.stringify(canonical(value))); }
function plain(value, stack = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || utilTypes.isProxy(value) || stack.has(value)) return false;
  stack.add(value); const keys = Object.keys(value), own = Reflect.ownKeys(value), prototype = Object.getPrototypeOf(value);
  const descriptor = key => { const item = Object.getOwnPropertyDescriptor(value, key); return Boolean(item && Object.prototype.hasOwnProperty.call(item, 'value') && plain(item.value, stack)); };
  const valid = Array.isArray(value) ? own.length === keys.length + 1 && own.includes('length') && keys.length === value.length && keys.every((key, index) => Number(key) === index && descriptor(key)) : (prototype === Object.prototype || prototype === null) && own.length === keys.length && keys.every(key => !FORBIDDEN.has(key) && descriptor(key));
  stack.delete(value); return valid;
}
function integer(value, label, maximum = Number.MAX_SAFE_INTEGER) { if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw new Error(`AIR collision assistance: ${label} must be a non-negative safe integer no greater than ${maximum}.`); return value; }
function exactKeys(value, keys) { return value && Object.keys(value).sort().join(',') === keys.slice().sort().join(','); }
function normalizedGroups(input) {
  if (!exactKeys(input, GROUPS)) throw new Error('AIR collision assistance: groups must contain exactly independent clsn1 and clsn2 settings.');
  const output = {};
  for (const key of GROUPS) {
    const item = input[key]; if (!exactKeys(item, ['enabled', 'cap']) || typeof item.enabled !== 'boolean') throw new Error(`AIR collision assistance: ${key} settings are incomplete.`);
    output[key] = { enabled: item.enabled, cap: integer(item.cap, `${key} cap`, MAX_BOX_CAP) };
  }
  return output;
}
function normalizedLocks(input, selected) {
  if (!exactKeys(input, ['boxes', 'frames']) || !Array.isArray(input.frames) || !Array.isArray(input.boxes) || input.frames.length + input.boxes.length > MAX_LOCKS) throw new Error(`AIR collision assistance: locks must contain bounded frames and boxes (maximum ${MAX_LOCKS}).`);
  const frameSet = new Set(), boxMap = new Map();
  for (const value of input.frames) { const frame = integer(value, 'locked frame', MAX_SELECTED_FRAMES * 1024); if (!selected.has(frame)) throw new Error(`AIR collision assistance: locked frame ${frame} is outside the explicit target selection.`); frameSet.add(frame); }
  for (const item of input.boxes) {
    if (!exactKeys(item, ['elementIndex', 'groupKey', 'slot']) || !GROUPS.includes(item.groupKey)) throw new Error('AIR collision assistance: each box lock needs exact elementIndex, groupKey, and slot identity.');
    const elementIndex = integer(item.elementIndex, 'locked box element', MAX_SELECTED_FRAMES * 1024), slot = integer(item.slot, 'locked box slot', MAX_BOX_CAP * 16);
    if (!selected.has(elementIndex)) throw new Error(`AIR collision assistance: locked box element ${elementIndex} is outside the explicit target selection.`);
    const key = `${elementIndex}|${item.groupKey}`; if (!boxMap.has(key)) boxMap.set(key, new Set()); boxMap.get(key).add(slot);
  }
  return { frames: frameSet, boxes: boxMap };
}
function authoritativeSlots(inspection, groupKey, allowEmpty = false) {
  const group = inspection.groups?.[groupKey], profile = inspection.target?.allocation?.id;
  if (allowEmpty && inspection.available && inspection.target?.allocation?.authoritative && group?.ownership === 'none') return { available: true, reason: '', profile, slots: [] };
  if (!inspection.available || !group || group.projection?.status === 'unavailable' || !inspection.target?.allocation?.authoritative) return { available: false, reason: inspection.reason || group?.projection?.reason || 'Exact collision projection is unavailable.', profile: profile || null, slots: [] };
  const candidate = (group.projection.candidates || []).find(item => item.authoritative === true && item.profile === profile);
  if (!candidate || candidate.status !== 'parsed') return { available: false, reason: group.projection?.reason || 'The authoritative collision projection is invalid.', profile: profile || null, slots: [] };
  if (candidate.slots.length > MAX_BOX_CAP * 16) return { available: false, reason: 'The effective collision group exceeds the bounded assistance slot limit.', profile, slots: [] };
  return { available: true, reason: '', profile, slots: candidate.slots.filter(item => item.filled).map(item => ({ slot: integer(item.slot, 'effective slot', MAX_BOX_CAP * 16), rect: item.normalizedRect.map(Number), sourceLine: item.sourceLine, authoredLabel: item.authoredLabel })) };
}
function inspectionInput(input, elementIndex) { return { text: input.text, action: input.action, actionOccurrence: input.actionOccurrence, elementIndex, target: input.target, allocationDecision: input.allocationDecision, capabilityFingerprint: input.capabilityFingerprint, savedRuntimePlans: [], recoveryRuntimePlans: [] }; }
function lockedProposal(input, targetInspection, groupKey, slotRecord) {
  return { target: { action: input.action, actionOccurrence: input.actionOccurrence, elementIndex: targetInspection.selection.elementIndex, groupKey, slot: slotRecord.slot }, rect: slotRecord.rect.slice(), locked: true, provenance: { kind: 'locked-target', action: input.action, actionOccurrence: input.actionOccurrence, elementIndex: targetInspection.selection.elementIndex, groupKey, slot: slotRecord.slot, inspectionHash: targetInspection.inspectionHash, sourceLine: slotRecord.sourceLine } };
}
function copiedProposal(input, referenceInspection, targetInspection, groupKey, slotRecord) {
  return { target: { action: input.action, actionOccurrence: input.actionOccurrence, elementIndex: targetInspection.selection.elementIndex, groupKey, slot: slotRecord.slot }, rect: slotRecord.rect.slice(), locked: false, provenance: { kind: 'reference-frame', action: input.action, actionOccurrence: input.actionOccurrence, elementIndex: input.referenceElementIndex, groupKey, slot: slotRecord.slot, inspectionHash: referenceInspection.inspectionHash, sourceLine: slotRecord.sourceLine } };
}

function createAirCollisionAssistanceProposals(input = {}) {
  if (!plain(input) || !exactKeys(input, ['action', 'actionOccurrence', 'allocationDecision', 'capabilityFingerprint', 'groups', 'locks', 'referenceElementIndex', 'sourceFingerprint', 'target', 'targetElementIndices', 'text'])) throw new Error('AIR collision assistance: input must be one exact plain request.');
  if (typeof input.text !== 'string' || Buffer.byteLength(input.text, 'utf8') > MAX_SOURCE_BYTES) throw new Error(`AIR collision assistance: source must be UTF-8 text no larger than ${MAX_SOURCE_BYTES} bytes.`);
  const sourceFingerprint = sha(input.text); if (!HASH.test(input.sourceFingerprint) || input.sourceFingerprint !== sourceFingerprint) throw new Error('AIR collision assistance: source fingerprint is stale or malformed.');
  if (!HASH.test(input.capabilityFingerprint) || input.allocationDecision?.capabilityFingerprint !== input.capabilityFingerprint) throw new Error('AIR collision assistance: capability evidence is stale, mixed, or malformed.');
  const action = input.action; if (!Number.isSafeInteger(action)) throw new Error('AIR collision assistance: Action number must be a safe integer.');
  const actionOccurrence = integer(input.actionOccurrence, 'Action occurrence'), referenceElementIndex = integer(input.referenceElementIndex, 'reference element', MAX_SELECTED_FRAMES * 1024);
  if (!Array.isArray(input.targetElementIndices) || !input.targetElementIndices.length || input.targetElementIndices.length > MAX_SELECTED_FRAMES) throw new Error(`AIR collision assistance: select between 1 and ${MAX_SELECTED_FRAMES} target elements.`);
  const targetElementIndices = [...new Set(input.targetElementIndices.map(value => integer(value, 'target element', MAX_SELECTED_FRAMES * 1024)))].sort((a, b) => a - b);
  const selected = new Set(targetElementIndices), groups = normalizedGroups(input.groups), locks = normalizedLocks(input.locks, selected), exact = { ...input, action, actionOccurrence, referenceElementIndex };
  const referenceInspection = createAirCollisionInspection(inspectionInput(exact, referenceElementIndex));
  if (referenceInspection.sourceFingerprint !== sourceFingerprint || referenceInspection.capabilityFingerprint !== input.capabilityFingerprint) throw new Error('AIR collision assistance: reference inspection evidence does not match the pinned source and capability.');
  if (!referenceInspection.target.allocation.authoritative) throw new Error('AIR collision assistance: target collision allocation is unresolved; no proposal authority is available.');
  const references = Object.fromEntries(GROUPS.map(key => [key, authoritativeSlots(referenceInspection, key)]));
  const inspections = new Map([[referenceElementIndex, referenceInspection]]), targets = [], totals = { proposed: 0, locked: 0, omittedByCap: 0, conflicts: 0 };
  for (const elementIndex of targetElementIndices) {
    const inspection = inspections.get(elementIndex) || createAirCollisionInspection(inspectionInput(exact, elementIndex)); inspections.set(elementIndex, inspection);
    if (inspection.sourceFingerprint !== sourceFingerprint || inspection.capabilityFingerprint !== input.capabilityFingerprint || inspection.target.allocation.id !== referenceInspection.target.allocation.id) throw new Error(`AIR collision assistance: element ${elementIndex + 1} has mixed source or capability evidence.`);
    const frameLocked = locks.frames.has(elementIndex), groupResults = {};
    for (const groupKey of GROUPS) {
      const setting = groups[groupKey], target = authoritativeSlots(inspection, groupKey, true), lockedSlots = locks.boxes.get(`${elementIndex}|${groupKey}`) || new Set(), proposals = [], conflicts = [];
      if (!setting.enabled) { groupResults[groupKey] = { enabled: false, cap: setting.cap, profile: target.profile, status: 'disabled', proposals, omittedByCap: 0, conflicts }; continue; }
      if (!target.available) conflicts.push({ kind: 'target-unavailable', message: target.reason });
      if (!references[groupKey].available) conflicts.push({ kind: 'reference-unavailable', message: references[groupKey].reason });
      const existingBySlot = new Map(target.slots.map(item => [item.slot, item]));
      for (const slot of [...lockedSlots].sort((a, b) => a - b)) { const existing = existingBySlot.get(slot); if (existing) proposals.push(lockedProposal(exact, inspection, groupKey, existing)); else conflicts.push({ kind: 'missing-locked-box', slot, message: `Locked ${groupKey}[${slot}] is unavailable on element ${elementIndex + 1}.` }); }
      if (frameLocked && target.available) { for (const item of target.slots) if (!lockedSlots.has(item.slot)) proposals.push(lockedProposal(exact, inspection, groupKey, item)); }
      let omittedByCap = 0;
      if (!frameLocked && target.available && references[groupKey].available) {
        const available = Math.max(0, setting.cap - proposals.length), copy = references[groupKey].slots.filter(item => !lockedSlots.has(item.slot));
        for (const item of copy.slice(0, available)) proposals.push(copiedProposal(exact, referenceInspection, inspection, groupKey, item));
        omittedByCap = Math.max(0, copy.length - available);
      }
      if (proposals.length > setting.cap) conflicts.push({ kind: 'locked-over-cap', message: `${proposals.length} locked boxes exceed the ${groupKey} cap of ${setting.cap}; every locked box was preserved and no box was omitted.` });
      proposals.sort((a, b) => a.target.slot - b.target.slot || Number(a.locked) - Number(b.locked));
      totals.proposed += proposals.length; totals.locked += proposals.filter(item => item.locked).length; totals.omittedByCap += omittedByCap; totals.conflicts += conflicts.length;
      groupResults[groupKey] = { enabled: true, cap: setting.cap, profile: target.profile, status: conflicts.length ? (proposals.length ? 'partial' : 'conflict') : frameLocked ? 'locked-frame' : 'ready', proposals, omittedByCap, conflicts };
    }
    targets.push({ action, actionOccurrence, elementIndex, inspectionHash: inspection.inspectionHash, frameLocked, groups: groupResults });
  }
  const semantic = { schema: 'ikemaker.air-collision-assistance-proposals', version: 1, status: totals.conflicts ? 'partial' : 'ready', sourceFingerprint, capabilityFingerprint: input.capabilityFingerprint, allocationProfile: referenceInspection.target.allocation.id, selection: { action, actionOccurrence, referenceElementIndex, targetElementIndices }, reference: { inspectionHash: referenceInspection.inspectionHash, groups: Object.fromEntries(GROUPS.map(key => [key, { available: references[key].available, profile: references[key].profile, slots: references[key].slots.map(item => ({ slot: item.slot, rect: item.rect.slice(), sourceLine: item.sourceLine })) }])) }, settings: groups, targets, totals, effects: { filesystem: false, editor: false, clipboard: false, command: false, route: false, network: false, mutationAuthority: false, simulation: false } };
  return deepFreeze({ ...semantic, proposalHash: semanticHash(semantic) });
}

module.exports = { MAX_SELECTED_FRAMES, MAX_BOX_CAP, MAX_LOCKS, GROUPS, createAirCollisionAssistanceProposals };
