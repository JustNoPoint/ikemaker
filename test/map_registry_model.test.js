'use strict';

const assert = require('assert');
const model = require('../src/map_registry_model');

const source = `# Temporary visible UI for validating the authored hit classification.
# Event contract (owned by the attacking player):
# JNP_UI_event_type 0 = none, 1 = Counter Hit, 2 = Punish Counter
# JNP_UI_event_serial increments once for every published event
# JNP_UI_event_owner attacker player ID

map(JNP_UI_event_type) := 1;
if map(JNP_UI_event_type) = 1 {
  map(JNP_UI_event_serial) += 1;
}
map(Simple) = 4;
`;

const occurrences = model.occurrences(source, 'common.zss', 'zss');
const type = occurrences.filter((item) => item.name === 'JNP_UI_event_type');
assert.deepStrictEqual(type.map((item) => item.access), ['write', 'read']);
assert.strictEqual(type[0].observedValue, '1');
assert.ok(type[0].notes.map((note) => note.text).join('\n').includes('0 = none'));
assert.strictEqual(occurrences.find((item) => item.name === 'JNP_UI_event_serial').access, 'read-write');
assert.strictEqual(occurrences.find((item) => item.name === 'Simple').access, 'read', 'equality must never be treated as a writer');

const entries = model.aggregate(occurrences);
const event = entries.find((entry) => entry.name === 'JNP_UI_event_type');
assert.deepStrictEqual(event.suggestedPath, ['JNP', 'UI', 'event']);
assert.strictEqual(event.ownership, 'Unknown');
assert.strictEqual(event.runtimeReceiver, 'Unknown');
assert.ok(event.notes[0].filename.endsWith('common.zss'));
const serial = entries.find((entry) => entry.name === 'JNP_UI_event_serial');
assert.strictEqual(serial.displayReads, 1, 'read-write must count as visible read activity');
assert.strictEqual(serial.displayWrites, 1, 'read-write must count as visible write activity');
assert.deepStrictEqual(model.namespaceFor('JNP_SF6_UI_event_type'), { author: 'JNP', game: 'SF6', confirmed: true });
assert.deepStrictEqual(model.namespaceFor('TeamZ2_HDBZ_guard_mode'), { author: 'TeamZ2', game: 'HDBZ', confirmed: true });
assert.strictEqual(model.namespaceFor('JNP_cfg_shared').confirmed, false);

const tree = model.buildTree(entries);
assert.ok(tree.children.has('JNP'));
assert.ok(model.search(entries, 'counter hit').some((entry) => entry.name === 'JNP_UI_event_type'));
assert.strictEqual(model.snippet('JNP_UI_event_type', 'name'), 'JNP_UI_event_type');
assert.strictEqual(model.snippet('JNP_UI_event_type', 'read'), 'map(JNP_UI_event_type)');
assert.strictEqual(model.snippet('JNP_UI_event_type', 'compare', '2'), 'map(JNP_UI_event_type) = 2');
assert.strictEqual(model.snippet('JNP_UI_event_type', 'set', '2'), 'map(JNP_UI_event_type) := 2;');
assert.throws(() => model.snippet('JNP_UI_event_type', 'read', '1', 'lua'), /not validated/);

const lexical = model.occurrences('map(A) := 1; map(B) := 2; text: "map(NotAReference)"; # map(NotEither)', 'multi.zss', 'zss');
assert.deepStrictEqual(lexical.map((item) => item.name), ['A', 'B']);
assert.deepStrictEqual(lexical.map((item) => item.access), ['write', 'write']);

const cns = model.occurrences('[State Add]\ntype = MapAdd\nMap(collection) = 1\ntrigger1 = Map(collection) < 10\n[State Set]\ntype = MapSet\nMap(total) = 4', 'legacy.cns', 'ikemen-cns');
assert.deepStrictEqual(cns.filter((item) => item.name === 'collection').map((item) => item.access), ['read-write', 'read']);
assert.strictEqual(cns.find((item) => item.name === 'total').access, 'write');
const cnsOrder = model.occurrences('[State Set]\ntrigger1 = Map(condition) = 1\nMap(target) = 4\ntype = MapSet\n[State Add]\ntrigger1 = Map(otherCondition) = 1\ntype = MapAdd\nMap(accumulator) = 2', 'ordered.cns', 'ikemen-cns');
assert.deepStrictEqual(cnsOrder.map((item) => [item.name, item.access]), [['condition', 'read'], ['target', 'write'], ['otherCondition', 'read'], ['accumulator', 'read-write']]);
assert.throws(() => model.snippet('total', 'set', '4', 'ikemen-cns'), /controller-specific/);

console.log('Map registry model tests passed');
