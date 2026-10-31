'use strict';

const assert = require('assert');
const { parseProjectileCollisionOverlapReferences } = require('../src/projectile_collision_overlap_reference_authority');

const zss = '[StateDef 200; anim: 200]\r\nlet a=ProjClsnOverlap(0, ID, Clsn1); let b=projclsnoverlap(root, var(0), helper(1, root, ID), ID, Size);\r\n# ProjClsnOverlap(1,2,Clsn2)\r\nlet s="ProjClsnOverlap(1,2,Clsn2)";\r\n';
const rows = parseProjectileCollisionOverlapReferences(zss, 'zss');
assert.strictEqual(rows.length, 2);
assert.deepStrictEqual(rows.map(item => [item.projectileExpression, item.playerExpression, item.targetGroup, item.projectileIndexStatic, item.controllerLine]), [
  ['0', 'ID', 'clsn1', true, 1],
  ['root, var(0)', 'helper(1, root, ID), ID', 'size', false, 1]
]);
assert.strictEqual(zss.slice(rows[1].callStart, rows[1].callEnd), 'projclsnoverlap(root, var(0), helper(1, root, ID), ID, Size)');
assert.deepStrictEqual(rows[1].fields.map(item => zss.slice(item.start, item.end)), ['root, var(0)', 'helper(1, root, ID), ID', 'Size']);
assert(rows.every(item => item.available && item.dynamic && item.conditional && Object.isFrozen(item)));

const cns = '[StateDef 200]\nanim=200\n[State 200,q]\ntype=Null\ntrigger1=ProjClsnOverlap(-2, playerid(root, ID), var(1), Clsn2)\ntrigger2=root, ProjClsnOverlap(max(0,var(1)), 7, Size)\n';
const cnsRows = parseProjectileCollisionOverlapReferences(cns, 'cns');
assert.deepStrictEqual(cnsRows.map(item => [item.available, item.redirect, item.projectileIndexStatic, item.projectileIndexNegative, item.playerIdStatic]), [[true, false, false, true, false], [false, true, false, false, true]]);
assert.strictEqual(cnsRows[0].playerExpression, 'playerid(root, ID), var(1)');

for (const target of ['Clsn1', 'Clsn2', 'Size']) assert(parseProjectileCollisionOverlapReferences(`ProjClsnOverlap(1, 2, ${target})`, 'zss')[0].available);
for (const redirect of ['root', 'parent', 'p2', 'stateowner', 'helper', 'target', 'playerid(4)', 'helper(1,0)', 'root, helper(1)']) {
  const item = parseProjectileCollisionOverlapReferences(`${redirect}, ProjClsnOverlap(1, 2, Clsn1)`, 'zss')[0];
  assert(item.redirect && !item.available, redirect);
}

const nested = parseProjectileCollisionOverlapReferences('ProjClsnOverlap(ifelse(1,max(2,3),4), target(1, root, ID), ID, Clsn2)', 'zss')[0];
assert(nested.available);
assert.strictEqual(nested.projectileExpression, 'ifelse(1,max(2,3),4)');
assert.strictEqual(nested.playerExpression, 'target(1, root, ID), ID');

const malformed = [
  'ProjClsnOverlap(1, Clsn1)',
  'ProjClsnOverlap(1, 2, Dummy)',
  'ProjClsnOverlap(1, 2, Unknown)',
  'ProjClsnOverlap(1, foo, bar, Clsn1)',
  'ProjClsnOverlap(, 2, Clsn1)',
  'ProjClsnOverlap(1, , Clsn1)',
  'ProjClsnOverlap(1, 2, Clsn1, extra)',
  'ProjClsnOverlap(1, 2, Clsn1'
].join('\n');
const malformedRows = parseProjectileCollisionOverlapReferences(malformed, 'zss');
assert.strictEqual(malformedRows.length, 7, 'balanced malformed calls stay navigable; incomplete calls are excluded');
assert(malformedRows.every(item => !item.available && item.sourceExact));
assert.match(malformedRows[1].reason, /Dummy is not valid/i);

const falseNames = 'function ProjClsnOverlap(a,b,c) {}\nmyProjClsnOverlap(1,2,Clsn1)\nthing.ProjClsnOverlap(1,2,Clsn1)\n';
assert.deepStrictEqual(parseProjectileCollisionOverlapReferences(falseNames, 'zss'), []);

console.log('projectile collision overlap reference authority tests passed');
