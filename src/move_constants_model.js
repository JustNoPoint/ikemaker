'use strict';

const { parseAir } = require('./air_preview_model');
const { exactStateAnimation } = require('./move_palette_preview');

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
  { suffix: 'idleElement', category: 'Animation timing', label: 'Authored post-window element', type: 'integer', min: 1 },
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
  const selected = frames.slice(start - 1, freeze - 1);
  if (selected.some(frame => frame.hold || frame.rawTime === -1 || frame.reachable === false)) return null;
  return selected.reduce((total, frame) => total + Math.max(0, Number(frame.time) || 0), 0);
}

function airTimingProposal(timeline, current = {}) {
  const frames = timeline?.frames || [], active = frames.filter((frame) => frame.clsnActive);
  if (!frames.length || !active.length) return { state: 'missing-active-collision', values: {} };
  const start = Number(current.hitPauseAnimateStartElement) || 0, freeze = Number(current.hitPauseFreezeElement) || 0;
  const smearTicks = start > 0 && freeze > start ? hitPauseTicks(frames, start, freeze) : null;
  return {
    state: 'ready',
    values: {
      firstActiveElement: active[0].element,
      idleElement: active[active.length - 1].element + 1,
      ...(smearTicks !== null ? { hitPauseAnimateTicks: smearTicks } : {})
    }
  };
}

function actionTimeline(airText, move, parsedActions = null) {
  const actionNumber = Number(move.values.moveID);
  const action = (parsedActions || parseAir(airText)).find((candidate) => candidate.number === actionNumber);
  if (!action) return { actionNumber, state: 'missing', frames: [], totalTicks: 0 };
  let tick = 0, activeWindow = 0, wasActive = false, held = false;
  const first = Number(move.values.firstActiveElement) || 0, idle = Number(move.values.idleElement) || Number.MAX_SAFE_INTEGER;
  const frames = action.frames.map((frame, index) => {
    const authoredTime = Number.isInteger(frame.rawTime) ? frame.rawTime : frame.time;
    const duration = authoredTime === -1 ? -1 : Math.max(1, authoredTime);
    const hold = authoredTime === -1, reachable = !held, start = reachable ? tick : null;
    if (reachable && !hold) tick += Math.max(1, duration);
    if (hold) held = true;
    const element = index + 1, clsnActive = frame.clsn1.length > 0;
    if (clsnActive && !wasActive) activeWindow += 1;
    wasActive = clsnActive;
    return { ...frame, element, start, end: reachable && !hold ? tick - 1 : null, authoredTime, duration, hold, reachable, phase: element < first ? 'startup' : element >= idle ? 'post-window' : clsnActive ? 'active' : 'authored-window', clsnActive, activeWindow: clsnActive ? activeWindow : 0 };
  });
  const holdElement = frames.find(frame => frame.hold && frame.reachable)?.element || null;
  return { actionNumber, state: 'ready', frames, totalTicks: holdElement ? null : tick, finitePrefixTicks: tick, holdElement, loopStart: action.loopStart, hasLoopMarker: Boolean(action.loopMarkers?.length), firstActiveElement: first, idleElement: idle };
}

function authoredStateTiming(sections, timeline, projectileDeclared) {
  const evidence = { release: null, helperSpawn: null, ordinaryControl: null };
  for (const section of (sections || []).filter(item => item.kind === 'move-state' && item.language !== 'zss')) {
    const blocks = String(section.text || '').split(/^\s*\[\s*State\s+[^\]]+\]\s*$/im).slice(1);
    for (const block of blocks) {
      const entries = [...block.replace(/;[^\r\n]*/g, '').matchAll(/^\s*([A-Za-z][A-Za-z0-9_.]*)\s*=\s*([^\r\n]*)/gm)];
      const values = name => entries.filter(item => item[1].toLowerCase() === name).map(item => item[2].trim().toLowerCase());
      const types = values('type'), triggers = entries.filter(item => /^trigger(?:all|\d+)$/i.test(item[1]));
      if (types.length !== 1 || triggers.length !== 1 || triggers[0][1].toLowerCase() !== 'trigger1') continue;
      const trigger = triggers[0][2].trim().toLowerCase();
      if ((!evidence.release || !evidence.helperSpawn) && (types[0] === 'helper' || types[0] === 'projectile')) {
        const element = /^animelem\s*=\s*(\d+)$/.exec(trigger);
        if (element) {
          const frame = timeline.frames?.[Number(element[1]) - 1];
          if (frame && frame.reachable && Number.isInteger(frame.start)) {
            const event = `${types[0] === 'helper' ? 'Helper spawned' : 'Projectile controller'} at authored animelem = ${element[1]} (first-pass AIR tick ${frame.start}); runtime creation still depends on state execution`;
            if (types[0] === 'helper') evidence.helperSpawn ||= event;
            if (types[0] === 'projectile' || projectileDeclared) evidence.release ||= event;
          }
        }
      }
      if (!evidence.ordinaryControl && types[0] === 'changestate' && /^(?:!animtime|animtime\s*=\s*0)$/.test(trigger) && values('ctrl').length === 1 && values('ctrl')[0] === '1') evidence.ordinaryControl = `ChangeState grants ctrl = 1 when ${trigger} is true; this is an authored ordinary return, not a cancel window`;
    }
  }
  return evidence;
}

