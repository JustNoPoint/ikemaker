'use strict';

const assert = require('assert');
const model = require('../src/test_session_model');

const catalog = model.normalizeCatalog({
  profiles: [{ id: 'sf6', name: 'SF6' }],
  suites: [
    { id: 'universal', name: 'Universal', scope: { kind: 'universal-engine', value: 'ikemen-1.0' }, tests: [{ id: 'hit', name: 'Hit' }] },
    { id: 'sf6', name: 'SF6 only', scope: { kind: 'game-profile', value: 'sf6' }, tests: [{ id: 'counter', name: 'Counter' }] },
    { id: 'hdbz', name: 'HDBZ only', scope: { kind: 'game-profile', value: 'hdbz' }, tests: [{ id: 'beam', name: 'Beam' }] }
  ]
});

assert.strictEqual(model.appliesTo(catalog.suites[0], 'default'), true);
assert.strictEqual(model.appliesTo(catalog.suites[1], 'sf6'), true);
assert.strictEqual(model.appliesTo(catalog.suites[1], 'hdbz'), false);
assert.deepStrictEqual(model.sessionPlan(catalog, { profile: 'sf6', kind: 'test' }).tests.map(test => test.id), ['hit', 'counter']);
assert.deepStrictEqual(model.sessionPlan(catalog, { profile: 'hdbz', kind: 'test' }).tests.map(test => test.id), ['hit', 'beam']);
assert.deepStrictEqual(model.validateCatalog(catalog), []);
const imported = model.legacyChecklist('@participants: P1 Ryu; P2 Ryu\n@logger-test: 3|Hit and guard|Perform both.\n', { id: 'legacy', profile: 'sf6' });
assert.strictEqual(imported.tests.length, 1);
assert.strictEqual(imported.tests[0].evidenceMask, 3);
assert.strictEqual(imported.tests[0].participants, 'P1 Ryu; P2 Ryu');
assert.deepStrictEqual(imported.scope, { kind: 'game-profile', value: 'sf6' });
console.log('test_session_model tests passed');
