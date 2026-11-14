'use strict';

// Flags writes of statically float expressions into integer variables (var/sysvar).
// Engine facts (IKEMEN GO 1.0.0 src, confirmed against stable + nightly builds):
// - VarSet/VarAdd/ParentVar*/RootVar* compile `value` (and `var(n) = x`) as VT_Int; `var(n) := x`
//   runs OC_st_var -> ToI(). Both truncate toward zero (1.75 -> 1, -1.75 -> -1) without a message.
// - + - * / produce float when either operand is float; int / int is integer division; % is int.
//   ** is float when either side is float or the exponent is negative.
// - Min/Max/Clamp/Round always return float; Floor/Ceil return int; Abs keeps the operand type.
// - fvarSet/sysFvarSet only reject negative indexes, so any non-negative fvar slot is valid in IKEMEN.
// Only expressions whose float result is proven are reported. Anything dynamic stays silent.

const CODE = 'integer-var-fractional-write';
const VAR_CONTROLLERS = new Set(['varset', 'varadd', 'parentvarset', 'parentvaradd', 'rootvarset', 'rootvaradd']);
const REDIRECTS = new Set(['parent', 'root', 'helper', 'target', 'partner', 'enemy', 'enemynear', 'playerid', 'p2', 'stateowner', 'helperindex', 'playerindex']);
const AXIS_FLOAT = new Set(['pos', 'vel', 'screenpos', 'p2dist', 'p2bodydist', 'parentdist', 'rootdist', 'camerapos']);
const FLOAT_TRIGGERS = new Set(['pi', 'e', 'frontedge', 'backedge', 'bottomedge', 'camerazoom']);
const FLOAT_FUNCS = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'exp', 'ln', 'log']);
const INT_TRIGGERS = new Set(['time', 'random', 'gametime', 'power', 'life', 'lifemax', 'powermax', 'frontedgedist', 'backedgedist',
  'frontedgebodydist', 'backedgebodydist', 'stateno', 'prevstateno', 'animtime', 'anim', 'roundno', 'movecontact', 'movehit',
  'moveguarded', 'ctrl', 'alive', 'numhelper', 'numproj', 'teamside', 'facing', 'hitcount', 'uniqhitcount', 'matchno', 'ishelper',
  'roundstate', 'id', 'hitpausetime', 'hitshakeover', 'canrecover', 'palno']);
const INT = Object.freeze({ t: 'int' }), UNKNOWN = Object.freeze({ t: 'unknown' });
const FLOAT = Object.freeze({ t: 'float', frac: true }), WHOLE_FLOAT = Object.freeze({ t: 'float', frac: false });
const isWhole = v => v.t === 'int' || (v.t === 'float' && !v.frac);
const floatOf = (...vs) => (vs.some(v => v.t === 'float' && v.frac) ? FLOAT : WHOLE_FLOAT);

// Mirrors compiler.go tokenizerCS: digits with at most one '.', then an optional e/E exponent
// (sign allowed only right after the e). Returns the end offset, or `i` when no number starts here.
function scanNumber(text, i, to) {
  let j = i, dot = false;
  for (; j < to; j++) {
    if (text[j] === '.') { if (dot) break; dot = true; } else if (text[j] < '0' || text[j] > '9') break;
  }
  if (j > i && j < to && (text[j] === 'e' || text[j] === 'E')) {
    const first = j + 1;
    for (j++; j < to; j++) if ((text[j] < '0' || text[j] > '9') && (j !== first || (text[j] !== '-' && text[j] !== '+'))) break;
  }
  return j;
}

