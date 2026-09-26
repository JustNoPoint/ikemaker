'use strict';

const { parseAir } = require('./air_preview_model');

const FIELD_SCHEMA = [
  { suffix: 'contactSource', category: 'Classification', label: 'Contact source', type: 'enum', values: ['Unspecified', 'Arm / punch', 'Leg / kick', 'Body', 'Weapon', 'Energy'] },
  { suffix: 'deliveryType', category: 'Classification', label: 'Delivery type', type: 'enum', values: ['Unspecified', 'Direct', 'Projectile', 'Throw', 'Field'] },
  { suffix: 'weaponSubtype', category: 'Classification', label: 'Weapon subtype', type: 'enum', values: ['None', 'Sharp', 'Blunt'] },
  { suffix: 'attackStrength', category: 'Classification', label: 'Attack strength', type: 'enum', values: ['None', 'Light', 'Medium', 'Heavy'] },
  { suffix: 'guardClass', category: 'Classification', label: 'Guard class', type: 'enum', values: ['Unspecified', 'Mid', 'Low', 'Overhead', 'Unblockable', 'Throw'] },
  { suffix: 'throwClass', category: 'Classification', label: 'Throw class', type: 'enum', values: ['None', 'Normal', 'Command', 'Special / system'] },
  { suffix: 'knockdownClass', category: 'Classification', label: 'Knockdown class', type: 'enum', values: ['None', 'Soft', 'Hard', 'Forced', 'Scripted'] },
  { suffix: 'armorBreak', category: 'Classification', label: 'Armor break', type: 'boolean' },
  { suffix: 'moveID', category: 'Identity', label: 'Move / AIR action', type: 'integer', min: 0 },
  { suffix: 'hitIndex', category: 'Identity', label: 'Hit index', type: 'integer', min: 1 },
  { suffix: 'hitDefID', category: 'Identity', label: 'HitDef ID', type: 'integer', min: 0 },
  { suffix: 'firstActiveElement', category: 'Animation timing', label: 'First active element', type: 'integer', min: 1 },
  { suffix: 'hitPauseAnimateStartElement', category: 'Animation timing', label: 'Hit-pause animation starts', type: 'integer', min: 0 },
  { suffix: 'hitPauseFreezeElement', category: 'Animation timing', label: 'Hit-pause freeze element', type: 'integer', min: 0 },
  { suffix: 'hitPauseAnimateTicks', category: 'Animation timing', label: 'Hit-pause animation ticks', type: 'integer', min: 0 },
  { suffix: 'idleElement', category: 'Animation timing', label: 'First recovery / idle element', type: 'integer', min: 1 },
  { suffix: 'damage', category: 'Damage', label: 'Damage', type: 'integer', min: 0 },
  { suffix: 'groundHitTime', category: 'Contact timing', label: 'Ground hitstun', type: 'integer', min: 0 },
  { suffix: 'groundSlideTime', category: 'Contact timing', label: 'Ground slide time', type: 'integer', min: 0 },
  { suffix: 'guardHitTime', category: 'Contact timing', label: 'Guard stun', type: 'integer', min: 0 },
  { suffix: 'counterHitBonusTime', category: 'Counter Hit', label: 'Bonus hitstun', type: 'integer', min: 0 },
  { suffix: 'counterHitDamagePercent', category: 'Counter Hit', label: 'Damage percent', type: 'integer', min: 0 },
  { suffix: 'counterHitReactionState', category: 'Counter Hit', label: 'Reaction state', type: 'integer', min: 0 },
  { suffix: 'punishCounterBonusTime', category: 'Punish Counter', label: 'Bonus hitstun', type: 'integer', min: 0 },
  { suffix: 'punishCounterDamagePercent', category: 'Punish Counter', label: 'Damage percent', type: 'integer', min: 0 },
  { suffix: 'punishCounterDriveDamage', category: 'Punish Counter', label: 'Drive damage', type: 'integer', min: 0 },
  { suffix: 'punishCounterReactionState', category: 'Punish Counter', label: 'Reaction state', type: 'integer', min: 0 },
  { suffix: 'punishCounterHardKnockdown', category: 'Punish Counter', label: 'Hard knockdown', type: 'boolean' },
  { suffix: 'punishCounterDownTime', category: 'Punish Counter', label: 'Down time', type: 'integer', min: 0 },
  { suffix: 'suppressCounterBonuses', category: 'Counter rules', label: 'Suppress ordinary bonuses', type: 'boolean' },
  { suffix: 'sparkX', category: 'Effect placement', label: 'Hit 1 spark X', type: 'integer' },
  { suffix: 'sparkY', category: 'Effect placement', label: 'Hit 1 spark Y', type: 'integer' }
];

