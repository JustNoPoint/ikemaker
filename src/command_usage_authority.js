'use strict';

const path = require('path');
const { hash } = require('./mutation_safety');
const { parseDef, sections, value, unquote } = require('./def_model');
const { parseCommands } = require('./command_movelist_model');
const { commandReferencesInLine } = require('./command_reference_model');

const MAX_DEF_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
const MAX_COMMAND_BYTES = 8 * 1024 * 1024;
const MAX_COMPONENT_COMMAND_USES = 512;
const MAX_COMMAND_FAMILY_DEFINITIONS = 256;
const MAX_COMMAND_DEFINITIONS = 8192;
const canonical = value => path.resolve(String(value || '')).toLowerCase();

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function textLines(text) {
  const source = String(text || ''), lines = [], starts = [];
  let start = 0;
  for (let at = 0; at <= source.length; at += 1) {
    if (at < source.length && source[at] !== '\r' && source[at] !== '\n') continue;
    starts.push(start); lines.push(source.slice(start, at));
    if (at < source.length && source[at] === '\r' && source[at + 1] === '\n') at += 1;
    start = at + 1;
    if (start === source.length) { starts.push(start); lines.push(''); break; }
  }
  return { lines, starts };
}

function lineEnd(text, parsed, line) {
  return line + 1 < parsed.starts.length ? parsed.starts[line] + parsed.lines[line].length : String(text || '').length;
}

function exactCommandAssignment(defPath, defText) {
  try {
    const document = parseDef(String(defText || ''), path.resolve(defPath)), fileSections = sections(document, 'files');
    if (fileSections.length !== 1) return '';
    const entries = (fileSections[0].entries || []).filter(entry => String(entry.key || '').trim().toLowerCase() === 'cmd');
    if (entries.length !== 1) return '';
    const assigned = unquote(value(fileSections[0], 'cmd', '')).trim();
    return assigned ? path.resolve(path.dirname(defPath), assigned.replace(/[\\/]/g, path.sep)) : '';
  } catch (_) { return ''; }
}

function commandFamilyDefinitions(commandText, commandPath, name) {
  const parsedText = textLines(commandText), document = parseCommands(commandText, commandPath), family = [];
  for (let index = 0; index < document.commands.length; index += 1) {
    const command = document.commands[index];
    if (command.name !== name) continue;
    if (family.length >= MAX_COMMAND_FAMILY_DEFINITIONS) return null;
    const start = parsedText.starts[command.startLine], end = lineEnd(commandText, parsedText, Math.max(command.startLine, command.endLine - 1));
    if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return null;
    const range = String(commandText).slice(start, end);
    family.push(freeze({ index, name, startLine: command.startLine, endLine: command.endLine, start, end, rangeHash: hash(range) }));
  }
  return freeze(family);
}

function buildCommandFamilySnapshot(context = {}) {
  if (context.commandAvailable !== true || !context.commandPath || context.commandHash !== hash(String(context.commandText || '')) || Buffer.byteLength(String(context.commandText || ''), 'utf8') > MAX_COMMAND_BYTES) return null;
  const document = (context.parseCommands || parseCommands)(context.commandText, context.commandPath), parsedText = textLines(context.commandText), families = Object.create(null), definitionCount = document.commands.length;
  if (definitionCount > MAX_COMMAND_DEFINITIONS) return freeze({ complete: false, commandPath: path.resolve(context.commandPath), commandHash: context.commandHash, commandVersion: context.commandVersion === null || context.commandVersion === undefined ? null : String(context.commandVersion), families: freeze(families), stats: freeze({ definitions: definitionCount, limit: MAX_COMMAND_DEFINITIONS }) });
  for (let index = 0; index < document.commands.length; index += 1) {
    const command = document.commands[index]; if (!command.name) continue;
    const bucket = families[command.name] || (families[command.name] = []);
    if (bucket.length >= MAX_COMMAND_FAMILY_DEFINITIONS) return freeze({ complete: false, commandPath: path.resolve(context.commandPath), commandHash: context.commandHash, commandVersion: context.commandVersion === null || context.commandVersion === undefined ? null : String(context.commandVersion), families: freeze(families), stats: freeze({ definitions: definitionCount, limit: MAX_COMMAND_DEFINITIONS, familyOverflow: command.name }) });
    const start = parsedText.starts[command.startLine], end = lineEnd(context.commandText, parsedText, Math.max(command.startLine, command.endLine - 1));
    if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return null;
    bucket.push(freeze({ index, name: command.name, motion: command.command, startLine: command.startLine, endLine: command.endLine, start, end, rangeHash: hash(String(context.commandText).slice(start, end)) }));
  }
  for (const family of Object.values(families)) freeze(family);
  return freeze({ complete: true, commandPath: path.resolve(context.commandPath), commandHash: context.commandHash, commandVersion: context.commandVersion === null || context.commandVersion === undefined ? null : String(context.commandVersion), families: freeze(families), stats: freeze({ definitions: definitionCount, limit: MAX_COMMAND_DEFINITIONS }) });
}

