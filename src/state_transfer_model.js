'use strict';

const path = require('path');
const { enabledCapabilityIds } = require('./catalog_capability_filter');

const DESTINATION_CONTROLLERS = new Set(['changestate', 'targetstate', 'runstate']);
const DEFERRED_CONTROLLERS = new Set(['selfstate', 'helper']);
const HIT_CONTROLLERS = new Set(['hitdef', 'reversaldef']);
const EXACT_CHARACTER_CONTROLLERS = new Set(['changestate', 'helper']);
const STATE_TRANSFER_PROVENANCE = Object.freeze({
  repository: 'ikemen-engine/Ikemen-GO',
  branch: 'develop',
  commit: 'b464672651c87c42aeca10bb5c33003f26d42071',
  semantics: Object.freeze({
    changeState: 'current StateBytecode.playerNo',
    selfState: 'recipient own/readplayerid',
    targetState: 'current state owner except -2/-4 executor own/own-player',
    runState: 'recipient current player unless playerno overrides the source character catalog',
    redirectedHelper: 'recipient own',
    negativeTransfer: 'stateChange1 logs and clamps destination to >= 0'
  })
});

function grammarFor(filename, languageId = '') {
  if (languageId === 'ikemen-cns' || /\.(?:cns|cmd|st)$/i.test(String(filename || ''))) return 'cns';
  return 'zss';
}

function maskSource(text, grammar) {
  const source = String(text || ''), output = source.split('');
  let quote = '', escaped = false, comment = false;
  for (let index = 0; index < source.length; index += 1) {
    const value = source[index];
    if (comment) {
      if (value === '\n' || value === '\r') comment = false;
      else output[index] = ' ';
      continue;
    }
    if (quote) {
      if (value !== '\n' && value !== '\r') output[index] = ' ';
      if (escaped) escaped = false;
      else if (value === '\\') escaped = true;
      else if (value === quote) quote = '';
      continue;
    }
    if (value === '"' || value === "'") { quote = value; output[index] = ' '; continue; }
    if ((grammar === 'zss' && value === '#') || (grammar === 'cns' && value === ';')) { comment = true; output[index] = ' '; }
  }
  return output.join('');
}

function lineStarts(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) if (text[index] === '\n') starts.push(index + 1);
  return starts;
}

function positionAt(starts, offset) {
  let low = 0, high = starts.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (starts[middle] <= offset) low = middle + 1; else high = middle - 1;
  }
  const line = Math.max(0, high);
  return { line, character: Math.max(0, offset - starts[line]) };
}

function ranged(starts, start, end) {
  const from = positionAt(starts, start), to = positionAt(starts, end);
  return { start, end, line: from.line, character: from.character, endLine: to.line, endCharacter: to.character };
}

function literalExpression(masked, expressionStart, expressionEnd) {
  const raw = masked.slice(expressionStart, expressionEnd), leading = /^\s*/.exec(raw)?.[0].length || 0;
  const trimmed = raw.trim(), match = /^([+-]?\d+)\s*$/.exec(trimmed);
  if (!match) return { literal: null, dynamic: true, expression: trimmed, start: expressionStart + leading, end: expressionEnd - (/\s*$/.exec(raw)?.[0].length || 0) };
  const tokenStart = expressionStart + leading + trimmed.indexOf(match[1]);
  return { literal: Number(match[1]), dynamic: false, expression: match[1], start: tokenStart, end: tokenStart + match[1].length };
}

function matchingBrace(masked, open) {
  let depth = 0;
  for (let index = open; index < masked.length; index += 1) {
    if (masked[index] === '{') depth += 1;
    else if (masked[index] === '}' && --depth === 0) return index;
  }
  return -1;
}

function redirectedBefore(masked, offset) {
  const boundary = Math.max(masked.lastIndexOf('\n', offset - 1), masked.lastIndexOf(';', offset - 1), masked.lastIndexOf('{', offset - 1), masked.lastIndexOf('}', offset - 1));
  return /,\s*$/.test(masked.slice(boundary + 1, offset));
}

function bodyFieldMap(masked, bodyStart, bodyEnd, separator) {
  const body = masked.slice(bodyStart, bodyEnd);
  const expression = new RegExp(`(?:^|[;\\r\\n])[ \\t]*([A-Za-z_][A-Za-z0-9_]*)[ \\t]*${separator}[ \\t]*([^\\r\\n;}]*)`, 'gim');
  const output = new Map();
  let match;
  while ((match = expression.exec(body))) {
    const relative = match[0].lastIndexOf(match[2]), start = bodyStart + match.index + relative, end = start + match[2].length;
    const key = match[1].toLowerCase();
    if (!output.has(key)) output.set(key, []);
    output.get(key).push({ start, end, parsed: literalExpression(masked, start, end) });
  }
  return output;
}

