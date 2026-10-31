'use strict';

const assert = require('assert');
const { AssetWorkSets } = require('../src/asset_work_sets');
const { snapshot, createWorkSet } = require('../src/sff_batch_scope');

const values = new Map(), state = { get: (key, fallback) => values.has(key) ? values.get(key) : fallback, update: async (key, value) => values.set(key, value) };
const store = new AssetWorkSets(state, '/project');
const snap = snapshot({ buffer: Buffer.from('a'), sprites: [{ group: 1, number: 0 }] }, '/project/a.sff');
const set = createWorkSet(snap, 'Main', [0]);

(async () => {
  await store.upsert('sff-sprite', '/project/a.sff', set);
  assert.strictEqual(store.read('sff-sprite', '/project/a.sff').length, 1);
  assert.strictEqual(store.read('sff-sprite', '/project/b.sff').length, 0);
  await store.remove('sff-sprite', '/project/a.sff', set.id);
  assert.strictEqual(store.read('sff-sprite', '/project/a.sff').length, 0);
  console.log('Asset work set tests passed.');
})().catch(error => { console.error(error); process.exit(1); });
