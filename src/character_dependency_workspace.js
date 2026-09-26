'use strict';

const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { chooseCharacterDef } = require('./character_picker');
const { buildCharacterDependencyModel } = require('./character_dependency_model');
const { launchControlsHtml, launchControlsClientScript, handleLaunchMessage } = require('./launch_controls');
const { registerCharacterToolPanel } = require('./authoring_context_registry');
const { preferredViewerColumn, trackViewerPanel, revealInViewerGroup } = require('./viewer_group');

const openPanels=new Map();
const panelKey=file=>path.resolve(file).toLowerCase();
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]); }
function nodeRow(node, edgeLabel = '') {
  const state = node.exists ? '' : ' missing';
  return `<button class="node${state}" data-file="${escapeHtml(node.filename)}" data-line="0" title="${escapeHtml(node.filename)}"><span class="kind">${escapeHtml(node.kind)}</span><b>${escapeHtml(node.label)}</b>${edgeLabel ? `<span class="edge">${escapeHtml(edgeLabel)}</span>` : ''}<small>${escapeHtml(node.relative)}</small>${node.exists ? '' : '<em>Missing</em>'}</button>`;
}
function assignmentTree(model, id, seen = new Set()) {
  const node = model.nodes.find((item) => item.id === id); if (!node) return '';
  if (seen.has(id)) return `<li>${nodeRow(node, 'already shown')}</li>`;
  const branches = (parent, visited) => model.edges.filter((edge) => edge.type === 'assignment' && edge.from === parent).map((edge) => {
    const child = model.nodes.find((item) => item.id === edge.to); if (!child) return '';
    if (visited.has(child.id)) return `<li><div class="branch-label">${escapeHtml(edge.label)}</div>${nodeRow(child, 'already shown')}</li>`;
    const next = new Set(visited); next.add(child.id); const descendants = branches(child.id, next);
    return `<li><div class="branch-label">${escapeHtml(edge.label)}</div>${nodeRow(child)}${descendants.length ? `<ul>${descendants.join('')}</ul>` : ''}</li>`;
  });
  const next = new Set(seen); next.add(id); const children = branches(id, next);
  return `<li>${nodeRow(node)}${children.length ? `<ul>${children.join('')}</ul>` : ''}</li>`;
}
function codeBranches(model) {
  const grouped = new Map();
  for (const edge of model.edges.filter((item) => item.type !== 'assignment')) { if (!grouped.has(edge.from)) grouped.set(edge.from, []); grouped.get(edge.from).push(edge); }
  if (!grouped.size) return '<p class="muted">No cross-file function calls or state transitions were found among the DEF-assigned code files.</p>';
  return [...grouped.entries()].map(([from, edges]) => { const source = model.nodes.find((item) => item.id === from); return `<details open data-branch="${escapeHtml(source?.relative || from)}"><summary>${escapeHtml(source?.relative || from)}</summary><ul>${edges.map((edge) => { const target = model.nodes.find((item) => item.id === edge.to); return `<li><span class="relation ${escapeHtml(edge.type)}">${escapeHtml(edge.label)}</span><button class="node compact" data-file="${escapeHtml(edge.to)}" data-line="${edge.targetLine}"><b>${escapeHtml(target?.relative || edge.to)}</b><small>line ${edge.targetLine + 1}</small></button></li>`; }).join('')}</ul></details>`; }).join('');
}
function html(model) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;font:13px var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background)}header{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--vscode-panel-border);position:sticky;top:0;background:var(--vscode-editor-background);z-index:2}header .grow{flex:1}button{font:inherit}.action{padding:6px 10px;color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:0;cursor:pointer}.summary{color:var(--vscode-descriptionForeground)}main{display:grid;grid-template-columns:minmax(420px,1fr) minmax(420px,1fr);gap:14px;padding:14px}section{border:1px solid var(--vscode-panel-border);border-radius:6px;padding:12px;min-width:0}h2{font-size:15px;margin:0 0 10px}ul{list-style:none;margin:0;padding-left:22px;border-left:1px solid var(--vscode-tree-indentGuidesStroke)}li{margin:5px 0}.node{width:100%;display:grid;grid-template-columns:80px minmax(120px,auto) 1fr auto;align-items:center;gap:8px;text-align:left;padding:7px 9px;border:1px solid var(--vscode-panel-border);border-radius:4px;color:var(--vscode-foreground);background:var(--vscode-editorWidget-background);cursor:pointer}.node[aria-current=true]{outline:2px solid var(--vscode-focusBorder)}.node:hover{background:var(--vscode-list-hoverBackground)}.node.missing{border-color:var(--vscode-errorForeground)}.node small,.edge,.muted{color:var(--vscode-descriptionForeground)}.node em{color:var(--vscode-errorForeground)}.kind,.relation{font-size:10px;text-transform:uppercase;color:var(--vscode-badge-foreground);background:var(--vscode-badge-background);padding:2px 5px;border-radius:3px}.branch-label{font-size:11px;color:var(--vscode-descriptionForeground);margin:2px 0}.compact{display:inline-grid;width:calc(100% - 150px);margin-left:8px;grid-template-columns:1fr auto}.relation{display:inline-block;min-width:135px}.relation.function{background:#4d6a92}.relation.state{background:#76538e}details{margin:7px 0}summary{cursor:pointer;font-weight:600;padding:5px}.notice{grid-column:1/-1;padding:8px 10px;background:var(--vscode-textBlockQuote-background);border-left:3px solid var(--vscode-focusBorder)}@media(max-width:950px){main{grid-template-columns:1fr}}
</style></head><body><header><b>Character Connection Tree</b><span>${escapeHtml(model.character)}</span><span class="summary">${model.summary.files} files · ${model.summary.assignments} assignments · ${model.summary.codeLinks} code links · ${model.summary.missing} missing</span><span class="grow"></span>${launchControlsHtml('character_dependency')}<button class="action" id="openDef">Open DEF</button><button class="action" id="choose">Open Another Character…</button><button class="action" id="refresh">Refresh</button></header><main><div class="notice">The left tree follows file assignments from the character DEF. The right tree traces cross-file ZSS function calls and state transitions. Select any row to open its source; this view never edits files.</div><section><h2>DEF and assigned assets</h2><ul>${assignmentTree(model, model.root)}</ul></section><section><h2>Code relationships</h2>${codeBranches(model)}</section></main><script>const vscode=acquireVsCodeApi();vscode.setState({defPath:${JSON.stringify(model.root)}});for(const item of document.querySelectorAll('[data-file]'))item.onclick=()=>vscode.postMessage({type:'open',file:item.dataset.file,line:Number(item.dataset.line||0)});document.getElementById('openDef').onclick=()=>vscode.postMessage({type:'open',file:${JSON.stringify(model.root)},line:0});document.getElementById('refresh').onclick=()=>vscode.postMessage({type:'refresh'});document.getElementById('choose').onclick=()=>vscode.postMessage({type:'choose'});${require('./connection_selection').clientScript()}${launchControlsClientScript()}</script></body></html>`;
}

async function reveal(filename, line = 0) {
  if (!fs.existsSync(filename)) return vscode.window.showWarningMessage(`Referenced file is missing: ${filename}`);
  const extension = path.extname(filename).toLowerCase();
  if (extension === '.sff') return vscode.commands.executeCommand('sff.openViewer', vscode.Uri.file(filename));
  if (extension === '.snd') return vscode.commands.executeCommand('snd.openViewer', vscode.Uri.file(filename));
  if (extension === '.air') return vscode.commands.executeCommand('air.openAnimationPreview', vscode.Uri.file(filename));
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filename));
  const target = new vscode.Range(Math.max(0, Math.min(document.lineCount - 1, Number(line) || 0)), 0, Math.max(0, Math.min(document.lineCount - 1, Number(line) || 0)), 0);
  return vscode.window.showTextDocument(document, { preview: false, selection: target });
}

async function populate(panel, defPath) {
  const model = buildCharacterDependencyModel(defPath);
  require('./viewer_navigation').resetSourcePanel(panel);
  require('./viewer_sessions').updateSource(panel,defPath);
  if(panel.ikemenConnectionFile&&openPanels.get(panel.ikemenConnectionFile)===panel)openPanels.delete(panel.ikemenConnectionFile);
  panel.ikemenConnectionFile=panelKey(defPath);openPanels.set(panel.ikemenConnectionFile,panel);
  if(!panel.ikemenConnectionTracked){panel.ikemenConnectionTracked=true;panel.onDidDispose(()=>{if(openPanels.get(panel.ikemenConnectionFile)===panel)openPanels.delete(panel.ikemenConnectionFile);});}
  registerCharacterToolPanel(panel, defPath, model.character, model.nodes.filter((item) => item.exists).map((item) => item.filename));
  panel.title = `${model.character} — Character Connections`;
  panel.webview.options = { enableScripts: true };
  panel.webview.html = require('./webview_policy').protect(html(model), panel.webview.cspSource);
  if (panel.ikemenDependencyMessage) panel.ikemenDependencyMessage.dispose();
  panel.ikemenDependencyMessage = panel.webview.onDidReceiveMessage(async (message) => {
    if (await handleLaunchMessage(message, defPath, 'connections', panel)) return;
    if (message.type === 'open') return reveal(message.file, message.line);
    if (message.type === 'refresh') return populate(panel, defPath);
    if (message.type === 'choose') { const selected = await chooseCharacterDef(undefined, { title: 'Open Character Connection Tree' }); if (selected) return populate(panel, selected); }
  });
}

async function openCharacterDependencyWorkspace(uri) {
  const defPath = await chooseCharacterDef(uri, { title: 'Open Character Connection Tree' });
  if (!defPath) return;
  const existing=openPanels.get(panelKey(defPath));if(existing){revealInViewerGroup(existing);return existing;}
  const panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenCharacterDependencies', 'Character Connection Tree', preferredViewerColumn(vscode.ViewColumn.Active), { enableScripts: true, retainContextWhenHidden: true }));
  await populate(panel, defPath);
  return panel;
}

function registerCharacterDependencyWorkspace(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('ikemen.characterDependencies.open', openCharacterDependencyWorkspace),
    vscode.window.registerWebviewPanelSerializer('ikemenCharacterDependencies', { async deserializeWebviewPanel(panel, state) { if (!state?.defPath || !fs.existsSync(state.defPath)) return panel.dispose(); await populate(panel, state.defPath); } })
  );
}

module.exports = { escapeHtml, assignmentTree, codeBranches, html, reveal, populate, openCharacterDependencyWorkspace, registerCharacterDependencyWorkspace };
