'use strict';

const path = require('path');
const { enabledCapabilityIds } = require('./catalog_capability_filter');

function uncomment(line) {
  let quote = '';
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote && character === quote) { let slashes = 0; for (let at = index - 1; at >= 0 && line[at] === '\\'; at -= 1) slashes += 1; if (slashes % 2 === 0) quote = ''; continue; }
    if (!quote && (character === '"' || character === "'")) { quote = character; continue; }
    if (character === ';' && !quote) return line.slice(0, index);
  }
  return line;
}

function unquote(value) {
  const text = String(value == null ? '' : value).trim();
  return text.length > 1 && (text[0] === '"' || text[0] === "'") && text[text.length - 1] === text[0] ? text.slice(1, -1) : text;
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
  return commandStepLayout(command).steps.map((step) => step.core);
}

function commandSyntaxLayout(value, separatorCharacters) {
  const source = String(value || ''), parts = [], delimiters = [], separators = new Set(String(separatorCharacters || '')), stack = []; let quote = '';
  const pairs = { '(': ')', '[': ']', '{': '}' };
  for (let cursor = 0; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (quote) {
      if (character === quote) { let slashes = 0; for (let at = cursor - 1; at >= 0 && source[at] === '\\'; at -= 1) slashes += 1; if (slashes % 2 === 0) quote = ''; }
      continue;
    }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (pairs[character]) { stack.push(pairs[character]); continue; }
    if (stack.length && character === stack[stack.length - 1]) { stack.pop(); continue; }
    if (separators.has(character) && !stack.length) delimiters.push({ cursor, character });
  }
  let start = 0;
  for (const delimiter of [...delimiters, { cursor: source.length, character: '' }]) {
    const cursor = delimiter.cursor;
    const raw = source.slice(start, cursor), leading = (raw.match(/^\s*/) || [''])[0].length;
    const trailing = (raw.match(/\s*$/) || [''])[0].length;
    const coreStart = start + leading, coreEnd = cursor - trailing;
    if (coreEnd > coreStart) parts.push({ coreStart, coreEnd, core: source.slice(coreStart, coreEnd) });
    start = cursor + 1;
  }
  return { source, parts, operators: delimiters.map((item) => item.character) };
}

function commandStepLayout(command) {
  const layout = commandSyntaxLayout(command, ',');
  return { source: layout.source, steps: layout.parts };
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
  { value: 'DL', label: 'Down-left — absolute screen direction', basis: 'absolute' },
  { value: 'DR', label: 'Down-right — absolute screen direction', basis: 'absolute' },
  { value: 'UL', label: 'Up-left — absolute screen direction', basis: 'absolute' },
  { value: 'UR', label: 'Up-right — absolute screen direction', basis: 'absolute' },
  { value: 'DB', label: 'Down-back — relative to facing', basis: 'relative' },
  { value: 'DF', label: 'Down-forward — relative to facing', basis: 'relative' },
  { value: 'UB', label: 'Up-back — relative to facing', basis: 'relative' },
  { value: 'UF', label: 'Up-forward — relative to facing', basis: 'relative' },
  { value: 'D', label: 'Down', basis: 'neutral' },
  { value: 'U', label: 'Up', basis: 'neutral' },
  { value: 'N', label: 'Neutral', basis: 'neutral' },
  { value: '/D', label: 'Hold Down — native hold syntax', basis: 'neutral' },
  { value: 'x', label: 'X button', basis: 'button' },
  { value: 'y', label: 'Y button', basis: 'button' },
  { value: 'z', label: 'Z button', basis: 'button' },
  { value: 'a', label: 'A button', basis: 'button' },
  { value: 'b', label: 'B button', basis: 'button' },
  { value: 'c', label: 'C button', basis: 'button' },
  { value: 's', label: 'Start button', basis: 'button' },
  { value: 'w', label: 'W compatibility button', basis: 'button' },
  { value: 'm', label: 'M offline compatibility button', basis: 'button' }
]);

const NIGHTLY_STAR_INPUTS = Object.freeze([
  { value: '*D', label: 'Broad Down — accepts D, DB, or DF without retriggering between them', basis: 'neutral', capabilityId: 'command.nightly-expressions' },
  { value: '*U', label: 'Broad Up — accepts U, UB, or UF without retriggering between them', basis: 'neutral', capabilityId: 'command.nightly-expressions' },
  { value: '*B', label: 'Broad Back — accepts B, DB, or UB without retriggering between them', basis: 'relative', capabilityId: 'command.nightly-expressions' },
  { value: '*F', label: 'Broad Forward — accepts F, DF, or UF without retriggering between them', basis: 'relative', capabilityId: 'command.nightly-expressions' }
]);

