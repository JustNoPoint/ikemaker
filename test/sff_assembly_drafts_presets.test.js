'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const commands = new Map(), panels = [], stored = {}, registrations = [], closeSupport = new Map();
function panel() { const receivers = [], disposers = []; const value = { webview: { cspSource: 'test', html: '', onDidReceiveMessage(fn) { receivers.push(fn); }, postMessage() { return true; } }, onDidDispose(fn) { disposers.push(fn); }, reveal() {}, dispose() { disposers.forEach(fn => fn()); }, receivers }; panels.push(value); return value; }
const vscode = { ViewColumn: { Active: 1 }, Uri: { file: fsPath => ({ fsPath }) }, workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) }, commands: { registerCommand(id, fn) { commands.set(id, fn); return {}; }, executeCommand: async () => undefined }, window: { createWebviewPanel: panel, showErrorMessage(message) { throw new Error(message); }, showWarningMessage() {} } };
const archives = new Map();
const archive = (filename, group) => ({ filename, version: [2, 1, 0, 0], sprites: [{ index: 0, group, number: 0, axisX: 1, axisY: 2, width: 3, height: 4, paletteIndex: 0 }] });
const original = Module._load;
Module._load = function(request, parent, main) {
  if (request === 'vscode') return vscode;
  if (request === './sff_reader' && /sff_assembly_workspace/.test(parent?.filename || '')) return { readSff: filename => archives.get(path.resolve(filename)), friendlyVersion: () => '2.1', spritePng: () => Buffer.from('png') };
  if (request === './viewer_group' && /sff_assembly_workspace/.test(parent?.filename || '')) return { preferredViewerColumn: () => 2, trackViewerPanel: value => value };
  if (request === './viewer_close' && /sff_assembly_workspace/.test(parent?.filename || '')) return { support(value, support) { closeSupport.set(value, support); } };
  if (request === './viewer_sessions' && /sff_assembly_workspace/.test(parent?.filename || '')) return { register: (value, file, kind) => registrations.push({ value, file, kind }) };
  if (request === './webview_policy' && /sff_assembly_workspace/.test(parent?.filename || '')) return { protect: value => value };
  return original.call(this, request, parent, main);
};
const workspace = require('../src/sff_assembly_workspace');
const storage = { get(key, fallback) { return stored[key] ?? fallback; }, async update(key, value) { stored[key] = value; } };
workspace.registerSffAssembly({ workspaceState: storage, subscriptions: [] });

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-sff-assembly-'));
  try {
    const base = path.join(root, 'base.sff'), source = path.join(root, 'source.sff'); fs.writeFileSync(base, 'base-a'); fs.writeFileSync(source, 'source-a'); archives.set(path.resolve(base), archive(base, 0)); archives.set(path.resolve(source), archive(source, 10));
    const reference = workspace.assemblyReference(base, source), open = commands.get('sff.openAssembly');
    const first = await open(vscode.Uri.file(base), { preset: true, reference });
    assert(first); assert.strictEqual(registrations.at(-1).kind, 'sff_assembly'); assert(closeSupport.has(first)); assert.match(first.webview.html, /Discard recovered plan/);
    const draft = { operations: [{ selection: { indices: [0] }, targetGroup: 0, mode: 'replace', preserveDestinationAxis: true }], selected: [0], mode: 'replace', preserveDestinationAxis: true };
    first.receivers[0]({ type: 'assemblyDraft', identity: reference.identity, revision: 1, draft }); await new Promise(resolve => setImmediate(resolve)); await closeSupport.get(first).keepDraft(); first.dispose();
    const reopened = await open(vscode.Uri.file(base), { preset: true, reference }); assert.match(reopened.webview.html, /"mode":"replace"/); assert.match(reopened.webview.html, /Recovered the plan for these exact SFF files/);
    reopened.receivers[0]({ type: 'discardAssemblyDraft', identity: reference.identity }); await new Promise(resolve => setImmediate(resolve)); reopened.dispose();
    const clean = await open(vscode.Uri.file(base), { preset: true, reference }); assert.doesNotMatch(clean.webview.html, /"recoveredDraft":\{"operations":\[/); clean.dispose();
    fs.writeFileSync(source, 'source-b'); const before = panels.length; assert.strictEqual(await open(vscode.Uri.file(base), { preset: true, reference }), undefined); assert.strictEqual(panels.length, before);
    const sanitized = workspace.safeAssemblyDraft({ operations: [{ selection: { indices: [0, 99] }, targetGroup: 0, mode: 'replace' }], selected: [0, 99] }, archives.get(path.resolve(base)), archives.get(path.resolve(source)));
    assert.deepStrictEqual(sanitized.operations[0].selection.indices, [0]); assert.deepStrictEqual(sanitized.selected, [0]);
    console.log('SFF Assembly source-bound drafts and typed preset restoration passed');
  } finally { Module._load = original; fs.rmSync(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
