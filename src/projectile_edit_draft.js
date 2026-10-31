'use strict';

const crypto = require('crypto');
const { hash } = require('./mutation_safety');
const { lineSlice, MAX_CONTROLLER_BYTES, MAX_EXPRESSION_BYTES } = require('./projectile_property_projection');
const { properties } = require('./explod_edit_draft');

const TARGETS = Object.freeze({
  projanim: Object.freeze(['projanim']),
  projhitanim: Object.freeze(['projhitanim']),
  projremanim: Object.freeze(['projremanim']),
  projcancelanim: Object.freeze(['projcancelanim']),
  postype: Object.freeze(['postype']),
  offset: Object.freeze(['offset']),
  velocity: Object.freeze(['velocity']),
  remvelocity: Object.freeze(['remvelocity']),
  accel: Object.freeze(['accel']),
  velmul: Object.freeze(['velmul']),
  projremovetime: Object.freeze(['projremovetime']),
  projremove: Object.freeze(['projremove']),
  projhits: Object.freeze(['projhits']),
  projmisstime: Object.freeze(['projmisstime']),
  projpriority: Object.freeze(['projpriority']),
  projscale: Object.freeze(['projscale']),
  projsprpriority: Object.freeze(['projsprpriority']),
  projangle: Object.freeze(['projangle']),
  projlayerno: Object.freeze(['projlayerno']),
  projedgebound: Object.freeze(['projedgebound']),
  projstagebound: Object.freeze(['projstagebound']),
  projheightbound: Object.freeze(['projheightbound']),
  projshadow: Object.freeze(['projshadow']),
  supermovetime: Object.freeze(['supermovetime']),
  pausemovetime: Object.freeze(['pausemovetime']),
  ownpal: Object.freeze(['ownpal']),
  remappal: Object.freeze(['remappal']),
  'afterimage.time': Object.freeze(['afterimage.time']),
  damage: Object.freeze(['damage']),
  pausetime: Object.freeze(['pausetime']),
  'guard.pausetime': Object.freeze(['guard.pausetime']),
  'ground.slidetime': Object.freeze(['ground.slidetime']),
  'ground.hittime': Object.freeze(['ground.hittime']),
  'guard.slidetime': Object.freeze(['guard.slidetime']),
  'guard.hittime': Object.freeze(['guard.hittime']),
  'air.hittime': Object.freeze(['air.hittime']),
  'ground.velocity': Object.freeze(['ground.velocity']),
  'guard.velocity': Object.freeze(['guard.velocity']),
  'air.velocity': Object.freeze(['air.velocity']),
  yaccel: Object.freeze(['yaccel']),
  'guard.ctrltime': Object.freeze(['guard.ctrltime']),
  'airguard.ctrltime': Object.freeze(['airguard.ctrltime']),
  'air.juggle': Object.freeze(['air.juggle']),
  numhits: Object.freeze(['numhits']),
  'airguard.velocity': Object.freeze(['airguard.velocity']),
  'ground.cornerpush.veloff': Object.freeze(['ground.cornerpush.veloff']),
  'air.cornerpush.veloff': Object.freeze(['air.cornerpush.veloff']),
  'down.cornerpush.veloff': Object.freeze(['down.cornerpush.veloff']),
  'guard.cornerpush.veloff': Object.freeze(['guard.cornerpush.veloff']),
  'airguard.cornerpush.veloff': Object.freeze(['airguard.cornerpush.veloff']),
  hitonce: Object.freeze(['hitonce']),
  kill: Object.freeze(['kill']),
  'guard.kill': Object.freeze(['guard.kill']),
  'fall.kill': Object.freeze(['fall.kill']),
  fall: Object.freeze(['fall']),
  'air.fall': Object.freeze(['air.fall']),
  forcenofall: Object.freeze(['forcenofall']),
  'fall.recover': Object.freeze(['fall.recover']),
  'down.bounce': Object.freeze(['down.bounce']),
  'fall.xvelocity': Object.freeze(['fall.xvelocity']),
  'fall.yvelocity': Object.freeze(['fall.yvelocity']),
  'down.velocity': Object.freeze(['down.velocity']),
  'fall.recovertime': Object.freeze(['fall.recovertime']),
  'fall.damage': Object.freeze(['fall.damage']),
  'down.hittime': Object.freeze(['down.hittime']),
  mindist: Object.freeze(['mindist']),
  maxdist: Object.freeze(['maxdist']),
  snap: Object.freeze(['snap']),
  p1sprpriority: Object.freeze(['p1sprpriority']),
  p2sprpriority: Object.freeze(['p2sprpriority']),
  p1stateno: Object.freeze(['p1stateno']),
  p2stateno: Object.freeze(['p2stateno']),
  p1facing: Object.freeze(['p1facing']),
  p1getp2facing: Object.freeze(['p1getp2facing']),
  p2facing: Object.freeze(['p2facing']),
  p2getp1state: Object.freeze(['p2getp1state']),
  forcestand: Object.freeze(['forcestand']),
  attr: Object.freeze(['attr']),
  hitflag: Object.freeze(['hitflag']),
  guardflag: Object.freeze(['guardflag']),
  affectteam: Object.freeze(['affectteam']),
  animtype: Object.freeze(['animtype']),
  'air.animtype': Object.freeze(['air.animtype']),
  'fall.animtype': Object.freeze(['fall.animtype']),
  'ground.type': Object.freeze(['ground.type']),
  'air.type': Object.freeze(['air.type']),
  priority: Object.freeze(['priority']),
  id: Object.freeze(['id']),
  chainid: Object.freeze(['chainid']),
  nochainid: Object.freeze(['nochainid']),
  getpower: Object.freeze(['getpower']),
  givepower: Object.freeze(['givepower']),
  sparkno: Object.freeze(['sparkno']),
  'guard.sparkno': Object.freeze(['guard.sparkno']),
  sparkxy: Object.freeze(['sparkxy']),
  hitsound: Object.freeze(['hitsound']),
  guardsound: Object.freeze(['guardsound'])
});
const POSTYPES = new Set(['p1', 'p2', 'front', 'back', 'left', 'right']);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function simpleNumber(value) {
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) && Number.isFinite(Number(value));
}

