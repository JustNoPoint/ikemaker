'use strict';

const assert = require('assert');
const Module = require('module');

const originalLoad = Module._load;
let clipboardWrites = 0;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return { workspace: {}, window: {}, commands: {}, ViewColumn: {}, env: { clipboard: { writeText: async () => { clipboardWrites += 1; } } } };
  return originalLoad.call(this, request, parent, main);
};
const { attachMessages, assertLegacyRuntimeWriterAllowed } = require('../src/air_viewer');
Module._load = originalLoad;

assert.throws(() => assertLegacyRuntimeWriterAllowed({ entry: { kind: 'OverrideClsn' } }, true), /reviewed AIR Actions Browser/);
assert.throws(() => assertLegacyRuntimeWriterAllowed({ kind: '  TRANSFORMCLSN  ' }), /reviewed AIR Actions Browser/);
assert.strictEqual(assertLegacyRuntimeWriterAllowed({ entry: { kind: 'width' } }, true), 'width');
const hostile = {};
Object.defineProperty(hostile, 'kind', { get() { throw new Error('getter must not run'); } });
assert.throws(() => assertLegacyRuntimeWriterAllowed(hostile), /kind is invalid/);

let receiver;
const messages = [];
const session = {
  airPath: 'C:\\fixture\\Anim.air',
  panel: { webview: { onDidReceiveMessage(callback) { receiver = callback; return { dispose() {} }; }, postMessage(message) { messages.push(message); } } }
};
attachMessages(session, null);

(async () => {
  const requests = [
    { type: 'saveRuntime', entry: { kind: 'OverrideClsn' }, runtimeRequestId: 'save' },
    { type: 'removeRuntime', kind: 'TransformClsn', runtimeRequestId: 'remove' },
    { type: 'copyRuntime', kind: ' overrideclsn ', runtimeRequestId: 'copy' }
  ];
  for (const request of requests) await receiver(request);
  assert.strictEqual(messages.length, 3);
  for (const message of messages) assert(message.type === 'error' && /reviewed AIR Actions Browser/.test(message.message));
  assert.strictEqual(clipboardWrites, 0, 'legacy protected-kind requests cannot reach clipboard effects');
  assert.strictEqual(session.runtimeBusy, undefined, 'legacy protected-kind requests are rejected before busy-state mutation');
  console.log('AIR host rejects forged legacy OverrideClsn/TransformClsn writers before side effects');
})().catch(error => { console.error(error); process.exitCode = 1; });