function nightlyCommandExpressionsEnabled(snapshot = {}) {
  return String(snapshot?.target?.channel || '').toLowerCase() === 'nightly' && enabledCapabilityIds(snapshot).has('command.nightly-expressions');
}

function insertableInputs(snapshot = {}) {
  return nightlyCommandExpressionsEnabled(snapshot) ? [...INSERTABLE_INPUTS, ...NIGHTLY_STAR_INPUTS] : [...INSERTABLE_INPUTS];
}

const COMMAND_SEQUENCE_RECIPES = Object.freeze([
  { id: 'relative-qcf', label: 'Quarter-circle forward (relative)', basis: 'relative', steps: ['D', 'DF', 'F'] },
  { id: 'relative-qcb', label: 'Quarter-circle back (relative)', basis: 'relative', steps: ['D', 'DB', 'B'] },
  { id: 'relative-dp', label: 'Dragon-punch forward (relative)', basis: 'relative', steps: ['F', 'D', 'DF'] },
  { id: 'relative-rdp', label: 'Dragon-punch back (relative)', basis: 'relative', steps: ['B', 'D', 'DB'] },
  { id: 'relative-hcf', label: 'Half-circle forward (relative)', basis: 'relative', steps: ['B', 'DB', 'D', 'DF', 'F'] },
  { id: 'relative-hcb', label: 'Half-circle back (relative)', basis: 'relative', steps: ['F', 'DF', 'D', 'DB', 'B'] },
  { id: 'relative-double-qcf', label: 'Double quarter-circle forward (relative)', basis: 'relative', steps: ['D', 'DF', 'F', 'D', 'DF', 'F'] },
  { id: 'relative-double-qcb', label: 'Double quarter-circle back (relative)', basis: 'relative', steps: ['D', 'DB', 'B', 'D', 'DB', 'B'] },
  { id: 'relative-charge-bf', label: 'Charge back, then forward (relative)', basis: 'relative', steps: ['/B', 'F'] },
  { id: 'relative-charge-fb', label: 'Charge forward, then back (relative)', basis: 'relative', steps: ['/F', 'B'] },
  { id: 'relative-circle-forward', label: 'Full circle toward forward (relative)', basis: 'relative', steps: ['F', 'DF', 'D', 'DB', 'B', 'UB', 'U', 'UF'] },
  { id: 'relative-circle-back', label: 'Full circle toward back (relative)', basis: 'relative', steps: ['B', 'DB', 'D', 'DF', 'F', 'UF', 'U', 'UB'] },
  { id: 'relative-dash', label: 'Forward dash (relative)', basis: 'relative', steps: ['F', 'F'] },
  { id: 'relative-backdash', label: 'Back dash (relative)', basis: 'relative', steps: ['B', 'B'] },
  { id: 'absolute-qcr', label: 'Quarter-circle right (absolute)', basis: 'absolute', steps: ['D', 'DR', 'R'] },
  { id: 'absolute-qcl', label: 'Quarter-circle left (absolute)', basis: 'absolute', steps: ['D', 'DL', 'L'] },
  { id: 'absolute-dpr', label: 'Dragon-punch right (absolute)', basis: 'absolute', steps: ['R', 'D', 'DR'] },
  { id: 'absolute-dpl', label: 'Dragon-punch left (absolute)', basis: 'absolute', steps: ['L', 'D', 'DL'] },
  { id: 'absolute-hcr', label: 'Half-circle right (absolute)', basis: 'absolute', steps: ['L', 'DL', 'D', 'DR', 'R'] },
  { id: 'absolute-hcl', label: 'Half-circle left (absolute)', basis: 'absolute', steps: ['R', 'DR', 'D', 'DL', 'L'] },
  { id: 'absolute-double-qcr', label: 'Double quarter-circle right (absolute)', basis: 'absolute', steps: ['D', 'DR', 'R', 'D', 'DR', 'R'] },
  { id: 'absolute-double-qcl', label: 'Double quarter-circle left (absolute)', basis: 'absolute', steps: ['D', 'DL', 'L', 'D', 'DL', 'L'] },
  { id: 'absolute-charge-lr', label: 'Charge left, then right (absolute)', basis: 'absolute', steps: ['/L', 'R'] },
  { id: 'absolute-charge-rl', label: 'Charge right, then left (absolute)', basis: 'absolute', steps: ['/R', 'L'] },
  { id: 'absolute-circle-right', label: 'Full circle clockwise from right (absolute)', basis: 'absolute', steps: ['R', 'DR', 'D', 'DL', 'L', 'UL', 'U', 'UR'] },
  { id: 'absolute-circle-left', label: 'Full circle counterclockwise from left (absolute)', basis: 'absolute', steps: ['L', 'DL', 'D', 'DR', 'R', 'UR', 'U', 'UL'] },
  { id: 'vertical-charge-du', label: 'Charge down, then up', basis: 'neutral', steps: ['/D', 'U'] }
]);

