'use strict';

// Pure generators for costume layers (for example a beard drawn over the body).
//
// buildLayerAnimations: standalone AIR auto creation. For every base action in scope it creates a
// "layer action" with the same element count, timing, loop, offsets, flips, interpolation and
// per-frame draw fields, whose sprites come from the layer source (bank or reviewed mapping).
// Every generated action carries a stable marker line with its source, base action and body hash,
// so a re-run reuses exact matches, refuses stale or hand-edited ones, and never duplicates.
//
// buildCostumeExplod: reuses those actions and adds runtime state code that draws them with one
// engine-native synchronized Explod (syncid/synclayer/syncparams, IKEMEN stable 1.0 and nightly).
// For all-Actions scope, foreign animations drawing victim-owned sprites select a static pose
// from a generated AIR table. AnimElemVar exposes authored element transforms, not interpolation.
// Engine reference: IKEMEN GO Explod syncid, synclayer and syncparams.
//
// No filesystem, editor or engine access: inputs in, text out.

const crypto = require('crypto');

const MARKER_VERSION = 1;
const MARKER_PREFIX = '; IKEMaker generated layer animation';
const MARKER = /^[ \t]*;[ \t]*IKEMaker generated layer animation v(\d+);[ \t]*source=([^;]+);[ \t]*base=(-?\d+);[ \t]*sha256=([0-9a-f]{16})[ \t]*$/i;
const HEADER = /^[ \t]*\[[ \t]*begin[ \t]+action[ \t]+(-?\d+)[ \t]*\][ \t]*(?:;.*)?$/i;
const ELEMENT = /^([ \t]*)(-?\d+)[ \t]*,[ \t]*(-?\d+)([ \t]*,.*)$/;
const CLSN = /^[ \t]*clsn[12]/i;
const COPY_ACTION = /^[ \t]*copy[ \t]+action[ \t]+(-?\d+)[ \t]*$/i;
const COPY_DEPTH = 8; // anim.go resolveCopyAction chain limit
const COSTUME_STATE_NUMBER = -4; // runs every tick for root and helpers, before -3/-2, also while paused
// "+1" (compiled to internal state -10; char.go actionRun) runs after the current state's controllers,
// every tick, also in custom states and while paused. It sees an Anim the state changed this tick, so
// the layer does not lag one tick behind ChangeAnim in normal states. Kept as the exact string "+1".
const COSTUME_POST_STATE = '+1';
const COSTUME_STATE_PHASES = Object.freeze({ pre: COSTUME_STATE_NUMBER, post: COSTUME_POST_STATE });
function safeLabel(value, fallback) { const text = [...String(value ?? '')].map(c => { const cp = c.codePointAt(0); return cp < 32 || cp === 127 || cp === 0x2028 || cp === 0x2029 || '"#;[]'.includes(c) ? ' ' : c; }).join(''); return text.replace(/\s+/g, ' ').trim().slice(0, 80) || fallback; }

// Follows Copy Action like the engine: up to 8 links; a missing or self target deletes the action.
function resolveCopy(action, byNumber) {
  let current = action;
  for (let depth = 0; current.copyAction !== undefined; depth += 1) {
    if (depth >= COPY_DEPTH) return { error: `Copy Action chain from ${action.number} is longer than ${COPY_DEPTH} links` };
    const target = byNumber.get(current.copyAction);
    if (!target || target === current) return { error: `Copy Action ${current.copyAction} cannot be resolved (the engine drops action ${action.number})` };
    current = target;
  }
  return { action: current };
}
const INT32_MAX = 2147483647;
const BANK_GROUP_STEP = 10000;

function fail(message) { throw new Error(`Costume layer: ${message}`); }
function sha16(text) { return crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16); }
function stripComment(line) { const at = line.indexOf(';'); return (at < 0 ? line : line.slice(0, at)).replace(/[ \t]+$/, ''); }
function int(value, label, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) fail(`${label} must be an integer from ${min} to ${max}.`);
  return number;
}
function spriteKey(group, number) { return `${Number(group)},${Number(number)}`; }
function parseKey(text, label) {
  const match = /^\s*(-?\d+)\s*,\s*(-?\d+)\s*$/.exec(String(text ?? ''));
  if (!match) fail(`${label} must be "group,number" (got ${JSON.stringify(text)}).`);
  return { group: Number(match[1]), number: Number(match[2]) };
}

// Splits AIR text into action blocks: header number, body lines, and marker when present.
function airActions(airText) {
  if (typeof airText !== 'string') fail('airText must be the AIR source text.');
  const lines = airText.split(/\r?\n/), actions = [];
  let current = null;
  lines.forEach((line, index) => {
    const header = HEADER.exec(line);
    if (header) { current = { number: Number(header[1]), headerLine: index + 1, lines: [] }; actions.push(current); return; }
    if (current) current.lines.push(line);
  });
  for (const action of actions) {
    // IKEMEN (anim.go readAnimation): a "Copy Action N" line ends the action and the whole action
    // becomes a copy of N; elements before it are discarded.
    const copyLine = action.lines.find(line => COPY_ACTION.test(stripComment(line)));
    if (copyLine) action.copyAction = Number(COPY_ACTION.exec(stripComment(copyLine))[1]);
    const firstContent = action.lines.findIndex(line => line.trim() !== '');
    const marker = firstContent >= 0 ? MARKER.exec(action.lines[firstContent]) : null;
    if (marker) {
      action.marker = { version: Number(marker[1]), source: marker[2].trim(), base: Number(marker[3]), hash: marker[4].toLowerCase() };
      action.body = normalizedBody(action.lines.slice(firstContent + 1));
    }
  }
  return actions;
}

// The body that the marker hash covers: non-empty lines without comments, trailing spaces or CRs.
function normalizedBody(lines) {
  return lines.map(stripComment).filter(line => line.trim() !== '').join('\n');
}

function normalizeMapping(value) {
  const map = new Map();
  if (value == null) return map;
  const add = (from, to) => {
    const a = parseKey(from, 'Mapping source sprite'), b = to === null || to === '' ? null : parseKey(to, 'Mapping target sprite');
    const key = spriteKey(a.group, a.number);
    if (map.has(key)) fail(`the reviewed mapping lists ${key} more than once.`);
    map.set(key, b ? spriteKey(b.group, b.number) : null);
  };
  if (Array.isArray(value)) for (const item of value) Array.isArray(item) ? add(item[0], item[1]) : add(item?.from, item?.to);
  else if (typeof value === 'object') for (const [from, to] of Object.entries(value)) add(from, to);
  else fail('mapping must be an object or an array.');
  return map;
}

// Accepts the preview-layer shape ({source:{kind,bank}}) or a plain {bank, mapping}.
function layerSource(layer) {
  if (!layer || typeof layer !== 'object') fail('layer is required.');
  const source = layer.source && typeof layer.source === 'object' ? layer.source : {};
  const mapping = normalizeMapping(layer.mapping ?? source.mapping);
  const rawBank = layer.bank ?? (source.kind === 'bank' || source.kind === undefined ? source.bank : undefined);
  const bank = rawBank === undefined || rawBank === null ? null : int(rawBank, 'layer bank', 1, 6);
  if (source.kind && !['bank', 'mapping'].includes(source.kind)) fail(`layer source kind "${source.kind}" cannot build layer animations; use a sprite bank or a reviewed mapping.`);
  if (bank === null && !mapping.size) fail('layer needs a sprite bank (source.bank 1..6) or a reviewed mapping.');
  const key = bank !== null ? `bank:${bank}` : 'mapping';
  return { bank, mapping, key, label: safeLabel(layer.label, bank !== null ? `Bank ${bank}` : 'Reviewed mapping') };
}