// Mirrors compiler.go number(): dotted tokens go through ParseFloat, undotted exponents and
// malformed tokens are not numbers (the engine rejects them), integers clamp to int32.
const INT32_MAX = 2147483647;
function numberType(token) {
  if (token.includes('.')) {
    if (!/^(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(token)) throw new Error('unsupported number ' + token);
    const value = Number(token);
    if (!Number.isFinite(value)) throw new Error('unsupported number ' + token);
    return Number.isInteger(value) ? WHOLE_FLOAT : FLOAT;
  }
  if (!/^\d+$/.test(token)) throw new Error('unsupported number ' + token);
  return INT;
}

function tokenize(text, from, to, zss) {
  const tokens = [];
  let i = from;
  while (i < to) {
    const ch = text[i];
    if (ch === '\n') { if (!zss) tokens.push({ k: 'stop', v: '\n', s: i, e: i + 1 }); i++; continue; }
    if (/\s/.test(ch)) { i++; continue; }
    if ((zss && ch === '#') || (!zss && ch === ';')) { while (i < to && text[i] !== '\n') i++; continue; }
    if (ch === '"') { let j = i + 1; while (j < to && text[j] !== '"' && text[j] !== '\n') j++; tokens.push({ k: 'str', v: text.slice(i, j + 1), s: i, e: Math.min(j + 1, to) }); i = j + 1; continue; }
    const num = scanNumber(text, i, to);
    if (num > i) { tokens.push({ k: 'num', v: text.slice(i, num), s: i, e: num }); i = num; continue; }
    const id = /^[A-Za-z_$][A-Za-z0-9_.$]*/.exec(text.slice(i, Math.min(to, i + 80)));
    if (id) { tokens.push({ k: 'id', v: id[0].toLowerCase(), s: i, e: i + id[0].length }); i += id[0].length; continue; }
    const op = /^(?::=|\|\||&&|\^\^|!=|<=|>=|\*\*|[=<>+\-*/%!~&|^()[\],])/.exec(text.slice(i, i + 2));
    if (op) { tokens.push({ k: 'op', v: op[0], s: i, e: i + op[0].length }); i += op[0].length; continue; }
    tokens.push({ k: 'stop', v: ch, s: i, e: i + 1 }); i++;
  }
  return tokens;
}

// Recursive-descent typer mirroring the engine precedence. Throws on anything it cannot follow.
function makeParser(tokens) {
  let p = 0;
  const peek = (o = 0) => tokens[p + o];
  const isOp = (v, o = 0) => peek(o) && peek(o).k === 'op' && peek(o).v === v;
  const expect = v => { if (!isOp(v)) throw new Error('expected ' + v); p++; };
  const bin = (next, ops, combine) => () => {
    let left = next();
    while (peek() && peek().k === 'op' && ops.includes(peek().v)) { const op = tokens[p++].v; left = combine(left, next(), op); }
    return left;
  };
  const arith = (a, b, op) => {
    if (a.t === 'unknown' || b.t === 'unknown') return UNKNOWN;
    if (a.t === 'int' && b.t === 'int') return INT;
    return op === '/' ? FLOAT : floatOf(a, b);
  };
  function args() {
    expect('('); const list = [];
    if (!isOp(')')) { list.push(or()); while (isOp(',')) { p++; list.push(or()); } }
    expect(')'); return list;
  }
  function skipParens() {
    expect('('); let depth = 1;
    while (depth && peek()) { const t = tokens[p++]; if (t.k === 'stop') throw new Error('stop in parens'); if (t.k === 'op' && t.v === '(') depth++; if (t.k === 'op' && t.v === ')') depth--; }
    if (depth) throw new Error('unbalanced');
  }
  function variable(name) {
    const open = p; skipParens(); const indexTokens = tokens.slice(open + 1, p - 1);
    // compiler.go parses the := value with expEqne: it binds tighter than & | && ||.
    if (isOp(':=')) { p++; const rhs = eq(); if (name === 'var' || name === 'sysvar') return INT; return isWhole(rhs) ? WHOLE_FLOAT : FLOAT; }
    void indexTokens; return name === 'fvar' || name === 'sysfvar' ? FLOAT : INT;
  }
  function primary() {
    const t = peek(); if (!t) throw new Error('eof');
    if (t.k === 'num') { p++; return numberType(t.v); }
    if (t.k === 'str') { p++; return UNKNOWN; }
    if (t.k === 'op' && (t.v === '(' || t.v === '[')) {
      p++; const first = or(); let range = false;
      if (isOp(',')) { p++; or(); range = true; }
      if (!isOp(')') && !isOp(']')) throw new Error('unclosed'); p++;
      return range ? UNKNOWN : first;
    }
    if (t.k !== 'id') throw new Error('unexpected ' + t.v);
    p++; const name = t.v;
    if (REDIRECTS.has(name)) {
      if (isOp('(')) skipParens();
      if (isOp(',')) { p++; return unary(); }
      return UNKNOWN;
    }
    if (['var', 'sysvar', 'fvar', 'sysfvar'].includes(name) && isOp('(')) return variable(name);
    if (AXIS_FLOAT.has(name)) { if (peek() && peek().k === 'id' && /^[xyz]$/.test(peek().v)) { p++; return FLOAT; } return UNKNOWN; }
    if (FLOAT_TRIGGERS.has(name) && !isOp('(')) return FLOAT;
    if (!isOp('(')) return INT_TRIGGERS.has(name) ? INT : UNKNOWN;
    if (INT_TRIGGERS.has(name)) { skipParens(); return INT; }
    if (FLOAT_FUNCS.has(name)) { args(); return FLOAT; }
    if (name === 'floor' || name === 'ceil') { args(); return INT; }
    if (name === 'abs') { const [a] = args(); return a || UNKNOWN; }
    if (name === 'float') { const [a] = args(); return a && isWhole(a) ? WHOLE_FLOAT : a && a.t === 'float' ? FLOAT : WHOLE_FLOAT; }
    if (name === 'min' || name === 'max' || name === 'clamp') {
      const list = args();
      if (list.some(a => a.t === 'float' && a.frac)) return FLOAT;
      return list.every(isWhole) ? WHOLE_FLOAT : UNKNOWN;
    }
    if (name === 'round') {
      const [x, n] = args();
      if (x && isWhole(x)) return WHOLE_FLOAT;
      if (n && n.t === 'int' && tokens[p - 2] && tokens[p - 2].k === 'num' && Number(tokens[p - 2].v) <= 0) return WHOLE_FLOAT;
      return x && x.t === 'float' ? FLOAT : UNKNOWN;
    }
    if (name === 'ifelse' || name === 'cond') {
      const [, a, b] = args();
      if (!a || !b) return UNKNOWN;
      if (a.t === 'int' && b.t === 'int') return INT;
      if (a.t === 'float' && b.t === 'float') return floatOf(a, b);
      return UNKNOWN;
    }
    skipParens(); return UNKNOWN;
  }
  function unary() {
    if (isOp('!') || isOp('~')) { p++; unary(); return INT; }
    if (isOp('-') || isOp('+')) { p++; return unary(); }
    return primary();
  }
  function power() {
    const base = unary();
    if (!isOp('**')) return base;
    p++; const negative = isOp('-'); const exp = power();
    if (base.t === 'unknown' || exp.t === 'unknown') return UNKNOWN;
    if (base.t === 'float' || exp.t === 'float' || negative) return FLOAT;
    return tokens[p - 1] && tokens[p - 1].k === 'num' ? INT : UNKNOWN; // a dynamic negative exponent turns float
  }
  const mul = () => { let left = power(); while (isOp('*') || isOp('/') || isOp('%')) { const op = tokens[p++].v; const right = power(); left = op === '%' ? INT : arith(left, right, op); } return left; };
  const add = bin(mul, ['+', '-'], arith);
  const asInt = () => INT;
  const rel = bin(add, ['<', '<=', '>', '>='], asInt);
  const eq = bin(rel, ['=', '!='], asInt);
  const band = bin(eq, ['&'], asInt), bxor = bin(band, ['^'], asInt), bor = bin(bxor, ['|'], asInt);
  const land = bin(bor, ['&&'], asInt), lxor = bin(land, ['^^'], asInt);
  const or = bin(lxor, ['||'], asInt);
  return { or, eq, at: () => p };
}

function typeOf(tokens) {
  if (!tokens.length) return { type: UNKNOWN, complete: false };
  try { const parser = makeParser(tokens); const type = parser.or(); return { type, complete: parser.at() === tokens.length }; }
  catch { return { type: UNKNOWN, complete: false }; }
}

function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return offset => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= offset) lo = mid; else hi = mid - 1; } return { line: lo, character: offset - starts[lo] }; };
}

