'use strict';

const assert = require('assert');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return { workspace: {}, window: {}, commands: {}, ViewColumn: {} };
  return originalLoad.call(this, request, parent, main);
};
const { attachMessages } = require('../src/air_viewer');
Module._load = originalLoad;

let receiver = null, sourceCalls = 0, runCalls = 0;
const messages = [], service = {
  async visualSource(session, message) {
    sourceCalls += 1;
    assert.strictEqual(session.airPath, 'C:\\fixture\\Anim.air');
    assert.deepStrictEqual({ action: message.action, frameIndex: message.frameIndex, snapshot: message.sourceSnapshot.actionText }, { action: 10, frameIndex: 1, snapshot: '[Begin Action 10]\n10,0,0,0,1' });
    return { kind: 'visual', session, selection: { action: 10, frameIndex: 1 } };
  },
  async run(source) { runCalls += 1; assert.strictEqual(source.kind, 'visual'); }
};
const session = { airPath: 'C:\\fixture\\Anim.air', panel: { webview: { onDidReceiveMessage(callback) { receiver = callback; return { dispose() {} }; }, postMessage(message) { messages.push(message); } } } };
attachMessages(session, service);

(async () => {
  await receiver({ type: 'batchClsn2', action: 10, frameIndex: 1, pendingGuardPassed: true, sourceSnapshot: { actionText: '[Begin Action 10]\n10,0,0,0,1' } });
  assert.strictEqual(sourceCalls, 1);
  assert.strictEqual(runCalls, 1);
  assert.strictEqual(typeof session.refreshAfterClsn2, 'function', 'the captured visual source receives the selection-preserving refresh callback');
  assert.strictEqual(messages.length, 0, 'routing itself must not reveal line 1 or emit unrelated messages');

  const failing = { async visualSource() { throw new Error('closed session'); }, async run() { throw new Error('must not run'); } };
  attachMessages(session, failing);
  await receiver({ type: 'batchClsn2', action: 10, frameIndex: 1, pendingGuardPassed: true, sourceSnapshot: {} });
  assert(messages.some((message) => message.type === 'error' && /closed session/.test(message.message)), 'visual adapter failures must return to the viewer without editing');
  console.log('AIR visual Clsn2 host routing tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
