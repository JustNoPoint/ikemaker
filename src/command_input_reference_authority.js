'use strict';

const path = require('path');
const crypto = require('crypto');
const { maskSource } = require('./state_transfer_model');

const MAX_FILES = 256;
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 16 * 1024 * 1024;
const MAX_OCCURRENCES = 4096;
const POLICY_FLAGS = new Set(['noinput', 'nohardcodedkeys', 'noaibuttonjam', 'noaicheat', 'postroundinput']);
const DIGITAL_FLAGS = new Set(['U', 'D', 'L', 'R', 'B', 'F', 'a', 'b', 'c', 'x', 'y', 'z', 's', 'd', 'w', 'm']);
const SHIFT_KEYS = new Set(['U', 'D', 'L', 'R', 'a', 'b', 'c', 'x', 'y', 'z', 's', 'd', 'w', 'm']);
const AXES = Object.freeze(['leftx', 'lefty', 'rightx', 'righty', 'lefttrigger', 'righttrigger']);
const CONTROLLERS = new Map([
  ['assertcommand', 'command-assert'], ['assertinput', 'digital-assert'], ['shiftinput', 'digital-remap'],
  ['assertanalogvector', 'analog-assert'], ['assertspecial', 'input-policy']
]);

const canonical = value => path.resolve(String(value || '')).toLowerCase();
const digest = value => crypto.createHash('sha256').update(String(value || '')).digest('hex');
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }
function lineAt(text, offset) { return String(text).slice(0, Math.max(0, offset)).split(/\r?\n/).length - 1; }
function matchingBrace(masked, open) { let depth = 0; for (let at = open; at < masked.length; at += 1) { if (masked[at] === '{') depth += 1; else if (masked[at] === '}' && --depth === 0) return at; } return -1; }
function commentOffset(raw, syntax) { let quoted = false; for (let at = 0; at < raw.length; at += 1) { if (raw[at] === '"' && raw[at - 1] !== '\\') quoted = !quoted; if (!quoted && ((syntax === 'cns' && raw[at] === ';') || (syntax === 'zss' && raw[at] === '#'))) return at; } return raw.length; }
function fields(source, masked, start, end, separator, syntax) {
  const body = masked.slice(start, end), pattern = new RegExp(`(?:^|[;\\r\\n])[ \\t]*([A-Za-z_][A-Za-z0-9_.]*)[ \\t]*${separator}[ \\t]*([^\\r\\n;}]*)`, 'gim'), output = new Map(); let match;
  while ((match = pattern.exec(body))) {
    const keyAt = match[0].indexOf(match[1]), separatorAt = match[0].indexOf(separator, keyAt + match[1].length), rawStart = start + match.index + separatorAt + separator.length, rawEnd = start + match.index + match[0].length, full = source.slice(rawStart, rawEnd), visible = full.slice(0, commentOffset(full, syntax)), leading = visible.length - visible.trimStart().length, trailing = visible.length - visible.trimEnd().length;
    const item = { name: match[1], expression: source.slice(rawStart + leading, rawStart + visible.length - trailing), start: rawStart + leading, end: rawStart + visible.length - trailing };
    const key = match[1].toLowerCase(); if (!output.has(key)) output.set(key, []); output.get(key).push(item);
  }
  return output;
}
function literalString(expression) { const match = /^\s*"((?:\\.|[^"\\])*)"\s*$/.exec(String(expression || '')); return match ? match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\') : null; }
function literalInteger(expression) { const value = String(expression || '').trim(); return /^[+-]?\d+$/.test(value) ? Number(value) : null; }
function fieldValues(map, pattern) { const result = []; for (const [key, values] of map) if (pattern.test(key)) result.push(...values.map(value => ({ key, ...value }))); return result.sort((a, b) => a.start - b.start); }
function controllerRecord(source, syntax, controller, start, end, map, options = {}) {
  const relation = CONTROLLERS.get(controller.toLowerCase()), redirect = map.get('redirectid')?.[0]?.expression || '', fields = fieldValues(map, /^(?:name|buffer\.time|redirectid|flag[2-8]?|input|output|leftx|lefty|rightx|righty|lefttrigger|righttrigger)$/i);
  let commandName = null, status = 'related', reason = '', details = [];
  if (relation === 'command-assert') {
    const names = map.get('name') || [], name = names[0]; commandName = name ? literalString(name.expression) : null;
    if (!name) { status = 'unresolved'; reason = 'The reviewed compiler requires name; random selection applies only to an explicit empty string.'; }
    else if (names.length !== 1 || commandName === null) { status = 'dynamic'; reason = names.length > 1 ? 'Duplicate name fields make the target ambiguous.' : 'The command name is a runtime string expression.'; }
    else if (commandName === '') { status = 'random'; reason = 'An empty name selects a random command family at runtime.'; }
    else status = redirect ? 'dynamic' : 'candidate';
    if (redirect && commandName) reason = 'RedirectID prevents proving that this named assertion targets the current character command family.';
    const time = map.get('buffer.time')?.[0]; details.push(`buffer.time ${time ? time.expression : '1 (default)'}`);
    if (time && literalInteger(time.expression) !== null && literalInteger(time.expression) <= 0 && commandName) details.push('named nonpositive time is passed through');
  } else if (relation === 'digital-assert') {
    const flags = fieldValues(map, /^flag[2-8]?$/i); const tokens = flags.map(item => String(item.expression).trim());
    status = flags.length ? (tokens.every(token => DIGITAL_FLAGS.has(token)) ? 'related' : 'dynamic') : 'unresolved'; reason = flags.length ? '' : 'AssertInput has no flag through flag8.'; details.push(flags.length ? tokens.join(', ') : 'no flags');
  } else if (relation === 'digital-remap') {
    const input = String(map.get('input')?.[0]?.expression || '').trim(), output = String(map.get('output')?.[0]?.expression || '').trim();
    const valid = value => SHIFT_KEYS.has(value) || /^none$/i.test(value);
    status = input && output && valid(input) && valid(output) ? 'related' : 'unresolved'; reason = !input || !output ? 'ShiftInput requires both input and output.' : !valid(input) || !valid(output) ? 'ShiftInput accepts U, D, L, R, buttons, or none; B and F are not accepted.' : redirect ? 'RedirectID is accepted upstream, but the reviewed implementation does not prove redirected mapping ownership.' : '';
    details.push(`${input || '?'} → ${output || '?'}`); if (/^none$/i.test(output)) details.push('output none disables this key'); if (/^none$/i.test(input) && /^none$/i.test(output)) details.push('none → none restores mappings');
  } else if (relation === 'analog-assert') {
    const present = AXES.filter(axis => map.has(axis)); status = 'related'; details.push(`${present.length} explicit axis field(s)`); details.push('omitted axes are written as zero');
  } else if (relation === 'input-policy') {
    const flags = fieldValues(map, /^flag[2-8]?$/i).map(item => String(item.expression).trim()).filter(item => POLICY_FLAGS.has(item.toLowerCase()));
    if (!flags.length) return null; status = 'related'; details.push(flags.join(', '));
  }
  if (redirect) details.push(`RedirectID ${redirect}`);
  return freeze({ id: digest(JSON.stringify([canonical(options.filename), options.sourceHash, start, end, relation, commandName])), relation, controller, commandName, status, reason, details, redirect, syntax, sourcePath: path.resolve(options.filename), file: path.basename(options.filename), sourceHash: options.sourceHash, sourceVersion: options.sourceVersion ?? null, line: lineAt(source, start), start, end, fields, compatibility: options.nightly === true ? 'verified-upstream-nightly' : 'target-unverified' });
}
function zssControllers(source, filename, sourceHash, sourceVersion, nightly) {
  const masked = maskSource(source, 'zss'), output = [], pattern = /\b(AssertCommand|AssertInput|ShiftInput|AssertAnalogVector|AssertSpecial)\b\s*\{/gi; let match;
  while ((match = pattern.exec(masked))) { const open = masked.indexOf('{', match.index), close = matchingBrace(masked, open), end = close < 0 ? masked.length : close + 1, map = fields(source, masked, open + 1, close < 0 ? masked.length : close, ':', 'zss'), record = controllerRecord(source, 'zss', match[1], match.index, end, map, { filename, sourceHash, sourceVersion, nightly }); if (record) output.push(record); pattern.lastIndex = Math.max(pattern.lastIndex, end); }
  return output;
}
function cnsControllers(source, filename, sourceHash, sourceVersion, nightly) {
  const masked = maskSource(source, 'cns'), headers = [], pattern = /^[ \t]*\[([^\]\r\n]+)\]/gim; let match; while ((match = pattern.exec(masked))) headers.push({ header: match[1].trim(), start: match.index, bodyStart: pattern.lastIndex }); const output = [];
  for (let index = 0; index < headers.length; index += 1) { const section = { ...headers[index], end: headers[index + 1]?.start ?? masked.length }; if (!/^state(?:\s|$)/i.test(section.header) || /^statedef\b/i.test(section.header)) continue; const map = fields(source, masked, section.bodyStart, section.end, '=', 'cns'), types = map.get('type') || [], controller = types.length === 1 ? String(types[0].expression).trim() : ''; if (!CONTROLLERS.has(controller.toLowerCase())) continue; const record = controllerRecord(source, 'cns', controller, section.start, section.end, map, { filename, sourceHash, sourceVersion, nightly }); if (record) output.push(record); }
  return output;
}
function expressionRecords(source, filename, sourceHash, sourceVersion, syntax, nightly) {
  const masked = maskSource(source, syntax === 'zss' ? 'zss' : 'cns'), output = [], add = (relation, match, details, status = 'related', reason = '') => output.push(freeze({ id: digest(JSON.stringify([canonical(filename), sourceHash, match.index, match.index + match[0].length, relation])), relation, controller: '', commandName: null, status, reason, details, redirect: '', syntax, sourcePath: path.resolve(filename), file: path.basename(filename), sourceHash, sourceVersion: sourceVersion ?? null, line: lineAt(source, match.index), start: match.index, end: match.index + match[0].length, fields: [], compatibility: nightly === true ? 'verified-upstream-nightly' : 'target-unverified' }));
  const analog = /\banalog\s*\(([^)]*)\)/gi; let match; while ((match = analog.exec(masked))) { const axis = String(source.slice(match.index, match.index + match[0].length).replace(/^[^(]*\(|\)$/g, '') || '').trim(), lower = axis.toLowerCase(), valid = AXES.includes(lower); add('analog-query', match, [axis || 'missing axis'], valid ? 'related' : /^[A-Za-z_][A-Za-z0-9_]*$/.test(axis) ? 'unresolved' : 'dynamic', valid ? '' : /^[A-Za-z_][A-Za-z0-9_]*$/.test(axis) ? `Invalid Analog axis: ${axis}` : 'The Analog axis cannot be resolved statically.'); }
  let offset = 0;
  for (const raw of String(source || '').split(/(?<=\n)/)) {
    const visible = raw.slice(0, commentOffset(raw, syntax)), pattern = /\b(selfcommand|command)\s*(?:==|!=|=)\s*([^&|{\r\n]+)/gi; let reference;
    while ((reference = pattern.exec(visible))) {
      const keywordAt = offset + reference.index, keywordEnd = keywordAt + reference[1].length;
      if (!masked.slice(keywordAt, keywordEnd).trim()) continue;
      const expression = String(reference[2] || '').trim().replace(/[);}\s]+$/, ''), name = literalString(expression), start = keywordAt, end = offset + reference.index + reference[0].length, selfOwned = /^selfcommand$/i.test(reference[1]), owner = selfOwned ? 'SelfCommand trigger' : 'Command trigger', prefix = visible.slice(0, reference.index), redirected = !selfOwned && /(?:\b(?:player|helper|target|enemy|enemynear|partner)\s*\([^)]*\)|\b(?:root|parent|helper|target|enemy|enemynear|partner))\s*,\s*$/i.test(prefix), status = selfOwned || redirected ? 'dynamic' : name !== null && name !== '' ? 'candidate' : 'dynamic', reason = selfOwned ? 'SelfCommand reads the current working state owner; local command-family ownership is not proven statically.' : redirected ? 'A redirected Command query cannot be proven against the current character command family.' : name === '' ? 'An empty command query cannot resolve to a named family.' : name === null ? 'The command query uses a runtime string expression.' : '';
      output.push(freeze({ id: digest(JSON.stringify([canonical(filename), sourceHash, start, end, 'command-query', owner])), relation: 'command-query', controller: owner, commandName: name, status, reason, details: [selfOwned ? 'self-owned command buffer query' : redirected ? 'redirected command buffer query' : 'current command buffer query'], redirect: redirected ? prefix.trim() : '', syntax, sourcePath: path.resolve(filename), file: path.basename(filename), sourceHash, sourceVersion: sourceVersion ?? null, line: lineAt(source, start), start, end, fields: [], compatibility: nightly === true ? 'verified-upstream-nightly' : 'target-unverified' }));
    }
    offset += raw.length;
  }
  return output;
}
function maskLua(source) {
  const output = String(source || '').split(''); let quote = '', longClose = '';
  for (let at = 0; at < output.length; at += 1) {
    const value = output[at];
    if (longClose) { if (output.slice(at, at + longClose.length).join('') === longClose) { for (let index = 0; index < longClose.length; index += 1) if (output[at + index] !== '\r' && output[at + index] !== '\n') output[at + index] = ' '; at += longClose.length - 1; longClose = ''; } else if (value !== '\r' && value !== '\n') output[at] = ' '; continue; }
    if (quote) { if (value === quote && output[at - 1] !== '\\') quote = ''; if (value !== '\r' && value !== '\n') output[at] = ' '; continue; }
    if (value === '"' || value === "'") { quote = value; output[at] = ' '; continue; }
    if (value === '-' && output[at + 1] === '-') { const tail = output.slice(at + 2).join(''), open = /^\[(=*)\[/.exec(tail); if (open) { longClose = `]${open[1]}]`; const length = 2 + open[0].length; for (let index = 0; index < length; index += 1) output[at + index] = ' '; at += length - 1; } else { while (at < output.length && output[at] !== '\r' && output[at] !== '\n') output[at++] = ' '; at -= 1; } continue; }
    if (value === '[') { const open = /^\[(=*)\[/.exec(output.slice(at).join('')); if (open) { longClose = `]${open[1]}]`; for (let index = 0; index < open[0].length; index += 1) output[at + index] = ' '; at += open[0].length - 1; } }
  }
  return output.join('');
}
function luaRecords(source, filename, sourceHash, sourceVersion) {
  const masked = maskLua(source), output = [], pattern = /(?<![\w.:])commandBufReset\s*\(([^)]*)\)/g; let match; while ((match = pattern.exec(masked))) { const argument = String(source.slice(match.index, match.index + match[0].length).replace(/^[^(]*\(|\)$/g, '') || '').trim(); output.push(freeze({ id: digest(JSON.stringify([canonical(filename), sourceHash, match.index, 'lua-buffer-reset'])), relation: 'lua-buffer-reset', controller: 'commandBufReset', commandName: null, status: /^\d+$/.test(argument) || !argument ? 'related' : 'dynamic', reason: 'Lua-only API; the optional argument is a 1-based player/controller index, not a character ID.', details: [argument ? `player/controller ${argument}` : 'all command buffers'], redirect: '', syntax: 'lua', sourcePath: path.resolve(filename), file: path.basename(filename), sourceHash, sourceVersion: sourceVersion ?? null, line: lineAt(source, match.index), start: match.index, end: match.index + match[0].length, fields: [], compatibility: 'lua-only' })); }
  return output;
}
function commandInputOccurrencesForSource(item = {}, options = {}) {
  const source = String(item.text || ''), filename = path.resolve(String(item.filename || 'source.zss')), sourceHash = item.sourceHash || digest(source), sourceVersion = item.version ?? null, syntax = item.syntax === 'lua' || /\.lua$/i.test(filename) ? 'lua' : item.syntax === 'zss' || /\.zss$/i.test(filename) ? 'zss' : 'cns';
  return syntax === 'lua' ? luaRecords(source, filename, sourceHash, sourceVersion) : (syntax === 'zss' ? zssControllers(source, filename, sourceHash, sourceVersion, options.nightly) : cnsControllers(source, filename, sourceHash, sourceVersion, options.nightly)).concat(expressionRecords(source, filename, sourceHash, sourceVersion, syntax, options.nightly));
}
function buildCommandInputReferenceSnapshot(context = {}) {
  const unavailable = reason => freeze({ public: freeze({ available: false, reason, occurrences: freeze([]), families: freeze([]), totals: freeze({ exact: 0, related: 0, unresolved: 0 }) }), authorities: new Map() });
  const sources = Array.isArray(context.sources) ? context.sources : [], assigned = Array.isArray(context.assignedSources) ? context.assignedSources.map(item => path.resolve(item)) : [];
  if (context.inventoryComplete !== true || sources.length !== assigned.length || sources.length > MAX_FILES) return unavailable(context.reason || 'The complete bounded assigned source inventory is unavailable.');
  let total = 0; const occurrences = [];
  for (let index = 0; index < sources.length; index += 1) { const item = sources[index], source = String(item?.text || ''), bytes = Buffer.byteLength(source, 'utf8'); total += bytes; if (item?.available !== true || item.dirty || canonical(item.filename) !== canonical(assigned[index]) || item.sourceHash !== digest(source) || bytes > MAX_SOURCE_BYTES || total > MAX_TOTAL_BYTES) return unavailable('An assigned source is dirty, stale, unavailable, or exceeds the bounded connector limits.'); const records = commandInputOccurrencesForSource(item, { nightly: context.nightly }); occurrences.push(...records); if (occurrences.length > MAX_OCCURRENCES) return unavailable('The assigned sources exceed the bounded command/input connector index.'); }
  const familyNames = new Set((context.commandFamilies || []).map(item => String(item.name || ''))), authorities = new Map(), projected = [];
  for (const occurrence of occurrences) { let status = occurrence.status, reason = occurrence.reason; if (['command-assert','command-query'].includes(occurrence.relation) && occurrence.status === 'candidate') { status = familyNames.has(occurrence.commandName) ? 'exact' : 'missing'; reason = status === 'missing' ? 'No exact same-case command family exists in the assigned command file.' : ''; } const token = String(context.token?.(occurrence) || ''); const route = /^[0-9a-f]{48}$/.test(token) ? token : ''; const publicItem = freeze({ ...occurrence, status, reason, route }); projected.push(publicItem); if (route) authorities.set(route, freeze({ schema: 'ikemaker.command-input-source-route', version: 1, generation: Number(context.generation), ownershipHash: String(context.ownershipHash || ''), route, occurrenceId: occurrence.id, sourcePath: occurrence.sourcePath, sourceHash: occurrence.sourceHash, sourceVersion: occurrence.sourceVersion, start: occurrence.start, end: occurrence.end })); }
  const families = [...familyNames].sort().map(name => { const rows = projected.filter(item => item.commandName === name), definitions = (context.commandFamilies || []).filter(item => item.name === name).reduce((sum, item) => sum + Number(item.count || 1), 0); return freeze({ name, definitions, exact: rows.filter(item => item.status === 'exact').length, unresolved: rows.filter(item => item.status !== 'exact').length }); });
  const exact = projected.filter(item => item.status === 'exact').length, unresolved = projected.filter(item => ['dynamic', 'random', 'missing', 'unresolved'].includes(item.status)).length;
  return freeze({ public: freeze({ available: true, reason: '', occurrences: freeze(projected), families: freeze(families), totals: freeze({ exact, related: projected.length - exact - unresolved, unresolved }), limitations: freeze(['Related digital, analog, policy, and Lua rows are not named-command uses.', 'ShiftInput RedirectID effect ownership is not certified by the reviewed upstream implementation.', 'Browsing shows authored evidence; it does not simulate runtime execution.']) }), authorities });
}
function validateCommandInputSourceAuthority(authority, context = {}) { if (authority?.schema !== 'ikemaker.command-input-source-route' || authority.version !== 1 || authority.generation !== Number(context.generation)) return null; const rebuilt = buildCommandInputReferenceSnapshot({ ...context, token: item => item.id === authority.occurrenceId ? authority.route : '0'.repeat(48) }), candidate = rebuilt.authorities.get(authority.route); if (!candidate || Object.keys(candidate).some(key => candidate[key] !== authority[key]) || Object.keys(candidate).length !== Object.keys(authority).length) return null; return candidate; }

module.exports = { MAX_FILES, MAX_SOURCE_BYTES, MAX_TOTAL_BYTES, MAX_OCCURRENCES, POLICY_FLAGS, DIGITAL_FLAGS, SHIFT_KEYS, AXES, commandInputOccurrencesForSource, buildCommandInputReferenceSnapshot, validateCommandInputSourceAuthority };