function independentForeignPlan(options, layer, actions, sprites) {
  const raw = options.foreignPose ?? layer.foreignPose ?? {policy:'static'};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('foreignPose must be a pose policy object.');
  const policy = raw.policy ?? (raw.continue === true ? 'continue' : 'static');
  if (!['static','continue'].includes(policy)) fail('foreignPose.policy must be static or continue.');
  const bankValue = Object.hasOwn(raw,'bank') ? raw.bank : (layer.source?.bank ?? layer.bank);
  const bank = bankValue == null ? null : int(bankValue,'foreignPose.bank',1,6);
  const available = new Set(sprites.map(sprite=>spriteKey(sprite.group,sprite.number)));
  const mapping = new Map();
  if (raw.mapping !== undefined) {
    if (!raw.mapping || typeof raw.mapping !== 'object' || Array.isArray(raw.mapping) || Object.keys(raw.mapping).length > 256) fail('foreignPose.mapping must contain at most 256 exact pose entries.');
    for (const [from,value] of Object.entries(raw.mapping)) {
      const key=parseKey(from,'foreignPose.mapping pose'),parsed=value == null || typeof value==='object' ? null : parseKey(value,'foreignPose.mapping target');
      const target=value == null ? null : typeof value==='object' ? spriteKey(int(value.group,'foreignPose.mapping group',0,65535),int(value.index??value.number,'foreignPose.mapping index',0,65535)) : spriteKey(parsed.group,parsed.number);
      if(!available.has(spriteKey(key.group,key.number))) fail(`foreignPose.mapping pose ${spriteKey(key.group,key.number)} is not in the SFF.`);
      if(target && !available.has(target)) fail(`foreignPose.mapping target ${target} is not in the SFF.`);
      mapping.set(spriteKey(key.group,key.number),target);
    }
  }
  const timed = new Map(),byNumber=new Map(actions.map(action=>[action.number,action]));
  if (raw.timed !== undefined) {
    if (!raw.timed || typeof raw.timed !== 'object' || Array.isArray(raw.timed) || Object.keys(raw.timed).length > 256) fail('foreignPose.timed must contain at most 256 exact pose entries.');
    for(const [from,value] of Object.entries(raw.timed)){
      const key=parseKey(from,'foreignPose.timed pose'),pose=spriteKey(key.group,key.number);
      if(!available.has(pose)) fail(`foreignPose.timed pose ${pose} is not in the SFF.`);
      if(value===null || typeof value==='object' && (Array.isArray(value) || value.continue!==undefined && typeof value.continue!=='boolean')) fail('foreignPose.timed entry needs an Action and optional boolean continue.');
      const action=int(typeof value==='object'?value.action:value,'foreignPose.timed action',0,INT32_MAX),record=byNumber.get(action),resolved=record&&!record.marker?resolveCopy(record,byNumber):null;
      if(!resolved||resolved.error||!resolved.action.lines.some(line=>ELEMENT.test(stripComment(line)))) fail(`foreignPose.timed Action ${action} must be an existing, non-generated AIR action with elements.`);
      timed.set(pose,{action,continue:typeof value==='object'&&value.continue===true});
    }
  }
  const sourcePoses=new Set(sprites.filter(sprite=>sprite.group>=0&&sprite.group<10000&&sprite.number>=0&&sprite.number<=65535).map(sprite=>spriteKey(sprite.group,sprite.number)));
  for(const key of [...mapping.keys(),...timed.keys()])sourcePoses.add(key);
  const mappedStaticCount=[...mapping.values()].filter(Boolean).length;
  const missingCount=policy==='continue'?0:[...sourcePoses].filter(key=>!timed.has(key)&&!mapping.has(key)&&!(bank!==null&&available.has(spriteKey(Number(key.split(',')[0])+bank*BANK_GROUP_STEP,Number(key.split(',')[1]))))||mapping.has(key)&&mapping.get(key)===null&&!timed.has(key)).length;
  return {policy,bank,mapping,timed,mappedStaticCount,missingCount};
}

function scopeList(scopeAction, baseNumbers) {
  if (scopeAction === undefined || scopeAction === null || scopeAction === 'all') return [...baseNumbers].sort((a, b) => a - b);
  const list = (Array.isArray(scopeAction) ? scopeAction : [scopeAction]).map(value => int(value, 'scopeAction', -2147483648, INT32_MAX));
  const missing = list.filter(number => !baseNumbers.has(number));
  if (missing.length) fail(`scopeAction ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not a base action in the AIR (generated layer actions cannot be used as a base).`);
  return [...new Set(list)].sort((a, b) => a - b);
}

// Builds the generated body for one base action. Returns null when no element maps to a layer sprite.
function layerBody(action, source, spriteSet) {
  const out = [], missing = new Set();
  let frames = 0, mapped = 0, blank = 0;
  for (const raw of action.lines) {
    const line = stripComment(raw);
    if (!line.trim() || CLSN.test(line)) continue;
    const element = ELEMENT.exec(line);
    if (!element) { out.push(line.trim()); continue; }
    frames += 1;
    const group = Number(element[2]), number = Number(element[3]), from = spriteKey(group, number);
    let target = null;
    if (group >= 0 && number >= 0) {
      if (source.mapping.has(from)) target = source.mapping.get(from);
      else if (source.bank !== null && group + source.bank * BANK_GROUP_STEP <= 65535) target = spriteKey(group + source.bank * BANK_GROUP_STEP, number);
    }
    if (target && !spriteSet.has(target)) { missing.add(target); target = null; }
    if (target) mapped += 1; else blank += 1;
    const [tg, tn] = target ? target.split(',') : ['-1', '0'];
    out.push(`${tg},${tn}${element[4].replace(/^[ \t]*/, '')}`);
  }
  if (!mapped) return { body: null, frames, mapped, blank, missing: [...missing] };
  return { body: out.join('\n'), frames, mapped, blank, missing: [...missing] };
}

function markerLine(sourceKey, base, body) {
  return `${MARKER_PREFIX} v${MARKER_VERSION}; source=${sourceKey}; base=${base}; sha256=${sha16(body)}`;
}

// Linked AIR edits may intentionally keep a generated element's authored field.
// Only named, native AIR-line exceptions are allowed to differ on regeneration;
// all sprite identities, directives and unmarked fields still have to match.
function exceptionBearingBodyMatches(previous, expectedBody) {
  const parse=lines=>{const frames=[],other=[];let directives=[];for(const raw of lines){const line=stripComment(raw).trim();if(!line)continue;if(/^loopstart$|^interpolate\s+(?:offset|blend|scale|angle)$/i.test(line)){directives.push(line.toLowerCase());continue;}if(ELEMENT.test(line)){frames.push({line,raw,directives});directives=[];}else{other.push(...directives,line);directives=[];}}other.push(...directives);return{frames,other};};
  const authored=parse(previous.lines.slice(previous.lines.findIndex(line=>MARKER.test(line))+1)),expected=parse(expectedBody.split('\n'));
  if(authored.frames.length!==expected.frames.length||JSON.stringify(authored.other)!==JSON.stringify(expected.other))return false;
  const fieldNames=['group','index','x','y','time','flags','blend','scaleX','scaleY','angle'];
  for(let i=0;i<authored.frames.length;i++){
    const current=authored.frames[i].line,wanted=expected.frames[i].line;
    const match=/\bIKEMaker link-except=([\w,]+)/.exec(authored.frames[i].raw);
    const except=new Set((match?.[1]||'').split(','));
    const leftDirectives=authored.frames[i].directives,rightDirectives=expected.frames[i].directives;
    if(!except.has('loopStart')&&leftDirectives.includes('loopstart')!==rightDirectives.includes('loopstart'))return false;
    if(!except.has('interpolate')&&JSON.stringify(leftDirectives.filter(item=>item!=='loopstart'))!==JSON.stringify(rightDirectives.filter(item=>item!=='loopstart')))return false;
    const left=current.split(',').map(part=>part.trim()),right=wanted.split(',').map(part=>part.trim());
    const value=(parts,index)=>parts[index]??(index===7||index===8?'1':index===9?'0':'');
    for(let field=0;field<Math.max(left.length,right.length);field++){
      if(value(left,field)===value(right,field))continue;
      const name=fieldNames[field];
      if(name==='flags'){
        const l=value(left,field).toUpperCase(),r=value(right,field).toUpperCase();
        if(!except.has('flags')&&((l.includes('H')!==r.includes('H')&&!except.has('flipH'))||(l.includes('V')!==r.includes('V')&&!except.has('flipV'))))return false;
      }else if(!except.has(name))return false;
    }
  }
  return true;
}

function buildLayerAnimations(options) {
  return buildOwnedAnimations(options, false);
}

