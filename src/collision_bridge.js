'use strict';

const BOXES = new Set(['Clsn1', 'Clsn2', 'Size', 'None']);
function box(value, allowNone = false) { const result = String(value || 'Clsn2'); if (!BOXES.has(result) || (!allowNone && result === 'None')) throw new Error('Collision type must be Clsn1, Clsn2, Size' + (allowNone ? ', or None.' : '.')); return result; }
function integer(value, label) { const result = Number(value); if (!Number.isInteger(result)) throw new Error(label + ' must be a whole number.'); return result; }
function finite(value, label) { const result = Number(value); if (!Number.isFinite(result)) throw new Error(label + ' must be a number.'); return result; }

function generateCollisionCode(kind, options = {}) {
  const key = String(kind || '').toLowerCase();
  if (key === 'animelemcount') { const group = box(options.group); if (group === 'Size') throw new Error('AnimElemVar counts Clsn1 or Clsn2; it has no NumSize parameter.'); return `animElemVar(Num${group})`; }
  if (key === 'clsnvar') { const edge = String(options.edge || 'Back'); if (!['Back', 'Front', 'Top', 'Bottom'].includes(edge)) throw new Error('ClsnVar edge must be Back, Front, Top, or Bottom.'); return `clsnVar(${box(options.group)}, ${integer(options.index, 'Box index')}, ${edge})`; }
  if (key === 'clsnoverlap') return `clsnOverlap(${box(options.group)}, ${String(options.player || 'p2, ID')}, ${box(options.target)})`;
  if (key === 'projclsnoverlap') return `projClsnOverlap(${integer(options.index, 'Projectile index')}, ${String(options.player || 'p2, ID')}, ${box(options.target)})`;
  if (key === 'debugclsn') return 'debugMode(ClsnDisplay)';
  if (key === 'isclsnproxy') return 'isClsnProxy';
  if (key === 'p2clsncheck') return `p2clsncheck = ${box(options.target, true)}`;
  if (key === 'p2clsnrequire') return `p2clsnrequire = ${box(options.target, true)}`;
  if (key === 'playerpush') { const team = String(options.affectTeam || 'E'); if (!['E', 'F', 'B'].includes(team)) throw new Error('Affected team must be enemies, allies, or both.'); return `playerPush{value: ${options.value ? 1 : 0}; priority: ${integer(options.priority || 0, 'Push priority')}; affectTeam: ${team}}`; }
  if (key === 'sizepushonly') return 'assertSpecial{flag: SizePushOnly}';
  if (key === 'projtypecollision') return 'assertSpecial{flag: ProjTypeCollision}';
  if (key === 'helpercollision') return `# Helper creation parameters\nclsnProxy: ${options.clsnProxy ? 1 : 0}; ownClsnScale: ${options.ownClsnScale ? 1 : 0}`;
  if (key === 'projectilecollision') return `# Projectile controller parameters\nprojClsnScale: ${finite(options.scaleX ?? 1, 'Projectile X scale')}, ${finite(options.scaleY ?? 1, 'Projectile Y scale')}; projClsnAngle: ${finite(options.angle || 0, 'Projectile collision angle')}`;
  throw new Error('Unknown collision bridge item.');
}

module.exports = { generateCollisionCode };
