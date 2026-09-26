'use strict';

const crypto = require('crypto');

const ROLES = ['visual', 'projectile', 'hitbox-proxy', 'input-reader', 'system', 'companion', 'custom'];
const POSTYPES = ['p1', 'p2', 'front', 'back', 'left', 'right', 'none'];
const FLOW_SCOPES = ['self', 'parent', 'root', 'helper', 'playerid', 'team'];
const FLOW_OPERATIONS = ['read', 'set', 'add'];
const HELPER_RECIPES = ['custom', 'basic-fireball', 'super-fireball', 'visual-follower', 'companion', 'input-reader', 'hitbox-proxy', 'emitter'];
const PROJECTILE_RECIPES = ['basic-fireball', 'super-fireball'];
const BUILTIN_SCAFFOLDS = [
  { id: 'visual-follower', label: 'Visual / part follower', detail: 'Owner-relative visual helper with an explicit mode map.' },
  { id: 'companion', label: 'Companion', detail: 'Persistent-behavior starting point with owner communication maps.' },
  { id: 'input-reader', label: 'Input reader', detail: 'Logic helper scaffold for explicit input-to-map contracts.' },
  { id: 'hitbox-proxy', label: 'Hitbox proxy', detail: 'Collision proxy scaffold; author AIR collision and attacks deliberately.' },
  { id: 'emitter', label: 'Effect / projectile emitter', detail: 'Resource-owning scaffold for Explods, projectiles, and sounds.' }
];
const DATA_DOMAINS = [
  { id: 'maps', label: 'Maps', risk: 'preferred', bridge: 'Map & Data Flow', description: 'Named values and explicit parent/root/team contracts.' },
  { id: 'vars', label: 'Vars / FVars', risk: 'review', bridge: 'Controller browser', description: 'Legacy numeric storage. Document ownership and custom-state redirection.' },
  { id: 'state', label: 'State / Animation', risk: 'review', bridge: 'Move Lab', description: 'ChangeState, SelfState, ChangeAnim, and control ownership.' },
  { id: 'spatial', label: 'Position / Velocity / Bind', risk: 'review', bridge: 'Position & Camera', description: 'World, screen, parent, and target-relative movement.' },
  { id: 'resources', label: 'Explods / Projectiles / Sound / PalFX', risk: 'review', bridge: 'Explod Composer', description: 'Track the creator, owner, lifetime, remove rules, and palette source.' },
  { id: 'combat', label: 'Targets / Life / Power / Hit state', risk: 'high', bridge: 'Move Lab', description: 'High-impact mutation. Require target and lifetime guards before insertion.' }
];

function num(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function int(value, fallback = 0) { return Math.trunc(num(value, fallback)); }
function bool(value, fallback = false) { return value === undefined ? fallback : Boolean(value); }
function clean(value, fallback = '') { return String(value ?? fallback).replace(/[\r\n{}]/g, ' ').trim(); }
function key(value, fallback = 'value') { return clean(value, fallback).replace(/[^A-Za-z0-9_.]/g, '_') || fallback; }
function oneOf(value, list, fallback) { return list.includes(value) ? value : fallback; }
function pair(value, fallback = [0, 0]) { return Array.isArray(value) ? [num(value[0], fallback[0]), num(value[1], fallback[1])] : fallback.slice(); }
function compact(value) { const n = num(value); return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(4))); }
function uid(value) { return crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 12); }

