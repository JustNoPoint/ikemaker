'use strict';

const SPACES = ['stage', 'screen'];
const ANCHORS = ['p1', 'p2', 'front', 'back', 'left', 'right', 'none'];
const SUBJECTS = ['self', 'target', 'parent', 'root', 'helper'];
const POSITION_MODES = ['world', 'relative', 'screen-once', 'screen-lock'];

function number(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function integer(value, fallback = 0) { return Math.trunc(number(value, fallback)); }
function bool(value, fallback = false) { return value === undefined ? fallback : Boolean(value); }
function oneOf(value, values, fallback) { return values.includes(value) ? value : fallback; }
function pair(value, fallback = [0, 0]) { return Array.isArray(value) ? [number(value[0], fallback[0]), number(value[1], fallback[1])] : fallback.slice(); }
function compact(value) { const n = number(value); return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(4))); }
function cleanTrigger(value) { return String(value || 'time = 0').replace(/[\r\n{}]/g, ' ').trim() || 'time = 0'; }
function cleanName(value, fallback) { return String(value || fallback).replace(/[\r\n]/g, ' ').trim().slice(0, 80) || fallback; }

function newExplod(overrides = {}) {
  return normalizeExplod({
    name: 'Move effect', language: 'zss', trigger: 'time = 0', id: 1000, anim: 1000,
    space: 'stage', anchor: 'p1', position: [0, 0], velocity: [0, 0], acceleration: [0, 0],
    bindId: -1, bindTime: 1, removeTime: -2, scale: [1, 1], angle: 0, facing: 1,
    spritePriority: 0, layerNo: 0, onTop: false, ownPalette: false, palette: [0, 0],
    transparency: 'default', ignoreHitPause: false, removeOnGetHit: false,
    timeline: [], localCoord: [320, 240], ...overrides
  });
}

function normalizeEvent(event = {}) {
  return {
    tick: Math.max(0, integer(event.tick)), type: oneOf(event.type, ['create', 'modify', 'bind', 'remove'], 'modify'),
    position: pair(event.position), velocity: pair(event.velocity), acceleration: pair(event.acceleration),
    scale: pair(event.scale, [1, 1]), angle: number(event.angle), bindTime: integer(event.bindTime, 1)
  };
}

function normalizeExplod(input = {}) {
  return {
    version: 1, kind: 'explod', name: cleanName(input.name, 'Move effect'),
    language: input.language === 'cns' ? 'cns' : 'zss', trigger: cleanTrigger(input.trigger),
    id: Math.max(0, integer(input.id, 1000)), anim: integer(input.anim, 1000),
    space: oneOf(String(input.space || '').toLowerCase(), SPACES, 'stage'),
    anchor: oneOf(String(input.anchor || '').toLowerCase(), ANCHORS, 'p1'),
    position: pair(input.position), velocity: pair(input.velocity), acceleration: pair(input.acceleration),
    bindId: integer(input.bindId, -1), bindTime: integer(input.bindTime, 1), removeTime: integer(input.removeTime, -2),
    scale: pair(input.scale, [1, 1]), angle: number(input.angle), facing: number(input.facing, 1) < 0 ? -1 : 1,
    spritePriority: integer(input.spritePriority), layerNo: integer(input.layerNo), onTop: bool(input.onTop),
    ownPalette: bool(input.ownPalette), palette: pair(input.palette).map((v) => integer(v)),
    transparency: cleanName(input.transparency, 'default'), ignoreHitPause: bool(input.ignoreHitPause),
    removeOnGetHit: bool(input.removeOnGetHit), localCoord: pair(input.localCoord, [320, 240]),
    timeline: Array.isArray(input.timeline) ? input.timeline.map(normalizeEvent).sort((a, b) => a.tick - b.tick) : []
  };
}

