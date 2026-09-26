'use strict';

const path = require('path');
const crypto = require('crypto');
const { parseAir } = require('./air_preview_model');

const VERSION = 1;
const TIMING_MODES = ['independent', 'match-p1-ticks', 'match-p1-boundaries'];
const EVENT_TYPES = [
  'grab', 'target-state', 'change-anim2', 'bind', 'bind-release', 'facing',
  'damage', 'throw-hit', 'handoff', 'spark', 'sound', 'camera', 'pause',
  'screen-shake', 'part-create', 'part-remove', 'priority', 'cleanup', 'note'
];
const LANES = ['P1 Back Part', 'P1', 'Between Players', 'P2', 'P2 Front Part', 'Foreground'];
const TEMPLATES = {
  stationary: { label: 'Stationary grab', events: [{ tick: 0, type: 'grab' }, { tick: 0, type: 'target-state' }, { tick: 0, type: 'change-anim2' }, { tick: 0, type: 'bind' }, { tick: 12, type: 'damage' }, { tick: 12, type: 'bind-release' }, { tick: 12, type: 'handoff' }, { tick: 13, type: 'cleanup' }] },
  command: { label: 'Command throw', events: [{ tick: 0, type: 'grab' }, { tick: 0, type: 'target-state' }, { tick: 0, type: 'change-anim2' }, { tick: 0, type: 'bind' }, { tick: 18, type: 'throw-hit' }, { tick: 18, type: 'screen-shake' }, { tick: 19, type: 'bind-release' }, { tick: 19, type: 'handoff' }, { tick: 20, type: 'cleanup' }] },
  running: { label: 'Running throw', events: [{ tick: 0, type: 'grab' }, { tick: 0, type: 'target-state' }, { tick: 0, type: 'change-anim2' }, { tick: 0, type: 'bind' }, { tick: 8, type: 'bind' }, { tick: 18, type: 'throw-hit' }, { tick: 19, type: 'bind-release' }, { tick: 19, type: 'handoff' }, { tick: 20, type: 'cleanup' }] },
  air: { label: 'Air throw', events: [{ tick: 0, type: 'grab' }, { tick: 0, type: 'target-state' }, { tick: 0, type: 'change-anim2' }, { tick: 0, type: 'bind' }, { tick: 12, type: 'throw-hit' }, { tick: 12, type: 'bind-release' }, { tick: 12, type: 'handoff' }, { tick: 13, type: 'cleanup' }] },
  wall: { label: 'Wall slam', events: [{ tick: 0, type: 'grab' }, { tick: 0, type: 'target-state' }, { tick: 0, type: 'change-anim2' }, { tick: 0, type: 'bind' }, { tick: 14, type: 'bind-release' }, { tick: 14, type: 'handoff' }, { tick: 20, type: 'throw-hit' }, { tick: 20, type: 'screen-shake' }, { tick: 21, type: 'cleanup' }] },
  cinematic: { label: 'Multipart cinematic throw', events: [{ tick: 0, type: 'grab' }, { tick: 0, type: 'target-state' }, { tick: 0, type: 'change-anim2' }, { tick: 0, type: 'bind' }, { tick: 0, type: 'camera' }, { tick: 6, type: 'part-create' }, { tick: 24, type: 'throw-hit' }, { tick: 24, type: 'part-remove' }, { tick: 25, type: 'bind-release' }, { tick: 25, type: 'handoff' }, { tick: 26, type: 'cleanup' }] }
};

function hash(content) { return crypto.createHash('sha256').update(String(content || '')).digest('hex'); }
function slug(value) { return String(value || 'throw').trim().replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'throw'; }
function number(value, fallback = 0) { const out = Number(value); return Number.isFinite(out) ? out : fallback; }
function positive(value, fallback = 1) { return Math.max(1, Math.round(number(value, fallback))); }

function timeline(action) {
  let tick = 0;
  return {
    action: action.number,
    loopStart: Number.isInteger(action.loopStart) ? action.loopStart : 0,
    totalTicks: action.frames.reduce((sum, frame) => sum + positive(frame.time), 0),
    frames: action.frames.map((frame, index) => {
      const time = positive(frame.time), item = { ...frame, element: index + 1, start: tick, end: tick + time, time };
      tick += time; return item;
    })
  };
}

function actionTracks(airText) { return parseAir(airText).map(timeline); }

function distribute(total, count) {
  const base = Math.floor(total / count), remainder = total % count;
  return Array.from({ length: count }, (_, index) => Math.max(1, base + (index < remainder ? 1 : 0)));
}

