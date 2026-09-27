'use strict';

const assert = require('assert');
const Module = require('module');

let receiver;
let releaseSave;
const messages = [];
const document = {
  fileName: 'C:\\fixture\\Anim.air',
  uri: { fsPath: 'C:\\fixture\\Anim.air' },
  isDirty: true,
  getText: () => '[Begin Action 0]\n0,0,0,0,1',
  save() { return new Promise((resolve) => { releaseSave = () => { this.isDirty = false; resolve(true); }; }); }
};
const vscode = {
  workspace: { textDocuments: [document], openTextDocument: async () => document },
  window: {}
};
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return vscode;
  return originalLoad.call(this, request, parent, isMain);
};
const { attachMessages } = require('../src/air_viewer');
Module._load = originalLoad;

const session = {
  airPath: document.fileName,
  panel: { webview: {
    onDidReceiveMessage(callback) { receiver = callback; return { dispose() {} }; },
    postMessage(message) { messages.push(message); return Promise.resolve(true); }
  } }
};
attachMessages(session);

(async () => {
  const first = receiver({ type: 'saveAir' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(session.sourceSaveBusy, true, 'the first save owns the AIR source lock while document.save is pending');

  await receiver({ type: 'saveAir' });
  assert.strictEqual(session.sourceSaveBusy, true, 'a rejected second save must not release the first save lock');
  assert(messages.some((item) => item.type === 'sourceSaveStatus' && /current AIR edit or save/.test(item.message)), 'the second save reports that the exact AIR source is busy');

  await receiver({ type: 'updateFrame' });
  assert.strictEqual(session.sourceSaveBusy, true, 'a source mutation remains blocked until the owning save completes');
  assert(messages.some((item) => item.type === 'error' && /current AIR edit or save/.test(item.message)), 'the blocked mutation receives actionable feedback');

  releaseSave();
  await first;
  assert.strictEqual(session.sourceSaveBusy, false, 'only the owning save completion releases the source lock');
  assert(messages.some((item) => item.type === 'sourceSaveStatus' && /saved to disk/.test(item.message)), 'the completed save reports exact disk persistence');
  console.log('AIR exact-source save lock ownership and mutation serialization passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