function validateExplod(input) {
  const p = normalizeExplod(input), issues = [];
  if (p.anim < 0) issues.push({ level: 'error', field: 'anim', message: 'Choose an animation number that exists in the assigned AIR.' });
  if (p.space === 'screen' && p.anchor !== 'none') issues.push({ level: 'suggestion', field: 'anchor', message: 'Screen-space placement is clearest with anchor None; character-relative placement belongs in stage space.' });
  if (p.localCoord[0] <= 0 || p.localCoord[1] <= 0) issues.push({ level: 'error', field: 'localCoord', message: 'Local coordinate width and height must be positive.' });
  if (p.scale.some((v) => v === 0)) issues.push({ level: 'warning', field: 'scale', message: 'A zero scale hides the Explod.' });
  if (p.removeTime === -1) issues.push({ level: 'warning', field: 'removeTime', message: 'This Explod has no timed removal. Add a RemoveExplod event or verify every state exit removes it.' });
  const creates = p.timeline.filter((e) => e.type === 'create').length;
  if (creates > 1) issues.push({ level: 'warning', field: 'timeline', message: 'Multiple create events use the same ID. Verify replacement and ownership behavior.' });
  return { valid: !issues.some((i) => i.level === 'error'), plan: p, issues };
}

function zssParams(p, mode = 'create', event = null) {
  const src = event || p, lines = [`id: ${p.id}`];
  if (mode === 'create') lines.push(`anim: ${p.anim}`, `space: ${p.space}`, `postype: ${p.anchor}`);
  if (mode !== 'remove') {
    lines.push(`pos: ${compact(src.position[0])}, ${compact(src.position[1])}`);
    if (mode === 'create' || event) lines.push(`vel: ${compact(src.velocity[0])}, ${compact(src.velocity[1])}`, `accel: ${compact(src.acceleration[0])}, ${compact(src.acceleration[1])}`);
    if (mode === 'create') lines.push(`bindid: ${p.bindId}`, `bindtime: ${p.bindTime}`, `removetime: ${p.removeTime}`, `scale: ${compact(p.scale[0])}, ${compact(p.scale[1])}`, `angle: ${compact(p.angle)}`, `facing: ${p.facing}`, `sprpriority: ${p.spritePriority}`, `layerno: ${p.layerNo}`, `ontop: ${p.onTop ? 1 : 0}`, `ownpal: ${p.ownPalette ? 1 : 0}`, `ignorehitpause: ${p.ignoreHitPause ? 1 : 0}`, `removeongethit: ${p.removeOnGetHit ? 1 : 0}`);
    if (p.palette[0] || p.palette[1]) lines.push(`remappal: ${p.palette[0]}, ${p.palette[1]}`);
    if (p.transparency !== 'default') lines.push(`trans: ${p.transparency}`);
  }
  return lines.join('; ');
}

function zssExplod(input) {
  const p = normalizeExplod(input), out = [`# ${p.name}`, `if ${p.trigger} { explod{${zssParams(p)}} }`];
  for (const e of p.timeline) {
    if (e.type === 'create') out.push(`if time = ${e.tick} { explod{${zssParams(p, 'create', e)}} }`);
    if (e.type === 'modify') out.push(`if time = ${e.tick} { modifyExplod{${zssParams(p, 'modify', e)}} }`);
    if (e.type === 'bind') out.push(`if time = ${e.tick} { explodBindTime{id: ${p.id}; time: ${e.bindTime}} }`);
    if (e.type === 'remove') out.push(`if time = ${e.tick} { removeExplod{id: ${p.id}} }`);
  }
  return out.join('\n');
}

function cnsBlock(label, type, trigger, params) {
  return [`[State ${label}, ${type}]`, `type = ${type}`, `trigger1 = ${trigger}`, ...params].join('\n');
}
function cnsExplod(input) {
  const p = normalizeExplod(input), base = [
    `anim = ${p.anim}`, `ID = ${p.id}`, `space = ${p.space}`, `postype = ${p.anchor}`,
    `pos = ${p.position.map(compact).join(', ')}`, `vel = ${p.velocity.map(compact).join(', ')}`,
    `accel = ${p.acceleration.map(compact).join(', ')}`, `bindid = ${p.bindId}`, `bindtime = ${p.bindTime}`,
    `removetime = ${p.removeTime}`, `scale = ${p.scale.map(compact).join(', ')}`, `angle = ${compact(p.angle)}`,
    `sprpriority = ${p.spritePriority}`, `layerno = ${p.layerNo}`, `ontop = ${p.onTop ? 1 : 0}`
  ];
  const out = [cnsBlock(p.name, 'Explod', p.trigger, base)];
  for (const e of p.timeline) {
    const trigger = `time = ${e.tick}`;
    if (e.type === 'modify') out.push(cnsBlock(p.name, 'ModifyExplod', trigger, [`ID = ${p.id}`, `pos = ${e.position.map(compact).join(', ')}`, `vel = ${e.velocity.map(compact).join(', ')}`, `accel = ${e.acceleration.map(compact).join(', ')}`]));
    if (e.type === 'bind') out.push(cnsBlock(p.name, 'ExplodBindTime', trigger, [`ID = ${p.id}`, `time = ${e.bindTime}`]));
    if (e.type === 'remove') out.push(cnsBlock(p.name, 'RemoveExplod', trigger, [`ID = ${p.id}`]));
  }
  return out.join('\n\n');
}