function literalIndex(tokens) {
  // The compiler clamps integer literals to int32, so a larger literal would not address the same slot.
  if (tokens.length !== 1 || tokens[0].k !== 'num' || !/^\d+$/.test(tokens[0].v)) return null;
  const index = Number(tokens[0].v);
  return index <= INT32_MAX ? index : null;
}

function bankNote(bank, index) {
  const legacy = bank === 'sysfvar' ? 4 : 39;
  return index > legacy ? ` ${bank}(${index}) is accepted by IKEMEN (only negative indexes are rejected); MUGEN 1.x only has ${bank}(0)-${bank}(${legacy}), so this is a portability note.` : '';
}

function build(text, pos, span, target, what, bankFix) {
  const start = pos(span.s), end = pos(span.e);
  const source = text.slice(span.s, span.e);
  const wrapped = /^\(.*\)$/s.test(source) && balancedOuter(source);
  const wrap = fn => ({ title: `Round ${fn === 'floor' ? 'down' : 'up'} explicitly: ${fn}(…)`,
    changes: wrapped ? [{ line: start.line, start: start.character, length: 0, text: fn }]
      : [{ line: end.line, start: end.character, length: 0, text: ')' }, { line: start.line, start: start.character, length: 0, text: fn + '(' }] });
  const fixes = [wrap('floor'), wrap('ceil')];
  let bankText = ' The variable index is not a plain integer literal within int32 range, so no float-variable fix is offered.';
  if (bankFix) {
    const at = pos(bankFix.s);
    fixes.push({ title: `Store it in ${bankFix.bank}(${bankFix.index}) instead (separate float bank: review every other ${bankFix.from}(${bankFix.index}) read and write)`,
      changes: [{ line: at.line, start: at.character, length: bankFix.e - bankFix.s, text: bankFix.text }] });
    bankText = ` ${bankFix.bank}(${bankFix.index}) is a separate float bank: switching only this write leaves every other ${bankFix.from}(${bankFix.index}) reference reading the integer slot, so review them together.` + bankNote(bankFix.bank, bankFix.index);
  }
  const length = start.line === end.line ? end.character - start.character : Math.max(1, text.indexOf('\n', span.s) - span.s);
  return { diagnostic: { line: start.line, start: start.character, length: Math.max(1, length), code: CODE, severity: 'warning',
    message: `${target} is an integer variable, but ${what} is a float expression. IKEMEN truncates it toward zero when storing (1.75 becomes 1, -1.75 becomes -1). Use floor() or ceil() to round on purpose, or keep the fraction in a float variable.${bankText}` }, fixes };
}

