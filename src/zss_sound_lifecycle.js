'use strict';

const { mask } = require('./viewer_used_by_model');

function maskedZss(text) {
  return mask(String(text || ''), true).split(/\r?\n/).map(line => {
    const at = line.indexOf('#'); return at < 0 ? line : line.slice(0, at) + ' '.repeat(line.length - at);
  }).join('\n');
}

function location(text, absolute) {
  const before = text.slice(0, Math.max(0, absolute)), lines = before.split('\n');
  return { line: lines.length - 1, start: lines[lines.length - 1].replace(/\r$/, '').length };
}

function controllerBlocks(text) {
  const code = maskedZss(text), blocks = [], pattern = /\b(playSnd|stopSnd|modifySnd)\s*\{/gi;
  for (let match = pattern.exec(code); match; match = pattern.exec(code)) {
    const open = match.index + match[0].lastIndexOf('{'); let depth = 1, close = -1;
    for (let index = open + 1; index < code.length; index += 1) {
      if (code[index] === '{') depth += 1;
      else if (code[index] === '}') { depth -= 1; if (!depth) { close = index; break; } }
    }
    if (close < 0) continue;
    const body = code.slice(open + 1, close), fields = new Map(), fieldPattern = /(?:^|[;\n])\s*([A-Za-z_][A-Za-z0-9_.]*)\s*:\s*([^;\n}]*)/g;
    for (let field = fieldPattern.exec(body); field; field = fieldPattern.exec(body)) {
      const name = field[1].toLowerCase(), value = field[2].trim(), relative = field.index + field[0].indexOf(field[1]);
      fields.set(name, { name, value, absolute: open + 1 + relative, ...location(code, open + 1 + relative) });
    }
    blocks.push({ name: match[1].toLowerCase(), start: location(code, match.index), fields, source: code.slice(match.index, close + 1) });
    pattern.lastIndex = close + 1;
  }
  return blocks;
}

function literalInteger(field) {
  if (!field || !/^[+-]?\d+$/.test(field.value)) return undefined;
  const value = Number(field.value); return Number.isSafeInteger(value) ? value : undefined;
}

function finding(code, severity, block, field, message, help) {
  const target = field || block.start;
  return { code, severity, line: target.line, start: target.start, length: field ? Math.max(1, field.name.length) : block.name.length, message, help };
}

function analyzeSoundLifecycle(text) {
  const findings = [];
  for (const block of controllerBlocks(text)) {
    const channelField = block.fields.get('channel'), channel = literalInteger(channelField);
    if (block.name === 'playsnd') {
      const loop = literalInteger(block.fields.get('loop')), loopCountField = block.fields.get('loopcount'), loopCount = literalInteger(loopCountField);
      const provenEndless = loop !== undefined && loop !== 0 && (!loopCountField || loopCount === 0);
      const provenAutomatic = !channelField || channel === -1;
      if (provenEndless && provenAutomatic) findings.push(finding('playsnd-loop-auto-channel', 'information', block, channelField || block.fields.get('loop'),
        'Looping PlaySnd uses automatic channel -1, so later channel-specific StopSnd or ModifySnd cannot address this instance reliably.',
        'Assign an intentional owned channel when the loop must be modified or stopped specifically, or use reviewed automatic lifecycle cleanup. IKEMaker does not choose a channel.'));
    } else if (block.name === 'stopsnd' && channel === -1) {
      findings.push(finding('stopsnd-global-channel', 'warning', block, channelField,
        'StopSnd channel -1 stops all sounds for all players.',
        'Use channel -2 only when the intent is to stop this entity’s own channels, or keep -1 only for a reviewed global-stop contract.'));
    } else if (block.name === 'modifysnd' && block.fields.has('position') && (!channelField || channel === -1)) {
      findings.push(finding('modifysnd-auto-position', 'warning', block, block.fields.get('position'),
        'ModifySnd position has undefined behavior when channel is unspecified (-1).',
        'Address one intentional literal channel before changing playback position. Dynamic or inferred channels are not rewritten by IKEMaker.'));
    }
  }
  return findings;
}

module.exports = { maskedZss, controllerBlocks, literalInteger, analyzeSoundLifecycle };
