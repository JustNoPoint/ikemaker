'use strict';

const REDIRECTS = [
  ['root', /\broot\s*,/i, null],
  ['parent', /\bparent\s*,/i, 'numHelper'],
  ['helper', /\bhelper(?:\s*\([^)]*\))?\s*,/i, 'numHelper'],
  ['target', /\btarget(?:\s*\([^)]*\))?\s*,/i, 'numTarget'],
  ['enemy', /\benemy(?:Near)?(?:\s*\([^)]*\))?\s*,/i, 'numEnemy'],
  ['partner', /\bpartner(?:\s*\([^)]*\))?\s*,/i, 'numPartner'],
  ['player/playerID', /\b(?:player|playerID)\s*\([^)]*\)\s*,/i, null],
  ['stateOwner', /\bstateOwner\s*,/i, null]
];

function withoutComment(line) {
  let quote = false;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '"' && line[i - 1] !== '\\') quote = !quote;
    if (line[i] === '#' && !quote) return line.slice(0, i);
  }
  return line;
}

function lineOffsets(text) {
  const lines = text.split(/\r?\n/);
  const offsets = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + (text.slice(offset + line.length, offset + line.length + 2) === '\r\n' ? 2 : 1);
  }
  return { lines, offsets };
}

function issue(line, start, length, severity, code, message, help) {
  return { line, start, length: Math.max(1, length), severity, code, message, help };
}

function enclosingContext(lines, line, distance = 6) {
  return lines.slice(Math.max(0, line - distance), line + 1).map(withoutComment).join(' ');
}

function withoutStrings(line) {
  let quote = false;
  let result = '';
  for (let i = 0; i < line.length; i += 1) {
    const character = line[i];
    if (character === '"' && line[i - 1] !== '\\') {
      quote = !quote;
      result += ' ';
    } else result += quote ? ' ' : character;
  }
  return result;
}

function opponentAvailabilitySeverity(value) {
  const policy = String(value || 'off').toLowerCase();
  if (policy === 'warning') return 'warning';
  if (policy === 'information' || policy === 'info' || policy === 'convention') return 'information';
  return null;
}

function negativeStateContexts(lines) {
  const result = [];
  let negative = false;
  for (const raw of lines) {
    const line = withoutComment(raw);
    const state = /^\s*\[\s*StateDef\s+([^;\]]+)/i.exec(line);
    const func = /^\s*\[\s*Function\b/i.test(line);
    if (state) negative = /^\s*-\d+\s*$/.test(state[1]);
    else if (func) negative = false;
    result.push(negative);
  }
  return result;
}

function hasEngineTimeZeroContract(lines, line) {
  const rawLines = lines.slice(Math.max(0, line - 8), line + 1);
  const rawContext = rawLines.join(' ');
  if (/@time-zero\s+engine\b/i.test(rawContext)) return true;

  const context = rawLines.map(withoutComment).join(' ');
  if (/\bstateNo\s*=\s*const\s*\(\s*State[A-Za-z0-9_.]*\s*\)/i.test(context)) return true;

  const literal = /\bstateNo\s*=\s*(\d+)\b/i.exec(context);
  return Boolean(literal && Number(literal[1]) >= 0 && Number(literal[1]) <= 199);
}

function normalizePrefixes(value) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values
    .filter((entry) => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean))];
}

function usesPrefix(name, prefixes) {
  return prefixes.some((prefix) => name.startsWith(prefix));
}