function buildOwnedAnimations({ airText, sprites, layer, scopeAction = null, occupiedActionIds = [] } = {}, allowEmpty) {
  const actions = airActions(airText), source = layerSource(layer);
  if (!Array.isArray(sprites)) fail('sprites must be the list of {group, number} present in the SFF.');
  const spriteSet = new Set(sprites.map(sprite => spriteKey(sprite.group, sprite.number)));
  const seen = new Map();
  for (const action of actions) {
    if (seen.has(action.number)) fail(`the AIR defines action ${action.number} more than once (lines ${seen.get(action.number)} and ${action.headerLine}). Fix that before generating layers.`);
    seen.set(action.number, action.headerLine);
  }
  const base = actions.filter(action => !action.marker), marked = actions.filter(action => action.marker);
  const baseByNumber = new Map(base.map(action => [action.number, action]));
  const scope = scopeList(scopeAction, new Set(baseByNumber.keys()));
  const occupied = new Set([...actions.map(action => action.number), ...(Array.isArray(occupiedActionIds) ? occupiedActionIds : []).map(Number).filter(Number.isInteger)]);

  // Existing generated actions for this source, keyed by base action.
  const existing = new Map(), problems = [];
  for (const action of marked.filter(item => item.marker.source === source.key)) {
    if (existing.has(action.marker.base)) problems.push(`actions ${existing.get(action.marker.base).number} and ${action.number} are both marked as ${source.key} for base ${action.marker.base}`);
    else existing.set(action.marker.base, action);
    if (action.marker.version !== MARKER_VERSION) problems.push(`action ${action.number} uses marker version ${action.marker.version}; this IKEMaker writes version ${MARKER_VERSION}`);
    if (sha16(action.body) !== action.marker.hash) problems.push(`action ${action.number} (${source.key}, base ${action.marker.base}) was edited after generation; its marker hash no longer matches`);
  }
  const offsets = new Set([...existing.values()].map(action => action.number - action.marker.base));
  if (offsets.size > 1) problems.push(`existing ${source.key} layer actions use different action offsets (${[...offsets].join(', ')})`);

  const plans = [], skipped = [];
  for (const number of scope) {
    const previous = existing.get(number), resolved = resolveCopy(baseByNumber.get(number), baseByNumber);
    if (resolved.error) {
      if (previous) problems.push(`action ${previous.number} (${source.key}, base ${number}) is stale: ${resolved.error}`);
      skipped.push({ baseAction: number, reason: resolved.error, missingLayerSprites: [] }); continue;
    }
    const built = layerBody(resolved.action, source, spriteSet);
    if (resolved.action.number !== number) built.copiedFrom = resolved.action.number;
    if (!built.body) {
      if (previous) problems.push(`action ${previous.number} (${source.key}, base ${number}) is stale: no element maps to a layer sprite any more, so it would be entirely blank`);
      skipped.push({ baseAction: number, reason: built.frames ? 'no element maps to a layer sprite' : 'action has no elements', missingLayerSprites: built.missing }); continue;
    }
    if (previous && previous.body !== built.body && sha16(previous.body) === previous.marker.hash && !exceptionBearingBodyMatches(previous,built.body)) problems.push(`action ${previous.number} (${source.key}, base ${number}) is stale: the base action or layer sprites changed since it was generated`);
    plans.push({ baseAction: number, ...built, previous });
  }
  for (const [baseNumber, action] of existing) if (!baseByNumber.has(baseNumber)) problems.push(`action ${action.number} (${source.key}) belongs to base action ${baseNumber}, which no longer exists`);
  if (problems.length) fail(`refusing to generate duplicates. Review or remove these marked actions first:\n- ${problems.join('\n- ')}`);
  if (!plans.length && !allowEmpty) fail(`no action in scope has an element with a ${source.label} sprite. Check the layer source and the SFF.${skipped.length ? ` Skipped: ${skipped.slice(0, 3).map(item => `${item.baseAction} (${item.reason})`).join("; ")}${skipped.length > 3 ? "; …" : ""}.` : ""}`);

  // One constant offset (layer action = offset + base action) so runtime code can map by arithmetic.
  let offset = layer.actionOffset !== undefined && layer.actionOffset !== null ? int(layer.actionOffset, 'layer.actionOffset', 1, INT32_MAX) : offsets.size ? [...offsets][0] : null;
  const fresh = plans.filter(plan => !plan.previous);
  const fits = candidate => fresh.every(plan => { const target = candidate + plan.baseAction; return target >= 0 && target <= INT32_MAX && !occupied.has(target); }) && plans.every(plan => !plan.previous || plan.previous.number === candidate + plan.baseAction);
  if (offset !== null) {
    if (!fits(offset)) fail(`action offset ${offset} collides with existing actions or with the existing ${source.key} layer actions.`);
  } else if (plans.length) {
    const start = source.bank !== null ? source.bank : 7;
    for (let k = start; k < 2000 && offset === null; k += 1) if (fits(k * 1000000)) offset = k * 1000000;
    if (offset === null) fail('could not find a free action offset.');
  }

  const out = [], results = [];
  for (const plan of plans) {
    const layerAction = offset + plan.baseAction, marker = markerLine(source.key, plan.baseAction, plan.body);
    const status = plan.previous ? 'reused' : 'created';
    if (!plan.previous) out.push(`[Begin Action ${layerAction}]`, marker, plan.body, '');
    results.push({ baseAction: plan.baseAction, layerAction, status, marker, copiedFrom: plan.copiedFrom ?? null, frames: plan.frames, mappedFrames: plan.mapped, blankFrames: plan.blank, missingLayerSprites: plan.missing });
  }
  const created = results.filter(item => item.status === 'created');
  const airCode = created.length ? [`; ---- ${source.label}: ${created.length} generated layer animation(s). Do not edit marked actions; regenerate them. ----`, ...out].join('\n') : '';
  const missingAll = [...new Set([...results, ...skipped].flatMap(item => item.missingLayerSprites))];
  return {
    airCode,
    actions: results,
    summary: {
      markerVersion: MARKER_VERSION, source: source.key, label: source.label, actionOffset: plans.length ? offset : null,
      scope: scopeAction === undefined || scopeAction === null || scopeAction === 'all' ? 'all' : scope,
      created: created.length, reused: results.length - created.length, skipped,
      mappedFrames: results.reduce((total, item) => total + item.mappedFrames, 0),
      blankFrames: results.reduce((total, item) => total + item.blankFrames, 0),
      missingLayerSprites: missingAll.slice(0, 50), missingLayerSpriteCount: missingAll.length,
      mappingEntries: source.mapping.size
    }
  };
}

// ---------------------------------------------------------------------------------------------
// Runtime costume Explod. One Explod per layer, kept on the generated layer action that matches the
// player's current animation (layer action = actionOffset + Anim), frozen on its own clock and
// re-seeked every tick to the player's element/time. syncid -1 groups it with the player in the draw
// order (synclayer > 0 in front of the body, < 0 behind); syncparams 1 copies sprpriority, scale,
// rotation, trans/alpha, palfx, facing and afterimage settings from the player every tick.
// Verified in engine source: IKEMEN GO 1.0.0 stable and nightly 6a093924 (see research notes).

function finite(value, fallback) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }

function explodPlacement(layer, baseLayer) {
  const baseX = finite(baseLayer?.x, 0), baseY = finite(baseLayer?.y, 0);
  const x = Math.round(finite(layer.x, 0) - baseX), y = Math.round(finite(layer.y, 0) - baseY);
  let syncLayer;
  if (layer.syncLayer !== undefined && layer.syncLayer !== null) syncLayer = int(layer.syncLayer, 'layer.syncLayer', -2147483648, INT32_MAX);
  else {if(/^layer[1-4]$/.test(String(layer.id||'')))fail('Provide an explicit unique layer.syncLayer derived from the active composition for a named layer slot.');syncLayer=finite(layer.order,1)-finite(baseLayer?.order,0);if(!Number.isInteger(syncLayer)||syncLayer===0)fail('Provide an explicit unique layer.syncLayer for tied or fractional stack orders.');}
  if (syncLayer === 0) fail('layer.syncLayer 0 would draw in the body\'s own slot; use a positive value (front) or negative value (behind).');
  const warnings = [];
  const unsupported = [['scaleX', 1], ['scaleY', 1], ['angle', 0], ['opacity', 1]].filter(([key, neutral]) => layer[key] !== undefined && finite(layer[key], neutral) !== neutral).map(([key]) => key);
  if (layer.flipX === true || layer.flipY === true) unsupported.push('flip');
  if (layer.blend !== undefined && layer.blend !== '' && layer.blend !== 'normal') unsupported.push('blend');
  if (unsupported.length) warnings.push(`Preview-only ${unsupported.join(', ')} not applied in game: the synchronized Explod copies scale, angle, transparency and facing from the player every tick. Per-frame blend/scale/angle authored in the AIR are kept.`);
  const independent=layer.runtimeRendering==='independent',runtimePriority=int(layer.runtimePriority??0,'layer.runtimePriority',-2147483648,INT32_MAX);
  if(independent)warnings.push('Independent game rendering uses its own absolute sprite priority; other players/effects may interleave. Frame seeking and owner position binding remain active. Full owner PalFX, alpha, projection and shader inheritance are not copied in this mode.');
  return { x, y, syncLayer, warnings, independent, runtimePriority };
}

// The runtime gate is the exact list of base actions that have a generated layer action. It is
// evaluated in chunks (at most GATE_TERMS comparisons per expression) into one map flag, so the
// expression size stays small even for a full roster (Ryu: 82 actions) and no unrelated action whose
// number happens to equal offset + Anim can turn the layer on.
const GATE_TERMS = 12;

function gateTerms(baseActions) {
  const sorted = [...new Set(baseActions)].sort((a, b) => a - b), runs = [];
  for (const number of sorted) { const last = runs[runs.length - 1]; if (last && number === last[1] + 1) last[1] = number; else runs.push([number, number]); }
  return runs.map(([a, b], index) => ({ index, zss: a === b ? `anim = ${a}` : `(anim >= ${a} && anim <= ${b})`, cns: a === b ? `Anim = ${a}` : `(Anim >= ${a} && Anim <= ${b})` }));
}
function chunks(list, size) { const out = []; for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size)); return out; }

