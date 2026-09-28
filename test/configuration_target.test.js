'use strict';

const assert = require('assert');
const { configurationTarget } = require('../src/configuration_target');

const targets = { WorkspaceFolder: 'folder', Workspace: 'workspace', Global: 'global' };
function api({ folder = null, folders } = {}) {
  return { ConfigurationTarget: targets, workspace: { workspaceFolders: folders, getWorkspaceFolder: () => folder } };
}

assert.strictEqual(configurationTarget(api({ folder: { uri: 'game' }, folders: [{ uri: 'game' }] }), { fsPath: 'game/char.sff' }), 'folder');
assert.strictEqual(configurationTarget(api({ folders: [{ uri: 'game' }] }), { fsPath: 'outside/char.sff' }), 'workspace');
assert.strictEqual(configurationTarget(api({ folders: [] }), { fsPath: 'standalone/char.sff' }), 'global');
assert.strictEqual(configurationTarget(api(), { fsPath: 'standalone/char.sff' }), 'global');
assert.strictEqual(configurationTarget(api(), undefined), 'global');

console.log('Configuration targets fall back to user settings when no workspace is open');
