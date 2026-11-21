'use strict';

const { maskSource } = require('./state_transfer_model');
const { topLevelArguments, withoutComment, withoutLegacyComment } = require('./analyzer');

const MAX_SOURCE_BYTES = 1024 * 1024;
const MAX_SITES_PER_ROLE = 24;
const MAX_RUN_STATE_CALLS = 2048;
const MIN_INT32 = -2147483648;
const VARIABLE_FIELDS = Object.freeze({ v: 'var', fv: 'fvar', sysv: 'sysvar', sysfv: 'sysfvar' });
const EFFECT_CONTROLLERS = Object.freeze({
  helper: ['helper', 'id', 'spawn'], explod: ['explod', 'id', 'spawn'], projectile: ['projectile', 'projid', 'spawn'],
  modifyexplod: ['explod', 'id', 'write'], explodbindtime: ['explod', 'id', 'write'], removeexplod: ['explod', 'id', 'write']
});
const TRACE_EFFECT_CONTROLLERS = Object.freeze({ modifyprojectile: ['projectile', 'id', 'write'] });
const TRACE_CONTROLLERS = new Set(['runstate', 'varrandom', 'destroyself', ...Object.keys(TRACE_EFFECT_CONTROLLERS)]);
const READ_TRIGGERS = Object.freeze({
  helper: 'helper', numhelper: 'helper', numexplod: 'explod', numprojid: 'projectile',
  projcontacttime: 'projectile', projguardedtime: 'projectile', projhittime: 'projectile', projcanceltime: 'projectile'
});
const VARIABLE = /^(?:var|fvar|sysvar|sysfvar)$/;
const VAR_CONTROLLER = /^(?:parent|root)?var(?:set|add)$/;
const MAP_CONTROLLER = /^(?:parent|root|team)?map(?:set|add)$/;
const REDIRECT_PREFIX = /\b(?:parent|root|partner|p2|stateowner|enemy(?:near)?|target|helper(?:index)?|player(?:id|index)?)\s*(?:\([^{};]*\))?\s*,[^{};]*$/i;

function literalInteger(value, signed = false) {
  if (!/^[+-]?\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= (signed ? -2147483648 : 0) && number <= 2147483647 ? number : null;
}

function literalMapKey(value, quotedOnly = false) {
  if (!quotedOnly && /^[a-z_][a-z0-9_.]*$/i.test(value)) return value.toLowerCase();
  const literal = /^"([^"\\\r\n]*)"$/.exec(value);
  return literal?.[1] ? literal[1].toLowerCase() : null;
}

function bracketPairs(masked) {
  const pairs = new Int32Array(masked.length), stack = [];
  const openerFor = { ')': '(', '}': '{', ']': '[' };
  for (let offset = 0; offset < masked.length; offset++) {
    const token = masked[offset];
    if (token === '(' || token === '{' || token === '[') stack.push(offset);
    if (Object.hasOwn(openerFor, token)) {
      if (masked[stack.at(-1)] === openerFor[token]) pairs[stack.pop()] = offset + 1;
      else stack.length = 0;
    }
  }
  return pairs;
}

function sourcePosition(lineStarts, offset) {
  let lo = 0, hi = lineStarts.length - 1;
  while (lo <= hi) {
    const middle = (lo + hi) >> 1;
    if (lineStarts[middle] <= offset) lo = middle + 1;
    else hi = middle - 1;
  }
  return [hi + 1, offset - lineStarts[hi] + 1];
}

