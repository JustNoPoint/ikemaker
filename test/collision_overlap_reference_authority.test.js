'use strict';

const assert = require('assert');
const { completeRedirectToken, parseCollisionOverlapReferences } = require('../src/collision_overlap_reference_authority');

const zss = '[StateDef 200; anim: 200]\r\nlet a = ClsnOverlap(Clsn1, max(0, playerid), Clsn2); let b = clsnoverlap(Dummy, root, ID, Size);\r\n# ClsnOverlap(Size, 1, Clsn1)\r\nlet s = "ClsnOverlap(Clsn1, 2, Clsn2)";\r\n';
const records = parseCollisionOverlapReferences(zss, 'zss');
assert.strictEqual(records.length, 2);
assert.deepStrictEqual(records.map(item => [item.ownerGroup, item.targetGroup, item.playerIdStatic, item.innerRedirect, item.controllerLine]), [
  ['clsn1', 'clsn2', false, false, 1],
  ['dummy', 'size', false, true, 1]
]);
assert.strictEqual(zss.slice(records[0].callStart, records[0].callEnd), 'ClsnOverlap(Clsn1, max(0, playerid), Clsn2)');
assert.deepStrictEqual(records[1].fields.map(item => zss.slice(item.start, item.end)), ['Dummy', 'root, ID', 'Size']);
assert(records.every(item => item.available && item.conditional && item.dynamic && Object.isFrozen(item)));

const cns = '[StateDef 200]\nanim = 200\n[State 200, inspect]\ntype = Null\ntrigger1 = ClsnOverlap(Size, 12, Clsn1)\ntrigger2 = root, ClsnOverlap(Clsn2, target(3), ID, Size)\n';
const cnsRecords = parseCollisionOverlapReferences(cns, 'cns');
assert.deepStrictEqual(cnsRecords.map(item => [item.available, item.redirect, item.playerIdStatic, item.playerExpression]), [
  [true, false, true, '12'],
  [false, true, false, 'target(3), ID']
]);

const nested = parseCollisionOverlapReferences('ClsnOverlap(Clsn1, ifelse(1, max(2,3), 4), Clsn2)', 'zss')[0];
assert(nested.available);
assert.strictEqual(nested.playerExpression, 'ifelse(1, max(2,3), 4)');

for (const redirect of ['root', 'parent', 'p2', 'stateowner', 'partner', 'enemy', 'enemynear', 'helper', 'target', 'partner(0)', 'enemy(0)', 'enemynear(0)', 'playerid(10)', 'player(1)', 'playerindex(0)', 'helperindex(0)', 'helper(1)', 'helper(1, 0)', 'target(2)', 'target(2, 1)']) {
  assert(completeRedirectToken(redirect), redirect);
  const item = parseCollisionOverlapReferences(`ClsnOverlap(Clsn1, ${redirect}, ID, Clsn2)`, 'zss')[0];
  assert(item.available && item.innerRedirect && !item.redirect, `inner redirect ${redirect} remains part of player ID`);
  const outer = parseCollisionOverlapReferences(`${redirect}, ClsnOverlap(Clsn1, ID, Clsn2)`, 'zss')[0];
  assert(!outer.available && outer.redirect, `outer redirect ${redirect} changes query ownership`);
}
assert(parseCollisionOverlapReferences('ClsnOverlap(Clsn1, root, parent, ID, Clsn2)', 'zss')[0].available);
for (const expression of ['playerid(root, ID), var(0)', 'helper(1, root, ID), var(0)']) assert(parseCollisionOverlapReferences(`ClsnOverlap(Clsn1, ${expression}, Clsn2)`, 'zss')[0].available, expression);
for (const invalid of ['ClsnOverlap(Clsn1, root, Clsn2)', 'ClsnOverlap(Clsn1, helper(1), Clsn2)', 'ClsnOverlap(Clsn1, root + 1, Clsn2)']) {
  const item = parseCollisionOverlapReferences(invalid, 'zss')[0];
  assert(item && !item.available, invalid);
}
for (const invalid of ['ClsnOverlap(Clsn1, playerid(1, 2), var(0), Clsn2)', 'ClsnOverlap(Clsn1, helper(1, 2, 3), var(0), Clsn2)']) assert(!parseCollisionOverlapReferences(invalid, 'zss')[0].available, invalid);

const malformed = [
  'ClsnOverlap(Clsn1, 0)',
  'ClsnOverlap(Nope, 0, Clsn2)',
  'ClsnOverlap(Clsn1, 0, Dummy)',
  'ClsnOverlap(Clsn1, foo, bar, Clsn2)',
  'ClsnOverlap(Clsn1, , Clsn2)',
  'ClsnOverlap(Clsn1, "not numeric", Clsn2)',
  'ClsnOverlap(Clsn1, 0, Clsn2, extra)',
  'ClsnOverlap(Clsn1, 0, Clsn2'
].join('\n');
const malformedRecords = parseCollisionOverlapReferences(malformed, 'zss');
assert.strictEqual(malformedRecords.length, 7, 'balanced malformed calls remain navigable; incomplete calls are excluded');
assert(malformedRecords.every(item => !item.available && item.sourceExact));
assert.match(malformedRecords[2].reason, /Dummy is not valid/i);

const falseNames = 'function ClsnOverlap(a, b, c) {}\nmyClsnOverlap(Clsn1, 0, Clsn2)\nthing.ClsnOverlap(Clsn1, 0, Clsn2)\n';
assert.deepStrictEqual(parseCollisionOverlapReferences(falseNames, 'zss'), []);

for (const owner of ['Clsn1', 'Clsn2', 'Size', 'Dummy']) for (const target of ['Clsn1', 'Clsn2', 'Size']) {
  assert(parseCollisionOverlapReferences(`ClsnOverlap(${owner}, 1, ${target})`, 'cns')[0].available, `${owner}/${target}`);
}

console.log('collision overlap reference authority tests passed');
