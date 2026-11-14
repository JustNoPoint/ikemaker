'use strict';

const path = require('path');
const crypto = require('crypto');
const { parseAir } = require('./air_preview_model');

const VERSION = 1;
const TIMING_MODES = ['independent', 'match-p1-ticks', 'match-p1-boundaries'];
// 'auto' follows the owning character's assigned state source ([Files] st*).
const OUTPUT_LANGUAGES = ['auto', 'zss', 'cns'];
const SCAFFOLD_EXTENSIONS = Object.freeze({ zss: ['.zss'], cns: ['.cns', '.st'] });
// DEF-relative path of the tool-owned live-preview profile (see linkedPreviewProfile).
const PREVIEW_PROFILE_PATH = 'tools/ikemen-tools/ikemen_tools_preview_profile.zss';
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
    p1Facing: 1, p2Facing: -1, notes: '', outputLanguage: 'auto',
    events: source.events.map((event, index) => ({ id: `event-${index + 1}`, x: 35, y: 0, value: ['damage','throw-hit'].includes(event.type) ? 100 : 0, note: '', ...event, ...(['target-state','handoff'].includes(event.type)?{usePlanState:true}:{}) })),
    parts: [], sourceHashes: {}
  };
}

function normalizedPlan(input = {}) {
  const plan = { ...newPlan(input.name || 'New Throw', input.template), ...input };
  plan.version = VERSION; plan.id = slug(plan.id || plan.name); plan.timingMode = TIMING_MODES.includes(plan.timingMode) ? plan.timingMode : 'independent';
  plan.outputLanguage = OUTPUT_LANGUAGES.includes(plan.outputLanguage) ? plan.outputLanguage : 'auto';
  plan.p1Type = ['S', 'C', 'A'].includes(plan.p1Type) ? plan.p1Type : 'S'; plan.p2Type = ['S', 'C', 'A'].includes(plan.p2Type) ? plan.p2Type : 'S';
  plan.p1Physics = ['S', 'C', 'A', 'N'].includes(plan.p1Physics) ? plan.p1Physics : 'N'; plan.p2Physics = ['S', 'C', 'A', 'N'].includes(plan.p2Physics) ? plan.p2Physics : 'N';
  plan.events = (plan.events || []).map((event, index) => ({ id: event.id || `event-${index + 1}`, type: EVENT_TYPES.includes(event.type) ? event.type : 'note', tick: Math.max(0, Math.round(number(event.tick))), x: number(event.x, 35), y: number(event.y), value: number(event.value), note: String(event.note || ''), ...(['target-state','handoff'].includes(event.type)?{usePlanState:typeof event.usePlanState==='boolean'?event.usePlanState:Number(event.value||0)===0}:{}) })).sort((a, b) => a.tick - b.tick);
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
    if (part.owner !== 'P1') issues.push({level:'warning',code:'part-preview-only-owner',message:`${part.name}: ${part.owner} ownership is preview-only; the starter exports only P1-owned Explods. Author other runtime ownership explicitly.`});
    if (part.owner === 'manual') issues.push({ level: 'warning', code: 'part-owner-review', message: `${part.name} still requires a reviewed runtime owner.` });
    if (part.removeTick < 0) issues.push({ level: 'warning', code: 'part-cleanup', message: `${part.name} has no removal tick.` });
    if (!actions.has(part.anim)) issues.push({ level: 'error', code: 'missing-part-action', message: `${part.name} references missing AIR action ${part.anim}.` });
  }
  for (const [type,label] of [['grab','capture'],['target-state','target-entry'],['handoff','target release']]) {
    const markers=plan.events.filter(event=>event.type===type);
    if(markers.length!==1)issues.push({level:'error',code:'starter-'+type+'-count',message:`The starter scaffold needs one ${label} marker. Keep multi-capture/custom sequencing in authored source.`});
  }
  const entry=plan.events.find(event=>event.type==='target-state'),capture=plan.events.find(event=>event.type==='grab'),exit=plan.events.find(event=>event.type==='handoff'),cleanup=plan.events.filter(event=>event.type==='cleanup').at(-1);
  if(entry&&entry.usePlanState===false&&entry.value!==plan.p2State)issues.push({level:'error',code:'starter-target-override',message:'The starter capture uses the P2 custom state field. Match the target-entry override to it or use plan state.'});
  if(entry&&capture&&entry.tick!==capture.tick)issues.push({level:'error',code:'starter-entry-time',message:'Align the starter capture and target-entry ticks. Deferred/custom capture timing stays source-owned.'});
  if(entry&&exit&&exit.tick<entry.tick)issues.push({level:'error',code:'starter-exit-time',message:'Target release cannot precede target entry.'});
  if(cleanup&&exit&&cleanup.tick<exit.tick)issues.push({level:'error',code:'starter-cleanup-time',message:'Final cleanup must follow the target release.'});
  for(const bind of plan.events.filter(event=>event.type==='bind'))if(!plan.events.some(event=>['bind-release','cleanup','handoff'].includes(event.type)&&event.tick>bind.tick))issues.push({level:'error',code:'unbounded-bind',message:'Every bind keyframe needs a later release, handoff, or cleanup marker.'});
  const duplicateIds = plan.parts.map(part => part.explodId).filter((id, index, all) => id && all.indexOf(id) !== index);
  if (duplicateIds.length) issues.push({ level: 'error', code: 'duplicate-explod', message: `Duplicate Explod ID: ${duplicateIds[0]}.` });
  return { plan, p1, p2, issues, valid: !issues.some(issue => issue.level === 'error') };
}