function inputBasis(step) {
  const atoms = commandSyntaxLayout(step, '+|').parts.map((part) => part.core.replace(/^(?:(?:~\d*)|[\/>])+/, '').replace(/^[\$*]/, ''));
  const absolute = new Set(['L', 'R', 'DL', 'DR', 'UL', 'UR']), relative = new Set(['B', 'F', 'DB', 'DF', 'UB', 'UF']);
  const hasAbsolute = atoms.some((atom) => absolute.has(atom)), hasRelative = atoms.some((atom) => relative.has(atom));
  if (hasAbsolute && hasRelative) return 'Mixed absolute + facing-relative';
  if (hasAbsolute) return 'Absolute screen direction';
  if (hasRelative) return 'Facing-relative direction';
  if (atoms.some((atom) => ['D', 'U', 'N'].includes(atom))) return 'Direction independent of facing';
  if (atoms.some((atom) => /^[xyzabcswm]$/.test(atom))) return 'Button input';
  return 'Custom native input';
}

function convertDirectionBasis(step, targetBasis) {
  const source = String(step || ''), target = targetBasis === 'absolute' ? 'absolute' : targetBasis === 'relative' ? 'relative' : '';
  if (!target || !nativeInputAtoms(source).length) return source;
  const toRelative = { L: 'B', R: 'F', DL: 'DB', DR: 'DF', UL: 'UB', UR: 'UF' };
  const toAbsolute = { B: 'L', F: 'R', DB: 'DL', DF: 'DR', UB: 'UL', UF: 'UR' };
  const directions = target === 'relative' ? toRelative : toAbsolute, layout = commandSyntaxLayout(source, '+|'), replacements = [];
  for (const part of layout.parts) {
    const match = part.core.match(/^((?:(?:[>/]|~\d*|[\$*])*))(DB|DF|UB|UF|DL|DR|UL|UR|[BFLR])$/);
    if (!match || !directions[match[2]]) continue;
    replacements.push({ start: part.coreStart, end: part.coreEnd, text: match[1] + directions[match[2]] });
  }
  return replaceStepCores(source, replacements);
}

function convertCommandDirectionBasis(command, targetBasis) {
  const layout = commandStepLayout(command), replacements = [];
  for (const step of layout.steps) {
    const converted = convertDirectionBasis(step.core, targetBasis);
    if (converted !== step.core) replacements.push({ start: step.coreStart, end: step.coreEnd, text: converted });
  }
  return replaceStepCores(layout.source, replacements);
}

function combineNativeInput(step, input, relation) {
  const source = String(step || ''), token = String(input || '').trim(), operator = relation === 'alternative' ? '|' : relation === 'simultaneous' ? '+' : '';
  const atoms = nativeInputAtoms(source), insertedAtoms = nativeInputAtoms(token), operators = commandSyntaxLayout(source, '+|').operators;
  if (!operator || !atoms.length || insertedAtoms.length !== 1 || insertedAtoms[0] !== token) return source;
  if (operators.some((item) => item !== operator)) return source;
  const trailing = (source.match(/\s*$/) || [''])[0];
  const core = source.slice(0, source.length - trailing.length), authoredSeparator = operators.length ? (core.match(new RegExp(`\\s*\\${operator}\\s*`)) || [operator])[0] : operator;
  return core + authoredSeparator + token + trailing;
}

