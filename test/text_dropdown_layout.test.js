'use strict';

const assert = require('assert');
const {
  cloneLayout,
  leafPaths,
  resizeDropdownLayout,
  topologyFingerprint,
  prepareDropdownLayout,
  restoreDropdownLayout
} = require('../src/text_dropdown_layout');

const source = {
  orientation: 0,
  marker: 'root',
  groups: [
    {
      size: 0.7,
      marker: 'left',
      groups: [
        { size: 0.2, marker: 'header' },
        { size: 0.5, marker: 'source' },
        { size: 0.3, marker: 'console' }
      ]
    },
    { size: 0.3, marker: 'right' }
  ]
};

const cloned = cloneLayout(source);
assert.deepStrictEqual(cloned, source);
assert.notStrictEqual(cloned, source);
assert.notStrictEqual(cloned.groups, source.groups);
assert.deepStrictEqual(leafPaths(source), [[0, 0], [0, 1], [0, 2], [1]], 'leaves use stable traversal/view-column order');

const expanded = resizeDropdownLayout(source, 0, 3, 0.72);
assert(expanded, 'nested header leaf has a vertical ancestor');
assert.deepStrictEqual(source.groups[0].groups.map(group => group.size), [0.2, 0.5, 0.3], 'source layout is never mutated');
assert(Math.abs(expanded.groups[0].groups[0].size - 0.6) < 1e-12, 'nearest vertical ancestor path child expands by the requested factor');
assert(Math.abs(expanded.groups[0].groups[1].size - 0.25) < 1e-12, 'first sibling retains its proportional share');
assert(Math.abs(expanded.groups[0].groups[2].size - 0.15) < 1e-12, 'second sibling retains its proportional share');
assert.strictEqual(expanded.groups[0].size, 0.7, 'unrelated ancestor sizes remain unchanged');
assert.strictEqual(expanded.groups[1].marker, 'right', 'unrelated properties and topology remain intact');

const capped = resizeDropdownLayout(source, 0, 10);
assert.strictEqual(capped.groups[0].groups[0].size, 0.72, 'expansion observes the default ratio cap');
assert(Math.abs(capped.groups[0].groups.slice(1).reduce((sum, group) => sum + group.size, 0) - 0.28) < 1e-12);

const prepared = prepareDropdownLayout(source, 0, 3);
assert(prepared && Object.isFrozen(prepared));
assert.strictEqual(prepared.snapshotTopology, prepared.expandedTopology, 'size-only expansion retains one topology fingerprint');
assert.notStrictEqual(prepared.snapshot, source);
const restored = restoreDropdownLayout(prepared.expanded, prepared);
assert.deepStrictEqual(restored, source, 'restore returns the exact full pre-open layout snapshot');
restored.groups[0].marker = 'changed';
assert.strictEqual(prepared.snapshot.groups[0].marker, 'left', 'restore returns a defensive clone of the snapshot');

const resizedOnly = cloneLayout(prepared.expanded);
resizedOnly.groups[1].size = 0.1;
assert.deepStrictEqual(restoreDropdownLayout(resizedOnly, prepared), source, 'unrelated size drift does not look like structural drift');
const structurallyChanged = cloneLayout(prepared.expanded);
structurallyChanged.groups.push({ size: 0.1, marker: 'new-group' });
assert.strictEqual(restoreDropdownLayout(structurallyChanged, prepared), null, 'restore refuses to overwrite a changed topology');
assert.notStrictEqual(topologyFingerprint(source), topologyFingerprint(structurallyChanged));

const rootRows = { orientation: 1, label: 'rows', groups: [{ size: 0.28, label: 'header' }, { size: 0.72, label: 'source' }] };
assert.strictEqual(resizeDropdownLayout(rootRows, 0, 4).groups[0].size, 0.72, 'canonical two-row layouts continue to work');
assert.strictEqual(resizeDropdownLayout({ orientation: 0, groups: [{}, {}] }, 0, 2), null, 'a layout without a vertical split is not destructively rewritten');
assert.strictEqual(resizeDropdownLayout(source, 99, 2), null, 'invalid leaf ordinals are rejected');

console.log('Text dropdown recursive layout transform tests passed');
