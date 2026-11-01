'use strict';

const assert = require('assert');
const vm = require('vm');
const { codeStructureAccessibilityClientScript } = require('../src/code_structure_workspace');

const classList = (...initial) => {
  const values = new Set(initial);
  return { contains: value => values.has(value), add: value => values.add(value), remove: value => values.delete(value) };
};
const document = { activeElement: null, querySelectorAll: () => [] };
function rowNode(id, parentElement) {
  const listeners = {}, attributes = {};
  return {
    dataset: {}, parentElement, classList: classList(), tabIndex: -1, listeners, attributes,
    setAttribute(name, value) { attributes[name] = String(value); },
    removeAttribute(name) { delete attributes[name]; },
    addEventListener(type, listener) { listeners[type] = listener; },
    closest(selector) { return selector === '.card' ? parentElement : null; },
    focus() { document.activeElement = this; },
    click() { this.clicked = true; },
    id
  };
}
function cardNode(id, parentElement) {
  return { dataset: { id }, parentElement, classList: classList() };
}
const tree = {
  rows: [], tabIndex: -1, classList: classList(), parentElement: null,
  querySelectorAll(selector) { return selector === '.card>.row' ? this.rows : []; },
  contains(node) { for (let current = node; current; current = current.parentElement) if (current === this) return true; return false; },
  focus() { document.activeElement = this; }
};
const topCard = cardNode('top', tree), topRow = rowNode('top', topCard);
const hiddenChildren = { parentElement: topCard, classList: classList('hidden') };
const childCard = cardNode('child', hiddenChildren), childRow = rowNode('child', childCard);
const otherCard = cardNode('other', tree), otherRow = rowNode('other', otherCard);
tree.rows = [topRow, childRow, otherRow];

const nodes = [
  { id: 'top', children: [{ id: 'child', children: [] }] },
  { id: 'child', children: [] },
  { id: 'other', children: [] }
];
const controls = Object.fromEntries(['focusSelected','showAll','collapse','reveal','filePrevious','fileNext','fileSlider','fileSelect'].map(id => [id, {
  id, dataset: {}, title: '', disabled: false, setAttribute(name, value) { this[name] = value; }, removeAttribute(name) { delete this[name]; }
}]));
controls.tree = tree;
controls.controllerDocsBody = { querySelectorAll: () => [] };
document.querySelectorAll = selector => selector === '[data-nav-mode]' || selector === '[data-file-id]' ? [] : [];
const unrelated = { id: 'search', parentElement: null, focus() { document.activeElement = this; } };
document.activeElement = unrelated;
let nextRows = null;
const context = {
  document,
  model: { navigation: { visibleItems: [], currentId: null } },
  selected: nodes[1], focusId: null, collapsed: new Set(['top']),
  all: () => nodes,
  idFor: node => node.id,
  $: id => controls[id],
  render() { if (nextRows) tree.rows = nextRows; },
  renderFileNavigation() {},
  controllerDocumentation() {}
};
vm.runInNewContext(codeStructureAccessibilityClientScript(), context);

assert.strictEqual(topRow.tabIndex, 0, 'first visible row is the fallback tab stop when the logical selection is collapsed');
assert.strictEqual(childRow.tabIndex, -1, 'collapsed descendant is never a keyboard tab stop');
let prevented = false;
topRow.listeners.keydown({ key: 'ArrowDown', preventDefault() { prevented = true; } });
assert(prevented, 'tree navigation consumes handled arrows');
assert.strictEqual(document.activeElement, otherRow, 'tree navigation skips collapsed descendants');

document.activeElement = unrelated;
nextRows = [otherRow];
context.render();
assert.strictEqual(context.selected, nodes[1], 'filtering does not discard the retained logical selection');
assert.strictEqual(otherRow.tabIndex, 0, 'first visible row becomes the tab stop when the retained selection is filtered out');
assert.strictEqual(document.activeElement, unrelated, 'filter rerender does not steal focus from an unrelated control');

nextRows = [];
context.render();
assert.strictEqual(tree.tabIndex, 0, 'empty results leave the named tree itself keyboard reachable');
assert.strictEqual(document.activeElement, unrelated, 'empty results do not steal unrelated focus');

hiddenChildren.classList.remove('hidden');
nextRows = [topRow, childRow, otherRow];
context.render();
assert.strictEqual(childRow.tabIndex, 0, 'the retained selection recovers its tab stop when it becomes visible again');
assert.strictEqual(document.activeElement, unrelated, 'selection recovery still does not steal unrelated focus');

document.activeElement = otherRow;
nextRows = [topRow];
context.render();
assert.strictEqual(document.activeElement, topRow, 'a removed focused row recovers to the first visible row');

console.log('Code Structure generated-client visible-row keyboard, filter, empty, recovery, and focus tests passed');