function foreignPoseTable(airText, sprites, layer, occupiedActionIds, ignoreLegacyTable = false, markerIdentity = null, allowRefresh = false) {
  const source = layerSource(layer);
  const spriteSet = new Set(sprites.map(sprite => spriteKey(sprite.group, sprite.number)));
  const poses = [];
  for (const key of spriteSet) {
    const [group, number] = key.split(',').map(Number);
    if (![group, number].every(n => Number.isInteger(n) && n >= 0 && n <= 65535)) continue;
    const target = source.mapping.has(key) ? source.mapping.get(key)
      : source.bank === null ? null : spriteKey(group + source.bank * BANK_GROUP_STEP, number);
    if (target && spriteSet.has(target)) poses.push({ group, number, target });
  }
  poses.sort((a, b) => a.group - b.group || a.number - b.number);
  const markerSource = markerIdentity || 'foreign-poses:' + source.key;
  const actions = airActions(airText), previous = ignoreLegacyTable ? [] : actions.filter(item => item.marker?.source === markerSource);
  if (previous.length > 1) fail('the AIR contains duplicate foreign pose tables for ' + source.key);
  const body = poses.map(pose => pose.target + ',0,0,1').join('\n');
  const old = previous[0];
  if (old && (old.marker.version !== MARKER_VERSION || old.marker.base !== 0 ||
      old.marker.hash !== sha16(old.body) || (!allowRefresh && old.body !== body))) {
    fail('the foreign pose table for ' + source.key + ' is stale or edited. Review the marked Action before regenerating.');
  }
  if (!poses.length) return null;
  const occupied = new Set([...actions.map(action => action.number), ...occupiedActionIds.map(Number)]);
  // Keep the Action ID exactly representable both as a bytecode int and as a float trigger result.
  let action = old?.number ?? 8000000;
  if (!old) {
    while (occupied.has(action) && action <= 16777215) action++;
    if (action > 16777215) fail('could not allocate a free foreign pose table Action.');
  }
  const ranges = [];
  for (const [index, pose] of poses.entries()) {
    const prior = ranges[ranges.length - 1];
    if (prior && prior.group === pose.group && prior.end + 1 === pose.number) prior.end = pose.number;
    else ranges.push({ group: pose.group, first: pose.number, end: pose.number, element: index + 1 });
  }
  const code=['[Begin Action ' + action + ']', markerLine(markerSource, 0, body), body, ''].join('\n');
  const airReplacements=[];
  if(old && old.body!==body){
    const lines=airText.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g).filter(Boolean);
    const offset=lines.slice(0,old.headerLine-1).join('').length,next=actions.find(item=>item.headerLine>old.headerLine);
    const end=next?lines.slice(0,next.headerLine-1).join('').length:airText.length;
    airReplacements.push({offset,end,oldBlock:airText.slice(offset,end),code:code.replace(/\n/g,airText.includes('\r\n')?'\r\n':'\n')});
  }
  return { action, poses: poses.length, ranges, status: old ? airReplacements.length?'updated':'reused' : 'created',
    airCode: old ? '' : code, airReplacements };
}

// Body atlas v2 keeps legacy foreign-pose tables untouched. Known frame transforms
// live in AIR elements, allowing syncparams to inherit every native owner draw effect.
function bodyPoseTable(airText, sprites, layer, occupiedActionIds) {
  const base = foreignPoseTable(airText, sprites, layer, occupiedActionIds, true);
  if (!base) return null;
  const source = layerSource(layer), available = new Set(sprites.map(s=>spriteKey(s.group,s.number)));
  const variants = new Map();
  const { parseAir } = require('./air_preview_model');
  const generatedActions = new Set(airActions(airText).filter(a=>a.marker).map(a=>a.number));
  for (const action of parseAir(airText)) {
    if (generatedActions.has(action.number)) continue;
    for (const [i,f] of action.frames.entries()) {
      const from = spriteKey(f.group,f.index), target = source.mapping.has(from)?source.mapping.get(from):source.bank===null?null:spriteKey(f.group+source.bank*BANK_GROUP_STEP,f.index);
      if (!target || !available.has(target)) continue;
      const h = f.flags.includes('H')?1:0, v = f.flags.includes('V')?1:0;
      if (!h && !v && f.scaleX === 1 && f.scaleY === 1 && f.angle === 0 && !f.blend) continue;
      const key = JSON.stringify([from,h,v,f.scaleX,f.scaleY,f.angle,f.blend]);
      if (!variants.has(key)) variants.set(key,{group:f.group,image:f.index,h,v,sx:f.scaleX,sy:f.scaleY,angle:f.angle,blend:f.blend,target,origins:[]});
      variants.get(key).origins.push(`(animPlayerNo = playerNo && anim = ${action.number} && animElemNo(0) = ${i+1})`);
    }
  }
  // Slot 1..N keeps the original neutral fallback lookup, followed by transform signatures.
  const baseBodies = [];
  for (const r of base.ranges) for(let image=r.first;image<=r.end;image++) {
    const from=spriteKey(r.group,image),target=source.mapping.has(from)?source.mapping.get(from):spriteKey(r.group+source.bank*BANK_GROUP_STEP,image);
    baseBodies.push(`${target},0,0,1`);
  }
  const rows = [...variants.values()];
  const body = [...baseBodies,...rows.map(f=>`${f.target},0,0,1,${f.h?'H':''}${f.v?'V':''},${f.blend},${f.sx},${f.sy},${f.angle}`)].join('\n');
  const markerSource='body-signatures:'+source.key;
  const actions=airActions(airText), previous=actions.filter(a=>a.marker?.source===markerSource);
  if(previous.length>1) fail('duplicate body transform-signature atlases.');
  const old=previous[0];
  if(old && (old.marker.version!==MARKER_VERSION || old.marker.base!==0 || old.marker.hash!==sha16(old.body))) fail('the body transform-signature atlas was edited. Review the marked Action before regenerating.');
  const occupied=new Set([...actions.map(a=>a.number),base.action,...occupiedActionIds]);
  let action=old?.number??8000001;
  if(!old) while(occupied.has(action)&&action<=16777215) action++;
  if(action>16777215) fail('could not allocate a body transform-signature atlas.');
  const code = ['[Begin Action '+action+']',markerLine(markerSource,0,body),body,''].join('\n');
  const replacements = [];
  if (old && old.body !== body) {
    const lines = airText.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g).filter(Boolean);
    const offset = lines.slice(0,old.headerLine-1).join('').length;
    const next = actions.find(a=>a.headerLine>old.headerLine);
    const end = next ? lines.slice(0,next.headerLine-1).join('').length : airText.length;
    const oldBlock = airText.slice(offset,end);
    replacements.push({offset,end,oldBlock,code:code.replace(/\n/g,airText.includes('\r\n')?'\r\n':'\n')});
  }
  return {...base,action,baseCount:baseBodies.length,signatures:rows.map((f,i)=>({...f,element:baseBodies.length+i+1})),status:old?(replacements.length?'updated':'reused'):'created',airReplacements:replacements,airCode:old?'':code};
}