function editNativeStepModifier(step, modifier, action = 'apply', releaseFrames = '') {
  const source = String(step || ''), atoms = nativeInputAtoms(source);
  const kind = ['hold', 'release', 'exact', 'direction', 'broadDirection'].includes(modifier) ? modifier : '';
  if (!kind || !atoms.length || !['apply', 'remove'].includes(action)) return source;
  const layout = commandSyntaxLayout(source, '+|'), replacements = [];
  const remove = {
    hold: (prefix) => prefix.replace(/\//g, ''),
    release: (prefix) => prefix.replace(/~\d*/g, ''),
    exact: (prefix) => prefix.replace(/>/g, ''),
    direction: (prefix) => prefix.replace(/\$/g, ''),
    broadDirection: (prefix) => prefix.replace(/\*/g, '')
  }[kind];
  const release = String(releaseFrames == null ? '' : releaseFrames).trim();
  const releaseSuffix = /^\d+$/.test(release) ? release : '';
  for (const part of layout.parts) {
    const match = part.core.match(/^((?:(?:[>/]|~\d*|[\$*])*))(DB|DF|UB|UF|DL|DR|UL|UR|[BDFULRNxyzabcswm])$/);
    if (!match) continue;
    if (kind === 'broadDirection' && !/^(?:DB|DF|UB|UF|DL|DR|UL|UR|[BDFULR])$/.test(match[2])) continue;
    let prefix = remove(match[1]);
    if (action === 'apply') {
      if (kind === 'exact') prefix = '>' + prefix;
      else if (kind === 'direction') prefix = prefix.replace(/\*/g, '') + '$';
      else if (kind === 'broadDirection') prefix = prefix.replace(/\$/g, '') + '*';
      else {
        const leadingExact = prefix.startsWith('>') ? '>' : '';
        if (leadingExact) prefix = prefix.slice(1);
        if (kind === 'hold') prefix = leadingExact + '/' + prefix;
        else {
          const leadingHold = prefix.startsWith('/') ? '/' : '';
          if (leadingHold) prefix = prefix.slice(1);
          prefix = leadingExact + leadingHold + '~' + releaseSuffix + prefix;
        }
      }
    }
    replacements.push({ start: part.coreStart, end: part.coreEnd, text: prefix + match[2] });
  }
  return replaceStepCores(source, replacements);
}

function releaseFinalButtons(command, releaseFrames = '') {
  const source = String(command || ''), layout = commandStepLayout(source), last = layout.steps[layout.steps.length - 1];
  if (!last) return source;
  const atoms = nativeInputAtoms(last.core);
  if (!atoms.length) return source;
  const release = String(releaseFrames == null ? '' : releaseFrames).trim();
  const marker = '~' + (/^\d+$/.test(release) ? release : '');
  const stepLayout = commandSyntaxLayout(last.core, '+|'), replacements = [];
  for (const part of stepLayout.parts) {
    const match = part.core.match(/^((?:(?:[>/]|~\d*|[\$*])*))([xyzabcswm])$/);
    if (!match || /~\d*/.test(match[1])) continue;
    const leadingExact = match[1].startsWith('>') ? '>' : '';
    let rest = leadingExact ? match[1].slice(1) : match[1];
    const leadingHold = rest.startsWith('/') ? '/' : '';
    if (leadingHold) rest = rest.slice(1);
    replacements.push({ start: part.coreStart, end: part.coreEnd, text: leadingExact + leadingHold + marker + rest + match[2] });
  }
  if (!replacements.length) return source;
  const nextStep = replaceStepCores(last.core, replacements);
  return replaceStepCores(source, [{ start: last.coreStart, end: last.coreEnd, text: nextStep }]);
}

function mirrorNativeStep(step) {
  const source = String(step || '');
  if (!nativeInputAtoms(source).length) return source;
  const mirrored = { L: 'R', R: 'L', DL: 'DR', DR: 'DL', UL: 'UR', UR: 'UL', B: 'F', F: 'B', DB: 'DF', DF: 'DB', UB: 'UF', UF: 'UB' };
  const layout = commandSyntaxLayout(source, '+|'), replacements = [];
  for (const part of layout.parts) {
    const match = part.core.match(/^((?:(?:[>/]|~\d*|[\$*])*))(DB|DF|UB|UF|DL|DR|UL|UR|[BFLR])$/);
    if (match && mirrored[match[2]]) replacements.push({ start: part.coreStart, end: part.coreEnd, text: match[1] + mirrored[match[2]] });
  }
  return replaceStepCores(source, replacements);
}

function mirrorCommandDirections(command) {
  const layout = commandStepLayout(command), replacements = [];
  for (const step of layout.steps) {
    const mirrored = mirrorNativeStep(step.core);
    if (mirrored !== step.core) replacements.push({ start: step.coreStart, end: step.coreEnd, text: mirrored });
  }
  return replaceStepCores(layout.source, replacements);
}

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
  if ((operation === 'moveFirst' && at > 0) || (operation === 'moveLast' && at < steps.length - 1)) {
    const cores = steps.map(step => step.core), [moved] = cores.splice(at, 1);
    cores.splice(operation === 'moveFirst' ? 0 : cores.length, 0, moved);
    return replaceStepCores(source, steps.map((step, position) => ({
      start: step.coreStart,
      end: step.coreEnd,
      text: cores[position]
    })));
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
  const layout = commandSyntaxLayout(value, '+|'), operators = layout.operators;
  const atoms = layout.parts.map((item) => item.core), nativeAtoms = nativeInputAtoms(value);
  return {
    index,
    raw: value,
    atoms,
    relation: nativeAtoms.length && operators.includes('+') ? 'simultaneous' : nativeAtoms.length && operators.includes('|') ? 'alternative' : 'single',
    mixedRelation: nativeAtoms.length > 0 && operators.includes('+') && operators.includes('|'),
    exact: nativeAtoms.some((atom) => atom.includes('>')), hold: nativeAtoms.some((atom) => atom.includes('/')), release: nativeAtoms.some((atom) => atom.includes('~')),
    directionModifier: nativeAtoms.some((atom) => atom.includes('$')), broadDirectionModifier: nativeAtoms.some((atom) => atom.includes('*')), neutral: nativeAtoms.some((atom) => /N$/.test(atom))
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
  const sourceText = String(text || ''), lines = sourceText.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/), defaults = defaultsFrom(lines), commands = [];
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
  return splitSteps(command).flatMap(nativeInputAtoms);
}

function nativeInputAtoms(step) {
  const source = String(step || '').trim(), atom = '(?:(?:[>/]|~\\d*|[\\$*])*(?:DB|DF|UB|UF|DL|DR|UL|UR|[BDFULRNxyzabcswm]))';
  if (!new RegExp(`^${atom}(?:\\s*[+|]\\s*${atom})*$`).test(source)) return [];
  return source.match(new RegExp(atom, 'g')) || [];
}

function isMotion(command) {
  const directions = inputTokens(command).filter((token) => /(?:DB|DF|UB|UF|DL|DR|UL|UR|[BDFULRN])$/.test(token));
  return directions.length >= 2;
}

function finalButtons(command) {
  const steps = splitSteps(command), last = steps[steps.length - 1] || '';
  return nativeInputAtoms(last).map((token) => token.match(/[A-Za-z]+$/)?.[0] || '').filter((token) => /^[xyzabcswm]$/.test(token));
}

function diagnosticsFor(command, allCommands = [], options = {}) {
  const issues = [];
  const add = (severity, code, message) => issues.push({ severity, code, message });
  if (!command.name) add('error', 'missing-name', 'The command has no name.');
  if (!command.command) add('warning', 'empty-command', 'The command sequence is empty. This is valid only when intentionally reserving a shared command name.');
  if (command.steps.some((step) => step.mixedRelation)) add('error', 'mixed-step-operators', 'A single step cannot mix + (simultaneous) and | (alternative). Split it into separate commands or steps.');
  if (inputTokens(command.command).some((token) => /m$/.test(token))) add('warning', 'offline-m-button', 'm is the project offline tenth-button compatibility input. Do not present it as a portable or rollback-safe normal character button.');
  if (command.steps.some((step) => step.directionModifier)) add('info', 'direction-modifier', '$ direction-modifier behavior is retained for compatibility, but current IKEMEN documentation says its adjusted behavior is disabled. Review it in engine.');
  if (command.steps.some((step) => step.broadDirectionModifier)) {
    if (nightlyCommandExpressionsEnabled(options.capabilities || options)) add('info', 'nightly-broad-direction', '* broad-direction matching is enabled by the selected verified Nightly target. It accepts the cardinal direction and its two adjacent diagonals without retriggering while moving among them.');
    else add('error', 'unsupported-broad-direction', '* broad-direction matching requires a verified supporting IKEMEN GO Nightly target. Change the project target or replace this modifier before relying on the command.');
  }
  if (inputTokens(command.command).some((atom) => atom.includes('$') && atom.includes('*'))) add('error', 'conflicting-direction-modifiers', '$ and * direction modifiers are mutually exclusive on one input.');
  if (inputTokens(command.command).some((atom) => (atom.match(/\*/g) || []).length > 1)) add('error', 'duplicate-broad-direction', '* may appear only once on a native direction input.');
  if (command.time < 1) add('error', 'invalid-time', 'time must be at least 1 frame.');
  if (command.declaredStepTime !== -1 && command.stepTime < 1) add('error', 'invalid-steptime', 'steptime must be -1 or at least 1 frame.');
  if (command.declaredStepTime === -1 && command.steps.length > 1) add('info', 'steptime-follows-time', `steptime is -1, so each completed step remains valid for the command time (${command.time} frames).`);
  if (command.steps.length > 1) add('info', 'timing-summary', `Whole command: ${command.time} frames. Maximum gap after each completed step: ${command.stepTime} frames.`);
  const nativeSteps = splitSteps(command.command).map(nativeInputAtoms);
  if (nativeSteps.some((atoms, index) => atoms.length === 1 && index && nativeSteps[index - 1].length === 1 && atoms[0] === nativeSteps[index - 1][0] && /(?:DB|DF|UB|UF|DL|DR|UL|UR|[BDFULRN])$/.test(atoms[0])) && command.autoGreater !== 0) add('info', 'autogreater-repeat', 'Repeated directions use native autogreater expansion. Set autogreater = 0 only when strict repeated-direction behavior is intentional.');
  if (isMotion(command.command) && finalButtons(command.command).length && !command.steps.some((step) => step.release)) {
    const release = allCommands.find((other) => other !== command && other.command.includes('~') && other.command.replace(/~/g, '') === command.command.replace(/~/g, ''));
    if (!release) add('suggestion', 'negative-edge-counterpart', 'This motion ends in a press button. Consider an authored release counterpart for the project negative-edge routing policy.');
  }
  const duplicates = allCommands.filter((other) => other !== command && other.name && other.name.toLowerCase() === command.name.toLowerCase());
  if (duplicates.length) add('warning', 'duplicate-name', `Another command uses the name “${command.name}”.`);
  return issues;
}

function commandDocumentTargetDiagnostics(text, options = {}, filename = '') {
  const document = parseCommands(text, filename), targetCodes = new Set(['unsupported-broad-direction', 'conflicting-direction-modifiers', 'duplicate-broad-direction']), output = [];
  for (const command of document.commands) {
    const entry = command.entries?.command, line = Number.isInteger(entry?.line) ? entry.line : command.startLine, raw = document.lines[line] || '', marker = raw.indexOf('*');
    for (const finding of diagnosticsFor(command, document.commands, options).filter((item) => targetCodes.has(item.code))) output.push({ ...finding, line, start: Math.max(0, marker), length: 1 });
  }
  return output;
}

function commandConflictMatrix(commands = []) {
  const normalized = commands.map((command, index) => ({
    index, name: command.name || '(unnamed)',
    steps: splitSteps(command.command).map(normalizeCommandStepForReview).filter(Boolean)
  }));
  const conflicts = [];
  for (let left = 0; left < normalized.length; left += 1) for (let right = left + 1; right < normalized.length; right += 1) {
    const a = normalized[left], b = normalized[right]; if (!a.steps.length || !b.steps.length) continue;
    const sameSequence = a.steps.length === b.steps.length && a.steps.every((step, index) => step === b.steps[index]);
    const prefix = !sameSequence && (a.steps.length < b.steps.length ? a.steps.every((step, index) => step === b.steps[index]) : b.steps.every((step, index) => step === a.steps[index]));
    const sameName = a.name.toLowerCase() === b.name.toLowerCase();
    if (sameSequence) conflicts.push({ kind: sameName ? 'paired-definition' : 'sequence-alias', left: a.index, right: b.index, label: sameName ? 'Same-name paired definitions' : 'Different names share one exact sequence', summary: `${a.name} ↔ ${b.name}` });
    else if (prefix) conflicts.push({ kind: 'prefix-overlap', left: a.index, right: b.index, label: 'One sequence is a prefix of another', summary: `${a.name} ↔ ${b.name}` });
    else if (sameName) conflicts.push({ kind: 'same-name-alternative', left: a.index, right: b.index, label: 'Same name has alternate definitions', summary: `${a.name} · definitions ${a.index + 1} and ${b.index + 1}` });
  }
  return conflicts;
}

function commandAuthoringMode(command = {}) {
  if (command.authoringMode === 'ikemen-commercial' || command.authoringMode === 'mugen') return command.authoringMode;
  const entries = command.entries || {};
  if (entries.steptime && !entries.time) return 'ikemen-commercial';
  if (entries.time && !entries.steptime) return 'mugen';
  return 'legacy-mixed';
}

function commandInsertionReview(commands = [], draft = {}) {
  const draftSteps = splitSteps(draft.command).map(normalizeCommandStepForReview).filter(Boolean);
  const contains = (whole, part) => part.length <= whole.length && whole.some((_, start) =>
    start + part.length <= whole.length && part.every((step, offset) => whole[start + offset] === step));
  const overlaps = [];
  commands.forEach((command, index) => {
    const steps = splitSteps(command.command).map(normalizeCommandStepForReview).filter(Boolean);
    if (!steps.length || !draftSteps.length) return;
    const same = steps.length === draftSteps.length && steps.every((step, at) => step === draftSteps[at]);
    const draftContainsExisting = !same && contains(draftSteps, steps);
    const existingContainsDraft = !same && contains(steps, draftSteps);
    if (!same && !draftContainsExisting && !existingContainsDraft) return;
    overlaps.push({
      index, name: command.name || '(unnamed)', command: command.command || '',
      relation: same ? 'same' : draftContainsExisting ? 'draft-more-specific' : 'existing-more-specific',
      summary: same ? 'uses the same sequence' : draftContainsExisting ? 'is shorter and may consume this command first' : 'is more specific and should remain above this command'
    });
  });
  const shorter = overlaps.filter(item => item.relation === 'draft-more-specific');
  const beforeIndex = shorter.length ? Math.min(...shorter.map(item => item.index)) : commands.length;
  return { beforeIndex, overlaps, reordered: beforeIndex < commands.length };
}

function normalizeCommandStepForReview(step) {
  const source = String(step || '').trim();
  const nativeAtom = '(?:(?:[>/]|~\\d*|[\\$*])*(?:DB|DF|UB|UF|DL|DR|UL|UR|[BDFULRNxyzabcswm]))';
  return new RegExp(`^${nativeAtom}(?:\\s*[+|]\\s*${nativeAtom})*$`).test(source) ? source.replace(/\s+/g, '') : source;
}

function commandBlock(values) {
  const lines = ['[Command]', `name = "${String(values.name || '').replace(/"/g, '')}"`, `command = ${values.command || ''}`];
  for (const [key, value] of [['time', values.time], ['steptime', values.steptime], ['autogreater', values.autogreater], ['buffer.time', values.bufferTime], ['buffer.hitpause', values.bufferHitpause], ['buffer.pauseend', values.bufferPauseend], ['buffer.shared', values.bufferShared]]) {
    if (value !== undefined && value !== null && value !== '') lines.push(`${key} = ${value}`);
  }
  return lines.join('\n');
}

function replaceCommandBlock(document, command, nextBlock) {
  const eol = (String(document.text || '').match(/\r\n|\r|\n/) || ['\n'])[0];
  const lines = [...document.lines];
  lines.splice(command.startLine, command.endLine - command.startLine, ...String(nextBlock).split(/\r\n|\r|\n/), '');
  return lines.join(eol);
}

function commandBlockText(document, command) {
  if (!document || !command) return '';
  const eol = (String(document.text || '').match(/\r\n|\r|\n/) || ['\n'])[0];
  return document.lines.slice(command.startLine, command.endLine).join(eol).replace(/(?:\r\n|\r|\n)+$/, '');
}

function validateCommandBlockText(text) {
  const source = String(text || ''), sectionNames = [...source.matchAll(/^\s*\[([^\]]+)\]\s*(?:;.*)?$/gm)].map(match => match[1].trim().toLowerCase());
  if (sectionNames.length !== 1 || sectionNames[0] !== 'command') throw new Error('The constrained source editor accepts exactly one [Command] block and no other sections.');
  const parsed = parseCommands(source, 'reviewed-command-block');
  if (parsed.commands.length !== 1 || !parsed.commands[0].name || !parsed.commands[0].command) throw new Error('The reviewed [Command] block needs both a name and command sequence.');
  return parsed.commands[0];
}

