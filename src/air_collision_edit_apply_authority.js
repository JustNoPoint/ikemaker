'use strict';

const crypto = require('crypto');
const path = require('path');
const { types: utilTypes } = require('util');
const { deepFreeze } = require('./air_collision_inspection_model');

const SCHEMA = 'ikemaker.air-collision-edit-apply-authority';
const TOKEN = /^[a-f0-9]{48}$/;
const HASH = /^[A-F0-9]{64}$/;
const MAX_PATCH_BYTES = 1024 * 1024;
const MAX_SOURCE_OFFSET = 16 * 1024 * 1024;
const MAX_EXCERPT = 8192;
const MAX_PUBLIC_BYTES = 32768;
const MAX_LABEL = 2048;
const MAX_PATH = 32768;
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
function frozen(value, seen = new WeakSet()) { if (!value || typeof value !== 'object') return true; if (seen.has(value)) return true; if (!Object.isFrozen(value)) return false; seen.add(value); return Object.values(value).every(item => frozen(item, seen)); }
function exactOperation(value) { if (!value || !plain(value) || typeof value.kind !== 'string') return false; const keys = Object.keys(value).sort(); if (value.kind === 'add' || value.kind === 'edit') return keys.length === 2 && keys[0] === 'kind' && keys[1] === 'rect' && Array.isArray(value.rect) && value.rect.length === 4 && value.rect.every(Number.isSafeInteger) && value.rect[0] <= value.rect[2] && value.rect[1] <= value.rect[3]; return (value.kind === 'delete' || value.kind === 'return-to-default') && keys.length === 1 && keys[0] === 'kind'; }
function readyPlan(plan) {
  try {
    if (!plan || !plain(plan) || !frozen(plan) || plan.schema !== 'ikemaker.air-collision-edit-plan' || plan.version !== 1 || plan.status !== 'ready' || plan.ready !== true || !HASH.test(String(plan.planHash || ''))) return false;
    const { planHash, ...semantic } = plan; if (semanticHash(semantic) !== planHash) return false;
    for (const key of ['sourceFingerprint', 'inspectionHash', 'impactHash', 'capabilityFingerprint', 'resultingFingerprint']) if (!HASH.test(String(plan[key] || ''))) return false;
    const selection = plan.selection, patch = plan.patch, context = plan.context, effects = plan.effects || {};
    const selectionKeys = ['action', 'actionOccurrence', 'elementIndex', 'frameLine', 'group', 'groupKey', 'operation', 'profile', 'slot'];
    if (!selection || Object.keys(selection).sort().join(',') !== selectionKeys.sort().join(',') || !Number.isSafeInteger(selection.action) || !Number.isSafeInteger(selection.actionOccurrence) || selection.actionOccurrence < 0 || !Number.isSafeInteger(selection.elementIndex) || selection.elementIndex < 0 || !['clsn1', 'clsn2'].includes(selection.groupKey) || selection.group !== (selection.groupKey === 'clsn2' ? 'Clsn2' : 'Clsn1') || !['stable-source-order', 'indexed-label'].includes(selection.profile) || !Number.isSafeInteger(selection.frameLine) || selection.frameLine < 1 || !Number.isSafeInteger(selection.slot) || selection.slot < 0 || !exactOperation(selection.operation)) return false;
    if (!plan.ownership || !['default-owner', 'inherited-default', 'frame-specific', 'new-frame-block'].includes(plan.ownership.kind)) return false;
    if (!patch || !Number.isSafeInteger(patch.start) || !Number.isSafeInteger(patch.end) || patch.start < 0 || patch.end < patch.start || patch.start > MAX_SOURCE_OFFSET || patch.end > MAX_SOURCE_OFFSET || typeof patch.before !== 'string' || patch.before.length !== patch.end - patch.start || typeof patch.replacement !== 'string' || Buffer.byteLength(patch.before, 'utf8') > MAX_PATCH_BYTES || Buffer.byteLength(patch.replacement, 'utf8') > MAX_PATCH_BYTES) return false;
    if (!context || typeof context.before !== 'string' || typeof context.replacement !== 'string' || Buffer.byteLength(context.before, 'utf8') > MAX_EXCERPT || Buffer.byteLength(context.replacement, 'utf8') > MAX_EXCERPT || !['beforeOmitted', 'afterOmitted', 'replacementOmitted'].every(key => Number.isSafeInteger(context[key]) && context[key] >= 0)) return false;
    if (typeof plan.impact !== 'string' || plan.impact.length > MAX_LABEL || Object.values(effects).some(value => value !== false) || Object.keys(effects).sort().join(',') !== 'clipboard,command,editor,filesystem,mutationAuthority,route') return false;
    return true;
  } catch (_) { return false; }
}
function validPath(value) { if (typeof value !== 'string' || !value || Buffer.byteLength(value, 'utf8') > MAX_PATH || value.includes('\0') || !path.isAbsolute(value)) return false; return path.normalize(value) === value; }
function validSession(value) { return typeof value === 'string' && value.length >= 1 && value.length <= 192 && /^[A-Za-z0-9._:-]+$/.test(value); }
function bindingMatchesPlan(binding, plan) {
  const selection = plan.selection;
  return validPath(binding.airPath) && Number.isSafeInteger(binding.documentVersion) && binding.documentVersion >= 0 && HASH.test(String(binding.sourceFingerprint || '')) && binding.sourceFingerprint === plan.sourceFingerprint && binding.planHash === plan.planHash && binding.inspectionHash === plan.inspectionHash && binding.impactHash === plan.impactHash && binding.resultingFingerprint === plan.resultingFingerprint && binding.capabilityFingerprint === plan.capabilityFingerprint && Number.isSafeInteger(binding.action) && binding.action === selection.action && Number.isSafeInteger(binding.actionOccurrence) && binding.actionOccurrence === selection.actionOccurrence && Number.isSafeInteger(binding.elementIndex) && binding.elementIndex === selection.elementIndex && binding.groupKey === selection.groupKey && Number.isSafeInteger(binding.slot) && binding.slot === selection.slot && semanticHash(binding.operation) === semanticHash(selection.operation) && validSession(binding.sessionId) && Number.isSafeInteger(binding.editEpoch) && binding.editEpoch >= 0;
}
function excerpt(value, limit = MAX_EXCERPT) { const text = String(value || ''), totalBytes = Buffer.byteLength(text, 'utf8'); let shown = '', shownBytes = 0; for (const character of text) { const bytes = Buffer.byteLength(character, 'utf8'); if (shownBytes + bytes > limit) break; shown += character; shownBytes += bytes; } return { text: shown, omittedBytes: totalBytes - shownBytes }; }
function publicReview(token, plan) {
  const selection = plan.selection, before = excerpt(plan.patch.before), replacement = excerpt(plan.patch.replacement), target = excerpt(`Action ${selection.action} · element ${selection.elementIndex + 1} · ${selection.group}[${selection.slot}] · ${selection.operation.kind}`, MAX_LABEL).text, ownership = plan.ownership.kind, impact = excerpt(plan.impact, MAX_LABEL).text, review = { token, label: 'Apply reviewed AIR edit', target, ownership, impact, before, replacement };
  return Buffer.byteLength(JSON.stringify(review), 'utf8') <= MAX_PUBLIC_BYTES ? deepFreeze(review) : null;
}
function issueAirCollisionEditApplyAuthority(input = {}, tokenFactory = () => crypto.randomBytes(24).toString('hex')) {
  if (!plain(input) || !readyPlan(input.plan) || !input.binding || !plain(input.binding) || !frozen(input.binding) || !bindingMatchesPlan(input.binding, input.plan)) return null;
  const token = String(tokenFactory()); if (!TOKEN.test(token)) throw new Error('AIR collision edit Apply authority requires one unique lowercase 48-hex token.');
  if (input.activeToken !== undefined && String(input.activeToken) === token) throw new Error('AIR collision edit Apply authority cannot reuse the active token.');
  const publicProjection = publicReview(token, input.plan); if (!publicProjection) return null;
  const authority = deepFreeze({ schema: SCHEMA, version: 1, token, binding: input.binding, plan: input.plan });
  return { authority, public: publicProjection };
}
function consumeAirCollisionEditApplyAuthority(record, token) { const authority = record?.collisionEditApplyAuthority || null; if (record) record.collisionEditApplyAuthority = null; if (typeof token !== 'string' || !TOKEN.test(token) || !authority || authority.schema !== SCHEMA || authority.version !== 1 || authority.token !== token) return null; return authority; }
function revokeAirCollisionEditApplyAuthority(record) { if (record) record.collisionEditApplyAuthority = null; }
function sameAirCollisionEditApplyReview(authority, rebuiltPlan, currentBinding) { try { return Boolean(authority && authority.schema === SCHEMA && readyPlan(rebuiltPlan) && currentBinding && plain(currentBinding) && frozen(currentBinding) && bindingMatchesPlan(currentBinding, rebuiltPlan) && semanticHash(authority.plan) === semanticHash(rebuiltPlan) && semanticHash(authority.binding) === semanticHash(currentBinding)); } catch (_) { return false; } }

module.exports = { SCHEMA, TOKEN, MAX_PATCH_BYTES, MAX_SOURCE_OFFSET, MAX_EXCERPT, MAX_PUBLIC_BYTES, MAX_LABEL, MAX_PATH, readyPlan, issueAirCollisionEditApplyAuthority, consumeAirCollisionEditApplyAuthority, revokeAirCollisionEditApplyAuthority, sameAirCollisionEditApplyReview };
