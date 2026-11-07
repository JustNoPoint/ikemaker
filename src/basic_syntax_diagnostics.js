'use strict';

const controllers = require('../data/sctrl.json');
const triggers = require('./trigger_catalog_normalization').normalizeTriggerCatalog(require('../data/triggers.json'));
const { zssControllerName } = require('./sctrl');

const CONTROLLERS = new Set(controllers.flatMap(entry => [entry.name, zssControllerName(entry.name)]).map(value => value.toLowerCase()));
const TRIGGERS = new Set(triggers.map(entry => String(entry.name).toLowerCase()));
const STRUCTURES = new Set(['if','else','for','while','switch','case','default','persistent','ignorehitpause']);
const CALL_KEYWORDS = new Set(['if','for','while','switch','call','return','map','const','var','fvar','sysvar']);

function issue(line, start, length, code, message) { return { line, start: Math.max(0, start), length: Math.max(1, length), severity: 'warning', code, message }; }
function uncomment(line, languageId) {
  const source = String(line), marker = languageId === 'ikemen-cns' ? ';' : '#'; let quote = '', escaped = false;
  for (let index = 0; index < source.length; index += 1) { const value = source[index]; if (quote) { if (escaped) escaped = false; else if (value === '\\') escaped = true; else if (value === quote) quote = ''; continue; } if (value === '"' || value === "'") quote = value; else if (value === marker) return source.slice(0, index); }
  return source;
}

function maskedLine(raw, languageId) {
  const source = uncomment(raw, languageId), output = source.split(''); let quote = '', escaped = false, unterminated = null;
  for (let index = 0; index < source.length; index += 1) {
    const value = source[index];
    if (quote) { output[index] = ' '; if (escaped) escaped = false; else if (value === '\\') escaped = true; else if (value === quote) quote = ''; continue; }
    if (value === '"' || value === "'") { quote = value; unterminated = index; output[index] = ' '; }
  }
  return { text: output.join(''), unterminated: quote ? unterminated : null };
}

function matchingBrace(source, open) {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) { if (source[index] === '{') depth += 1; else if (source[index] === '}' && --depth === 0) return index; }
  return -1;
}

function balancedExpressionDelimiters(source) {
  const stack = [];
  for (let index = 0; index < source.length; index += 1) {
    const value = source[index];
    if (value === '(' || value === '[') {
      const before = source.slice(0, index).trimEnd();
      stack.push({ open: value, comma: false, call: value === '(' && /[A-Za-z0-9_.$]$/.test(before) });
      continue;
    }
    if (value === ',' && stack.length) { stack[stack.length - 1].comma = true; continue; }
    if (value !== ')' && value !== ']') continue;
    const frame = stack.at(-1); if (!frame) return false;
    const ordinary = frame.open === '(' && value === ')' || frame.open === '[' && value === ']';
    const interval = frame.comma && !frame.call && (frame.open === '[' && value === ')' || frame.open === '(' && value === ']');
    if (!ordinary && !interval) return false;
    stack.pop();
  }
  return stack.length === 0;
}

function structureIssues(lines, languageId) {
  const findings = [], stack = [];
  for (let line = 0; line < lines.length; line += 1) {
    const masked = maskedLine(lines[line], languageId);
    if (masked.unterminated !== null) findings.push(issue(line, masked.unterminated, 1, 'unterminated-string', 'String literal is not closed on this line.'));
    if (/^\s*\[/.test(uncomment(lines[line], languageId)) && !/\]/.test(uncomment(lines[line], languageId))) { let closed = false; for (let cursor = line + 1; cursor < lines.length && cursor <= line + 32; cursor += 1) { if (/\]/.test(uncomment(lines[cursor], languageId))) { closed = true; break; } if (/^\s*\[/.test(uncomment(lines[cursor], languageId))) break; } if (!closed) findings.push(issue(line, Math.max(0, lines[line].indexOf('[')), 1, 'unclosed-section-header', 'Section header is missing a closing ].')); }
    if (languageId !== 'zss') continue;
    for (let column = 0; column < masked.text.length; column += 1) {
      if (masked.text[column] === '{') stack.push({ line, column });
      else if (masked.text[column] === '}') { if (stack.length) stack.pop(); else findings.push(issue(line, column, 1, 'unmatched-closing-brace', 'Closing brace has no matching opening brace.')); }
    }
  }
  for (const entry of stack.slice(-50)) findings.push(issue(entry.line, entry.column, 1, 'unclosed-brace', 'Opening brace is not closed.'));
  return findings;
}

