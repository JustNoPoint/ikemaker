'use strict';
const assert = require('assert');
const authority = require('../src/map_registry_insertion_authority');

const sent = [], disposeListeners = [];
const panel = {
  webview: { postMessage: async message => { sent.push(message); return true; } },
  onDidDispose(listener) { disposeListeners.push(listener); return { dispose() {} }; }
};
const capture = { surface: 'helper', id: 'helper-maps', expected: 'value', epoch: 2, bridgeEpoch: 4, start: 5, end: 5, grammar: 'map-table', language: 'zss' };
const target = authority.makeVisualTarget(panel, 'helper', capture, 'scope', 1);
assert(target && Object.isFrozen(target));
assert.equal(authority.makeVisualTarget(panel, 'helper', { ...capture, extra: true }, 'scope', 1), null);
authority.attachPanel(panel);

(async () => {
  const preparing = authority.prepare(panel, target, 7, 'map(alpha)');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent.pop().type, 'ikemenMapInsertPrepare');
  assert.equal(authority.handleBridgeMessage(panel, { type: 'ikemenMapInsertReady', requestId: 7, bridgeEpoch: 4, ok: true, code: 'ok', extra: true }), false);
  assert.equal(authority.handleBridgeMessage(panel, { type: 'ikemenMapInsertReady', requestId: 7, bridgeEpoch: 4, ok: true, code: 'ok' }), true);
  assert.deepEqual(await preparing, { ok: true, code: 'ok' });
  const committing = authority.commit(panel, target, 7);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent.pop().type, 'ikemenMapInsertCommit');
  assert.equal(authority.handleBridgeMessage(panel, { type: 'ikemenMapInsertResult', requestId: 8, bridgeEpoch: 4, ok: true, code: 'ok' }), false);
  assert.equal(authority.handleBridgeMessage(panel, { type: 'ikemenMapInsertResult', requestId: 7, bridgeEpoch: 4, ok: true, code: 'ok' }), true);
  assert.deepEqual(await committing, { ok: true, code: 'ok' });

  const timedOut = authority.prepare(panel, target, 8, 'map(timeout)', 10);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(await timedOut, { ok: false, code: 'timeout' });
  assert(sent.some(message => message.type === 'ikemenMapInsertAbort' && message.requestId === 8), 'timeout aborts and clears its exact request');

  const readyForLostResult = authority.prepare(panel, target, 10, 'map(result_loss)');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(authority.handleBridgeMessage(panel, { type: 'ikemenMapInsertReady', requestId: 10, bridgeEpoch: 4, ok: true, code: 'ok' }), true);
  await readyForLostResult;
  const lostResult = authority.commit(panel, target, 10, 10);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(await lostResult, { ok: false, code: 'timeout' });
  assert.equal(authority.handleBridgeMessage(panel, { type: 'ikemenMapInsertResult', requestId: 10, bridgeEpoch: 4, ok: true, code: 'ok' }), false, 'late result cannot resolve a timed-out request');

  const pending = authority.prepare(panel, target, 9, 'map(beta)', 1000);
  await new Promise(resolve => setImmediate(resolve));
  disposeListeners[0]();
  assert.equal((await pending).ok, false);
  assert(sent.some(message => message.type === 'ikemenMapInsertAbort' && message.requestId === 9));
  console.log('Maps Registry M2 strict visual bridge handshake, forged-id refusal and disposal cleanup tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
