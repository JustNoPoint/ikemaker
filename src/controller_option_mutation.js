'use strict';

function lineStarts(text) {
  const value = String(text || ''), starts = [0];
  for (let index = 0; index < value.length; index += 1) if (value[index] === '\n') starts.push(index + 1);
  return starts;
}

function lineStart(text, line) {
  const starts = lineStarts(text), index = Math.max(0, Number(line) || 0);
  return index < starts.length ? starts[index] : String(text || '').length;
}

function localEol(text, offset) {
  const value = String(text || ''), before = value.slice(0, Math.max(0, offset)); let found = '', match;
  for (const pattern = /\r\n|\n/g; (match = pattern.exec(before));) found = match[0];
  if (found) return found;
  return (/\r\n|\n/.exec(value.slice(Math.max(0, offset))) || [])[0] || '\n';
}

function matchingBrace(text, open) {
  let depth = 0, quote = '', lineComment = false, blockComment = false;
  for (let index = open; index < text.length; index += 1) {
    const character = text[index], next = text[index + 1];
    if (lineComment) { if (character === '\n') lineComment = false; continue; }
    if (blockComment) { if (character === '*' && next === '/') { blockComment = false; index += 1; } continue; }
    if (quote) { if (character === quote && text[index - 1] !== '\\') quote = ''; continue; }
    if (character === '#') { lineComment = true; continue; }
    if (character === '/' && next === '/') { lineComment = true; index += 1; continue; }
    if (character === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === '{') depth += 1;
    else if (character === '}' && --depth === 0) return index;
  }
  return -1;
}

function planControllerOptionInsertion(text, options = {}) {
  const source = String(text || ''), syntax = options.syntax === 'cns' ? 'cns' : 'zss';
  const name = String(options.name || '').trim(), value = String(options.value || '').trim();
  if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(name)) throw new Error('Controller option name is invalid.');
  if (!value || /[\r\n]/.test(value)) throw new Error('Controller option value must be one reviewed line.');
  let offset, inserted, eol;
  if (syntax === 'cns') {
    offset = lineStart(source, Number(options.endLine) + 1); eol = localEol(source, offset);
    const prefix = offset > 0 && !/[\r\n]/.test(source[offset - 1]) ? eol : '';
    inserted = `${prefix}${name} = ${value}${eol}`;
  } else {
    const start = lineStart(source, options.startLine), open = source.indexOf('{', start), close = open < 0 ? -1 : matchingBrace(source, open);
    if (close < 0) throw new Error('The selected ZSS controller no longer has a complete closing brace.');
    eol = localEol(source, close);
    const closeLine = lineStart(source, source.slice(0, close).split('\n').length - 1), beforeClose = source.slice(closeLine, close);
    const baseIndent = (/^[ \t]*/.exec(source.slice(start)) || [''])[0], indent = `${baseIndent}\t`;
    if (/^[ \t]*$/.test(beforeClose)) { offset = closeLine; inserted = `${indent}${name}: ${value};${eol}`; }
    else { offset = close; inserted = `${eol}${indent}${name}: ${value};${eol}${baseIndent}`; }
  }
  return { syntax, name, value, offset, text: inserted, preview: inserted.replace(/\r/g, '\\r').replace(/\n/g, '\\n\n') };
}

function applyInsertion(text, plan) {
  const source = String(text || '');
  if (!plan || !Number.isInteger(plan.offset) || plan.offset < 0 || plan.offset > source.length) throw new Error('Insertion plan does not match this source.');
  return source.slice(0, plan.offset) + plan.text + source.slice(plan.offset);
}

module.exports = { lineStarts, lineStart, localEol, matchingBrace, planControllerOptionInsertion, applyInsertion };
