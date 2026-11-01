'use strict';

const path = require('path');
const pending = require('./pending_changes');

const COMMAND = 'ikemen.pendingChanges.open';
const TEXT_OWNER = 'vscode.textDocument';

function documentSeed(document) {
  if (!document?.uri || document.uri.scheme !== 'file') return null;
  return {
    ownerId: TEXT_OWNER,
    ownerLabel: 'Text Editor',
    type: 'dirty',
    resource: document.uri.toString(),
    scope: 'document',
    title: path.basename(document.fileName || document.uri.fsPath || document.uri.toString()),
    detail: 'Unsaved source document',
    persistence: 'session',
    sourceRevision: String(document.version || ''),
    actions: { focus: { label: 'Open Source' }, apply: { label: 'Save Document' } },
    metadata: { languageId: String(document.languageId || '') }
  };
}

function summary(entries) {
  const conflicts = entries.filter(entry => entry.type === 'conflict').length;
  return { count: entries.length, text: `$(edit) ${entries.length} pending`, tooltip: `${entries.length} pending change${entries.length === 1 ? '' : 's'}${conflicts ? ` · ${conflicts} conflict${conflicts === 1 ? '' : 's'}` : ''}` };
}

function register(vscode, context) {
  const service = pending.initialize(context.workspaceState);
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 45);
  status.command = COMMAND;
  status.name = 'IKEMaker Pending Changes';

  const refreshStatus = entries => {
    if (!entries.length) { status.hide(); return; }
    const state = summary(entries); status.text = state.text; status.tooltip = state.tooltip; status.show();
  };
  const subscription = service.subscribe(refreshStatus);

  const openDocument = async entry => {
    const resourceKey = value => process.platform === 'win32' ? String(value).toLowerCase() : String(value);
    const document = vscode.workspace.textDocuments.find(item => resourceKey(item.uri.toString()) === resourceKey(entry.resource)) || await vscode.workspace.openTextDocument(vscode.Uri.parse(entry.resource));
    await vscode.window.showTextDocument(document, { preview: false });
    return document;
  };
  const textOwner = service.registerOwner({
    id: TEXT_OWNER,
    label: 'Text Editor',
    focus: openDocument,
    apply: async entry => ({ resolved: await (await openDocument(entry)).save() })
  });

  const tracked = new Map();
  const syncDocument = document => {
    const seed = documentSeed(document); if (!seed) return;
    const id = pending.identity(seed, { caseInsensitive: process.platform === 'win32' }).id;
    if (document.isDirty) {
      if (!tracked.has(document.uri.toString())) {
        tracked.set(document.uri.toString(), id);
        void service.upsert(seed).catch(error => vscode.window.showWarningMessage(`Pending Changes could not track ${seed.title}: ${error.message}`));
      }
    } else if (tracked.delete(document.uri.toString())) {
      void service.remove(id).catch(error => vscode.window.showWarningMessage(`Pending Changes could not clear ${seed.title}: ${error.message}`));
    }
  };
  const forgetDocument = document => {
    const seed = documentSeed(document), trackedId = tracked.get(document?.uri?.toString());
    if (seed && trackedId) { tracked.delete(document.uri.toString()); void service.remove(trackedId); }
  };
  for (const document of vscode.workspace.textDocuments) syncDocument(document);

  const openTray = async () => {
    const entries = service.list();
    if (!entries.length) return vscode.window.showInformationMessage('No pending IKEMaker changes.');
    const selected = await vscode.window.showQuickPick(entries.map(entry => ({
      label: entry.title,
      description: `${entry.type} · ${entry.ownerLabel}`,
      detail: entry.detail || entry.resource,
      entry
    })), { title: 'IKEMaker Pending Changes', placeHolder: 'Choose a change to inspect or resolve', matchOnDescription: true, matchOnDetail: true });
    if (!selected) return;
    const actions = ['focus', 'apply', 'undo'].filter(action => selected.entry.actions[action]).map(action => {
      const state = service.actionState(selected.entry.id, action), metadata = selected.entry.actions[action];
      return { label: metadata.label, description: state.enabled ? '' : state.reason, action, enabled: state.enabled };
    });
    const choice = await vscode.window.showQuickPick(actions, { title: selected.entry.title, placeHolder: 'Choose the canonical owner action' });
    if (!choice) return;
    if (!choice.enabled) return vscode.window.showWarningMessage(choice.description);
    try { await service.execute(selected.entry.id, choice.action); }
    catch (error) { vscode.window.showErrorMessage(`Pending Changes: ${error.message}`); }
  };

  context.subscriptions.push(
    status, subscription, textOwner,
    vscode.commands.registerCommand(COMMAND, openTray),
    vscode.workspace.onDidOpenTextDocument(syncDocument),
    vscode.workspace.onDidChangeTextDocument(event => syncDocument(event.document)),
    vscode.workspace.onDidSaveTextDocument(syncDocument),
    vscode.workspace.onDidCloseTextDocument(forgetDocument)
  );
  return service;
}

module.exports = { COMMAND, TEXT_OWNER, documentSeed, summary, register };
