'use strict';
const assert = require('assert');
const path = require('path');
const Module = require('module');
let candidates = [], choice, selectedFile;
const notifications = [];
const uri = filename => ({ fsPath: filename, scheme: 'file' });
const root = path.resolve('disposable-recovery-fixture');
const history = uri(path.join(root, '.ikemen-tools', 'mutations.json'));
const vscode = {
  Uri: { file: uri },
  window: {
    tabGroups: { activeTabGroup: { activeTab: { input: { uri: uri(path.join(root, 'sprite.sff')) } } } },
    showQuickPick: async items => { candidates = items; return choice?.(items); },
    showOpenDialog: async () => selectedFile,
    showInformationMessage: async message => notifications.push(message)
  },
  workspace: {
    fs: { stat: async value => { if (value.fsPath !== history.fsPath) throw new Error('missing'); return {}; } },
    findFiles: async () => [], asRelativePath: value => value.fsPath
  }
};
const original = Module._load;
Module._load = function(request, parent, main) { return request === 'vscode' ? vscode : original.call(this, request, parent, main); };
const { chooseHistory, openMutationHistory } = require('../src/mutation_history');
Module._load = original;
(async () => {
  assert.deepStrictEqual(await chooseHistory(), history, 'custom SFF tab resolves its own history');
  vscode.window.tabGroups.activeTabGroup.activeTab.input.uri = history;
  assert.deepStrictEqual(await chooseHistory(), history, 'opened history is recognized directly');
  vscode.window.tabGroups.activeTabGroup.activeTab = null;
  choice = items => items.find(item => item.browse);
  selectedFile = [history];
  assert.deepStrictEqual(await chooseHistory(), history, 'Browse works without workspace histories');
  assert(candidates[0].browse);
  selectedFile = undefined;
  assert.strictEqual(await chooseHistory(), null, 'cancel file picker');
  await openMutationHistory();
  assert.deepStrictEqual(notifications, [], 'cancel Browse must not claim history is absent');
  choice = () => undefined;
  assert.strictEqual(await chooseHistory(), undefined, 'cancel history picker');
  await openMutationHistory();
  assert.deepStrictEqual(notifications, [], 'cancel history selection is silent');
  console.log('Recovery active asset and Browse picker tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
