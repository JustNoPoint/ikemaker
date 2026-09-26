'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const commands = new Map(), panels = [], stored = {}, registrations = [], closeSupport = new Map();
function makePanel() {
  const receivers = [], disposers = [];
  const panel = { viewColumn: 2, active: true, webview: { cspSource: 'test', html: '', onDidReceiveMessage(fn) { receivers.push(fn); }, postMessage() { return true; } }, onDidDispose(fn) { disposers.push(fn); }, reveal() {}, dispose() { for (const fn of disposers) fn(); }, receivers };
  panels.push(panel); return panel;
}
const vscode = {
  ViewColumn: { Active: 1 }, Uri: { file: fsPath => ({ fsPath }) }, workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) },
  commands: { registerCommand(id, fn) { commands.set(id, fn); return { dispose() {} }; }, executeCommand: async () => undefined },
  window: { createWebviewPanel: makePanel, showErrorMessage(message) { throw new Error(message); }, activeTextEditor: null }
};
const original = Module._load;
Module._load = function(request, parent, main) {
  if (request === 'vscode') return vscode;
  if (request === './viewer_group' && /artist_intake_workspace/.test(parent?.filename || '')) return { preferredViewerColumn: () => 2, trackViewerPanel: panel => panel };
  if (request === './viewer_close' && /artist_intake_workspace/.test(parent?.filename || '')) return { support(panel, value) { closeSupport.set(panel, value); } };
  if (request === './webview_policy' && /artist_intake_workspace/.test(parent?.filename || '')) return { protect: value => value };
  if (request === './viewer_sessions' && /artist_intake_workspace/.test(parent?.filename || '')) return { has: () => false, register: (panel, file, kind) => registrations.push({ panel, file, kind }), updateSource() {} };
  return original.call(this, request, parent, main);
};
const intake = require('../src/artist_intake_workspace');
const storage = { get(key, fallback) { return stored[key] ?? fallback; }, async update(key, value) { stored[key] = value; } };
intake.registerArtistIntake({ workspaceState: storage, subscriptions: [] });

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-artist-preset-'));
  try {
    const png = path.join(root, '000.png'); fs.writeFileSync(png, Buffer.from('source-a'));
    const base = { sourceType: 'folder', sourceFiles: [png], frames: [], artistSource: path.basename(root) };
    const identity = intake.sourceIdentity(base), reference = { sourceType: 'folder', sourceFiles: [png], sheet: null, identity };
    const open = commands.get('ikemen.artistIntake.open');
    const first = await open(vscode.Uri.file(png), { preset: true, reference });
    assert(first, 'unchanged source should restore without a picker');
    assert.match(first.webview.html, /Discard recovered assignments/);
    assert.strictEqual(registrations.at(-1).kind, 'artist_intake');
    assert(closeSupport.has(first), 'artist intake participates in managed close');
    const host = first.receivers[0], draft = { assignments: [{ indices: [0], category: 'Special', name: 'Special 00', group: 1000, startIndex: 0, axisX: 3, axisY: 4 }], selected: [], fields: { category: 'Special', name: 'Special 01', group: 1010, start: 0, axisX: 3, axisY: 4 } };
    host({ type: 'artistDraft', identity, revision: 1, draft });
    await new Promise(resolve => setImmediate(resolve)); await closeSupport.get(first).keepDraft();
    first.dispose();
    const reopened = await open(vscode.Uri.file(png), { preset: true, reference });
    assert.match(reopened.webview.html, /Special 00/);
    assert.match(reopened.webview.html, /Recovered assignments for this exact source/);
    reopened.receivers[0]({ type: 'discardArtistDraft', identity });
    await new Promise(resolve => setImmediate(resolve)); reopened.dispose();
    const clean = await open(vscode.Uri.file(png), { preset: true, reference });
    assert.doesNotMatch(clean.webview.html, /"name":"Special 00"/);
    clean.dispose();
    fs.writeFileSync(png, Buffer.from('source-b'));
    const before = panels.length;
    assert.strictEqual(await open(vscode.Uri.file(png), { preset: true, reference }), undefined, 'changed source must reject stale preset and draft identity');
    assert.strictEqual(panels.length, before, 'stale source is rejected before opening a panel');
    const currentIdentity = intake.sourceIdentity({ ...base, sourceFiles: [png] }), currentReference = { ...reference, identity: currentIdentity };
    const current = await open(vscode.Uri.file(png), { preset: true, reference: currentReference });
    fs.writeFileSync(png, Buffer.from('source-c'));
    assert.strictEqual(await open(vscode.Uri.file(png), { preset: true, reference: currentReference }), undefined, 'an already-open session is not reused after its source changes');
    current.dispose();
    assert.deepStrictEqual(intake.safeDraft({ assignments: [{ indices: [0, 0, -1, '1'], category: 'X', name: 'Y' }], selected: [0, -1] }).assignments[0].indices, [0]);
    console.log('Artist Intake source-bound drafts and typed preset restoration passed');
  } finally {
    Module._load = original;
    assert(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
