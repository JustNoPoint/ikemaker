'use strict';

const assert = require('assert');
const { hash } = require('../src/mutation_safety');
const { buildAirActionUsageSnapshot, validateCollisionSourceAuthority, MAX_USES_TOTAL, MAX_USES_PER_ACTION } = require('../src/air_action_usage_authority');

const defPath = 'C:/chars/Hero/Hero.def', airPath = 'C:/chars/Hero/Hero.air', airText = '[Begin Action 200]\n0,0,0,0,1\n';
function build(text, options = {}) {
  const syntax = options.syntax || (/\[State\s/i.test(text) ? 'cns' : 'zss'), filename = `C:/chars/Hero/query.${syntax}`, source = { available: true, dirty: false, filename, syntax, text, sourceHash: hash(text), version: 3 };
  const collisionCapabilities = options.capabilities || { indexed: true, stringExpressions: true, dummyGroup: true, status: 'supported', fingerprint: 'nightly-query' };
  const context = { defPath, defText: `[Files]\nanim=Hero.air\nst=query.${syntax}\n`, defDirty: false, airPath, airText, assignedSources: [filename], sources: [source], inventoryComplete: true, generation: 7, collisionCapabilities, collisionToken: item => hash(item.occurrenceId).slice(0, 48) };
  return { context, snapshot: buildAirActionUsageSnapshot(context) };
}

const zss = '[StateDef 200; anim: 200]\nlet left = ClsnVar(Clsn1, 0, Back);\nlet body = ClsnVar(Size, map(i), Top);\nlet sensor = ClsnVar(Dummy, 1, Front);\n';
const nightly = build(zss), rows = nightly.snapshot.publicCollisions.items;
assert.deepStrictEqual(rows.map(item => [item.kind, item.category, item.relation, item.relatedActions]), [
  ['clsnvar', 'collision-inspection', 'conditional/dynamic', [200]],
  ['clsnvar', 'collision-inspection', 'conditional/dynamic', []],
  ['clsnvar', 'collision-inspection', 'conditional/dynamic', []]
]);
assert.match(rows[0].reason, /current Action.*not proven/i);
assert.match(rows[1].reason, /whole-character context/i);
assert.match(rows[0].effectiveExplanation, /normalized edge.*effective local collision group/i);
assert.strictEqual(rows[0].fields.find(item => item.key === 'index').compatibility, 'stable');
assert.strictEqual(rows[2].fields.find(item => item.key === 'group').compatibility, 'nightly');
assert.strictEqual(rows[2].compatibility, 'nightly-dummy');
assert(Object.isFrozen(rows[0]) && Object.isFrozen(rows[0].fields));

const stable = build(zss, { capabilities: { indexed: false, stringExpressions: false, dummyGroup: false, status: 'unsupported', fingerprint: 'stable-query' } }).snapshot.publicCollisions.items;
assert.strictEqual(stable[0].relation, 'conditional/dynamic');
assert.strictEqual(stable[0].compatibility, 'stable-1.0');
assert.strictEqual(stable[2].relation, 'unresolved');
assert.strictEqual(stable[2].fields[0].compatibility, 'unsupported-on-stable');
assert.deepStrictEqual(stable[2].relatedActions, []);
const unknownDummy = build(zss, { capabilities: { status: 'unknown', fingerprint: 'unknown-query' } }).snapshot.publicCollisions.items[2];
assert.strictEqual(unknownDummy.relation, 'unresolved');
assert.strictEqual(unknownDummy.fields[0].compatibility, 'unresolved');

const cns = '[StateDef 200]\nanim = 200\n[State 200, inspect]\ntype = Null\ntrigger1 = ClsnVar(Clsn2, max(0, var(0)), Bottom) > 0\n';
const cnsItem = build(cns, { syntax: 'cns', capabilities: { dummyGroup: false, status: 'unsupported', fingerprint: 'stable-cns' } }).snapshot.publicCollisions.items[0];
assert.strictEqual(cnsItem.relation, 'conditional/dynamic');
assert.deepStrictEqual(cnsItem.fields.map(item => item.expression), ['Clsn2', 'max(0, var(0))', 'Bottom']);

for (const [text, expected] of [
  ['[Function Shared()]\nlet x = ClsnVar(Clsn1, 0, Back);\n', 'global/shared'],
  ['[StateDef -2; anim: 200]\nlet x = ClsnVar(Clsn1, 0, Back);\n', 'global/shared'],
  ['[StateDef 200; anim: 200]\n@customstate\nlet x = ClsnVar(Clsn1, 0, Back);\n', 'unresolved'],
  ['[StateDef 200; anim: 200]\nlet x = root, ClsnVar(Clsn1, 0, Back);\n', 'unresolved'],
  ['[StateDef 200; anim: 200]\nlet x = ClsnVar(Nope, 0, Back);\n', 'unresolved']
]) assert.strictEqual(build(text).snapshot.publicCollisions.items[0].relation, expected, text);
for (const redirect of ['helper', 'target', 'stateowner', 'player(1)', 'playerindex(0)', 'helperindex(0)', 'root, helper(1)']) {
  const item = build(`[StateDef 200; anim: 200]\nlet x=${redirect}, ClsnVar(Clsn1,0,Back);\n`).snapshot.publicCollisions.items[0];
  assert.strictEqual(item.relation, 'unresolved', redirect);
  assert.deepStrictEqual(item.relatedActions, [], `${redirect} cannot publish redirected runtime ownership as local Action context`);
}
for (const harmless of ['[StateDef 200; anim: 200]\n# @customstate\nlet x=ClsnVar(Clsn1,0,Back);\n', '[StateDef 200]\n; @customstate\nanim=200\n[State 200,x]\ntype=Null\ntrigger1=ClsnVar(Clsn1,0,Back)>0\n']) assert.strictEqual(build(harmless, { syntax: harmless.includes('; @customstate') ? 'cns' : 'zss' }).snapshot.publicCollisions.items[0].relation, 'conditional/dynamic');

const redirectedIndex = build('[StateDef 200; anim: 200]\nlet x=ClsnVar(Clsn1, root, var(0), Back);\n').snapshot.publicCollisions.items[0];
assert.strictEqual(redirectedIndex.relation, 'conditional/dynamic');
assert.deepStrictEqual(redirectedIndex.relatedActions, [200]);
assert.strictEqual(redirectedIndex.fields.find(item => item.key === 'index').expression, 'root, var(0)');
const nestedRedirectIndex = build('[StateDef 200; anim: 200]\nlet x=ClsnVar(Clsn1, playerid(root, ID), var(0), Back);\n').snapshot.publicCollisions.items[0];
assert.strictEqual(nestedRedirectIndex.relation, 'conditional/dynamic');
assert.deepStrictEqual(nestedRedirectIndex.relatedActions, [200]);
for (const expression of ['root', 'helper(1)', 'root + 1', 'foo, bar']) {
  const item = build(`[StateDef 200; anim: 200]\nlet x=ClsnVar(Clsn1, ${expression}, Back);\n`).snapshot.publicCollisions.items[0];
  assert.strictEqual(item.relation, 'unresolved', expression);
  assert.deepStrictEqual(item.relatedActions, []);
}
for (const expression of ['playerid(1, 2), var(0)', 'helper(1, 2, 3), var(0)']) assert.strictEqual(build(`[StateDef 200; anim: 200]\nlet x=ClsnVar(Clsn1, ${expression}, Back);\n`).snapshot.publicCollisions.items[0].relation, 'unresolved');

const route = rows[0].route, authority = nightly.snapshot.collisionAuthorities.get(route);
assert.strictEqual(authority.schema, 'ikemaker.collision-query-source-route');
assert.strictEqual(zss.slice(authority.callStart, authority.callEnd), 'ClsnVar(Clsn1, 0, Back)');
assert(validateCollisionSourceAuthority(authority, nightly.context));
assert.strictEqual(validateCollisionSourceAuthority(authority, { ...nightly.context, generation: 8 }), null);
assert.strictEqual(validateCollisionSourceAuthority(authority, { ...nightly.context, collisionCapabilities: { ...nightly.context.collisionCapabilities, dummyGroup: false, fingerprint: 'changed' } }), null);

const mixed = '[StateDef 200; anim: 200]\nOverrideClsn { rect: 0,0,1,1; }\nlet x=ClsnVar(Clsn1,0,Back);\nHitBy { attr: S, NA; }\nHitDef { attr: S, NA; }\n';
assert.deepStrictEqual(build(mixed).snapshot.publicCollisions.items.map(item => item.kind), ['overrideclsn', 'clsnvar', 'hitby', 'hitdef']);

const many = '[StateDef 200; anim: 200]\n' + Array.from({ length: MAX_USES_PER_ACTION + 2 }, (_, index) => `let q${index}=ClsnVar(Clsn1,${index},Back);`).join('\n');
const manySnapshot = build(many).snapshot.publicCollisions;
assert.strictEqual(manySnapshot.perActionOmitted['200'], 2);
const overflow = '[StateDef 200]\n' + Array.from({ length: MAX_USES_TOTAL + 1 }, (_, index) => `let q${index}=ClsnVar(Clsn1,${index},Back);`).join('\n');
assert.strictEqual(build(overflow).snapshot.complete, false);

console.log('AIR collision query authority tests passed');
