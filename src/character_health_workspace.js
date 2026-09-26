'use strict';

const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const controllerCatalog = require('../data/sctrl.json');
const { chooseCharacterDef } = require('./character_picker');
const { buildCharacterHealthModel, addHealthFiles, recount, createRepairPlan } = require('./character_health_model');
const { transactionalWriteSet, hash, optionsFromConfig } = require('./mutation_safety');
const { launchControlsHtml, launchControlsClientScript, handleLaunchMessage } = require('./launch_controls');
const { registerCharacterToolPanel } = require('./authoring_context_registry');
const { preferredViewerColumn, trackViewerPanel } = require('./viewer_group');

const previewContent = new Map();
const lastApply = new Map();
let diagnostics;

function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]); }
function profileOptions(resource, profile = 'ikemen-1.0') {
  const config = vscode.workspace.getConfiguration('ikemenZss', resource);
  const authorName = String(config.get('authorName', '') || '').trim();
  return {
    profile,
    profileLabel: profile === 'conservative-custom' ? 'Custom / conservative' : 'IKEMEN GO 1.0',
    checkUnknownParameters: profile !== 'conservative-custom' && config.get('characterHealth.checkUnknownParameters', true),
    allowedParameters: config.get('characterHealth.allowedParameters', []),
    analyzerOptions: {
      mapPrefixes: config.get('mapPrefixes', []),
      functionPrefixes: config.get('functionPrefixes', []),
      opponentAvailability: authorName ? config.get('authorRules.opponentAvailability', 'off') : 'off',
      authorName
    }
  };
}
function ignoredRules(resource) { return new Set(vscode.workspace.getConfiguration('ikemenZss', resource).get('characterHealth.ignoredRules', [])); }
function filteredModel(defPath, profile, extraFiles = []) {
  const uri = vscode.Uri.file(defPath), model = buildCharacterHealthModel(defPath, profileOptions(uri, profile));
  addHealthFiles(model, extraFiles, profileOptions(uri, profile));
  const ignored = ignoredRules(uri); model.findings = model.findings.filter((item) => !ignored.has(item.code));
  return recount(model);
}
function serializable(model) {
  return { ...model, files: model.files.map(({ text, ...file }) => file), dependency: { ...model.dependency, nodes: model.dependency.nodes, edges: model.dependency.edges } };
}
function healthHtml(model) {
  const data = JSON.stringify(serializable(model)).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{margin:0;background:var(--vscode-editor-background);color:var(--vscode-foreground);font:13px var(--vscode-font-family)}button,input,select{font:inherit;color:inherit;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);padding:6px 9px}button{cursor:pointer}button.primary{color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:0}button:disabled{opacity:.5;cursor:default}header{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--vscode-panel-border);position:sticky;top:0;z-index:5;background:var(--vscode-editor-background)}header .grow{flex:1}.summary{display:grid;grid-template-columns:repeat(6,minmax(105px,1fr));gap:8px;padding:12px 14px;border-bottom:1px solid var(--vscode-panel-border)}.metric{padding:9px;border:1px solid var(--vscode-panel-border);border-radius:5px}.metric b{display:block;font-size:18px}.controls{display:flex;gap:8px;align-items:center;padding:10px 14px;flex-wrap:wrap;border-bottom:1px solid var(--vscode-panel-border)}main{display:grid;grid-template-columns:minmax(260px,340px) 1fr;height:calc(100vh - 190px)}aside{border-right:1px solid var(--vscode-panel-border);overflow:auto;padding:12px}.findings{overflow:auto;padding:12px}.file,.finding{display:block;width:100%;text-align:left;background:transparent;border:0;border-bottom:1px solid var(--vscode-panel-border);padding:9px}.file.active,.finding:hover{background:var(--vscode-list-hoverBackground)}.finding{display:grid;grid-template-columns:24px 92px minmax(210px,1fr) auto;gap:9px;align-items:start}.finding input{margin-top:4px}.badge{font-size:10px;text-transform:uppercase;border:1px solid currentColor;border-radius:10px;padding:2px 6px;text-align:center}.error{color:var(--vscode-errorForeground)}.warning{color:var(--vscode-editorWarning-foreground)}.convention{color:var(--vscode-charts-blue)}.suggestion{color:var(--vscode-descriptionForeground)}.message{color:var(--vscode-descriptionForeground);margin-top:4px}.actions{display:flex;gap:5px;flex-wrap:wrap}.actions button{padding:4px 7px}.notice{margin:10px 14px;padding:9px 11px;background:var(--vscode-textBlockQuote-background);border-left:3px solid var(--vscode-focusBorder)}.muted{color:var(--vscode-descriptionForeground)}details{margin-top:5px}summary{cursor:pointer}.empty{padding:30px;text-align:center}.safe-mark{color:var(--vscode-testing-iconPassed)}@media(max-width:920px){.summary{grid-template-columns:repeat(3,1fr)}main{grid-template-columns:1fr}aside{display:none}.finding{grid-template-columns:24px 80px 1fr}}
