'use strict';

const crypto = require('crypto');
const { hash } = require('./mutation_safety');

const MAX_CONTROLLER_BYTES = 256 * 1024, MAX_EXPRESSION_BYTES = 4096;
const TARGETS = Object.freeze({ anim: Object.freeze(['anim']), pos: Object.freeze(['pos']), placement: Object.freeze(['postype', 'space']), vel: Object.freeze(['vel','velocity']), accel: Object.freeze(['accel']), bindtime: Object.freeze(['bindtime']), removetime: Object.freeze(['removetime']), scale: Object.freeze(['scale']), angle: Object.freeze(['angle']), layerno: Object.freeze(['layerno']), sprpriority: Object.freeze(['sprpriority']) });

function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) deepFreeze(child); Object.freeze(value); } return value; }
function syntaxMask(text, syntax) {
  const chars = [...String(text || '')]; let quote = '', escaped = false;
  for (let at = 0; at < chars.length; at += 1) {
    const value = chars[at], next = chars[at + 1];
    if (quote) { chars[at] = 'x'; if (escaped) escaped = false; else if (value === '\\') escaped = true; else if (value === quote) quote = ''; continue; }
    if (value === '"' || value === "'") { quote = value; chars[at] = 'x'; continue; }
    if ((syntax === 'cns' && value === ';') || (syntax === 'zss' && (value === '#' || (value === '/' && next === '/')))) { while (at < chars.length && chars[at] !== '\r' && chars[at] !== '\n') chars[at++] = ' '; at -= 1; }
  }
  return chars.join('');
}
function properties(controller, syntax, controllerOffset) {
  const clean = syntaxMask(controller, syntax), result = [], pattern = syntax === 'cns' ? /^\s*([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*([^\r\n]*)/gim : /\b([A-Za-z_][A-Za-z0-9_.]*)\s*:\s*([^;{}\r\n]*)/gi; let match;
  while ((match = pattern.exec(clean))) {
    const key = match[1], rawStart = match.index + match[0].indexOf(match[2]), leading = /^\s*/.exec(match[2])?.[0].length || 0, trimmed = match[2].trim(), start = controllerOffset + rawStart + leading;
    if (syntax === 'cns' && (/^trigger(?:all|\d+)$/i.test(key) || /^type$/i.test(key))) continue;
    result.push({ name: key.toLowerCase(), authoredName: key, expression: String(controller).slice(rawStart + leading, rawStart + leading + trimmed.length), start, end: start + trimmed.length });
  }
  return result;
}
function simpleNumber(value) { return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value); }
function validValue(target, value) {
  const text = String(value ?? '').trim(); if (!text || /[\r\n;{}]/.test(text) || Buffer.byteLength(text, 'utf8') > MAX_EXPRESSION_BYTES) return false;
  if(target==='layerno')return /^(?:-1|0|1)$/.test(text);
  if (['anim','bindtime','removetime','sprpriority'].includes(target)) return /^[+-]?\d+$/.test(text) && Number.isSafeInteger(Number(text));
  if(target==='angle')return simpleNumber(text);
  if (target === 'placement') return /^[A-Za-z_][A-Za-z0-9_]*$/.test(text);
  const parts = text.split(',').map(item => item.trim());
  if(['vel','accel','scale'].includes(target))return parts.length===2&&parts.every(simpleNumber);
  return (parts.length === 2 && parts.every(simpleNumber)) || (parts.length === 3 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(parts[0]) && parts.slice(1).every(simpleNumber));
}
function fieldModel(target, found) {
  if (!found.length) return { target, editable: false, status: 'omitted', reason: 'This property is not authored in the selected controller; the first editing slice never inserts or reorders fields.' };
  if (found.length !== 1) return { target, editable: false, status: 'duplicate', reason: 'Multiple matching properties are authored; edit them in source before guided replacement.' };
  const property = found[0], editable = validValue(target, property.expression);
  return { target, editable, status: editable ? 'ready' : 'dynamic', authoredName: property.authoredName, expression: property.expression, start: property.start, end: property.end, reason: editable ? '' : 'The authored expression is dynamic or outside the conservative literal grammar and remains source-owned.' };
}
function createExplodEditDraft(reference, sourceText) {
  const selection = reference?.selection, text = String(sourceText ?? '');
  if (reference?.schema !== 'ikemaker.explod-handoff' || reference.version !== 1 || !selection || hash(text) !== selection.sourceHash || !Number.isSafeInteger(selection.startIndex) || !Number.isSafeInteger(selection.endIndex)) return null;
  const controller = text.slice(selection.startIndex, selection.endIndex);
  if (hash(controller) !== selection.controllerHash || Buffer.byteLength(controller, 'utf8') > MAX_CONTROLLER_BYTES || !['zss', 'cns'].includes(selection.syntax)) return null;
  const parsed = properties(controller, selection.syntax, selection.startIndex), fields = Object.entries(TARGETS).map(([target, names]) => fieldModel(target, parsed.filter(item => names.includes(item.name))));
  const identity = hash(JSON.stringify([selection.filename, selection.sourceHash, selection.controllerHash, selection.startIndex, selection.endIndex, selection.syntax, fields.map(item => [item.target, item.status, item.authoredName, item.expression, item.start, item.end])]));
  return deepFreeze({ schema: 'ikemaker.explod-edit-draft', version: 1, draftId: identity, filename: selection.filename, syntax: selection.syntax, sourceHash: selection.sourceHash, controllerHash: selection.controllerHash, startIndex: selection.startIndex, endIndex: selection.endIndex, before: controller, fields });
}
function previewExplodEdit(draft, sourceText, values = {}) {
  const text = String(sourceText ?? ''); if (!draft || draft.schema !== 'ikemaker.explod-edit-draft' || draft.version !== 1 || hash(text) !== draft.sourceHash || hash(text.slice(draft.startIndex, draft.endIndex)) !== draft.controllerHash) return null;
  const allowed = new Set(draft.fields.map(item => item.target)); if (Object.keys(values || {}).some(key => !allowed.has(key))) return null;
  const replacements = [];
  for (const field of draft.fields) {
    if (!Object.prototype.hasOwnProperty.call(values, field.target)) continue;
    const next = String(values[field.target] ?? '').trim();
    if (!field.editable || !validValue(field.target, next)) return null;
    if (next !== field.expression) replacements.push({ target: field.target, authoredName: field.authoredName, start: field.start, end: field.end, before: field.expression, after: next });
  }
  if (!replacements.length) return deepFreeze({ status: 'no-op', draftId: draft.draftId, replacements: [], before: draft.before, after: draft.before });
  let after = text; for (const item of [...replacements].sort((a, b) => b.start - a.start)) after = after.slice(0, item.start) + item.after + after.slice(item.end);
  const controllerAfter = after.slice(draft.startIndex, draft.endIndex + replacements.reduce((sum, item) => sum + item.after.length - (item.end - item.start), 0));
  return deepFreeze({ schema: 'ikemaker.explod-edit-preview', version: 1, status: 'ready', draftId: draft.draftId, previewId: crypto.createHash('sha256').update(JSON.stringify([draft.draftId, replacements, hash(after)])).digest('hex'), sourceHash: draft.sourceHash, expectedSourceHash: hash(after), replacements, before: draft.before, after: controllerAfter, sourceAfter: after });
}

module.exports = { MAX_CONTROLLER_BYTES, MAX_EXPRESSION_BYTES, TARGETS, syntaxMask, properties, validValue, createExplodEditDraft, previewExplodEdit };
