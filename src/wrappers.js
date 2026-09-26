'use strict';

function leadingWhitespace(value) {
  const match = /^\s*/.exec(value || '');
  return match ? match[0] : '';
}

function commonIndent(lines) {
  const indents = lines
    .filter((line) => line.trim())
    .map((line) => leadingWhitespace(line));
  if (!indents.length) return '';
  let prefix = indents[0];
  for (const indent of indents.slice(1)) {
    while (prefix && !indent.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return prefix;
}

function wrapText(text, wrapper, options = {}) {
  const eol = options.eol || '\n';
  const indentUnit = options.indentUnit || '\t';
  const lines = String(text || '').split(/\r?\n/);
  const indent = options.indent !== undefined ? options.indent : commonIndent(lines);

  if (!text) {
    return {
      text: `${indent}${wrapper} {${eol}${indent}${indentUnit}${eol}${indent}}`,
      cursorOffset: `${indent}${wrapper} {${eol}${indent}${indentUnit}`.length
    };
  }

  const body = lines.map((line) => {
    if (!line.trim()) return '';
    const relative = line.startsWith(indent) ? line.slice(indent.length) : line;
    return `${indent}${indentUnit}${relative}`;
  }).join(eol);

  return {
    text: `${indent}${wrapper} {${eol}${body}${eol}${indent}}`,
    cursorOffset: null
  };
}

module.exports = { leadingWhitespace, commonIndent, wrapText };
