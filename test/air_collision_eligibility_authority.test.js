'use strict';
const assert = require('assert');
const { hash } = require('../src/mutation_safety');
const { buildAirActionUsageSnapshot, validateCollisionSourceAuthority, MAX_USES_PER_ACTION, MAX_USES_TOTAL } = require('../src/air_action_usage_authority');

const defPath = 'C:/chars/Hero/Hero.def', airPath = 'C:/chars/Hero/Hero.air', airText = '[Begin Action 200]\n0,0,0,0,1\n';
function snapshot(text, capabilities = { indexed: true, status: 'supported', fingerprint: 'nightly-cap' }) {
  const source = { available: true, dirty: false, filename: 'C:/chars/Hero/state.zss', syntax: 'zss', text, sourceHash: hash(text) };
  return buildAirActionUsageSnapshot({ defPath, defText: '[Files]\nanim=Hero.air\nst=state.zss\n', defDirty: false, airPath, airText, assignedSources: [source.filename], sources: [source], inventoryComplete: true, generation: 3, collisionCapabilities: capabilities, collisionToken: item => hash(item.occurrenceId).slice(0, 48) });
}
const mixed = '[StateDef 200; anim: 200]\nOverrideClsn { rect: 0,0,1,1; }\nHitBy { attr: S, NA; clsn.group: 2; clsn.index: 3; }\nNotHitBy { attr: S, NP; time: time; }\n';
const built = snapshot(mixed), rows = built.publicCollisions.items;
assert.deepStrictEqual(rows.map(item => item.kind), ['overrideclsn', 'hitby', 'nothitby'], 'geometry and eligibility rows retain deterministic source order');
assert.strictEqual(rows[1].category, 'eligibility-filtering'); assert.strictEqual(rows[1].relation, 'same-state'); assert.match(rows[1].reason, /authored in the same StateDef/i); assert(!/affects this Action|invincible|will hit|will not hit/i.test(rows[1].reason));
assert.strictEqual(rows[2].relation, 'conditional/dynamic'); assert.strictEqual(rows[1].fields.find(item => item.key === 'clsn.group').compatibility, 'nightly');
const stable = snapshot(mixed, { indexed: false, status: 'unsupported', fingerprint: 'stable-cap' }).publicCollisions.items[1]; assert.strictEqual(stable.fields.find(item => item.key === 'clsn.index').compatibility, 'unsupported-on-stable'); assert.strictEqual(stable.fields.find(item => item.key === 'attr').compatibility, 'stable');
const unknown = snapshot(mixed, { status: 'unknown', fingerprint: 'unknown-cap' }).publicCollisions.items[1]; assert.strictEqual(unknown.fields.find(item => item.key === 'clsn.index').compatibility, 'unresolved');
const route = rows[1].route, authority = built.collisionAuthorities.get(route); assert(authority); assert(validateCollisionSourceAuthority(authority, { defPath, defText: '[Files]\nanim=Hero.air\nst=state.zss\n', defDirty: false, airPath, airText, assignedSources: ['C:/chars/Hero/state.zss'], sources: [{ available: true, dirty: false, filename: 'C:/chars/Hero/state.zss', syntax: 'zss', text: mixed, sourceHash: hash(mixed) }], inventoryComplete: true, generation: 3, collisionCapabilities: { indexed: true, status: 'supported', fingerprint: 'nightly-cap' }, collisionToken: item => item.occurrenceId === authority.occurrenceId ? route : '0'.repeat(48) }));
assert.strictEqual(validateCollisionSourceAuthority(authority, { defPath, defText: '[Files]\nanim=Hero.air\nst=state.zss\n', defDirty: false, airPath, airText, assignedSources: ['C:/chars/Hero/state.zss'], sources: [{ available: true, dirty: false, filename: 'C:/chars/Hero/state.zss', syntax: 'zss', text: mixed, sourceHash: hash(mixed) }], inventoryComplete: true, generation: 3, collisionCapabilities: { indexed: false, status: 'unsupported', fingerprint: 'stable-cap' }, collisionToken: () => route }), null, 'C3 exact-source authority rejects stale capability evidence');
assert.strictEqual(snapshot('[StateDef 200; anim: 200]\nroot, HitBy { attr: S, NA; }').publicCollisions.items[0].relation, 'unresolved');
assert.strictEqual(snapshot('[Function Shared()]\nHitBy { attr: S, NA; }').publicCollisions.items[0].relation, 'global/shared');
assert.strictEqual(snapshot('[StateDef -2; anim: 200]\nHitBy { attr: S, NA; }').publicCollisions.items[0].relation, 'global/shared');
const overDisplay='[StateDef 200; anim: 200]\n'+Array.from({length:MAX_USES_PER_ACTION+2},(_,index)=>index%2?'HitBy { attr: S, NA; }':'OverrideClsn { rect: 0,0,1,1; }').join('\n'), overSnapshot=snapshot(overDisplay), shown=Math.min(MAX_USES_PER_ACTION,overSnapshot.publicCollisions.relationTotals['same-state']); assert.strictEqual(overSnapshot.publicCollisions.items.length,MAX_USES_PER_ACTION+2); assert.strictEqual(shown+overSnapshot.publicCollisions.perActionOmitted['200'],overSnapshot.publicCollisions.items.length,'shown relations plus the selected-Action omission count retain the deterministic mixed-family total');
const overInventory='[StateDef 200]\n'+Array.from({length:MAX_USES_TOTAL+1},(_,index)=>index%2?'HitBy { attr: S, NA; }':'OverrideClsn { rect: 0,0,1,1; }').join('\n'), bounded=snapshot(overInventory); assert.strictEqual(bounded.complete,false); assert.match(bounded.reason,/combined bounded animation\/collision reference index/i);
console.log('AIR collision eligibility authority tests passed');
