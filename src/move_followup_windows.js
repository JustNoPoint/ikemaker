'use strict';

const { parseStateSource } = require('./state_transfer_model');
const { transitionConditions } = require('./move_transition_conditions');

// A contact trigger describes the current observation. No contact yet can
// become a hit on a later tick. State time is distinct from AIR element time.
const outcomes = {
  movehit: ['Hit'],
  moveguarded: ['Guard'],
  movecontact: ['Hit', 'Guard'],
  '!movecontact': ['No contact yet']
};

function analyzeTerms(expressions) {
  let possible = ['Hit', 'Guard', 'No contact yet'];
  let lower = 0, upper = Infinity, timed = false, other = false;
  for (const expression of expressions) {
    // Only split plain conjunctions. Parentheses, disjunctions and negated
    // groups must remain opaque or they could reverse an inferred condition.
    const terms = /[()|"'^]/.test(expression) ? [expression] : expression.split('&&');
    for (const term of terms) {
      const atom = term.trim().toLowerCase().replace(/!\s+/g, '!');
      if (outcomes[atom]) {
        possible = possible.filter(item => outcomes[atom].includes(item));
        continue;
      }
      const gate = /^time\s*(>=|>|=|<=|<)\s*(\d+)$/.exec(atom);
      if (!gate) { if (atom !== '1') other = true; continue; }
      const n = Number(gate[2]);
      if (!Number.isSafeInteger(n)) { other = true; continue; }
      timed = true;
      if (['=', '>=', '>'].includes(gate[1])) lower = Math.max(lower, n + Number(gate[1] === '>'));
      if (['=', '<=', '<'].includes(gate[1])) upper = Math.min(upper, n - Number(gate[1] === '<'));
    }
  }
  const contact = possible.length === 3 ? (other ? 'Contact outcome unresolved' : 'Any contact outcome') : possible.join(' or ');
  if (lower > upper) return 'Conflicting state-time limits in this group';
  if (!possible.length) return 'Inspect combined contact conditions in source';
  const timing = timed ? 'state tick ' + lower + (upper === lower ? ' only' : upper === Infinity ? ' or later' : ' through ' + upper) : 'timing unspecified';
  return [contact, timing, other ? 'additional conditions in source' : ''].filter(Boolean).join(' · ');
}

function followupWindows(sections) {
  const rows = [];
  for (const section of sections || []) {
    if (section.kind !== 'move-state') continue;
    const text = String(section.text || ''), parsed = parseStateSource(text, section.filename, section.language);
    for (const transfer of parsed.transfers) {
      if (transfer.kind !== 'changestate' || transfer.redirected || transfer.ambiguous) continue;
      const groups = new Map(), shared = [], expressions = [];
      if (parsed.grammar === 'cns') {
        for (const line of text.slice(transfer.controllerStart, transfer.controllerEnd).split(/\r?\n/)) {
          const match = /^\s*trigger(all|\d+)\s*=\s*(.+)$/i.exec(line);
          // A semicolon inside a quoted command name belongs to the source.
          if (match) match[2] = match[2].replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|;.*/g, (_all, quoted) => quoted || '').trim();
          if (!match) continue;
          expressions.push('trigger' + match[1] + ' = ' + match[2].trim());
          if (match[1].toLowerCase() === 'all') shared.push(match[2]);
          else {
            if (!groups.has(match[1])) groups.set(match[1], []);
            groups.get(match[1]).push(match[2]);
          }
        }
      }
      const cases = Array.from(groups, ([id, terms]) => 'Trigger ' + id + ' · ' + analyzeTerms([...shared, ...terms]));
      if (!cases.length) {
        const conditions = transitionConditions(text, transfer, parsed.grammar).expressions;
        expressions.push(...conditions);
        cases.push(conditions.length ? 'Enclosing source conditions: ' + conditions.join(' / ') : 'See state code for conditions');
      }
      rows.push({ sectionId: section.id, line: section.startLine + transfer.line, target: transfer.expression || 'dynamic target', cases, expressions });
    }
  }
  return rows;
}

module.exports = { followupWindows };