function controllerFields(masked, text, pairs, start, end, language) {
  const body = masked.slice(start, end), fields = [], delimiter = language === 'cns' ? '=' : ':';
  const removeComment = language === 'cns' ? withoutLegacyComment : withoutComment;
  const names = language === 'cns' ? /(?:^|[\r\n])[ \t]*([A-Za-z_][A-Za-z0-9_.]*)/g :
    /(?:^|;)[ \t\r\n]*([A-Za-z_][A-Za-z0-9_.]*)/g;
  const fieldEnd = language === 'cns' ? /[;\r\n]/ : /[;}]/;
  for (const match of body.matchAll(names)) {
    const name = match[1].toLowerCase(), nameStart = start + match.index + match[0].length - match[1].length;
    let position = nameStart + name.length;
    while (position < end && /\s/.test(masked[position]) && (language === 'zss' || !/[\r\n]/.test(masked[position]))) position++;
    let callEnd;
    if (language === 'cns' && masked[position] === '(' && (VARIABLE.test(name) || name === 'map')) {
      callEnd = pairs[position];
      if (!callEnd || callEnd > end) continue;
      position = callEnd;
      while (/[ \t]/.test(masked[position] || '')) position++;
    }
    if (masked[position] !== delimiter) continue;
    const valueStart = position + 1;
    let valueEnd = valueStart;
    while (valueEnd < end && !fieldEnd.test(masked[valueEnd])) valueEnd++;
    const value = text.slice(valueStart, valueEnd).split(/\r\n|\r|\n/).map(removeComment).join('\n').trim();
    fields.push({ name, nameStart, callEnd, value, valueStart, valueEnd });
  }
  return fields;
}

function groupFields(fields) {
  const result = new Map();
  for (const field of fields) {
    if (!result.has(field.name)) result.set(field.name, []);
    result.get(field.name).push(field);
  }
  return result;
}

function* controllerBlocks(masked, text, pairs, language, stateTrace = false) {
  if (language === 'cns') {
    const headers = [...masked.matchAll(/^[ \t]*\[([^\]\r\n]+)\]/gm)];
    for (let index = 0; index < headers.length; index++) {
      const header = headers[index];
      if (!/^\s*state(?:\s|,)/i.test(header[1])) continue;
      const fields = controllerFields(masked, text, pairs, header.index + header[0].length, headers[index + 1]?.index ?? text.length, language);
      const types = fields.filter(field => field.name === 'type');
      const type = types.find(field => {
        const name = field.value.toLowerCase();
        return VAR_CONTROLLER.test(name) || MAP_CONTROLLER.test(name) || name === 'varrangeset' ||
          Object.hasOwn(EFFECT_CONTROLLERS, name) || stateTrace && TRACE_CONTROLLERS.has(name);
      });
      if (type) yield { name: type.value.toLowerCase(), start: type.nameStart, end: type.valueEnd, fields, ambiguous: types.length !== 1 };
    }
    return;
  }
  const names = '((?:(?:parent|root|team)?(?:var|map)(?:set|add))|varrangeset|helper|explod|projectile|modifyexplod|explodbindtime|removeexplod' +
    (stateTrace ? '|' + [...TRACE_CONTROLLERS].join('|') : '') + ')';
  const definitions = new RegExp(`\\b${names}[ \\t]*\\{`, 'gi');
  for (let match = definitions.exec(masked); match; match = definitions.exec(masked)) {
    const open = match.index + match[0].length - 1, close = pairs[open] - 1;
    yield { name: match[1].toLowerCase(), start: match.index, end: open, close, ambiguous: close < open,
      fields: close > open ? controllerFields(masked, text, pairs, open + 1, close, language) : [] };
    if (close > open) definitions.lastIndex = close + 1;
  }
}

function sourceLineStarts(text) {
  const starts = [0];
  for (let offset = 0; offset < text.length; offset++) {
    if (text[offset] === '\n' || text[offset] === '\r' && text[offset + 1] !== '\n') starts.push(offset + 1);
  }
  return starts;
}

function recipientUncertain(masked, starts, language, start) {
  const [line] = sourcePosition(starts, start), lookback = Math.max(0, start - 512);
  const rawPrefix = masked.slice(language === 'cns' ? Math.max(starts[line - 1], lookback) : lookback, start);
  const boundary = Math.max(rawPrefix.lastIndexOf('{'), rawPrefix.lastIndexOf('}'), rawPrefix.lastIndexOf(';'), rawPrefix.lastIndexOf(']'));
  const clipped = lookback > (language === 'cns' ? starts[line - 1] : 0) && boundary < 0;
  return clipped || REDIRECT_PREFIX.test(rawPrefix.slice(boundary + 1));
}

