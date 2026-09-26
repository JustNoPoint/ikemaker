'use strict';

const DECLARATION = /^\s*\[\s*(statedef|function)\b/i;
const COMMENT = /^\s*#\s?(.*)$/;

function cleanHeading(line) {
  const match = COMMENT.exec(line);
  if (!match) return '';
  const text = match[1].trim();
  if (!text || /^[-=_#*|]+$/.test(text)) return '';
  if (/^(zantei state script|syntax highlighter|functions?|states?|global states?)$/i.test(text)) return '';
  return text.replace(/^[-=_#*|\s]+|[-=_#*|\s]+$/g, '').trim();
}

function headingBefore(lines, declarationLine) {
  let heading = '';
  for (let i = declarationLine - 1; i >= Math.max(0, declarationLine - 8); i -= 1) {
    if (!lines[i].trim()) {
      if (heading) break;
      continue;
    }
    if (!COMMENT.test(lines[i])) break;
    const candidate = cleanHeading(lines[i]);
    if (candidate) {
      heading = candidate;
      break;
    }
  }
  return heading;
}

function readDeclaration(lines, start) {
  let text = lines[start];
  let end = start;
  while (!text.includes(']') && end + 1 < lines.length && end - start < 32) {
    end += 1;
    text += `\n${lines[end]}`;
  }
  return { text, end };
}

function parseDeclaration(text) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const kindMatch = /^\[\s*(statedef|function)\b\s*(.*)$/i.exec(normalized);
  if (!kindMatch) return null;
  const type = kindMatch[1].toLowerCase() === 'statedef' ? 'state' : 'function';
  const body = kindMatch[2].replace(/\].*$/, '').trim();

  if (type === 'state') {
    const id = (body.split(';', 1)[0] || '').trim();
    return id ? { type, id, signature: id } : null;
  }

  const signatureMatch = /^([^;\]]+)/.exec(body);
  const signature = signatureMatch ? signatureMatch[1].trim() : body;
  const nameMatch = /^([A-Za-z_][A-Za-z0-9_.]*)/.exec(signature);
  if (!nameMatch) return null;
  return { type, id: nameMatch[1], signature };
}

function parseZss(text) {
  const lines = text.split(/\r?\n/);
  const symbols = [];

  for (let line = 0; line < lines.length; line += 1) {
    if (!DECLARATION.test(lines[line])) continue;
    const declaration = readDeclaration(lines, line);
    const parsed = parseDeclaration(declaration.text);
    if (!parsed) continue;
    symbols.push({
      ...parsed,
      heading: headingBefore(lines, line),
      startLine: line,
      declarationEndLine: declaration.end,
      endLine: lines.length - 1
    });
    line = declaration.end;
  }

  for (let i = 0; i < symbols.length - 1; i += 1) {
    symbols[i].endLine = Math.max(symbols[i].declarationEndLine, symbols[i + 1].startLine - 1);
  }
  return symbols;
}

function displayName(symbol) {
  const base = symbol.type === 'state' ? `State ${symbol.id}` : symbol.signature;
  return symbol.heading ? `${base} — ${symbol.heading}` : base;
}

module.exports = { parseZss, displayName, cleanHeading };
