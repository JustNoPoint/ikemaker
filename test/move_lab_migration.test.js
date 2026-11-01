'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const Module = require('module');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-move-lab-migration-'));
const def = path.join(root, 'hero.def'), code = path.join(root, 'states.zss'), archive = path.join(root, 'hero.sff');
fs.writeFileSync(def, '[Info]\nname = Hero\n');
fs.writeFileSync(code, '[StateDef 200]\nHitDef {\n  damage: 30;\n}\n');
fs.writeFileSync(archive, Buffer.from([0, 1, 2, 3]));

const opened = [], notices = [], original = Module._load;
const vscode = {
  ViewColumn: { Active: 1 },
  Uri: { file: fsPath => ({ fsPath }) },
  window: { showInformationMessage: message => notices.push(message), showQuickPick: async () => undefined },
  workspace: { textDocuments: [], openTextDocument: async uri => ({ fileName: uri.fsPath, getText: () => fs.readFileSync(uri.fsPath, 'utf8') }) },
  languages: { getDiagnostics: () => [] }, commands: { executeCommand: async () => undefined }
};
Module._load = function(request, parent, isMain) { if (request === 'vscode') return vscode; return original.call(this, request, parent, isMain); };
const workspace = require('../src/move_lab_workspace');
const { MESSAGE_TYPE } = require('../src/universal_toolbar_webview');
Module._load = original;

const files = [{ kind: 'DEF', filename: def, name: 'hero.def', exists: true }, { kind: 'Code', filename: code, name: 'states.zss', exists: true }, { kind: 'SFF', filename: archive, name: 'hero.sff', exists: true }];
const navigation = workspace.moveLabNavigation(files, code, 'cards');
let toolbar = workspace.moveLabToolbarModel({ defPath: def, navigation, source: null });
assert.strictEqual(toolbar.slots.length, 29);
assert.strictEqual(toolbar.slots.find(slot => slot.id === 'save').enabled, false, 'Move Lab remains read-only');
assert.strictEqual(toolbar.slots.find(slot => slot.id === 'text-source').enabled, false);
assert.strictEqual(toolbar.slots.find(slot => slot.id === 'connected-resources').enabled, true);
const current = { files };
const selected = workspace.fileSelection(current, code);
assert(selected && selected.line === 0);
assert.strictEqual(workspace.fileSelection(current, archive), null, 'binary archives do not masquerade as text source');
toolbar = workspace.moveLabToolbarModel({ defPath: def, navigation, source: selected });
assert.strictEqual(toolbar.slots.find(slot => slot.id === 'text-source').enabled, true);

const model = { defPath: def, context: { project: 'Game', character: 'Hero' }, files, sources: [], diagnostics: [], totals: { states: 0, controllers: 0, functions: 0, diagnostics: 0 }, attacks: { controllers: [], constantProfiles: [] }, throws: { plans: [], templates: [] }, navigation: require('../src/authoring_navigation_model').projectNavigation(navigation) };
const html = workspace.page(model, toolbar);
assert.match(html, /data-toolbar-contract="universal-v1"/);
assert.match(html, /moveLabFileSlider/);
assert.match(html, /data-move-lab-nav-mode="cards"/);
assert.strictEqual((html.slice(0, html.indexOf('<script>')).match(/data-universal-slot=/g) || []).length, 29);
for (const script of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1])) assert.doesNotThrow(() => new vm.Script(script));
assert.strictEqual(workspace.validMoveLabMessage({ type: 'moveLabNavigate', generation: 1, requestId: 1, action: 'select', id: 'x' }), true);
assert.strictEqual(workspace.validMoveLabMessage({ type: 'moveLabNavigate', generation: 1, requestId: -1, action: 'select', id: 'x' }), false);
assert.strictEqual(workspace.validMoveLabMessage({ type: 'moveLabInvoke', generation: 1, slot: 'tool:attack:0' }), true);
assert.strictEqual(workspace.validMoveLabMessage({ type: 'moveLabInvoke', generation: 1, slot: 'x'.repeat(129) }), false, 'oversized slots fail closed');
assert.strictEqual(workspace.validMoveLabMessage({ type: 'moveLabInvoke', generation: 1, slot: 'tool:attack:0', command: 'workbench.action.deleteFile' }), false, 'extra client authority fails closed');
assert.strictEqual(workspace.validMoveLabMessage({ type: 'command', command: 'ikemen.hitDef.openEditor' }), false, 'raw command strings are not accepted');
assert.strictEqual(workspace.validMoveLabMessage({ type: MESSAGE_TYPE, slotId: 'text-source', forged: true }), false);

