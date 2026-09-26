'use strict';

const assert = require('assert');
const Module = require('module');

const air = { scheme: 'file', fsPath: 'C:\\game\\chars\\Ryu\\Anim.air' };
const webview = { scheme: 'ikemen-view', fsPath: '' };
const vscode = {
  window: {
    activeTextEditor: null,
    tabGroups: {
      activeTabGroup: { activeTab: { input: { uri: webview } } },
      all: [
        { activeTab: { input: { uri: air } }, tabs: [] },
        { activeTab: { input: { uri: webview } }, tabs: [] }
      ]
    },
    visibleTextEditors: []
  },
  workspace: {}
};

const original = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return vscode;
  return original.call(this, request, parent, main);
};
const { activeUri, safeId, relativeRoot } = require('../src/project_context_ui');
Module._load = original;

assert.strictEqual(activeUri(), air, 'a visual workspace must fall back to the active file tab in another editor group');
vscode.window.tabGroups.all = [];
vscode.window.visibleTextEditors = [{ document: { uri: air } }];
assert.strictEqual(activeUri(), air, 'a restored visual workspace must fall back to a visible source editor');
vscode.window.activeTextEditor = { document: { uri: air } };
assert.strictEqual(activeUri(), air, 'the active text editor remains authoritative');
assert.strictEqual(safeId('My New Game!'), 'my-new-game');
assert.strictEqual(relativeRoot('C:\\game\\.ikemen\\project-registry.json', 'C:\\game'), '.');

console.log('Project context UI tests passed');