</style></head><body><header><b>Character Health & Cleanup</b><span>${escapeHtml(model.character)}</span><span class="muted">${escapeHtml(model.profileLabel)}</span><span class="grow"></span>${launchControlsHtml('character_health')}<button id="report">Report</button><button id="addFiles" title="Include CNS, CMD, JNP, ZSS, or AIR files that are not assigned by the character DEF">Add files…</button><button id="clearExtras" title="Remove manually added files from this audit; no project files are deleted">Clear added</button><button id="choose">Another Character…</button><button id="refresh">Refresh</button></header>
<div class="notice"><b>Audit first:</b> scanning never changes files. “Select safe” only marks repairs that preserve current engine behavior. Preview the exact diff before applying. Unknown parameters and conflicting AIR actions always require human review.</div>
<section class="summary"><div class="metric error"><b>${model.counts.error}</b>Errors</div><div class="metric warning"><b>${model.counts.warning}</b>Warnings</div><div class="metric convention"><b>${model.counts.convention}</b>Conventions</div><div class="metric suggestion"><b>${model.counts.suggestion}</b>Suggestions</div><div class="metric"><b>${model.counts.fixable}</b>Reviewable repairs</div><div class="metric safe-mark"><b>${model.counts.safe}</b>Behavior-preserving</div></section>
<div class="controls"><select id="profile" title="IKEMEN GO 1.0 validates documented controller options. Custom / conservative leaves unknown project parameters unclassified."><option value="ikemen-1.0"${model.profile === 'ikemen-1.0' ? ' selected' : ''}>IKEMEN GO 1.0</option><option value="conservative-custom"${model.profile === 'conservative-custom' ? ' selected' : ''}>Custom / conservative</option></select><input id="search" placeholder="Filter finding, parameter, controller, or file" size="35"><select id="level"><option value="all">All levels</option><option value="error">Errors</option><option value="warning">Warnings</option><option value="convention">Conventions</option><option value="suggestion">Suggestions</option></select><button id="safe">Select safe</button><button id="clear">Clear selection</button><select id="mode" title="Comment keeps removed source visible for review. Delete removes it after preview. An accepted spelling suggestion changes only its parameter name in either mode."><option value="comment">Comment flagged source</option><option value="delete">Delete flagged source</option></select><button id="preview" class="primary">Preview selected</button><button id="apply" class="primary">Apply selected…</button><button id="undo"${lastApply.has(model.defPath) ? '' : ' disabled'}>Undo last cleanup</button><button id="settings" title="Configure project-allowed parameters and ignored rule codes">Settings</button><span id="selection" class="muted">0 selected</span></div>
<main><aside><b>Files in audit</b><button class="file active" data-file-filter="">All files <span class="muted">· ${model.findings.length} findings</span></button>${model.files.map((file) => `<button class="file" data-file-filter="${escapeHtml(file.filename)}" title="${escapeHtml(file.filename)}">${escapeHtml(file.relative)}${file.extra ? ' <span class="badge">added</span>' : ''} <span class="muted">· ${file.findings}</span></button>`).join('')}<hr><b>Also checked</b><p class="muted">${model.dependency.summary.files} dependency nodes · ${model.dependency.summary.missing} missing. SFF, SND, palettes, runtime tests, and project conventions retain their dedicated visual audits.</p></aside><section class="findings" id="findings"></section></main>
<script>const vscode=acquireVsCodeApi(),model=${data};vscode.setState({defPath:model.defPath,profile:model.profile,extraFiles:model.files.filter(file=>file.extra).map(file=>file.filename)});let fileFilter='',selected=new Set();const list=document.getElementById('findings'),search=document.getElementById('search'),level=document.getElementById('level');
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function visible(item){const q=search.value.trim().toLowerCase();return(!fileFilter||item.file===fileFilter)&&(level.value==='all'||item.level===level.value)&&(!q||(item.title+' '+item.message+' '+item.file+' '+item.key+' '+item.controller).toLowerCase().includes(q))}function updateCount(){document.getElementById('selection').textContent=selected.size+' selected'}
function render(){const items=model.findings.filter(visible);list.innerHTML=items.map(item=>'<article class="finding"><input type="checkbox" data-check="'+item.id+'" '+(selected.has(item.id)?'checked ':'')+(item.fix?'':'disabled title="Review-only finding"')+'><span class="badge '+item.level+'">'+esc(item.level)+'</span><div><b>'+esc(item.title)+'</b> <span class="muted">'+esc(item.file.split(/[\\/]/).pop())+':'+(item.line+1)+'</span>'+(item.safe&&item.fix?' <span class="safe-mark" title="Applying this repair preserves the behavior currently used by the engine">behavior-preserving</span>':'')+'<div class="message">'+esc(item.message)+'</div>'+((item.effectiveValue||item.suggestion||item.controller)?'<details><summary>Why and what takes effect</summary>'+(item.controller?'<div>Controller: <b>'+esc(item.controller)+'</b></div>':'')+(item.effectiveValue?'<div>Effective value: <code>'+esc(item.effectiveValue)+'</code></div>':'')+(item.suggestion?'<div>Suggested spelling: <code>'+esc(item.suggestion)+'</code></div>':'')+'</details>':'')+'</div><div class="actions"><button data-open="'+item.id+'">Open</button>'+(item.action!==undefined?'<button data-air="'+item.id+'">AIR review</button>':'')+(item.controller?'<button data-docs="'+item.id+'">Docs</button>':'')+'</div></article>').join('')||'<div class="empty muted">No findings match this filter.</div>';for(const box of list.querySelectorAll('[data-check]'))box.onchange=()=>{box.checked?selected.add(box.dataset.check):selected.delete(box.dataset.check);updateCount()};for(const button of list.querySelectorAll('[data-open]'))button.onclick=()=>vscode.postMessage({type:'open',id:button.dataset.open});for(const button of list.querySelectorAll('[data-air]'))button.onclick=()=>vscode.postMessage({type:'air',id:button.dataset.air});for(const button of list.querySelectorAll('[data-docs]'))button.onclick=()=>vscode.postMessage({type:'docs',id:button.dataset.docs});updateCount()}
search.oninput=render;level.onchange=render;document.getElementById('profile').onchange=e=>vscode.postMessage({type:'profile',profile:e.target.value});document.getElementById('safe').onclick=()=>{for(const item of model.findings)if(item.safe&&item.fix)selected.add(item.id);render()};document.getElementById('clear').onclick=()=>{selected.clear();render()};function selectionMessage(type){vscode.postMessage({type,ids:[...selected],mode:document.getElementById('mode').value})}document.getElementById('preview').onclick=()=>selectionMessage('preview');document.getElementById('apply').onclick=()=>selectionMessage('apply');document.getElementById('undo').onclick=()=>vscode.postMessage({type:'undo'});document.getElementById('settings').onclick=()=>vscode.postMessage({type:'settings'});document.getElementById('report').onclick=()=>vscode.postMessage({type:'report'});document.getElementById('addFiles').onclick=()=>vscode.postMessage({type:'addFiles'});document.getElementById('clearExtras').onclick=()=>vscode.postMessage({type:'clearExtras'});document.getElementById('choose').onclick=()=>vscode.postMessage({type:'choose'});document.getElementById('refresh').onclick=()=>vscode.postMessage({type:'refresh'});for(const button of document.querySelectorAll('[data-file-filter]'))button.onclick=()=>{fileFilter=button.dataset.fileFilter;for(const other of document.querySelectorAll('[data-file-filter]'))other.classList.toggle('active',other===button);render()};${require('./health_selection').clientScript()}${launchControlsClientScript()}render();</script></body></html>`;
}

function severity(level) { return ({ error: vscode.DiagnosticSeverity.Error, warning: vscode.DiagnosticSeverity.Warning, convention: vscode.DiagnosticSeverity.Information, suggestion: vscode.DiagnosticSeverity.Hint })[level] ?? vscode.DiagnosticSeverity.Information; }
function publishDiagnostics(model) {
  diagnostics.clear(); const grouped = new Map();
  for (const item of model.findings) {
    if (!fs.existsSync(item.file)) continue;
    let documentLines; try { documentLines = fs.readFileSync(item.file, 'utf8').split(/\r?\n/); } catch (_) { continue; }
    const line = Math.max(0, Math.min(documentLines.length - 1, item.line)), end = Math.max(line, Math.min(documentLines.length - 1, item.endLine));
    const diagnostic = new vscode.Diagnostic(new vscode.Range(line, 0, end, documentLines[end]?.length || 1), item.message, severity(item.level));
    diagnostic.source = 'IKEMaker Character Health'; diagnostic.code = item.code;
    const key = vscode.Uri.file(item.file).toString(); if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(diagnostic);
  }
  for (const [uri, entries] of grouped) diagnostics.set(vscode.Uri.parse(uri), entries);
}
async function openAt(item, air = false) {
  if (!fs.existsSync(item.file)) return vscode.window.showWarningMessage(`Referenced file is missing: ${item.file}`);
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(item.file)), position = new vscode.Position(Math.max(0, item.line), 0);
  await vscode.window.showTextDocument(document, { preview: false, selection: new vscode.Range(position, position), viewColumn: vscode.ViewColumn.Beside });
  if (air && /\.air$/i.test(item.file)) await vscode.commands.executeCommand('air.openAnimationPreview', vscode.Uri.file(item.file));
}
async function showDocs(item) {
  const controller = controllerCatalog.find((entry) => entry.name.toLowerCase() === String(item.controller || '').toLowerCase()); if (!controller) return;
  const used = item.key ? `The finding concerns **${item.key}**.` : '';
  const content = [`# ${controller.name}`, '', controller.description || '', '', used, '', '## Documented options', '', ...(controller.params || []).map((param) => `- **${param.name}**${param.required ? ' — required' : ''}: \`${param.placeholder || 'value'}\``), '', 'This is the extension’s bundled offline IKEMEN documentation snapshot. Update the offline library when intentionally moving to a newer engine contract.'].join('\n');
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument({ language: 'markdown', content }), { preview: false, viewColumn: vscode.ViewColumn.Beside });
}
async function showPlanDiff(model, plan) {
  if (!plan.writes.length) return vscode.window.showInformationMessage('Select one or more fixable findings first.');
  let write = plan.writes[0];
  if (plan.writes.length > 1) {
    const picked = await vscode.window.showQuickPick(plan.writes.map((entry) => ({ label: path.basename(entry.filename), description: entry.filename, write: entry })), { title: `Preview ${plan.repairCount} selected cleanup repairs`, placeHolder: 'Choose a changed file to compare. No files have been modified.' });
    if (!picked) return; write = picked.write;
  }
  const key = `${Date.now()}-${Math.random().toString(16).slice(2)}`, uri = vscode.Uri.parse(`ikemen-cleanup-preview:/${encodeURIComponent(path.basename(write.filename))}?${key}`); previewContent.set(uri.toString(), write.after);
  await vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(write.filename), uri, `Before ↔ Character Cleanup Preview: ${path.basename(write.filename)}`);
}
async function applyPlan(panel, model, plan, profile) {
  if (!plan.writes.length) return vscode.window.showInformationMessage('Select one or more fixable findings first.');
  const answer = await vscode.window.showWarningMessage(`Apply ${plan.repairCount} reviewed repair(s) across ${plan.writes.length} file(s)?`, { modal: true, detail: `${plan.mode === 'comment' ? 'Flagged source will be commented and retained.' : 'Flagged source will be removed.'}\n\nBackups and mutation history follow your IKEMaker safety settings. Files changed since this audit will not be overwritten.` }, 'Apply Cleanup');
  if (answer !== 'Apply Cleanup') return;
  const expectedHashes = Object.fromEntries(plan.writes.map((entry) => [path.resolve(entry.filename), entry.expectedHash]));
  const before = plan.writes.map((entry) => ({ filename: entry.filename, before: entry.before, after: entry.after }));
  transactionalWriteSet(fs, plan.writes.map((entry) => [entry.filename, entry.after]), optionsFromConfig(vscode, model.defPath, `character-health-${plan.mode}`, { journalRoot: path.dirname(model.defPath), aggregateJournal: true, expectedHashes }));
  lastApply.set(model.defPath, before); await populate(panel, model.defPath, profile);
  vscode.window.showInformationMessage(`Applied ${plan.repairCount} character cleanup repair(s). Use Undo last cleanup here or the Recovery Center later.`);
}
async function undo(panel, model, profile) {
  const record = lastApply.get(model.defPath); if (!record?.length) return;
  const answer = await vscode.window.showWarningMessage(`Undo the last Character Health cleanup across ${record.length} file(s)?`, { modal: true }, 'Undo Cleanup'); if (answer !== 'Undo Cleanup') return;
  const expectedHashes = Object.fromEntries(record.map((entry) => [path.resolve(entry.filename), hash(entry.after)]));
  transactionalWriteSet(fs, record.map((entry) => [entry.filename, entry.before]), optionsFromConfig(vscode, model.defPath, 'undo-character-health', { journalRoot: path.dirname(model.defPath), aggregateJournal: true, expectedHashes }));
  lastApply.delete(model.defPath); await populate(panel, model.defPath, profile); vscode.window.showInformationMessage('The last Character Health cleanup was restored.');
}
async function showReport(model) {
  const lines = ['# Character Health & Cleanup report', '', `Character: **${model.character}**`, `Profile: **${model.profileLabel}**`, `Main DEF: ${model.defPath}`, '', `Errors: ${model.counts.error} · Warnings: ${model.counts.warning} · Conventions: ${model.counts.convention} · Suggestions: ${model.counts.suggestion}`, '', '## Findings', ''];
  for (const item of model.findings) lines.push(`- **${item.level.toUpperCase()} — ${item.title}**  `, `  ${item.file}:${item.line + 1}  `, `  ${item.message}`);
  if (!model.findings.length) lines.push('No findings under the selected profile.');
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument({ language: 'markdown', content: lines.join('\n') }), { preview: false, viewColumn: vscode.ViewColumn.Beside });
}
async function populate(panel, defPath, profile = 'ikemen-1.0') {
  registerCharacterToolPanel(panel, defPath, path.basename(path.dirname(defPath)), [defPath]);
  const model = filteredModel(defPath, profile, panel.ikemenHealthExtras || []); publishDiagnostics(model); panel.title = `${model.character} — Character Health`;
  panel.webview.options = { enableScripts: true }; panel.webview.html = require('./webview_policy').protect(healthHtml(model), panel.webview.cspSource);
  if (panel.ikemenHealthSave) panel.ikemenHealthSave.dispose();
  panel.ikemenHealthSave = vscode.workspace.onDidSaveTextDocument((document) => { if (model.files.some((file) => path.resolve(file.filename) === path.resolve(document.fileName))) populate(panel, defPath, profile); });
  if (!panel.ikemenHealthDisposeHook) panel.ikemenHealthDisposeHook = panel.onDidDispose(() => { if (panel.ikemenHealthSave) panel.ikemenHealthSave.dispose(); });
  if (panel.ikemenHealthMessage) panel.ikemenHealthMessage.dispose();
  panel.ikemenHealthMessage = panel.webview.onDidReceiveMessage(async (message) => { try {
    if (await handleLaunchMessage(message, defPath, 'health', panel)) return;
    const item = model.findings.find((entry) => entry.id === message.id);
    if (message.type === 'open' && item) return openAt(item, false);
    if (message.type === 'air' && item) return openAt(item, true);
    if (message.type === 'docs' && item) return showDocs(item);
    if (message.type === 'profile') return populate(panel, defPath, message.profile);
    if (message.type === 'refresh') return populate(panel, defPath, profile);
    if (message.type === 'addFiles') { const chosen = await vscode.window.showOpenDialog({ title: 'Add unassigned files to this character audit', canSelectMany: true, canSelectFiles: true, canSelectFolders: false, filters: { 'IKEMEN character source': ['cns', 'cmd', 'jnp', 'zss', 'air'] } }); if (chosen?.length) { panel.ikemenHealthExtras = [...new Set([...(panel.ikemenHealthExtras || []), ...chosen.map((item) => item.fsPath)])]; return populate(panel, defPath, profile); } return; }
    if (message.type === 'clearExtras') { panel.ikemenHealthExtras = []; return populate(panel, defPath, profile); }
    if (message.type === 'choose') { const chosen = await chooseCharacterDef(undefined, { title: 'Open Character Health & Cleanup' }); if (chosen) return populate(panel, chosen, profile); return; }
    if (message.type === 'report') return showReport(model);
    if (message.type === 'settings') return vscode.commands.executeCommand('workbench.action.openSettings', '@ext:justnopoint.ikemen-zss-tools character health');
    if (message.type === 'preview') return showPlanDiff(model, createRepairPlan(model, message.ids, message.mode));
    if (message.type === 'apply') return applyPlan(panel, model, createRepairPlan(model, message.ids, message.mode), profile);
    if (message.type === 'undo') return undo(panel, model, profile);
  } catch (error) { vscode.window.showErrorMessage(`Character Health & Cleanup: ${error.message}`); } });
}
async function openCharacterHealthWorkspace(uri, options={}) {
  const defPath = await chooseCharacterDef(uri, { title: 'Open Character Health & Cleanup' }); if (!defPath) return;
  const reference=options?.reference,profile=reference?.profile||'ikemen-1.0';
  if(!['ikemen-1.0','conservative-custom'].includes(profile))throw new Error('The saved health profile is unavailable.');
  const extraFiles=reference?.extraFiles||[];
  if(!Array.isArray(extraFiles)||extraFiles.some(file=>typeof file!=='string'||!fs.existsSync(file)||!fs.statSync(file).isFile()))throw new Error('A saved extra health-audit file is unavailable.');
  const panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenCharacterHealth', 'Character Health & Cleanup', preferredViewerColumn(vscode.ViewColumn.Active), { enableScripts: true, retainContextWhenHidden: true }));panel.ikemenHealthExtras=extraFiles;await populate(panel,defPath,profile);return panel;
}
function registerCharacterHealthWorkspace(context) {
  diagnostics = vscode.languages.createDiagnosticCollection('ikemen-character-health');
  context.subscriptions.push(diagnostics,
    vscode.workspace.registerTextDocumentContentProvider('ikemen-cleanup-preview', { provideTextDocumentContent(uri) { return previewContent.get(uri.toString()) || 'Preview expired. Run the audit preview again.'; } }),
    vscode.commands.registerCommand('ikemen.characterHealth.open', openCharacterHealthWorkspace),
    vscode.window.registerWebviewPanelSerializer('ikemenCharacterHealth', { async deserializeWebviewPanel(panel, state) { if (!state?.defPath || !fs.existsSync(state.defPath)) return panel.dispose(); panel.ikemenHealthExtras = state.extraFiles || []; await populate(panel, state.defPath, state.profile || 'ikemen-1.0'); } })
  );
}

module.exports = { profileOptions, filteredModel, healthHtml, publishDiagnostics, openCharacterHealthWorkspace, registerCharacterHealthWorkspace };
