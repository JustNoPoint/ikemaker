'use strict';

// ZSS locals are referenced with $name. This scanner deliberately models only
// lexical ownership and statement identity; it does not reinterpret expressions
// or assume that IKEMEN rejects an unused declaration.
function maskCommentsAndStrings(text) {
  const source = String(text || ''), output = [...source];
  let quoted = false, comment = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (comment) {
      if (character === '\r' || character === '\n') comment = false;
      else output[index] = ' ';
      continue;
    }
    if (quoted) {
      if (character === '"' && source[index - 1] !== '\\') quoted = false;
      if (character !== '\r' && character !== '\n') output[index] = ' ';
      continue;
    }
    if (character === '#') { comment = true; output[index] = ' '; continue; }
    if (character === '"') { quoted = true; output[index] = ' '; }
  }
  return output.join('');
}

function lineStarts(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) if (text[index] === '\n') starts.push(index + 1);
  return starts;
}

function lineAt(starts, offset) {
  let low = 0, high = starts.length;
  while (low + 1 < high) { const middle = (low + high) >> 1; if (starts[middle] <= offset) low = middle; else high = middle; }
  return low;
}

function statementEnd(masked, start, limit) {
  for (let index = start; index < limit; index += 1) if (masked[index] === ';') return index + 1;
  return -1;
}

function functionReturns(header) {
  const match = /^\s*\[\s*Function\b[^\]]*?\)([^\]]*)\]/i.exec(header);
  if (!match) return new Set();
  return new Set((match[1].match(/[A-Za-z_][A-Za-z0-9_]*/g) || []).map(value => value.toLowerCase()));
}

function buildScopes(masked) {
  const root = { id: 0, start: 0, end: masked.length, parent: null, depth: 0, returns: new Set(), declarations: [] };
  const scopes = [root];
  const headers = [];
  const headerPattern = /^\s*\[\s*(?:Function|StateDef)\b[^\]]*\]/gim;
  let match;
  while ((match = headerPattern.exec(masked))) headers.push({ start: match.index, end: match.index + match[0].length, returns: functionReturns(match[0]) });
  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index], scope = { id: scopes.length, start: header.start, end: headers[index + 1]?.start ?? masked.length, parent: root, depth: 1, returns: header.returns, declarations: [] };
    scopes.push(scope);
  }
  // IKEMEN locals belong to the surrounding StateDef or Function. Braced if,
  // switch and loop bodies routinely assign the same local with another `let`
  // and read it after the branch, so braces must not be treated as JavaScript
  // block scopes.
  return scopes;
}

function scopeFor(scopes, offset) {
  let found = scopes[0];
  for (const scope of scopes) if (scope.start <= offset && offset < scope.end && scope.depth >= found.depth) found = scope;
  return found;
}

function suppressed(text, starts, line, statementStart, statementEndOffset) {
  const same = text.slice(statementStart, starts[line + 1] ?? text.length);
  if (/#\s*@?ikemaker-ignore\s+unused-let\b/i.test(same)) return true;
  if (line < 1) return false;
  const previous = text.slice(starts[line - 1], starts[line] - 1);
  return /^\s*#\s*@?ikemaker-ignore\s+unused-let\s*$/i.test(previous);
}

function severity(value) {
  const normalized = String(value || 'error').toLowerCase();
  if (normalized === 'off') return null;
  if (normalized === 'warning') return 'warning';
  if (normalized === 'information' || normalized === 'info') return 'information';
  return 'error';
}

function analyzeUnusedLets(text, options = {}) {
  const source = String(text || ''), masked = maskCommentsAndStrings(source), starts = lineStarts(source), scopes = buildScopes(masked), declarations = [], uses = [];
  const level = severity(options.severity);
  if (!level) return { declarations, issues: [] };
  const declarationPattern = /\blet\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/gi;
  let match;
  while ((match = declarationPattern.exec(masked))) {
    const scope = scopeFor(scopes, match.index), end = statementEnd(masked, match.index, scope.end);
    if (end < 0) continue; // Incomplete source stays editable without a speculative error.
    const name = match[1], nameOffset = match.index + match[0].indexOf(name), line = lineAt(starts, nameOffset), expressionStart = match.index + match[0].length;
    const declaration = { name, key: name.toLowerCase(), line, start: nameOffset - starts[line], offset: match.index, nameOffset, statementStart: match.index, statementEnd: end, activation: end, expression: source.slice(expressionStart, end - 1), scope, used: false, returnLocal: scope.returns.has(name.toLowerCase()), suppressed: suppressed(source, starts, line, match.index, end) };
    const expressionMasked = masked.slice(expressionStart, end - 1), directCall = /^\s*call\s+[A-Za-z_][A-Za-z0-9_.]*\s*\([\s\S]*\)\s*$/i.test(expressionMasked);
    declaration.fixKind = directCall ? 'preserve-call' : /\bcall\s+[A-Za-z_][A-Za-z0-9_.]*\s*\(|:=/i.test(expressionMasked) ? 'manual' : 'remove';
    declaration.replacement = directCall ? `${source.slice(expressionStart, end - 1).trim()};` : '';
    declarations.push(declaration); scope.declarations.push(declaration);
  }
  const usePattern = /\$([A-Za-z_][A-Za-z0-9_]*)/g;
  while ((match = usePattern.exec(masked))) uses.push({ key: match[1].toLowerCase(), offset: match.index });
  for (const use of uses) {
    let scope = scopeFor(scopes, use.offset), resolved = [];
    while (scope) {
      const candidates = scope.declarations.filter(item => item.key === use.key && item.activation <= use.offset);
      if (candidates.length) { resolved = candidates; break; }
      scope = scope.parent;
    }
    // Multiple branch-local `let` statements can be alternate assignments to
    // one section local. A later read can consume any reachable assignment, so
    // mark every preceding declaration conservatively instead of inventing a
    // false unused warning for valid branch flow.
    for (const declaration of resolved) declaration.used = true;
  }
  const issues = declarations.filter(item => item.name !== '_' && !item.used && !item.returnLocal && !item.suppressed).map(item => ({
    line: item.line, start: item.start, length: item.name.length, severity: level, code: 'unused-let',
    message: `Local $${item.name} is declared but never read in its lexical scope.`,
    help: item.fixKind === 'preserve-call' ? 'The initializer calls a function and may have side effects. Replace only the unused result declaration while preserving the call.' : item.fixKind === 'manual' ? 'The initializer may have side effects. Review it manually; IKEMaker will not offer an automatic removal.' : 'Remove the declaration only after confirming it is intentionally unused. This IKEMaker authoring diagnostic does not block saving or running.',
    fixKind: item.fixKind, replacement: item.replacement, statementStart: item.statementStart, statementEnd: item.statementEnd, expectedText: source.slice(item.statementStart, item.statementEnd)
  }));
  return { declarations, issues };
}

module.exports = { analyzeUnusedLets, maskCommentsAndStrings };