function parseConstants(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/), values = [], byName = new Map();
  let section = '';
  lines.forEach((raw, line) => {
    const heading = /^\s*\[\s*([^\]]+)\s*\]/.exec(raw);
    if (heading) { section = heading[1].trim().toLowerCase(); return; }
    if (section !== 'constants') return;
    const match = /^(\s*)([A-Za-z_][A-Za-z0-9_.]*)(\s*=\s*)([-+]?\d+(?:\.\d+)?)(\s*(?:;.*)?)$/.exec(raw);
    if (!match) return;
    const item = { name: match[2], value: Number(match[4]), rawValue: match[4], line, indent: match[1], separator: match[3], suffixText: match[5] || '' };
    values.push(item); byName.set(item.name.toLowerCase(), item);
  });
  return { lines, values, byName };
}

function moveGroups(parsed) {
  const groups = new Map();
  for (const item of parsed.values) {
    const match = /^((?:normal|special|hyper)\.[A-Za-z0-9_]+)\.(.+)$/i.exec(item.name);
    if (!match) continue;
    const key = match[1].toLowerCase();
    if (!groups.has(key)) groups.set(key, { id: key, prefix: match[1], values: {}, declarations: {} });
    groups.get(key).values[match[2]] = item.value;
    groups.get(key).declarations[match[2]] = item;
  }
  return [...groups.values()].sort((a, b) => a.prefix.localeCompare(b.prefix, undefined, { numeric: true }));
}

function fieldsFor(move) {
  const known = new Set(FIELD_SCHEMA.map((field) => field.suffix.toLowerCase()));
  const fields = FIELD_SCHEMA.map((field) => ({ ...field, value: move.values[field.suffix], present: Object.prototype.hasOwnProperty.call(move.values, field.suffix), line: move.declarations[field.suffix]?.line ?? null }));
  for (const [suffix, value] of Object.entries(move.values)) if (!known.has(suffix.toLowerCase())) {
    const spark = /^spark(\d+)([xy])$/i.exec(suffix);
    fields.push({ suffix, category: spark ? 'Effect placement' : 'Project-specific', label: spark ? `Hit ${spark[1]} spark ${spark[2].toUpperCase()}` : suffix, type: 'number', value, present: true, line: move.declarations[suffix]?.line ?? null });
  }
  return fields;
}

