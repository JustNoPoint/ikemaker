'use strict';

const path = require('path');

function uncomment(line) {
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"' && line[index - 1] !== '\\') quoted = !quoted;
    if (line[index] === ';' && !quoted) return line.slice(0, index);
  }
  return line;
}

function unquote(value) {
  const text = String(value == null ? '' : value).trim();
  return text.length > 1 && text[0] === '"' && text[text.length - 1] === '"' ? text.slice(1, -1) : text;
}

function numeric(value, fallback) {
  const parsed = Number.parseInt(String(value == null ? '' : value).trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseEntries(lines, start, end) {
  const entries = {};
  for (let line = start; line < end; line += 1) {
    const code = uncomment(lines[line]).trim();
    const equals = code.indexOf('=');
    if (equals < 0) continue;
    entries[code.slice(0, equals).trim().toLowerCase()] = {
      key: code.slice(0, equals).trim(), value: code.slice(equals + 1).trim(), line
    };
  }
  return entries;
}

function defaultsFrom(lines) {
  const header = lines.findIndex((line) => /^\s*\[defaults\]\s*(?:;.*)?$/i.test(line));
  if (header < 0) return { time: 15, bufferTime: 1, autoGreater: 1, stepTime: -1, bufferHitpause: 1, bufferPauseend: 1, bufferShared: 1 };
  let end = lines.length;
  for (let index = header + 1; index < lines.length; index += 1) if (/^\s*\[[^\]]+\]/.test(lines[index])) { end = index; break; }
  const values = parseEntries(lines, header + 1, end);
  const get = (key, fallback) => numeric(values[key] && values[key].value, fallback);
  return {
    time: get('command.time', 15), bufferTime: get('command.buffer.time', 1),
    autoGreater: get('command.autogreater', 1), stepTime: get('command.steptime', -1),
    bufferHitpause: get('command.buffer.hitpause', 1), bufferPauseend: get('command.buffer.pauseend', 1),
    bufferShared: get('command.buffer.shared', 1)
  };
}

function splitSteps(command) {
  const result = [];
  let current = '';
  for (const character of String(command || '')) {
    if (character === ',') { result.push(current.trim()); current = ''; }
    else current += character;
  }
  if (current.trim() || result.length) result.push(current.trim());
  return result.filter((step) => step.length);
}

function commandStepLayout(command) {
  const source = String(command || ''), steps = [];
  let start = 0;
  for (let cursor = 0; cursor <= source.length; cursor += 1) {
    if (cursor < source.length && source[cursor] !== ',') continue;
    const raw = source.slice(start, cursor), leading = (raw.match(/^\s*/) || [''])[0].length;
    const trailing = (raw.match(/\s*$/) || [''])[0].length;
    const coreStart = start + leading, coreEnd = cursor - trailing;
    if (coreEnd > coreStart) steps.push({ coreStart, coreEnd, core: source.slice(coreStart, coreEnd) });
    start = cursor + 1;
  }
  return { source, steps };
}

function replaceStepCores(source, replacements) {
  let next = source;
  for (const replacement of [...replacements].sort((a, b) => b.start - a.start)) {
    next = next.slice(0, replacement.start) + replacement.text + next.slice(replacement.end);
  }
  return next;
}

const INSERTABLE_INPUTS = Object.freeze([
  { value: 'L', label: 'Left — absolute screen direction', basis: 'absolute' },
  { value: 'R', label: 'Right — absolute screen direction', basis: 'absolute' },
  { value: 'B', label: 'Back — relative to facing', basis: 'relative' },
  { value: 'F', label: 'Forward — relative to facing', basis: 'relative' },
  { value: 'D', label: 'Down', basis: 'neutral' },
  { value: 'U', label: 'Up', basis: 'neutral' },
  { value: 'N', label: 'Neutral', basis: 'neutral' },
  { value: '/D', label: 'Hold Down — native hold syntax', basis: 'neutral' }
]);

function editCommandSteps(command, operation, index, value = '?') {
  const layout = commandStepLayout(command), { source, steps } = layout;
  const at = Number.isInteger(index) ? Math.max(0, Math.min(index, Math.max(steps.length - 1, 0))) : Math.max(steps.length - 1, 0);
  const token = String(value == null ? '?' : value).trim() || '?';
  if (!steps.length) return operation === 'insertBefore' || operation === 'insertAfter' ? token : source;
  if (operation === 'replace') return replaceStepCores(source, [{ start: steps[at].coreStart, end: steps[at].coreEnd, text: token }]);
  if (operation === 'insertBefore') return source.slice(0, steps[at].coreStart) + token + ', ' + source.slice(steps[at].coreStart);
  if (operation === 'insertAfter' || operation === 'duplicate') {
    const inserted = operation === 'duplicate' ? steps[at].core : token;
    if (at + 1 < steps.length) return source.slice(0, steps[at + 1].coreStart) + inserted + ', ' + source.slice(steps[at + 1].coreStart);
    return source.slice(0, steps[at].coreEnd) + ', ' + inserted + source.slice(steps[at].coreEnd);
  }
  if (operation === 'remove') {
    if (at + 1 < steps.length) return source.slice(0, steps[at].coreStart) + source.slice(steps[at + 1].coreStart);
    if (at > 0) return source.slice(0, steps[at - 1].coreEnd) + source.slice(steps[at].coreEnd);
    return source.slice(0, steps[at].coreStart) + source.slice(steps[at].coreEnd);
  }
  const other = operation === 'moveLeft' ? at - 1 : operation === 'moveRight' ? at + 1 : at;
  if (other < 0 || other >= steps.length || other === at) return source;
  return replaceStepCores(source, [
    { start: steps[at].coreStart, end: steps[at].coreEnd, text: steps[other].core },
    { start: steps[other].coreStart, end: steps[other].coreEnd, text: steps[at].core }
  ]);
}

function mergeNormalizedEditorText(original, editorText, fallbackEol = '\n') {
  const source = String(original ?? ''), next = String(editorText ?? ''), normalized = source.replace(/\r\n|\r/g, '\n');
  if (next === normalized) return source;
  let prefix = 0;
  while (prefix < normalized.length && prefix < next.length && normalized[prefix] === next[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < normalized.length - prefix && suffix < next.length - prefix && normalized[normalized.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix += 1;
  const rawOffset = target => {
    let raw = 0, logical = 0;
    while (raw < source.length && logical < target) {
      if (source[raw] === '\r' && source[raw + 1] === '\n') raw += 2;
      else raw += 1;
      logical += 1;
    }
    return raw;
  };
  const rawStart = rawOffset(prefix), rawEnd = rawOffset(normalized.length - suffix);
  const after = source.slice(rawStart).match(/\r\n|\r|\n/), before = [...source.slice(0, rawStart).matchAll(/\r\n|\r|\n/g)].at(-1);
  const localEol = after?.[0] || before?.[0] || (fallbackEol === '\r\n' || fallbackEol === '\r' ? fallbackEol : '\n');
  const insertion = next.slice(prefix, next.length - suffix).replace(/\n/g, localEol);
  return source.slice(0, rawStart) + insertion + source.slice(rawEnd);
}

function stepModel(raw, index) {
  const value = String(raw || '').trim();
  const operators = [...value].filter((character) => character === '+' || character === '|');
  const atoms = value.split(/[+|]/).map((item) => item.trim()).filter(Boolean);
  return {
    index,
    raw: value,
    atoms,
    relation: value.includes('+') ? 'simultaneous' : value.includes('|') ? 'alternative' : 'single',
    mixedRelation: operators.includes('+') && operators.includes('|'),
    exact: value.includes('>'), hold: value.includes('/'), release: value.includes('~'),
    directionModifier: value.includes('$'), neutral: /(?:^|[^A-Za-z])N(?:$|[^A-Za-z])/.test(value)
  };
}

function commandModel(entries, startLine, endLine, defaults, source) {
  const read = (key, fallback) => entries[key] ? numeric(entries[key].value, fallback) : fallback;
  const rawCommand = entries.command ? entries.command.value.trim() : '';
  const time = read('time', defaults.time);
  const declaredStepTime = read('steptime', defaults.stepTime);
  const stepTime = declaredStepTime === -1 ? time : declaredStepTime;
  return {
    name: unquote(entries.name && entries.name.value), command: rawCommand,
    steps: splitSteps(rawCommand).map(stepModel), time, stepTime, declaredStepTime,
    autoGreater: read('autogreater', defaults.autoGreater), bufferTime: read('buffer.time', defaults.bufferTime),
    bufferHitpause: read('buffer.hitpause', defaults.bufferHitpause), bufferPauseend: read('buffer.pauseend', defaults.bufferPauseend),
    bufferShared: read('buffer.shared', defaults.bufferShared), startLine, endLine, entries, source
  };
}

function parseCommands(text, filename = '') {
  const sourceText = String(text || ''), lines = sourceText.replace(/^\uFEFF/, '').split(/\r?\n/), defaults = defaultsFrom(lines), commands = [];
  const headers = [];
  lines.forEach((line, index) => { if (/^\s*\[command\]\s*(?:;.*)?$/i.test(line)) headers.push(index); });
  headers.forEach((header, index) => {
    let end = index + 1 < headers.length ? headers[index + 1] : lines.length;
    for (let line = header + 1; line < end; line += 1) if (/^\s*\[[^\]]+\]/.test(lines[line])) { end = line; break; }
    commands.push(commandModel(parseEntries(lines, header + 1, end), header, end, defaults, filename));
  });
  return { filename, text: sourceText, lines, defaults, commands };
}

function inputTokens(command) {
  return String(command || '').match(/(?:[~\/]\d*)?(?:\$?[A-Za-z]+)/g) || [];
}

function isMotion(command) {
  const directions = inputTokens(command).filter((token) => /[BDFULRN]$/i.test(token));
  return directions.length >= 2;
}

function finalButtons(command) {
  const steps = splitSteps(command), last = steps[steps.length - 1] || '';
  return (last.match(/[xyzabcdswm]/g) || []).filter((token) => !/[BDFULRN]/.test(token));
}

function diagnosticsFor(command, allCommands = []) {
  const issues = [];
  const add = (severity, code, message) => issues.push({ severity, code, message });
  if (!command.name) add('error', 'missing-name', 'The command has no name.');
  if (!command.command) add('warning', 'empty-command', 'The command sequence is empty. This is valid only when intentionally reserving a shared command name.');
  if (command.steps.some((step) => step.mixedRelation)) add('error', 'mixed-step-operators', 'A single step cannot mix + (simultaneous) and | (alternative). Split it into separate commands or steps.');
  if (/(?:^|[^A-Za-z])m(?:$|[^A-Za-z])/i.test(command.command)) add('warning', 'offline-m-button', 'm is the project offline tenth-button compatibility input. Do not present it as a portable or rollback-safe normal character button.');
  if (command.steps.some((step) => step.directionModifier)) add('info', 'direction-modifier', '$ direction-modifier behavior is retained for compatibility, but current IKEMEN documentation says its adjusted behavior is disabled. Review it in engine.');
  if (command.time < 1) add('error', 'invalid-time', 'time must be at least 1 frame.');
  if (command.declaredStepTime !== -1 && command.stepTime < 1) add('error', 'invalid-steptime', 'steptime must be -1 or at least 1 frame.');
  if (command.declaredStepTime === -1 && command.steps.length > 1) add('info', 'steptime-follows-time', `steptime is -1, so each completed step remains valid for the command time (${command.time} frames).`);
  if (command.steps.length > 1) add('info', 'timing-summary', `Whole command: ${command.time} frames. Maximum gap after each completed step: ${command.stepTime} frames.`);
  if (/\b([BDFULR])\s*,\s*\1\b/i.test(command.command) && command.autoGreater !== 0) add('info', 'autogreater-repeat', 'Repeated directions use native autogreater expansion. Set autogreater = 0 only when strict repeated-direction behavior is intentional.');
  if (isMotion(command.command) && finalButtons(command.command).length && !command.steps.some((step) => step.release)) {
    const release = allCommands.find((other) => other !== command && other.command.includes('~') && other.command.replace(/~/g, '') === command.command.replace(/~/g, ''));
    if (!release) add('suggestion', 'negative-edge-counterpart', 'This motion ends in a press button. Consider an authored release counterpart for the project negative-edge routing policy.');
  }
  const duplicates = allCommands.filter((other) => other !== command && other.name && other.name.toLowerCase() === command.name.toLowerCase());
  if (duplicates.length) add('warning', 'duplicate-name', `Another command uses the name “${command.name}”.`);
  return issues;
}

function commandBlock(values) {
  const lines = ['[Command]', `name = "${String(values.name || '').replace(/"/g, '')}"`, `command = ${values.command || ''}`];
  for (const [key, value] of [['time', values.time], ['steptime', values.steptime], ['autogreater', values.autogreater], ['buffer.time', values.bufferTime], ['buffer.hitpause', values.bufferHitpause], ['buffer.pauseend', values.bufferPauseend], ['buffer.shared', values.bufferShared]]) {
    if (value !== undefined && value !== null && value !== '') lines.push(`${key} = ${value}`);
  }
  return lines.join('\n');
}

function replaceCommandBlock(document, command, nextBlock) {
  const eol = document.text.includes('\r\n') ? '\r\n' : '\n';
  const lines = [...document.lines];
  lines.splice(command.startLine, command.endLine - command.startLine, ...String(nextBlock).split(/\r?\n/), '');
  return lines.join(eol);
}

function assignmentValue(line, value) {
  const source = String(line || ''), code = uncomment(source), suffix = source.slice(code.length);
  const match = code.match(/^(\s*[^=]+?)(\s*=\s*)(.*?)(\s*)$/);
  return match ? `${match[1]}${match[2]}${value}${match[4]}${suffix}` : source;
}

function patchCommandBlock(document, command, values = {}) {
  const source = String(document.text || ''), records = [];
  const expression = /([^\r\n]*)(\r\n|\n|$)/g;
  for (let match = expression.exec(source); match && match[0]; match = expression.exec(source)) records.push({ body: match[1], eol: match[2] });
  const replacements = [], additions = [];
  const fields = [
    ['name', 'name', String(values.name == null ? command.name : values.name).replace(/"/g, ''), command.name, value => `"${value}"`],
    ['command', 'command', String(values.command == null ? command.command : values.command), command.command, value => value],
    ['time', 'time', numeric(values.time, command.time), command.time, value => String(value)],
    ['steptime', 'steptime', numeric(values.steptime, command.declaredStepTime), command.declaredStepTime, value => String(value)],
    ['autogreater', 'autogreater', numeric(values.autogreater, command.autoGreater), command.autoGreater, value => String(value)],
    ['buffer.time', 'bufferTime', numeric(values.bufferTime, command.bufferTime), command.bufferTime, value => String(value)],
    ['buffer.hitpause', 'bufferHitpause', numeric(values.bufferHitpause, command.bufferHitpause), command.bufferHitpause, value => String(value)],
    ['buffer.pauseend', 'bufferPauseend', numeric(values.bufferPauseend, command.bufferPauseend), command.bufferPauseend, value => String(value)],
    ['buffer.shared', 'bufferShared', numeric(values.bufferShared, command.bufferShared), command.bufferShared, value => String(value)]
  ];
  for (const [key, _property, next, before, format] of fields) {
    if (next === before) continue;
    const entry = command.entries[key], rendered = format(next);
    if (entry) replacements.push({ line: entry.line, text: assignmentValue(records[entry.line]?.body || '', rendered) });
    else additions.push(`${key} = ${rendered}`);
  }
  for (const replacement of replacements) records[replacement.line].body = replacement.text;
  if (additions.length) {
    let insertion = Math.min(command.endLine, records.length);
    while (insertion > command.startLine + 1 && /^\s*(?:;.*)?$/.test(records[insertion - 1]?.body || '')) insertion -= 1;
    const defaultEol = records.find(record => record.eol)?.eol || '\n', endedWithEol = /(?:\r\n|\n)$/.test(source);
    if (insertion === records.length && records.length && !records[records.length - 1].eol) records[records.length - 1].eol = defaultEol;
    const added = additions.map((body, index) => ({ body, eol: insertion < records.length || index < additions.length - 1 || endedWithEol ? defaultEol : '' }));
    records.splice(insertion, 0, ...added);
  }
  return records.map(record => record.body + record.eol).join('');
}

function parseMovelistAssignments(text, filename = '') {
  const lines = String(text || '').split(/\r?\n/); let inFiles = false; const entries = [];
  lines.forEach((raw, line) => {
    const code = uncomment(raw).trim(), section = code.match(/^\[([^\]]+)\]$/);
    if (section) { inFiles = section[1].trim().toLowerCase() === 'files'; return; }
    if (!inFiles) return;
    const match = code.match(/^(movelist(?:\d+)?)\s*=\s*(.+)$/i);
    if (!match) return;
    const key = match[1].toLowerCase(), suffix = key.slice('movelist'.length);
    entries.push({ key, slot: suffix ? Number(suffix) : 0, value: unquote(match[2]), line, resolved: path.resolve(path.dirname(filename), unquote(match[2])) });
  });
  return entries.sort((a, b) => a.slot - b.slot);
}

function movelistPreview(text) {
  return String(text || '').split(/\r?\n/).map((raw, line) => {
    const glyphs = [...raw.matchAll(/_([A-Z0-9]+)_?|\^([A-Za-z0-9]+)/g)].map((match) => match[1] || match[2]);
    const visible = raw.replace(/<#[0-9a-f]{6}>|<\/>/gi, '').replace(/_([A-Z0-9]+)_?/g, '[$1]').replace(/\^([A-Za-z0-9]+)/g, '[$1]');
    return { line, raw, visible, glyphs };
  });
}

function changeMovelistSnippet(slot) { return `[State Change Movelist]\ntype = ChangeMovelist\ntrigger1 = 1\nvalue = ${Number(slot) || 0}`; }

module.exports = {
  uncomment, parseCommands, splitSteps, stepModel, diagnosticsFor, commandBlock, replaceCommandBlock, patchCommandBlock,
  parseMovelistAssignments, movelistPreview, changeMovelistSnippet, isMotion, finalButtons,
  INSERTABLE_INPUTS, commandStepLayout, replaceStepCores, editCommandSteps, mergeNormalizedEditorText
};
