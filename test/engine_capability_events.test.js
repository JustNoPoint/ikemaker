'use strict';

const assert = require('assert');
const {
  onDidChangeEngineCapabilities,
  notifyEngineCapabilitiesChanged
} = require('../src/engine_capability_events');

const received = [];
const healthy = onDidChangeEngineCapabilities((event) => received.push(event));
const failing = onDidChangeEngineCapabilities(() => { throw new Error('observer failure'); });

assert.strictEqual(notifyEngineCapabilitiesChanged('  exact-build-reverified  '), true);
assert.deepStrictEqual(received, [{ reason: 'exact-build-reverified' }]);

failing.dispose();
healthy.dispose();
notifyEngineCapabilitiesChanged('after-disposal');
assert.strictEqual(received.length, 1, 'disposed observers receive no later capability events');

assert.throws(
  () => onDidChangeEngineCapabilities(null),
  /listener must be a function/i,
  'only callable capability observers are admitted'
);

console.log('Engine capability event tests passed');