function normalizeMap(entry = {}) { return { name: key(entry.name), value: clean(entry.value, '0'), purpose: clean(entry.purpose), direction: oneOf(entry.direction, ['private', 'input', 'output', 'shared'], 'private') }; }
function newHelper(overrides = {}) {
  return normalizeHelper({
    name: 'Move Helper', role: 'custom', language: 'zss', trigger: 'time = 0', id: 1000,
    stateNo: 1000, position: [0, 0], postype: 'p1', facing: 1, keyCtrl: [0], ownPal: false,
    remapPal: [0, 0], extendsMap: false, immortal: false, clsnProxy: false, ownProjectile: false,
    ownClsnScale: false, inheritJuggle: 0, inheritChannels: 0, preserve: false, standby: -1,
    pauseMoveTime: 0, superMoveTime: 0, maps: [], recipe: 'custom', projectile: {}, cleanup: { destroyOnStateEnd: true, recursive: true, removeExplods: true }, ...overrides
  });
}
function normalizeProjectile(input = {}, stateNo = 1000, recipe = 'custom') {
  const superMove = recipe === 'super-fireball';
  return {
    animation: Math.max(0, int(input.animation, stateNo)), velocity: pair(input.velocity, [superMove ? 7 : 4, 0]),
    damage: Math.max(0, int(input.damage, superMove ? 120 : 50)), guardDamage: Math.max(0, int(input.guardDamage, superMove ? 20 : 5)),
    hitPause: pair(input.hitPause, superMove ? [10, 12] : [8, 10]).map((v) => int(v)), groundHitTime: Math.max(1, int(input.groundHitTime, superMove ? 22 : 16)),
    guardHitTime: Math.max(1, int(input.guardHitTime, superMove ? 16 : 12)), groundVelocity: pair(input.groundVelocity, [superMove ? -7 : -4, 0]),
    airVelocity: pair(input.airVelocity, [superMove ? -5 : -3, superMove ? -6 : -4]), yAccel: num(input.yAccel, .5),
    maxHits: Math.max(1, int(input.maxHits, superMove ? 5 : 1)), lifetime: Math.max(1, int(input.lifetime, superMove ? 240 : 180)),
    fall: bool(input.fall, superMove), attribute: superMove ? 'S, HP' : 'S, SP'
  };
}
function normalizeHelper(input = {}) {
  const recipe = oneOf(input.recipe, HELPER_RECIPES, 'custom'), stateNo = int(input.stateNo, 1000);
  return {
    version: 1, kind: 'helper', name: clean(input.name, 'Move Helper').slice(0, 80), role: oneOf(input.role, ROLES, 'custom'),
    language: input.language === 'cns' ? 'cns' : 'zss', trigger: clean(input.trigger, 'time = 0'),
    id: Math.max(0, int(input.id, 1000)), stateNo, position: pair(input.position),
    postype: oneOf(String(input.postype || '').toLowerCase(), POSTYPES, 'p1'), facing: num(input.facing, 1) < 0 ? -1 : 1,
    keyCtrl: (Array.isArray(input.keyCtrl) ? input.keyCtrl : [input.keyCtrl ?? 0]).map((v) => Math.max(0, int(v))),
    ownPal: bool(input.ownPal), remapPal: pair(input.remapPal).map((v) => int(v)), extendsMap: bool(input.extendsMap),
    immortal: bool(input.immortal), clsnProxy: bool(input.clsnProxy), ownProjectile: bool(input.ownProjectile),
    ownClsnScale: bool(input.ownClsnScale), inheritJuggle: Math.max(0, Math.min(2, int(input.inheritJuggle))),
    inheritChannels: Math.max(0, Math.min(2, int(input.inheritChannels))), preserve: bool(input.preserve), standby: int(input.standby, -1),
    pauseMoveTime: int(input.pauseMoveTime), superMoveTime: int(input.superMoveTime), maps: (input.maps || []).map(normalizeMap), recipe,
    projectile: normalizeProjectile(input.projectile, stateNo, recipe),
    cleanup: { destroyOnStateEnd: bool(input.cleanup?.destroyOnStateEnd, true), recursive: bool(input.cleanup?.recursive, true), removeExplods: bool(input.cleanup?.removeExplods, true) }
  };
}

function applyRecipe(recipe, input = {}) {
  const base = normalizeHelper(input), kind = oneOf(recipe, HELPER_RECIPES, 'custom');
  if (kind === 'custom') return normalizeHelper({ ...base, recipe: 'custom' });
  // Built-in starting points are complete, clean presets. Keep only the user's
  // routing identity so switching from (for example) a fireball to a visual
  // helper cannot leak projectile ownership, collision, maps, or pause rules.
  const seed = newHelper({ language: base.language, trigger: base.trigger, id: base.id, stateNo: base.stateNo });
  if (!['basic-fireball', 'super-fireball'].includes(kind)) {
    const presets = {
      'visual-follower': { name: 'Visual Part Follower', role: 'visual', ownPal: true, maps: [{ name: 'mode', value: '0', purpose: 'Owner-selected visual mode', direction: 'input' }] },
      companion: { name: 'Companion Helper', role: 'companion', ownPal: true, maps: [{ name: 'mode', value: '0', purpose: 'Companion behavior mode', direction: 'input' }, { name: 'event', value: '0', purpose: 'Companion-to-owner event', direction: 'output' }] },
      'input-reader': { name: 'Input Reader', role: 'input-reader', maps: [{ name: 'input', value: '0', purpose: 'Reviewed input result', direction: 'output' }] },
      'hitbox-proxy': { name: 'Hitbox Proxy', role: 'hitbox-proxy', clsnProxy: true, maps: [{ name: 'active', value: '1', purpose: 'Owner-controlled collision state', direction: 'input' }] },
      emitter: { name: 'Effect Emitter', role: 'system', maps: [{ name: 'emit', value: '1', purpose: 'Emission gate', direction: 'input' }] }
    };
    return normalizeHelper({ ...seed, ...presets[kind], recipe: kind, cleanup: { destroyOnStateEnd: true, recursive: true, removeExplods: true } });
  }
  const isSuper = kind === 'super-fireball';
  return normalizeHelper({ ...seed, recipe: kind, name: isSuper ? 'Super Fireball' : 'Basic Fireball', role: 'projectile', position: [35, -55], postype: 'p1', ownProjectile: true, ownPal: false, pauseMoveTime: isSuper ? -1 : 0, superMoveTime: isSuper ? -1 : 0, projectile: normalizeProjectile({}, seed.stateNo, kind), cleanup: { destroyOnStateEnd: true, recursive: true, removeExplods: true } });
}