function appendCommandBlock(document, nextBlock) {
  const source = String(document?.text || ''), blockSource = String(nextBlock || ''), endings = [...source.matchAll(/\r\n|\r|\n/g)], blockEndings = [...blockSource.matchAll(/\r\n|\r|\n/g)], eol = endings.at(-1)?.[0] || blockEndings[0]?.[0] || '\n';
  const rendered = blockSource.replace(/\r\n|\r|\n/g, eol);
  const renderedEndsWithEol = /(?:\r\n|\r|\n)$/.test(rendered);
  if (!source) return rendered + (renderedEndsWithEol ? '' : eol);
  const endsWithEol = /(?:\r\n|\r|\n)$/.test(source);
  const withoutFinalEol = source.endsWith('\r\n') ? source.slice(0, -2) : endsWithEol ? source.slice(0, -1) : source;
  const endsWithBlankLine = endsWithEol && /(?:\r\n|\r|\n)[ \t]*$/.test(withoutFinalEol);
  return source + (endsWithBlankLine ? '' : endsWithEol ? eol : eol + eol) + rendered + (renderedEndsWithEol ? '' : eol);
}

function insertCommandBlock(document, nextBlock, beforeIndex) {
  const command = document?.commands?.[Number(beforeIndex)];
  if (!command) return appendCommandBlock(document, nextBlock);
  const source = String(document.text || ''), blockSource = String(nextBlock || ''), eol = (source.match(/\r\n|\r|\n/) || blockSource.match(/\r\n|\r|\n/) || ['\n'])[0];
  const rendered = blockSource.replace(/\r\n|\r|\n/g, eol).replace(/(?:\r\n|\r|\n)+$/, '');
  const records = source.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) || [];
  const offset = records.slice(0, command.startLine).join('').length;
  const prefix = source.slice(0, offset), suffix = source.slice(offset);
  const separatorBefore = prefix && !/(?:\r\n|\r|\n)$/.test(prefix) ? eol + eol : prefix && !/(?:\r\n|\r|\n){2}$/.test(prefix) ? eol : '';
  return prefix + separatorBefore + rendered + eol + eol + suffix;
}

