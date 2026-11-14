'use strict';

// Live syntax check for `command =` values in CMD-family files.
//
// This mirrors the error checks in IKEMEN GO's Command.ReadCommandSymbols
// (v1.0.0 input.go:2031-2265, Nightly fb269c9 input.go:2108-2345). The engine
// treats any of these errors as a load failure for IKEMEN-version characters
// (compiler.go:8322-8329), so they are reported as errors.
//
// The Nightly-only `*` broad-direction prefix is accepted here as a prefix;
// target gating and `*`-specific conflicts are reported separately by
// command_movelist_model.commandDocumentTargetDiagnostics so they are never
// reported twice.

const DIRECTIONS = new Set(['B', 'D', 'F', 'L', 'R', 'U', 'N']);
const DIAGONAL_SECOND = new Set(['B', 'F', 'L', 'R']);
const BUTTONS = new Set(['a', 'b', 'c', 'x', 'y', 'z', 's', 'd', 'w', 'm']);
const COMMAND_FILE = /\.(?:cmd|mfg|inp|jnp)$/i;

function isKeyChar(ch) { return DIRECTIONS.has(ch) || BUTTONS.has(ch); }

function issue(line, start, length, message) {
  return { line, start: Math.max(0, start), length: Math.max(1, length), severity: 'error', code: 'command-sequence-syntax', message: `${message} IKEMEN stops loading the character on this command.` };
}

// Returns errors for one command value. `offset` is the column of value[0].
function commandValueIssues(value, line = 0, offset = 0) {
  const source = String(value ?? ''), output = [];
  if (!source.trim()) return output;
  let stepStart = 0;
  const steps = source.split(',');
  steps.forEach((rawStep, stepIndex) => {
    const stepColumn = offset + stepStart;
    stepStart += rawStep.length + 1;
    const lead = rawStep.length - rawStep.trimStart().length, step = rawStep.trim(), column = stepColumn + lead;
    if (stepIndex > 0 && !step) { output.push(issue(line, stepColumn - 1, 1, 'Empty command step (two commas in a row, or a trailing comma).')); return; }
    if (step.includes('+') && step.includes('|')) { output.push(issue(line, column, step.length, `Step "${step}" mixes '+' (press together) and '|' (either key). Use only one of them in a step.`)); return; }
    const separator = step.includes('|') ? '|' : '+';
    let greater = false, partStart = 0;
    for (const rawPart of step.split(separator)) {
      const partColumn = column + partStart + (rawPart.length - rawPart.trimStart().length);
      partStart += rawPart.length + 1;
      let part = rawPart.trim();
      if (!part) { output.push(issue(line, Math.min(partColumn, column + step.length - 1), 1, `'${separator}' has no key on one side.`)); continue; }
      const length = part.length;
      let keys = 0;
      for (let index = 0; index < part.length;) {
        const ch = part[index];
        if ((ch === 'U' || ch === 'D') && DIAGONAL_SECOND.has(part[index + 1])) { keys += 1; index += 2; continue; }
        if (isKeyChar(ch)) keys += 1;
        index += 1;
      }
      if (keys < 1) { output.push(issue(line, partColumn, length, `"${part}" has no direction or button. Keys are U D B F L R N (and diagonals such as DF) or the buttons a b c x y z s d w m; buttons are lowercase.`)); continue; }
      if (keys > 1) { output.push(issue(line, partColumn, length, `"${part}" holds more than one key. Join keys pressed together with '+', or separate steps with ','.`)); continue; }
      const seen = new Set();
      let problem = '';
      const next = () => { part = part.slice(1).trim(); };
      const digits = () => { while (/^[0-9]/.test(part)) next(); };
      prefix: while (part) {
        const ch = part[0];
        switch (ch) {
          case '>':
            if (greater) problem = `Duplicate '>' in one step.`;
            greater = true; next(); break;
          case '~': case '/':
            if (seen.has(ch)) problem = `Duplicate '${ch}' symbol.`;
            seen.add(ch); next(); digits(); break;
          case '$':
            if (seen.has(ch)) problem = `Duplicate '$' symbol.`;
            seen.add(ch); next(); break;
          case '*':
            // Nightly broad-direction prefix: gated by the target diagnostics.
            seen.add(ch); next(); break;
          default:
            break prefix;
        }
        if (problem) break;
      }
      if (!problem) {
        const key = part[0];
        if (key === undefined) problem = `"${rawPart.trim()}" has a prefix symbol but no key after it.`;
        else if (!isKeyChar(key)) problem = `Invalid symbol '${key}'.`;
      }
      if (problem) output.push(issue(line, partColumn, length, problem));
    }
  });
  return output;
}

function stripComment(line) {
  const index = line.indexOf(';');
  return index < 0 ? line : line.slice(0, index);
}

// Scans [Command...] sections (any section whose lowercase name starts with
// "command", as compiler.go does) and checks the first `command` key of each,
// because IniSection.Parse keeps the first duplicate key.
function commandSequenceIssues(text) {
  const lines = String(text ?? '').split(/\r\n|\r|\n/), output = [];
  let inCommand = false, checked = false;
  for (let index = 0; index < lines.length; index += 1) {
    const code = stripComment(lines[index]), trimmed = code.trim();
    const section = /^\[\s*([^\]]*)\]/.exec(trimmed);
    if (section) { inCommand = section[1].trim().toLowerCase().startsWith('command'); checked = false; continue; }
    if (!inCommand || checked) continue;
    const key = /^(\s*)([^=\s]+)/.exec(code);
    if (!key || key[2].toLowerCase() !== 'command') continue;
    const equals = code.indexOf('=');
    checked = true;
    if (equals < 0) continue;
    const rawValue = code.slice(equals + 1), lead = rawValue.length - rawValue.trimStart().length, value = rawValue.trim();
    output.push(...commandValueIssues(value, index, equals + 1 + lead));
  }
  return output;
}

function isCommandFile(filename) { return COMMAND_FILE.test(String(filename || '')); }

module.exports = { commandSequenceIssues, commandValueIssues, isCommandFile, BUTTONS };