function applyProjectileDefaults(input = {}, defaults = {}) {
  const base = normalizeHelper(input), projectile = { ...base.projectile, ...(defaults.projectile || defaults) };
  return normalizeHelper({
    ...base,
    position: defaults.position || base.position,
    pauseMoveTime: defaults.pauseMoveTime ?? base.pauseMoveTime,
    superMoveTime: defaults.superMoveTime ?? base.superMoveTime,
    projectile
  });
}

function usedIdentifiers(sources = []) {
  const states = new Set(), helpers = new Set(), uncertain = [];
  for (const source of sources) {
    const inspected = inspectSource(source);
    for (const state of inspected.states) if (Number.isInteger(state.state) && state.state >= 0) states.add(state.state);
    for (const spawn of inspected.spawns) {
      if (Number.isInteger(spawn.id)) helpers.add(spawn.id);
      else if (spawn.id) uncertain.push({ filename: source.filename, expression: String(spawn.id) });
      if (Number.isInteger(spawn.stateNo) && spawn.stateNo >= 0) states.add(spawn.stateNo);
    }
  }
  return { states: [...states].sort((a, b) => a - b), helpers: [...helpers].sort((a, b) => a - b), uncertain };
}

function suggestUnusedPair(sources = [], preferred = 1000) {
  const used = usedIdentifiers(sources), states = new Set(used.states), helpers = new Set(used.helpers);
  let value = Math.max(0, int(preferred, 1000));
  while ((states.has(value) || helpers.has(value)) && value < 99999999) value += 1;
  return { id: value, stateNo: value, preferred: Math.max(0, int(preferred, 1000)), uncertain: used.uncertain, source: 'unused scan—not a project numbering rule' };
}

function zssProjectileBody(p) {
  const q = p.projectile, hits = `IKEMaker_Projectile_${p.id}_Hits`;
  return [`playerPush{value: 0}`, `if time = 0 {`, `\tmap(${hits}) := 0;`, `\tvelSet{x: ${compact(q.velocity[0])}; y: ${compact(q.velocity[1])}}`, `}`, `if map(${hits}) < ${q.maxHits} {`, `\thitDef{attr: ${q.attribute}; hitflag: MAF; guardflag: M; damage: ${q.damage}, ${q.guardDamage}; pausetime: ${q.hitPause.join(', ')}; ground.hittime: ${q.groundHitTime}; guard.hittime: ${q.guardHitTime}; ground.velocity: ${q.groundVelocity.map(compact).join(', ')}; air.velocity: ${q.airVelocity.map(compact).join(', ')}; yaccel: ${compact(q.yAccel)}; fall: ${q.fall ? 1 : 0}; sparkno: -1; guard.sparkno: -1}`, `}`, `if moveContact {`, `\tmap(${hits}) += 1;`, `\tmoveHitReset{}`, `}`, `if map(${hits}) >= ${q.maxHits} || time >= ${q.lifetime} { destroySelf{recursive: 1; removeexplods: 1} }`];
}

