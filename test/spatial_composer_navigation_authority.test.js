'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), Module = require('module');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-spatial-nav-')), def = path.join(root, 'hero.def'), one = path.join(root, 'one.zss'), two = path.join(root, 'two.st');
for (const file of [def, one, two]) fs.writeFileSync(file, file === def ? '[Files]' : 'state');
const messages = [], context = { identity: 'character:hero', revision: 1, selectionRevision: 1, activeSurfaceId: 'code.spatial' }, model = { snapshot: () => context, update: () => context };
const vscode = { Uri: { file: fsPath => ({ fsPath, toString: () => 'file://' + fsPath }) }, workspace: { textDocuments: [] }, window: { visibleTextEditors: [] } }, original = Module._load;
Module._load = function(request, parent, main) {
  const from = parent?.filename || '';
  if (request === 'vscode') return vscode;
  if (request === './related_work' && /spatial_composer_workspace/.test(from)) return { resolveAssigned: () => ({ code: [one, two], commands: '', constants: '' }) };
  if (request === './viewer_navigation' && /spatial_composer_workspace/.test(from)) return { associatedDefs: () => [def] };
  if (request === './authoring_context_registry' && /spatial_composer_workspace/.test(from)) return { registerAuthoringPanel: () => ({ panel: true }), getContextModel: () => model };
  return original.call(this, request, parent, main);
};
delete require.cache[require.resolve('../src/spatial_composer_workspace')]; const workspace = require('../src/spatial_composer_workspace'); Module._load = original;
const owner = { panel: { active: true, webview: { postMessage: async message => messages.push(message) } }, defPath: def, selectedSource: one, navigation: workspace.spatialNavigation([one, two], one), generation: 2, capture: { old: true }, generatedSnapshot: { old: true }, disposed: false, contextModel: model };
(async () => {
  assert.strictEqual(await workspace.selectSpatialSource(owner, path.resolve(two).toLowerCase(), 4), true);
  assert.strictEqual(owner.selectedSource, two); assert.strictEqual(owner.generation, 3); assert.strictEqual(owner.capture, null); assert.strictEqual(owner.generatedSnapshot, null); assert(messages.some(message => message.type === 'sourceNavigation' && message.requestId === 4 && message.navigation.currentId === path.resolve(two).toLowerCase()));
  const committed = owner.selectedSource, committedNavigation = owner.navigation;
  assert.strictEqual(await workspace.selectSpatialSource(owner, path.join(root, 'forged.zss').toLowerCase(), 5), false);
  assert.strictEqual(owner.selectedSource, committed); assert.strictEqual(owner.navigation, committedNavigation); assert(messages.some(message => message.type === 'sourceNavigation' && message.requestId === 5 && message.navigation.currentId === path.resolve(two).toLowerCase()), 'rejected selection rolls the client back to the committed source');
  console.log('Spatial Composer host navigation uses a live assigned-state allowlist and transactional rollback without auto-opening editors');
})().catch(error => { console.error(error); process.exitCode = 1; });