function facingCommandTrigger(options = {}) {
  const left = String(options.leftName || 'left_command').replace(/"/g, ''), right = String(options.rightName || 'right_command').replace(/"/g, '');
  return `(facing = 1 && command = "${right}") || (facing = -1 && command = "${left}")`;
}

function aerialTurnPolicy(options = {}) {
  const mode = options.mode === 'distance' ? 'distance' : 'locked', distance = Math.max(0, Math.round(Number(options.distance) || 0));
  if (mode === 'locked') return `; Keep the current facing throughout aerial states.\nassertSpecial{flag: noAutoTurn}`;
  return `; Keep engine auto-turn disabled, then allow only this reviewed aerial crossover.\nassertSpecial{flag: noAutoTurn}\nif stateType = A && numEnemy && p2Dist x < const240p(-${distance}) {\n    turn{}\n}`;
}

function assignmentValue(line, value) {
  const source = String(line || ''), code = uncomment(source), suffix = source.slice(code.length);
  const match = code.match(/^(\s*[^=]+?)(\s*=\s*)(.*?)(\s*)$/);
  return match ? `${match[1]}${match[2]}${value}${match[4]}${suffix}` : source;
}

function patchCommandBlock(document, command, values = {}) {
  const source = String(document.text || ''), records = [];
  const expression = /([^\r\n]*)(\r\n|\r|\n|$)/g;
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
    const defaultEol = records.find(record => record.eol)?.eol || '\n', endedWithEol = /(?:\r\n|\r|\n)$/.test(source);
    if (insertion === records.length && records.length && !records[records.length - 1].eol) records[records.length - 1].eol = defaultEol;
    const added = additions.map((body, index) => ({ body, eol: insertion < records.length || index < additions.length - 1 || endedWithEol ? defaultEol : '' }));
    records.splice(insertion, 0, ...added);
  }
  return records.map(record => record.body + record.eol).join('');
}