function inspectWatchStates({ text, language }) {
  const masked = maskSource(text, language), pairs = bracketPairs(masked), starts = sourceLineStarts(text);
  const boundaries = [], declarations = [], calls = [];
  const headers = /^[ \t]*\[([^\]\r\n]+)\]/gm;
  for (const header of masked.matchAll(headers)) {
    if (language === 'cns' && /^\s*state(?:\s|,)/i.test(header[1])) continue;
    const label = language === 'zss' ? header[1].split(';', 1)[0] : header[1];
    const number = /^\s*statedef\s+([+-]?\d+)\s*$/i.exec(label)?.[1];
    const stateNo = number === '+1' ? -10 : literalInteger(number || '', true);
    const declaration = stateNo === null ? null : { stateNo, offset: header.index };
    boundaries.push({ offset: header.index, declaration });
    if (declaration) declarations.push(declaration);
  }
  function stateAt(offset) {
    let lo = 0, hi = boundaries.length - 1;
    while (lo <= hi) {
      const middle = (lo + hi) >> 1;
      if (boundaries[middle].offset <= offset) lo = middle + 1;
      else hi = middle - 1;
    }
    return boundaries[hi]?.declaration ?? null;
  }
  let omittedCalls = 0;
  for (const block of controllerBlocks(masked, text, pairs, language, true)) {
    if (block.name !== 'runstate') continue;
    const caller = stateAt(block.start);
    if (!caller) continue;
    if (calls.length >= MAX_RUN_STATE_CALLS) { omittedCalls++; continue; }
    const fields = groupFields(block.fields);
    const target = literalInteger(fields.get('value')?.[0]?.value || '', true);
    const reason = block.ambiguous || fields.get('value')?.length !== 1 ||
      (language === 'zss' && stateAt(block.close) !== caller) ? 'RunState parameters or source boundaries are ambiguous.' :
      fields.has('playerno') ? 'RunState has an explicit code provider.' :
        fields.has('redirectid') || language === 'zss' && recipientUncertain(masked, starts, language, block.start) ?
          'RunState uses a runtime recipient.' : target === null ? 'RunState target is dynamic.' :
            target === MIN_INT32 ? 'This RunState value is the engine’s no-call sentinel.' : '';
    calls.push({ caller: caller.stateNo, target, line: sourcePosition(starts, block.start)[0], reason });
  }
  return { declarations, calls, omittedCalls, stateAt };
}

function retainCandidate(sites, site, limit) {
  if (sites.length < limit) { sites.push(site); return false; }
  if (site.rank === undefined) return true;
  const count = new Map();
  for (const kept of sites) count.set(kept.rank, (count.get(kept.rank) || 0) + 1);
  let replace = -1;
  for (let index = sites.length - 1; index >= 0; index--) {
    const kept = sites[index];
    if (count.get(kept.rank) < 2 || count.has(site.rank) && kept.rank <= site.rank) continue;
    if (replace < 0 || kept.rank > sites[replace].rank) replace = index;
  }
  // Keep a representative of each populated tier when the result reaches its limit.
  if (replace >= 0) { sites.splice(replace, 1); sites.push(site); }
  return true;
}

function watchIdentity(row) {
  if (VARIABLE.test(row.kind)) return Number.isInteger(row.key) ? { key: row.key, mapIndex: null } : null;
  if (row.kind === 'map') return typeof row.key === 'string' ? { key: row.key, mapIndex: row.mapIndex ?? null } : null;
  return Number.isInteger(row.authoredId) ? { key: row.authoredId, mapIndex: null } : null;
}