function timingProposal(p1, p2, mode, options = {}) {
  if (!p1 || !p2) throw new Error('Select valid P1 and P2 AIR actions.');
  if (!TIMING_MODES.includes(mode)) throw new Error(`Unknown throw timing mode: ${mode}`);
  const start = Math.max(0, Math.round(number(options.startTick, 0)));
  const end = Math.max(start + 1, Math.min(p1.totalTicks, Math.round(number(options.endTick, p1.totalTicks))));
  let durations = p2.frames.map(frame => positive(frame.time));
  if (mode === 'match-p1-ticks') durations = distribute(Math.max(p2.frames.length, end - start), p2.frames.length);
  if (mode === 'match-p1-boundaries') {
    const candidates = p1.frames.map(frame => frame.end).filter(tick => tick > start && tick < end), cuts = [start];
    for (let index = 1; index < p2.frames.length; index += 1) {
      const target = start + (end - start) * index / p2.frames.length;
      const available = candidates.filter(tick => tick > cuts[cuts.length - 1] && tick < end - (p2.frames.length - index - 1));
      cuts.push(available.sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0] || Math.round(target));
    }
    cuts.push(end); durations = cuts.slice(0, -1).map((cut, index) => Math.max(1, cuts[index + 1] - cut));
  }
  return { mode, startTick: start, endTick: end, durations, totalTicks: durations.reduce((sum, value) => sum + value, 0), holdLastP2: options.holdLastP2 !== false };
}

function replaceActionDurations(airText, actionNumber, durations) {
  const action = parseAir(airText).find(item => item.number === Number(actionNumber));
  if (!action) throw new Error(`AIR action ${actionNumber} was not found.`);
  if (!Array.isArray(durations) || durations.length !== action.frames.length) throw new Error('The timing proposal no longer matches the P2 action. Refresh before applying it.');
  const lines = String(airText).split(/\r?\n/), eol = /\r\n/.test(airText) ? '\r\n' : '\n';
  action.frames.forEach((frame, index) => {
    const line = lines[frame.line - 1], commentAt = line.indexOf(';'), body = commentAt >= 0 ? line.slice(0, commentAt) : line, comment = commentAt >= 0 ? line.slice(commentAt) : '';
    const parts = body.split(',');
    if (parts.length < 5) throw new Error(`AIR element ${index + 1} changed and cannot be updated safely.`);
    const spacing = /^\s*/.exec(parts[4])[0]; parts[4] = `${spacing}${positive(durations[index])}`;
    lines[frame.line - 1] = `${parts.join(',')}${comment}`;
  });
  return lines.join(eol);
}

function newPlan(name = 'New Throw', template = 'stationary') {
  const source = TEMPLATES[template] || TEMPLATES.stationary;
  const airborne = template === 'air';
  return {
    version: VERSION, id: slug(name), name, template, p1Action: 0, p2Action: 0,
    p1State: 800, p2State: 801, handoffState: 5100, p1Type: airborne ? 'A' : 'S', p1Physics: 'N', p2Type: airborne ? 'A' : 'S', p2Physics: 'N', timingMode: 'independent',
    startTick: 0, endTick: 1, holdLastP2: true, loopStart: 0, loopEnd: 1,
    p1Facing: 1, p2Facing: -1, notes: '',
    events: source.events.map((event, index) => ({ id: `event-${index + 1}`, x: 35, y: 0, value: 0, note: '', ...event })),
    parts: [], sourceHashes: {}
  };
}

function normalizedPlan(input = {}) {
  const plan = { ...newPlan(input.name || 'New Throw', input.template), ...input };
  plan.version = VERSION; plan.id = slug(plan.id || plan.name); plan.timingMode = TIMING_MODES.includes(plan.timingMode) ? plan.timingMode : 'independent';
  plan.p1Type = ['S', 'C', 'A'].includes(plan.p1Type) ? plan.p1Type : 'S'; plan.p2Type = ['S', 'C', 'A'].includes(plan.p2Type) ? plan.p2Type : 'S';
  plan.p1Physics = ['S', 'C', 'A', 'N'].includes(plan.p1Physics) ? plan.p1Physics : 'N'; plan.p2Physics = ['S', 'C', 'A', 'N'].includes(plan.p2Physics) ? plan.p2Physics : 'N';
  plan.events = (plan.events || []).map((event, index) => ({ id: event.id || `event-${index + 1}`, type: EVENT_TYPES.includes(event.type) ? event.type : 'note', tick: Math.max(0, Math.round(number(event.tick))), x: number(event.x, 35), y: number(event.y), value: number(event.value), note: String(event.note || '') })).sort((a, b) => a.tick - b.tick);
  plan.parts = (plan.parts || []).map((part, index) => ({ id: part.id || `part-${index + 1}`, name: String(part.name || `Part ${index + 1}`), owner: ['P1', 'P2', 'helper', 'projectile', 'manual'].includes(part.owner) ? part.owner : 'manual', lane: LANES.includes(part.lane) ? part.lane : 'Between Players', bank: Math.max(1, Math.min(4, Math.round(number(part.bank, 1)))), anim: Math.round(number(part.anim)), explodId: Math.round(number(part.explodId, 8900 + index)), sprPriority: Math.round(number(part.sprPriority)), layerNo: Math.round(number(part.layerNo)), syncId: Math.round(number(part.syncId)), syncLayer: part.syncLayer !== false, createTick: Math.max(0, Math.round(number(part.createTick))), removeTick: Math.max(-1, Math.round(number(part.removeTick, -1))) }));
  return plan;
}

