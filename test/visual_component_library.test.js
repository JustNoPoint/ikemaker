'use strict';

const assert = require('assert');
const { createVisualComponentLibrary, STORAGE_KEY } = require('../src/visual_component_library');

class MemoryStorage {
  constructor(seed = {}) { this.values = { ...seed }; this.updates = []; }
  get(key, fallback) { return Object.prototype.hasOwnProperty.call(this.values, key) ? this.values[key] : fallback; }
  async update(key, value) { this.values[key] = JSON.parse(JSON.stringify(value)); this.updates.push({ key, value: this.values[key] }); }
}

(async () => {
  const storage = new MemoryStorage(), library = createVisualComponentLibrary(storage);
  assert.strictEqual(library.key, STORAGE_KEY);
  assert.deepStrictEqual(library.list(), []);
  const clouds = { kind: 'stage-background', name: 'Cloud bank', entries: [{ key: 'type', value: 'normal' }, { key: 'spriteno', value: '2,3' }] };
  await library.save(clouds);
  assert.strictEqual(library.list('stage-background').length, 1);
  assert.strictEqual(library.list('ui-element-group').length, 0);
  await library.save({ ...clouds, entries: [{ key: 'type', value: 'parallax' }] });
  assert.strictEqual(library.list().length, 1, 'saving the same component identity replaces its stored definition');
  assert.strictEqual(library.list()[0].entries[0].value, 'parallax');
  await library.remove(library.list()[0].id);
  assert.deepStrictEqual(library.list(), []);
  await assert.rejects(() => library.remove('missing'), /no longer exists/);
  assert(storage.updates.length >= 3);
  assert.throws(() => createVisualComponentLibrary({}), /storage is unavailable/);
  console.log('Persistent reusable visual component library tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
