'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const messages = [];
const commands = [];
const disposalListeners = [];
let receive = null;
let disposed = false;
let reveals = 0;
const panel = {
  title: '', viewColumn: 2, active: true,
  webview: {
    html: '',
    onDidReceiveMessage(listener) { receive = listener; return { dispose() {} }; },
    postMessage(message) { messages.push(message); return true; }
  },
  reveal() { reveals += 1; },
  dispose() { disposed = true; for (const listener of disposalListeners) listener(); },
  onDidDispose(listener) { disposalListeners.push(listener); return { dispose() {} }; },
  onDidChangeViewState() { return { dispose() {} }; }
};
const vscode = {
  ViewColumn: { Beside: 2 },
  window: { createWebviewPanel() { return panel; } },
  commands: { async executeCommand(command) { commands.push(command); } }
};
const original = Module._load;
Module._load = function (request, parent, main) { if (request === 'vscode') return vscode; return original.call(this, request, parent, main); };

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'air-transfer-routes-'));
  try {
    const browser = require('../src/air_transfer_browser');
    const filename = path.join(root, 'route.air');
    fs.writeFileSync(filename, '[Begin Action 0]\n0,0, 0,0, 1\n');
    const fingerprint = crypto.createHash('sha256').update('route').digest('hex').toUpperCase();
    const calls = { focus: 0, copy: [], selection: [], drop: [] };
    await browser.open(filename, { role: 'source', sessionId: 'route-session', generation: 1, sourceHandleId: 'source-handle', fingerprint, callbacks: {
      focus() { calls.focus += 1; }, copy(indices) { calls.copy.push(indices); }, selection(indices) { calls.selection.push(indices); }, drop(...args) { calls.drop.push(args); }
    } });
    assert.strictEqual(typeof receive, 'function', 'the actual panel host must register its route receiver');
    await receive({ type: 'focus' }); assert.strictEqual(calls.focus, 1, 'Focus Viewer reaches the pinned endpoint callback');
    await receive({ type: 'float' }); assert.strictEqual(reveals, 1, 'Float reveals the exact browser before moving it'); assert.deepStrictEqual(commands, ['workbench.action.moveEditorToNewWindow']);
    await receive({ type: 'copy', physicalIndices: [] });
    await receive({ type: 'copy', physicalIndices: [0, 0] });
    await receive({ type: 'copy', physicalIndices: [99] });
    assert.deepStrictEqual(calls.copy, [], 'empty, duplicate, and stale copy messages cannot reach the callback');
    await receive({ type: 'copy', physicalIndices: [0] }); assert.deepStrictEqual(calls.copy, [[0]], 'an exact current source selection reaches Copy exactly once');
    await receive({ type: 'selection', physicalIndices: [0, 99], selected: 0, anchor: 0 }); assert.deepStrictEqual(calls.selection, [[0]], 'selection callbacks receive only current physical occurrences');
    await receive({ type: 'drop', authority: {}, boundary: {} }); assert.deepStrictEqual(calls.drop, [], 'a forged drop message cannot reach a source-browser callback');
    await receive({ type: 'close' }); assert.strictEqual(disposed, true, 'Close Browser disposes the exact session-owned panel');
    console.log('AIR Transfer browser Focus, Float, guarded Copy/selection, and Close host routes passed');
  } finally {
    Module._load = original;
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