function validValue(target, value) {
  const text = String(value ?? '').trim();
  if (!text || /[\r\n;{}]/.test(text) || Buffer.byteLength(text, 'utf8') > MAX_EXPRESSION_BYTES) return false;
  if (['projanim', 'projhitanim', 'projremanim', 'projcancelanim', 'projremovetime', 'projremove', 'projhits', 'projmisstime', 'projpriority', 'projsprpriority', 'projedgebound', 'projstagebound', 'projshadow', 'supermovetime', 'pausemovetime', 'ownpal', 'afterimage.time', 'ground.slidetime', 'ground.hittime', 'guard.slidetime', 'guard.hittime', 'air.hittime', 'guard.ctrltime', 'airguard.ctrltime', 'air.juggle', 'numhits', 'hitonce', 'kill', 'guard.kill', 'fall.kill', 'fall', 'air.fall', 'forcenofall', 'fall.recover', 'down.bounce', 'fall.recovertime', 'fall.damage', 'down.hittime', 'p1sprpriority', 'p2sprpriority', 'p1stateno', 'p2stateno', 'p1facing', 'p1getp2facing', 'p2facing', 'p2getp1state', 'forcestand'].includes(target)) return /^[+-]?\d+$/.test(text) && Number.isSafeInteger(Number(text));
  if (target === 'projangle') return simpleNumber(text) && Number.isFinite(Number(text));
  if (target === 'projlayerno') return /^(?:-1|0|1)$/.test(text);
  if (target === 'postype') return POSTYPES.has(text.toLowerCase());
  if (target === 'attr') return /^[SCA]\s*,\s*[NSH][ATP]$/i.test(text);
  if (target === 'affectteam') return /^[BEF]$/i.test(text);
  if (target === 'hitflag') {
    if (!/^[HLAMFD]+[+-]?$/i.test(text) || !/[HLAM]/i.test(text)) return false;
    const flags = text.replace(/[+-]$/, '').toUpperCase();
    return new Set(flags).size === flags.length;
  }
  if (target === 'guardflag') {
    if (!/^[HLAM]+$/i.test(text)) return false;
    const flags = text.toUpperCase();
    return new Set(flags).size === flags.length;
  }
  if (['animtype', 'air.animtype', 'fall.animtype'].includes(target)) return /^(?:light|medium|hard|back|up|diagup)$/i.test(text);
  if (['ground.type', 'air.type'].includes(target)) return /^(?:high|low|trip|none)$/i.test(text);
  if (target === 'priority') return /^(?:[1-7])(?:\s*,\s*(?:hit|miss|dodge))?$/i.test(text);
  if (target === 'id') return /^\+?\d+$/.test(text) && Number.isSafeInteger(Number(text)) && Number(text) > 0;
  if (target === 'chainid') return /^(?:-1|\+?[1-9]\d*)$/.test(text) && Number.isSafeInteger(Number(text));
  if (target === 'nochainid') {
    const ids = text.split(',').map(item => item.trim());
    return ids.length >= 1 && ids.length <= 2 && ids.every(item => /^(?:-1|\+?[1-9]\d*)$/.test(item) && Number.isSafeInteger(Number(item)));
  }
  if (['sparkno', 'guard.sparkno'].includes(target)) {
    const numeric = text.replace(/^s/i, '');
    return /^(?:s)?[+-]?\d+$/i.test(text) && Number.isSafeInteger(Number(numeric));
  }
  if (['hitsound', 'guardsound'].includes(target)) {
    const sound = text.split(',').map(item => item.trim());
    if (sound.length !== 2 || !/^(?:s)?[+-]?\d+$/i.test(sound[0]) || !/^[+-]?\d+$/.test(sound[1])) return false;
    return Number.isSafeInteger(Number(sound[0].replace(/^s/i, ''))) && Number.isSafeInteger(Number(sound[1]));
  }
  const parts = text.split(',').map(item => item.trim());
  if (['getpower', 'givepower'].includes(target)) return (parts.length === 1 || parts.length === 2) && parts.every(item => /^[+-]?\d+$/.test(item) && Number.isSafeInteger(Number(item)));
  if (['projheightbound', 'remappal', 'damage', 'pausetime', 'guard.pausetime', 'sparkxy'].includes(target)) return parts.length === 2 && parts.every(item => /^[+-]?\d+$/.test(item) && Number.isSafeInteger(Number(item)));
  if (target === 'ground.velocity') return (parts.length === 1 || parts.length === 2) && parts.every(simpleNumber);
  if (['guard.velocity', 'yaccel', 'ground.cornerpush.veloff', 'air.cornerpush.veloff', 'down.cornerpush.veloff', 'guard.cornerpush.veloff', 'airguard.cornerpush.veloff', 'fall.xvelocity', 'fall.yvelocity'].includes(target)) return parts.length === 1 && simpleNumber(parts[0]);
  if (['air.velocity', 'airguard.velocity', 'down.velocity', 'mindist', 'maxdist', 'snap'].includes(target)) return parts.length === 2 && parts.every(simpleNumber);
  return parts.length === 2 && parts.every(simpleNumber);
}

