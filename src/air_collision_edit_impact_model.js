'use strict';

const crypto = require('crypto');
const { types: utilTypes } = require('util');
const { parseAir } = require('./air_preview_model');
const { deepFreeze } = require('./air_collision_inspection_model');

const SCHEMA = 'ikemaker.air-collision-edit-impact';
const MAX_SOURCE_BYTES = 16 * 1024 * 1024;
const MAX_FRAMES = 4096;
const MAX_RECORDS = 4096;
const MAX_PUBLIC_AFFECTED = 256;
const HASH = /^[A-F0-9]{64}$/;
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);

function sha(value) { return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').toUpperCase(); }
function canonical(value) { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])); return value; }
function semanticHash(value) { return sha(JSON.stringify(canonical(value))); }
function canonicalObject(value, stack = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || utilTypes.isProxy(value) || stack.has(value)) return false;
  stack.add(value);
  const prototype = Object.getPrototypeOf(value), keys = Object.keys(value), own = Reflect.ownKeys(value);
  if (Array.isArray(value)) { const valid = own.length === keys.length + 1 && own.includes('length') && keys.length === value.length && keys.every((key, index) => Number(key) === index && valueDescriptor(value, key, stack)); stack.delete(value); return valid; }
  const valid = (prototype === Object.prototype || prototype === null) && own.length === keys.length && keys.every(key => !FORBIDDEN.has(key) && valueDescriptor(value, key, stack)); stack.delete(value); return valid;
}
function valueDescriptor(owner, key, stack) { const descriptor = Object.getOwnPropertyDescriptor(owner, key); return Boolean(descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') && canonicalObject(descriptor.value, stack)); }
function deeplyFrozen(value, seen = new WeakSet()) { if (!value || typeof value !== 'object') return true; if (seen.has(value)) return true; if (!Object.isFrozen(value)) return false; seen.add(value); return Object.values(value).every(item => deeplyFrozen(item, seen)); }
function effects() { return { filesystem: false, editor: false, clipboard: false, command: false, route: false, mutationAuthority: false }; }
function finish(body) { const semantic = { schema: SCHEMA, version: 1, ...body, effects: effects() }; return deepFreeze({ ...semantic, impactHash: semanticHash(semantic) }); }
function unavailable(reason, evidence = {}) { return finish({ status: 'unavailable', reason: String(reason), sourceFingerprint: String(evidence.sourceFingerprint || ''), capabilityFingerprint: String(evidence.capabilityFingerprint || ''), inspectionHash: String(evidence.inspectionHash || ''), selection: evidence.selection || null, ownership: null, effectiveBefore: [], proposedAfter: [], materializationOnEdit: false, materializationRequired: false, materializesCount: 0, returnToDefaultsAvailable: false, limitations: [String(reason)] }); }
function rect(value) { if (!Array.isArray(value) || value.length !== 4 || !value.every(Number.isSafeInteger)) return null; const [x1, y1, x2, y2] = value.map(Number); return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)]; }
function publicRecord(record) { return { slot: Number(record.slot), filled: record.filled === true, normalizedRect: rect(record.normalizedRect), sourceLine: Number.isSafeInteger(record.sourceLine) ? record.sourceLine : null, authoredLabel: Number.isSafeInteger(record.authoredLabel) ? record.authoredLabel : null, allocation: String(record.allocation || 'unknown') }; }
function recordsForFrame(frame, key, profile, useDefault = false) {
  const prefix = `${key}${useDefault ? 'Default' : ''}`, field = profile === 'stable-source-order' ? `${prefix}StableRecords` : `${prefix}IndexedRecords`;
  return (frame[field] || []).map(record => publicRecord({ slot: record.index, filled: Number.isSafeInteger(record.line), normalizedRect: record.rect, sourceLine: record.line, authoredLabel: record.authoredIndex, allocation: record.allocation }));
}
function changedRecords(before, profile, slot, intent) {
  const after = before.map(record => ({ ...record, normalizedRect: record.normalizedRect ? [...record.normalizedRect] : null })), kind = intent.kind;
  if (kind === 'inspect') return { after, limitation: '' };
  if (kind === 'return-to-default') return { after: null, limitation: '' };
  const index = after.findIndex(record => record.slot === slot), proposedRect = rect(intent.rect);
  if (kind === 'edit') {
    if (index < 0 || !proposedRect) return { error: 'Edit requires one allocated selected slot and four safe-integer coordinates.' };
    after[index] = { ...after[index], filled: true, normalizedRect: proposedRect, sourceLine: null, allocation: after[index].filled ? after[index].allocation : 'proposed-fill' }; return { after, limitation: '' };
  }
  if (kind === 'add') {
    if (!proposedRect) return { error: 'Add requires four safe-integer coordinates.' };
    if (index >= 0) { if (after[index].filled) return { error: 'The selected slot is already filled; use Edit instead of Add.' }; after[index] = { ...after[index], filled: true, normalizedRect: proposedRect, sourceLine: null, allocation: 'proposed-fill' }; return { after, limitation: '' }; }
    if (slot !== after.length) return { error: 'A new box may append only at the next bounded slot; existing allocated slots cannot be skipped.' };
    after.push({ slot, filled: true, normalizedRect: proposedRect, sourceLine: null, authoredLabel: profile === 'indexed-label' ? slot : null, allocation: 'proposed-append' }); return { after, limitation: '' };
  }
  if (kind === 'delete') {
    if (index < 0 || !after[index].filled) return { error: 'Delete requires one filled selected slot; allocated-unfilled slots remain visible for repair.' };
    after.splice(index, 1);
    if (profile === 'stable-source-order') after.forEach((record, position) => { record.slot = position; });
    return { after, limitation: profile === 'indexed-label' ? 'Indexed labels are preserved; C12B must resolve any resulting count gap without renumbering authoritative labels.' : '' };
  }
  return { error: 'Edit intent must be inspect, add, edit, delete, or return-to-default.' };
}