function missingSemicolonIssues(lines) {
  const findings = [];
  const significantAfter = line => { for (let index = line + 1; index < lines.length; index += 1) { const code = uncomment(lines[index], 'zss').trim(); if (code) return code; } return ''; };
  for (let line = 0; line < lines.length; line += 1) {
    const raw = uncomment(lines[line], 'zss'), code = raw.trim();
    if (!code || /^\[/.test(code) || /[;{}]\s*$/.test(code) || /^\s*(?:if|else|for|while|switch|case|default)\b/i.test(code)) continue;
    const masked = maskedLine(raw, 'zss').text, balanced = balancedExpressionDelimiters(masked);
    if (!balanced || /(?:,|\+|-|\*|\/|&&|\|\||:=|=)\s*$/.test(masked) || /^(?:\+|-|\*|\/|&&|\|\||,)/.test(significantAfter(line))) continue;
    const parameter = /^\s*[A-Za-z_][A-Za-z0-9_.]*\s*:\s*.+/.test(raw), statement = /^\s*(?:let\s+[A-Za-z_][A-Za-z0-9_]*\s*:=|call\s+[A-Za-z_][A-Za-z0-9_.]*\s*\(|return\b|\$?[A-Za-z_][A-Za-z0-9_.]*(?:\([^)]*\))?\s*(?::=|\+=|-=|=))/.test(raw);
    if ((parameter || statement) && !(parameter && /^}/.test(significantAfter(line)))) findings.push(issue(line, raw.length, 1, 'missing-semicolon', 'Statement is missing a terminating semicolon.'));
  }
  return findings;
}

function zssControllerBlocks(text) {
  const masked = String(text).split(/\r?\n/).map(line => maskedLine(line, 'zss').text).join('\n'), blocks = [];
  const pattern = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\{/g; let match;
  while ((match = pattern.exec(masked))) {
    const name = match[1], open = masked.indexOf('{', match.index), close = matchingBrace(masked, open);
    if (close < 0) continue;
    const before = masked.slice(0, match.index), line = (before.match(/\n/g) || []).length;
    if (CONTROLLERS.has(name.toLowerCase())) blocks.push({ name, open, close, line, body: masked.slice(open + 1, close) });
    pattern.lastIndex = open + 1;
  }
  return { masked, blocks };
}

function duplicateParameterIssues(text, languageId) {
  const findings = [];
  if (languageId === 'zss') {
    for (const block of zssControllerBlocks(text).blocks) {
      const seen = new Map(), linesBefore = text.slice(0, block.open + 1).split(/\r?\n/).length - 1;
      for (const [offset, raw] of block.body.split(/\r?\n/).entries()) {
        const match = /^\s*([A-Za-z_][A-Za-z0-9_.]*)\s*:/.exec(raw); if (!match) continue;
        const key = match[1].toLowerCase(), line = linesBefore + offset;
        if (seen.has(key)) findings.push(issue(line, raw.indexOf(match[1]), match[1].length, 'duplicate-controller-parameter', `${block.name}.${match[1]} is assigned more than once in this controller.`)); else seen.set(key, line);
      }
    }
    return findings;
  }
  const lines = String(text).split(/\r?\n/); let state = false, seen = new Map(), type = 'controller';
  for (let line = 0; line < lines.length; line += 1) {
    const code = uncomment(lines[line], languageId), header = /^\s*\[\s*([^\]]+)\]/.exec(code);
    if (header) { state = /^state\b/i.test(header[1]); seen = new Map(); type = 'controller'; continue; }
    if (!state) continue;
    const field = /^\s*([A-Za-z_][A-Za-z0-9_.]*)\s*=/.exec(code); if (!field || /^trigger\d*$/i.test(field[1])) continue;
    if (/^type$/i.test(field[1])) type = code.slice(code.indexOf('=') + 1).trim() || type;
    const key = field[1].toLowerCase(); if (seen.has(key)) findings.push(issue(line, code.indexOf(field[1]), field[1].length, 'duplicate-controller-parameter', `${type}.${field[1]} is assigned more than once in this controller.`)); else seen.set(key, line);
  }
  return findings;
}

function unknownControllerIssues(text, languageId, ignored) {
  const findings = [], lines = String(text).split(/\r?\n/);
  if (languageId === 'ikemen-cns') {
    let state = false;
    for (let line = 0; line < lines.length; line += 1) { const code = uncomment(lines[line], languageId), header = /^\s*\[\s*([^\]]+)\]/.exec(code); if (header) { state = /^state\b/i.test(header[1]); continue; } if (!state) continue; const match = /^\s*type\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/i.exec(code); if (match && !CONTROLLERS.has(match[1].toLowerCase()) && !ignored.has(match[1].toLowerCase())) findings.push(issue(line, code.indexOf(match[1]), match[1].length, 'unknown-controller', `Unknown state controller ${match[1]}.`)); }
    return findings;
  }
  for (let line = 0; line < lines.length; line += 1) { const code = maskedLine(lines[line], 'zss').text, match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\{/.exec(code); if (!match) continue; const key = match[1].toLowerCase(); if (CONTROLLERS.has(key) || STRUCTURES.has(key) || ignored.has(key)) continue; findings.push(issue(line, code.indexOf(match[1]), match[1].length, 'unknown-controller', `Unknown controller or structure ${match[1]}.`)); }
  return findings;
}