function validateHelper(input) {
  const plan = normalizeHelper(input), issues = [], names = new Set();
  if (!plan.name) issues.push({ level: 'error', field: 'name', message: 'Give the helper a readable name.' });
  if (plan.stateNo < 0) issues.push({ level: 'warning', field: 'stateNo', message: 'Negative states are shared processing states; a helper normally starts in its own non-negative StateDef.' });
  for (const map of plan.maps) {
    const normalized = map.name.toLowerCase();
    if (names.has(normalized)) issues.push({ level: 'error', field: 'maps', message: `Creation map ${map.name} is declared more than once.` });
    names.add(normalized);
  }
  if (plan.extendsMap && plan.maps.some((map) => map.direction === 'private')) issues.push({ level: 'suggestion', field: 'maps', message: 'ExtendsMap inherits parent values, but creation maps override matching names. Review intentional shadowing.' });
  if (plan.role === 'projectile' && !plan.ownProjectile) issues.push({ level: 'suggestion', field: 'ownProjectile', message: 'Projectile helpers normally need OwnProjectile when their projectiles must remain helper-owned. Orphaned projectiles stop interacting if the helper is destroyed.' });
  if (!plan.cleanup.destroyOnStateEnd) issues.push({ level: 'warning', field: 'cleanup', message: 'No cleanup scaffold is requested. Define every lifetime and DestroySelf exit explicitly.' });
  return { valid: !issues.some((issue) => issue.level === 'error'), plan, issues };
}

