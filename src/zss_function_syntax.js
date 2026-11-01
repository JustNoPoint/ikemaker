'use strict';

function lineAndCharacter(source, offset) {
  const before = String(source || '').slice(0, Math.max(0, offset));
  const lines = before.split(/\r?\n/);
  return { line: lines.length - 1, character: lines.at(-1).length };
}

function stripHeaderComments(value) {
  return String(value || '').split(/\r?\n/).map(line => {
    let quote = '';
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (quote) { if (character === quote && line[index - 1] !== '\\') quote = ''; continue; }
      if (character === '"' || character === "'") { quote = character; continue; }
      if (character === '#') return line.slice(0, index) + ' '.repeat(line.length - index);
    }
    return line;
  }).join('\n');
}

function splitVariables(segment, absoluteStart, source, role) {
  const values = [], errors = [];
  let start = 0;
  const parts = String(segment || '').split(',');
  for (const part of parts) {
    const leading = part.length - part.trimStart().length, token = part.trim();
    const offset = absoluteStart + start + leading, location = lineAndCharacter(source, offset);
    if (!token || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) {
      errors.push({ ...location, start: location.character, length: Math.max(1, token.length), token, role,
        message: token
          ? `${role === 'parameter' ? 'Function parameter' : 'Function return'} “${token}” is not a variable name. ZSS function headers do not support declared types or default values.`
          : `An empty ${role === 'parameter' ? 'function parameter' : 'function return'} is not valid.` });
    } else values.push({ name: token, ...location, offset });
    start += part.length + 1;
  }
  return { values, errors };
}

function parseHeader(source, start, end) {
  const raw = source.slice(start, end + 1), innerRaw = raw.slice(1, -1), inner = stripHeaderComments(innerRaw);
  const prefix = /^\s*Function\s+/i.exec(inner);
  if (!prefix) return null;
  const nameMatch = /^([A-Za-z_][A-Za-z0-9_.]*)/.exec(inner.slice(prefix[0].length));
  const headerLocation = lineAndCharacter(source, start);
  if (!nameMatch) return { valid: false, startOffset: start, endOffset: end, ...headerLocation, errors: [{ ...headerLocation, start: headerLocation.character, length: Math.max(1, raw.length), role: 'header', message: 'Function header is missing a valid function name.' }] };
  const name = nameMatch[1], nameInnerOffset = prefix[0].length, nameOffset = start + 1 + nameInnerOffset;
  let cursor = nameInnerOffset + name.length;
  while (/\s/.test(inner[cursor] || '')) cursor += 1;
  let parameterSegment = '', parameterStart = start + 1 + cursor, afterParameters = cursor;
  if (inner[cursor] === '(') {
    const open = cursor; let depth = 1, quote = '', close = -1;
    for (let index = open + 1; index < inner.length; index += 1) {
      const character = inner[index];
      if (quote) { if (character === quote && inner[index - 1] !== '\\') quote = ''; continue; }
      if (character === '"' || character === "'") { quote = character; continue; }
      if (character === '(') depth += 1;
      else if (character === ')' && --depth === 0) { close = index; break; }
    }
    if (close < 0) {
      const location = lineAndCharacter(source, start + 1 + open);
      return { valid: false, name, startOffset: start, endOffset: end, ...headerLocation, errors: [{ ...location, start: location.character, length: 1, role: 'header', message: `Function ${name} has an unterminated parameter list.` }] };
    }
    parameterSegment = inner.slice(open + 1, close); parameterStart = start + 1 + open + 1; afterParameters = close + 1;
  }
  while (/\s/.test(inner[afterParameters] || '')) afterParameters += 1;
  const returnTail = inner.slice(afterParameters), returnSegment = returnTail.trim(), returnLeading = returnTail.length - returnTail.trimStart().length;
  const parameters = parameterSegment.trim() ? splitVariables(parameterSegment, parameterStart, source, 'parameter') : { values: [], errors: [] };
  const returns = returnSegment ? splitVariables(returnSegment, start + 1 + afterParameters + returnLeading, source, 'return') : { values: [], errors: [] };
  const errors = [...parameters.errors, ...returns.errors], nameLocation = lineAndCharacter(source, nameOffset);
  const parameterNames = parameters.values.map(value => value.name), returnNames = returns.values.map(value => value.name);
  return {
    valid: errors.length === 0, name, line: nameLocation.line, start: nameLocation.character, startOffset: start, endOffset: end,
    parameters: parameters.values, returns: returns.values, params: parameterNames, returnNames, errors,
    signature: `(${parameterNames.join(', ')})${returnNames.length ? ` ${returnNames.join(', ')}` : ''}`,
    displaySignature: `${name}(${parameterNames.join(', ')})${returnNames.length ? ` → (${returnNames.join(', ')})` : ''}`,
    sourceSignature: raw.replace(/\s+/g, ' ').trim()
  };
}

function parseFunctionHeaders(text) {
  const source = String(text || ''), headers = []; let quote = '', comment = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (comment) { if (character === '\n') comment = false; continue; }
    if (quote) { if (character === quote && source[index - 1] !== '\\') quote = ''; continue; }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === '#') { comment = true; continue; }
    if (character !== '[') continue;
    let innerQuote = '', innerComment = false, end = -1;
    for (let cursor = index + 1; cursor < source.length; cursor += 1) {
      const value = source[cursor];
      if (innerComment) { if (value === '\n') innerComment = false; continue; }
      if (innerQuote) { if (value === innerQuote && source[cursor - 1] !== '\\') innerQuote = ''; continue; }
      if (value === '"' || value === "'") { innerQuote = value; continue; }
      if (value === '#') { innerComment = true; continue; }
      if (value === ']') { end = cursor; break; }
    }
    if (end < 0) {
      if (/^\s*Function\b/i.test(stripHeaderComments(source.slice(index + 1)))) {
        const location = lineAndCharacter(source, index);
        headers.push({ valid: false, startOffset: index, endOffset: source.length - 1, ...location, errors: [{ ...location, start: location.character, length: 1, role: 'header', message: 'Function header is missing its closing ].' }] });
      }
      break;
    }
    const parsed = parseHeader(source, index, end); if (parsed) headers.push(parsed);
    index = end;
  }
  return headers;
}

module.exports = { parseFunctionHeaders, lineAndCharacter };