function bindAt(plan,tick){const bind=(plan.events||[]).filter(event=>event.type==='bind'&&event.tick<=tick).sort((a,b)=>a.tick-b.tick).at(-1);return bind&&!(plan.events||[]).some(event=>['bind-release','handoff','cleanup'].includes(event.type)&&event.tick>=bind.tick&&event.tick<=tick)?bind:null;}
function bindWindow(event,plan){const end=plan.events.filter(item=>['bind','bind-release','cleanup','handoff'].includes(item.type)&&item.tick>event.tick).reduce((value,item)=>Math.min(value,item.tick),Infinity);return {start:event.tick,end};}
function controllerFor(event, plan) {
  const trigger = `if time = ${event.tick}`;
  const pos = `${Math.round(event.x)}, ${Math.round(event.y)}`;
  switch (event.type) {
    case 'target-state': return `# Expected target entry at tick ${event.tick}; starter HitDef sends the captured target to StateDef ${plan.p2State}. Actual contact time is runtime-dependent.`;
    case 'change-anim2': return `# Tick ${event.tick}: ChangeAnim2 ${plan.p2Action} begins in custom StateDef ${plan.p2State}.`;
    case 'bind': {const window=bindWindow(event,plan);return `if time >= ${window.start} && time < ${window.end} { targetBind{time: ${window.end} - time; pos: ${pos}} }`;}
    case 'bind-release': return `${trigger} { targetBind{time: 0} }`;
    case 'facing': return `${trigger} { targetFacing{value: ${Math.round(event.value || -1)}} }`;
    case 'damage': case 'throw-hit': return `${trigger} { targetLifeAdd{value: ${-Math.abs(Math.round(event.value))}; kill: 1} }`;
    case 'handoff': return `# Tick ${event.tick}: target-owned SelfState release below is the only handoff. No competing attacker TargetState is generated.`;
    case 'sound': return `${trigger} { playSnd{value: S${Math.round(event.value)}, 0} }`;
    case 'pause': return `${trigger} { pause{time: ${Math.max(1, Math.round(event.value || 1))}} }`;
    case 'screen-shake': return `${trigger} { envShake{time: ${Math.max(1, Math.round(event.value || 8))}; ampl: -4} }`;
    case 'priority': return `${trigger} { sprPriority{value: ${Math.round(event.value)}} }`;
    case 'cleanup': return `${trigger} { targetBind{time: 0} } # Finite binds also expire if P1 is interrupted.`;
    case 'grab': return `${trigger} {\n hitDef{\n  attr: ${plan.p1Type}, NT;\n  hitflag: MAF;\n  priority: 1, Miss;\n  damage: 0;\n  sparkno: -1;\n  guard.dist: 0;\n  p2stateno: ${plan.p2State};\n  p2getp1state: 1;\n  fall: 1;\n  fall.recover: 0;\n }\n} # Starter collision capture; replace/review for this character, not an import of its authored HitDef.`;
    default: return `# Tick ${event.tick}: ${event.type}${event.note ? ` — ${commentText(event.note)}` : ''}`;
  }
}

