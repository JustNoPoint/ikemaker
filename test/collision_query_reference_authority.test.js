'use strict';

const assert = require('assert');
const { parseCollisionQueryReferences } = require('../src/collision_query_reference_authority');

const zss = '[StateDef 200; anim: 200]\r\nlet a = ClsnVar(Clsn1, max(0, map(Box)), Front); let b = clsNVar(Dummy, -1, Back);\r\n# ClsnVar(Clsn2, 0, Top)\r\nlet s = "ClsnVar(Size, 0, Bottom)";\r\n';
const records = parseCollisionQueryReferences(zss, 'zss');
assert.strictEqual(records.length, 2);
assert.deepStrictEqual(records.map(item => [item.queryGroup, item.queryEdge, item.indexStatic, item.controllerLine]), [['clsn1', 'front', false, 1], ['dummy', 'back', false, 1]]);
assert.strictEqual(zss.slice(records[0].callStart, records[0].callEnd), 'ClsnVar(Clsn1, max(0, map(Box)), Front)');
assert.deepStrictEqual(records[0].fields.map(item => zss.slice(item.start, item.end)), ['Clsn1', 'max(0, map(Box))', 'Front']);
assert(records.every(Object.isFrozen));

const cns = '[StateDef 210]\nanim = 200\n[State 210, inspect]\ntype = Null\ntrigger1 = ClsnVar(Size, 0, Bottom) > 1\ntrigger2 = root, ClsnVar(Clsn2, 2, Top) > 0\n';
const cnsRecords = parseCollisionQueryReferences(cns, 'cns');
assert.deepStrictEqual(cnsRecords.map(item => [item.available, item.redirect, item.indexStatic, item.queryGroup]), [[true, false, true, 'size'], [false, true, true, 'clsn2']]);

const malformed = 'ClsnVar(Clsn1, 0)\nClsnVar(Unknown, 0, Top)\nClsnVar(Clsn2, 0, Side)\nClsnVar(Clsn1, 0, Top, extra)\nClsnVar(Clsn1, 0, Top\n';
const malformedRecords = parseCollisionQueryReferences(malformed, 'zss');
assert.strictEqual(malformedRecords.length, 4, 'balanced malformed calls remain navigable; incomplete calls are excluded');
assert(malformedRecords.every(item => !item.available && item.sourceExact));
assert.match(malformedRecords[0].reason, /requires a group/);
assert.match(malformedRecords[1].reason, /group must/);
assert.match(malformedRecords[2].reason, /edge must/);
assert.match(malformedRecords[3].reason, /requires a group/);

const falseNames = 'function ClsnVar(a, b, c) {}\nmyClsnVar(Clsn1, 0, Top)\nthing.ClsnVar(Clsn1, 0, Top)\n';
assert.deepStrictEqual(parseCollisionQueryReferences(falseNames, 'zss'), []);

const everyEdge = parseCollisionQueryReferences('ClsnVar(Clsn1,0,Back);ClsnVar(Clsn1,1,Top);ClsnVar(Clsn2,2,Front);ClsnVar(Size,3,Bottom)', 'zss');
assert.deepStrictEqual(everyEdge.map(item => item.queryEdge), ['back', 'top', 'front', 'bottom']);
assert(everyEdge.every(item => item.available && item.indexStatic));

const redirects = ['root', 'parent', 'p2', 'stateowner', 'partner', 'enemy', 'enemynear', 'helper', 'target', 'partner(0)', 'enemy(0)', 'enemynear(0)', 'playerid(10)', 'player(1)', 'playerindex(0)', 'helperindex(0)', 'helper(1)', 'helper(1, 0)', 'target(2)', 'target(2, 1)', 'root, helper(1)'];
for (const redirect of redirects) {
  const item = parseCollisionQueryReferences(`${redirect}, ClsnVar(Clsn1, 0, Back)`, 'zss')[0];
  assert(item.redirect && !item.available, `official redirect ${redirect} remains unresolved`);
}
const ordinaryArgument = parseCollisionQueryReferences('ifelse(1, ClsnVar(Clsn1, 0, Back), 0)', 'zss')[0];
assert.strictEqual(ordinaryArgument.redirect, false, 'an ordinary function-argument comma is not a redirect');
assert.strictEqual(ordinaryArgument.available, true);

const redirectedIndex = parseCollisionQueryReferences('ClsnVar(Clsn1, root, helper(1), var(0), Back)', 'zss')[0];
assert(redirectedIndex.available && redirectedIndex.dynamic);
assert.strictEqual(redirectedIndex.fields.find(item => item.key === 'index').expression, 'root, helper(1), var(0)');
const nestedRedirectIndex = parseCollisionQueryReferences('ClsnVar(Clsn1, playerid(root, ID), var(0), Back)', 'zss')[0];
assert(nestedRedirectIndex.available);
assert.strictEqual(nestedRedirectIndex.fields.find(item => item.key === 'index').expression, 'playerid(root, ID), var(0)');
for (const invalid of ['ClsnVar(Clsn1, root, Back)', 'ClsnVar(Clsn1, helper(1), Back)', 'ClsnVar(Clsn1, root + 1, Back)', 'ClsnVar(Clsn1, foo, bar, Back)']) {
  const item = parseCollisionQueryReferences(invalid, 'zss')[0];
  assert(item && !item.available, invalid);
}
for (const invalid of ['ClsnVar(Clsn1, playerid(1, 2), var(0), Back)', 'ClsnVar(Clsn1, helper(1, 2, 3), var(0), Back)']) assert(!parseCollisionQueryReferences(invalid, 'zss')[0].available, invalid);

console.log('collision query reference authority tests passed');