function balancedOuter(source) {
  let depth = 0;
  for (let i = 0; i < source.length; i++) { if (source[i] === '(') depth++; else if (source[i] === ')') { depth--; if (depth === 0 && i < source.length - 1) return false; } }
  return depth === 0;
}

function trimRight(text, s, e) { while (e > s && /[\s]/.test(text[e - 1])) e--; return e; }

// Every `var(n) := rhs` / `sysvar(n) := rhs` in a token stream.
function assignmentProblems(text, tokens, pos, out) {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.k !== 'id' || (t.v !== 'var' && t.v !== 'sysvar') || !(tokens[i + 1] && tokens[i + 1].v === '(')) continue;
    let depth = 0, j = i + 1;
    for (; j < tokens.length; j++) { if (tokens[j].v === '(') depth++; else if (tokens[j].v === ')' && --depth === 0) break; if (tokens[j].k === 'stop') break; }
    if (depth !== 0 || !(tokens[j + 1] && tokens[j + 1].v === ':=')) continue;
    const rhsStart = j + 2;
    const parser = makeParser(tokens.slice(rhsStart));
    let type; try { type = parser.eq(); } catch { continue; }
    const used = parser.at();
    if (!(type.t === 'float' && type.frac) || !used) continue;
    // Only a token that can legally follow an expEqne operand may end the value; anything else
    // ("2.5junk", "0.5 (", "0.5 :=") means we did not understand the statement, so stay silent.
    const next = tokens[rhsStart + used];
    if (next && !(next.k === 'stop' || (next.k === 'op' && [',', ')', ']', '&', '^', '|', '&&', '^^', '||'].includes(next.v)))) continue;
    const index = literalIndex(tokens.slice(i + 2, j));
    const bank = t.v === 'var' ? 'fvar' : 'sysfvar';
    const label = text.slice(t.s, tokens[j].e);
    out.push(build(text, pos, { s: tokens[rhsStart].s, e: tokens[rhsStart + used - 1].e }, label, 'the assigned value',
      index === null ? null : { s: t.s, e: t.e, text: bank === 'fvar' ? 'fvar' : 'sysfvar', bank, from: t.v, index }));
  }
}