let context = { identity: `character:${root.toLowerCase()}`, revision: 1, selectionRevision: 0, activeSurfaceId: 'move.lab', selection: null };
const contextModel = { snapshot: () => context, update: patch => (context = { ...context, ...patch, revision: context.revision + 1, selectionRevision: context.selectionRevision + (Object.hasOwn(patch, 'selection') ? 1 : 0) }) };
const owner = { panel: { active: true, webview: { postMessage: () => true } }, defPath: def, navigation, source: null, contextModel, busy: 0, disposed: false, tombstone: false, generation: 1, selectionEpoch: 0, isCurrent: () => true };
workspace.claimMoveLabSource(owner, selected);
const host = workspace.createMoveLabToolbar(owner, { isCurrent: () => true, navigation: { openViewerSource: async (filename, line) => opened.push({ filename, line }), currentPoint: () => ({}) } });
(async () => {
  await host.dispatcher.dispatch('move.lab', { type: MESSAGE_TYPE, slotId: 'text-source' });
  assert.deepStrictEqual(opened, [{ filename: code, line: 0 }]);
  fs.appendFileSync(code, '// changed\n');
  await host.dispatcher.dispatch('move.lab', { type: MESSAGE_TYPE, slotId: 'text-source' });
  assert.strictEqual(opened.length, 1, 'changed source fails closed before native navigation');
  assert(notices.some(message => /changed/i.test(message)));
  workspace.claimMoveLabSource(owner, workspace.fileSelection(current, code));
  let race = true;
  const racingHost = workspace.createMoveLabToolbar(owner, { isCurrent: () => true, beforeNavigateCheck: async () => { if (race) { race = false; fs.appendFileSync(code, '// race\n'); } }, navigation: { openViewerSource: async (filename, line) => opened.push({ filename, line }), currentPoint: () => ({}) } });
  await racingHost.dispatcher.dispatch('move.lab', { type: MESSAGE_TYPE, slotId: 'text-source' });
  assert.strictEqual(opened.length, 1, 'a source mutation during the navigation boundary also fails closed');
  workspace.claimMoveLabSource(owner, workspace.fileSelection(current, code));
  context = { ...context, selection: { ...context.selection, filename: path.join(root, 'forged.zss') } };
  await host.dispatcher.dispatch('move.lab', { type: MESSAGE_TYPE, slotId: 'text-source' });
  assert.strictEqual(opened.length, 1, 'a forged stable context identity/revision cannot substitute a different full selection');
  workspace.claimMoveLabSource(owner, workspace.fileSelection(current, code));
  await host.dispatcher.dispatch('move.lab', { type: MESSAGE_TYPE, slotId: 'text-source' });
  assert.strictEqual(opened.length, 2, 'reclaiming the exact current selection permits a valid retry');
  workspace.claimMoveLabSource(owner, workspace.fileSelection(current, code));
  const switchingHost = workspace.createMoveLabToolbar(owner, { isCurrent: () => true, beforeNavigateCheck: async () => workspace.claimMoveLabSource(owner, workspace.fileSelection(current, def)), navigation: { openViewerSource: async (filename, line) => opened.push({ filename, line }), currentPoint: () => ({}) } });
  await switchingHost.openExact();
  assert.strictEqual(opened.length, 2, 'switching the selected source during navigation fails closed');
  workspace.claimMoveLabSource(owner, workspace.fileSelection(current, code));
  const contextHost = workspace.createMoveLabToolbar(owner, { isCurrent: () => true, beforeNavigateCheck: async () => { context = { ...context, identity: context.identity + ':other' }; }, navigation: { openViewerSource: async (filename, line) => opened.push({ filename, line }), currentPoint: () => ({}) } });
  await contextHost.openExact();
  assert.strictEqual(opened.length, 2, 'switching the owning context during navigation fails closed');
  context = { ...context, identity: `character:${root.toLowerCase()}` }; workspace.claimMoveLabSource(owner, workspace.fileSelection(current, code));
  const disposalHost = workspace.createMoveLabToolbar(owner, { isCurrent: () => true, beforeNavigateCheck: async () => { owner.disposed = true; }, navigation: { openViewerSource: async (filename, line) => opened.push({ filename, line }), currentPoint: () => ({}) } });
  await disposalHost.openExact();
  assert.strictEqual(opened.length, 2, 'disposal during navigation cannot produce a late open');
  owner.disposed = false; workspace.claimMoveLabSource(owner, workspace.fileSelection(current, code));
  await host.openExact();
  assert.strictEqual(opened.length, 3, 'a valid retry works after the failed races are reclaimed');
  const commands = [];
  vscode.commands.executeCommand = async (...args) => commands.push(args);
  const preferredHost = workspace.createMoveLabToolbar(owner, { isCurrent: () => true, navigation: { openViewerSource: async () => {}, currentPoint: () => ({}) } });
  await preferredHost.editPreferred();
  assert.strictEqual(commands.at(-1)[0], 'ikemen.authoringWorkspace.open', 'preferred editing delegates to the established Native / Integrated / Ask preference');
  console.log('Move Lab universal shell, read-only delegation, navigation, strict messages, and exact-source host passed');
})().finally(() => fs.rmSync(root, { recursive: true, force: true }));
