'use strict';

const { collectRecords } = require('./analyzer');

function symbolsFromRecords(records) {
  return [
    ...records.functions.map((record) => ({ ...record, kind: 'function' })),
    ...records.calls.map((record) => ({ ...record, kind: 'function', declaration: false })),
    ...records.maps.map((record) => ({ ...record, kind: 'map' })),
    ...records.variables.map((record) => ({ ...record, kind: 'variable' })),
    ...(records.locals || []).map((record) => ({ ...record, kind: 'local' })),
    ...(records.constants || []).map((record) => ({ ...record, kind: 'constant' })),
    ...(records.resources || []).map((record) => ({ ...record, name: record.id, resourceKind: record.kind, kind: 'resource', declaration: record.role === 'creation' })),
    ...records.states.map((record) => ({ ...record, kind: 'state', declaration: true })),
    ...(records.stateReferences || []).map((record) => ({ ...record, kind: 'state', declaration: false }))
  ];
}

function allSymbols(text, filename = '') {
  return symbolsFromRecords(collectRecords(text, filename));
}

function symbolLength(symbol) {
  return String(symbol.name || '').length + (symbol.kind === 'local' && symbol.sigil ? 1 : 0);
}

function symbolAt(text, line, character, filename = '') {
  return allSymbols(text, filename).find((symbol) => symbol.line === line
    && character >= symbol.start
    && character <= symbol.start + symbolLength(symbol)) || null;
}

function sameSymbol(left, right) {
  if (!left || !right || left.kind !== right.kind) return false;
  if (left.kind === 'local') return Boolean(left.identity && right.identity && left.identity === right.identity);
  if (left.kind === 'resource') return left.resourceKind === right.resourceKind && String(left.name).toLowerCase() === String(right.name).toLowerCase();
  return String(left.name).toLowerCase() === String(right.name).toLowerCase();
}

function referencesFor(entries, symbol, includeDeclaration = true) {
  return entries.flatMap((entry) => (entry.records ? symbolsFromRecords(entry.records) : allSymbols(entry.text, entry.filename || entry.uri?.fsPath || ''))
    .filter((candidate) => sameSymbol(candidate, symbol))
    .filter((candidate) => includeDeclaration || !candidate.declaration)
    .map((candidate) => ({ ...candidate, uri: entry.uri })));
}

function definitionsFor(entries, symbol) {
  const candidates = referencesFor(entries, symbol, true);
  if (symbol.kind === 'function' || symbol.kind === 'state' || symbol.kind === 'local' || symbol.kind === 'constant' || symbol.kind === 'resource') return candidates.filter((item) => item.declaration);
  if (symbol.kind === 'map' || symbol.kind === 'variable') return candidates.filter((item) => item.access === 'write');
  return [];
}

function canRename(symbol) {
  return Boolean(symbol && (symbol.kind === 'function' || symbol.kind === 'map' || symbol.kind === 'local' || symbol.kind === 'constant'));
}

function validRename(symbol, value) {
  if (!canRename(symbol)) return false;
  return (symbol.kind === 'local' ? /^[A-Za-z_][A-Za-z0-9_]*$/ : /^[A-Za-z_][A-Za-z0-9_.]*$/).test(String(value || ''));
}

function unquotedCode(line) {
  const source = String(line || ''), output = [...source]; let quote = '';
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      output[index] = ' ';
      if (character === quote && source[index - 1] !== '\\') quote = '';
      continue;
    }
    if (character === '"' || character === "'") { quote = character; output[index] = ' '; continue; }
    if (character === '#') { for (let rest = index; rest < output.length; rest += 1) output[rest] = ' '; break; }
  }
  return output.join('');
}

function maskedCode(text) {
  const source=String(text||''),output=[...source];let quote='',comment=false;
  for(let index=0;index<source.length;index+=1){const value=source[index];if(comment){if(value==='\n')comment=false;else output[index]=' ';continue;}if(quote){if(value!=='\r'&&value!=='\n')output[index]=' ';if(value===quote&&source[index-1]!=='\\')quote='';continue;}if(value==='"'||value==="'"){quote=value;output[index]=' ';continue;}if(value==='#'){comment=true;output[index]=' ';}}
  return output.join('');
}