function zssHelper(input) {
  const p = normalizeHelper(input), params = [
    `name: "${p.name.replace(/"/g, '\\"')}"`, `id: ${p.id}`, `stateno: ${p.stateNo}`,
    `pos: ${p.position.map(compact).join(', ')}`, `postype: ${p.postype}`, `facing: ${p.facing}`,
    `keyctrl: ${p.keyCtrl.join(', ')}`, `ownpal: ${p.ownPal ? 1 : 0}`, `remappal: ${p.remapPal.join(', ')}`,
    `extendsmap: ${p.extendsMap ? 1 : 0}`, `immortal: ${p.immortal ? 1 : 0}`, `clsnproxy: ${p.clsnProxy ? 1 : 0}`,
    `ownprojectile: ${p.ownProjectile ? 1 : 0}`, `ownclsnscale: ${p.ownClsnScale ? 1 : 0}`,
    `inheritjuggle: ${p.inheritJuggle}`, `inheritchannels: ${p.inheritChannels}`, `preserve: ${p.preserve ? 1 : 0}`,
    `standby: ${p.standby}`, `pausemovetime: ${p.pauseMoveTime}`, `supermovetime: ${p.superMoveTime}`,
    ...p.maps.map((map) => `map.${map.name}: ${map.value}`)
  ];
  const instanceMap = `IKEMaker_Helper_${p.id}_PlayerID`;
  const projectileRecipe = PROJECTILE_RECIPES.includes(p.recipe);
  const stateHeader = projectileRecipe ? `[StateDef ${p.stateNo}; type: A; movetype: A; physics: N; anim: ${p.projectile.animation}; ctrl: 0;]` : `[StateDef ${p.stateNo}]`;
  const lines = [`# ${p.role} helper · ${p.name}${projectileRecipe ? ` · ${p.recipe} recipe` : ''}`, `if ${p.trigger} && !numHelper(${p.id}) {`, `\thelper{${params.join('; ')}}`, `\tmap(${instanceMap}) := lastPlayerID;`, '}', '', stateHeader, `# The helper confirms its exact runtime PlayerID on its first tick.`, `if time = 0 { parentMapSet{map: "${instanceMap}"; value: id} }`];
  if (projectileRecipe) lines.push('', ...zssProjectileBody(p));
  else if (p.cleanup.destroyOnStateEnd) lines.push('', '# Replace this reviewed lifetime condition.', `if time > 300 { destroySelf{recursive: ${p.cleanup.recursive ? 1 : 0}; removeexplods: ${p.cleanup.removeExplods ? 1 : 0}} }`);
  return lines.join('\n');
}
function cnsHelper(input) {
  const p = normalizeHelper(input), params = [
    `helpertype = normal`, `name = "${p.name.replace(/"/g, '\\"')}"`, `ID = ${p.id}`, `stateno = ${p.stateNo}`,
    `pos = ${p.position.map(compact).join(', ')}`, `postype = ${p.postype}`, `facing = ${p.facing}`, `keyctrl = ${p.keyCtrl.join(', ')}`,
    `ownpal = ${p.ownPal ? 1 : 0}`, `remappal = ${p.remapPal.join(', ')}`, `ExtendsMap = ${p.extendsMap ? 1 : 0}`,
    `Immortal = ${p.immortal ? 1 : 0}`, `ClsnProxy = ${p.clsnProxy ? 1 : 0}`, `OwnProjectile = ${p.ownProjectile ? 1 : 0}`,
    `OwnClsnScale = ${p.ownClsnScale ? 1 : 0}`, `InheritJuggle = ${p.inheritJuggle}`, `InheritChannels = ${p.inheritChannels}`,
    `Preserve = ${p.preserve ? 1 : 0}`, `Standby = ${p.standby}`, `pausemovetime = ${p.pauseMoveTime}`, `supermovetime = ${p.superMoveTime}`,
    ...p.maps.map((map) => `map.${map.name} = ${map.value}`)
  ];
  const instanceMap = `IKEMaker_Helper_${p.id}_PlayerID`;
  const projectileRecipe = PROJECTILE_RECIPES.includes(p.recipe), q = p.projectile, hits = `IKEMaker_Projectile_${p.id}_Hits`;
  const lines = [`; ${p.role} helper · ${p.name}${projectileRecipe ? ` · ${p.recipe} recipe` : ''}`, `[State Helper ${p.id}]`, 'type = Helper', `trigger1 = ${p.trigger}`, `trigger1 = NumHelper(${p.id}) = 0`, ...params, '', `[State Helper ${p.id}, capture exact instance]`, 'type = MapSet', `trigger1 = NumHelper(${p.id}) > 0`, `trigger1 = Map(${instanceMap}) = 0 || !PlayerIDExist(Map(${instanceMap}))`, `map = "${instanceMap}"`, 'value = LastPlayerID', '', `[Statedef ${p.stateNo}]`, ...(projectileRecipe ? ['type = A', 'movetype = A', 'physics = N', `anim = ${q.animation}`, 'ctrl = 0'] : []), '', `[State ${p.stateNo}, confirm exact instance]`, 'type = ParentMapSet', 'trigger1 = Time = 0', `map = "${instanceMap}"`, 'value = ID'];
  if (projectileRecipe) lines.push('', `[State ${p.stateNo}, no push]`, 'type = PlayerPush', 'trigger1 = 1', 'value = 0', '', `[State ${p.stateNo}, initial velocity]`, 'type = VelSet', 'trigger1 = Time = 0', `x = ${compact(q.velocity[0])}`, `y = ${compact(q.velocity[1])}`, '', `[State ${p.stateNo}, attack]`, 'type = HitDef', `trigger1 = Map(${hits}) < ${q.maxHits}`, `attr = ${q.attribute}`, 'hitflag = MAF', 'guardflag = M', `damage = ${q.damage}, ${q.guardDamage}`, `pausetime = ${q.hitPause.join(', ')}`, `ground.hittime = ${q.groundHitTime}`, `guard.hittime = ${q.guardHitTime}`, `ground.velocity = ${q.groundVelocity.map(compact).join(', ')}`, `air.velocity = ${q.airVelocity.map(compact).join(', ')}`, `yaccel = ${compact(q.yAccel)}`, `fall = ${q.fall ? 1 : 0}`, 'sparkno = -1', 'guard.sparkno = -1', '', `[State ${p.stateNo}, count contacts]`, 'type = MapAdd', 'trigger1 = MoveContact', `map = "${hits}"`, 'value = 1', '', `[State ${p.stateNo}, reset contact]`, 'type = MoveHitReset', 'trigger1 = MoveContact', '', `[State ${p.stateNo}, projectile lifetime]`, 'type = DestroySelf', `trigger1 = Map(${hits}) >= ${q.maxHits}`, `trigger2 = Time >= ${q.lifetime}`, 'recursive = 1', 'removeexplods = 1');
  else if (p.cleanup.destroyOnStateEnd) lines.push('', `[State ${p.stateNo}, reviewed cleanup]`, 'type = DestroySelf', 'trigger1 = Time > 300', `recursive = ${p.cleanup.recursive ? 1 : 0}`, `removeexplods = ${p.cleanup.removeExplods ? 1 : 0}`);
  return lines.join('\n');
}
function generateHelperParts(input) {
  const checked = validateHelper(input), code = checked.plan.language === 'cns' ? cnsHelper(checked.plan) : zssHelper(checked.plan);
  const marker = checked.plan.language === 'cns' ? /\n\n(?=\[Statedef\s)/i : /\n\n(?=\[StateDef\s)/i;
  const match = marker.exec(code), at = match ? match.index : code.length;
  const spawnCode = code.slice(0, at).trim(), stateCode = code.slice(at).trim();
  const creation = checked.plan.language === 'cns'
    ? spawnCode.match(/\[State Helper[^\]]*\][\s\S]*?(?=\n\n\[State Helper[^\]]*capture|$)/i)?.[0]
    : spawnCode.match(/\bhelper\s*\{[^}]*\}/i)?.[0];
  return { ...checked, code, spawnCode, stateCode, creationControllerCode: creation || spawnCode };
}
function generateHelper(input) { return generateHelperParts(input); }

