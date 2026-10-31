'use strict';

const BOXES = new Set(['Clsn1', 'Clsn2', 'Size', 'Dummy', 'None']);
function box(value, allowNone = false, allowDummy = false) {
  const result = String(value || 'Clsn2');
  if (!BOXES.has(result) || (!allowNone && result === 'None')) throw new Error('Collision type must be Clsn1, Clsn2, Size' + (allowDummy ? ', or Dummy' : '') + (allowNone ? ', or None.' : '.'));
  if (result === 'Dummy' && !allowDummy) throw new Error('Dummy collision requires the project Nightly engine target.');
  return result;
}
function concreteBox(value, options = {}) {
  const result = box(value, options.allowNone === true, options.allowDummy === true);
  if (options.allowDummy !== true && result === 'Dummy') throw new Error('Dummy collision requires the project Nightly engine target.');
  return result;
}
function integer(value, label) { const result = Number(value); if (!Number.isInteger(result)) throw new Error(label + ' must be a whole number.'); return result; }
function finite(value, label) { const result = Number(value); if (!Number.isFinite(result)) throw new Error(label + ' must be a number.'); return result; }
function attributes(value, label) { const result = String(value || '').trim(); if (!result || /[{};\r\n]/.test(result)) throw new Error(label + ' must be a non-empty attribute expression without braces, semicolons, or new lines.'); return result; }

function generateCollisionCode(kind, options = {}) {
  const key = String(kind || '').toLowerCase();
  if (key === 'animelemcount') { const group = box(options.group); if (group === 'Size') throw new Error('AnimElemVar counts Clsn1 or Clsn2; it has no NumSize parameter.'); return `animElemVar(Num${group})`; }
  if (key === 'clsnvar') { const edge = String(options.edge || 'Back'); if (!['Back', 'Front', 'Top', 'Bottom'].includes(edge)) throw new Error('ClsnVar edge must be Back, Front, Top, or Bottom.'); return `clsnVar(${box(options.group, false, options.allowDummy)}, ${integer(options.index, 'Box index')}, ${edge})`; }
  if (key === 'clsnoverlap') return `clsnOverlap(${concreteBox(options.group, { allowDummy: options.allowDummy })}, ${String(options.player || 'p2, ID')}, ${concreteBox(options.target)})`;
  if (key === 'projclsnoverlap') return `projClsnOverlap(${integer(options.index, 'Projectile list index')}, ${String(options.player || 'p2, ID')}, ${concreteBox(options.target)})`;
  if (key === 'debugclsn') return 'debugMode(ClsnDisplay)';
  if (key === 'isclsnproxy') return 'helperVar(ClsnProxy)';
  if (key === 'p2clsncheck') return `p2clsncheck = ${concreteBox(options.target, { allowDummy: options.allowDummy })}`;
  if (key === 'p2clsnrequire') return `p2clsnrequire = ${box(options.target, true, options.allowDummy)}`;
  if (key === 'hitbyindex' || key === 'nothitbyindex') {
    if (options.allowIndexed !== true) throw new Error('Per-index HitBy and NotHitBy require a verified supporting engine target.');
    const controller = key === 'hitbyindex' ? 'hitBy' : 'notHitBy';
    return `${controller}{attr: ${attributes(options.attributes || 'SCA, AA, AP, AT', 'Hit attributes')}; time: ${integer(options.time ?? 1, 'Duration')}; clsn.group: ${box(options.group, false, options.allowDummy)}; clsn.index: ${integer(options.index, 'Collision index')}}`;
  }
  if (key === 'hitdefcontact' || key === 'modifyhitdefcontact' || key === 'projectilecontact' || key === 'modifyprojectilecontact') {
    const controllers = { hitdefcontact: 'hitDef', modifyhitdefcontact: 'modifyHitDef', projectilecontact: 'projectile', modifyprojectilecontact: 'modifyProjectile' };
    const required = box(options.require || 'None', true, options.allowDummy);
    const fields = [`p2clsncheck: ${concreteBox(options.target || 'Clsn2', { allowDummy: options.allowDummy })}`];
    if (required !== 'None') fields.push(`p2clsnrequire: ${required}`);
    return `${controllers[key]}{${fields.join('; ')}}`;
  }
  if (key === 'reversaldef' || key === 'modifyreversaldef') {
    const controller = key === 'reversaldef' ? 'reversalDef' : 'modifyReversalDef', required = box(options.require || 'None', true, options.allowDummy);
    const fields = [`reversal.attr: ${attributes(options.reversalAttr || 'SCA, AA, AP', 'Reversal attributes')}`, `p2clsncheck: ${concreteBox(options.target || 'Clsn1', { allowDummy: options.allowDummy })}`];
    if (required !== 'None') fields.push(`p2clsnrequire: ${required}`);
    return `${controller}{${fields.join('; ')}}`;
  }
  if (key === 'playerpush') { const team = String(options.affectTeam || 'E'); if (!['E', 'F', 'B'].includes(team)) throw new Error('Affected team must be enemies, allies, or both.'); return `playerPush{value: ${options.value ? 1 : 0}; priority: ${integer(options.priority || 0, 'Push priority')}; affectTeam: ${team}}`; }
  if (key === 'sizepushonly') return 'assertSpecial{flag: SizePushOnly}';
  if (key === 'projtypecollision') return 'assertSpecial{flag: ProjTypeCollision}';
  if (key === 'helpercollision') return `# Helper creation parameters\nclsnProxy: ${options.clsnProxy ? 1 : 0}; ownClsnScale: ${options.ownClsnScale ? 1 : 0}`;
  if (key === 'projectilecollision') return `# Projectile controller parameters\nprojClsnScale: ${finite(options.scaleX ?? 1, 'Projectile X scale')}, ${finite(options.scaleY ?? 1, 'Projectile Y scale')}; projClsnAngle: ${finite(options.angle || 0, 'Projectile collision angle')}`;
  throw new Error('Unknown collision bridge item.');
}

module.exports = { generateCollisionCode };
