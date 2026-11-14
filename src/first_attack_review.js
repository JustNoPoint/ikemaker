'use strict';

const crypto = require('crypto');

// Keep confirmations tied to the source the creator actually tested.
function reviewStamp(parts) {
  const hash = crypto.createHash('sha256');
  for (const part of parts) {
    const data = Buffer.isBuffer(part) ? part : Buffer.from(String(part));
    hash.update(String(data.length) + ':').update(data);
  }
  return hash.digest('hex');
}

function reviewedSteps(artwork, stamp, saved = {}, authored = {}) {
  const state = artwork.hasAction && (authored.state === true || saved.state === stamp);
  const binding = state && (authored.binding === true || saved.binding === stamp);
  return { state, binding, hit: binding && artwork.attackBoxFrame >= 0 && saved.hit === stamp };
}

// Inspect live assigned documents only. This proves authored connections, never a hit
// or that runtime conditions will execute. Complex/dynamic cases remain manual.
function inspectAttackSources(sources, action, selectedState) {
  const { parseStateSource, maskSource } = require('./state_transfer_model');
  const { parseStateDefaultAnimation } = require('./state_animation_authority');
  const { parseChangeAnimations } = require('./state_change_animation_authority');
  const { parseCommands } = require('./command_movelist_model');
  const states = [], parsed = [], commands = [];
  let complete = true;
  for (const source of sources) {
    if (source.available === false) { complete = false; continue; }
    const text = String(source.text || ''), result = parseStateSource(text, source.filename);
    parsed.push({ ...source, text, result });
    if (source.command === true) commands.push(...parseCommands(text, source.filename).commands);
    const starts = [0]; for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
    for (let i = 0; i < result.declarations.length; i++) {
      const declaration = result.declarations[i], start = starts[declaration.line], end = starts[result.declarations[i + 1]?.line] ?? text.length;
      const body = text.slice(start, end), masked = maskSource(body, result.grammar);
      const component = { kind: 'state', syntax: result.grammar, text: body, startLine: declaration.line };
      const initial = parseStateDefaultAnimation(component), changes = parseChangeAnimations(body, result.grammar);
      const actions = [...(initial.available ? [initial.action] : []), ...changes.filter(change => change.available).map(change => change.action)];
      const headers = [...masked.matchAll(/^\s*\[([^\]\r\n]+)\]/gm)];
      const hasHitDef = result.grammar === 'cns' ? headers.some((header, index) => {
        if (!/^state(?:\s|,)/i.test(header[1])) return false;
        const block = masked.slice(header.index + header[0].length, headers[index + 1]?.index ?? masked.length);
        const types = [...block.matchAll(/^\s*type\s*=\s*(.*?)\s*$/gim)];
        return types.length === 1 && /^hitdef$/i.test(types[0][1]);
      }) : /(?:^|[{};])\s*hitDef\s*\{/im.test(masked);
      states.push({ number: declaration.value, dynamic: declaration.dynamic, filename: source.filename, line: declaration.line,
        action: actions.length && changes.every(change => change.available) && actions.every(value => value === actions[0]) ? actions[0] : null,
        hasHitDef, custom: /@customstate\b/i.test(body) });
    }
  }
  const candidates = states.filter(state => !state.dynamic && state.number >= 0 && state.action === action && state.hasHitDef && !state.custom);
  const eligible = Number.isInteger(selectedState) && selectedState >= 0 ? states.filter(state => !state.dynamic && state.number === selectedState) : candidates;
  const target = complete && eligible.length === 1 && states.filter(state => state.number === eligible[0].number && !state.dynamic).length === 1 ? eligible[0] : null;
  const state = Boolean(target && target.action === action && target.hasHitDef && !target.custom);
  const bindings = [];
  const clean = (text, grammar) => text.split(/\r?\n/).map(line => {
    let quoted = false; for (let i = 0; i < line.length; i++) {
      if (line[i] === '"' && line[i - 1] !== '\\') quoted = !quoted;
      if (!quoted && line[i] === (grammar === 'cns' ? ';' : '#')) return line.slice(0, i);
    } return line;
  }).join('\n');
  const namedCommand = condition => {
    // Restrict automatic recognition to conjunctive, unredirected positive checks.
    if (/[|{}?,]/.test(condition) || /\b(?:or|else)\b/i.test(condition)) return '';
    const terms = condition.trim().split(/&&/).map(term => term.trim());
    if (!terms.every(term => /^(?:ctrl(?:\s*=\s*1)?|statetype\s*=\s*[SAC]|command\s*=\s*"[^"\\]+"|1)$/i.test(term))) return '';
    const match = /(?:^|&&)\s*command\s*=\s*"([^"\\]+)"\s*(?=&&|$)/i.exec(condition);
    return match?.[1] || '';
  };
  if (state) for (const source of parsed) for (const transfer of source.result.transfers) {
    if (transfer.kind !== 'changestate' || transfer.owner?.value !== -1 || transfer.literal !== target.number || transfer.dynamic || transfer.ambiguous || transfer.redirected || transfer.playerNoOverride || transfer.malformed || transfer.structurallyInvalid) continue;
    let name = '';
    if (source.result.grammar === 'cns') {
      const block = clean(source.text.slice(transfer.controllerStart, transfer.controllerEnd), 'cns');
      const triggers = [...block.matchAll(/^\s*trigger(all|\d+)\s*=\s*(.*)$/gim)];
      const all = triggers.filter(item => item[1].toLowerCase() === 'all').map(item => item[2]);
      const onlyOne = triggers.every(item => (item[1].toLowerCase() === 'all' || item[1] === '1') && item[2].trim().split(/&&/).every(term => /^(?:ctrl(?:\s*=\s*1)?|statetype\s*=\s*[SAC]|command\s*=\s*"[^"\\]+"|1)$/i.test(term.trim())));
      name = onlyOne ? all.map(namedCommand).find(Boolean) || triggers.map(item => namedCommand(item[2])).find(Boolean) || '' : '';
    } else {
      const prefix = clean(source.text.slice(0, transfer.controllerStart), 'zss');
      const condition = /\bif\s+([^{}]+)\{\s*$/.exec(prefix);
      if (condition) name = namedCommand(condition[1]);
    }
    const definitions = commands.filter(command => command.name === name && String(command.command || '').trim());
    if (name && definitions.length === 1) bindings.push({ command: name, filename: source.filename, line: transfer.line });
  }
  const names = [...new Set(bindings.map(binding => binding.command))];
  return { state, binding: state && names.length === 1, target, command: names.length === 1 ? names[0] : '',
    reason: !complete ? 'An assigned source is unavailable; inspect the state and binding manually.' : !target ? 'No unique literal attack StateDef resolved; choose its state number or inspect dynamic sources manually.' : !state ? 'The selected StateDef does not establish this animation and a HitDef; inspect it manually.' : !names.length ? 'No simple positive command binding resolved; inspect dynamic or conditional bindings manually.' : names.length > 1 ? 'Multiple commands enter this state; inspect the binding manually.' : 'Authored animation, HitDef and named command connection found; runtime behavior still needs testing.' };
}

module.exports = { reviewStamp, reviewedSteps, inspectAttackSources };