function normalizeFlow(input = {}) {
  return { from: oneOf(input.from, FLOW_SCOPES, 'self'), to: oneOf(input.to, FLOW_SCOPES, 'parent'), operation: oneOf(input.operation, FLOW_OPERATIONS, 'set'), map: key(input.map), value: clean(input.value, '0'), helperId: int(input.helperId), playerId: clean(input.playerId, 'map(IKEMaker_LastHelperPlayerID)'), guard: clean(input.guard, '1'), note: clean(input.note) };
}
function redirect(scope, flow) { if (scope === 'self') return ''; if (scope === 'helper') return `helper(${flow.helperId}), `; if (scope === 'playerid') return `playerID(${flow.playerId}), `; return `${scope}, `; }
function flowCode(input, language = 'zss') {
  const f = normalizeFlow(input);
  if (language === 'cns') {
    if (f.operation === 'read') return `; ${f.from} reads ${f.to}.${f.map}\n${f.to === 'self' ? '' : `${f.to}, `}Map(${f.map})`;
    const specialized = { parent: 'ParentMapSet', root: 'RootMapSet', team: 'TeamMapSet' }[f.to];
    const type = specialized || (f.operation === 'add' && f.to === 'self' ? 'MapAdd' : 'MapSet');
    const target = f.to === 'helper' ? `Helper(${f.helperId}), ID` : f.to === 'playerid' ? f.playerId : '';
    const read = f.to === 'parent' ? `Parent, Map(${f.map})` : f.to === 'root' ? `Root, Map(${f.map})` : f.to === 'team' ? `Map(${f.map})` : `Map(${f.map})`;
    const value = f.operation === 'add' && specialized ? `${read} + (${f.value})` : f.value;
    return [`; ${f.from} -> ${f.to} · ${f.note || f.map}`, `[State IKEMaker map contract]`, `type = ${type}`, `trigger1 = ${f.guard}`, ...(target ? [`redirectid = ${target}`] : []), `map = "${f.map}"`, `value = ${value}`].join('\n');
  }
  if (f.operation === 'read') return `# ${f.from} reads ${f.to}.${f.map}\n${redirect(f.to, f)}map(${f.map})`;
  const specialized = { parent: 'parentMap', root: 'rootMap', team: 'teamMap' }[f.to];
  const controller = specialized ? `${specialized}${f.operation === 'add' ? 'Add' : 'Set'}` : `map${f.operation === 'add' ? 'Add' : 'Set'}`;
  const lead = specialized ? '' : redirect(f.to, f);
  return `# ${f.from} -> ${f.to} · ${f.note || f.map}\nif ${f.guard} { ${lead}${controller}{map: "${f.map}"; value: ${f.value}} }`;
}