function controllerProblems(text, pos, params, out) {
  const by = new Map(params.map(p => [p.key, p]));
  if (by.has('fv') || by.has('sysfv')) return;
  const value = by.get('value'), target = by.get('v') || by.get('sysv');
  if (value && target) {
    const { type, complete } = typeOf(value.tokens);
    if (complete && type.t === 'float' && type.frac) {
      const index = literalIndex(target.tokens), sys = target.key === 'sysv';
      const name = `${sys ? 'sysvar' : 'var'}(${text.slice(target.vs, target.ve)})`;
      out.push(build(text, pos, { s: value.vs, e: value.ve }, name, 'value', index === null ? null
        : { s: target.ks, e: target.ke, text: sys ? 'sysfv' : 'fv', bank: sys ? 'sysfvar' : 'fvar', from: sys ? 'sysvar' : 'var', index }));
    }
    return;
  }
  for (const param of params) {
    const m = /^(sys)?var\s*\((.*)\)$/.exec(param.key);
    if (!m) continue;
    const { type, complete } = typeOf(param.tokens);
    if (!complete || type.t !== 'float' || !type.frac) continue;
    const keyTokens = tokenize(text, param.ks, param.ke, false).filter(t => t.k !== 'stop');
    const index = literalIndex(keyTokens.slice(2, -1));
    const from = m[1] ? 'sysvar' : 'var', bank = m[1] ? 'sysfvar' : 'fvar';
    out.push(build(text, pos, { s: param.vs, e: param.ve }, text.slice(param.ks, param.ke), 'the assigned value',
      index === null ? null : { s: param.ks, e: param.ks + from.length, text: bank, bank, from, index }));
  }
}

function cnsProblems(text, pos, out) {
  assignmentProblems(text, tokenize(text, 0, text.length, false), pos, out);
  let section = null;
  const flush = () => { if (section && VAR_CONTROLLERS.has(section.type)) controllerProblems(text, pos, section.params, out); };
  let offset = 0;
  for (const raw of text.split('\n')) {
    const lineStart = offset; offset += raw.length + 1;
    let code = raw.length, quoted = false;
    for (let i = 0; i < raw.length; i++) { if (raw[i] === '"') quoted = !quoted; else if (raw[i] === ';' && !quoted) { code = i; break; } }
    const body = raw.slice(0, code);
    if (/^\s*\[/.test(body)) { flush(); section = /^\s*\[\s*state\b/i.test(body) && !/^\s*\[\s*statedef/i.test(body) ? { type: '', params: [] } : null; continue; }
    if (!section) continue;
    const m = /^(\s*)([^=:]+?)\s*=(?!=)/.exec(body);
    if (!m) continue;
    const key = m[2].trim().toLowerCase().replace(/\s+/g, '');
    const ks = lineStart + m[1].length, ke = ks + m[2].length;
    let vs = lineStart + m[0].length; while (vs < lineStart + code && /\s/.test(text[vs])) vs++;
    const ve = trimRight(text, vs, lineStart + code);
    if (key === 'type') { section.type = text.slice(vs, ve).trim().toLowerCase(); continue; }
    section.params.push({ key, ks, ke, vs, ve, tokens: tokenize(text, vs, ve, false) });
  }
  flush();
}

function zssProblems(text, pos, out) {
  const tokens = tokenize(text, 0, text.length, true);
  assignmentProblems(text, tokens, pos, out);
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].k !== 'id' || !VAR_CONTROLLERS.has(tokens[i].v) || !(tokens[i + 1] && tokens[i + 1].v === '{')) continue;
    const params = []; let j = i + 2, segStart = j;
    const close = () => {
      const seg = tokens.slice(segStart, j);
      const colon = seg.findIndex(t => t.v === ':');
      if (colon > 0 && colon < seg.length - 1) {
        const keyTokens = seg.slice(0, colon), valueTokens = seg.slice(colon + 1);
        params.push({ key: text.slice(keyTokens[0].s, keyTokens[keyTokens.length - 1].e).toLowerCase().replace(/\s+/g, ''),
          ks: keyTokens[0].s, ke: keyTokens[keyTokens.length - 1].e, vs: valueTokens[0].s, ve: valueTokens[valueTokens.length - 1].e, tokens: valueTokens });
      }
    };
    for (; j < tokens.length && tokens[j].v !== '}'; j++) if (tokens[j].v === ';') { close(); segStart = j + 1; }
    close();
    controllerProblems(text, pos, params, out);
    i = j;
  }
}

function integerVarProblems(text, languageId) {
  const source = String(text ?? '');
  const lang = String(languageId || '').toLowerCase();
  const zss = lang === 'zss' || lang.endsWith('-zss');
  if (!zss && !/cns/.test(lang)) return [];
  const pos = lineIndex(source), out = [];
  (zss ? zssProblems : cnsProblems)(source, pos, out);
  return out.sort((a, b) => a.diagnostic.line - b.diagnostic.line || a.diagnostic.start - b.diagnostic.start);
}

module.exports = { integerVarProblems, INTEGER_VAR_FLOAT_CODE: CODE };
