'use strict';
const assert = require('assert');
const { validateDependency } = require('../src/ownership_dependency');
assert.strictEqual(validateDependency({ ownership: 'universal' }, { ownership: 'game' }).allowed, false);
assert.strictEqual(validateDependency({ ownership: 'game', projectId: 'ds4' }, { ownership: 'game', projectId: 'dsvssf' }).allowed, false);
assert.strictEqual(validateDependency({ ownership: 'character', characterId: 'ryu' }, { ownership: 'game', projectId: 'sf6' }).allowed, true);
console.log('Ownership dependency tests passed');