function stateRanges(text) {
  const starts = [], re = /(?:\[\s*StateDef\s+(-?\d+)[^\]]*\]|\bstateDef\s+(-?\d+)\s*\{)/ig; let match;
  while ((match = re.exec(text))) starts.push({ state: int(match[1] ?? match[2]), index: match.index, line: text.slice(0, match.index).split(/\r?\n/).length });
  return starts.map((entry, index) => ({ ...entry, end: starts[index + 1]?.index ?? text.length }));
}
function paramsFrom(body) {
  const output = {}; for (const match of body.matchAll(/\b([A-Za-z][\w.]*)\s*[:=]\s*("[^"]*"|[^;\r\n}]+)/g)) output[match[1].toLowerCase()] = clean(match[2]).replace(/^"|"$/g, ''); return output;
}
function helperBlocks(text) {
  const blocks = [], zss = /\bhelper\s*\{([^}]*)\}/ig, cns = /\[\s*State\b[^\]]*\][\s\S]*?\btype\s*=\s*helper\b([\s\S]*?)(?=\n\s*\[|$)/ig; let match;
  while ((match = zss.exec(text))) blocks.push({ index: match.index, endIndex: zss.lastIndex, body: match[1], syntax: 'zss' });
  while ((match = cns.exec(text))) blocks.push({ index: match.index, endIndex: cns.lastIndex, body: match[1], syntax: 'cns' });
  return blocks.sort((a, b) => a.index - b.index);
}
function inspectSource(source) {
  const text = String(source.text || ''), ranges = stateRanges(text), spawns = [], flows = [], reads = [], cleanup = [];
  for (const block of helperBlocks(text)) {
    const p = paramsFrom(block.body), owner = [...ranges].reverse().find((range) => range.index <= block.index && block.index < range.end);
    const idExpression = clean(p.id), staticId = /^\d+$/.test(idExpression) ? int(idExpression) : null;
    spawns.push({ uid: uid(`${source.filename}:${block.index}`), filename: source.filename, line: text.slice(0, block.index).split(/\r?\n/).length, syntax: block.syntax, startIndex: block.index, endIndex: block.endIndex, ownerState: owner?.state ?? null, id: staticId ?? idExpression, dynamicId: staticId === null && Boolean(idExpression), stateNo: int(p.stateno), name: p.name || `Helper ${p.id || '?'}`, params: p, maps: Object.entries(p).filter(([name]) => name.startsWith('map.')).map(([name, value]) => ({ name: name.slice(4), value })), extendsMap: int(p.extendsmap) === 1 });
  }
  const flowRe = /\b(parent|root|team)?map(set|add)\s*\{([^}]*)\}|\b(parent|root|helper\s*\([^)]*\)|playerid\s*\([^)]*\))\s*,\s*map\s*\(([^)]+)\)\s*(:=|\+=)|\bmap\s*\(([^)]+)\)\s*(:=|\+=)/ig; let flow;
  while ((flow = flowRe.exec(text))) { const params = paramsFrom(flow[3] || ''), rawScope = clean(flow[1] || flow[4] || 'self').toLowerCase(), scope = rawScope.startsWith('helper') ? 'helper' : rawScope.startsWith('playerid') ? 'playerid' : rawScope; flows.push({ filename: source.filename, index: flow.index, line: text.slice(0, flow.index).split(/\r?\n/).length, scope, operation: String(flow[2] || flow[6] || flow[8]).toLowerCase().includes('add') || flow[6] === '+=' || flow[8] === '+=' ? 'add' : 'set', map: clean(params.map || flow[5] || flow[7]).replace(/^"|"$/g, '') }); }
  const readRe = /\b(?:(parent|root|team|helper\s*\([^)]*\)|playerid\s*\([^)]*\))\s*,\s*)?map\s*\(\s*([^)]+?)\s*\)/ig; let read;
  while ((read = readRe.exec(text))) {
    if (/^\s*(?::=|\+=)/.test(text.slice(readRe.lastIndex))) continue;
    const rawScope = clean(read[1] || 'self').toLowerCase(), scope = rawScope.startsWith('helper') ? 'helper' : rawScope.startsWith('playerid') ? 'playerid' : rawScope;
    reads.push({ filename: source.filename, line: text.slice(0, read.index).split(/\r?\n/).length, scope, operation: 'read', map: clean(read[2]).replace(/^"|"$/g, '') });
  }
  for (const match of text.matchAll(/\bdestroySelf\s*\{|\btype\s*=\s*destroyself\b/ig)) { const owner = [...ranges].reverse().find((range) => range.index <= match.index && match.index < range.end); cleanup.push({ filename: source.filename, line: text.slice(0, match.index).split(/\r?\n/).length, ownerState: owner?.state ?? null }); }
  return { filename: source.filename, states: ranges, spawns, flows, reads, cleanup };
}