function componentIdentity(component) {
  return hash(JSON.stringify({ kind: component?.kind, defPath: canonical(component?.reference?.defPath), filename: canonical(component?.filename), startLine: component?.startLine, endLine: component?.endLine, sourceHash: component?.sourceHash, rangeHash: component?.rangeHash, stableId: component?.stableId, signature: component?.signature }));
}

function selectedRange(component, sourceText) {
  const parsed = textLines(sourceText), start = parsed.starts[component?.startLine], end = lineEnd(sourceText, parsed, component?.endLine);
  if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return null;
  const range = String(sourceText).slice(start, end);
  if (range.split(/\r\n|\r|\n/).join('\n') !== String(component?.text || '') || hash(String(component?.text || '')) !== component?.rangeHash) return null;
  return { parsed, start, end, range };
}

function componentCommandUses(component, sourceText) {
  const selected = selectedRange(component, sourceText); if (!selected) return null;
  const uses = [], semicolonComments = component.syntax !== 'zss';
  for (let line = component.startLine; line <= component.endLine; line += 1) {
    const raw = selected.parsed.lines[line] || '', lineStart = selected.parsed.starts[line];
    for (const reference of commandReferencesInLine(raw, { semicolonComments })) {
      if (!reference.name || uses.length >= MAX_COMPONENT_COMMAND_USES) return null;
      const start = lineStart + reference.start, end = lineStart + reference.end;
      uses.push(freeze({ name: reference.name, trigger: reference.trigger || 'command', redirected: reference.redirected === true, line, start, end, occurrence: hash(JSON.stringify({ filename: canonical(component.filename), sourceHash: component.sourceHash, start, end, name: reference.name, trigger: reference.trigger || 'command', redirected: reference.redirected === true })) }));
    }
  }
  return freeze({ ...selected, uses: freeze(uses) });
}

function contextExact(context) {
  return Boolean(context && !context.defDirty && context.commandAvailable === true && canonical(context.commandPath) === canonical(exactCommandAssignment(context.defPath, context.defText)) && context.commandHash === hash(String(context.commandText || '')) && Buffer.byteLength(String(context.defText || ''), 'utf8') <= MAX_DEF_BYTES && Buffer.byteLength(String(context.commandText || ''), 'utf8') <= MAX_COMMAND_BYTES);
}

function familyIdentity(family) { return hash(JSON.stringify(family.map(item => ({ index: item.index, start: item.start, end: item.end, rangeHash: item.rangeHash })))); }

function buildCommandUsageAuthorities(component, context = {}) {
  const unavailable = reason => freeze({ publicUses: freeze({ available: false, reason, items: freeze([]), total: 0 }), authorities: new Map() });
  if (!component || !['state', 'function'].includes(component.kind) || !['zss', 'cns'].includes(component.syntax)) return unavailable('Select one exact assigned StateDef or Function.');
  if (!contextExact(context)) return unavailable('The character command assignment or exact command source is unavailable, dirty, stale, or oversized.');
  if (Buffer.byteLength(String(context.sourceText || ''), 'utf8') > MAX_SOURCE_BYTES || hash(String(context.sourceText || '')) !== component.sourceHash) return unavailable('The selected source is no longer exact.');
  const snapshot = context.commandSnapshot || buildCommandFamilySnapshot(context);
  if (!snapshot?.complete || canonical(snapshot.commandPath) !== canonical(context.commandPath) || snapshot.commandHash !== context.commandHash || snapshot.commandVersion !== (context.commandVersion === null || context.commandVersion === undefined ? null : String(context.commandVersion))) return unavailable('The complete command-family inventory is unavailable, stale, or exceeds its bounded inspection limit.');
  const selected = componentCommandUses(component, context.sourceText); if (!selected) return unavailable('The selected block or its command uses exceed the bounded exact inspection limit.');
  const authorities = new Map(), items = [];
  for (const use of selected.uses) {
    if (use.redirected) { items.push(freeze({ available: false, name: use.name, trigger: use.trigger, redirected: true, line: use.line, reason: 'A redirected Command query cannot be proven against this character command family.' })); continue; }
    if (use.trigger === 'selfcommand') { items.push(freeze({ available: false, name: use.name, trigger: use.trigger, redirected: false, line: use.line, reason: 'SelfCommand reads the current working state owner; local command-family ownership is not proven statically.' })); continue; }
    const family = snapshot.families[use.name] || [];
    if (!family.length) { items.push(freeze({ available: false, name: use.name, trigger: use.trigger, redirected: false, line: use.line, reason: 'No exact same-case command definition exists in the assigned command file.' })); continue; }
    const route = String(context.token?.({ occurrence: use.occurrence, name: use.name }) || '');
    if (!/^[0-9a-f]{48}$/.test(route)) { items.push(freeze({ available: false, name: use.name, line: use.line, reason: 'Exact command-family authority could not be issued.' })); continue; }
    const authority = freeze({ schema: 'ikemaker.command-usage-route', version: 1, route, generation: Number(context.generation), componentIdentity: componentIdentity(component), defPath: path.resolve(context.defPath), defHash: hash(String(context.defText || '')), commandPath: path.resolve(context.commandPath), commandHash: context.commandHash, commandVersion: context.commandVersion === null || context.commandVersion === undefined ? null : String(context.commandVersion), selectedPath: path.resolve(component.filename), selectedHash: component.sourceHash, selectedStart: selected.start, selectedEnd: selected.end, selectedRangeHash: hash(selected.range), occurrence: use.occurrence, commandName: use.name, trigger: use.trigger, redirected: false, useStart: use.start, useEnd: use.end, useHash: hash(String(context.sourceText).slice(use.start, use.end)), useLine: use.line, familyCount: family.length, familyIdentity: familyIdentity(family) });
    authorities.set(route, authority);
    items.push(freeze({ available: true, name: use.name, trigger: use.trigger, redirected: false, line: use.line, familyCount: family.length, motions: [...new Set(family.map(item => item.motion).filter(Boolean))], route }));
  }
  return freeze({ publicUses: freeze({ available: true, reason: '', items: freeze(items), total: items.length }), authorities });
}

