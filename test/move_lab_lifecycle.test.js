'use strict';

const assert = require('assert');
const Module = require('module');
const original = Module._load;
const commands = [];
const vscode = {
  ViewColumn: { Active: 1 }, Uri: { file: fsPath => ({ fsPath }) },
  window: { showInformationMessage: () => undefined }, workspace: { textDocuments: [] }, languages: { getDiagnostics: () => [] },
  commands: { executeCommand: async (...args) => commands.push(args) }
};
Module._load = function(request, parent, isMain) { if (request === 'vscode') return vscode; return original.call(this, request, parent, isMain); };
const workspace = require('../src/move_lab_workspace');
const { MESSAGE_TYPE } = require('../src/universal_toolbar_webview');
Module._load = original;

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const makeOwner = name => {
  let current = true; const messages = [];
  const owner = {
    defPath: `${name}.def`, generation: 1, selectionEpoch: 0, busy: 0, disposed: false, tombstone: false,
    queue: Promise.resolve(), subscriptions: [], routes: new Map(), navigation: workspace.moveLabNavigation([], ''), source: null,
    panel: { active: true, webview: { postMessage: message => { messages.push(message); return true; } }, dispose() { this.disposed = true; } }, messages,
    isCurrent: () => current
  };
  owner.retire = () => { current = false; };
  return owner;
};
const candidateModel = () => ({ files: [], sources: [], diagnostics: [], attacks: { controllers: [], constantProfiles: [] }, visual: { actions: [], p1Action: null, p2Action: null } });

