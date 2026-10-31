'use strict';

const assert = require('assert');
const { hash } = require('../src/mutation_safety');
const { buildAirActionUsageSnapshot, validateCollisionSourceAuthority } = require('../src/air_action_usage_authority');

const defPath = 'C:/chars/Hero/Hero.def', airPath = 'C:/chars/Hero/Hero.air', airText = '[Begin Action 200]\n0,0,0,0,1\n';
function build(text, options = {}) {
  const syntax = options.syntax || (/\[State\s/i.test(text) ? 'cns' : 'zss'), filename = `C:/chars/Hero/overlap.${syntax}`, source = { available: true, dirty: false, filename, syntax, text, sourceHash: hash(text), version: 4 };
  const collisionCapabilities = options.capabilities || { indexed: true, stringExpressions: true, dummyGroup: true, status: 'supported', fingerprint: 'nightly-overlap' };
  const context = { defPath, defText: `[Files]\nanim=Hero.air\nst=overlap.${syntax}\n`, defDirty: false, airPath, airText, assignedSources: [filename], sources: [source], inventoryComplete: true, generation: 9, collisionCapabilities, collisionToken: item => hash(item.occurrenceId).slice(0, 48) };
  return { context, snapshot: buildAirActionUsageSnapshot(context) };
}

const zss = '[StateDef 200; anim: 200]\nlet a=ClsnOverlap(Clsn1, ID, Clsn2);\nlet b=ClsnOverlap(Size, root, ID, Clsn1);\nlet c=ClsnOverlap(Dummy, 2, Size);\n';
const nightly = build(zss), rows = nightly.snapshot.publicCollisions.items;
assert.deepStrictEqual(rows.map(item => [item.kind, item.relation, item.relatedActions, item.compatibility]), [
  ['clsnoverlap', 'conditional/dynamic', [200], 'stable-1.0'],
  ['clsnoverlap', 'conditional/dynamic', [], 'stable-1.0'],
  ['clsnoverlap', 'conditional/dynamic', [], 'nightly-dummy']
]);
assert.deepStrictEqual(rows[0].fields.map(item => [item.key, item.compatibility]), [['owner.group', 'stable'], ['player.id', 'stable'], ['target.group', 'stable']]);
assert.match(rows[0].effectiveExplanation, /runtime boolean.*effective world collision groups/i);
assert.match(rows[0].reason, /target player.*not proven/i);
assert.match(rows[1].reason, /whole-character data/i);

const stableRows = build(zss, { capabilities: { indexed: false, stringExpressions: false, dummyGroup: false, status: 'unsupported', fingerprint: 'stable-overlap' } }).snapshot.publicCollisions.items;
assert.strictEqual(stableRows[0].relation, 'conditional/dynamic');
assert.strictEqual(stableRows[2].relation, 'unresolved');
assert.strictEqual(stableRows[2].fields[0].compatibility, 'unsupported-on-stable');
const unknownDummy = build(zss, { capabilities: { status: 'unknown', fingerprint: 'unknown-overlap' } }).snapshot.publicCollisions.items[2];
assert.strictEqual(unknownDummy.relation, 'unresolved');
assert.strictEqual(unknownDummy.fields[0].compatibility, 'unresolved');

const invalidTarget = build('[StateDef 200; anim: 200]\nlet x=ClsnOverlap(Clsn1, ID, Dummy);\n').snapshot.publicCollisions.items[0];
assert.strictEqual(invalidTarget.relation, 'unresolved');
assert.strictEqual(invalidTarget.compatibility, 'unresolved');
assert.deepStrictEqual(invalidTarget.relatedActions, []);
assert.match(invalidTarget.reason, /Dummy is not valid/i);
for (const expression of ['playerid(root, ID), var(0)', 'helper(1, root, ID), var(0)']) {
  const item = build(`[StateDef 200; anim: 200]\nlet x=ClsnOverlap(Clsn1, ${expression}, Clsn2);\n`).snapshot.publicCollisions.items[0];
  assert.strictEqual(item.relation, 'conditional/dynamic', expression);
  assert.deepStrictEqual(item.relatedActions, [200]);
}
for (const expression of ['root', 'helper(1)', 'root + 1', 'foo, bar']) {
  const item = build(`[StateDef 200; anim: 200]\nlet x=ClsnOverlap(Clsn1, ${expression}, Clsn2);\n`).snapshot.publicCollisions.items[0];
  assert.strictEqual(item.relation, 'unresolved', expression);
  assert.deepStrictEqual(item.relatedActions, []);
}
for (const expression of ['playerid(1, 2), var(0)', 'helper(1, 2, 3), var(0)']) assert.strictEqual(build(`[StateDef 200; anim: 200]\nlet x=ClsnOverlap(Clsn1, ${expression}, Clsn2);\n`).snapshot.publicCollisions.items[0].relation, 'unresolved');

for (const [text, expected] of [
  ['[Function Shared()]\nlet x=ClsnOverlap(Clsn1, ID, Clsn2);\n', 'global/shared'],
  ['[StateDef -2; anim: 200]\nlet x=ClsnOverlap(Clsn1, ID, Clsn2);\n', 'global/shared'],
  ['[StateDef 200; anim: 200]\n@customstate\nlet x=ClsnOverlap(Clsn1, ID, Clsn2);\n', 'unresolved'],
  ['[StateDef 200; anim: 200]\nlet x=root, ClsnOverlap(Clsn1, ID, Clsn2);\n', 'unresolved'],
  ['let x=ClsnOverlap(Clsn1, ID, Clsn2);\n', 'unresolved']
]) {
  const item = build(text).snapshot.publicCollisions.items[0];
  assert.strictEqual(item.relation, expected, text);
  if (expected === 'unresolved') assert.deepStrictEqual(item.relatedActions, []);
}

const cns = '[StateDef 200]\nanim = 200\n[State 200, overlap]\ntype = Null\ntrigger1 = ClsnOverlap(Clsn2, root, ID, Size)\n';
const cnsItem = build(cns, { syntax: 'cns', capabilities: { dummyGroup: false, status: 'unsupported', fingerprint: 'stable-cns' } }).snapshot.publicCollisions.items[0];
assert.strictEqual(cnsItem.relation, 'conditional/dynamic');
assert.deepStrictEqual(cnsItem.fields.map(item => item.expression), ['Clsn2', 'root, ID', 'Size']);

const authority = nightly.snapshot.collisionAuthorities.get(rows[0].route);
assert.strictEqual(authority.schema, 'ikemaker.collision-query-source-route');
assert.strictEqual(zss.slice(authority.callStart, authority.callEnd), 'ClsnOverlap(Clsn1, ID, Clsn2)');
assert(validateCollisionSourceAuthority(authority, nightly.context));
assert.strictEqual(validateCollisionSourceAuthority(authority, { ...nightly.context, generation: 10 }), null);
assert.strictEqual(validateCollisionSourceAuthority(authority, { ...nightly.context, collisionCapabilities: { ...nightly.context.collisionCapabilities, dummyGroup: false, fingerprint: 'changed' } }), null);

const mixed = '[StateDef 200; anim: 200]\nlet q=ClsnVar(Clsn1,0,Back);\nlet o=ClsnOverlap(Clsn1,ID,Clsn2);\nHitBy { attr: S, NA; }\n';
assert.deepStrictEqual(build(mixed).snapshot.publicCollisions.items.map(item => item.kind), ['clsnvar', 'clsnoverlap', 'hitby']);

console.log('AIR collision overlap authority tests passed');