function generateExplod(input) { const checked = validateExplod(input); return { ...checked, code: checked.plan.language === 'cns' ? cnsExplod(checked.plan) : zssExplod(checked.plan) }; }

function newPosition(overrides = {}) {
  return normalizePosition({ name: 'Move placement', language: 'zss', trigger: 'time = 0', subject: 'self', mode: 'world', position: [0, 0], velocity: [0, 0], acceleration: [0, 0], facing: 1, bindTime: 1, moveCamera: [0, 0], localCoord: [320, 240], timeline: [], ...overrides });
}
function normalizePosition(input = {}) {
  return { version: 1, kind: 'position', name: cleanName(input.name, 'Move placement'), language: input.language === 'cns' ? 'cns' : 'zss', trigger: cleanTrigger(input.trigger), subject: oneOf(input.subject, SUBJECTS, 'self'), helperId: integer(input.helperId), mode: oneOf(input.mode, POSITION_MODES, 'world'), position: pair(input.position), velocity: pair(input.velocity), acceleration: pair(input.acceleration), facing: number(input.facing, 1) < 0 ? -1 : 1, bindTime: integer(input.bindTime, 1), moveCamera: pair(input.moveCamera).map(integer), localCoord: pair(input.localCoord, [320, 240]), timeline: Array.isArray(input.timeline) ? input.timeline.map((e) => ({ tick: Math.max(0, integer(e.tick)), position: pair(e.position), bindTime: integer(e.bindTime, 1) })).sort((a, b) => a.tick - b.tick) : [] };
}
function validatePosition(input) {
  const p = normalizePosition(input), issues = [];
  if (p.localCoord.some((v) => v <= 0)) issues.push({ level: 'error', field: 'localCoord', message: 'Local coordinate width and height must be positive.' });
  if (p.mode === 'screen-lock') issues.push({ level: 'warning', field: 'mode', message: 'Persistent screen locking is camera-sensitive gameplay code. Preview it here, then verify corner, zoom, widescreen, and online behavior in IKEMEN.' });
  if (p.subject !== 'self' && p.mode.startsWith('screen')) issues.push({ level: 'warning', field: 'subject', message: 'Screen placement for a target or binding subject is emitted as a reviewed scaffold; verify the intended owner and coordinate conversion.' });
  return { valid: !issues.some((i) => i.level === 'error'), plan: p, issues };
}
function zssPosition(input) {
  const p = normalizePosition(input), pos = p.position.map(compact).join(', '), lead = p.subject === 'self' ? '' : p.subject === 'helper' ? `helper(${p.helperId}), ` : `${p.subject}, `, out = [`# ${p.name}`];
  if (p.mode === 'relative') out.push(`if ${p.trigger} { ${lead}posAdd{x: ${compact(p.position[0])}; y: ${compact(p.position[1])}} }`);
  else if (p.subject === 'target') out.push(`if ${p.trigger} { targetBind{time: ${p.bindTime}; pos: ${pos}} }`);
  else if (p.subject === 'parent') out.push(`if ${p.trigger} { bindToParent{time: ${p.bindTime}; pos: ${pos}} }`);
  else if (p.subject === 'root') out.push(`if ${p.trigger} { bindToRoot{time: ${p.bindTime}; pos: ${pos}} }`);
  else if (p.mode === 'screen-once' || p.mode === 'screen-lock') out.push(`# Screen coordinates ${pos} in localcoord ${p.localCoord.join(', ')}.`, `if ${p.mode === 'screen-lock' ? '1' : p.trigger} { ${lead}posAdd{x: ${compact(p.position[0])} - screenPos x; y: ${compact(p.position[1])} - screenPos y}; ${lead}screenBound{value: 0; moveCamera: ${p.moveCamera.join(', ')}} }${p.mode === 'screen-lock' ? ' # Repeats every tick; verify camera, corner, zoom, widescreen, and online behavior.' : ''}`);
  else out.push(`if ${p.trigger} { ${lead}posSet{x: ${compact(p.position[0])}; y: ${compact(p.position[1])}} }`);
  if (p.velocity.some(Boolean)) out.push(`if ${p.trigger} { ${lead}velSet{x: ${compact(p.velocity[0])}; y: ${compact(p.velocity[1])}} }`);
  if (p.acceleration.some(Boolean)) out.push(`# Acceleration ${p.acceleration.map(compact).join(', ')} requires per-tick velocity logic or the owning controller.`);
  for (const e of p.timeline) out.push(`if time = ${e.tick} { ${lead}posSet{x: ${compact(e.position[0])}; y: ${compact(e.position[1])}} }`);
  return out.join('\n');
}
function cnsPosition(input) {
  const p = normalizePosition(input), trigger = p.trigger;
  if (p.subject !== 'self') return `; ${p.name}\n; ${p.subject} placement is best authored in ZSS for explicit redirection/binding.\n${zssPosition({ ...p, language: 'zss' })}`;
  const type = p.mode === 'relative' ? 'PosAdd' : 'PosSet', out = [cnsBlock(p.name, type, trigger, [`x = ${compact(p.position[0])}`, `y = ${compact(p.position[1])}`])];
  if (p.velocity.some(Boolean)) out.push(cnsBlock(p.name, 'VelSet', trigger, [`x = ${compact(p.velocity[0])}`, `y = ${compact(p.velocity[1])}`]));
  if (p.mode.startsWith('screen')) out.push(cnsBlock(p.name, 'ScreenBound', trigger, ['value = 0', `movecamera = ${p.moveCamera.join(', ')}`, '; Review camera and localcoord behavior in IKEMEN.']));
  return out.join('\n\n');
}
function generatePosition(input) { const checked = validatePosition(input); return { ...checked, code: checked.plan.language === 'cns' ? cnsPosition(checked.plan) : zssPosition(checked.plan) }; }

