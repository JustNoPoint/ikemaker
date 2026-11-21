'use strict';

const fs = require('fs');
const path = require('path');
const { BibleStore, FORMAT_FILTERS, readBibleRegistry, resolveBibleOwner, validateTitle } = require('./project_bible_model');
const { bibleClientScript } = require('./project_bible_client');
const { protect } = require('./webview_policy');
const { focusedVisualWorkspaceColumn, trackViewerPanel } = require('./viewer_group');
const { launchControlsHtml, launchControlsClientScript, handleLaunchMessage } = require('./launch_controls');

const COMMAND = 'ikemen.projectBible.open';
const VIEW_TYPE = 'ikemenProjectBible';
const VIEWER = 'project_bible';
const BIBLE_MESSAGES = new Set(['ready', 'refresh', 'close', 'preview', 'worksheet', 'editText', 'copyImageReference', 'newNote', 'addFiles']);

function bibleHtml(owner) {
  const scope = { registryFile: owner.registryFile, owner: { kind: owner.kind, id: owner.id } };
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
* { box-sizing: border-box }
body { margin: 0; color: var(--vscode-foreground); background: var(--vscode-editor-background); font: 13px var(--vscode-font-family) }
.toolbar, #bibleContent > header { display: flex; gap: 8px; flex-wrap: wrap; align-items: center }
.toolbar { padding: 12px 16px; border-bottom: 1px solid var(--vscode-panel-border) }
h1, h2 { margin: 0; overflow-wrap: anywhere }
h1 { font-size: 18px; flex: 1 }
h2 { font-size: 17px }
button, select { color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); font: inherit; padding: 5px 9px; min-height: 28px }
button { cursor: pointer }
button:hover, button[aria-current="true"] { background: var(--vscode-list-hoverBackground) }
button[aria-current="true"] { color: var(--vscode-list-activeSelectionForeground); background: var(--vscode-list-activeSelectionBackground); border-color: var(--vscode-focusBorder) }
button:disabled { opacity: .65; cursor: default }
button:focus-visible, select:focus-visible, [tabindex]:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 2px }
#bibleStatus { padding: 0 16px; white-space: pre-wrap; overflow-wrap: anywhere; margin: 8px 0 }
#bibleStatus:empty { display: none }
.layout { display: grid; grid-template-columns: minmax(150px, 240px) minmax(0, 1fr); min-height: calc(100vh - 62px) }
aside, main { padding: 12px 16px; min-width: 0 }
aside { border-right: 1px solid var(--vscode-panel-border) }
#bibleDocuments { list-style: none; margin: 8px 0; padding: 0 }
#bibleDocuments button { width: 100%; text-align: left; overflow-wrap: anywhere; margin-bottom: 4px }
.muted { color: var(--vscode-descriptionForeground) }
.error { color: var(--vscode-errorForeground) }
main { overflow-wrap: anywhere }
main pre { white-space: pre-wrap; font-family: var(--vscode-editor-font-family, monospace) }
img { max-width: 100%; height: auto; margin: 8px 0; vertical-align: middle }
.worksheet-picker { display: flex; align-items: center; gap: 6px; margin: 10px 0 }
.worksheet-picker select { max-width: 100% }
.worksheet { max-height: 65vh; overflow: auto }
table { border-collapse: separate; border-spacing: 0; min-width: 100%; text-align: left }
th, td { border-bottom: 1px solid var(--vscode-panel-border); border-right: 1px solid var(--vscode-panel-border); padding: 4px 8px; min-width: 80px; max-width: 340px; white-space: pre-wrap; vertical-align: top }
th { background: var(--vscode-editor-background) }
thead th { position: sticky; top: 0 }
tr > th:first-child { min-width: 36px; position: sticky; left: 0 }
thead th:first-child { z-index: 1 }
@media (max-width: 590px) {
  .toolbar h1 { flex-basis: 100%; font-size: 16px }
  .layout { grid-template-columns: 1fr; min-height: 0 }
  aside { border-right: 0; border-bottom: 1px solid var(--vscode-panel-border); max-height: 32vh; overflow: auto }
}
</style></head><body>
${launchControlsHtml(VIEWER, { seed: owner.registryFile, includeLayout: false })}
<header class="toolbar"><h1 id="bibleTitle">Project Bible</h1>
<button id="bibleNewNote" type="button">New Note…</button>
<button id="bibleAddFiles" type="button" title="Copy selected originals into this Bible">Add File Copies…</button>
<button id="bibleRefresh" type="button">Refresh</button>
<button id="bibleClose" type="button">Close</button></header>
<p id="bibleStatus" role="status"></p>
<div class="layout"><aside aria-label="Bible documents"><h2>Documents</h2>
<p id="bibleEmpty" class="muted">Create a Markdown note or copy text, images, and Excel workbooks into this project.</p>
<p id="bibleUnavailable" class="muted" hidden></p>
<ul id="bibleDocuments"></ul></aside>
<main id="bibleContent" aria-label="Document preview"><p class="muted">Select a document to preview it.</p></main></div>
<script>const vscode = acquireVsCodeApi();${launchControlsClientScript({ navigationRestore: false })}${bibleClientScript(scope)}</script></body></html>`;
}

function bindPanel(api, panel, owner, close) {
  const store = new BibleStore(owner);
  const state = { closed: false, busy: false, active: null };
  let queued = null, draining = false, activePreview = 0, archive = null;
  let statusText = '';
  const send = message => state.closed ? Promise.resolve(false) : Promise.resolve(panel.webview.postMessage(message));
  function status(value) {
    statusText = value;
    return send({ type: 'status', text: value, busy: state.busy });
  }
  function library(open) {
    const current = resolveBibleOwner(owner.registryFile, owner);
    const { documents, unavailable } = store.list();
    panel.title = 'Bible · ' + current.name;
    return send({ type: 'library', title: current.name, label: current.label, documents, unavailable, open });
  }
  function authorizedSelection(id) {
    resolveBibleOwner(owner.registryFile, owner);
    return store.entry(id);
  }

  async function drain() {
    if (draining) return;
    draining = true;
    try {
      while (queued && !state.closed) {
        const message = queued;
        queued = null;
        const { id, request, sheetRequest } = message;
        try {
          if (message.type === 'preview') {
            state.active = null;
            archive = null;
            activePreview = request;
            state.active = authorizedSelection(id);
            const preview = store.preview(id);
            if (preview.kind === 'workbook') {
              const index = await preview.archive.index();
              if (queued?.type === 'preview') continue;
              archive = preview.archive;
              await send({ type: 'preview', kind: 'workbook', id, request, restoreSheet: message.restoreSheet, ...index });
            } else {
              await send({ type: 'preview', ...preview, id, request });
            }
          } else if (archive && id === state.active?.id && request === activePreview) {
            const xml = await archive.xml(message.part);
            const shared = !queued && message.strings ? await archive.xml(message.strings) : null;
            if (!queued) await send({ type: 'sheet', id, request, sheetRequest, xml, shared });
          }
        } catch (error) {
          if (!queued) await send({ type: 'previewError', id, request, sheetRequest, text: error.message });
        }
      }
    } finally {
      draining = false;
    }
  }

  async function action(message) {
    if (message.type === 'ready' || message.type === 'refresh') {
      await library();
      if (message.type === 'refresh' && state.active) await send({ type: 'documentChanged', id: state.active.id });
      if (message.type === 'ready') await status(statusText);
      return;
    }
    if (message.type === 'close') { panel.dispose(); return; }
    if (message.type === 'preview' || message.type === 'worksheet') {
      if (!Number.isSafeInteger(message.request) || message.request <= 0 || typeof message.id !== 'string') return;
      if (message.type === 'worksheet' && (!Number.isSafeInteger(message.sheetRequest) ||
          message.request !== activePreview || message.id !== state.active?.id || !archive || queued?.type === 'preview')) return;
      queued = message;
      await drain();
      return;
    }
    if (message.type === 'editText' || message.type === 'copyImageReference') {
      const entry = authorizedSelection(message.id);
      if (message.type === 'editText' && entry.kind === 'text') {
        const document = await api.workspace.openTextDocument(api.Uri.file(entry.filename));
        if (!state.closed) await api.window.showTextDocument(document, { preview: false });
      } else if (message.type === 'copyImageReference' && entry.kind === 'image') {
        await api.env.clipboard.writeText(`![Image description](bible:${entry.id})`);
        await status('Image reference copied. Paste it into a Markdown note in this Bible.');
      }
      return;
    }
    if (state.busy || !['newNote', 'addFiles'].includes(message.type)) return;
    state.busy = true;
    try {
      if (message.type === 'newNote') {
        await status('Creating a Markdown note…');
        const title = await api.window.showInputBox({
          title: 'New Bible Note', prompt: 'Name this Markdown note.',
          validateInput(value) { try { validateTitle(value); } catch (error) { return error.message; } }
        });
        if (state.closed || title === undefined) return;
        resolveBibleOwner(owner.registryFile, owner);
        await library(await store.createNote(title));
        statusText = 'Note created. Use Edit Note to add text or paste an image reference.';
      } else {
        await status('Choose files to copy…');
        const chosen = await api.window.showOpenDialog({
          title: 'Copy documents into this project’s Bible', canSelectFiles: true, canSelectFolders: false, canSelectMany: true,
          openLabel: 'Copy Into Project', filters: FORMAT_FILTERS
        });
        if (state.closed || !chosen?.length) return;
        if (chosen.some(uri => uri.scheme !== 'file')) throw new Error('Choose local files to add to this Bible.');
        resolveBibleOwner(owner.registryFile, owner);
        const { added, failed } = await store.addFiles(chosen.map(uri => uri.fsPath));
        await library(added.length === 1 ? added[0] : undefined);
        const summary = added.length === 1 ? 'Copied 1 file into the Bible.' : `Copied ${added.length} files into the Bible.`;
        statusText = [summary, ...failed.map(item => item.name + ' · ' + item.message)].join('\n');
      }
    } catch (error) {
      statusText = error.message;
    } finally {
      state.busy = false;
      if (statusText.endsWith('…')) statusText = '';
      await status(statusText);
    }
  }

  const messages = panel.webview.onDidReceiveMessage(message => {
    if (!message || typeof message.type !== 'string') return;
    const task = BIBLE_MESSAGES.has(message.type) ? action(message) : handleLaunchMessage(message, owner.registryFile, VIEWER, panel);
    return task.catch(error => status(error.message));
  });
  const saves = api.workspace.onDidSaveTextDocument(document => {
    if (document.uri.scheme === 'file' && document.uri.fsPath === state.active?.filename) {
      return send({ type: 'documentChanged', id: state.active.id });
    }
  });
  panel.onDidDispose(() => {
    state.closed = true;
    queued = null;
    archive = null;
    messages.dispose();
    saves.dispose();
    close();
  });
  panel.title = 'Bible · ' + owner.name;
  panel.webview.options = { enableScripts: true, localResourceRoots: [] };
  require('./viewer_close').support(panel, { isBusy: () => state.busy });
  panel.webview.html = protect(bibleHtml(owner));
}

async function chooseRegistry(api, uri) {
  const projectContext = require('./project_context_ui');
  const seed = uri?.scheme === 'file' ? uri : projectContext.activeUri();
  const roots = [projectContext.contextRoot(seed), ...(api.workspace.workspaceFolders || []).map(folder => folder.uri.fsPath)].filter(Boolean);
  const files = [...new Set(roots.map(root => projectContext.registryPath(root)))].filter(filename => fs.existsSync(filename));
  if (seed?.fsPath && path.basename(seed.fsPath).toLowerCase() === 'project-registry.json') return seed.fsPath;
  if (files.length === 1) return files[0];
  if (files.length > 1) {
    const selected = await api.window.showQuickPick(files.map(filename => ({
      label: path.basename(path.dirname(path.dirname(filename))), description: filename, filename
    })), { title: 'Choose the Bible’s project registry' });
    return selected?.filename;
  }
  const chosen = await api.window.showOpenDialog({
    title: 'Choose a .ikemen/project-registry.json file', canSelectFiles: true, canSelectFolders: false,
    canSelectMany: false, openLabel: 'Choose Project Registry', filters: { 'Project registry JSON': ['json'] }
  });
  return chosen?.[0]?.scheme === 'file' ? chosen[0].fsPath : null;
}

async function chooseOwner(api, filename) {
  const { registry } = readBibleRegistry(filename);
  const choices = [
    ...registry.projects.map(row => ({ label: row.name, description: 'Game', kind: 'game', id: row.id })),
    ...registry.workProjects.map(row => ({ label: row.name, description: 'Work project', kind: 'work', id: row.id })),
    ...registry.teams.map(row => ({ label: row.name, description: 'Team', kind: 'team', id: row.id }))
  ];
  if (!choices.length) {
    await api.window.showInformationMessage('Add a game, work project, or team in Project & Team Manager to open its Bible.');
    return null;
  }
  return api.window.showQuickPick(choices, { title: 'Choose a game, work project, or team Bible', matchOnDescription: true });
}

function registerProjectBible(api, context) {
  const panels = new Map();
  function attach(panel, owner) {
    trackViewerPanel(panel);
    panels.set(owner.key, panel);
    bindPanel(api, panel, owner, () => {
      if (panels.get(owner.key) === panel) panels.delete(owner.key);
    });
    return panel;
  }

  async function open(input, owner) {
    try {
      const filename = typeof input === 'string' ? input : await chooseRegistry(api, input);
      if (!filename) return;
      const selected = owner || await chooseOwner(api, filename);
      if (!selected) return;
      const scope = resolveBibleOwner(filename, selected);
      const column = await focusedVisualWorkspaceColumn(api.ViewColumn.Active, api);
      const current = panels.get(scope.key);
      if (current) {
        current.reveal(column, false);
        return current;
      }
      return attach(api.window.createWebviewPanel(VIEW_TYPE, 'Bible · ' + scope.name, column, {
        enableScripts: true, localResourceRoots: [], retainContextWhenHidden: true
      }), scope);
    } catch (error) {
      return api.window.showErrorMessage('Project Bible · ' + error.message);
    }
  }

  context.subscriptions.push(api.commands.registerCommand(COMMAND, open), api.window.registerWebviewPanelSerializer(VIEW_TYPE, {
    async deserializeWebviewPanel(panel, state) {
      try {
        const owner = resolveBibleOwner(state?.registryFile, state?.owner);
        if (panels.has(owner.key)) { panel.dispose(); return; }
        attach(panel, owner);
      } catch (error) {
        panel.dispose();
        await api.window.showWarningMessage('Project Bible could not restore its owner. ' + error.message);
      }
    }
  }));
}

module.exports = { COMMAND, VIEW_TYPE, bibleHtml, registerProjectBible };
