'use strict';

const { maskSource } = require('./state_transfer_model');

const FIELD_NAMES = new Set(['value', 'value2', 'attr', 'time', 'playerno', 'playerid', 'slot', 'stack', 'clsn.group', 'clsn.index', 'redirectid']);
const SELECTORS = new Set(['value', 'value2', 'attr', 'playerno', 'playerid']);
const OLD_FIELDS = new Set(['value', 'value2']);
const NEW_FIELDS = new Set(['attr', 'playerno', 'playerid', 'slot', 'stack', 'clsn.group', 'clsn.index']);

function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }
function matchingBrace(masked, open) { let depth = 0; for (let at = open; at < masked.length; at += 1) { if (masked[at] === '{') depth += 1; else if (masked[at] === '}' && --depth === 0) return at; } return -1; }
function lineAt(text, offset) { return text.slice(0, offset).split(/\r?\n/).length - 1; }
function commentOffset(raw, syntax) { let quoted = false; for (let at = 0; at < raw.length; at += 1) { if (raw[at] === '"' && raw[at - 1] !== '\\') quoted = !quoted; if (!quoted && ((syntax === 'cns' && raw[at] === ';') || (syntax === 'zss' && raw[at] === '#'))) return at; } return raw.length; }
function fields(source, masked, start, end, separator, syntax) {
  const body = masked.slice(start, end), pattern = new RegExp(`(?:^|[;\\r\\n])[ \\t]*([A-Za-z_][A-Za-z0-9_.]*)[ \\t]*${separator}[ \\t]*([^\\r\\n;}]*)`, 'gim'), output = new Map(); let match;
  while ((match = pattern.exec(body))) {
    const keyAt = match[0].indexOf(match[1]), separatorAt = match[0].indexOf(separator, keyAt + match[1].length), rawStart = start + match.index + separatorAt + separator.length, rawEnd = start + match.index + match[0].length, fullRaw = source.slice(rawStart, rawEnd), raw = fullRaw.slice(0, commentOffset(fullRaw, syntax)), leading = raw.length - raw.trimStart().length, trailing = raw.length - raw.trimEnd().length;
    const item = freeze({ name: match[1], start: rawStart + leading, end: rawStart + raw.length - trailing, expression: source.slice(rawStart + leading, rawStart + raw.length - trailing) }), key = match[1].toLowerCase();
    if (!output.has(key)) output.set(key, []); output.get(key).push(item);
  }
  return output;
}
function redirectedBefore(masked, offset) { const boundary = Math.max(masked.lastIndexOf(';', offset - 1), masked.lastIndexOf('{', offset - 1), masked.lastIndexOf('}', offset - 1)); return /,\s*$/.test(masked.slice(boundary + 1, offset)); }
function nestedBefore(masked, offset) { let depth = 0; const boundary = Math.max(masked.lastIndexOf(']', offset - 1), 0); for (let at = boundary; at < offset; at += 1) { if (masked[at] === '{') depth += 1; else if (masked[at] === '}' && depth > 0) depth -= 1; } return depth > 0; }
function fieldEvidence(map) { const output = []; for (const [key, values] of map) if (FIELD_NAMES.has(key)) for (const item of values) output.push(freeze({ key, ...item })); return freeze(output.sort((a, b) => a.start - b.start)); }
function staticExpression(field) {
  const value = String(field.expression || '').trim(); if (!value) return false;
  if (field.key === 'value' || field.key === 'value2' || field.key === 'attr') return /^[SCA]+(?:\s*,\s*(?:N[ATP]|S[ATP]|H[ATP]|A[ATP]))+$/i.test(value);
  if (field.key === 'clsn.group') return /^(?:clsn1|clsn2|[+-]?\d+)$/i.test(value);
  if (field.key === 'stack') return /^(?:0|1|true|false)$/i.test(value);
  return /^[+-]?\d+$/.test(value);
}
function classify(kind, map, options = {}) {
  const duplicates = [...map].filter(([key, values]) => FIELD_NAMES.has(key) && values.length > 1).map(([key]) => key), fields = fieldEvidence(map), hasOld = fields.some(item => OLD_FIELDS.has(item.key)), hasNew = fields.some(item => NEW_FIELDS.has(item.key)), hasSelector = fields.some(item => SELECTORS.has(item.key) && item.expression.trim()), redirect = Boolean(options.redirectPrefix) || (map.get('redirectid') || []).length > 0, mixed = hasOld && hasNew, malformed = fields.some(item => !item.expression.trim()), dynamic = fields.some(item => item.key !== 'redirectid' && !staticExpression(item));
  const reason = options.incomplete ? `The ${kind} block is structurally incomplete.` : options.typeAmbiguous ? 'The controller has duplicate or ambiguous type declarations.' : duplicates.length ? `The ${kind} controller duplicates ${duplicates.join(', ')}.` : mixed ? `The ${kind} controller mixes old value/value2 syntax with newer fields.` : !hasSelector ? `The ${kind} controller has no eligibility selector.` : malformed ? `The ${kind} controller contains a malformed empty field.` : redirect ? `Redirected ${kind} ownership is unresolved.` : '';
  return { sourceExact: !options.incomplete && !options.typeAmbiguous, available: !reason, reason, redirect, fields, dynamic, conditional: Boolean(options.conditional || options.hasTriggers || dynamic) };
}
function record(text, syntax, kind, controllerStart, controllerEnd, map, options = {}) { return freeze({ syntax, kind: kind.toLowerCase(), label: kind, category: 'eligibility-filtering', controllerStart, controllerEnd, controllerLine: lineAt(text, controllerStart), ...classify(kind, map, options) }); }
function cnsRecords(text, masked) {
  const headers = [], pattern = /^[ \t]*\[([^\]\r\n]+)\]/gim; let match; while ((match = pattern.exec(masked))) headers.push({ header: match[1].trim(), start: match.index, bodyStart: pattern.lastIndex }); const output = [];
  for (let index = 0; index < headers.length; index += 1) { const section = { ...headers[index], end: headers[index + 1]?.start ?? masked.length }; if (!/^state(?:\s|$)/i.test(section.header) || /^statedef\b/i.test(section.header)) continue; const map = fields(text, masked, section.bodyStart, section.end, '=', 'cns'), types = map.get('type') || [], eligible = types.filter(item => /^(?:hitby|nothitby)$/i.test(item.expression)); if (!eligible.length) continue; const kind = /^nothitby$/i.test(eligible[0].expression) ? 'NotHitBy' : 'HitBy'; output.push(record(text, 'cns', kind, section.start, section.end, map, { typeAmbiguous: types.length !== 1, hasTriggers: [...map.keys()].some(key => /^trigger(?:all|\d+)$/i.test(key)) })); }
  return output;
}
function zssRecords(text, masked) {
  const output = [], pattern = /\b(HitBy|NotHitBy)\b\s*\{/gi; let match; while ((match = pattern.exec(masked))) { const open = masked.indexOf('{', match.index), close = matchingBrace(masked, open), end = close < 0 ? masked.length : close + 1, map = fields(text, masked, open + 1, close < 0 ? masked.length : close, ':', 'zss'); output.push(record(text, 'zss', /^nothitby$/i.test(match[1]) ? 'NotHitBy' : 'HitBy', match.index, end, map, { incomplete: close < 0, redirectPrefix: redirectedBefore(masked, match.index), conditional: nestedBefore(masked, match.index) })); pattern.lastIndex = Math.max(pattern.lastIndex, end); }
  return output;
}
function parseCollisionEligibilityReferences(text, syntax) { const source = String(text || ''), grammar = syntax === 'zss' ? 'zss' : 'cns', masked = maskSource(source, grammar); return grammar === 'zss' ? zssRecords(source, masked) : cnsRecords(source, masked); }

module.exports = { FIELD_NAMES, parseCollisionEligibilityReferences };