function screenToLocal(point, viewport, localCoord = [320, 240]) {
  const w = Math.max(1, number(viewport?.width, 1)), h = Math.max(1, number(viewport?.height, 1));
  return [number(point?.x) / w * number(localCoord[0], 320), number(point?.y) / h * number(localCoord[1], 240)];
}
function snapPosition(position, guides = {}, threshold = 6) {
  const p = pair(position), candidatesX = [guides.left, guides.centerX, guides.right, guides.p1X, guides.p2X].filter(Number.isFinite), candidatesY = [guides.top, guides.floor, guides.bottom, guides.p1Y, guides.p2Y].filter(Number.isFinite);
  for (const x of candidatesX) if (Math.abs(p[0] - x) <= threshold) { p[0] = x; break; }
  for (const y of candidatesY) if (Math.abs(p[1] - y) <= threshold) { p[1] = y; break; }
  return p;
}
function explodFromThrowPart(part = {}) { return newExplod({ name: part.name || 'Throw part', id: part.explodId, anim: part.anim, anchor: 'p1', spritePriority: part.sprPriority, layerNo: part.layerNo, timeline: Number.isFinite(part.removeTick) && part.removeTick >= 0 ? [{ tick: part.removeTick, type: 'remove' }] : [] }); }

module.exports = { SPACES, ANCHORS, SUBJECTS, POSITION_MODES, newExplod, normalizeExplod, validateExplod, generateExplod, newPosition, normalizePosition, validatePosition, generatePosition, screenToLocal, snapPosition, explodFromThrowPart };
