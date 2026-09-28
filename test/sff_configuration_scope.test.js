'use strict';

const assert = require('assert');
const Module = require('module');

const resources = [], updates = [], target = { fsPath: 'C:\\game\\chars\\Ryu\\Ryu.sff' };
const vscode = {
  env: { uiKind: 1 }, UIKind: { Web: 2 },
  Uri: { file: fsPath => ({ fsPath }) },
  ConfigurationTarget: { WorkspaceFolder: 'folder', Workspace: 'workspace', Global: 'global' },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: 'C:\\game' } }],
    getWorkspaceFolder: resource => resource?.fsPath === target.fsPath ? { uri: { fsPath: 'C:\\game' } } : null,
    getConfiguration: (_section, resource) => {
      resources.push(resource?.fsPath || 'unscoped');
      return { get: (key, fallback) => key === 'imageEditorPath' ? 'C:\\tools\\editor.exe' : fallback, update: async (key, value, scope) => updates.push({ key, value, scope, resource: resource?.fsPath }) };
    }
  },
  window: { showQuickPick: async items => items.find(item => item.mode === 'default'), showInformationMessage() {} }
};
const originalLoad = Module._load;
Module._load = function patched(request, parent, main) { if (request === 'vscode') return vscode; return originalLoad.call(this, request, parent, main); };
const { viewerHtml, chooseImageEditor, configurationForAsset } = require('../src/sff_viewer');
Module._load = originalLoad;

(async () => {
  assert.strictEqual(configurationForAsset(target).get('imageEditorPath'), 'C:\\tools\\editor.exe');
  viewerHtml({}, { filename: target.fsPath, header: { version: [2, 1, 0, 0] }, sprites: [], palettes: [] }, new Map());
  assert(resources.includes(target.fsPath), 'SFF naming/view settings must be read with the active SFF resource');
  assert(!resources.includes('unscoped'), 'SFF configuration consumers must not fall back to an unscoped read');
  await chooseImageEditor(target);
  assert.deepStrictEqual(updates.at(-1), { key: 'imageEditorPath', value: '', scope: 'folder', resource: target.fsPath });
  console.log('SFF naming and image-editor preferences retain the active archive scope');
})().catch(error => { console.error(error); process.exitCode = 1; });
