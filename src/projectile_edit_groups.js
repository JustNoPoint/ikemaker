'use strict';

const { TARGETS } = require('./projectile_edit_draft');

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

const GROUPS = freeze([
  { id: 'projectile', label: 'Projectile properties', help: 'Only already-authored conservative literals can change. Omitted, duplicate, dynamic, capability-unresolved, and unknown values remain source-owned.', targets: ['projanim','projhitanim','projremanim','projcancelanim','postype','offset','velocity','remvelocity','accel','velmul','projremovetime','projremove','projhits','projmisstime','projpriority','projscale','projsprpriority','projangle','projlayerno','projedgebound','projstagebound','projheightbound','projshadow','supermovetime','pausemovetime','ownpal','remappal','afterimage.time'] },
  { id: 'pairs', label: 'Embedded contact pairs', help: 'Damage, hit pause, and guard pause each require exactly two authored signed integers. No related value is inferred.', targets: ['damage','pausetime','guard.pausetime'] },
  { id: 'timing', label: 'Embedded contact timing', help: 'Ground, guard, and air timing values require one authored signed integer. Timing relationships and defaults are never inferred.', targets: ['ground.slidetime','ground.hittime','guard.slidetime','guard.hittime','air.hittime'] },
  { id: 'motion', label: 'Embedded contact motion', help: 'Only classic one- or two-axis numeric forms are eligible. Existing arity is preserved; no missing axis or 3D value is inferred.', targets: ['ground.velocity','guard.velocity','air.velocity','yaccel'] },
  { id: 'control', label: 'Embedded contact control', help: 'Control, juggle, and hit-count values require one authored signed integer. Their relationships and defaults are never inferred.', targets: ['guard.ctrltime','airguard.ctrltime','air.juggle','numhits'] },
  { id: 'push', label: 'Embedded contact push', help: 'Air-guard velocity requires two authored numbers; each corner-push offset requires one. No axis, coupling, or default is inferred.', targets: ['airguard.velocity','ground.cornerpush.veloff','air.cornerpush.veloff','down.cornerpush.veloff','guard.cornerpush.veloff','airguard.cornerpush.veloff'] },
  { id: 'outcome', label: 'Embedded contact outcome', help: 'Authored kill, fall, recovery, bounce, and hit-once integers are preserved exactly. They are not normalized to Boolean values or cross-validated.', targets: ['hitonce','kill','guard.kill','fall.kill','fall','air.fall','forcenofall','fall.recover','down.bounce'] },
  { id: 'response', label: 'Embedded fall/down response', help: 'Classic fall velocities, down velocity, recovery time, damage, and down time preserve their authored scalar/pair shapes. No axis or response relationship is inferred.', targets: ['fall.xvelocity','fall.yvelocity','down.velocity','fall.recovertime','fall.damage','down.hittime'] },
  { id: 'position', label: 'Embedded position/state', help: 'Authored distance/snap pairs and state/priority integers are preserved exactly. No missing axis, state existence, or relationship is inferred.', targets: ['mindist','maxdist','snap','p1sprpriority','p2sprpriority','p1stateno','p2stateno'] },
  { id: 'policy', label: 'Embedded facing/state policy', help: 'Authored facing, stand, and state-transfer integers are preserved exactly. No Boolean normalization, ownership inference, or relationship is applied.', targets: ['p1facing','p1getp2facing','p2facing','p2getp1state','forcestand'] },
  { id: 'classification', label: 'Embedded attack classification', help: 'Authored attack type, hit, guard, and affected-team flags keep their exact casing and order. Expressions, unknown flags, and inferred defaults remain source-owned.', targets: ['attr','hitflag','guardflag','affectteam'] },
  { id: 'reaction', label: 'Embedded hit reaction types', help: 'Authored hit animation and ground/air reaction types keep their exact casing. No defaults, inheritance, fall behavior, or velocity are inferred.', targets: ['animtype','air.animtype','fall.animtype','ground.type','air.type'] },
  { id: 'chaining', label: 'Embedded priority/chaining', help: 'Authored hit priority and chaining IDs preserve their tuple shape and enum casing. Referenced IDs are not resolved or cross-validated.', targets: ['priority','id','chainid','nochainid'] },
  { id: 'power', label: 'Embedded power transfer', help: 'Authored power gain and award values preserve their one- or two-value shape. Damage, guard values, caps, and relationships are not inferred.', targets: ['getpower','givepower'] },
  { id: 'presentation', label: 'Embedded hit presentation', help: 'Authored spark and sound literals preserve their optional S prefix and exact source shape. Resource existence, archive ownership, defaults, and viewer handoffs are not inferred.', targets: ['sparkno','guard.sparkno','sparkxy','hitsound','guardsound'] }
]);

const GROUP_BY_TARGET = new Map();
for (const group of GROUPS) for (const target of group.targets) {
  if (GROUP_BY_TARGET.has(target)) throw new Error(`Duplicate Projectile edit group target: ${target}`);
  GROUP_BY_TARGET.set(target, group.id);
}
const vocabulary = Object.keys(TARGETS);
if (vocabulary.some(target => !GROUP_BY_TARGET.has(target)) || [...GROUP_BY_TARGET].some(([target]) => !Object.prototype.hasOwnProperty.call(TARGETS, target))) throw new Error('Projectile edit groups must exactly cover the guarded edit vocabulary.');

function groupIdForTarget(target) { return GROUP_BY_TARGET.get(String(target || '')) || ''; }

function projectAuthoredGroups(fields, preview = null) {
  const source = Array.isArray(fields) ? fields : [], byTarget = new Map(source.map(field => [field.target, field]));
  const changed = new Set((preview?.replacements || []).map(item => item.target));
  const groups = [];
  for (const definition of GROUPS) {
    const all = definition.targets.map(target => byTarget.get(target)).filter(Boolean);
    const authored = all.filter(field => field.status !== 'omitted');
    if (!authored.length) continue;
    groups.push({
      id: definition.id,
      label: definition.label,
      help: definition.help,
      fields: authored,
      authoredCount: authored.length,
      editableCount: authored.filter(field => field.editable).length,
      omittedCount: Math.max(0, definition.targets.length - authored.length),
      hasPreview: authored.some(field => changed.has(field.target))
    });
  }
  return freeze(groups);
}

module.exports = { GROUPS, GROUP_BY_TARGET, groupIdForTarget, projectAuthoredGroups };