function fieldModel(target, found) {
  if (!found.length) return { target, editable: false, status: 'omitted', reason: 'This property is not authored; this slice never inserts or reorders fields.' };
  if (found.length !== 1) return { target, editable: false, status: 'duplicate', reason: 'Multiple matching properties are authored; resolve them in source first.' };
  const property = found[0], editable = validValue(target, property.expression);
  return {
    target,
    editable,
    status: editable ? 'ready' : 'dynamic',
    authoredName: property.authoredName,
    expression: property.expression,
    start: property.start,
    end: property.end,
    reason: editable ? '' : 'The authored expression is dynamic or outside the conservative literal grammar.'
  };
}

function createProjectileEditDraft(component, sourceText) {
  const text = String(sourceText ?? '');
  const bounds = lineSlice(text, Number(component?.startLine), Number(component?.endLine));
  if (component?.kind !== 'projectile' || !bounds || !['cns', 'zss'].includes(component.syntax) || hash(text) !== component.sourceHash || bounds.text !== component.sourceText || hash(bounds.text) !== component.rangeHash || Buffer.byteLength(bounds.text, 'utf8') > MAX_CONTROLLER_BYTES) return null;
  const parsed = properties(bounds.text, component.syntax, bounds.start);
  const fields = Object.entries(TARGETS).map(([target, names]) => fieldModel(target, parsed.filter(item => names.includes(item.name))));
  const draftId = hash(JSON.stringify([component.filename, component.sourceHash, component.rangeHash, bounds.start, bounds.end, component.syntax, fields.map(item => [item.target, item.status, item.authoredName, item.expression, item.start, item.end])]));
  return deepFreeze({ schema: 'ikemaker.projectile-edit-draft', version: 1, draftId, filename: component.filename, syntax: component.syntax, sourceHash: component.sourceHash, controllerHash: component.rangeHash, startIndex: bounds.start, endIndex: bounds.end, before: bounds.text, fields });
}