(async () => {
  const first = makeOwner('first'), second = makeOwner('second'), gate = deferred(), order = [];
  const queued = workspace.enqueueOwner(first, async () => { order.push('first-start'); await gate.promise; order.push('first-end'); });
  const after = workspace.enqueueOwner(first, async () => order.push('first-after'));
  await workspace.enqueueOwner(second, async () => order.push('second'));
  assert.deepStrictEqual(order, ['first-start', 'second'], 'each owner has an independent queue');
  assert.strictEqual(workspace.moveLabToolbarModel(first).slots.find(slot => slot.id === 'close').enabled, false, 'an in-flight owner disables Close');
  gate.resolve(); await queued; await after;
  assert.deepStrictEqual(order, ['first-start', 'second', 'first-end', 'first-after'], 'one owner remains serialized');

  let attempts = 0;
  await assert.rejects(workspace.enqueueOwner(first, async () => { attempts += 1; throw new Error('expected'); }));
  await workspace.enqueueOwner(first, async () => { attempts += 1; });
  assert.strictEqual(attempts, 2, 'a failed operation does not poison later retries');

  const late = makeOwner('late'), lateGate = deferred(), candidate = workspace.prepareCandidate(late, candidateModel()); let cleaned = 0;
  late.subscriptions.push({ dispose: () => { cleaned += 1; } }, { dispose: () => { cleaned += 1; } });
  const pending = workspace.enqueueOwner(late, async () => { await lateGate.promise; return workspace.commitCandidate(late, candidate); });
  await Promise.resolve(); const messagesBeforeDispose = late.messages.length; workspace.disposeOwner(late); lateGate.resolve();
  assert.strictEqual(await pending, false, 'a tombstoned owner cannot commit a late candidate');
  assert.strictEqual(late.generation, 2, 'disposal invalidates the captured generation');
  assert.strictEqual(cleaned, 2, 'owner disposal releases every owner-scoped subscription');
  assert.strictEqual(late.messages.length, messagesBeforeDispose, 'an in-flight queued refresh cannot post after disposal');

  const close = makeOwner('close');
  const closeHost = workspace.createMoveLabToolbar(close, { isCurrent: () => true, viewerClose: { prepare: async () => true } });
  close.busy = 1;
  await assert.rejects(closeHost.dispatcher.dispatch('move.lab', { type: MESSAGE_TYPE, slotId: 'close' }), /finish before closing/);
  assert.strictEqual(close.panel.disposed, undefined, 'Close does not cancel or bypass an in-flight operation');
  close.busy = 0;
  const cancelledClose = workspace.createMoveLabToolbar(close, { isCurrent: () => true, viewerClose: { prepare: async () => false } });
  await cancelledClose.dispatcher.dispatch('move.lab', { type: MESSAGE_TYPE, slotId: 'close' });
  assert.strictEqual(close.panel.disposed, undefined, 'a cancelled close leaves the owner intact');
  await closeHost.dispatcher.dispatch('move.lab', { type: MESSAGE_TYPE, slotId: 'close' });
  assert.strictEqual(close.panel.disposed, true, 'Close works when clean and does not self-count as busy');

  const routes = makeOwner('routes'); routes.routes.set('tool:0', { id: 'tool:0', generation: 1, kind: 'tool', command: 'ikemen.hitDef.openEditor' });
  assert.strictEqual(await workspace.invokeMoveLabRoute(routes, { generation: 0, slot: 'tool:0' }), false, 'stale generations fail closed');
  assert.strictEqual(await workspace.invokeMoveLabRoute(routes, { generation: 1, slot: 'missing' }), false, 'unknown slots fail closed');
  assert.strictEqual(await workspace.invokeMoveLabRoute(routes, { generation: 1, slot: 'tool:0' }), 1, 'a valid bounded slot still works after rejection');
  assert.strictEqual(commands.at(-1)[0], 'ikemen.hitDef.openEditor');

  const freshFiles = [{ filename: 'A.def', name: 'A.def', kind: 'DEF', exists: true }, { filename: 'B.zss', name: 'B.zss', kind: 'Code', exists: true }], requested = workspace.moveLabNavigation(freshFiles, 'B.zss', 'cards');
  const reconciled = workspace.reconcileNavigation([freshFiles[0]], requested);
  assert.strictEqual(reconciled.mode, 'cards');
  assert.strictEqual(reconciled.items.length, 1);
  assert.strictEqual(reconciled.currentId, 'connected-0', 'a removed requested file falls back to a fresh connected item');

  const rollback = makeOwner('rollback'), rollbackPosts = []; rollback.panel.webview.postMessage = message => { rollbackPosts.push(message); return true; }; rollback.navigation = workspace.moveLabNavigation(freshFiles, 'B.zss', 'list'); rollback.buildModel = () => { throw new Error('model failed'); };
  const beforeGeneration = rollback.generation;
  await workspace.handleMoveLabMessage(rollback, { type: 'moveLabNavigate', generation: 1, requestId: 7, action: 'previous' });
  assert.strictEqual(rollback.generation, beforeGeneration, 'a failed model does not partially commit navigation');
  assert(rollbackPosts.some(message => message.type === 'moveLabNavigation' && message.requestId === 7 && message.generation === beforeGeneration), 'a model failure reposts committed navigation through the real handler');
  await workspace.refresh(rollback, { requestId: 8, beforeCommit: async () => false, buildModel: () => candidateModel() });
  assert(rollbackPosts.some(message => message.type === 'moveLabNavigation' && message.requestId === 8 && message.generation === beforeGeneration), 'a veto reposts the committed navigation controls');
  rollback.buildModel = () => ({ ...candidateModel(), files: [freshFiles[0]] });
  await workspace.handleMoveLabMessage(rollback, { type: 'moveLabNavigate', generation: 1, requestId: 9, action: 'select', id: 'connected-1' });
  assert.strictEqual(rollback.generation, 2);
  assert.strictEqual(rollback.navigation.items.length, 1);
  assert.strictEqual(rollback.navigation.currentId, 'connected-0', 'navigation commits only a current item that survives the fresh file graph');

  console.log('Move Lab per-owner queue, disposal, close, retry, and bounded-slot lifecycle passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