function validatePlan(input, tracks) {
  const plan = normalizedPlan(input), issues = [], actions = new Map((tracks || []).map(track => [track.action, track]));
  const p1 = actions.get(Number(plan.p1Action)), p2 = actions.get(Number(plan.p2Action));
  if (!p1) issues.push({ level: 'error', code: 'missing-p1-action', message: `P1 action ${plan.p1Action} does not exist.` });
  if (!p2) issues.push({ level: 'error', code: 'missing-p2-action', message: `P2 ChangeAnim2 action ${plan.p2Action} does not exist in P1's AIR.` });
  if (Number(plan.p1State) === Number(plan.p2State)) issues.push({ level: 'error', code: 'duplicate-state', message: 'P1 and P2 custom StateDefs must use different numbers.' });
  if (p2 && plan.timingMode !== 'independent' && Math.max(1, plan.endTick - plan.startTick) < p2.frames.length) issues.push({ level: 'error', code: 'timing-interval-short', message: 'The selected P1 interval has fewer ticks than P2 has elements.' });
  if (p1?.frames.some(frame => Number(frame.rawTime) <= 0)) issues.push({ level: 'warning', code: 'p1-nonpositive-time', message: 'P1 contains a zero or infinite AIR duration. Preview looping and event timing require manual review.' });
  if (p2?.frames.some(frame => Number(frame.rawTime) <= 0)) issues.push({ level: 'warning', code: 'p2-nonpositive-time', message: 'P2 contains a zero or infinite AIR duration. Match timing cannot infer its intended lifetime.' });
  if (!plan.events.some(event => event.type === 'grab')) issues.push({ level: 'warning', code: 'missing-grab', message: 'No grab/contact marker is defined.' });
  if (!plan.events.some(event => event.type === 'bind-release')) issues.push({ level: 'error', code: 'missing-release', message: 'No bind-release marker is defined.' });
  if (!plan.events.some(event => event.type === 'cleanup')) issues.push({ level: 'error', code: 'missing-cleanup', message: 'No cleanup marker is defined.' });
  if (!plan.events.some(event => event.type === 'target-state')) issues.push({ level: 'warning', code: 'missing-target-state', message: 'No TargetState marker is defined.' });
  if (!plan.events.some(event => event.type === 'change-anim2')) issues.push({ level: 'warning', code: 'missing-changeanim2', message: 'No ChangeAnim2 marker is defined.' });
  const release = plan.events.find(event => event.type === 'bind-release'), handoff = plan.events.find(event => event.type === 'handoff');
  const maximumTick = p1?.totalTicks || Math.max(1, plan.endTick);
  for (const event of plan.events.filter(item => item.tick > maximumTick)) issues.push({ level: 'warning', code: 'event-after-p1', message: `${event.type} at tick ${event.tick} occurs after P1 action ${plan.p1Action} ends at tick ${maximumTick}.` });
  const firstBind = plan.events.find(event => event.type === 'bind');
  if (firstBind && release && release.tick < firstBind.tick) issues.push({ level: 'error', code: 'release-before-bind', message: 'Bind release occurs before bind start.' });
  if (p2 && p1 && !plan.holdLastP2 && p2.totalTicks < (handoff?.tick ?? release?.tick ?? p1.totalTicks)) issues.push({ level: 'warning', code: 'p2-ends-early', message: 'P2 ends before release/handoff and Hold last P2 pose is disabled.' });
  for (const part of plan.parts) {
    if (part.owner === 'manual') issues.push({ level: 'warning', code: 'part-owner-review', message: `${part.name} still requires a reviewed runtime owner.` });
    if (part.removeTick < 0) issues.push({ level: 'warning', code: 'part-cleanup', message: `${part.name} has no removal tick.` });
    if (!actions.has(part.anim)) issues.push({ level: 'error', code: 'missing-part-action', message: `${part.name} references missing AIR action ${part.anim}.` });
  }
  const duplicateIds = plan.parts.map(part => part.explodId).filter((id, index, all) => id && all.indexOf(id) !== index);
  if (duplicateIds.length) issues.push({ level: 'error', code: 'duplicate-explod', message: `Duplicate Explod ID: ${duplicateIds[0]}.` });
  return { plan, p1, p2, issues, valid: !issues.some(issue => issue.level === 'error') };
}