function previewProjectileEdit(draft, sourceText, values = {}) {
  const text = String(sourceText ?? '');
  if (draft?.schema !== 'ikemaker.projectile-edit-draft' || draft.version !== 1 || hash(text) !== draft.sourceHash || hash(text.slice(draft.startIndex, draft.endIndex)) !== draft.controllerHash) return null;
  const allowed = new Set(draft.fields.map(item => item.target));
  if (Object.keys(values || {}).some(key => !allowed.has(key))) return null;
  const replacements = [];
  for (const field of draft.fields) {
    if (!Object.prototype.hasOwnProperty.call(values, field.target)) continue;
    const next = String(values[field.target] ?? '').trim();
    if (!field.editable || !validValue(field.target, next)) return null;
    if (['ground.velocity', 'priority', 'nochainid', 'getpower', 'givepower'].includes(field.target) && next.split(',').length !== field.expression.split(',').length) return null;
    if (next !== field.expression) replacements.push({ target: field.target, authoredName: field.authoredName, start: field.start, end: field.end, before: field.expression, after: next });
  }
  if (!replacements.length) return deepFreeze({ status: 'no-op', draftId: draft.draftId, replacements: [], before: draft.before, after: draft.before });
  let sourceAfter = text;
  for (const replacement of [...replacements].sort((a, b) => b.start - a.start)) sourceAfter = sourceAfter.slice(0, replacement.start) + replacement.after + sourceAfter.slice(replacement.end);
  const delta = replacements.reduce((sum, item) => sum + item.after.length - (item.end - item.start), 0);
  const controllerAfter = sourceAfter.slice(draft.startIndex, draft.endIndex + delta);
  return deepFreeze({
    schema: 'ikemaker.projectile-edit-preview',
    version: 1,
    status: 'ready',
    draftId: draft.draftId,
    previewId: crypto.createHash('sha256').update(JSON.stringify([draft.draftId, replacements, hash(sourceAfter)])).digest('hex'),
    sourceHash: draft.sourceHash,
    expectedSourceHash: hash(sourceAfter),
    replacements,
    before: draft.before,
    after: controllerAfter,
    sourceAfter
  });
}

module.exports = { TARGETS, POSTYPES, validValue, createProjectileEditDraft, previewProjectileEdit };
