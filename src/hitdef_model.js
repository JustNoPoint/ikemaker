'use strict';

const GROUPS = [
  { id: 'common', label: 'Common attack settings', open: true, names: ['attr', 'hitflag', 'guardflag', 'damage', 'pausetime', 'guard.pausetime', 'animtype', 'air.animtype', 'ground.type', 'air.type', 'ground.slidetime', 'ground.hittime', 'guard.slidetime', 'guard.hittime', 'air.hittime', 'ground.velocity', 'guard.velocity', 'air.velocity', 'yaccel', 'sparkno', 'guard.sparkno', 'sparkxy', 'hitsound', 'guardsound'] },
  { id: 'contact', label: 'Contact, guard, and targeting', names: ['affectteam', 'priority', 'guard.ctrltime', 'guard.dist', 'guard.dist.width', 'guard.dist.height', 'airguard.ctrltime', 'airguard.velocity', 'air.juggle', 'p2clsncheck', 'p2clsnrequire', 'ignorereversaldef', 'hitonce', 'numhits', 'unhittabletime', 'teamside'] },
  { id: 'fall', label: 'Fall, down, and recovery', names: ['fall', 'air.fall', 'forcenofall', 'fall.animtype', 'fall.xvelocity', 'fall.yvelocity', 'fall.zvelocity', 'fall.recover', 'fall.recovertime', 'fall.damage', 'down.velocity', 'down.hittime', 'down.bounce', 'down.recover', 'down.recovertime'] },
  { id: 'position', label: 'Position, facing, layers, and state handoff', names: ['mindist', 'maxdist', 'snap', 'p1sprpriority', 'p2sprpriority', 'p1facing', 'p1getp2facing', 'p2facing', 'p1stateno', 'p2stateno', 'p2getp1state', 'forcestand', 'forcecrouch', 'attack.depth'] },
  { id: 'chain', label: 'Chains, power, score, and KO rules', names: ['id', 'chainID', 'nochainID', 'kill', 'guard.kill', 'fall.kill', 'getpower', 'givepower', 'dizzypoints', 'guardpoints', 'redlife', 'score'] },
  { id: 'presentation', label: 'Sparks, sound, PalFX, and shake', names: ['sparkangle', 'sparkscale', 'guard.sparkangle', 'guard.sparkscale', 'hitsound.channel', 'guardsound.channel', 'palfx.time', 'palfx.mul', 'palfx.add', 'envshake.time', 'envshake.freq', 'envshake.ampl', 'envshake.phase', 'envshake.mul', 'envshake.dir', 'fall.envshake.time', 'fall.envshake.freq', 'fall.envshake.ampl', 'fall.envshake.phase', 'fall.envshake.mul', 'fall.envshake.dir'] },
  { id: 'physics', label: 'Corner push, acceleration, and friction', names: ['ground.cornerpush.veloff', 'air.cornerpush.veloff', 'down.cornerpush.veloff', 'guard.cornerpush.veloff', 'airguard.cornerpush.veloff', 'xaccel', 'zaccel', 'stand.friction', 'crouch.friction'] },
  { id: 'engine', label: 'IKEMEN extended and uncommon behavior', names: ['keepstate', 'missonoverride'] }
];

const STARTER = {
  attr: 'S, NA', hitflag: 'MAF', guardflag: 'MA', damage: '30, 0', pausetime: '8, 8',
  'guard.pausetime': '8, 8', animtype: 'Light', 'air.animtype': 'Back', 'ground.type': 'High',
  'air.type': 'High', 'ground.slidetime': '10', 'ground.hittime': '12', 'guard.slidetime': '10',
  'guard.hittime': '10', 'air.hittime': '20', 'ground.velocity': '-4, 0', 'guard.velocity': '-4',
  'air.velocity': '-4, -4', yaccel: '.5', sparkno: '-1', 'guard.sparkno': '-1', sparkxy: '0, 0',
  hitsound: '-1', guardsound: '-1'
};

function lineOffsets(text) {
  const lines = [], re = /.*(?:\r?\n|$)/g; let match;
  while ((match = re.exec(text)) && match[0]) lines.push({ text: match[0].replace(/\r?\n$/, ''), start: match.index, end: re.lastIndex });
  return lines;
}