function controllerFor(event, plan) {
  const trigger = `if time = ${event.tick}`;
  const pos = `${Math.round(event.x)}, ${Math.round(event.y)}`;
  switch (event.type) {
    case 'target-state': return `${trigger} { targetState{value: ${Math.round(event.value || plan.p2State)}} }`;
    case 'change-anim2': return `# Tick ${event.tick}: ChangeAnim2 ${plan.p2Action} begins in custom StateDef ${plan.p2State}.`;
    case 'bind': return `${trigger} { targetBind{time: 1; pos: ${pos}} }`;
    case 'bind-release': return `${trigger} { targetBind{time: 0} }`;
    case 'facing': return `${trigger} { targetFacing{value: ${Math.round(event.value || -1)}} }`;
    case 'damage': case 'throw-hit': return `${trigger} { targetLifeAdd{value: -${Math.abs(Math.round(event.value || 100))}; kill: 1} }`;
    case 'handoff': return `${trigger} { targetState{value: ${Math.round(event.value || plan.handoffState)}} }`;
    case 'sound': return `${trigger} { playSnd{value: S${Math.round(event.value)}, 0} }`;
    case 'pause': return `${trigger} { pause{time: ${Math.max(1, Math.round(event.value || 1))}} }`;
    case 'screen-shake': return `${trigger} { envShake{time: ${Math.max(1, Math.round(event.value || 8))}; ampl: -4} }`;
    case 'priority': return `${trigger} { sprPriority{value: ${Math.round(event.value)}} }`;
    case 'cleanup': return `${trigger} { targetBind{time: 0} } # Review every exit path and remove owned parts.`;
    default: return `# Tick ${event.tick}: ${event.type}${event.note ? ` — ${event.note}` : ''}`;
  }
}

function generateZss(input, tracks) {
  const checked = validatePlan(input, tracks), plan = checked.plan;
  if (!checked.valid) throw new Error(checked.issues.filter(issue => issue.level === 'error').map(issue => issue.message).join(' '));
  const lines = [
    `# IKEMEN Tools Throw Creator plan: ${plan.name}`,
    '# REVIEW REQUIRED: This scaffold never replaces authored states automatically.',
    `# P1 action ${plan.p1Action}; P2 ChangeAnim2 action ${plan.p2Action}; timing ${plan.timingMode}.`,
    `# Source AIR SHA-256: ${plan.sourceHashes.air || 'not recorded'}`,
    '', `[StateDef ${plan.p1State};`, `\ttype: ${plan.p1Type};`, '\tmovetype: A;', `\tphysics: ${plan.p1Physics};`, `\tanim: ${plan.p1Action};`, '\tctrl: 0;]', '',
    ...plan.events.map(event => controllerFor(event, plan)), ''
  ];
  for (const part of plan.parts) {
    lines.push(`# ${part.name}: owner ${part.owner}; lane ${part.lane}; SFF part bank ${part.bank}.`);
    lines.push(`if time = ${part.createTick} { explod{id: ${part.explodId}; anim: ${part.anim}; postype: p1; sprpriority: ${part.sprPriority}; layerno: ${part.layerNo}; syncid: ${part.syncId}; synclayer: ${part.syncLayer ? 1 : 0}; removetime: -1} }`);
    if (part.removeTick >= 0) lines.push(`if time = ${part.removeTick} { removeExplod{id: ${part.explodId}} }`);
  }
  lines.push(
    '', `# P2 custom state ${plan.p2State} is entered through TargetState above.`,
    `[StateDef ${plan.p2State};`, `\ttype: ${plan.p2Type};`, '\tmovetype: H;', `\tphysics: ${plan.p2Physics};`, '\tctrl: 0;]', '',
    `if time = 0 { changeAnim2{value: ${plan.p2Action}} }`,
    `if animTime = 0 { selfState{value: ${plan.handoffState}} }`,
    '# Review fall/launch physics, facing, death, Tag, interruption cleanup, and every SelfState destination.', ''
  );
  return lines.join('\n');
}

function planFilename(folder, plan) { return path.join(folder, '.ikemen-tools', 'throw-plans', `${slug(plan.id || plan.name)}.json`); }

module.exports = { VERSION, TIMING_MODES, EVENT_TYPES, LANES, TEMPLATES, hash, slug, timeline, actionTracks, timingProposal, replaceActionDurations, newPlan, normalizedPlan, validatePlan, generateZss, planFilename };
