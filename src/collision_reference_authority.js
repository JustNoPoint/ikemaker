'use strict';

const { maskSource } = require('./state_transfer_model');

const FIELD_NAMES = new Set(['group', 'index', 'rect', 'scale', 'angle', 'pivot', 'redirectid']);
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }
function matchingBrace(masked, open) { let depth = 0; for (let at = open; at < masked.length; at += 1) { if (masked[at] === '{') depth += 1; else if (masked[at] === '}' && --depth === 0) return at; } return -1; }
function lineAt(text, offset) { return text.slice(0, offset).split(/\r?\n/).length - 1; }
function commentOffset(raw, syntax) { let quoted = false; for (let at = 0; at < raw.length; at += 1) { if (raw[at] === '"' && raw[at - 1] !== '\\') quoted = !quoted; if (!quoted && ((syntax === 'cns' && raw[at] === ';') || (syntax === 'zss' && raw[at] === '#'))) return at; } return raw.length; }
function fields(source, masked, start, end, separator, syntax) {
  const body = masked.slice(start, end), pattern = new RegExp(`(?:^|[;\\r\\n])[ \\t]*([A-Za-z_][A-Za-z0-9_.]*)[ \\t]*${separator}[ \\t]*([^\\r\\n;}]*)`, 'gim'), output = new Map(); let match;
  while ((match = pattern.exec(body))) {
    const keyAt = match[0].indexOf(match[1]), separatorAt = match[0].indexOf(separator, keyAt + match[1].length), rawStart = start + match.index + separatorAt + separator.length, rawEnd = start + match.index + match[0].length, fullRaw = source.slice(rawStart, rawEnd), raw = fullRaw.slice(0, commentOffset(fullRaw, syntax)), leading = raw.length - raw.trimStart().length, trailing = raw.length - raw.trimEnd().length;
    const item = freeze({ name: match[1], start: rawStart + leading, end: rawStart + raw.length - trailing, expression: source.slice(rawStart + leading, rawStart + raw.length - trailing) });
    const key = match[1].toLowerCase(); if (!output.has(key)) output.set(key, []); output.get(key).push(item);
  }
  return output;
}
function redirectedBefore(masked, offset) { const boundary = Math.max(masked.lastIndexOf(';', offset - 1), masked.lastIndexOf('{', offset - 1), masked.lastIndexOf('}', offset - 1)); return /,\s*$/.test(masked.slice(boundary + 1, offset)); }
function nestedBefore(masked, offset) { let depth = 0; const boundary = Math.max(masked.lastIndexOf(']', offset - 1), 0); for (let at = boundary; at < offset; at += 1) { if (masked[at] === '{') depth += 1; else if (masked[at] === '}' && depth > 0) depth -= 1; } return depth > 0; }
function numericParts(value) { const text = String(value || '').trim(); if (!text) return null; const parts = text.split(',').map(item => item.trim()); return parts.every(item => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(item)) ? parts : null; }
function staticField(item) { const value = String(item.expression || '').trim(), parts = numericParts(value); if (item.key === 'group') return /^(?:clsn1|clsn2|size|dummy|all|none)$/i.test(value) || /^[+-]?\d+$/.test(value); if (item.key === 'index') return /^[+-]?\d+$/.test(value); const bounds = { rect: [1, 4], scale: [1, 2], angle: [1, 1], pivot: [1, 2] }[item.key]; return Boolean(bounds && parts && parts.length >= bounds[0] && parts.length <= bounds[1]); }
function fieldEvidence(map) { const output = []; for (const [key, values] of map) if (FIELD_NAMES.has(key)) for (const item of values) output.push(freeze({ key, ...item })); return freeze(output.sort((a, b) => a.start - b.start)); }
function classify(kind, map, options = {}) {
  const duplicates = [...map].filter(([key, values]) => FIELD_NAMES.has(key) && values.length > 1).map(([key]) => key), redirect = (map.get('redirectid') || []).length > 0 || Boolean(options.redirectPrefix), fields = fieldEvidence(map), dynamic = fields.some(item => item.key !== 'redirectid' && item.expression && !staticField(item));
  const reason = options.incomplete ? `The ${kind} block is structurally incomplete.` : options.typeAmbiguous ? 'The controller has duplicate or ambiguous type declarations.' : duplicates.length ? `The ${kind} controller duplicates ${duplicates.join(', ')}.` : redirect ? `Redirected ${kind} ownership is unresolved.` : '';
  return { sourceExact: !options.incomplete && !options.typeAmbiguous, available: !reason, reason, redirect, fields, dynamic, conditional: Boolean(options.conditional || options.hasTriggers || dynamic) };
}
function record(text, syntax, kind, controllerStart, controllerEnd, map, options = {}) { const status = classify(kind, map, options); return freeze({ syntax, kind: kind.toLowerCase() === 'overrideclsn' ? 'overrideclsn' : 'transformclsn', label: kind, category: 'geometry-mutation', controllerStart, controllerEnd, controllerLine: lineAt(text, controllerStart), ...status }); }
function cnsRecords(text, masked) {
  const headers = [], pattern = /^[ \t]*\[([^\]\r\n]+)\]/gim; let match; while ((match = pattern.exec(masked))) headers.push({ header: match[1].trim(), start: match.index, bodyStart: pattern.lastIndex }); const output = [];
  for (let index = 0; index < headers.length; index += 1) { const section = { ...headers[index], end: headers[index + 1]?.start ?? masked.length }; if (!/^state(?:\s|$)/i.test(section.header) || /^statedef\b/i.test(section.header)) continue; const map = fields(text, masked, section.bodyStart, section.end, '=', 'cns'), types = map.get('type') || [], collision = types.filter(item => /^(?:overrideclsn|transformclsn)$/i.test(item.expression)); if (!collision.length) continue; const kind = /^overrideclsn$/i.test(collision[0].expression) ? 'OverrideClsn' : 'TransformClsn'; output.push(record(text, 'cns', kind, section.start, section.end, map, { typeAmbiguous: types.length !== 1, hasTriggers: [...map.keys()].some(key => /^trigger(?:all|\d+)$/i.test(key)) })); }
  return output;
}
function zssRecords(text, masked) {
  const output = [], pattern = /\b(OverrideClsn|TransformClsn)\b\s*\{/gi; let match; while ((match = pattern.exec(masked))) { const open = masked.indexOf('{', match.index), close = matchingBrace(masked, open), end = close < 0 ? masked.length : close + 1, map = fields(text, masked, open + 1, close < 0 ? masked.length : close, ':', 'zss'); output.push(record(text, 'zss', /^override/i.test(match[1]) ? 'OverrideClsn' : 'TransformClsn', match.index, end, map, { incomplete: close < 0, redirectPrefix: redirectedBefore(masked, match.index), conditional: nestedBefore(masked, match.index) })); pattern.lastIndex = Math.max(pattern.lastIndex, end); }
  return output;
}
function parseCollisionReferences(text, syntax) { const source = String(text || ''), grammar = syntax === 'zss' ? 'zss' : 'cns', masked = maskSource(source, grammar); return grammar === 'zss' ? zssRecords(source, masked) : cnsRecords(source, masked); }

module.exports = { FIELD_NAMES, parseCollisionReferences };
