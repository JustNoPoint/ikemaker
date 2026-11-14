'use strict';

// State -1 route order: the first ChangeState that fires wins, so a route whose command can complete on
// the same tick as a simpler route's command must come first. (Command recognition itself is
// order-independent: IKEMEN GO input.go CommandList.Step steps every [Command] every tick.)
//
// "B is contained in A" (A completes => B completes the same tick) when, for some definitions of each:
//   - B's final buttons are a subset of A's final buttons and both end on the same edge (press/release);
//   - B's direction steps are an ordered subsequence of A's and end on the same final direction, or B has
//     no directions at all (a plain button command fires with any motion that ends on that button);
//   - A is strictly more demanding (more directions or more final buttons).
// This covers HCF ⊃ QCF, DQCF ⊃ QCF, DDD ⊃ DD, x+y ⊃ x and motion+x ⊃ x. Routes whose posture guards
// contradict (StateType = A vs StateType != A) are not compared. Analysis covers CNS [Statedef -1];
// ZSS StateDef -1 files are reported as not analyzed.

const { parseCommands, splitSteps, nativeInputAtoms } = require('./command_movelist_model');

const DIRECTION = /^(?:DB|DF|UB|UF|DL|DR|UL|UR|[BDFULRN])$/;
const BUTTON = /^[xyzabcswdm]$/;
const core = atom => (String(atom).match(/(?:DB|DF|UB|UF|DL|DR|UL|UR|[BDFULRNxyzabcswdm])$/) || [''])[0];

// Every step becomes a token of its input cores (buttons keep a release marker); the final step is a set.
function shape(command) {
  const steps = splitSteps(String(command || '')).map(step => nativeInputAtoms(step));
  if (!steps.length || steps.some(step => !step.length)) return null;
  const token = atoms => atoms.map(atom => { const c = core(atom); return BUTTON.test(c) && atom.includes('~') ? '~' + c : c; }).sort();
  const tokens = steps.map(token);
  const last = tokens[tokens.length - 1];
  return { prefix: tokens.slice(0, -1).map(items => items.join('+')), last: new Set(last), release: last.some(item => item.startsWith('~')) };
}

function isSubsequence(small, large) {
  let at = 0;
  for (const item of large) if (item === small[at]) at += 1;
  return at === small.length;
}

// a completes => b completes on the same tick.
function contains(a, b) {
  if (!a || !b || a.release !== b.release) return false;
  if (![...b.last].every(item => a.last.has(item))) return false;
  const moreDemanding = a.prefix.length > b.prefix.length || a.last.size > b.last.size;
  if (!moreDemanding || !isSubsequence(b.prefix, a.prefix)) return false;
  // b's step before its final step must be a's step before its final step (same-tick alignment).
  return !b.prefix.length || b.prefix[b.prefix.length - 1] === a.prefix[a.prefix.length - 1];
}

function posture(text) {
  if (/statetype\s*=\s*a\b/i.test(text)) return 'air';
  if (/statetype\s*!=\s*a\b|statetype\s*=\s*[sc]\b/i.test(text)) return 'ground';
  return 'any';
}

const stripComment = line => { let quoted = false; for (let i = 0; i < line.length; i += 1) { if (line[i] === '"') quoted = !quoted; else if (line[i] === ';' && !quoted) return line.slice(0, i); } return line; };