function csvPair(value, fallback = [0, 0]) { const parts = String(value ?? '').split(',').map((item) => item.trim()); return parts.length ? pair(parts, fallback) : fallback.slice(); }
function csvInts(value, fallback = [0]) { const parts = String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean); return parts.length ? parts.map((item) => int(item)) : fallback.slice(); }
function planFromSpawn(spawn = {}) {
  const p = spawn.params || {};
  return newHelper({
    name: p.name || spawn.name || 'Existing Helper', language: spawn.syntax === 'cns' ? 'cns' : 'zss', id: Number.isInteger(spawn.id) ? spawn.id : 0,
    stateNo: int(p.stateno, spawn.stateNo), position: csvPair(p.pos), postype: p.postype || 'p1', facing: num(p.facing, 1), keyCtrl: csvInts(p.keyctrl),
    ownPal: int(p.ownpal) === 1, remapPal: csvPair(p.remappal).map((item) => int(item)), extendsMap: int(p.extendsmap) === 1,
    immortal: int(p.immortal) === 1, clsnProxy: int(p.clsnproxy) === 1, ownProjectile: int(p.ownprojectile) === 1,
    ownClsnScale: int(p.ownclsnscale) === 1, inheritJuggle: int(p.inheritjuggle), inheritChannels: int(p.inheritchannels),
    preserve: int(p.preserve) === 1, standby: int(p.standby, -1), pauseMoveTime: int(p.pausemovetime), superMoveTime: int(p.supermovetime),
    maps: Object.entries(p).filter(([name]) => name.startsWith('map.')).map(([name, value]) => ({ name: name.slice(4), value, direction: 'private' }))
  });
}
function buildHelperGraph(sources = []) {
  const inspected = sources.map(inspectSource), spawns = inspected.flatMap((source) => source.spawns), stateOwners = new Map();
  for (const spawn of spawns) { if (!stateOwners.has(spawn.stateNo)) stateOwners.set(spawn.stateNo, []); stateOwners.get(spawn.stateNo).push(spawn); }
  const nodes = [{ uid: 'root', type: 'root', id: 0, name: 'Root character', children: [] }], byUid = new Map(nodes.map((node) => [node.uid, node]));
  for (const spawn of spawns) { const node = { ...spawn, type: 'helper', children: [], issues: [] }; nodes.push(node); byUid.set(node.uid, node); }
  for (const node of nodes.filter((item) => item.type === 'helper')) {
    const parents = node.ownerState === null ? [] : stateOwners.get(node.ownerState) || [], parent = parents.find((item) => item.uid !== node.uid);
    const owner = parent ? byUid.get(parent.uid) : byUid.get('root'); owner.children.push(node.uid); node.parentUid = owner.uid;
    if (!node.id) node.issues.push({ level: 'warning', message: 'No explicit helper ID was found.' });
    if (node.dynamicId) node.issues.push({ level: 'suggestion', message: `Computed helper ID ${node.id} cannot be reduced to one family during static review; verify its runtime range.` });
    if (!node.stateNo) node.issues.push({ level: 'warning', message: 'No explicit starting state was found.' });
    if (node.ownerState === node.stateNo) node.issues.push({ level: 'warning', message: `State ${node.stateNo} creates a helper that starts in the same state. Guard against unintended recursive spawning.` });
    const stateDefinitions = inspected.flatMap((source) => source.states.map((state) => ({ ...state, filename: source.filename }))).filter((state) => state.state === node.stateNo);
    node.stateDefined = stateDefinitions.length > 0;
    node.lifecycle = inspected.some((source) => source.cleanup.some((site) => site.ownerState === node.stateNo)) ? 'cleanup detected' : 'lifetime review needed';
    if (!node.stateDefined) node.issues.push({ level: 'error', message: `Starting StateDef ${node.stateNo} was not found in connected code.` });
    if (node.lifecycle !== 'cleanup detected') node.issues.push({ level: 'warning', message: `No DestroySelf site was detected inside StateDef ${node.stateNo}.` });
  }
  const duplicateIds = new Set(spawns.filter((spawn, i) => spawn.id && spawns.findIndex((other) => other.id === spawn.id) !== i).map((spawn) => spawn.id));
  for (const node of nodes) if (duplicateIds.has(node.id)) node.issues.push({ level: 'suggestion', message: `Helper ID ${node.id} has multiple spawn sites; use index or PlayerID when addressing a specific instance.` });
  const flows = inspected.flatMap((source) => source.flows), reads = inspected.flatMap((source) => source.reads), cleanup = inspected.flatMap((source) => source.cleanup);
  return { nodes, roots: ['root'], flows, reads, cleanup, totals: { helpers: spawns.length, nested: nodes.filter((node) => node.parentUid && node.parentUid !== 'root').length, mapInitializers: spawns.reduce((sum, spawn) => sum + spawn.maps.length, 0), flows: flows.length, reads: reads.length, cleanupSites: cleanup.length } };
}

module.exports = { ROLES, POSTYPES, FLOW_SCOPES, FLOW_OPERATIONS, HELPER_RECIPES, PROJECTILE_RECIPES, BUILTIN_SCAFFOLDS, DATA_DOMAINS, newHelper, normalizeHelper, applyRecipe, applyProjectileDefaults, usedIdentifiers, suggestUnusedPair, validateHelper, generateHelperParts, generateHelper, normalizeFlow, flowCode, inspectSource, buildHelperGraph, planFromSpawn };