function heldForeignControllers(parts, table, syntax, params, lookup) {
  const { explodId, flag, label, stateLabel } = parts;
  const allowed = parts.bodyPose ? '!isAsserted(invisible) && (' + parts.visibility + ') && spritePlayerNo = playerNo && spriteVar(width) > 0 && ((hitPauseTime > 0 && !isAsserted(animatehitpause) && map(' + flag + '_foreign)) || anim >= 0)' : 'inCustomState && animPlayerNo > 0 && animPlayerNo != playerNo && spritePlayerNo = playerNo';
  const activeKey = flag + '_foreign', groupKey = flag + '_group', imageKey = flag + '_image', slotKey = flag + '_pose';
  const active = 'map(' + activeKey + ')', slot = 'map(' + slotKey + ')';
  const group = parts.bodyPose ? 'spriteVar(group)' : 'animElemVar(group)', image = parts.bodyPose ? 'spriteVar(image)' : 'animElemVar(image)';
  const hold = parts.bodyPose ? 'hitPauseTime > 0 && !isAsserted(animatehitpause)' : '0';
  const cacheFields = parts.bodyPose ? ['group','image'].map(name=>[name,'spriteVar(' + name + ')']).concat(['hflip','vflip','xscale','yscale','angle','alphasource','alphadest','xoffset','yoffset'].map(name=>[name,'animElemVar(' + name + ')']),[['anim','anim'],['owner','animPlayerNo'],['elem','animElemNo(0)']]) : [];
  const changed = parts.bodyPose ? '!' + active + ' || (!(' + hold + ') && (' + cacheFields.map(([name,value])=>'map(' + flag + '_cache_' + name + ') != ' + value).join(' || ') + '))' : '!' + active + ' || map(' + groupKey + ') != ' + group + ' || map(' + imageKey + ') != ' + image;
  const exists = 'numExplod(' + explodId + ')';
  const atlas = 'explodVar(' + explodId + ', 0, anim) = ' + table.action;
  const seek = 'explodVar(' + explodId + ', 0, animelem) != ' + slot;
  const turn = parts.bodyPose ? 'map(' + flag + '_facing) != facing && (' + (parts.manualFacing || '1') + ')' : '0';
  const transform = params.filter(([name]) => ['id','postype','pos','scale','angle','sprpriority','layerno','under','trans','alpha','syncparams','shadow','reflection'].includes(name));
  const zssFields = fields => fields.map(([key, val]) => key + ': ' + val + ';').join(' ');
  const cns = (name, type, triggers, fields) => ['[State ' + stateLabel + ', ' + label + ': ' + name + ']',
    'type = ' + type, 'triggerall = !IsHelper', ...triggers.map(t => 'trigger1 = ' + t),
    ...fields.map(([key,val]) => key + ' = ' + val), 'ignorehitpause = 1', ''];
  const mapSet = (name, value, triggers) => cns(name, 'MapSet', triggers, [['map', '"' + name + '"'], ['value', value]]);
  const id = [['id',explodId]];
  const groups = new Map();
  for (const row of lookup) {
    if (!groups.has(row.group)) groups.set(row.group, []);
    groups.get(row.group).push(row);
  }
  // Cache misses too. Two adjacent elements can share a sprite yet change its authored
  // position or transform, so keep those parameters live without looking up or respawning it.
  if (syntax === 'zss') {
    return { active, before: [
      'ignorehitpause if !isHelper {',
      '\tif ' + allowed + ' {',
      '\t\tif ' + changed + ' {',
      '\t\t\t' + active + ' := 1;',
      '\t\t\tmap(' + groupKey + ') := ' + group + ';',
      '\t\t\tmap(' + imageKey + ') := ' + image + ';',
      '\t\t\t' + slot + ' := 0;',
      ...cacheFields.map(([name,value])=>'\t\t\tmap(' + flag + '_cache_' + name + ') := ' + value + ';'),
      ...[...groups].flatMap(([n, rows]) => ['\t\t\tif ' + group + ' = ' + n + ' {',
        ...rows.map(row => '\t\t\t\tif ' + row.condition + ' {' + slot + ' := ' + row.value + ';}'), '\t\t\t}']),
      '\t\t}',
      '\t} else if ' + active + ' {',
      '\t\t' + active + ' := 0;',
      '\t\tif ' + exists + ' && ' + atlas + ' {removeExplod{id: ' + explodId + '}}',
      '\t}', '}'
    ], after: [
      'ignorehitpause if !isHelper && ' + active + ' {',
      ...(parts.bodyPose ? ['\tif ' + exists + ' && ' + turn + ' && !(' + hold + ') {removeExplod{id: ' + explodId + '}}', '\tif !(' + hold + ') {map(' + flag + '_facing) := facing;}'] : []),
      '\tif ' + exists + ' && (!' + slot + ' || !(' + atlas + ')) {removeExplod{id: ' + explodId + '}}',
      '\tif ' + slot + ' {',
      '\t\tif !' + exists + ' {',
      '\t\t\texplod{' + zssFields(params) + ' ignorehitpause: 1;}',
      '\t\t} else {',
      '\t\t\tif ' + seek + ' {modifyExplod{id: ' + explodId + '; animelem: ' + slot + ';}}',
      '\t\t\t' + (parts.bodyPose ? 'if !(' + hold + ') {' : '') + 'modifyExplod{' + zssFields(transform) + '}' + (parts.bodyPose ? '}' : ''),
      '\t\t}', '\t}', '}', ''
    ] };
  }
  // 0 = outside foreign lookup, 2 = refresh this tick, 1 = cached. A held
  // pose's range controllers stop at their first trigger without reading frame data.
  return { active, before: [
    ...cns('leave foreign pose','RemoveExplod',[active, '!(' + allowed + ')', exists, atlas],id),
    ...mapSet(activeKey, 0, [active, '!(' + allowed + ')']),
    ...mapSet(activeKey, 2, [allowed, changed]),
    ...mapSet(slotKey, 0, [active + ' = 2']),
    ...mapSet(groupKey, group, [active + ' = 2']),
    ...mapSet(imageKey, image, [active + ' = 2']),
    ...cacheFields.flatMap(([name,value])=>mapSet(flag + '_cache_' + name,value,[active + ' = 2'])),
    ...lookup.flatMap(row => cns('foreign pose lookup','MapSet',[active + ' = 2', group + ' = ' + row.group, row.condition],
      [['map','"' + slotKey + '"'],['value',row.value]])),
    ...mapSet(activeKey, 1, [active + ' = 2'])
  ], after: [
    ...(parts.bodyPose ? [...cns('refresh turned pose','RemoveExplod',[active,exists,turn,'!(' + hold + ')'],id),...mapSet(flag + '_facing','facing',[active,'!(' + hold + ')'])] : []),
    ...cns('hide or switch foreign pose','RemoveExplod',[active, exists, '!' + slot + ' || !(' + atlas + ')'], id),
    ...cns('refresh foreign element','ModifyExplod',[active,slot,exists,seek],[...id,['animelem',slot]]),
    ...cns('place foreign element','ModifyExplod',[active,slot,exists,...(parts.bodyPose?['!(' + hold + ')']:[])],transform),
    ...cns('create foreign pose','Explod',[active,slot,'!' + exists],params)
  ] };
}

function layerShadowFields(parts) {
  const shadow=parts.castShadow===true?'ifElse(isAsserted(noshadow), 0, -1)':'0';
  return [['shadow',[shadow,shadow,shadow].join(',')],['reflection',parts.showReflection===true?'ifElse(isAsserted(noshadow), 0, 1)':0]];
}