function updateConstant(text, name, value) {
  const parsed = parseConstants(text), item = parsed.byName.get(String(name).toLowerCase());
  if (!item) throw new Error(`Constant ${name} was not found. This editor does not silently invent move fields.`);
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${name} requires a finite numeric value.`);
  parsed.lines[item.line] = `${item.indent}${item.name}${item.separator}${Number.isInteger(number) ? number : number}${item.suffixText}`;
  return parsed.lines.join(String(text).includes('\r\n') ? '\r\n' : '\n');
}

function resolveMoveTargets(moves, input, sourceId = '') {
  const tokens = Array.isArray(input) ? input : String(input || '').split(',');
  const selected = [], unresolved = [];
  for (const raw of tokens) {
    const token = String(raw || '').trim(); if (!token) continue;
    const numeric = /^[-+]?\d+$/.test(token) ? Number(token) : null;
    const move = moves.find((item) => item.id !== sourceId && (
      item.id.toLowerCase() === token.toLowerCase()
      || item.prefix.toLowerCase() === token.toLowerCase()
      || (numeric !== null && Number(item.values.moveID) === numeric)
    ));
    if (!move) unresolved.push(token);
    else if (!selected.some((item) => item.id === move.id)) selected.push(move);
  }
  return { selected, unresolved };
}

function copyMoveFields(text, sourceId, targetIds, suffixes, draftValues = {}) {
  const eol = String(text).includes('\r\n') ? '\r\n' : '\n', parsed = parseConstants(text), moves = moveGroups(parsed);
  const source = moves.find((item) => item.id === String(sourceId).toLowerCase());
  if (!source) throw new Error(`Source move ${sourceId} was not found.`);
  const targets = [...new Set((targetIds || []).map((item) => String(item).toLowerCase()))]
    .map((id) => moves.find((item) => item.id === id)).filter(Boolean).filter((item) => item.id !== source.id);
  if (!targets.length) throw new Error('Choose at least one existing destination move.');
  const fields = [...new Set((suffixes || []).map(String))].filter((suffix) => Object.prototype.hasOwnProperty.call(source.values, suffix));
  if (!fields.length) throw new Error('No existing source options were selected.');
  const values = Object.fromEntries(fields.map((suffix) => {
    const value = Object.prototype.hasOwnProperty.call(draftValues, suffix) ? Number(draftValues[suffix]) : Number(source.values[suffix]);
    if (!Number.isFinite(value)) throw new Error(`${source.prefix}.${suffix} requires a finite numeric value.`);
    return [suffix, value];
  }));
  let updated = 0, inserted = 0;
  const insertions = [];
  for (const target of targets) {
    const missing = [];
    for (const suffix of fields) {
      const item = target.declarations[suffix];
      if (!item) { missing.push(suffix); continue; }
      const value = values[suffix];
      parsed.lines[item.line] = `${item.indent}${item.name}${item.separator}${value}${item.suffixText}`; updated += 1;
    }
    if (missing.length) {
      const declarations = Object.values(target.declarations), at = Math.max(...declarations.map((item) => item.line));
      insertions.push({ at: at + 1, lines: missing.map((suffix) => `${target.prefix}.${suffix} = ${values[suffix]}`) });
      inserted += missing.length;
    }
  }
  for (const insertion of insertions.sort((a, b) => b.at - a.at)) parsed.lines.splice(insertion.at, 0, ...insertion.lines);
  return { text: parsed.lines.join(eol), updated, inserted, targets: targets.map((item) => item.id), fields };
}

function hitPauseTicks(frames, startElement, freezeElement) {
  const start = Number(startElement), freeze = Number(freezeElement);
  if (!Number.isInteger(start) || !Number.isInteger(freeze) || start < 1 || freeze <= start || freeze > frames.length + 1) return 0;
  return frames.slice(start - 1, freeze - 1).reduce((total, frame) => total + Math.max(0, Number(frame.time) || 0), 0);
}

function airTimingProposal(timeline, current = {}) {
  const frames = timeline?.frames || [], active = frames.filter((frame) => frame.clsnActive);
  if (!frames.length || !active.length) return { state: 'missing-active-collision', values: {} };
  const start = Number(current.hitPauseAnimateStartElement) || 0, freeze = Number(current.hitPauseFreezeElement) || 0;
  return {
    state: 'ready',
    values: {
      firstActiveElement: active[0].element,
      idleElement: active[active.length - 1].element + 1,
      ...(start > 0 && freeze > start ? { hitPauseAnimateTicks: hitPauseTicks(frames, start, freeze) } : {})
    }
  };
}

function actionTimeline(airText, move) {
  const actionNumber = Number(move.values.moveID);
  const action = parseAir(airText).find((candidate) => candidate.number === actionNumber);
  if (!action) return { actionNumber, state: 'missing', frames: [], totalTicks: 0 };
  let tick = 0, activeWindow = 0, wasActive = false;
  const first = Number(move.values.firstActiveElement) || 0, idle = Number(move.values.idleElement) || Number.MAX_SAFE_INTEGER;
  const frames = action.frames.map((frame, index) => {
    const start = tick; tick += frame.time;
    const element = index + 1, clsnActive = frame.clsn1.length > 0;
    if (clsnActive && !wasActive) activeWindow += 1;
    wasActive = clsnActive;
    return { ...frame, element, start, end: tick - 1, phase: element < first ? 'startup' : element >= idle ? 'recovery' : clsnActive ? 'active' : 'authored-window', clsnActive, activeWindow: clsnActive ? activeWindow : 0 };
  });
  return { actionNumber, state: 'ready', frames, totalTicks: tick, loopStart: action.loopStart, firstActiveElement: first, idleElement: idle };
}

function reactionSummary(move, mode = 'normal') {
  const value = (name, fallback = 0) => Number(move.values[name] ?? fallback) || 0;
  const percent = mode === 'counter' ? value('counterHitDamagePercent', 100) : mode === 'punish' ? value('punishCounterDamagePercent', 100) : 100;
  const bonus = mode === 'counter' ? value('counterHitBonusTime') : mode === 'punish' ? value('punishCounterBonusTime') : 0;
  const suppressed = Boolean(value('suppressCounterBonuses'));
  return {
    mode,
    damage: Math.round(value('damage') * (suppressed ? 100 : percent) / 100),
    hitstun: value('groundHitTime') + (suppressed ? 0 : bonus),
    guardStun: value('guardHitTime'),
    driveDamage: mode === 'punish' && !suppressed ? value('punishCounterDriveDamage') : 0,
    hardKnockdown: mode === 'punish' && !suppressed && Boolean(value('punishCounterHardKnockdown')),
    downTime: mode === 'punish' && !suppressed ? value('punishCounterDownTime') : 0
  };
}

module.exports = { FIELD_SCHEMA, parseConstants, moveGroups, fieldsFor, updateConstant, resolveMoveTargets, copyMoveFields, hitPauseTicks, airTimingProposal, actionTimeline, reactionSummary };