function timingEvidence(timeline, move, codeSections = []) {
  if (timeline?.state !== 'ready') return { authored: 'AIR action unavailable', ordinaryControl: 'unknown', cancel: 'unknown', advantage: 'unknown', projectile: null, helperSpawn: null, helperLifetime: null };
  const frames = timeline.frames || [], first = Number(move?.values?.firstActiveElement), idle = Number(move?.values?.idleElement);
  const firstStart = Number.isInteger(first) && first > 0 ? frames[first - 1]?.start : null;
  const postStart = Number.isInteger(idle) && idle > 0 ? frames[idle - 1]?.start : null;
  const projectileDeclared = Number(move?.values?.deliveryType) === 2;
  const source = authoredStateTiming(codeSections, timeline, projectileDeclared);
  const projectile = projectileDeclared || Boolean(source.release);
  return {
    attackWindows: require('./move_lab_direct_preview').attackWindows(frames),
    authored: timeline.holdElement ? `${timeline.finitePrefixTicks} AIR tick(s) before element ${timeline.holdElement} holds` : `${timeline.totalTicks} AIR tick(s) per pass${timeline.hasLoopMarker ? `; Loopstart at element ${timeline.loopStart + 1}` : ''}`,
    firstActiveHint: Number.isInteger(firstStart) ? firstStart : null,
    postWindowHint: Number.isInteger(postStart) ? postStart : null,
    ordinaryControl: source.ordinaryControl || 'unknown from AIR; inspect state transitions',
    cancel: 'unknown from AIR; inspect conditional state transitions',
    advantage: 'unknown without contact and defender recovery observation',
    helperSpawn: source.helperSpawn,
    helperLifetime: source.helperSpawn ? 'unknown from the parent AIR; inspect the spawned Helper state and removal rules' : null,
    projectile: projectile ? { release: source.release || 'unknown from AIR; inspect Projectile or Helper controller', lifetime: 'unknown from character AIR; inspect projectile removal rules' } : null
  };
}

function directStateTiming(components, airText, parsedActions = null) {
  const actions = parsedActions || parseAir(airText), byNumber = new Map(), result = {};
  for (const action of actions) { const bucket = byNumber.get(action.number) || []; bucket.push(action); byNumber.set(action.number, bucket); }
  for (const component of components || []) {
    if (component.kind !== 'state' || !component.id) continue;
    const parsed = exactStateAnimation(component), matches = parsed.available ? byNumber.get(parsed.action) : null;
    if (!matches || matches.length !== 1) continue;
    const timeline = actionTimeline('', { values: { moveID: parsed.action } }, matches);
    const section = { id: component.id, kind: 'move-state', language: parsed.sourceLanguage, filename: component.filename, startLine: component.startLine, text: component.text };
    const evidence = timingEvidence(timeline, { values: { moveID: parsed.action } }, [section]);
    result[component.id] = { ...evidence, actionNumber: parsed.action, followups: require('./move_followup_windows').followupWindows([section]) };
  }
  return result;
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

module.exports = { FIELD_SCHEMA, parseConstants, moveGroups, fieldsFor, updateConstant, resolveMoveTargets, copyMoveFields, hitPauseTicks, airTimingProposal, actionTimeline, timingEvidence, directStateTiming, reactionSummary };
