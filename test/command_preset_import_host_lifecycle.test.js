'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { SCHEMA, VERSION } = require('../src/command_preset_transfer');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inp2-host-'));
  const def = path.join(root, 'fighter.def'), cmd = path.join(root, 'fighter.cmd'), artifact = path.join(root, 'shared.inp2');
  fs.writeFileSync(def, '[Files]\ncmd=fighter.cmd\n');
  fs.writeFileSync(cmd, '[Command]\nname="x"\ncommand=x\n');
  const encode = (label, command) => Buffer.from(JSON.stringify({ schema: SCHEMA, version: VERSION, presets: [{ label, text: `[Command]\nname="${label}"\ncommand=${command}` }] }));
  fs.writeFileSync(artifact, encode('Imported one', 'y'));
  const commands = new Map(), storage = new Map(), messages = [], errors = [];
  let panel, race = false;
  const uri = filename => ({ fsPath: filename, toString: () => filename });
  const document = filename => ({ fileName: filename, uri: uri(filename), isDirty: false, getText: () => fs.readFileSync(filename, 'utf8'), positionAt: () => ({ line: 0, character: 0 }), save: async () => true });
  const vscode = {
    Uri: { file: uri }, Range: class {}, ViewColumn: { Active: 1, Beside: 2 }, WorkspaceEdit: class { replace(target, _range, value) { this.target = target; this.value = value; } },
    env: { clipboard: { writeText: async () => {} } },
    workspace: { textDocuments: [], getWorkspaceFolder: () => ({ uri: uri(root) }), getConfiguration: () => ({ get: (_name, fallback) => fallback }), openTextDocument: async target => document(target.fsPath || target), applyEdit: async edit => { fs.writeFileSync(edit.target.fsPath, edit.value); return true; }, onDidChangeTextDocument: () => ({ dispose() {} }) },
    window: {
      activeTextEditor: null,
      registerWebviewPanelSerializer: () => ({ dispose() {} }),
      createWebviewPanel: () => {
        const listeners = [], disposers = [];
        panel = { active: true, viewColumn: 2, reveal() {}, onDidChangeViewState: () => ({ dispose() {} }), onDidDispose: fn => { disposers.push(fn); return { dispose() {} }; }, dispose: () => disposers.forEach(fn => fn()), webview: { onDidReceiveMessage(fn) { listeners.push(fn); panel.receive = message => Promise.all(listeners.map(handler => handler(message))); return { dispose() {} }; }, postMessage(message) { messages.push(message); return true; } } };
        return panel;
      },
      showOpenDialog: async () => [uri(artifact)],
      showQuickPick: async (items, options) => {
        if (options?.canPickMany) {
          if (race) fs.writeFileSync(artifact, encode('Changed after review', 'z'));
          return items;
        }
        return items[0];
      },
      showInputBox: async options => options.value,
      showWarningMessage: async (_message, _options, choice) => choice,
      showInformationMessage: async () => {},
      showErrorMessage: message => errors.push(message)
    },
    commands: { registerCommand: (name, fn) => { commands.set(name, fn); return { dispose() {} }; }, executeCommand: (name, ...args) => commands.get(name)?.(...args) }
  };
  const originalLoad = Module._load;
  Module._load = function(name, parent, main) {
    if (name === 'vscode') return vscode;
    if (name === './character_context') return { owningCharacterDefs: () => [], gameRoot: () => root };
    if (name === './viewer_group') return { preferredViewerColumn: () => 2, trackViewerPanel: value => value };
    return originalLoad.call(this, name, parent, main);
  };
  try {
    const api = require('../src/command_movelist_workspace');
    const context = { subscriptions: [], workspaceState: { get: key => storage.get(key), update: async (key, value) => storage.set(key, value) } };
    api.registerCommandMovelistWorkspace(context);
    await vscode.commands.executeCommand('ikemen.commandMovelist.openEditor', uri(def));
    await panel.receive({ type: 'importCustomPresets' });
    const update = messages.findLast(message => message.type === 'customPresetsUpdated');
    assert(update?.presets.some(item => item.label === 'Imported one'), 'reviewed import reaches workspace storage and refreshes the live shelf');
    assert.strictEqual(errors.length, 0);
    const before = JSON.stringify([...storage.values()]);
    fs.writeFileSync(artifact, encode('Race candidate', 'a')); race = true;
    await panel.receive({ type: 'importCustomPresets' });
    assert(errors.at(-1)?.includes('changed after review'), `post-selection file race fails closed: ${errors.at(-1)}`);
    assert.strictEqual(JSON.stringify([...storage.values()]), before, 'a changed source cannot partially alter workspace preset storage');
    assert.strictEqual(fs.readFileSync(cmd, 'utf8'), '[Command]\nname="x"\ncommand=x\n', 'preset sharing never edits character command source');
    console.log('Command preset import host lifecycle and source-race tests passed');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
