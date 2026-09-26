'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), Module = require('module');
const original = Module._load, root = fs.mkdtempSync(path.join(os.tmpdir(), 'cns-converter-selection-')), source = path.join(root, 'state.cns');
fs.writeFileSync(source, '[StateDef 200]\ntype = S\n', 'utf8');
const commands = new Map(), records = new Map(); let created = 0, revealed = 0, chooserCalls = 0;
const sessions = {
  has: panel => [...records.values()].includes(panel),
  register: (panel, file, kind) => records.set(`${path.resolve(file).toLowerCase()}|${kind}`, panel),
  updateSource: (panel, file) => { for (const [key, value] of records) if (value === panel) records.delete(key); records.set(`${path.resolve(file).toLowerCase()}|cns_converter`, panel); },
  find: (file, kind) => records.get(`${path.resolve(file).toLowerCase()}|${kind}`)
};
const makePanel = () => ({ title: '', reveal: () => { revealed++; }, webview: { cspSource: 'test:', options: {}, html: '', onDidReceiveMessage: () => ({ dispose() {} }) } });
const vscode = {
  ViewColumn: { Active: 1 }, Uri: { file: fsPath => ({ fsPath, toString: () => fsPath }) }, DiagnosticSeverity: { Error: 0, Warning: 1 },
  languages: { createDiagnosticCollection: () => ({ clear() {}, set() {}, dispose() {} }) },
  commands: { registerCommand: (id, fn) => { commands.set(id, fn); return { dispose() {} }; } },
  window: { createWebviewPanel: () => { created++; return makePanel(); }, showQuickPick: async () => { chooserCalls++; return undefined; }, registerWebviewPanelSerializer: () => ({ dispose() {} }) },
  workspace: {}
};
Module._load = function(request, parent, main) {
  if (request === 'vscode') return vscode;
  if (request === './viewer_sessions') return sessions;
  if (request === './viewer_group') return { preferredViewerColumn: () => 2, trackViewerPanel: value => value };
  if (request === './experience') return { mode: () => 'advanced' };
  if (request === './cns_to_zss') return { convertCnsToZss: text => ({ text: `converted:${text}`, counts: { safe: 1, review: 0, unsupported: 0 }, findings: [], canWrite: true }), convertedFilename: file => `${file}.zss`, characterConversionPlan: () => { throw new Error('not used'); }, updateDefStateReferences: value => value };
  if (request === './launch_controls') return { launchControlsHtml: () => '', launchControlsClientScript: () => '', handleLaunchMessage: async () => false };
  if (request === './webview_policy') return { protect: value => value };
  if (request === './character_picker') return { chooseCharacterDef: async () => undefined, nearestCharacterDef: () => '' };
  return original.call(this, request, parent, main);
};
(async () => {
  const converter = require('../src/cns_converter_workspace'), context = { subscriptions: { push() {} } };
  converter.registerCnsConverter(context);
  const open = commands.get('ikemen.cnsConverter.open'), reference = { mode: 'file', index: 0, source };
  const first = await open({ fsPath: source }, { preset: true, reference });
  const second = await open({ fsPath: source }, { preset: true, reference });
  assert.strictEqual(second, first, 'a saved converter source reuses its exact panel');
  assert.equal(created, 1, 'preset restoration must not create duplicate converter panels');
  assert.equal(revealed, 1, 'the reused converter is revealed');
  assert.equal(chooserCalls, 0, 'preset restoration must never open the ordinary source chooser');
  assert.strictEqual(sessions.find(source, 'cns_converter'), first, 'the panel is registered under the conversion source');
  assert.match(first.webview.html, /converted:/, 'the requested source is loaded into the restored converter');
  console.log('CNS converter presets bypass source choice, bind the requested source and reuse its exact panel');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { Module._load = original; fs.rmSync(root, { recursive: true, force: true }); });