function parseMovelistAssignments(text, filename = '') {
  const lines = String(text || '').split(/\r\n|\r|\n/); let inFiles = false; const entries = [];
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
  return String(text || '').split(/\r\n|\r|\n/).map((raw, line) => {
    const glyphs = [...raw.matchAll(/_([A-Z0-9]+)_?|\^([A-Za-z0-9]+)/g)].map((match) => match[1] || match[2]);
    const visible = raw.replace(/<#[0-9a-f]{6}>|<\/>/gi, '').replace(/_([A-Z0-9]+)_?/g, '[$1]').replace(/\^([A-Za-z0-9]+)/g, '[$1]');
    return { line, raw, visible, glyphs };
  });
}

function changeMovelistSnippet(slot) { return `[State Change Movelist]\ntype = ChangeMovelist\ntrigger1 = 1\nvalue = ${Number(slot) || 0}`; }

module.exports = {
  uncomment, parseCommands, splitSteps, stepModel, diagnosticsFor, commandDocumentTargetDiagnostics, commandBlock, commandBlockText, validateCommandBlockText, replaceCommandBlock, appendCommandBlock, insertCommandBlock, patchCommandBlock,
  parseMovelistAssignments, movelistPreview, changeMovelistSnippet, nativeInputAtoms, isMotion, finalButtons,
  INSERTABLE_INPUTS, NIGHTLY_STAR_INPUTS, insertableInputs, nightlyCommandExpressionsEnabled, COMMAND_SEQUENCE_RECIPES, inputBasis, convertDirectionBasis, convertCommandDirectionBasis, combineNativeInput, editNativeStepModifier, releaseFinalButtons, mirrorNativeStep, mirrorCommandDirections, commandSyntaxLayout, commandStepLayout, replaceStepCores, editCommandSteps, mergeNormalizedEditorText, normalizeCommandStepForReview, commandConflictMatrix, commandAuthoringMode, commandInsertionReview, facingCommandTrigger, aerialTurnPolicy
};
