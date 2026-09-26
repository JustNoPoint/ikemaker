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
  uncomment, parseCommands, splitSteps, stepModel, diagnosticsFor, commandBlock, replaceCommandBlock,
  parseMovelistAssignments, movelistPreview, changeMovelistSnippet, isMotion, finalButtons
};