function generateZss(input, tracks) {
  const checked = validatePlan(input, tracks), plan = checked.plan;
  if (!checked.valid) throw new Error(checked.issues.filter(issue => issue.level === 'error').map(issue => issue.message).join(' '));
  const targetEntry=plan.events.find(event=>event.type==='target-state'),handoff=plan.events.find(event=>event.type==='handoff'),finalCleanup=Math.max(...plan.events.filter(event=>event.type==='cleanup').map(event=>event.tick));
  const lines = [
    `# IKEMEN Tools Throw Creator plan: ${commentText(plan.name)}`,
    '# REVIEW REQUIRED: Starter capture + finite bind intervals + one target-owned release. Not an imported/authored throw.',
    '# Contact, pause/hitpause, interruption and custom ownership require in-game review. This file never replaces authored states automatically.',
    `# P1 action ${plan.p1Action}; P2 ChangeAnim2 action ${plan.p2Action}; timing ${plan.timingMode}.`,
    `# Source AIR SHA-256: ${plan.sourceHashes.air || 'not recorded'}`,
    '', `[StateDef ${plan.p1State};`, `\ttype: ${plan.p1Type};`, '\tmovetype: A;', `\tphysics: ${plan.p1Physics};`, `\tanim: ${plan.p1Action};`, '\tctrl: 0;]', '',
    ...plan.events.map(event => controllerFor(event, plan)), ''
  ];
  for (const part of plan.parts) {
    if(part.owner!=='P1'){lines.push(`# PREVIEW ONLY: ${commentText(part.name)}, owner ${part.owner}, action ${part.anim}; author its runtime ownership explicitly. No P1 Explod is substituted.`);continue;}
    lines.push(`# ${commentText(part.name)}: owner ${part.owner}; lane ${part.lane}; SFF part bank ${part.bank}.`);
    lines.push(`if time = ${part.createTick} { explod{id: ${part.explodId}; anim: ${part.anim}; postype: p1; sprpriority: ${part.sprPriority}; layerno: ${part.layerNo}; syncid: ${part.syncId}; synclayer: ${part.syncLayer ? 1 : 0}; removetime: -1; removeongethit: 1} }`);
    if (part.removeTick >= 0) lines.push(`if time = ${part.removeTick} { removeExplod{id: ${part.explodId}} }`);
  }
  lines.push(`if time >= ${finalCleanup} { ctrlSet{value: 1} changeState{value: ${plan.p1Type==='A'?50:0}} } # Starter miss/success return; review conventional StateDef ${plan.p1Type==='A'?50:0}.`);
  lines.push(
    '', `# P2 custom state ${plan.p2State} is entered through the starter HitDef above.`,
    `[StateDef ${plan.p2State};`, `\ttype: ${plan.p2Type};`, '\tmovetype: H;', `\tphysics: ${plan.p2Physics};`, '\tctrl: 0;]', '',
    `if time = 0 { changeAnim2{value: ${plan.p2Action}} }`,
    `if time >= ${handoff.tick-targetEntry.tick} { selfState{value: ${Math.round(handoff.usePlanState?plan.handoffState:handoff.value)}} } # Target-owned release; target time starts on capture, not attacker time.`,
    '# Review fall/launch physics, facing, death, Tag, interruption cleanup, and every SelfState destination.', ''
  );
  return lines.join('\n');
}

// One-line comment text: authored notes and names never break out of a comment.
function commentText(value) { return String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim(); }

// Native MUGEN/IKEMEN CNS scaffold equivalent to generateZss. Every runtime
// controller is a real [State] block with standard triggers; markers that ZSS
// emits only as comments stay comments. Nothing ZSS-specific is emitted.
function cnsController(lines, state, label, type, triggers, params) {
  lines.push(`[State ${state}, ${commentText(label).replace(/[\]\[;]/g, '') || type}]`, `type = ${type}`);
  triggers.forEach((trigger, index) => lines.push(`trigger${index + 1} = ${trigger}`));
  for (const [key, value] of params) lines.push(`${key} = ${value}`);
  lines.push('');
}

