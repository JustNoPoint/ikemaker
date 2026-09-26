'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), Module = require('module');
const registryModel = require('../src/project_registry'), original = Module._load;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-manager-selection-')), registryFolder = path.join(root, '.ikemen'), registryFile = path.join(registryFolder, 'project-registry.json');
fs.mkdirSync(registryFolder); fs.writeFileSync(registryFile, '{}');
const registry = registryModel.createStarter(), records = new Map(), roots = []; let created = 0, revealed = 0;
const sessions = {
  has: panel => [...records.values()].includes(panel),
  register: (panel, file, kind) => records.set(`${path.resolve(file).toLowerCase()}|${kind}`, panel),
  updateSource: (panel, file) => { for (const [key, value] of records) if (value === panel) records.delete(key); records.set(`${path.resolve(file).toLowerCase()}|project_manager`, panel); },
  find: (file, kind) => records.get(`${path.resolve(file).toLowerCase()}|${kind}`)
};
const panel = () => ({ title: '', viewColumn: 2, reveal: () => { revealed++; }, onDidDispose() {}, webview: { cspSource: 'test:', options: {}, html: '', postMessage: async () => true, onDidReceiveMessage: () => ({ dispose() {} }) } });
const vscode = { ViewColumn: { Active: 1 }, Uri: { file: fsPath => ({ fsPath }) }, window: { createWebviewPanel: () => { created++; return panel(); }, showOpenDialog: async () => undefined }, workspace: {} };
Module._load = function(request, parent, main) {
  if (request === 'vscode') return vscode;
  if (request === './viewer_sessions') return sessions;
  if (request === './viewer_group') return { preferredViewerColumn: () => 2, trackViewerPanel: value => value };
  if (request === './project_context_ui') return { readRegistry: selected => { roots.push(path.resolve(selected)); return { filename: registryFile, registry, issues: [] }; }, writeRegistry() {}, contextRoot() { return ''; }, workspaceRoot() { return ''; }, activeUri() { return undefined; } };
  if (request === './launch_controls') return { launchControlsHtml: () => '', launchControlsClientScript: () => '', handleLaunchMessage: async () => false };
  if (request === './webview_policy') return { protect: value => value };
  return original.call(this, request, parent, main);
};
(async () => {
  const workspace = require('../src/project_manager_workspace');
  const first = await workspace.openProjectManager({ fsPath: registryFile });
  const second = await workspace.openProjectManager({ fsPath: registryFile });
  assert.strictEqual(second, first, 'opening the same saved registry reuses its existing manager panel');
  assert.equal(created, 1, 'registry reuse must not create a duplicate panel');
  assert.equal(revealed, 1, 'the reused manager is revealed');
  assert(roots.every(value => value === path.resolve(root)), 'a registry file must resolve to its project root, not the .ikemen folder');
  assert.strictEqual(sessions.find(registryFile, 'project_manager'), first, 'the panel is registered under the stable registry file');
  console.log('Project Manager presets bind the registry root and reuse the exact typed destination');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { Module._load = original; fs.rmSync(root, { recursive: true, force: true }); });