function functionCallAtOffset(text, offset) {
  const source = String(text || ''), code = maskedCode(source), position = Math.max(0, Math.min(Number(offset) || 0, source.length));
  const pattern = /\bcall\s+([A-Za-z_][A-Za-z0-9_.]*)?/gi;
  let selected = null;
  for (let match = pattern.exec(code); match; match = pattern.exec(code)) {
    const name = match[1] || '', start = match.index + match[0].length - name.length, end = start + name.length;
    let cursor = end; while (/\s/.test(code[cursor] || '')) cursor += 1;
    let close = -1;
    if (code[cursor] === '(') {
      let callDepth = 1;
      for (let index = cursor + 1; index < code.length; index += 1) {
        if (code[index] === '(' || code[index] === '[' || code[index] === '{') callDepth += 1;
        else if (code[index] === ')' || code[index] === ']' || code[index] === '}') { callDepth -= 1; if (callDepth === 0) { close = index; break; } }
      }
    }
    const inName = position >= start && position <= end, inArguments = code[cursor] === '(' && position >= cursor && (close < 0 || position <= close);
    if (!inName && !inArguments) continue;
    let activeParameter = 0, depth = 0;
    if (code[cursor] === '(' && position > cursor) {
      for (let index = cursor + 1; index < position; index += 1) {
        const value = code[index];
        if (value === '(' || value === '[' || value === '{') depth += 1;
        else if (value === ')' || value === ']' || value === '}') { if (depth === 0 && value === ')') break; depth = Math.max(0, depth - 1); }
        else if (value === ',' && depth === 0) activeParameter += 1;
      }
    }
    selected = { name, prefix: source.slice(start, Math.min(position, end)), startOffset: start, endOffset: end, hasArguments: code[cursor] === '(', openOffset: code[cursor] === '(' ? cursor : -1, closeOffset: close, activeParameter };
  }
  return selected;
}

function offsetAtLineCharacter(source, line, character) {
  const lines = String(source || '').split(/\r?\n/), wanted = Math.max(0, Math.min(Number(line) || 0, lines.length - 1));
  let offset = 0; for (let index = 0; index < wanted; index += 1) offset += lines[index].length + 1;
  return offset + Math.max(0, Math.min(Number(character) || 0, lines[wanted]?.length || 0));
}

function functionCallAtDocumentPosition(text, line, character) {
  const source = String(text || ''), call = functionCallAtOffset(source, offsetAtLineCharacter(source, line, character));
  if (!call) return null;
  const before = source.slice(0, call.startOffset), callLine = (before.match(/\n/g) || []).length, lineStart = before.lastIndexOf('\n') + 1;
  const closeBefore = call.closeOffset >= 0 ? source.slice(0, call.closeOffset) : '', openBefore = call.openOffset >= 0 ? source.slice(0, call.openOffset) : '';
  return { ...call, line: callLine, start: call.startOffset - lineStart, end: call.endOffset - lineStart,
    open: call.openOffset < 0 ? -1 : call.openOffset - (openBefore.lastIndexOf('\n') + 1),
    close: call.closeOffset < 0 ? -1 : call.closeOffset - (closeBefore.lastIndexOf('\n') + 1) };
}

function functionCallAtPosition(line, character) {
  const call = functionCallAtDocumentPosition(String(line || ''), 0, character);
  if (!call) return null;
  const { startOffset, endOffset, openOffset, closeOffset, line: ignoredLine, ...legacy } = call;
  return legacy;
}

function functionDefinitions(entries, name = '') {
  const wanted = String(name || '').toLowerCase();
  return (entries || []).flatMap((entry) => (entry.records ? entry.records.functions : collectRecords(entry.text).functions)
    .filter((record) => record.declaration && (!wanted || record.name.toLowerCase() === wanted))
    .map((record) => ({ ...record, uri: entry.uri })));
}

module.exports = { symbolsFromRecords, allSymbols, symbolLength, symbolAt, sameSymbol, referencesFor, definitionsFor, canRename, validRename, functionCallAtPosition, functionCallAtDocumentPosition, functionDefinitions };
