'use strict';

const assert = require('assert');
const { reorderPaletteOptions, selectedPaletteFiles } = require('../src/palette_batch_ui');

function select(values, selected) {
  const options = values.map((value) => ({ value, selected: selected.includes(value), parent: null, get previousElementSibling() { const at = this.parent.options.indexOf(this); return at > 0 ? this.parent.options[at - 1] : null; }, get nextElementSibling() { const at = this.parent.options.indexOf(this); return at + 1 < this.parent.options.length ? this.parent.options[at + 1] : null; } }));
  const owner = { options, get selectedOptions() { return this.options.filter((item) => item.selected); }, insertBefore(option, before) { const from = this.options.indexOf(option); this.options.splice(from, 1); const at = before ? this.options.indexOf(before) : this.options.length; this.options.splice(at, 0, option); } };
  for (const option of options) option.parent = owner; return owner;
}

const contiguous = select(['a', 'b', 'c', 'd'], ['b', 'c']); reorderPaletteOptions(contiguous, -1);
assert.deepStrictEqual(contiguous.options.map((item) => item.value), ['b', 'c', 'a', 'd']);
assert.deepStrictEqual(selectedPaletteFiles(contiguous), ['b', 'c']);
const separated = select(['a', 'b', 'c', 'd', 'e'], ['b', 'd']); reorderPaletteOptions(separated, 1);
assert.deepStrictEqual(separated.options.map((item) => item.value), ['a', 'c', 'b', 'e', 'd']);
assert.deepStrictEqual(selectedPaletteFiles(separated), ['b', 'd'], 'posted injection order must follow visible DOM order');

console.log('palette batch UI reorder and posted visible-order tests passed');
