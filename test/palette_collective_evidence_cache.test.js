'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function(request, parent, main) {
  if (request === 'vscode') return { Uri: { file: fsPath => ({ fsPath }) }, ViewColumn: { One: 1, Beside: 2 }, ConfigurationTarget: { WorkspaceFolder: 1 }, commands: { executeCommand: async () => false }, workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback, update: async () => {} }) }, window: { tabGroups: { activeTabGroup: { viewColumn: 1 } }, showOpenDialog: async () => undefined, showSaveDialog: async () => undefined, showInputBox: async () => undefined, showWarningMessage: async () => undefined, showInformationMessage: async () => undefined } };
  return originalLoad.call(this, request, parent, main);
};
const collectiveIntake = require('../src/palette_collective_intake');
const collectiveModel = require('../src/palette_collective_model');
const { PaletteWorkspaceController } = require('../src/palette_workspace_controller');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-collective-cache-'));
try {
  const filename = path.join(root, 'sprite.png'), bytes = collectiveModel.encodeRgbaPng(1, 1, Buffer.from([255, 0, 0, 255]));
  fs.writeFileSync(filename, bytes);
  const source = { filename, byteHash: crypto.createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.length }, owner = new PaletteWorkspaceController({}), original = collectiveIntake.readCollectivePaths;
  let reads = 0; collectiveIntake.readCollectivePaths = (...args) => { reads += 1; return original(...args); };
  try {
    const first = owner.collectiveFromSession({ sources: [{ ...source }], collective: { inventoryHash: 'reviewed-set' } });
    const second = owner.collectiveFromSession({ sources: [{ ...source }], collective: { inventoryHash: 'reviewed-set' } });
    assert.strictEqual(first, second, 'equivalent restored session objects reuse the exact decoded collective');
    assert.strictEqual(reads, 1, 'unchanged reviewed evidence is decoded once rather than on every session refresh');
  } finally { collectiveIntake.readCollectivePaths = original; }
} finally { fs.rmSync(root, { recursive: true, force: true }); }
Module._load = originalLoad;
console.log('Palette collective evidence cache prevents repeated full-folder PNG decoding');