function foreignControllers(parts, table, syntax) {
  const { explodId, syncLayer, x, y, flag, label, stateLabel, independent, runtimePriority } = parts;
  const allowed = 'animPlayerNo > 0 && animPlayerNo != playerNo && spritePlayerNo = playerNo';
  const slot = flag + '_pose';
  // AnimElemVar returns the parsed AIR frame, including signed offsets after H/V.
  // Undo that internal sign when using an Explod position. The engine scales foreign
  // AIR offsets in the animation owner's coordinates and with its size constants.
  const sign = axis => 'ifElse(animElemVar(' + (axis === 'x' ? 'h' : 'v') + 'flip), -1, 1)';
  const offset = (axis, extra) => (parts.legacyDrawSync?extra:extra+' * const(size.'+axis+'scale) * scale '+axis) + ' + animElemVar(' + axis + 'offset) * ' + sign(axis) +
    ' * scale ' + axis + ' * const240p(320) / (player(animPlayerNo), localcoord x) * (player(animPlayerNo), const(size.' + axis + 'scale))';
  const scale = axis => 'const(size.' + axis + 'scale) * scale ' + axis + ' * animElemVar(' + axis + 'scale) * ' + sign(axis);
  const params = [
    ['id', explodId], ['anim', table.action], ['animelem', 'map(' + slot + ')'], ['animfreeze', 1],
    ['postype', 'p1'], ['pos', offset('x', x) + ', ' + offset('y', y)],
    ['scale', scale('x') + ', ' + scale('y')], ['angle', 'angle + animElemVar(angle)'],
    ['bindtime', -1], ['removetime', -1], ['removeongethit', 0], ['removeonchangestate', 0], ['ownpal', 0],
    ...(!parts.legacyDrawSync?[['layerno','layerno'],['under','isAsserted(drawunder)']]:[]),
    ...(parts.bodyPose ? [['trans','addalpha'],['alpha','ifElse(alpha source != 255 || alpha dest != 0, alpha source, animElemVar(alphasource)), ifElse(alpha source != 255 || alpha dest != 0, alpha dest, animElemVar(alphadest))']] : []),
    ['sprpriority', independent?runtimePriority:'sprpriority'], ['syncid', independent?0:-1], ['synclayer', syncLayer], ['syncparams', parts.bodyPose ? 'animElemVar(xscale) = 1 && animElemVar(yscale) = 1 && animElemVar(angle) = 0 && !animElemVar(hflip) && !animElemVar(vflip) && animElemVar(alphasource) = 255 && animElemVar(alphadest) = 0' : 0]
  ];
  const lookup = table.ranges.map(range => {
    const image = parts.bodyPose ? 'spriteVar(image)' : 'animElemVar(image)';
    const condition = range.first === range.end ? image + ' = ' + range.first :
      image + ' >= ' + range.first + ' && ' + image + ' <= ' + range.end;
    return { group: range.group, condition, value: range.first === range.end ? String(range.element) :
      range.element + ' + ' + image + ' - ' + range.first };
  });
  if (parts.bodyPose && table.signatures) {
    const native = `(map(${slot}) > ${table.baseCount} || (animElemVar(xscale) = 1 && animElemVar(yscale) = 1 && animElemVar(angle) = 0 && !animElemVar(hflip) && !animElemVar(vflip) && animElemVar(alphasource) = 255 && animElemVar(alphadest) = 0))`;
    params.find(([name])=>name==='syncparams')[1] = native;
    parts.manualFacing = independent ? '1' : '!(' + native + ')';
    // Native variants carry their own AIR draw fields, so owner sync must be the only scale/angle/trans source.
    for (const f of (independent ? [] : table.signatures)) {
      const fields = [['hflip',f.h],['vflip',f.v],['xscale',f.sx],['yscale',f.sy],['angle',f.angle]];
      // AIR blend mode has no trigger. Restrict nonempty blends to known originating owner elements.
      const alpha = f.blend === '' ? ' && animElemVar(alphasource) = 255 && animElemVar(alphadest) = 0' : ` && (${f.origins.join(' || ')})`;
      lookup.push({group:f.group,condition:`spriteVar(image) = ${f.image} && ${fields.map(([k,v])=>`animElemVar(${k}) = ${v}`).join(' && ')}${alpha}`,value:String(f.element)});
    }
    params.push(...layerShadowFields(parts));
  }
  if (!parts.legacyForeignPoses) return heldForeignControllers(parts, table, syntax, params, lookup);
  const owned = 'animPlayerNo = playerNo && spritePlayerNo = playerNo';
  // A foreign pose Explod has syncparams disabled to preserve authored transforms.
  // Recreate it on returning to an owned Action so the native synchronization is restored.
  const reset = owned + ' && numExplod(' + explodId + ') && explodVar(' + explodId + ', 0, anim) = ' + table.action;
  if (syntax === 'zss') {
    const byGroup = new Map();
    for (const row of lookup) {
      if (!byGroup.has(row.group)) byGroup.set(row.group, []);
      byGroup.get(row.group).push(row);
    }
    return {
      before: ['ignorehitpause if !isHelper && ' + reset + ' {removeExplod{id: ' + explodId + '}}'],
      after: ['ignorehitpause if !isHelper && ' + allowed + ' {', '\tmap(' + slot + ') := 0;',
        ...[...byGroup].flatMap(([group, rows]) => ['\tif animElemVar(group) = ' + group + ' {',
          ...rows.map(row => '\t\tif ' + row.condition + ' {map(' + slot + ') := ' + row.value + ';}'), '\t}']),
        '\tif map(' + slot + ') > 0 {', '\t\texplod{', ...params.map(([k,v]) => '\t\t\t' + k + ': ' + v + ';'),
        '\t\t\tignorehitpause: 1;', '\t\t}', '\t}', '}', '']
    };
  }
  const block = (name, type, triggers, fields) => ['[State ' + stateLabel + ', ' + label + ': ' + name + ']',
    'type = ' + type, 'triggerall = !IsHelper', ...triggers.map(t => 'trigger1 = ' + t),
    ...fields.map(([k,v]) => k + ' = ' + v), 'ignorehitpause = 1', ''];
  return { before: block('leave foreign pose', 'RemoveExplod', [reset], [['id', explodId]]),
    after: [...block('foreign pose reset', 'MapSet', [allowed], [['map', '"' + slot + '"'], ['value', 0]]),
      ...lookup.flatMap(row => block('foreign pose lookup', 'MapSet', [allowed, 'animElemVar(group) = ' + row.group, row.condition],
        [['map', '"' + slot + '"'], ['value', row.value]])),
      ...block('foreign pose', 'Explod', [allowed, 'map(' + slot + ') > 0'], params)] };
}

function zssState({ explodId, offset, x, y, syncLayer, label, header, flag, terms, frozen, foreign, independent, runtimePriority,legacyDrawSync }) {
  const seek = ['animelem: animElemNo(0);', 'animelemtime: animElemTime(animElemNo(0));'];
  const lines = [
    `# IKEMaker costume layer "${label}" (generated). Explod ${explodId} shows layer action ${offset} + anim for ${terms.length} generated base-action range(s).`,
    header,
    ...(foreign?.before || []),
    'ignorehitpause if !isHelper {',
    `\tmap(${flag}) := 0;`,
    ...chunks(terms, GATE_TERMS).map(group => `\tif animPlayerNo = playerNo && ${foreign ? 'spritePlayerNo = playerNo && ' : ''}(${group.map(term => term.zss).join(' || ')}) {map(${flag}) := 1;}`),
    `\tif !map(${flag}) {`,
    `\t\tif ${foreign?.active ? '!' + foreign.active + ' && ' : ''}numExplod(${explodId}) {removeExplod{id: ${explodId}}}`,
    `\t} else if !numExplod(${explodId}) {`,
    '\t\texplod{',
    `\t\t\tid: ${explodId};`,
    `\t\t\tanim: ${offset} + anim;`,
    ...seek.map(line => `\t\t\t${line}`),
    `\t\t\tanimfreeze: ${frozen ? 1 : 0};`,
    '\t\t\tpostype: p1;',
    `\t\t\tpos: ${legacyDrawSync?x:x+' * const(size.xscale) * scale x'}, ${legacyDrawSync?y:y+' * const(size.yscale) * scale y'};`,
    '\t\t\tbindtime: -1;',
    '\t\t\tremovetime: -1;',
    '\t\t\tremoveongethit: 0;',
    '\t\t\tremoveonchangestate: 0;',
    '\t\t\townpal: 0;',
    `\t\t\tignorehitpause: ${frozen ? 1 : 0};`,
    `\t\t\tsyncid: ${independent?0:-1};`,
    `\t\t\tsynclayer: ${syncLayer};`,
    `\t\t\tsyncparams: ${independent?0:1};`,
    ...(independent?[`\t\t\tsprpriority: ${runtimePriority};`,'\t\t\tscale: const(size.xscale) * scale x, const(size.yscale) * scale y;','\t\t\tangle: angle;']:[]),
    '\t\t}',
    `\t} else if explodVar(${explodId}, 0, anim) != ${offset} + anim {`,
    `\t\tmodifyExplod{id: ${explodId}; anim: ${offset} + anim; ${seek.join(' ')}}`,
    '\t} else {',
    `\t\tmodifyExplod{id: ${explodId}; ${seek.join(' ')}}`,
    '\t}',
    '}',
    ...(!legacyDrawSync?[`ignorehitpause if !isHelper && numExplod(${explodId}) {modifyExplod{id: ${explodId}; pos: ${x} * const(size.xscale) * scale x, ${y} * const(size.yscale) * scale y; layerno: layerno; under: isAsserted(drawunder);}}`]:[]),
    ...(independent?[`ignorehitpause if !isHelper && numExplod(${explodId}) {modifyExplod{id: ${explodId}; sprpriority: ${runtimePriority}; scale: const(size.xscale) * scale x, const(size.yscale) * scale y; angle: angle;}}`]:[]),
    ...(foreign?.after || []),
    ''
  ];
  return lines.join('\n');
}