function ownerContexts(masked, starts, grammar) {
  const output = [];
  for (const declaration of stateDeclarations(masked, starts)) output.push({ at: declaration.start, kind: 'statedef', value: declaration.value, dynamic: declaration.dynamic, expression: declaration.expression });
  if (grammar === 'zss') {
    const functions = /\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/ig; let match;
    while ((match = functions.exec(masked))) output.push({ at: match.index, kind: 'function', name: match[1] });
  }
  return output.sort((left, right) => left.at - right.at);
}

function ownerAt(contexts, offset) {
  let owner = null;
  for (const candidate of contexts) { if (candidate.at > offset) break; owner = candidate; }
  return owner ? { ...owner } : { kind: 'file' };
}

function fixedExecutorOwner(owner) {
  return owner?.kind === 'statedef' && (owner.value === -2 || owner.value === -4);
}

function usesCharacterCatalog(record) {
  if (!record || record.redirected || record.ambiguous) return false;
  if (EXACT_CHARACTER_CONTROLLERS.has(record.kind)) return true;
  if (record.kind === 'runstate') return record.playerNoOverride !== true;
  if (record.kind === 'targetstate') return record.compileOwner === 'current-state-owner' || record.compileOwner === 'executor-own/own-player';
  return record.kind === 'selfstate' && record.compileOwner === 'executor-own/own-player';
}