function scanWatchSource({ text, filename, language }, row, trace) {
  const groups = { write: [], spawn: [], read: [], unresolved: [] };
  const identity = watchIdentity(row);
  if (!identity) return { ...groups, omitted: 0, reason: 'This observation has no source-searchable key or authored ID.' };
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_SOURCE_BYTES || !['cns', 'zss'].includes(language)) {
    return { ...groups, omitted: 1, reason: 'Source exceeds the scan limit or has an unsupported dialect.' };
  }
  const masked = maskSource(text, language), pairs = bracketPairs(masked), starts = sourceLineStarts(text);
  const targetCalls = new Set();
  let omitted = 0;
  function add(kind, role, key, mapIndex, start, end, label, reason = '', unresolvedIndex = false) {
    if (kind !== row.kind || key !== null && key !== identity.key || !unresolvedIndex && mapIndex !== identity.mapIndex) return;
    const bucket = reason ? 'unresolved' : role;
    const [line, column] = sourcePosition(starts, start), [endLine, endColumn] = sourcePosition(starts, end);
    const rank = trace && bucket !== 'read' && role !== 'read' ? trace.rankAt(start, Boolean(reason)) : undefined;
    const site = { role, grade: reason ? 'unresolved' : 'candidate', filename, line, column, endLine, endColumn, label, reason, ...rank };
    if (retainCandidate(groups[bucket], site, MAX_SITES_PER_ROLE)) omitted++;
  }

  function callTarget(name, start, end, legacyMapAssignment = false) {
    if (end - start > 2048) return { key: null, mapIndex: null, unresolvedIndex: name === 'map' };
    const open = masked.indexOf('(', start);
    const args = topLevelArguments(text.slice(open + 1, end - 1));
    if (name !== 'map') return { key: args.length === 1 ? literalInteger(args[0]) : null, mapIndex: null, unresolvedIndex: false };
    const rawKey = args[0] || '';
    const key = legacyMapAssignment && rawKey.startsWith('"') ? null : literalMapKey(rawKey);
    const mapIndex = args.length === 2 ? literalInteger(args[1], true) : null;
    return { key, mapIndex, unresolvedIndex: args.length > 1 && (args.length !== 2 || mapIndex === null) };
  }

  for (const block of controllerBlocks(masked, text, pairs, language, Boolean(trace))) {
    const fields = groupFields(block.fields), first = key => fields.get(key)?.[0];
    const relevant = block.fields.filter(field => field.callEnd || Object.hasOwn(VARIABLE_FIELDS, field.name));
    const redirect = /^(?:parent|root|team)/.test(block.name) || fields.has('redirectid') ||
      language === 'zss' && recipientUncertain(masked, starts, language, block.start);
    const unresolved = block.ambiguous ? 'Ambiguous controller parameters.' : redirect ? 'Recipient is resolved at runtime.' : '';
    if (VAR_CONTROLLER.test(block.name)) {
      const variables = relevant.filter(field => VARIABLE.test(field.name) || Object.hasOwn(VARIABLE_FIELDS, field.name));
      for (const field of variables) {
        if (field.callEnd) targetCalls.add(field.nameStart);
        const kind = VARIABLE_FIELDS[field.name] || field.name;
        const key = field.callEnd ? callTarget(kind, field.nameStart, field.callEnd).key : literalInteger(field.value);
        const valueCount = fields.get('value')?.length || 0;
        const reason = unresolved || (variables.length !== 1 ? 'The controller has multiple variable targets.' :
          !field.value || !field.callEnd && valueCount !== 1 ? 'The controller value is missing or ambiguous.' : key === null ? 'Variable index is dynamic.' : '');
        add(kind, 'write', key, null, field.nameStart, field.callEnd || field.valueEnd, block.name, reason);
      }
    } else if (MAP_CONTROLLER.test(block.name)) {
      const targets = fields.get('map') || [];
      for (const field of targets) {
        if (field.callEnd) targetCalls.add(field.nameStart);
        const indexField = first('index');
        const value = masked.slice(field.valueStart, field.valueEnd);
        const nestedTarget = /^[ \t]*map[ \t]*\(/i.exec(value);
        const nestedStart = nestedTarget ? field.valueStart + nestedTarget[0].search(/map/i) : -1;
        const nestedEnd = nestedTarget ? pairs[field.valueStart + nestedTarget[0].length - 1] : 0;
        const nestedAssignment = nestedEnd && nestedEnd < field.valueEnd && /^[ \t]*(?::=|=)/.test(masked.slice(nestedEnd, field.valueEnd));
        if (nestedAssignment) targetCalls.add(nestedStart);
        const explicitIndex = indexField ? literalInteger(indexField.value, true) : null;
        const target = field.callEnd ? callTarget('map', field.nameStart, field.callEnd, true) : nestedAssignment ? callTarget('map', nestedStart, nestedEnd) : {
          key: literalMapKey(field.value, true), mapIndex: explicitIndex, unresolvedIndex: Boolean(indexField) && explicitIndex === null
        };
        const reason = unresolved || (targets.length > 1 || (fields.get('index')?.length || 0) > 1 ? 'The controller has multiple Map targets or indexes.' :
          target.key === null || target.unresolvedIndex ? 'Map key or index is dynamic.' :
            !field.callEnd && !nestedAssignment && fields.get('value')?.length !== 1 ? 'The Map value is missing or ambiguous.' : '');
        add('map', 'write', target.key, target.mapIndex, field.nameStart, field.callEnd || field.valueEnd, block.name, reason, target.unresolvedIndex === true);
      }
    } else if (block.name === 'varrangeset' && (row.kind === 'var' || row.kind === 'fvar')) {
      const firstIndex = first('first'), lastIndex = first('last'), field = first(row.kind === 'var' ? 'value' : 'fvalue');
      if (field) {
        const low = literalInteger(firstIndex?.value || ''), high = literalInteger(lastIndex?.value || '');
        const reason = unresolved || (low === null || high === null || high < low ? 'Variable range is dynamic or implicit.' : '');
        if (reason || identity.key >= low && identity.key <= high) add(row.kind, 'write', identity.key, null, block.start, block.end, block.name, reason);
      }
    } else if (block.name === 'varrandom' && row.kind === 'var') {
      const field = first('v'), key = literalInteger(field?.value || '');
      const reason = unresolved || (fields.get('v')?.length !== 1 || (fields.get('range')?.length || 0) > 1 ?
        'VarRandom parameters are missing or ambiguous.' : key === null ? 'Variable index is dynamic.' : '');
      add('var', 'write', key, null, field?.nameStart ?? block.start, field?.valueEnd ?? block.end, block.name, reason);
    } else if (block.name === 'destroyself' && (row.kind === 'helper' || row.kind === 'explod' && fields.has('removeexplods'))) {
      add(row.kind, 'write', null, null, block.start, block.end, block.name,
        unresolved || 'The affected helper or Explod identity depends on runtime context.');
    } else if (Object.hasOwn(EFFECT_CONTROLLERS, block.name) || trace && Object.hasOwn(TRACE_EFFECT_CONTROLLERS, block.name)) {
      const [kind, idParameter, role] = EFFECT_CONTROLLERS[block.name] || TRACE_EFFECT_CONTROLLERS[block.name], field = first(idParameter);
      const key = literalInteger(field?.value || '');
      const reason = unresolved || ((fields.get(idParameter)?.length || 0) > 1 ? 'The controller has multiple authored IDs.' : key === null ? 'Authored ID is dynamic or omitted.' : '');
      add(kind, role, key, null, field?.nameStart ?? block.start, field?.valueEnd ?? block.end, block.name, reason);
    }
  }

  const calls = /\b(var|fvar|sysvar|sysfvar|map|helper|numhelper|numexplod|numprojid|projcontacttime|projguardedtime|projhittime|projcanceltime)[ \t]*\(/gi;
  const expressions = masked.replace(/^[ \t]*\[[^\r\n]*/gm, header => ' '.repeat(header.length));
  for (const match of expressions.matchAll(calls)) {
    const start = match.index, end = pairs[start + match[0].length - 1], name = match[1].toLowerCase();
    if (!end || targetCalls.has(start)) continue;
    const kind = READ_TRIGGERS[name] || name;
    if (kind !== row.kind) continue;
    const target = callTarget(name, start, end), after = masked.slice(end, end + 512);
    const operator = language === 'zss' ? /^\s*(:=|\+=)/.exec(after) : /^[ \t]*(:=|\+=)/.exec(after);
    const role = !READ_TRIGGERS[name] && operator ? 'write' : 'read';
    const redirect = recipientUncertain(masked, starts, language, start);
    const reason = target.key === null || target.unresolvedIndex ? 'Key, index or authored ID is dynamic.' : redirect ? 'Recipient is resolved at runtime.' :
      operator?.[1] === '+=' || after.length === 512 && !after.trim() ? 'Use of the source operand is unresolved.' : '';
    add(kind, role, target.key, target.mapIndex, start, end, name, reason, target.unresolvedIndex);
  }
  if (trace) for (const sites of [groups.write, groups.spawn]) sites.sort((left, right) => left.rank - right.rank);
  return { ...groups, omitted, reason: '' };
}

module.exports = { MAX_SOURCE_BYTES, MAX_SITES_PER_ROLE, inspectWatchStates, retainCandidate, scanWatchSource, watchIdentity };