function matchingBrace(text, open) {
  let depth = 0, quote = '', lineComment = false;
  for (let i = open; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (lineComment) { if (c === '\n') lineComment = false; continue; }
    if (!quote && ((c === '/' && n === '/') || c === '#')) { lineComment = true; if (c === '/') i++; continue; }
    if (quote) { if (c === quote && text[i - 1] !== '\\') quote = ''; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i + 1;
  }
  return text.length;
}

function parseParams(text, start, end, syntax) {
  const result = {}, duplicates = [];
  for (const line of lineOffsets(text.slice(start, end))) {
    const match = syntax === 'zss'
      ? /^\s*([\w.]+)\s*:\s*(.*?)\s*;\s*(?:(?:#|\/\/).*)?$/.exec(line.text)
      : /^\s*([\w.]+)\s*=\s*(.*?)\s*(?:;.*)?$/.exec(line.text);
    if (!match) continue;
    const key = match[1].toLowerCase();
    if (syntax === 'cns' && (key === 'type' || /^trigger\d*$/.test(key))) continue;
    if (result[key]) duplicates.push(key);
    result[key] = { name: match[1], value: match[2].trim(), start: start + line.start, end: start + line.end };
  }
  return { values: Object.fromEntries(Object.entries(result).map(([key, item]) => [key, item.value])), entries: result, duplicates };
}

function parseZss(text) {
  const blocks = []; const re = /\bhitdef\s*\{/ig; let match;
  while ((match = re.exec(text))) {
    const open = text.indexOf('{', match.index), end = matchingBrace(text, open), parsed = parseParams(text, match.index, end, 'zss');
    blocks.push({ syntax: 'zss', start: match.index, end, bodyStart: open + 1, bodyEnd: Math.max(open + 1, end - 1), ...parsed });
    re.lastIndex = Math.max(re.lastIndex, end);
  }
  return blocks;
}

function parseCns(text) {
  const lines = lineOffsets(text), blocks = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*\[\s*State\b/i.test(lines[i].text)) continue;
    let j = i + 1; while (j < lines.length && !/^\s*\[/.test(lines[j].text)) j++;
    const start = lines[i].start, end = j < lines.length ? lines[j].start : text.length, body = text.slice(start, end);
    if (!/^\s*type\s*=\s*hitdef\b/im.test(body)) continue;
    const parsed = parseParams(text, start, end, 'cns');
    blocks.push({ syntax: 'cns', start, end, bodyStart: start, bodyEnd: end, ...parsed });
    i = j - 1;
  }
  return blocks;
}

function parseHitDefs(text, syntax) { return syntax === 'cns' ? parseCns(text) : parseZss(text); }
function chooseHitDef(blocks, offset) {
  return blocks.find((item) => offset >= item.start && offset <= item.end)
    || [...blocks].reverse().find((item) => item.start <= offset)
    || blocks[0] || null;
}

function groupedParameters(catalog) {
  const parameters = (catalog && catalog.params || []).map((item) => ({ ...item, key: String(item.name).toLowerCase() }));
  const used = new Set(), groups = GROUPS.map((group) => ({ ...group, parameters: group.names.map((name) => parameters.find((item) => item.key === name.toLowerCase())).filter(Boolean).map((item) => (used.add(item.key), item)) }));
  const other = parameters.filter((item) => !used.has(item.key));
  if (other.length) groups.push({ id: 'other', label: 'Other documented options', names: [], parameters: other });
  return groups;
}

function updateHitDef(text, block, changes) {
  if (!block) throw new Error('Choose a HitDef before applying changes.');
  if (block.duplicates.length) throw new Error(`Resolve duplicate option(s) first: ${[...new Set(block.duplicates)].join(', ')}.`);
  const edits = [], additions = [];
  for (const change of changes) {
    const key = String(change.name).toLowerCase(), existing = block.entries[key];
    if (!change.enabled || !String(change.value || '').trim()) {
      if (existing) edits.push({ start: existing.start, end: existing.end, text: '' });
      continue;
    }
    const value = String(change.value).trim();
    if (existing) {
      const old = text.slice(existing.start, existing.end), eol = old.endsWith('\r\n') ? '\r\n' : old.endsWith('\n') ? '\n' : '';
      const indent = /^\s*/.exec(old)[0], suffix = block.syntax === 'zss' ? ';' : '';
      edits.push({ start: existing.start, end: existing.end, text: `${indent}${change.name}${block.syntax === 'zss' ? ': ' : ' = '}${value}${suffix}${eol}` });
    } else additions.push({ name: change.name, value });
  }
  if (additions.length) {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const indent = block.syntax === 'zss' ? '  ' : '';
    const inserted = additions.map((item) => `${indent}${item.name}${block.syntax === 'zss' ? ': ' : ' = '}${item.value}${block.syntax === 'zss' ? ';' : ''}`).join(eol) + eol;
    edits.push({ start: block.bodyEnd, end: block.bodyEnd, text: block.syntax === 'zss' ? `${eol}${inserted}` : inserted });
  }
  return edits.sort((a, b) => b.start - a.start).reduce((value, edit) => value.slice(0, edit.start) + edit.text + value.slice(edit.end), text);
}

function newHitDef(syntax = 'zss', state = 'State', selected = STARTER) {
  const eol = '\n', entries = Object.entries(selected).filter(([, value]) => String(value).trim());
  if (syntax === 'cns') return [`[State ${state}, HitDef]`, 'type = HitDef', 'trigger1 = AnimElem = 1', ...entries.map(([name, value]) => `${name} = ${value}`), ''].join(eol);
  return ['hitDef {', ...entries.map(([name, value]) => `  ${name}: ${value};`), '}', ''].join(eol);
}

module.exports = { GROUPS, STARTER, parseHitDefs, chooseHitDef, groupedParameters, updateHitDef, newHitDef };