function validateCommandUsageAuthority(authority, component, context = {}) {
  if (authority?.schema !== 'ikemaker.command-usage-route' || authority.version !== 1 || authority.generation !== Number(context.generation) || componentIdentity(component) !== authority.componentIdentity) return null;
  const rebuilt = buildCommandUsageAuthorities(component, { ...context, token: item => item.occurrence === authority.occurrence && item.name === authority.commandName ? authority.route : '0'.repeat(48) }), candidate = rebuilt.authorities.get(authority.route);
  if (!candidate || Object.keys(candidate).length !== Object.keys(authority).length) return null;
  for (const key of Object.keys(candidate)) if (candidate[key] !== authority[key]) return null;
  return candidate;
}

function sameStat(left, right) {
  return Boolean(left && right && Number(left.size) === Number(right.size) && (!Number.isFinite(Number(left.mtimeMs)) || !Number.isFinite(Number(right.mtimeMs)) || Number(left.mtimeMs) === Number(right.mtimeMs)));
}

function boundedText(filename, limit, services = {}, requireClean = false) {
  const openDocuments = services.openDocuments || [], open = openDocuments.find(item => !item.isClosed && canonical(item.fileName || item.uri?.fsPath) === canonical(filename));
  if (open) { const text = open.getText(); return Buffer.byteLength(text, 'utf8') <= limit && (!requireClean || !open.isDirty) ? { available: true, text, version: String(open.version), open: true } : { available: false, text: '', version: null, open: true }; }
  const exists = services.existsSync, stat = services.statSync, read = services.readFileSync;
  try { if (!exists(filename)) return { available: false, text: '', version: null, open: false }; const before = stat(filename); if (!before.isFile?.() || before.size > limit) return { available: false, text: '', version: null, open: false }; const text = read(filename, 'utf8'), after = stat(filename); if (!sameStat(before, after) || Buffer.byteLength(text, 'utf8') > limit) return { available: false, text: '', version: null, open: false }; return { available: true, text, version: null, open: false }; } catch (_) { return { available: false, text: '', version: null, open: false }; }
}

function readCommandTargetContext(defPath, services = {}) {
  const io = { openDocuments: services.openDocuments || [], existsSync: services.existsSync || require('fs').existsSync, statSync: services.statSync || require('fs').statSync, readFileSync: services.readFileSync || require('fs').readFileSync };
  const resolvedDef = path.resolve(defPath || '.'), def = boundedText(resolvedDef, MAX_DEF_BYTES, io, true);
  if (!def.available) return null;
  const commandPath = exactCommandAssignment(resolvedDef, def.text); if (!commandPath) return null;
  const command = boundedText(commandPath, MAX_COMMAND_BYTES, io, false); if (!command.available) return null;
  return freeze({ defPath: resolvedDef, defText: def.text, defDirty: false, commandPath, commandText: command.text, commandHash: hash(command.text), commandVersion: command.version, commandAvailable: true });
}

function validateCommandFamilyTarget(authority, context) {
  if (authority?.schema !== 'ikemaker.command-usage-route' || !contextExact(context) || canonical(authority.defPath) !== canonical(context.defPath) || authority.defHash !== hash(context.defText) || canonical(authority.commandPath) !== canonical(context.commandPath) || authority.commandHash !== context.commandHash || authority.commandVersion !== (context.commandVersion === null || context.commandVersion === undefined ? null : String(context.commandVersion))) return false;
  const family = commandFamilyDefinitions(context.commandText, context.commandPath, authority.commandName);
  return Boolean(family && family.length === authority.familyCount && familyIdentity(family) === authority.familyIdentity);
}

module.exports = { MAX_DEF_BYTES, MAX_COMMAND_BYTES, MAX_COMPONENT_COMMAND_USES, MAX_COMMAND_FAMILY_DEFINITIONS, MAX_COMMAND_DEFINITIONS, textLines, exactCommandAssignment, commandFamilyDefinitions, buildCommandFamilySnapshot, componentCommandUses, buildCommandUsageAuthorities, validateCommandUsageAuthority, boundedText, readCommandTargetContext, validateCommandFamilyTarget };
