'use strict';

const assert = require('assert');
const { RUNTIME_CAPABILITY_IDS } = require('../src/runtime_capability_ids');

for (const id of ['zss.dynamic-map-keys', 'zss.dynamic-state-types', 'zss.animation-prefix-query']) {
  assert(RUNTIME_CAPABILITY_IDS.includes(id), `${id} is projected from exact engine policy into live editor assistance`);
}
assert.strictEqual(new Set(RUNTIME_CAPABILITY_IDS).size, RUNTIME_CAPABILITY_IDS.length, 'runtime capability projection has no duplicate decisions');
assert(Object.isFrozen(RUNTIME_CAPABILITY_IDS), 'runtime capability projection is an immutable reviewed contract');
console.log('Runtime capability projection tests passed');