function zssStructuralValidity(masked) {
  const anchors = [0], header = /^(?:[ \t]*\[\s*StateDef\b|[ \t]*function\s+[A-Za-z_][A-Za-z0-9_]*\s*\()/gim;
  let match;
  while ((match = header.exec(masked))) if (match.index && anchors[anchors.length - 1] !== match.index) anchors.push(match.index);
  const segments = [];
  for (let index = 0; index < anchors.length; index += 1) {
    const start = anchors[index], end = anchors[index + 1] ?? masked.length, stack = [], unmatchedClose = [];
    for (let offset = start; offset < end; offset += 1) {
      if (masked[offset] === '{') stack.push(offset);
      else if (masked[offset] === '}') { if (stack.length) stack.pop(); else unmatchedClose.push(offset); }
    }
    segments.push({ start, end, unmatchedOpen: stack, unmatchedClose });
  }
  return offset => {
    const segment = segments.find(item => offset >= item.start && offset < item.end) || segments.at(-1);
    return !segment || segment.unmatchedOpen.length === 0 && segment.unmatchedClose.length === 0;
  };
}

function zssTransfers(masked, starts) {
  const output = [], contexts = ownerContexts(masked, starts, 'zss'), structurallyValidAt = zssStructuralValidity(masked), controller = /\b(ChangeState|TargetState|SelfState|RunState|Helper|HitDef|ReversalDef)\b\s*\{/ig;
  let match;
  while ((match = controller.exec(masked))) {
    const name = match[1], folded = name.toLowerCase(), open = masked.indexOf('{', match.index); let close = matchingBrace(masked, open), malformed = close < 0, structurallyInvalid = !structurallyValidAt(match.index);
    if (malformed) {
      const recovery = /^(?:\s*\[\s*StateDef\b|\s*function\s+[A-Za-z_])/gim;
      recovery.lastIndex = open + 1; const boundary = recovery.exec(masked); close = boundary ? boundary.index : masked.length;
    }
    const bodyStart = open + 1, fieldsByName = bodyFieldMap(masked, bodyStart, close, ':'), redirectFields = fieldsByName.get('redirectid') || [], playerNoFields = fieldsByName.get('playerno') || [];
    const specifications = HIT_CONTROLLERS.has(folded) ? ['p1StateNo', 'p2StateNo'] : [folded === 'helper' ? 'stateNo' : 'value'];
    for (const fieldName of specifications) {
      const fields = fieldsByName.get(fieldName.toLowerCase()) || [];
      if (!fields.length && !HIT_CONTROLLERS.has(folded)) {
        output.push({ controller: name, kind: folded, role: folded==='helper'?'character-helper-state':DEFERRED_CONTROLLERS.has(folded) ? 'deferred-recipient-state' : 'destination-state', literal: null, dynamic: true, ambiguous: malformed || structurallyInvalid || redirectFields.length > 1, malformed, structurallyInvalid, redirected: redirectedBefore(masked, match.index) || redirectFields.length > 0, owner: ownerAt(contexts, match.index), controllerStart: match.index, controllerEnd: close + 1 });
        continue;
      }
      if (!fields.length) continue;
      const field = fields[0], ambiguous = malformed || structurallyInvalid || fields.length > 1 || redirectFields.length > 1 || folded === 'runstate' && playerNoFields.length > 1, value = field.parsed, range = ranged(starts, value.start, value.end);
      const role = HIT_CONTROLLERS.has(folded) ? 'deferred-hit-state' : folded==='helper'?'character-helper-state':DEFERRED_CONTROLLERS.has(folded) ? 'deferred-recipient-state' : 'destination-state';
      const owner = ownerAt(contexts, match.index);
      const compileOwner = folded === 'targetstate' && fixedExecutorOwner(owner) ? 'executor-own/own-player' : folded === 'targetstate' && owner.kind === 'statedef' ? 'current-state-owner' : folded === 'targetstate' ? 'unknown' : folded === 'changestate' ? 'state-bytecode-player' : folded === 'runstate' && playerNoFields.length ? 'explicit-playerno' : folded === 'runstate' ? 'recipient-current-player' : folded === 'selfstate' && fixedExecutorOwner(owner) ? 'executor-own/own-player' : folded === 'selfstate' ? 'recipient-own/readplayerid' : 'recipient-own';
      output.push({ ...range, controller: name, kind: folded, role, compileOwner, playerNoOverride: folded === 'runstate' && playerNoFields.length > 0, field: fieldName.toLowerCase(), literal: ambiguous ? null : value.literal, dynamic: ambiguous || value.dynamic, ambiguous, malformed, structurallyInvalid, expression: value.expression, redirected: redirectedBefore(masked, match.index) || redirectFields.length > 0, owner, controllerStart: match.index, controllerEnd: close + 1 });
    }
    controller.lastIndex = close + 1;
  }
  return output;
}

function cnsSections(masked) {
  // Keep the anchor horizontal. In multiline mode, `\s` also consumes line
  // breaks and makes a failed match retry across the remainder of large files.
  const matches = [], header = /^[ \t]*\[([^\]\r\n]+)\]/gim;
  let match;
  while ((match = header.exec(masked))) matches.push({ header: match[1].trim(), start: match.index, headerStart: match.index + match[0].indexOf(match[1]), headerEnd: match.index + match[0].indexOf(match[1]) + match[1].length, bodyStart: header.lastIndex });
  return matches.map((item, index) => ({ ...item, end: matches[index + 1]?.start ?? masked.length }));
}

function cnsTransfers(masked, starts) {
  const output = [], allSections = cnsSections(masked); let owner = { kind: 'file' };
  for (const section of allSections) {
    const stateOwner = /^statedef\s+(.+)$/i.exec(section.header);
    if (stateOwner) { const parsed = literalExpression(masked, section.headerStart + section.header.toLowerCase().indexOf('statedef') + 8, section.headerEnd); owner = { kind: 'statedef', value: parsed.literal, dynamic: parsed.dynamic, expression: parsed.expression }; continue; }
    if (!/^state(?:\s|$)/i.test(section.header) || /^statedef\b/i.test(section.header)) continue;
    const fieldsByName = bodyFieldMap(masked, section.bodyStart, section.end, '='), typeFields = fieldsByName.get('type') || [];
    if (typeFields.length !== 1) { if (typeFields.length > 1) output.push({ controller: 'Ambiguous', kind: 'ambiguous', role: 'unknown', ambiguous: true, dynamic: true, owner: { ...owner }, controllerStart: section.start, controllerEnd: section.end }); continue; }
    const rawType = masked.slice(typeFields[0].parsed.start, typeFields[0].parsed.end).trim(), folded = rawType.toLowerCase();
    if (![...DESTINATION_CONTROLLERS, ...DEFERRED_CONTROLLERS, ...HIT_CONTROLLERS].includes(folded)) continue;
    const name = rawType, redirectFields = fieldsByName.get('redirectid') || [], playerNoFields = fieldsByName.get('playerno') || [];
    const specifications = HIT_CONTROLLERS.has(folded) ? ['p1StateNo', 'p2StateNo'] : [folded === 'helper' ? 'stateNo' : 'value'];
    for (const fieldName of specifications) {
      const fields = fieldsByName.get(fieldName.toLowerCase()) || [];
      if (!fields.length && !HIT_CONTROLLERS.has(folded)) { output.push({ controller: name, kind: folded, role: folded==='helper'?'character-helper-state':DEFERRED_CONTROLLERS.has(folded) ? 'deferred-recipient-state' : 'destination-state', literal: null, dynamic: true, ambiguous: redirectFields.length > 1, redirected: redirectFields.length > 0, owner: { ...owner }, controllerStart: section.start, controllerEnd: section.end }); continue; }
      if (!fields.length) continue;
      const field = fields[0], ambiguous = fields.length > 1 || redirectFields.length > 1 || folded === 'runstate' && playerNoFields.length > 1, value = field.parsed, range = ranged(starts, value.start, value.end);
      const role = HIT_CONTROLLERS.has(folded) ? 'deferred-hit-state' : folded==='helper'?'character-helper-state':DEFERRED_CONTROLLERS.has(folded) ? 'deferred-recipient-state' : 'destination-state';
      const compileOwner = folded === 'targetstate' && fixedExecutorOwner(owner) ? 'executor-own/own-player' : folded === 'targetstate' && owner.kind === 'statedef' ? 'current-state-owner' : folded === 'targetstate' ? 'unknown' : folded === 'changestate' ? 'state-bytecode-player' : folded === 'runstate' && playerNoFields.length ? 'explicit-playerno' : folded === 'runstate' ? 'recipient-current-player' : folded === 'selfstate' && fixedExecutorOwner(owner) ? 'executor-own/own-player' : folded === 'selfstate' ? 'recipient-own/readplayerid' : 'recipient-own';
      output.push({ ...range, controller: name, kind: folded, role, compileOwner, playerNoOverride: folded === 'runstate' && playerNoFields.length > 0, field: fieldName.toLowerCase(), literal: ambiguous ? null : value.literal, dynamic: ambiguous || value.dynamic, ambiguous, expression: value.expression, redirected: redirectFields.length > 0, owner: { ...owner }, controllerStart: section.start, controllerEnd: section.end });
    }
  }
  return output;
}

function stateDeclarations(masked, starts) {
  const output = [], expression = /^[ \t]*\[[ \t]*StateDef[ \t]+([^;\]\r\n]+)/gim;
  let match;
  while ((match = expression.exec(masked))) {
    const relative = match[0].indexOf(match[1]), start = match.index + relative, parsed = literalExpression(masked, start, start + match[1].length);
    const range = ranged(starts, parsed.start, parsed.end);
    output.push({ ...range, value: parsed.literal, dynamic: parsed.dynamic, expression: parsed.expression });
  }
  return output;
}

function parseStateSource(text, filename = '', languageId = '', options = {}) {
  const grammar = grammarFor(filename, languageId), source = String(text || ''), masked = maskSource(source, grammar), starts = lineStarts(source);
  const declarations = stateDeclarations(masked, starts), parsedTransfers = grammar === 'cns' ? cnsTransfers(masked, starts) : zssTransfers(masked, starts);
  const runStateEnabled = enabledCapabilityIds(options.capabilities || options).has('zss.run-state');
  const transfers = parsedTransfers.filter((record) => record.kind !== 'runstate' || runStateEnabled);
  return { filename: filename ? path.resolve(filename) : '', grammar, declarations, transfers };
}

function itemAt(items, line, character) {
  return items.find(item => item.line === line && character >= item.character && character <= item.endCharacter);
}

function stateSymbolAt(text, filename, languageId, line, character, options = {}) {
  const parsed = parseStateSource(text, filename, languageId, options), declaration = itemAt(parsed.declarations, line, character);
  if (declaration && !declaration.dynamic) return { type: 'declaration', value: declaration.value, record: declaration };
  const reference = itemAt(parsed.transfers, line, character);
  if (reference && !reference.dynamic && reference.literal >= 0 && usesCharacterCatalog(reference)) return { type: 'reference', value: reference.literal, record: reference };
  return null;
}

function stateDestinationContext(text, filename, languageId, line, character, options = {}) {
  const grammar = grammarFor(filename, languageId), source = String(text || ''), starts = lineStarts(source), offset = (starts[line] || 0) + character;
  const parsed = parseStateSource(source, filename, languageId, options);
  const record = parsed.transfers.find(item => (DESTINATION_CONTROLLERS.has(item.kind)||item.kind==='helper'||item.kind==='selfstate') && !item.redirected && !item.ambiguous && Number.isInteger(item.start) && offset >= item.start && offset <= item.end);
  if (!record || (record.dynamic && record.expression !== '') || !usesCharacterCatalog(record)) return null;
  return { grammar, controller: record.kind, line: record.line, start: record.character, end: record.endCharacter, prefix: source.slice(record.start, offset) };
}

module.exports = { DEFERRED_CONTROLLERS, DESTINATION_CONTROLLERS, EXACT_CHARACTER_CONTROLLERS, STATE_TRANSFER_PROVENANCE, grammarFor, maskSource, parseStateSource, stateDestinationContext, stateSymbolAt, usesCharacterCatalog };
