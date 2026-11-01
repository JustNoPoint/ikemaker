'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function panelHarness() {
  const disposal = [];
  const state = { receive: null, disposed: false };
  const panel = {
    title: '', viewColumn: 2,
    webview: {
      html: '',
      onDidReceiveMessage(listener) { state.receive = listener; return { dispose() {} }; },
      postMessage() { return true; }
    },
    reveal() {},
    dispose() { state.disposed = true; for (const listener of disposal) listener(); },
    onDidDispose(listener) { disposal.push(listener); return { dispose() {} }; },
    onDidChangeViewState() { return { dispose() {} }; }
  };
  return { panel, state };
}

const vscode = {
  ViewColumn: { Beside: 2 },
  Uri: { file(fsPath) { return { fsPath }; } },
  commands: { async executeCommand() {} },
  window: {}
};
const original = Module._load;
Module._load = function (request, parent, main) {
  if (request === 'vscode') return vscode;
  if (request === './viewer_navigation' && parent?.filename?.endsWith('snd_browser.js')) return { associatedDefs() { return []; } };
  if (request === './authoring_context_registry' && parent?.filename?.endsWith('snd_browser.js')) return { registerAuthoringPanel() {} };
  if (request === './entity_switch_runtime' && parent?.filename?.endsWith('snd_browser.js')) return { attachEntitySurface() {} };
  return original.call(this, request, parent, main);
};

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snd-transfer-browser-routes-'));
  try {
    const browser = require('../src/snd_browser');
    const filename = path.join(root, 'source.snd');
    fs.writeFileSync(filename, Buffer.from('SND route fixture'));
    const archive = { filename, buffer: Buffer.alloc(0), entries: [
      { archiveIndex: 0, group: 1, index: 2, identity: '1,2', wav: { durationSeconds: 0.1, valid: true } },
      { archiveIndex: 1, group: 1, index: 3, identity: '1,3', wav: { durationSeconds: 0.2, valid: true } }
    ] };
    const calls = { focus: 0, selection: [], copy: 0 };
    const source = panelHarness();
    await browser.attach(source.panel, filename, archive, {
      transferPinned: true, transferRole: 'source', transferSessionId: 'route-session', transferGeneration: 1, transferSourceHandleId: 'source-handle',
      transferCallbacks: {
        focus() { calls.focus += 1; },
        selectionChanged(items, projection) { calls.selection.push({ indices: items.map(item => item.physicalIndex), projection }); },
        copy() { calls.copy += 1; }
      }
    });
    assert.strictEqual(typeof source.state.receive, 'function', 'the actual SND browser host registers its route receiver');
    await source.state.receive({ type: 'transferFocus' });
    assert.strictEqual(calls.focus, 1, 'Focus Viewer reaches the pinned endpoint callback');
    for (const marked of [[], [0, 0], [99], ['0']]) await source.state.receive({ type: 'transferCopy', marked, selected: 0, anchor: 0 });
    assert.strictEqual(calls.copy, 0, 'empty, duplicate, stale, and non-integer selections cannot reach Copy');
    assert.deepStrictEqual(calls.selection, [], 'invalid Copy requests cannot replace retained transfer selection');
    await source.state.receive({ type: 'transferCopy', marked: [1], selected: 1, anchor: 1 });
    assert.strictEqual(calls.copy, 1, 'an exact current source selection reaches Copy exactly once');
    assert.deepStrictEqual(calls.selection[0], { indices: [1], projection: { selected: 1, marked: [1], anchor: 1 } }, 'Copy first updates authority from the same exact selection it copies');

    const destination = panelHarness();
    await browser.attach(destination.panel, filename, archive, {
      transferPinned: true, transferRole: 'destination', transferSessionId: 'route-session', transferGeneration: 1, transferSourceHandleId: 'source-handle',
      transferCallbacks: { copy() { calls.copy += 100; } }
    });
    await destination.state.receive({ type: 'transferCopy', marked: [0], selected: 0, anchor: 0 });
    assert.strictEqual(calls.copy, 1, 'a destination browser cannot invoke the source-only Copy route');
    await source.state.receive({ type: 'close' });
    assert.strictEqual(source.state.disposed, true, 'Close Browser disposes the exact session-owned panel');
    console.log('SND Transfer browser Focus, exact guarded Copy authority, destination rejection, and Close routes passed');
  } finally {
    Module._load = original;
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { Module._load = original; console.error(error); process.exitCode = 1; });