// CNS [Statedef -1] routes with their exact line blocks (preceding comment lines travel with a block).
function parseMinusOneRoutes(text, file = '') {
  const lines = String(text || '').split(/\r\n|\r|\n/);
  const routes = [];
  let inMinusOne = false, current = null;
  const close = end => { if (current) { current.end = end; routes.push(current); current = null; } };
  lines.forEach((raw, line) => {
    const code = stripComment(raw).trim();
    const header = /^\[\s*([^\]]+)\]/.exec(code);
    if (header) {
      let start = line; while (start > 0 && /^\s*;/.test(lines[start - 1]) && (!current || start - 1 > current.headerLine)) start -= 1;
      close(start);
      if (/^statedef\b/i.test(header[1])) { inMinusOne = /^statedef\s+-1\b/i.test(header[1]); return; }
      if (inMinusOne && /^state\b/i.test(header[1])) current = { file, label: header[1].replace(/^state\s+-?\d*\s*,?\s*/i, '').trim() || header[1], headerLine: line, start, type: '', triggers: [], commands: [] };
      return;
    }
    if (!current || !code) return;
    const kv = /^([^=]+?)\s*=\s*(.*)$/.exec(code);
    if (!kv) return;
    const key = kv[1].trim().toLowerCase();
    if (key === 'type') current.type = kv[2].trim().toLowerCase();
    if (/^trigger(all|\d+)$/.test(key)) {
      current.triggers.push(kv[2]);
      for (const match of kv[2].matchAll(/command\s*=\s*"([^"]+)"/gi)) if (!current.commands.includes(match[1])) current.commands.push(match[1]);
    }
  });
  close(lines.length);
  return routes.filter(route => ['changestate', 'selfstate'].includes(route.type) && route.commands.length).map((route, index) => ({ ...route, index, posture: posture(route.triggers.join(' ')) }));
}

function analyzeRouteOrder({ routeText = '', routeFile = '', commandText = '', commandFile = '' } = {}) {
  const definitions = new Map();
  for (const command of parseCommands(commandText, commandFile).commands) {
    if (!command.name) continue;
    if (!definitions.has(command.name)) definitions.set(command.name, []);
    definitions.get(command.name).push({ command: command.command, shape: shape(command.command) });
  }
  const routes = parseMinusOneRoutes(routeText, routeFile);
  const issues = [];
  for (let later = 0; later < routes.length; later += 1) for (let earlier = 0; earlier < later; earlier += 1) {
    const L = routes[later], E = routes[earlier];
    if (L.posture !== 'any' && E.posture !== 'any' && L.posture !== E.posture) continue;
    let found = null;
    for (const ln of L.commands) for (const en of E.commands) {
      if (found || ln === en) continue;
      for (const ld of definitions.get(ln) || []) for (const ed of definitions.get(en) || []) if (!found && contains(ld.shape, ed.shape)) found = { laterCommand: ln, laterSequence: ld.command, earlierCommand: en, earlierSequence: ed.command };
    }
    if (found) issues.push({ later: L.index, earlier: E.index, laterLabel: L.label, earlierLabel: E.label, laterLine: L.headerLine, earlierLine: E.headerLine, ...found,
      message: `"${L.label}" (${found.laterCommand}: ${found.laterSequence}) is below "${E.label}" (${found.earlierCommand}: ${found.earlierSequence}). Completing ${found.laterCommand} also completes ${found.earlierCommand} on the same tick, so the route above wins. Move "${L.label}" above "${E.label}".` });
  }
  // Report each later route once, against its first (highest) blocker.
  const seen = new Set();
  const unique = issues.filter(issue => { if (seen.has(issue.later)) return false; seen.add(issue.later); return true; });
  return { file: routeFile, routes: routes.map(({ triggers, ...route }) => route), issues: unique, undefinedCommands: [...new Set(routes.flatMap(route => route.commands).filter(name => !definitions.has(name)))] };
}

// Move the block [from.start, from.end) so it begins where `to.start` begins. Pure text edit; EOL kept.
function moveRouteBlock(text, from, to) {
  const source = String(text), eol = (source.match(/\r\n|\r|\n/) || ['\n'])[0];
  const lines = source.split(/\r\n|\r|\n/);
  if (!(from.start < from.end && to.start < from.start)) throw new Error('A route can only be moved above an earlier route.');
  const block = lines.slice(from.start, from.end);
  while (block.length && !block[block.length - 1].trim()) block.pop();
  const rest = [...lines.slice(0, from.start), ...lines.slice(from.end)];
  rest.splice(to.start, 0, ...block, '');
  return rest.join(eol);
}

module.exports = { analyzeRouteOrder, parseMinusOneRoutes, moveRouteBlock, contains, shape };