function analyzeZss(text, options = {}) {
  const mapPrefixes = normalizePrefixes(options.mapPrefixes !== undefined ? options.mapPrefixes : options.mapPrefix);
  const functionPrefixes = normalizePrefixes(options.functionPrefixes !== undefined ? options.functionPrefixes : options.functionPrefix);
  const opponentSeverity = String(options.authorName || '').trim() ? opponentAvailabilitySeverity(options.opponentAvailability) : null;
  const { lines } = lineOffsets(text);
  const issues = [];
  const records = collectRecords(text);
  const inNegativeState = negativeStateContexts(lines);

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = withoutComment(raw);
    if (!line.trim()) continue;
    const context = enclosingContext(lines, i);

    const timeZero = /\btime\s*=\s*0\b/i.exec(line);
    if (timeZero && inNegativeState[i] && !hasEngineTimeZeroContract(lines, i)) {
      issues.push(issue(i, timeZero.index, timeZero[0].length, 'information', 'negative-time-zero',
        '`time = 0` in a negative StateDef depends on state and engine processing order.',
        'Use `time <= 1` only when a two-tick window is safe, use an entry latch for exactly-once work, or add `# @time-zero engine` for a verified hardcoded engine contract.'));
    }

    // Redirects that can disappear between team modes or during state transitions.
    for (const [name, pattern, guard] of REDIRECTS) {
      const match = pattern.exec(line);
      if (!match) continue;
      if (guard && !new RegExp(`\\b${guard}\\b`, 'i').test(context)) {
        issues.push(issue(i, match.index, match[0].length, 'warning', 'redirect-guard',
          `${name} redirect has no nearby ${guard} validity guard.`,
          `Guard the redirect in the same condition/block; ${name} may not exist in every Simul, Tag, Turns, or lifecycle frame.`));
      }
      if (name === 'root' && !/\bnumHelper\b/i.test(context)) {
        issues.push(issue(i, match.index, match[0].length, 'information', 'root-context',
          'root redirect assumes this code is executing as a helper.',
          'If this function can run for both a player and helper, branch on numHelper or document the ownership contract.'));
      }
    }

    const p2Line = withoutStrings(line);
    const p2 = /\bp2\s*,/i.exec(p2Line);
    if (p2 && opponentSeverity) {
      issues.push(issue(i, p2.index, p2[0].length, opponentSeverity, 'opponent-guard',
        'Author-rule heuristic: review this P2 redirect\'s selected-opponent contract.',
        'P2 is a persistent engine-selected opponent, not simply enemyNear, and is not inherently wrong in Simul. This is the identified author\'s contextual advice, not a game rule, syntax error, or runtime error. Verify that the current P2 selection is the intended target and guard only when the surrounding operation requires it.'));
    }

    const partner = /\bpartner\s*,/i.exec(line);
    if (partner && !/\bteamMode\s*=\s*(?:simul|tag)\b/i.test(context)) {
      issues.push(issue(i, partner.index, partner[0].length, 'information', 'team-mode',
        'partner redirect is not visibly restricted to a team mode.',
        'Check teamMode and numPartner when behavior should differ between Single, Simul, Tag, and Turns.'));
    }

    const playerNumber = /\bplayer\s*\(\s*[1-8]\s*\)\s*,/i.exec(line);
    if (playerNumber) {
      issues.push(issue(i, playerNumber.index, playerNumber[0].length, 'warning', 'literal-player-slot',
        'Literal player-slot redirect is fragile in Simul and Tag.',
        'Prefer playerID, enemy, partner, target, teamLeader, or an ID stored during an explicit handshake.'));
    }

    if (/\b(?:targetState|selfState)\s*\{/i.test(line)) {
      const match = /\b(?:targetState|selfState)\b/i.exec(line);
      if (/\btargetState\b/i.test(match[0]) && !/\bnumTarget\b/i.test(context)) {
        issues.push(issue(i, match.index, match[0].length, 'error', 'targetstate-guard',
          'targetState has no nearby numTarget guard.',
          'A target can be released or replaced before this controller executes.'));
      }
      // Ownership annotations are comments, so inspect raw context here rather
      // than enclosingContext(), which intentionally removes comments.
      const annotationContext = lines.slice(Math.max(0, i - 30), i + 1).join(' ');
      if (!/@customstate\b/i.test(annotationContext)) {
        issues.push(issue(i, match.index, match[0].length, 'information', 'customstate-contract',
          'Custom-state transfer has no nearby ownership annotation.',
          'Consider # @customstate controller=attacker plus @position-owner, @facing-owner, and @sync annotations.'));
      }
    }

    if (/\b(?:posSet|posAdd|velSet|velAdd|turn|changeState|selfState)\s*\{/i.test(line)
        && /\b(?:target|enemy|partner|player(?:ID)?\s*\([^)]*\))\s*,/i.test(line)) {
      const match = /\b(?:posSet|posAdd|velSet|velAdd|turn|changeState|selfState)\b/i.exec(line);
      issues.push(issue(i, match.index, match[0].length, 'warning', 'cross-entity-write',
        'This frame writes movement/state through another entity redirect.',
        'Processing order can change when MoveType becomes A. Use one position owner and a GameTime-stamped handshake for same-frame coordination.'));
    }

    const orderFlag = /\b(?:runFirst|runLast)\b/i.exec(line);
    if (orderFlag) {
      issues.push(issue(i, orderFlag.index, orderFlag[0].length, 'information', 'forced-order',
        `${orderFlag[0]} changes normal player processing order.`,
        'Use only for a documented global ordering contract; it can hide cross-entity synchronization assumptions.'));
    }

    const loop = /^\s*while\b/i.exec(line);
    if (loop) {
      const block = lines.slice(i, Math.min(lines.length, i + 40)).map(withoutComment).join('\n');
      const condition = line.replace(/^\s*while\s*/i, '').replace(/\{.*$/, '').trim();
      const identifiers = condition.match(/\b[A-Za-z_][A-Za-z0-9_.]*\b/g) || [];
      const changesCondition = identifiers.some((id) => new RegExp(`(?:\\b${escapeRegExp(id)}\\b\\s*(?::=|[+\\-*/]?=)|(?:map|var|fvar)\\s*\\([^)]*${escapeRegExp(id)}[^)]*\\)\\s*:=)`, 'i').test(block));
      if (!/\bbreak\b/i.test(block) && !changesCondition) {
        issues.push(issue(i, loop.index, loop[0].length, 'warning', 'loop-progress',
          'Loop condition has no obvious update or break in the following block.',
          'IKEMEN caps loops, but a capped loop can still waste a frame and conceal a logic error.'));
      }
      if (/\b(?:enemy|partner|target|helper|player(?:ID)?)\s*(?:\([^)]*\))?\s*,/i.test(block)) {
        issues.push(issue(i, loop.index, loop[0].length, 'information', 'loop-redirect',
          'Loop contains redirected entity access.',
          'Revalidate the redirect inside the loop and avoid assuming entity enumeration or processing order is stable.'));
      }
    }
  }

  for (const record of records.maps) {
    if (mapPrefixes.length && record.name && !usesPrefix(record.name, mapPrefixes)) {
      issues.push(issue(record.line, record.start, record.name.length, 'information', 'map-prefix',
        `Map "${record.name}" does not use an allowed namespace (${mapPrefixes.join(', ')}).`,
        'Prefix owned maps to reduce collisions when injecting shared systems into other characters.'));
    }
  }
  for (const record of records.functions.filter((r) => r.declaration)) {
    // IkSys_* declarations are engine-owned common-state API, not extension-user symbols.
    if (functionPrefixes.length && !usesPrefix(record.name, functionPrefixes) && !record.name.startsWith('IkSys_')) {
      issues.push(issue(record.line, record.start, record.name.length, 'information', 'function-prefix',
        `Function "${record.name}" does not use an allowed namespace (${functionPrefixes.join(', ')}).`,
        'Prefix owned functions to avoid collisions across loaded ZSS modules.'));
    }
  }

  return { issues, records };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectRecords(text, file = '') {
  const lines = text.split(/\r?\n/);
  const records = { maps: [], variables: [], functions: [], calls: [], states: [], stateReferences: [], resources: [] };
  const add = (bucket, name, line, start, extra = {}) => records[bucket].push({ name, line, start, file, ...extra });

  lines.forEach((raw, lineNumber) => {
    const line = withoutComment(raw);
    let match;
    const mapPattern = /\bmap\s*\(\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\)/gi;
    while ((match = mapPattern.exec(line))) {
      const rest = line.slice(match.index + match[0].length);
      add('maps', match[1], lineNumber, match.index + match[0].indexOf(match[1]), {
        // In ZSS, := mutates a map. A single = is comparison and therefore a read.
        access: /^\s*:=/.test(rest) ? 'write' : 'read'
      });
    }
    const variablePattern = /\b(sysvar|fvar|var)\s*\(\s*([^)]*?)\s*\)/gi;
    while ((match = variablePattern.exec(line))) {
      const rest = line.slice(match.index + match[0].length);
      add('variables', `${match[1].toLowerCase()}(${match[2].trim()})`, lineNumber, match.index, {
        kind: match[1].toLowerCase(), index: match[2].trim(), access: /^\s*(?::=|=)/.test(rest) ? 'write' : 'read'
      });
    }
    const func = /^\s*\[\s*Function\s+([A-Za-z_][A-Za-z0-9_.]*)\s*(\([^\]]*\))?/i.exec(line);
    if (func) {
      const params = func[2] ? func[2].slice(1, -1).split(',').map((value) => value.trim()).filter(Boolean) : [];
      add('functions', func[1], lineNumber, line.indexOf(func[1]), { declaration: true, signature: func[2] || '()', arity: params.length });
    }
    const callPattern = /\bcall\s+([A-Za-z_][A-Za-z0-9_.]*)\s*\(([^;]*)\)/gi;
    while ((match = callPattern.exec(line))) {
      const args = match[2].trim() ? match[2].split(',').length : 0;
      add('calls', match[1], lineNumber, match.index + match[0].indexOf(match[1]), { arity: args });
    }
    const state = /^\s*\[\s*StateDef\s+([^;\]]+)/i.exec(line);
    if (state) add('states', state[1].trim(), lineNumber, line.indexOf(state[1]), { kind: 'state' });
    const resourcePattern = /\b(helper|explod|projectile)\s*\{[^}]*\bid\s*:\s*([^;}]+)/gi;
    while ((match = resourcePattern.exec(line))) add('resources', `${match[1].toLowerCase()} ${match[2].trim()}`, lineNumber, match.index, { kind: match[1].toLowerCase(), id: match[2].trim() });
  });
  const uncommented = lines.map(withoutComment).join('\n');
  const stateReference = /\b(?:changeState|selfState)\s*\{[^}]*?\bvalue\s*:\s*(-?\d+)/gi;
  let reference;
  while ((reference = stateReference.exec(uncommented))) {
    const numberOffset = reference.index + reference[0].lastIndexOf(reference[1]);
    const prefix = uncommented.slice(0, numberOffset);
    const line = (prefix.match(/\n/g) || []).length;
    const lastBreak = prefix.lastIndexOf('\n');
    add('stateReferences', reference[1], line, numberOffset - lastBreak - 1, { kind: 'state', declaration: false });
  }
  return records;
}

module.exports = { analyzeZss, collectRecords, withoutComment };