function cnsEvent(lines, event, plan) {
  const at = `Time = ${event.tick}`, state = plan.p1State, pos = `${Math.round(event.x)}, ${Math.round(event.y)}`;
  switch (event.type) {
    case 'target-state': lines.push(`; Expected target entry at tick ${event.tick}; starter HitDef sends the captured target to StateDef ${plan.p2State}. Actual contact time is runtime-dependent.`, ''); return;
    case 'change-anim2': lines.push(`; Tick ${event.tick}: ChangeAnim2 ${plan.p2Action} begins in custom StateDef ${plan.p2State}.`, ''); return;
    case 'bind': { const window = bindWindow(event, plan); cnsController(lines, state, 'Bind', 'TargetBind', [`Time >= ${window.start} && Time < ${window.end}`], [['time', `${window.end} - Time`], ['pos', pos]]); return; }
    case 'bind-release': cnsController(lines, state, 'Bind release', 'TargetBind', [at], [['time', 0]]); return;
    case 'facing': cnsController(lines, state, 'Facing', 'TargetFacing', [at], [['value', Math.round(event.value || -1)]]); return;
    case 'damage': case 'throw-hit': cnsController(lines, state, event.type === 'damage' ? 'Damage' : 'Throw hit', 'TargetLifeAdd', [at], [['value', -Math.abs(Math.round(event.value))], ['kill', 1]]); return;
    case 'handoff': lines.push(`; Tick ${event.tick}: target-owned SelfState release below is the only handoff. No competing attacker TargetState is generated.`, ''); return;
    case 'sound': cnsController(lines, state, 'Sound', 'PlaySnd', [at], [['value', `S${Math.round(event.value)}, 0`]]); return;
    case 'pause': cnsController(lines, state, 'Pause', 'Pause', [at], [['time', Math.max(1, Math.round(event.value || 1))]]); return;
    case 'screen-shake': cnsController(lines, state, 'Screen shake', 'EnvShake', [at], [['time', Math.max(1, Math.round(event.value || 8))], ['ampl', -4]]); return;
    case 'priority': cnsController(lines, state, 'Priority', 'SprPriority', [at], [['value', Math.round(event.value)]]); return;
    case 'cleanup': lines.push('; Finite binds also expire if P1 is interrupted.'); cnsController(lines, state, 'Cleanup', 'TargetBind', [at], [['time', 0]]); return;
    case 'grab':
      lines.push('; Starter collision capture; replace/review for this character, not an import of its authored HitDef.');
      cnsController(lines, state, 'Grab', 'HitDef', [at], [['attr', `${plan.p1Type}, NT`], ['hitflag', 'MAF'], ['priority', '1, Miss'], ['damage', 0], ['sparkno', -1], ['guard.dist', 0], ['p2stateno', plan.p2State], ['p2getp1state', 1], ['fall', 1], ['fall.recover', 0]]);
      return;
    default: lines.push(`; Tick ${event.tick}: ${event.type}${event.note ? ` - ${commentText(event.note)}` : ''}`, '');
  }
}

