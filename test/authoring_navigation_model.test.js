'use strict';

const assert = require('assert');
const {
  createNavigationState, projectNavigation, reduceNavigation, resolveDestinationKey, serializeNavigationState, deserializeNavigationState
} = require('../src/authoring_navigation_model');

const input = [
  { id: 'state-200', label: 'State 200', kind: 'state', description: 'Light punch', nested: { line: 2 } },
  { id: 'hitdef-1', label: 'HitDef', kind: 'controller', keywords: ['damage', 'attack'] },
  { id: 'helper-1', label: 'Helper', kind: 'controller' },
  { id: 'project-def', label: 'Character DEF', kind: 'project' }
];
let state = createNavigationState({
  items: input,
  mode: 'tabs',
  customGroups: [{ id: 'favorites', label: 'Favorites', itemIds: ['state-200'] }],
  autoGroups: [{ id: 'controllers', label: 'Controllers', match: { kind: 'controller' } }],
  order: ['project-def', 'helper-1', 'hitdef-1', 'state-200'],
  currentId: 'project-def'
});
input[0].label = 'mutated'; input[0].nested.line = 99;
assert(Object.isFrozen(state) && Object.isFrozen(state.items) && Object.isFrozen(state.items[0].nested));
assert.strictEqual(state.items[0].label, 'State 200');
assert.throws(() => createNavigationState({ items: [{ id: 'same' }, { id: 'same' }] }), /Duplicate Navigation item id/);
assert.throws(() => createNavigationState({ items: [{ id: 'one' }], groups: [{ id: 'g', itemIds: ['missing'] }] }), /unknown item/);

let view = projectNavigation(state);
assert.deepStrictEqual(view.visibleItems.map((item) => item.id), ['project-def', 'helper-1', 'hitdef-1', 'state-200']);
assert.strictEqual(view.tabs, view.list, 'tabs and list expose one canonical visible item array');
assert.deepStrictEqual(view.cards, [{ itemId: 'project-def' }, { itemId: 'helper-1' }, { itemId: 'hitdef-1' }, { itemId: 'state-200' }], 'cards contain references only');
assert.deepStrictEqual(view.groups.find((group) => group.id === 'controllers').itemIds, ['helper-1', 'hitdef-1']);
assert.deepStrictEqual(view.slider, { empty:false, single:false, min:1, max:4, value:1, index:0, title:'1 of 4 · Character DEF', previousDisabled:true, nextDisabled:false });

state = reduceNavigation(state, { type: 'pin', id: 'state-200' });
assert.deepStrictEqual(projectNavigation(state).visibleItems.map((item) => item.id), ['state-200', 'project-def', 'helper-1', 'hitdef-1']);
state = reduceNavigation(state, { type: 'set-current', id: 'helper-1' });
state = reduceNavigation(state, { type: 'next' });
assert.strictEqual(state.currentId, 'hitdef-1');
state = reduceNavigation(state, { type: 'next' });
assert.strictEqual(state.currentId, 'hitdef-1', 'next does not wrap at the end');
state = reduceNavigation(state, { type: 'previous' });
assert.strictEqual(state.currentId, 'helper-1');
state = reduceNavigation(state, { type: 'set-slider', value: 1 });
assert.strictEqual(state.currentId, 'state-200');

state = reduceNavigation(state, { type: 'collapse-group', id: 'controllers' });
assert.deepStrictEqual(projectNavigation(state).visibleItems.map((item) => item.id), ['state-200', 'project-def']);
state = reduceNavigation(state, { type: 'set-search', search: 'character' });
view = projectNavigation(state);
assert.deepStrictEqual(view.visibleItems.map((item) => item.id), ['project-def']);
assert.deepStrictEqual(view.slider, { empty:false, single:true, min:1, max:1, value:1, index:0, title:'1 of 1 · Character DEF', previousDisabled:true, nextDisabled:true });
state = reduceNavigation(state, { type: 'set-filter', filter: { ids: [] } });
view = projectNavigation(state);
assert.deepStrictEqual(view.slider, { empty:true, single:false, min:0, max:0, value:0, index:-1, title:'0 of 0', previousDisabled:true, nextDisabled:true });

const moved = reduceNavigation(createNavigationState({ items: [{id:'a'},{id:'b'},{id:'c'}] }), { type:'move', id:'c', beforeId:'a' });
assert.deepStrictEqual(moved.order, ['c','a','b']);
const cards = projectNavigation(reduceNavigation(moved, { type:'set-mode', mode:'cards' }));
assert.strictEqual(cards.rendered, cards.cards);
assert.deepStrictEqual(Object.keys(cards.cards[0]), ['itemId']);

const serialized = serializeNavigationState(state), restored = deserializeNavigationState(serialized);
assert.deepStrictEqual(restored, state);
assert.strictEqual(serializeNavigationState(restored), serialized);
assert(Object.isFrozen(restored.items[0]));
assert.throws(() => deserializeNavigationState('{"schema":"wrong","version":1,"items":[]}'), /Unsupported/);

const ids = ['a','b','c','d','e','f','g'];
assert.strictEqual(resolveDestinationKey([], 'a', 'ArrowRight'), null);
assert.strictEqual(resolveDestinationKey(['a'], 'a', 'ArrowRight'), null);
assert.strictEqual(resolveDestinationKey(['a','b','c'], 'a', 'PageDown'), 'c');
assert.strictEqual(resolveDestinationKey(ids, 'a', 'ArrowLeft'), null);
assert.strictEqual(resolveDestinationKey(ids, 'a', 'ArrowRight'), 'b');
assert.strictEqual(resolveDestinationKey(ids, 'd', 'ArrowLeft'), 'c');
assert.strictEqual(resolveDestinationKey(ids, 'd', 'ArrowRight'), 'e');
assert.strictEqual(resolveDestinationKey(ids, 'd', 'Home'), 'a');
assert.strictEqual(resolveDestinationKey(ids, 'd', 'End'), 'g');
assert.strictEqual(resolveDestinationKey(ids, 'g', 'ArrowRight'), null);
assert.strictEqual(resolveDestinationKey(ids, 'g', 'PageUp'), 'b');
assert.strictEqual(resolveDestinationKey(ids, 'a', 'PageDown'), 'f');
assert.strictEqual(resolveDestinationKey(ids, 'missing', 'Home'), null);
assert.strictEqual(resolveDestinationKey(ids, 'd', 'ArrowDown'), null);
for (const modifier of ['altKey','ctrlKey','metaKey','shiftKey']) assert.strictEqual(resolveDestinationKey(ids, 'd', 'ArrowRight', { [modifier]:true }), null);
assert.strictEqual(resolveDestinationKey(Array.from({length:513},(_,index)=>String(index)), '0', 'End'), null, 'resolver input is strictly bounded');
console.log('Authoring navigation canonical views, groups, immutable state, discrete tabs, filters, ordering and serialization passed');