function cnsState({ explodId, offset, x, y, syncLayer, label, header, flag, terms, stateLabel, frozen, foreign, independent, runtimePriority,legacyDrawSync }) {
  const on = `!IsHelper && Map(${flag})`, seek = ['animelem = AnimElemNo(0)', 'animelemtime = AnimElemTime(AnimElemNo(0))'];
  // In CNS, ignorehitpause on Explod/ModifyExplod is also the Explod's own property. A following clock
  // needs it at 0 (the Explod pauses with its parent's hitpause, like the body's animation), so those
  // controllers do not run in hitpause; the body's animation does not advance then either.
  const explodHitpause = frozen ? 1 : 0;
  const block = (title, type, triggers, params, ignoreHitPause = 1) => [`[State ${stateLabel}, ${label}: ${title}]`, `type = ${type}`, ...triggers.map(trigger => `trigger1 = ${trigger}`), ...params, `ignorehitpause = ${ignoreHitPause}`, ''];
  return [
    `; IKEMaker costume layer "${label}" (generated). Explod ${explodId} shows layer action ${offset} + Anim for ${terms.length} generated base-action range(s).`,
    header,
    '',
    ...(foreign?.before || []),
    ...block('gate reset', 'MapSet', ['!IsHelper'], [`map = "${flag}"`, 'value = 0']),
    ...chunks(terms, GATE_TERMS).flatMap((group, index) => block(`gate ${index + 1}`, 'MapSet', ['!IsHelper && AnimPlayerNo = PlayerNo' + (foreign ? ' && SpritePlayerNo = PlayerNo' : ''), group.map(term => term.cns).join(' || ')], [`map = "${flag}"`, 'value = 1'])),
    ...block('hide', 'RemoveExplod', [`!IsHelper && !Map(${flag}) && ${foreign?.active ? '!' + foreign.active + ' && ' : ''}NumExplod(${explodId})`], [`id = ${explodId}`]),
    ...block('create', 'Explod', [on, `!NumExplod(${explodId})`], [`id = ${explodId}`, `anim = ${offset} + Anim`, ...seek, `animfreeze = ${frozen ? 1 : 0}`, 'postype = p1', `pos = ${legacyDrawSync?x:x+' * Const(size.xscale) * Scale X'}, ${legacyDrawSync?y:y+' * Const(size.yscale) * Scale Y'}`, 'bindtime = -1', 'removetime = -1', 'removeongethit = 0', 'removeonchangestate = 0', 'ownpal = 0', `syncid = ${independent?0:-1}`, `synclayer = ${syncLayer}`, `syncparams = ${independent?0:1}`,...(independent?[`sprpriority = ${runtimePriority}`,'scale = Const(size.xscale) * Scale X, Const(size.yscale) * Scale Y','angle = Angle']:[])], explodHitpause),
    ...block('change action', 'ModifyExplod', [on, `NumExplod(${explodId}) && ExplodVar(${explodId}, 0, anim) != ${offset} + Anim`], [`id = ${explodId}`, `anim = ${offset} + Anim`, ...seek], explodHitpause),
    ...block('follow element', 'ModifyExplod', [on, `NumExplod(${explodId})`], [`id = ${explodId}`, ...seek], explodHitpause),
    ...(!legacyDrawSync?block('follow owner layer and offset','ModifyExplod',[`!IsHelper && NumExplod(${explodId})`],[`id = ${explodId}`,`pos = ${x} * Const(size.xscale) * Scale X, ${y} * Const(size.yscale) * Scale Y`,'layerno = LayerNo','under = IsAsserted(DrawUnder)'],explodHitpause):[]),
    ...(independent?block('follow independent drawing','ModifyExplod',[`!IsHelper && NumExplod(${explodId})`],[`id = ${explodId}`,`sprpriority = ${runtimePriority}`,'scale = Const(size.xscale) * Scale X, Const(size.yscale) * Scale Y','angle = Angle'],explodHitpause):[]),
    ...(foreign?.after || [])
  ].join('\n');
}

function buildLegacyCostumeExplod({ airText, sprites, layer, baseLayer = null, scopeAction = null, explodId, language = 'zss', occupiedActionIds = [], statePhase = 'pre', explodClock, foreignPoses = true, allowForeignOnly = false, legacyForeignPoses = false,legacyDrawSync = false } = {}) {
  const id = int(explodId, 'explodId', 0, INT32_MAX);
  const lang = String(language || '').toLowerCase();
  if (!['zss', 'cns'].includes(lang)) fail('language must be "zss" or "cns".');
  const phase = statePhase === undefined || statePhase === null ? 'pre' : String(statePhase);
  if (!Object.hasOwn(COSTUME_STATE_PHASES, phase)) fail('statePhase must be "pre" ([StateDef -4], default) or "post" ([StateDef +1]).');
  const stateLabel = String(COSTUME_STATE_PHASES[phase]);
  // frozen: the Explod clock is stopped and only seeked (pre default, unchanged output for existing callers).
  // follow: seeked to the body's current element, then advanced by the engine in the same tick as the body
  //         (post default). By engine source both clocks draw the same element in normal play; which
  //         one is right for hitpause/superpause awaits a pixel test (Tests/costume-explod-research.txt).
  const clock = explodClock === undefined || explodClock === null ? (phase === 'post' ? 'follow' : 'frozen') : String(explodClock);
  if (!['frozen', 'follow'].includes(clock)) fail('explodClock must be "frozen" or "follow".');
  if (layer && (layer.enabled === false || layer.visible === false)) fail('the layer is disabled or hidden; enable it before generating runtime code.');
  const fullSpriteScope = allowForeignOnly === true && foreignPoses && (scopeAction === null || scopeAction === 'all');
  const animations = buildOwnedAnimations({ airText, sprites, layer, scopeAction, occupiedActionIds }, fullSpriteScope);
  const placement = explodPlacement(layer, baseLayer), offset = animations.summary.actionOffset;
  const label = safeLabel(layer.label, animations.summary.label);
  const header = lang === 'zss' ? `[StateDef ${stateLabel}]` : `[Statedef ${stateLabel}]`;
  const flag = `ikemaker_costume_${id}`, terms = gateTerms(animations.actions.map(action => action.baseAction));
  const parts = { explodId: id, offset, x: placement.x, y: placement.y, syncLayer: placement.syncLayer, independent:placement.independent,runtimePriority:placement.runtimePriority,label, header, flag, terms, stateLabel, legacyForeignPoses,legacyDrawSync, frozen: clock === 'frozen' };
  const table = foreignPoses && animations.summary.scope === 'all'
    ? foreignPoseTable(airText + '\n' + animations.airCode, sprites, layer, occupiedActionIds) : null;
  if (!table && !animations.actions.length) fail('no base AIR element or SFF sprite maps to artwork for this layer.');
  if (table) parts.foreign = foreignControllers(parts, table, lang);
  let stateCode;
  if (animations.actions.length) {
    stateCode = lang === 'zss' ? zssState(parts) : cnsState(parts);
  } else {
    // The foreign table contains the only drawable poses. Clear the preceding tick's
    // pose before evaluating the current sprite, including a return to an owned Action.
    const clear = lang === 'zss'
      ? [`ignorehitpause if !isHelper && numExplod(${id}) {removeExplod{id: ${id}}}`]
      : [`[State ${stateLabel}, clear previous costume pose]`, 'type = RemoveExplod',
        `trigger1 = !IsHelper && NumExplod(${id})`, `id = ${id}`, 'ignorehitpause = 1', ''];
    const comment = lang === 'zss' ? '#' : ';';
    stateCode = [`${comment} IKEMaker costume layer "${label}" (foreign poses only).`, header, ...(legacyForeignPoses ? clear : parts.foreign.before), ...parts.foreign.after].join('\n');
  }
  const warnings = [...placement.warnings];
  if (animations.summary.missingLayerSpriteCount) warnings.push(`${animations.summary.missingLayerSpriteCount} layer sprite(s) referenced by the source are not in the SFF; those elements are blank.`);
  return {
    airCode: table?.airCode ? [animations.airCode, table.airCode].filter(Boolean).join('\n') : animations.airCode,
    stateCode,
    actions: animations.actions,
    summary: {
      ...animations.summary,
      foreignPoseAction: table ? { action: table.action, poses: table.poses, ranges: table.ranges.length, status: table.status } : null,
      explodId: id, language: lang, statePhase: phase, statedef: COSTUME_STATE_PHASES[phase], stateHeader: header, explodClock: clock, gateMap: flag,
      gateRanges: terms.length, gateExpressions: Math.ceil(terms.length / GATE_TERMS),
      runtimeRendering:placement.independent?'independent':'grouped',runtimePriority:placement.runtimePriority,syncLayer: placement.syncLayer, pos: [placement.x, placement.y],
      requires: 'IKEMEN GO 1.0 or newer with ikemenversion in the character DEF (ModifyExplod anim)',
      warnings
    }
  };
}