function generateCns(input, tracks) {
  const checked = validatePlan(input, tracks), plan = checked.plan;
  if (!checked.valid) throw new Error(checked.issues.filter(issue => issue.level === 'error').map(issue => issue.message).join(' '));
  const targetEntry = plan.events.find(event => event.type === 'target-state'), handoff = plan.events.find(event => event.type === 'handoff'), finalCleanup = Math.max(...plan.events.filter(event => event.type === 'cleanup').map(event => event.tick));
  const lines = [
    `; IKEMEN Tools Throw Creator plan: ${commentText(plan.name)}`,
    '; REVIEW REQUIRED: Starter capture + finite bind intervals + one target-owned release. Not an imported/authored throw.',
    '; Contact, pause/hitpause, interruption and custom ownership require in-game review. This file never replaces authored states automatically.',
    `; P1 action ${plan.p1Action}; P2 ChangeAnim2 action ${plan.p2Action}; timing ${plan.timingMode}.`,
    `; Source AIR SHA-256: ${plan.sourceHashes.air || 'not recorded'}`,
    '', `[Statedef ${plan.p1State}]`, `type = ${plan.p1Type}`, 'movetype = A', `physics = ${plan.p1Physics}`, `anim = ${plan.p1Action}`, 'ctrl = 0', ''
  ];
  for (const event of plan.events) cnsEvent(lines, event, plan);
  for (const part of plan.parts) {
    if (part.owner !== 'P1') { lines.push(`; PREVIEW ONLY: ${commentText(part.name)}, owner ${part.owner}, action ${part.anim}; author its runtime ownership explicitly. No P1 Explod is substituted.`, ''); continue; }
    lines.push(`; ${commentText(part.name)}: owner ${part.owner}; lane ${part.lane}; SFF part bank ${part.bank}.`);
    cnsController(lines, plan.p1State, `Part ${part.explodId}`, 'Explod', [`Time = ${part.createTick}`], [['id', part.explodId], ['anim', part.anim], ['postype', 'p1'], ['sprpriority', part.sprPriority], ['layerno', part.layerNo], ['syncid', part.syncId], ['synclayer', part.syncLayer ? 1 : 0], ['removetime', -1], ['removeongethit', 1]]);
    if (part.removeTick >= 0) cnsController(lines, plan.p1State, `Remove part ${part.explodId}`, 'RemoveExplod', [`Time = ${part.removeTick}`], [['id', part.explodId]]);
  }
  const back = plan.p1Type === 'A' ? 50 : 0;
  lines.push(`; Starter miss/success return; review conventional StateDef ${back}.`);
  cnsController(lines, plan.p1State, 'Return', 'ChangeState', [`Time >= ${finalCleanup}`], [['value', back], ['ctrl', 1]]);
  lines.push(`; P2 custom state ${plan.p2State} is entered through the starter HitDef above.`, `[Statedef ${plan.p2State}]`, `type = ${plan.p2Type}`, 'movetype = H', `physics = ${plan.p2Physics}`, 'ctrl = 0', '');
  cnsController(lines, plan.p2State, 'Target animation', 'ChangeAnim2', ['Time = 0'], [['value', plan.p2Action]]);
  lines.push('; Target-owned release; target time starts on capture, not attacker time.');
  cnsController(lines, plan.p2State, 'Target release', 'SelfState', [`Time >= ${handoff.tick - targetEntry.tick}`], [['value', Math.round(handoff.usePlanState ? plan.handoffState : handoff.value)]]);
  lines.push('; Review fall/launch physics, facing, death, Tag, interruption cleanup, and every SelfState destination.', '');
  const text = lines.join('\n'), problems = checkCnsOutput(text);
  // Refuse rather than emit mixed or unsupported syntax; the draft is untouched.
  if (problems.length) throw new Error(`CNS output was refused because it would not be valid CNS: ${problems.slice(0, 3).join(' ')}`);
  return text;
}

// Structural CNS check: every line is a comment, a [Statedef n] / [State n, label]
// header, or a key = value line, and no ZSS-only syntax appears outside comments.
// Controller types must exist in the shared catalog. Parameters are checked
// against the throw emitter's own table, taken from the IKEMEN 1.0 compiler
// (compiler_functions.go); data/sctrl.json does not list every engine
// parameter (for example the value of ChangeAnim2 or SelfState).
const STATEDEF_KEYS = new Set(['type', 'movetype', 'physics', 'anim', 'velset', 'ctrl', 'poweradd', 'juggle', 'facep2', 'hitdefpersist', 'movehitpersist', 'hitcountpersist', 'sprpriority']);
const COMMON_KEYS = /^(?:type|triggerall|trigger\d+|persistent|ignorehitpause)$/i;
const EMITTED_PARAMS = Object.freeze({
  hitdef: ['attr', 'hitflag', 'priority', 'damage', 'sparkno', 'guard.dist', 'p2stateno', 'p2getp1state', 'fall', 'fall.recover'],
  targetbind: ['time', 'pos'], targetfacing: ['value'], targetlifeadd: ['value', 'kill'], playsnd: ['value'],
  pause: ['time'], envshake: ['time', 'ampl'], sprpriority: ['value'],
  explod: ['id', 'anim', 'postype', 'sprpriority', 'layerno', 'syncid', 'synclayer', 'removetime', 'removeongethit'],
  removeexplod: ['id'], changestate: ['value', 'ctrl'], changeanim2: ['value'], selfstate: ['value']
});
let catalogCache = null;
function controllerCatalog() {
  if (!catalogCache) catalogCache = new Set(require('../data/sctrl.json').map(item => String(item.name).toLowerCase()));
  return catalogCache;
}
function checkCnsOutput(text) {
  const problems = [], catalog = controllerCatalog();
  let section = null, controller = null;
  const finish = () => { if (controller) { if (!controller.type) problems.push(`Line ${controller.line}: [State] block has no type.`); if (!controller.trigger) problems.push(`Line ${controller.line}: [State] block has no trigger1.`); } controller = null; };
  String(text).split(/\r?\n/).forEach((raw, index) => {
    const line = raw.split(';')[0].trim(), number = index + 1;
    if (!line) return;
    if (/[{}]|:=|^#|^if\b/i.test(line)) { problems.push(`Line ${number}: ZSS syntax "${line.slice(0, 40)}" is not CNS.`); return; }
    if (/^\[Statedef\s+-?\d+\]$/i.test(line)) { finish(); section = 'statedef'; return; }
    if (/^\[State\s+-?\d+(?:\s*,[^\]]*)?\]$/i.test(line)) { finish(); section = 'state'; controller = { line: number, type: '', trigger: false, params: [] }; return; }
    const pair = /^([A-Za-z][\w.]*)\s*=\s*(\S.*)$/.exec(line);
    if (!pair || !section) { problems.push(`Line ${number}: "${line.slice(0, 40)}" is not a CNS header or key = value line.`); return; }
    const key = pair[1].toLowerCase();
    if (section === 'statedef') { if (!STATEDEF_KEYS.has(key)) problems.push(`Line ${number}: ${pair[1]} is not a StateDef parameter.`); return; }
    if (key === 'type') { controller.type = pair[2].trim().toLowerCase(); if (!catalog.has(controller.type) || !EMITTED_PARAMS[controller.type]) problems.push(`Line ${number}: ${pair[2].trim()} is not a state controller this CNS emitter supports.`); return; }
    if (key === 'trigger1') controller.trigger = true;
    if (!COMMON_KEYS.test(key) && controller.type && !EMITTED_PARAMS[controller.type]?.includes(key)) problems.push(`Line ${number}: ${pair[1]} is not a ${controller.type} parameter.`);
  });
  finish();
  return problems;
}