function createAirCollisionEditImpact(input = {}) {
  let text = '', inspection = null;
  try {
    if (!canonicalObject(input)) return unavailable('Input evidence is not a canonical plain JSON object.');
    text = String(input.text || ''); inspection = input.inspection;
    if (Buffer.byteLength(text, 'utf8') > MAX_SOURCE_BYTES) return unavailable(`AIR source exceeds ${MAX_SOURCE_BYTES} bytes.`);
    if (!inspection) return unavailable('The current C8 inspection is missing.');
    if (!canonicalObject(inspection)) return unavailable('The current C8 inspection is noncanonical.');
    if (!deeplyFrozen(inspection)) return unavailable('The current C8 inspection is mutable.');
    if (inspection.schema !== 'ikemaker.air-collision-inspection' || inspection.version !== 1) return unavailable('The current C8 inspection schema is unsupported.');
    const { inspectionHash, ...inspectionSemantic } = inspection;
    if (!HASH.test(String(inspectionHash || '')) || sha(JSON.stringify(inspectionSemantic)) !== inspectionHash) return unavailable('The C8 inspection hash is stale or noncanonical.');
    const sourceFingerprint = sha(text), capabilityFingerprint = String(input.capabilityFingerprint || ''), evidence = { sourceFingerprint, capabilityFingerprint, inspectionHash };
    if (!HASH.test(capabilityFingerprint) || !HASH.test(String(inspection.capabilityFingerprint || '')) || sourceFingerprint !== inspection.sourceFingerprint || capabilityFingerprint !== inspection.capabilityFingerprint) return unavailable('The AIR source or canonical capability fingerprint changed after inspection.', evidence);
    const actionNumber = Number(input.action), occurrence = Number(input.actionOccurrence || 0), elementIndex = Number(input.elementIndex), key = input.groupKey === 'clsn2' ? 'clsn2' : input.groupKey === 'clsn1' ? 'clsn1' : '', slot = Number(input.slot), intent = input.intent || { kind: 'inspect' };
    const selection = { action: actionNumber, actionOccurrence: occurrence, elementIndex, groupKey: key, slot, intent: String(intent.kind || '') };
    if (!Number.isSafeInteger(actionNumber) || !Number.isSafeInteger(occurrence) || occurrence < 0 || !Number.isSafeInteger(elementIndex) || elementIndex < 0 || !key || !Number.isSafeInteger(slot) || slot < 0 || !canonicalObject(intent)) return unavailable('The explicit Action occurrence, element, group, slot, or edit intent is invalid.', { ...evidence, selection });
    if (inspection.selection.requestedAction !== actionNumber || inspection.selection.actionOccurrence !== occurrence || inspection.selection.elementIndex !== elementIndex || inspection.selection.sourceMode !== 'authored' || inspection.selection.readOnly || inspection.selection.authoritativeAction !== actionNumber) return unavailable('Duplicate, Copy Action, fallthrough, unavailable, or stale selection evidence cannot own an edit-impact plan.', { ...evidence, selection });
    const profile = inspection.target?.allocation?.id, group = inspection.groups?.[key], candidate = group?.projection?.candidates?.find(item => item.profile === profile && item.authoritative === true), emptyGroup = group?.ownership === 'none';
    if (!['stable-source-order', 'indexed-label'].includes(profile) || (!emptyGroup && (group?.projection?.status === 'unavailable' || !candidate))) return unavailable('The exact target allocation profile is not authoritative for this collision group.', { ...evidence, selection });
    const actions = parseAir(text), matches = actions.filter(action => action.number === actionNumber), action = matches[occurrence], frame = action?.frames?.[elementIndex];
    if (actions.length > MAX_FRAMES || action?.frames?.length > MAX_FRAMES || matches.length !== 1 || !action || !frame || action.readOnly || frame.line !== inspection.selection.frameSourceLine) return unavailable('The exact authored Action occurrence or frame is duplicated, read-only, unavailable, over-cap, or stale.', { ...evidence, selection });
    const ownershipMap = { 'default-declared-for-this-element': 'default-owner', 'inherited-default': 'inherited-default', element: 'frame-specific', none: 'new-frame-block' }, status = ownershipMap[group.ownership];
    if (!status || group.ownership !== frame[`${key}Ownership`]) return unavailable('Collision ownership changed after inspection.', { ...evidence, selection });
    const effectiveBefore = emptyGroup ? [] : candidate.slots.map(publicRecord);
    if (effectiveBefore.length > MAX_RECORDS) return unavailable(`Effective collision records exceed ${MAX_RECORDS}.`, { ...evidence, selection });
    const ownerLine = group.authored?.block?.line || null, affectedAll = ownerLine ? action.frames.map((item, index) => ({ item, index })).filter(({ item }) => item[`${key}Line`] === ownerLine && ['default-declared-for-this-element', 'inherited-default'].includes(item[`${key}Ownership`])).map(({ item, index }) => ({ elementIndex: index, elementNumber: index + 1, frameLine: item.line, ownership: item[`${key}Ownership`] })) : [], ownerCount = affectedAll.filter(item => item.ownership === 'default-declared-for-this-element').length, affected = { count: affectedAll.length, ownerCount, inheritorCount: affectedAll.length - ownerCount, frames: affectedAll.slice(0, MAX_PUBLIC_AFFECTED), omitted: Math.max(0, affectedAll.length - MAX_PUBLIC_AFFECTED) };
    const fallbackLine = Number.isSafeInteger(frame[`${key}DefaultLine`]) ? frame[`${key}DefaultLine`] : null, fallback = fallbackLine ? recordsForFrame(frame, key, profile, true) : [], canReturn = status === 'frame-specific' && fallbackLine !== null && fallbackLine !== ownerLine;
    let proposed;
    if (intent.kind === 'return-to-default') {
      if (!canReturn) return unavailable('Return to defaults requires one exact frame-local block and one proven same-group default fallback.', { ...evidence, selection });
      proposed = { after: fallback, limitation: 'Preview only: removing the exact local block would expose this proven fallback.' };
    } else proposed = changedRecords(effectiveBefore, profile, slot, intent);
    if (proposed.error) return unavailable(proposed.error, { ...evidence, selection });
    const materializationOnEdit = status === 'inherited-default', materializationRequired = materializationOnEdit && intent.kind !== 'inspect' && intent.kind !== 'return-to-default', limitations = [
      'Read-only semantic impact preview; no AIR text is generated or changed.',
      status === 'default-owner' ? `Editing this default can affect ${affected.count} frame(s) tied to the exact declaration.` : status === 'inherited-default' ? `A local edit must first materialize all ${effectiveBefore.length} effective ${group.group} slot(s) on this frame; the shared default remains unchanged.` : status === 'frame-specific' ? 'This frame already owns an explicit same-group block.' : 'This frame has no effective same-group block.',
      proposed.limitation || ''
    ].filter(Boolean);
    return finish({ status, reason: '', sourceFingerprint, capabilityFingerprint, inspectionHash, selection: { ...selection, profile, group: group.group, frameLine: frame.line }, ownership: { kind: status, ownerLine, ownerRange: group.authored?.block?.range || null, frameLine: frame.line, affected, fallbackLine }, effectiveBefore, selectedSlot: effectiveBefore.find(record => record.slot === slot) || null, proposedAfter: proposed.after, materializationOnEdit, materializationRequired, materializesCount: materializationOnEdit ? effectiveBefore.length : 0, returnToDefaultsAvailable: canReturn, limitations });
  } catch (error) {
    return unavailable(`Edit-impact evidence could not be resolved safely: ${error.message}`, { sourceFingerprint: text ? sha(text) : '', capabilityFingerprint: String(input && typeof input === 'object' && !utilTypes.isProxy(input) ? input.capabilityFingerprint || '' : ''), inspectionHash: inspection && typeof inspection === 'object' && !utilTypes.isProxy(inspection) ? inspection.inspectionHash || '' : '' });
  }
}

module.exports = { SCHEMA, MAX_SOURCE_BYTES, MAX_FRAMES, MAX_RECORDS, MAX_PUBLIC_AFFECTED, createAirCollisionEditImpact };