// Pose following intentionally uses only one static atlas, independent of the owner's Action ID.
// Selection runs after the current state's controllers, including opponent custom states.
function buildCostumeExplod(options = {}) {
  const layer = options.layer || {};
  const mode = options.runtimeMode ?? layer.runtimeMode ?? 'body-pose';
  if (mode === 'legacy') return buildLegacyCostumeExplod(options);
  if (!['body-pose', 'independent-animation'].includes(mode)) fail('runtimeMode must be body-pose, independent-animation or legacy.');
  if (layer.enabled === false || layer.visible === false) fail('the layer is disabled or hidden; enable it before generating runtime code.');
  const id = int(options.explodId, 'explodId', 0, INT32_MAX);
  const lang = String(options.language || 'zss').toLowerCase();
  if (!['zss','cns'].includes(lang)) fail('language must be "zss" or "cns".');
  const visibility = String(options.runtimeVisibility ?? layer.runtimeVisibility ?? '1').trim();
  if (!visibility || /[\r\n;{}\[\]]/.test(visibility)) fail('runtimeVisibility must be a single trigger expression.');
  const placement = explodPlacement(layer, options.baseLayer);
  const label = safeLabel(layer.label, 'Costume layer');
  const header = '[StateDef +1]';
  const flag = `ikemaker_costume_${id}`;
  const parts = { ...placement, explodId:id, label, header, stateLabel:'+1', flag, bodyPose:true, visibility,castShadow:options.castShadow ?? layer.castShadow,showReflection:options.showReflection ?? layer.showReflection };
  let airCode = '', stateCode, table = null, foreignSummary = null;
  const warnings = [...placement.warnings];
  const block = (title,type,trigger,params) => [`[State +1, ${label}: ${title}]`,`type = ${type}`,`trigger1 = !IsHelper && (${trigger})`,...params.map(([k,v])=>`${k} = ${v}`),'ignorehitpause = 1',''];
  let pause = null, action = null;
  if (mode === 'body-pose') {
    table = bodyPoseTable(options.airText, options.sprites, layer, options.occupiedActionIds || []);
    if (!table) fail('no SFF sprite maps to artwork for this layer.');
    const controllers = foreignControllers(parts, table, lang);
    stateCode = [header, ...controllers.before, ...controllers.after].join('\n');
    airCode = table.airCode;
    warnings.push('Unknown foreign AIR transforms and interpolated draw effects may differ; custom shadow/reflection overrides are not inherited.');
  } else {
    action = int(options.runtimeAction ?? layer.runtimeAction ?? layer.source?.action, 'runtimeAction', 0, INT32_MAX);
    const actions = airActions(options.airText), byNumber = new Map(actions.map(a=>[a.number,a]));
    if (!byNumber.has(action) || byNumber.get(action).marker) fail('runtimeAction must select an existing, non-generated AIR action.');
    const resolved = resolveCopy(byNumber.get(action),byNumber);
    if (resolved.error || !resolved.action.lines.some(line=>ELEMENT.test(stripComment(line)))) fail('runtimeAction must resolve to an AIR action with elements.');
    pause = options.runtimePause ?? layer.runtimePause ?? 'owner';
    if (!['owner','always','never'].includes(pause)) fail('runtimePause must be owner, always or never.');
    const policy = options.runtimeVisibilityPolicy ?? layer.runtimeVisibilityPolicy ?? 'owner';
    if (!['owner','always'].includes(policy)) fail('runtimeVisibilityPolicy must be owner or always.');
    const visible = `${policy === 'owner' ? '!isAsserted(invisible) && ' : ''}(${visibility})`;
    const freeze = pause === 'always' ? '1' : pause === 'never' ? '0' : '(isAsserted(animfreeze) || pauseTime > 0)';
    const params = [['id',id],['anim',action],['postype','p1'],['pos',`${placement.x} * const(size.xscale) * scale x, ${placement.y} * const(size.yscale) * scale y`],['bindtime',-1],['removetime',-1],['removeongethit',0],['removeonchangestate',0],['ownpal',0],['syncid',placement.independent?0:-1],['sprpriority',placement.independent?placement.runtimePriority:'sprpriority'],['angle','angle'],['synclayer',placement.syncLayer],['syncparams',visible],['scale',`ifElse(${visible}, const(size.xscale) * scale x, 0), ifElse(${visible}, const(size.yscale) * scale y, 0)`],['animfreeze',freeze],['ignorehitpause',pause==='never'?1:pause==='owner'?'isAsserted(animatehitpause)':0],['pausemovetime',INT32_MAX],['supermovetime',INT32_MAX]];
    params.push(...layerShadowFields(parts));
    const update = params.filter(([k])=>(['id','pos','shadow','reflection','animfreeze','scale','syncparams','sprpriority','angle'].includes(k) || (lang === 'zss' && k === 'ignorehitpause'))).concat([['layerno','layerno'],['under','isAsserted(drawunder)']]);
    // animfreeze seeks stored animelem/time every tick. Capture the live phase before
    // freezing, otherwise an already-running accessory rewinds to its creation frame.
    const holdPhase = [['id',id],['animelem',`explodVar(${id}, 0, animelem)`],['animelemtime',`explodVar(${id}, 0, animelemtime)`]];
    if (lang === 'zss') {
      const fields = rows=>rows.map(([k,v])=>`${k}: ${v};`).join(' ');
      stateCode = [header,`ignorehitpause if !isHelper {`,`\tif !numExplod(${id}) {explod{${fields(params)}}}`,`\telse {${pause==='never'?'':`if ${freeze} {modifyExplod{${fields(holdPhase)}}}`}modifyExplod{${fields(update)}}}`,'}'].join('\n');
    } else stateCode = [header,...block('create','Explod',`!numExplod(${id})`,params.filter(([k])=>k!=='ignorehitpause')).map(line=>line==='ignorehitpause = 1'?`ignorehitpause = ${pause==='never'?1:pause==='owner'?'isAsserted(animatehitpause)':0}`:line),...(pause==='never'?[]:block('hold live accessory phase','ModifyExplod',`numExplod(${id}) && (${freeze})`,holdPhase).map(line=>line==='ignorehitpause = 1'?`ignorehitpause = ${pause==='owner'?'isAsserted(animatehitpause)':0}`:line)),...block('follow owner','ModifyExplod',`numExplod(${id})`,update).map(line=>line==='ignorehitpause = 1'?`ignorehitpause = ${pause==='never'?1:pause==='owner'?'isAsserted(animatehitpause)':0}`:line)].join('\n');
    const plan=independentForeignPlan(options,layer,actions,options.sprites||[]);
    foreignSummary={policy:plan.policy,bank:plan.bank,mappedStaticCount:plan.mappedStaticCount,timedCount:plan.timed.size,missingCount:plan.missingCount};
    if(plan.policy==='static'||plan.mapping.size||plan.timed.size){
      const staticBank=plan.policy==='static'?plan.bank:null;
      const staticLayer={source:{kind:staticBank!==null?'bank':'mapping',bank:staticBank,mapping:Object.fromEntries(plan.mapping)},label};
      const identity='foreign-static:'+sha16(JSON.stringify({policy:plan.policy,bank:staticBank,mapping:[...plan.mapping].sort(),timed:[...plan.timed].sort()}));
      table=(staticBank!==null||plan.mapping.size)?foreignPoseTable(options.airText,options.sprites||[],staticLayer,options.occupiedActionIds||[],false,identity,true):null;
      if(table)airCode=table.airCode;
      stateCode=require('./costume_explod_foreign').buildIndependentForeignState({lang,header,label,id,flag,plan,table,params,update,freeze,pause,x:placement.x,y:placement.y});
      if(table)warnings.push('Static opponent poses follow authored AIR offsets and known draw fields; interpolated effects and custom shadow/reflection overrides may differ.');
      if(plan.policy==='static'&&plan.missingCount)warnings.push(`${plan.missingCount} opponent-owned pose(s) lack matching approved accessory artwork and hide the layer.`);
    }
  }
  // -4 performs owner-only cache hygiene. +1 remains the sole authority for drawing,
  // after ChangeAnim/AssertSpecial in the current state (including opponent custom states).
  const preStateCode = mode === 'body-pose'
    ? lang === 'zss'
      ? `# Owner-only absent-Explod cache hygiene; +1 selects the final displayed pose.\n[StateDef -4]\nignorehitpause if !isHelper && !numExplod(${id}) {map(${flag}_foreign) := 0;}\n`
      : `; Owner-only absent-Explod cache hygiene; +1 selects the final displayed pose.\n[Statedef -4]\n[State -4, ${label}: initialize absent pose cache]\ntype = MapSet\ntrigger1 = !IsHelper && !NumExplod(${id})\nmap = "${flag}_foreign"\nvalue = 0\nignorehitpause = 1\n`
    : '';
  const postStateCode = stateCode;
  stateCode = postStateCode;
  return { airCode, airReplacements:table?.airReplacements||[], stateCode, preStateCode, postStateCode, actions:[], summary:{stateHeaders:preStateCode?['[StateDef -4]',header]:[header],runtimeMode:mode,source:mode==='body-pose'?layerSource(layer).key:'animation',label,created:table?.status==='created'?1:0,updated:table?.status==='updated'?1:0,reused:table?.status==='reused'?1:0,skipped:[],scope:'all',mappingEntries:mode==='body-pose'?layerSource(layer).mapping.size:0,missingLayerSpriteCount:0,missingLayerSprites:[],foreignPoseAction:table?{action:table.action,poses:table.poses,ranges:table.ranges.length,signatures:table.signatures?.length||0,status:table.status}:null,foreignPose:foreignSummary,explodId:id,language:lang,statePhase:'post',statedef:'+1',stateHeader:header,explodClock:mode==='body-pose'?'frozen':'follow',gateMap:flag,gateRanges:table?.ranges.length||0,gateExpressions:0,runtimeAction:action,runtimePause:pause,runtimeVisibility:visibility,runtimeVisibilityPolicy:mode==='body-pose'?'owner':(options.runtimeVisibilityPolicy ?? layer.runtimeVisibilityPolicy ?? 'owner'),runtimeRendering:placement.independent?'independent':'grouped',runtimePriority:placement.runtimePriority,syncLayer:placement.syncLayer,pos:[placement.x,placement.y],warnings,requires:'IKEMEN GO 1.0 or newer with ikemenversion in the character DEF'} };
}

module.exports = { BANK_GROUP_STEP, MARKER_VERSION, COSTUME_STATE_NUMBER, COSTUME_POST_STATE, COSTUME_STATE_PHASES, GATE_TERMS, buildLayerAnimations, buildCostumeExplod, airActions };