// Owning source language from a character DEF's state assignments. Only st/stN
// entries decide it; cns/cmd/stcommon are constants, commands or shared files.
function stateSourceLanguage(defText) {
  const kinds = new Set();
  let inFiles = false;
  for (const raw of String(defText || '').split(/\r?\n/)) {
    const line = raw.replace(/;.*/, '').trim();
    const header = /^\[([^\]]+)\]/.exec(line); if (header) { inFiles = header[1].trim().toLowerCase() === 'files'; continue; }
    const entry = inFiles && /^(st\d*)\s*=\s*(.+)$/i.exec(line); if (!entry) continue;
    const value = entry[2].trim().replace(/^['"]|['"]$/g, ''); if (!value) continue;
    // The training-only live-preview profile is tool-owned ZSS linked by Throw
    // Creator itself; it never describes the character's authored language.
    if (value.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase() === PREVIEW_PROFILE_PATH) continue;
    kinds.add(/\.zss$/i.test(value) ? 'zss' : 'cns');
  }
  return kinds.size === 1 ? [...kinds][0] : kinds.size ? 'mixed' : 'unknown';
}

// Concrete output language: an explicit plan choice wins; 'auto' follows the
// owning source; mixed or unknown owners keep the established ZSS default.
function resolveOutputLanguage(plan, sourceLanguage) {
  const chosen = normalizedPlan(plan).outputLanguage;
  if (chosen === 'zss' || chosen === 'cns') return chosen;
  return sourceLanguage === 'cns' ? 'cns' : 'zss';
}

function generateScaffold(input, tracks, language) {
  if (language === 'cns') return generateCns(input, tracks);
  if (language === 'zss') return generateZss(input, tracks);
  throw new Error(`Unsupported throw scaffold language: ${language}`);
}

function planFilename(folder, plan) { return path.join(folder, '.ikemen-tools', 'throw-plans', `${slug(plan.id || plan.name)}.json`); }

module.exports = { VERSION, TIMING_MODES, OUTPUT_LANGUAGES, SCAFFOLD_EXTENSIONS, PREVIEW_PROFILE_PATH, EVENT_TYPES, LANES, TEMPLATES, hash, slug, timeline, actionTracks, timingProposal, replaceActionDurations, newPlan, normalizedPlan, validatePlan, bindAt, bindWindow, generateZss, generateCns, generateScaffold, checkCnsOutput, commentText, stateSourceLanguage, resolveOutputLanguage, planFilename };
