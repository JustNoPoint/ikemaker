'use strict';

const { maskSource } = require('./state_transfer_model');

const GROUPS = new Set(['clsn1', 'clsn2', 'size', 'dummy']);
const EDGES = new Set(['back', 'top', 'front', 'bottom']);
const BARE_REDIRECTS = new Set(['root', 'parent', 'p2', 'stateowner', 'partner', 'enemy', 'enemynear', 'helper', 'target']);
const PARAMETERIZED_REDIRECTS = new Set(['partner', 'enemy', 'enemynear', 'playerid', 'player', 'playerindex', 'helperindex', 'helper', 'target']);

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function lineAt(text, offset) {
  return text.slice(0, offset).split(/\r?\n/).length - 1;
}

function matchingParenthesis(masked, open) {
  let depth = 0;
  for (let at = open; at < masked.length; at += 1) {
    if (masked[at] === '(') depth += 1;
    else if (masked[at] === ')' && --depth === 0) return at;
  }
  return -1;
}

function argumentSpans(source, masked, open, close) {
  const commas = [];
  let parentheses = 1, brackets = 0, braces = 0;
  for (let at = open + 1; at < close; at += 1) {
    const character = masked[at];
    if (character === '(') parentheses += 1;
    else if (character === ')') parentheses -= 1;
    else if (character === '[') brackets += 1;
    else if (character === ']') brackets = Math.max(0, brackets - 1);
    else if (character === '{') braces += 1;
    else if (character === '}') braces = Math.max(0, braces - 1);
    else if (character === ',' && parentheses === 1 && brackets === 0 && braces === 0) commas.push(at);
  }
  const boundaries = [open + 1, ...commas.map(at => at + 1), close], output = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const rawStart = boundaries[index], rawEnd = index < commas.length ? commas[index] : close;
    const raw = source.slice(rawStart, rawEnd), leading = raw.length - raw.trimStart().length, trailing = raw.length - raw.trimEnd().length;
    output.push(freeze({ start: rawStart + leading, end: rawEnd - trailing, expression: source.slice(rawStart + leading, rawEnd - trailing) }));
  }
  return freeze(output);
}

function normalizedArguments(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return [];
  const open = trimmed.indexOf('(');
  if (open < 1 || matchingParenthesis(trimmed, open) !== trimmed.length - 1) return null;
  return argumentSpans(trimmed, trimmed, open, trimmed.length - 1).map(item => item.expression);
}

function completeRedirectToken(text) {
  const value = String(text || '').trim();
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) return BARE_REDIRECTS.has(value.toLowerCase());
  const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(value);
  if (!match) return false;
  const name = match[1].toLowerCase();
  if (!PARAMETERIZED_REDIRECTS.has(name)) return false;
  const args = normalizedArguments(value);
  if (!args) return false;
  if (['partner', 'enemy', 'enemynear', 'playerid', 'player', 'playerindex', 'helperindex'].includes(name)) return completeExpressionSegments(args);
  if (!['helper', 'target'].includes(name)) return false;
  if (completeExpressionSegments(args)) return true;
  for (let split = 1; split < args.length; split += 1) if (completeExpressionSegments(args.slice(0, split)) && completeExpressionSegments(args.slice(split))) return true;
  return false;
}

function beginsWithRedirectToken(text) {
  const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\b/.exec(String(text || ''));
  return Boolean(match && (BARE_REDIRECTS.has(match[1].toLowerCase()) || PARAMETERIZED_REDIRECTS.has(match[1].toLowerCase())));
}

function completeExpressionSegments(segments) {
  if (!Array.isArray(segments) || !segments.length || !String(segments.at(-1) || '').trim() || beginsWithRedirectToken(segments.at(-1))) return false;
  return segments.slice(0, -1).every(completeRedirectToken);
}

function splitThreePartCollisionCall(source, masked, open, close) {
  const chunks = argumentSpans(source, masked, open, close), middleChunks = chunks.length >= 3 ? chunks.slice(1, -1) : [], redirects = middleChunks.slice(0, -1), terminal = middleChunks.at(-1);
  const redirectChainValid = redirects.every(item => completeRedirectToken(masked.slice(item.start, item.end)));
  const terminalMasked = terminal ? masked.slice(terminal.start, terminal.end).trim() : '';
  const valid = chunks.length >= 3 && redirectChainValid && Boolean(terminalMasked) && !beginsWithRedirectToken(terminalMasked);
  const middleStart = middleChunks[0]?.start ?? -1, middleEnd = terminal?.end ?? -1;
  const rawMiddle = middleStart >= 0 && middleEnd >= middleStart ? source.slice(middleStart, middleEnd) : '';
  const leading = rawMiddle.length - rawMiddle.trimStart().length, trailing = rawMiddle.length - rawMiddle.trimEnd().length;
  return freeze({
    chunks,
    first: chunks[0] || null,
    middle: middleStart >= 0 ? freeze({ start: middleStart + leading, end: middleEnd - trailing, expression: rawMiddle.trim() }) : null,
    last: chunks.length >= 2 ? chunks.at(-1) : null,
    redirects,
    valid,
    redirectChainValid,
    terminalMasked
  });
}

