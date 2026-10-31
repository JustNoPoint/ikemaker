'use strict';

const assert = require('assert');
const { hash } = require('../src/mutation_safety');
const { buildAirActionUsageSnapshot, validateCollisionSourceAuthority } = require('../src/air_action_usage_authority');

const defPath = 'C:/chars/Hero/Hero.def', airPath = 'C:/chars/Hero/Hero.air', airText = '[Begin Action 200]\n0,0,0,0,1\n';
function build(text, options = {}) {
  const syntax = options.syntax || (/\[State\s/i.test(text) ? 'cns' : 'zss'), filename = `C:/chars/Hero/proj-overlap.${syntax}`, source = { available: true, dirty: false, filename, syntax, text, sourceHash: hash(text), version: 5 };
  const collisionCapabilities = options.capabilities || { indexed: true, stringExpressions: true, dummyGroup: true, status: 'supported', fingerprint: 'nightly-proj-overlap' };
  const context = { defPath, defText: `[Files]\nanim=Hero.air\nst=proj-overlap.${syntax}\n`, defDirty: false, airPath, airText, assignedSources: [filename], sources: [source], inventoryComplete: true, generation: 11, collisionCapabilities, collisionToken: item => hash(item.occurrenceId).slice(0, 48) };
  return { context, snapshot: buildAirActionUsageSnapshot(context) };
}

const zss = '[StateDef 200; anim: 200]\nProjectile { projid: 9; projanim: 200; }\nlet a=ProjClsnOverlap(0, ID, Clsn1);\nlet b=ProjClsnOverlap(-1, root, ID, Size);\nlet c=ProjClsnOverlap(var(0), playerid(root, ID), var(1), Clsn2);\n';
const built = build(zss), rows = built.snapshot.publicCollisions.items.filter(item => item.kind === 'projclsnoverlap');
assert.strictEqual(rows.length, 3);
assert(rows.every(item => item.relation === 'conditional/dynamic' && item.relatedActions.length === 0 && item.compatibility === 'stable-1.0'));
assert.deepStrictEqual(rows[0].fields.map(item => [item.key, item.compatibility]), [['projectile.index', 'stable'], ['target.player.id', 'stable'], ['target.group', 'stable']]);
assert.match(rows[0].reason, /no containing-StateDef AIR Action.*proven/i);
assert.match(rows[0].effectiveExplanation, /active directly owned projectile-list entry/i);

const stable = build(zss, { capabilities: { indexed: false, stringExpressions: false, dummyGroup: false, status: 'unsupported', fingerprint: 'stable' } }).snapshot.publicCollisions.items.filter(item => item.kind === 'projclsnoverlap');
assert(stable.every(item => item.compatibility === 'stable-1.0' && item.relatedActions.length === 0));

const invalid = build('[StateDef 200; anim: 200]\nlet x=ProjClsnOverlap(1,2,Dummy);\n').snapshot.publicCollisions.items[0];
assert.strictEqual(invalid.relation, 'unresolved');
assert.strictEqual(invalid.compatibility, 'unresolved');
assert.deepStrictEqual(invalid.relatedActions, []);

for (const [text, expected] of [
  ['[Function Shared()]\nlet x=ProjClsnOverlap(1,2,Clsn1);\n', 'global/shared'],
  ['[StateDef -2; anim: 200]\nlet x=ProjClsnOverlap(1,2,Clsn1);\n', 'global/shared'],
  ['[StateDef 200; anim: 200]\n@customstate\nlet x=ProjClsnOverlap(1,2,Clsn1);\n', 'unresolved'],
  ['[StateDef 200; anim: 200]\nlet x=root, ProjClsnOverlap(1,2,Clsn1);\n', 'unresolved'],
  ['let x=ProjClsnOverlap(1,2,Clsn1);\n', 'unresolved']
]) {
  const item = build(text).snapshot.publicCollisions.items[0];
  assert.strictEqual(item.relation, expected, text);
  assert.deepStrictEqual(item.relatedActions, []);
}

const cns = '[StateDef 200]\nanim=200\n[State 200,q]\ntype=Null\ntrigger1=ProjClsnOverlap(root, var(0), helper(1, root, ID), ID, Size)\n';
const cnsItem = build(cns, { syntax: 'cns' }).snapshot.publicCollisions.items[0];
assert.strictEqual(cnsItem.relation, 'conditional/dynamic');
assert.deepStrictEqual(cnsItem.relatedActions, []);
assert.deepStrictEqual(cnsItem.fields.map(item => item.expression), ['root, var(0)', 'helper(1, root, ID), ID', 'Size']);

const route = rows[0].route, authority = built.snapshot.collisionAuthorities.get(route);
assert.strictEqual(authority.schema, 'ikemaker.collision-query-source-route');
assert.strictEqual(zss.slice(authority.callStart, authority.callEnd), 'ProjClsnOverlap(0, ID, Clsn1)');
assert(validateCollisionSourceAuthority(authority, built.context));
assert.strictEqual(validateCollisionSourceAuthority(authority, { ...built.context, generation: 12 }), null);
assert.strictEqual(validateCollisionSourceAuthority(authority, { ...built.context, airText: airText + '\n' }), null);

const mixed = '[StateDef 200; anim: 200]\nlet a=ClsnVar(Clsn1,0,Back);\nlet b=ClsnOverlap(Clsn1,ID,Clsn2);\nlet c=ProjClsnOverlap(0,ID,Clsn2);\n';
assert.deepStrictEqual(build(mixed).snapshot.publicCollisions.items.map(item => item.kind), ['clsnvar', 'clsnoverlap', 'projclsnoverlap']);

console.log('AIR projectile collision overlap authority tests passed');
