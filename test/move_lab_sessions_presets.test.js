'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const panels = [], registrations = [], close = new Map();
function makePanel() { const receivers = [], disposers = [], messages = []; const panel = { webview: { cspSource: 'test', html: '', onDidReceiveMessage(fn) { receivers.push(fn); }, postMessage(message) { messages.push(message); return true; } }, onDidDispose(fn) { disposers.push(fn); }, reveal() {}, dispose() { disposers.forEach(fn => fn()); }, receivers, messages }; panels.push(panel); return panel; }
const vscode = { ViewColumn: { Active: 1 }, Uri: { file: fsPath => ({ fsPath }) }, workspace: { textDocuments: [], asRelativePath: value => value }, languages: { getDiagnostics: () => [], onDidChangeDiagnostics: () => ({}) }, commands: { executeCommand: async () => undefined }, window: { activeTextEditor: null, createWebviewPanel: makePanel, showErrorMessage(message) { throw new Error(message); } } };
const original = Module._load;
Module._load = function(request, parent, main) {
  if (request === 'vscode') return vscode;
  if (request === './character_picker' && /move_lab_workspace/.test(parent?.filename || '')) return { nearestCharacterDef: value => /\.def$/i.test(value) && fs.existsSync(value) ? value : '', chooseCharacterDef: async () => '' };
  if (request === './viewer_group' && /move_lab_workspace/.test(parent?.filename || '')) return { preferredViewerColumn: () => 2, trackViewerPanel: value => value };
  if (request === './authoring_context_registry' && /move_lab_workspace/.test(parent?.filename || '')) return { registerCharacterToolPanel() {} };
  if (request === './webview_policy' && /move_lab_workspace/.test(parent?.filename || '')) return { protect: value => value };
  if (request === './viewer_sessions' && /move_lab_workspace/.test(parent?.filename || '')) return { register: (panel, file, kind) => registrations.push({ panel, file, kind }) };
  if (request === './viewer_close' && /move_lab_workspace/.test(parent?.filename || '')) return { support: (panel, value) => close.set(panel, value) };
  return original.call(this, request, parent, main);
};
const workspace = require('../src/move_lab_workspace');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-move-sessions-'));
  try {
    const make = name => { const folder = path.join(root, name); fs.mkdirSync(folder); const def = path.join(folder, `${name}.def`); fs.writeFileSync(def, `[Info]\nname=${name}\n[Files]\nst=states.zss\n`); fs.writeFileSync(path.join(folder, 'states.zss'), '[StateDef 0]\n'); return def; };
    const a = make('A'), b = make('B'), c = make('C');
    const first = await workspace.openMoveLab(vscode.Uri.file(a)), second = await workspace.openMoveLab(vscode.Uri.file(b));
    assert(first && second && first !== second, 'different characters keep separate Move Lab panels'); assert.strictEqual(registrations.filter(item => item.kind === 'move_lab').length, 2); assert(close.has(first) && close.has(second));
    assert.strictEqual(await workspace.openMoveLab(vscode.Uri.file(a)), first, 'same character reuses its owned panel');
    const reference = { defPath: a, mode: 'throw' }; assert.strictEqual(await workspace.openMoveLab(vscode.Uri.file(a), { preset: true, reference }), first); assert(first.messages.some(message => message.type === 'viewerHistoryRestore' && message.reference.mode === 'throw'));
    const before = panels.length; assert.strictEqual(await workspace.openMoveLab(vscode.Uri.file(c), { preset: true, reference: { defPath: c, mode: 'not-a-mode' } }), undefined); assert.strictEqual(panels.length, before, 'invalid preset is rejected before panel creation');
    first.dispose(); second.dispose();
    assert(workspace.validMoveReference({ defPath: c, mode: 'overview' }, { visual: { actions: [] } }, c));
    console.log('Move Lab character ownership and typed selection restoration passed');
  } finally { Module._load = original; fs.rmSync(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
