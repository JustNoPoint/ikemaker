'use strict';

const { maskSource } = require('./state_transfer_model');

function matchingBrace(masked, open) {
  let depth = 0;
  for (let at = open; at < masked.length; at += 1) {
    if (masked[at] === '{') depth += 1;
    else if (masked[at] === '}' && --depth === 0) return at;
  }
  return -1;
}
function redirectedBefore(masked, offset) {
  const boundary = Math.max(masked.lastIndexOf(';', offset - 1), masked.lastIndexOf('{', offset - 1), masked.lastIndexOf('}', offset - 1));
  return /,\s*$/.test(masked.slice(boundary + 1, offset));
}
function commentOffset(raw, syntax) { let quoted = false; for (let at = 0; at < raw.length; at += 1) { if (raw[at] === '"' && raw[at - 1] !== '\\') quoted = !quoted; if (!quoted && ((syntax === 'cns' && raw[at] === ';') || (syntax === 'zss' && raw[at] === '#'))) return at; } return raw.length; }
function fields(source, masked, start, end, separator, syntax) {
  const body = masked.slice(start, end), pattern = new RegExp(`(?:^|[;\\r\\n])[ \\t]*([A-Za-z_][A-Za-z0-9_]*)[ \\t]*${separator}[ \\t]*([^\\r\\n;}]*)`, 'gim'), output = new Map();
  let match;
  while ((match = pattern.exec(body))) {
    const keyAt = match[0].indexOf(match[1]), separatorAt = match[0].indexOf(separator, keyAt + match[1].length), rawStart = start + match.index + separatorAt + separator.length, rawEnd = start + match.index + match[0].length, fullRaw = source.slice(rawStart, rawEnd), raw = fullRaw.slice(0, commentOffset(fullRaw, syntax)), leading = raw.length - raw.trimStart().length, trailing = raw.length - raw.trimEnd().length;
    const item = { start: rawStart + leading, end: rawStart + raw.length - trailing };
    item.expression = source.slice(item.start, item.end);
    const key = match[1].toLowerCase(); if (!output.has(key)) output.set(key, []); output.get(key).push(item);
  }
  return output;
}
function lineAt(text, offset) { return text.slice(0, offset).split(/\r?\n/).length - 1; }
function classify(expression) {
  const value = String(expression || '').trim();
  if (/^-\d+$/.test(value)) return { action: null, reason: value === '-1' ? 'Explod anim -1 means no animation; it is not an AIR Action.' : value === '-2' ? 'Explod anim -2 is the empty-valid animation sentinel; it is not an AIR Action.' : 'Negative Explod anim values are not AIR Action identities.' };
  if (/^\d+$/.test(value)) { const action = Number(value); return Number.isSafeInteger(action) ? { action, reason: '' } : { action: null, reason: 'The Explod anim integer exceeds the exact safe-integer limit.' }; }
  if (/^(?:[A-Za-z_][A-Za-z0-9_]*\s*)?-?\d+$/.test(value) || /^(?:"[^"]*"|[A-Za-z_][A-Za-z0-9_]*(?:\([^)]*\))?)\s*,/.test(value) || /^[A-Za-z_][A-Za-z0-9_]*\s*(?:\+|\s)\s*-?\d+/.test(value)) return { action: null, reason: 'Prefixed Explod animations require the deferred CommonFX resource graph.' };
  return { action: null, reason: 'Only an unprefixed nonnegative safe-integer Explod anim can open this character AIR exactly.' };
}
function makeRecord(text, syntax, controllerStart, controllerEnd, map, extra = {}) {
  const animations = map.get('anim') || [], value = animations[0], classified = animations.length === 1 ? classify(value.expression) : { action: null, reason: animations.length ? 'The Explod controller has duplicate anim fields.' : 'The Explod controller omits anim.' };
  const redirect = (map.get('redirectid') || []).length > 0 || Boolean(extra.redirectPrefix), animplayerno = (map.get('animplayerno') || []).length > 0, spriteplayerno = (map.get('spriteplayerno') || []).length > 0;
  const reason = extra.incomplete ? 'The Explod block is structurally incomplete.' : redirect ? 'Redirected Explod animation ownership is runtime-dependent.' : animplayerno ? 'Explod animplayerno makes animation ownership runtime-dependent.' : classified.reason;
  return { syntax, kind: 'explod-anim', controllerStart, controllerEnd, controllerLine: lineAt(text, controllerStart), valueStart: value?.start ?? -1, valueEnd: value?.end ?? -1, expression: value?.expression || '', action: classified.action, available: !reason && classified.action !== null, reason, ownerEvidence: { redirect, animplayerno, spriteplayerno }, warning: spriteplayerno ? 'AIR owner: selected character; sprite owner: runtime-selected.' : '' };
}
function cnsRecords(text, masked) {
  const headers = [], pattern = /^[ \t]*\[([^\]\r\n]+)\]/gim; let match;
  while ((match = pattern.exec(masked))) headers.push({ header: match[1].trim(), start: match.index, bodyStart: pattern.lastIndex });
  const records = [];
  for (let index = 0; index < headers.length; index += 1) {
    const section = { ...headers[index], end: headers[index + 1]?.start ?? masked.length };
    if (!/^state(?:\s|$)/i.test(section.header) || /^statedef\b/i.test(section.header)) continue;
    const map = fields(text, masked, section.bodyStart, section.end, '=', 'cns'), types = map.get('type') || [], explods = types.filter(item => /^explod$/i.test(item.expression));
    if (!explods.length) continue;
    const record = makeRecord(text, 'cns', section.start, section.end, map);
    if (types.length !== 1) { record.available = false; record.reason = 'The controller has duplicate or ambiguous type declarations.'; }
    records.push(record);
  }
  return records;
}
function zssRecords(text, masked) {
  const records = [], pattern = /\bExplod\b\s*\{/gi; let match;
  while ((match = pattern.exec(masked))) {
    const open = masked.indexOf('{', match.index), close = matchingBrace(masked, open), end = close < 0 ? masked.length : close + 1;
    records.push(makeRecord(text, 'zss', match.index, end, fields(text, masked, open + 1, close < 0 ? masked.length : close, ':', 'zss'), { incomplete: close < 0, redirectPrefix: redirectedBefore(masked, match.index) }));
    pattern.lastIndex = Math.max(pattern.lastIndex, end);
  }
  return records;
}
function parseExplodAnimationReferences(text, syntax) {
  const source = String(text || ''), grammar = syntax === 'zss' ? 'zss' : 'cns', masked = maskSource(source, grammar);
  return grammar === 'zss' ? zssRecords(source, masked) : cnsRecords(source, masked);
}

module.exports = { parseExplodAnimationReferences };