function unknownTriggerIssues(text, languageId, ignored) {
  const findings = [], lines = String(text).split(/\r?\n/), declared = new Set([...String(text).matchAll(/\[\s*Function\s+([A-Za-z_][A-Za-z0-9_.]*)/gi)].map(match => match[1].toLowerCase()));
  for (let line = 0; line < lines.length; line += 1) {
    const code = maskedLine(lines[line], languageId).text;
    if (languageId === 'ikemen-cns' && !/^\s*trigger\d*\s*=/i.test(code)) continue;
    if (languageId === 'zss' && !/^\s*(?:if|else\s+if|while|for|let|return)\b/i.test(code)) continue;
    const calls = /\b([A-Za-z_][A-Za-z0-9_.]*)\s*\(/g; let match;
    while ((match = calls.exec(code))) { const key = match[1].toLowerCase(); if (TRIGGERS.has(key) || declared.has(key) || ignored.has(key) || CALL_KEYWORDS.has(key)) continue; findings.push(issue(line, match.index, match[1].length, 'unknown-trigger', `Unknown trigger or function ${match[1]}. Add it to the ignored-name setting if it is supplied externally.`)); }
  }
  return findings;
}

function controlFlowIssues(text) {
  const source = String(text), masked = source.split(/\r?\n/).map(line => maskedLine(line, 'zss').text).join('\n'), findings = [], loopRanges = [], switchRanges = [];
  for (const spec of [{ re: /\b(?:for|while)\b[^{}]*\{/g, target: loopRanges }, { re: /\bswitch\b[^{}]*\{/g, target: switchRanges }]) { let match; while ((match = spec.re.exec(masked))) { const open = masked.indexOf('{', match.index), close = matchingBrace(masked, open); if (close >= 0) spec.target.push([open, close]); } }
  const location = offset => { const before = masked.slice(0, offset), line = (before.match(/\n/g) || []).length; return { line, column: offset - (before.lastIndexOf('\n') + 1) }; };
  for (const match of masked.matchAll(/\b(break|continue)\b/g)) { const inLoop = loopRanges.some(([start, end]) => match.index > start && match.index < end), inSwitch = switchRanges.some(([start, end]) => match.index > start && match.index < end); if (!inLoop && !(match[1].toLowerCase() === 'break' && inSwitch)) { const at = location(match.index); findings.push(issue(at.line, at.column, match[1].length, 'loop-control-outside-loop', `${match[1]} is outside a compatible ${match[1].toLowerCase() === 'break' ? 'loop or switch' : 'loop'} block.`)); } }
  for (const [start, end] of switchRanges) { const body = masked.slice(start + 1, end), defaults = [...body.matchAll(/\bdefault\s*:/gi)].filter(match => { const absolute = start + 1 + match.index; return !switchRanges.some(([nestedStart, nestedEnd]) => nestedStart > start && nestedEnd < end && absolute > nestedStart && absolute < nestedEnd); }); for (const duplicate of defaults.slice(1)) { const at = location(start + 1 + duplicate.index); findings.push(issue(at.line, at.column, duplicate[0].length, 'duplicate-switch-default', 'Switch block contains more than one default case.')); } }
  return findings;
}

function basicSyntaxIssues(text, languageId, options = {}) {
  if (options.enabled === false) return [];
  const source = String(text || ''); if (Buffer.byteLength(source, 'utf8') > 4 * 1024 * 1024) return [];
  const safeIgnored = (Array.isArray(options.ignoredNames) ? options.ignoredNames : []).slice(0, 512).map(value => String(value)).filter(value => /^[A-Za-z_][A-Za-z0-9_.]*$/.test(value) && Buffer.byteLength(value, 'utf8') <= 128);
  const lines = source.split(/\r?\n/), ignored = new Set(safeIgnored.map(value => value.toLowerCase())); let findings = [];
  if (options.structure !== false) findings.push(...structureIssues(lines, languageId));
  if (languageId === 'zss' && options.missingSemicolons !== false) findings.push(...missingSemicolonIssues(lines));
  if (options.duplicateParameters !== false) findings.push(...duplicateParameterIssues(source, languageId));
  if (options.unknownControllers !== false) findings.push(...unknownControllerIssues(source, languageId, ignored));
  if (options.unknownTriggers === true) findings.push(...unknownTriggerIssues(source, languageId, ignored));
  if (languageId === 'zss' && options.controlFlow !== false) findings.push(...controlFlowIssues(source));
  return findings.slice(0, 500);
}

module.exports = { balancedExpressionDelimiters, basicSyntaxIssues, controlFlowIssues, duplicateParameterIssues, missingSemicolonIssues, structureIssues, unknownControllerIssues, unknownTriggerIssues };
