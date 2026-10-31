'use strict';

const assert = require('assert');
const stack = require('../src/visual_layer_stack_model');

const source = [
  { id: 'back', name: 'Back', x: 0, y: 0, sprite: [30, 0] },
  { id: 'middle', name: 'Middle', x: 5, y: 10, sprite: [30, 1] },
  { id: 'front', name: 'Front', x: 20, y: 30, sprite: [30, 2] },
  { id: 'guide', name: 'Guide', locked: true, sprite: [30, 3] }
];

assert.deepStrictEqual(stack.normalizeStack(source).map(layer => layer.order), [0, 1, 2, 3]);
assert.throws(() => stack.normalizeStack([{ id: 'same' }, { id: 'same' }]), /repeated/);

const moved = stack.move(source, ['middle', 'front'], -5, 3);
assert.deepStrictEqual(moved.slice(1, 3).map(layer => [layer.x, layer.y]), [[0, 13], [15, 33]]);
assert.deepStrictEqual(stack.move(source, ['guide'], 10, 10).find(layer => layer.id === 'guide').x, 0, 'locked layers do not move');

const opacity = stack.setOpacity(source, ['middle', 'front'], 2);
assert.deepStrictEqual(opacity.slice(1, 3).map(layer => layer.opacity), [1, 1]);
assert.strictEqual(stack.setVisibility(source, ['front'], false)[2].visible, false);
assert.strictEqual(stack.setLocked(source, ['front'], true)[2].locked, true);

assert.deepStrictEqual(stack.reorder(source, ['middle'], 'up').map(layer => layer.id), ['back', 'front', 'middle', 'guide']);
assert.deepStrictEqual(stack.reorder(source, ['front'], 'down').map(layer => layer.id), ['back', 'front', 'middle', 'guide']);
assert.deepStrictEqual(stack.reorder(source, ['back', 'middle'], 'top').map(layer => layer.id), ['front', 'back', 'middle', 'guide']);
assert.deepStrictEqual(stack.reorder(source, ['middle', 'front'], 'bottom').map(layer => layer.id), ['middle', 'front', 'back', 'guide']);
assert.deepStrictEqual(stack.reorderAt(source, ['back','middle'], 'guide', false).map(layer => layer.id), ['front','guide','back','middle']);

const reviewed=stack.reviewedStack(source,[{id:'front',x:4,y:-2,visible:true},{id:'back',x:0,y:0,visible:false},{id:'middle',x:4,y:-2,visible:true},{id:'guide',x:0,y:0,visible:false}]);
assert.deepStrictEqual(reviewed.layers.map(layer=>layer.id),['front','back','middle','guide']);
assert.deepStrictEqual(reviewed.drawStack.map(layer=>layer.id),['front','middle']);
assert.deepStrictEqual(reviewed.drawStack.map(layer=>[layer.deltaX,layer.deltaY]),[[4,-2],[4,-2]]);
assert.deepStrictEqual(Object.fromEntries(reviewed.layers.map(layer=>[layer.id,layer.sprite])),Object.fromEntries(source.map(layer=>[layer.id,layer.sprite])),'review cannot rewrite stable payload fields');
assert.throws(()=>stack.reviewedStack(source,[{id:'front',x:0,y:0,visible:true}]),/incomplete/);

assert.deepStrictEqual(stack.selectionAfterClick(['back'], 'middle', {}), ['middle']);
assert.deepStrictEqual(stack.selectionAfterClick(['back'], 'middle', { ctrl: true }), ['back', 'middle']);
assert.deepStrictEqual(stack.selectionAfterClick(['back', 'middle'], 'middle', { ctrl: true }), ['back']);
assert.deepStrictEqual(stack.selectionAfterClick(['back'], 'front', { shift: true }), ['back', 'front']);

console.log('Shared visual layer multi-selection, movement, visibility, opacity, lock, and ordering tests passed');
