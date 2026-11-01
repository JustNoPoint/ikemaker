'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const original = Module._load;
const vscode = { ViewColumn: { Active: 1 }, Uri: { file: fsPath => ({ fsPath }) }, window: { showInformationMessage() {} }, workspace: { textDocuments: [] }, languages: { getDiagnostics: () => [] }, commands: { executeCommand: async () => undefined } };
Module._load = function(request, parent, isMain) { if (request === 'vscode') return vscode; return original.call(this, request, parent, isMain); };
const workspace = require('../src/move_lab_workspace');
const registry = require('../src/authoring_context_registry');
Module._load = original;

function panel() {
  const disposeHandlers = [], viewHandlers = [];
  return { active: true, webview: { postMessage: () => true }, onDidDispose(handler) { disposeHandlers.push(handler); return { dispose() {} }; }, onDidChangeViewState(handler) { viewHandlers.push(handler); return { dispose() {} }; }, dispose() { for (const handler of disposeHandlers) handler(); } };
}
function candidate(files) { return { files, sources: [], diagnostics: [], attacks: { controllers: [], constantProfiles: [] }, visual: { actions: [], p1Action: null, p2Action: null } }; }
const normalized = values => values.map(registry.normalized).sort();

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-move-context-'));
const def = path.join(root, 'Hero.def'), first = path.join(root, 'First.zss'), second = path.join(root, 'Second.zss'), other = path.join(root, 'Other.air');
fs.writeFileSync(def, '[Info]\nname=Hero\n'); fs.writeFileSync(first, '[StateDef 100]\n'); fs.writeFileSync(second, '[StateDef 200]\n'); fs.writeFileSync(other, '[Begin Action 0]\n');
const otherPanel = panel(), movePanel = panel();
const otherEntry = registry.registerCharacterToolPanel(otherPanel, def, 'Other viewer', [other]);
const moveEntry = registry.registerCharacterToolPanel(movePanel, def, 'Move Lab', [first]);
const contextModel = registry.getContextModel(moveEntry);
contextModel.update({ selection: { surfaceId: 'other.surface', sourceId: 'kept' }, activeSurfaceId: 'other.surface' });
const owner = { panel: movePanel, defPath: def, generation: 1, selectionEpoch: 0, navigation: workspace.moveLabNavigation([], ''), routes: new Map(), source: null, contextEntry: moveEntry, contextModel, p1Action: null, p2Action: null, isCurrent: () => true, disposed: false, tombstone: false };

try {
  const added = candidate([{ filename: first, name: 'First.zss', exists: true }, { filename: first, name: 'First.zss', exists: true }, { filename: second, name: 'Second.zss', exists: true }]);
  assert(workspace.commitCandidate(owner, workspace.prepareCandidate(owner, added)));
  let snapshot = registry.contextSnapshot(otherEntry);
  assert.deepStrictEqual(normalized(snapshot.files), normalized([def, other, first, second]), 'same-panel re-registration contributes a deduplicated file set without replacing the shared union');
  assert.deepStrictEqual(snapshot.selection, { surfaceId: 'other.surface', sourceId: 'kept' }); assert.strictEqual(snapshot.activeSurfaceId, 'other.surface', 'file contribution does not steal another surface selection');

  const removed = candidate([{ filename: second, name: 'Second.zss', exists: true }]);
  assert(workspace.commitCandidate(owner, workspace.prepareCandidate(owner, removed)));
  snapshot = registry.contextSnapshot(otherEntry);
  assert.deepStrictEqual(normalized(snapshot.files), normalized([def, other, second]), 'removing a Move Lab contribution preserves another panel files');

  workspace.claimMoveLabSource(owner, workspace.fileSelection({ files: removed.files }, second));
  const selected = registry.contextSnapshot(otherEntry), selectedRevision = selected.selectionRevision;
  assert.strictEqual(selected.activeSurfaceId, 'move.lab'); assert(selected.selection);
  assert(workspace.commitCandidate(owner, workspace.prepareCandidate(owner, candidate([]))));
  snapshot = registry.contextSnapshot(otherEntry);
  assert.strictEqual(snapshot.selection, null, 'removing the exact Move Lab-owned source clears its shared selection');
  assert(snapshot.selectionRevision > selectedRevision, 'clearing an invalidated owned source advances selectionRevision');

  const reclaimed = candidate([{ filename: first, name: 'First.zss', exists: true }]);
  assert(workspace.commitCandidate(owner, workspace.prepareCandidate(owner, reclaimed)));
  assert(workspace.claimMoveLabSource(owner, workspace.fileSelection({ files: reclaimed.files }, first)), 'a later valid source can be reclaimed');
  assert.strictEqual(registry.contextSnapshot(otherEntry).selection.filename, path.resolve(first));

  contextModel.update({ selection: { surfaceId: 'other.surface', sourceId: 'still-kept' }, activeSurfaceId: 'other.surface' });
  const otherRevision = contextModel.snapshot().selectionRevision;
  assert(workspace.commitCandidate(owner, workspace.prepareCandidate(owner, candidate([]))));
  snapshot = registry.contextSnapshot(otherEntry);
  assert.deepStrictEqual(snapshot.selection, { surfaceId: 'other.surface', sourceId: 'still-kept' });
  assert.strictEqual(snapshot.selectionRevision, otherRevision, 'Move Lab never clears another surface selection when its own source disappears');
  console.log('Move Lab Authoring Context contribution union and owned-selection invalidation passed');
} finally {
  movePanel.dispose(); otherPanel.dispose(); fs.rmSync(root, { recursive: true, force: true });
}
