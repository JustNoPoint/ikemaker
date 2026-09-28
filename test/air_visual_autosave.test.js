'use strict';

const assert = require('assert');
const Module = require('module');

let enabled = false;
const messages = [];
const vscode = {
  Uri: { file: (fsPath) => ({ fsPath }) },
  workspace: {
    getConfiguration(section, scope) {
      assert.strictEqual(section, 'ikemenZss');
      assert.strictEqual(scope.fsPath, 'C:\\game\\chars\\Ryu\\Anim.air');
      return { get: (name, fallback) => name === 'autoSave' ? enabled : fallback };
    }
  }
};
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return vscode;
  return originalLoad.call(this, request, parent, isMain);
};
const { autoSaveAirDocument, finishFrameEdit } = require('../src/air_viewer');
Module._load = originalLoad;

function sourceDocument() {
  return {
    fileName: 'C:\\game\\chars\\Ryu\\Anim.air',
    isDirty: true,
    saveCalls: 0,
    async save() { this.saveCalls += 1; this.isDirty = false; return true; }
  };
}

const session = {
  airPath: 'C:\\game\\chars\\Ryu\\Anim.air',
  panel: { webview: { async postMessage(message) { messages.push(message); return true; } } }
};

(async () => {
  const off = sourceDocument();
  assert.strictEqual(await autoSaveAirDocument(session, off), null);
  assert.strictEqual(off.saveCalls, 0, 'disabled IKEMaker Auto Save must not write the AIR source');

  enabled = true;
  const on = sourceDocument(), result = await autoSaveAirDocument(session, on);
  assert(result.ok && !result.dirty);
  assert.strictEqual(on.saveCalls, 1, 'enabled IKEMaker Auto Save saves the exact mutated AIR document once');
  assert(messages.some((item) => item.type === 'sourceSaveStatus' && /saved to disk/.test(item.message)), 'AIR Auto Save reports confirmed disk persistence');

  let releaseSave;
  const delayed = sourceDocument();
  delayed.save = async function save() {
    this.saveCalls += 1;
    await new Promise((resolve) => { releaseSave = resolve; });
    this.isDirty = false;
    return true;
  };
  messages.length = 0;
  const finishing = finishFrameEdit(session, delayed, { action: 0, frameIndex: 0, status: 'applied' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(messages[0]?.type, 'frameEditApplied', 'the viewer is released before Auto Save can delay or fail');
  assert.strictEqual(delayed.saveCalls, 1);
  releaseSave();
  await finishing;
  assert.strictEqual(messages[1]?.type, 'sourceSaveStatus', 'disk persistence is reported after the viewer edit acknowledgment');
  console.log('AIR visual edits honor IKEMaker Auto Save and report exact disk persistence');
})().catch((error) => { console.error(error); process.exitCode = 1; });
