'use strict';

const assert = require('assert');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function(request, parent, main) {
  if (request === 'vscode') return { Uri: { file: fsPath => ({ fsPath }) }, ViewColumn: { One: 1, Beside: 2 }, ConfigurationTarget: { WorkspaceFolder: 1 }, commands: { executeCommand: async () => false }, workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback, update: async () => {} }) }, window: { tabGroups: { activeTabGroup: { viewColumn: 1 } }, showOpenDialog: async () => undefined, showSaveDialog: async () => undefined, showInputBox: async () => undefined, showWarningMessage: async () => undefined, showInformationMessage: async () => undefined } };
  return originalLoad.call(this, request, parent, main);
};
const collectiveModel = require('../src/palette_collective_model');
const { PaletteWorkspaceController } = require('../src/palette_workspace_controller');
const owner = new PaletteWorkspaceController({}), image = { imageId: 'sprite-1' }, originalEncode = collectiveModel.encodeRgbaPng;
assert(owner.collectivePageModelCache instanceof Map, 'page analysis has a separate bounded helper cache');
let renders = 0, encodes = 0;
collectiveModel.encodeRgbaPng = (...args) => { encodes += 1; return originalEncode(...args); };
try {
  const render = () => { renders += 1; return { width: 1, height: 1, rgba: Buffer.from([255, 0, 0, 255]) }; };
  const first = owner.collectiveThumbnailDataUri(image, 'exact-state:sprite-1', render);
  const second = owner.collectiveThumbnailDataUri(image, 'exact-state:sprite-1', render);
  assert.strictEqual(first, second, 'the identical thumbnail state reuses the encoded data URI');
  assert.strictEqual(renders, 1, 'the identical thumbnail state renders once');
  assert.strictEqual(encodes, 1, 'the identical thumbnail state encodes once');
  owner.collectiveThumbnailDataUri(image, 'changed-state:sprite-1', render);
  assert.strictEqual(renders, 2, 'a changed filter or cleanup state renders a fresh thumbnail');
} finally { collectiveModel.encodeRgbaPng = originalEncode; Module._load = originalLoad; }
console.log('Palette collective thumbnails reuse exact-state PNG previews');