function declarationBefore(masked, offset) {
  const prefix = masked.slice(Math.max(0, offset - 96), offset);
  return /\bfunction\s*$/i.test(prefix) || /\.\s*$/.test(prefix);
}

function previousNonspace(text, at) { while (at >= 0 && /\s/.test(text[at])) at -= 1; return at; }
function matchingOpenParenthesis(masked, close) {
  let depth = 0;
  for (let at = close; at >= 0; at -= 1) {
    if (masked[at] === ')') depth += 1;
    else if (masked[at] === '(' && --depth === 0) return at;
  }
  return -1;
}
function identifierEndingAt(masked, end) {
  const match = /([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(masked.slice(0, end));
  return match ? match[1].toLowerCase() : '';
}
function redirectedBefore(masked, offset) {
  let at = previousNonspace(masked, offset - 1);
  if (at < 0 || masked[at] !== ',') return false;
  at = previousNonspace(masked, at - 1);
  if (masked[at] !== ')') return BARE_REDIRECTS.has(identifierEndingAt(masked, at + 1));
  const open = matchingOpenParenthesis(masked, at);
  return open >= 0 && PARAMETERIZED_REDIRECTS.has(identifierEndingAt(masked, open));
}

function field(key, argument) {
  return freeze({ key, name: key, start: argument?.start ?? -1, end: argument?.end ?? -1, expression: argument?.expression ?? '' });
}

function parseCollisionQueryReferences(text, syntax) {
  const source = String(text || ''), grammar = syntax === 'zss' ? 'zss' : 'cns', masked = maskSource(source, grammar), output = [];
  const pattern = /\bClsnVar\b\s*\(/gi;
  let match;
  while ((match = pattern.exec(masked))) {
    if (declarationBefore(masked, match.index)) continue;
    const open = masked.indexOf('(', match.index), close = matchingParenthesis(masked, open);
    if (close < 0) continue;
    const parts = splitThreePartCollisionCall(source, masked, open, close), args = parts.chunks, fields = freeze([field('group', parts.first), field('index', parts.middle), field('edge', parts.last)]);
    const group = String(parts.first?.expression || '').trim().toLowerCase(), edge = String(parts.last?.expression || '').trim().toLowerCase(), indexExpression = String(parts.middle?.expression || '').trim();
    const groupLiteral = GROUPS.has(group), edgeLiteral = EDGES.has(edge), indexStatic = /^(?:0|[1-9]\d*)$/.test(indexExpression), redirect = redirectedBefore(masked, match.index);
    const reason = !parts.valid ? `ClsnVar requires a group, one complete index expression, and an edge; found ${args.length} comma-separated segment${args.length === 1 ? '' : 's'}.` : !groupLiteral ? 'ClsnVar group must be the literal Clsn1, Clsn2, Size, or Dummy.' : !edgeLiteral ? 'ClsnVar edge must be the literal Back, Top, Front, or Bottom.' : redirect ? 'Redirected ClsnVar runtime ownership is unresolved.' : '';
    output.push(freeze({
      syntax: grammar,
      kind: 'clsnvar',
      label: 'ClsnVar',
      category: 'collision-inspection',
      callStart: match.index,
      callEnd: close + 1,
      controllerStart: match.index,
      controllerEnd: close + 1,
      controllerLine: lineAt(source, match.index),
      sourceExact: true,
      available: !reason,
      reason,
      redirect,
      fields,
      queryGroup: group,
      queryEdge: edge,
      indexStatic,
      dynamic: !indexStatic,
      conditional: true,
      effectiveExplanation: 'Reads one normalized edge from the effective local collision group at runtime; it does not prove an authored AIR box, rotated polygon, world position, facing, or value.'
    }));
    pattern.lastIndex = close + 1;
  }
  return freeze(output);
}

module.exports = {
  GROUPS,
  EDGES,
  BARE_REDIRECTS,
  PARAMETERIZED_REDIRECTS,
  argumentSpans,
  completeRedirectToken,
  completeExpressionSegments,
  declarationBefore,
  matchingParenthesis,
  redirectedBefore,
  splitThreePartCollisionCall,
  parseCollisionQueryReferences
};
