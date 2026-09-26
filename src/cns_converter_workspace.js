'use strict';

const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const controllerCatalog = require('../data/sctrl.json');
const { convertCnsToZss, characterConversionPlan, convertedFilename, updateDefStateReferences } = require('./cns_to_zss');
const { chooseCharacterDef, nearestCharacterDef } = require('./character_picker');
const { transactionalWrite, transactionalWriteSet, hash, optionsFromConfig } = require('./mutation_safety');
const { mode: experienceMode } = require('./experience');
const { launchControlsHtml, launchControlsClientScript, handleLaunchMessage } = require('./launch_controls');
const { preferredViewerColumn, trackViewerPanel } = require('./viewer_group');

let diagnostics;
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]); }
function activeFilename(uri) { return uri?.fsPath || vscode.window.activeTextEditor?.document?.fileName || ''; }
function currentModel(filename) {
  const sourceText = fs.readFileSync(filename, 'utf8'), conversion = convertCnsToZss(sourceText, { catalog: controllerCatalog });
  return { mode: 'file', title: path.basename(filename), source: filename, target: convertedFilename(filename), sourceText, experience: experienceMode('cns', vscode.Uri.file(filename)), ...conversion };
}
function characterModel(defPath) {
  const defText = fs.readFileSync(defPath, 'utf8'), plan = characterConversionPlan(defText, defPath, (filename) => fs.readFileSync(filename, 'utf8'), controllerCatalog);
  return { mode: 'character', title: path.basename(path.dirname(defPath)), source: defPath, target: defPath, experience: experienceMode('cns', vscode.Uri.file(defPath)), ...plan };
}
function serializable(model) { return model; }
function totals(model) {
  if (model.mode === 'file') return model.counts;
  return {
    safe: model.files.reduce((sum, file) => sum + file.counts.safe, 0),
    review: model.findings.filter((item) => item.level === 'review').length + model.files.reduce((sum, file) => sum + file.counts.review, 0),
    unsupported: model.findings.filter((item) => item.level === 'unsupported').length + model.files.reduce((sum, file) => sum + file.counts.unsupported, 0)
  };
}
function converterHtml(model) {
  const data = JSON.stringify(serializable(model)).replace(/</g, '\\u003c'), counts = totals(model), batch = model.mode === 'character';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{margin:0;background:var(--vscode-editor-background);color:var(--vscode-foreground);font:13px var(--vscode-font-family)}button,input,select{font:inherit;color:inherit;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);padding:6px 9px}button{cursor:pointer}button.primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:0}button:disabled{opacity:.5;cursor:default}header{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid var(--vscode-panel-border);position:sticky;top:0;z-index:5;background:var(--vscode-editor-background)}.grow{flex:1}.muted{color:var(--vscode-descriptionForeground)}.notice{margin:10px 14px;padding:10px 12px;background:var(--vscode-textBlockQuote-background);border-left:3px solid var(--vscode-focusBorder)}.metrics{display:grid;grid-template-columns:repeat(3,minmax(120px,1fr));gap:8px;padding:0 14px 10px}.metric{border:1px solid var(--vscode-panel-border);padding:8px}.metric b{display:block;font-size:18px}.safe{color:var(--vscode-testing-iconPassed)}.review{color:var(--vscode-editorWarning-foreground)}.unsupported{color:var(--vscode-errorForeground)}.files{display:flex;gap:6px;padding:0 14px 10px;overflow:auto}.files button.active{outline:2px solid var(--vscode-focusBorder)}main{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--vscode-panel-border);border-top:1px solid var(--vscode-panel-border);height:calc(100vh - 250px)}section{min-width:0;background:var(--vscode-editor-background);display:flex;flex-direction:column}.section-title{padding:8px 12px;border-bottom:1px solid var(--vscode-panel-border)}pre{margin:0;padding:12px;overflow:auto;white-space:pre;flex:1;font-family:var(--vscode-editor-font-family);font-size:var(--vscode-editor-font-size)}aside{position:fixed;right:15px;bottom:15px;width:min(520px,calc(100vw - 30px));max-height:45vh;overflow:auto;background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-widget-border);box-shadow:0 5px 20px #0008;padding:10px;display:none;z-index:8}aside.open{display:block}.finding{padding:7px;border-bottom:1px solid var(--vscode-panel-border)}details{margin-top:6px}summary{cursor:pointer}@media(max-width:900px){main{grid-template-columns:1fr;height:auto}section{height:44vh}.metrics{grid-template-columns:repeat(3,1fr)}}
</style></head><body><header><b>CNS → ZSS Converter</b><span>${escapeHtml(model.title)}</span><span class="muted">${batch ? 'Character state files' : 'Current file'} · ${escapeHtml(model.experience)}</span><span class="grow"></span>${launchControlsHtml('cns_converter')}<button id="source">Open Source</button><button id="choose">Choose…</button><button id="refresh">Refresh</button></header>
<div class="notice"><b>Originals are retained.</b> The preview uses native IKEMEN 1.0 ZSS syntax. Review items identify compatibility behavior that cannot be proven mechanically. Unsupported items block applying the conversion.<details><summary>How conversion safety works</summary><p>StateDefs, controller parameters, comments, triggerall conditions, AND conditions within one trigger number, OR alternatives between trigger numbers, persistent, and ignorehitpause are translated. Constants sections such as Data, Size, Velocity, and Movement remain CNS. Saving uses IKEMaker backups, mutation history, stale-file checks, and Recovery Center support.</p></details></div>
<div class="metrics"><div class="metric safe"><b>${counts.safe}</b>converted structures</div><div class="metric review"><b>${counts.review}</b>review items</div><div class="metric unsupported"><b>${counts.unsupported}</b>unsupported</div></div>
${batch ? `<div class="files" id="files"></div>` : ''}
<div class="files"><button id="findings">Review findings</button><button id="copy">Copy ZSS</button>${batch ? `<button id="save" class="primary"${model.canWrite ? '' : ' disabled'}>Save All ZSS</button><button id="apply" class="primary"${model.canWrite ? '' : ' disabled'}>Save All + Update DEF</button>` : `<button id="save" class="primary"${model.canWrite ? '' : ' disabled'}>Save ZSS As…</button>`}</div>
<main><section><div class="section-title"><b>CNS source</b><div class="muted" id="sourceName"></div></div><pre id="before"></pre></section><section><div class="section-title"><b>ZSS preview</b><div class="muted" id="targetName"></div></div><pre id="after"></pre></section></main><aside id="drawer"><button id="close">Close</button><h3>Items requiring attention</h3><div id="findingList"></div></aside>
<script>const vscode=acquireVsCodeApi(),model=${data};let index=0;const files=model.mode==='file'?[model]:model.files,key=value=>String(value||'').replace(/\\/g,'/').toLowerCase();function current(){return files[index]||{source:model.source,target:'',sourceText:'',text:'',findings:model.findings||[]}}function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function render(){vscode.setState({mode:model.mode,source:model.source,index});const file=current();document.getElementById('before').textContent=file.sourceText||'';document.getElementById('after').textContent=file.text||'';document.getElementById('sourceName').textContent=file.source||model.source;document.getElementById('targetName').textContent=file.target||'';const shared=model.mode==='character'?(model.findings||[]):[];const list=[...shared,...(file.findings||[])];document.getElementById('findingList').innerHTML=list.map(item=>'<div class="finding '+item.level+'"><b>'+esc(item.level.toUpperCase())+'</b> · line '+(Number(item.line||0)+1)+'<br>'+esc(item.message)+'</div>').join('')||'<p class="muted">No review or unsupported findings for this selection.</p>';if(model.mode==='character'){const host=document.getElementById('files');host.innerHTML=files.map((entry,i)=>'<button data-file="'+i+'" class="'+(i===index?'active':'')+'">'+esc(entry.source.split(/[\\/]/).pop())+' · '+entry.counts.review+' review</button>').join('')||'<span class="muted">No CNS state files were assigned through st/st1/etc.</span>';for(const button of host.querySelectorAll('[data-file]'))button.onclick=()=>{index=Number(button.dataset.file);render()}}}render();document.getElementById('findings').onclick=()=>document.getElementById('drawer').classList.add('open');document.getElementById('close').onclick=()=>document.getElementById('drawer').classList.remove('open');document.getElementById('source').onclick=()=>vscode.postMessage({type:'openSource',file:current().source||model.source});document.getElementById('choose').onclick=()=>vscode.postMessage({type:'choose'});document.getElementById('refresh').onclick=()=>vscode.postMessage({type:'refresh'});document.getElementById('copy').onclick=()=>vscode.postMessage({type:'copy',text:current().text||''});document.getElementById('save').onclick=()=>vscode.postMessage({type:'save'});${batch ? "document.getElementById('apply').onclick=()=>vscode.postMessage({type:'apply'});" : ''}globalThis.ikemenNavigationSelection=()=>({mode:model.mode,index,source:current().source||model.source});globalThis.ikemenCanRestoreNavigation=reference=>!!reference&&reference.mode===model.mode&&Number.isInteger(reference.index)&&reference.index>=0&&reference.index<files.length&&key(files[reference.index]?.source||model.source)===key(reference.source);globalThis.ikemenRestoreNavigation=reference=>{index=reference.index;render()};${launchControlsClientScript()}</script></body></html>`;
}

function publish(model) {
  diagnostics.clear(); const grouped = new Map(), files = model.mode === 'file' ? [model] : model.files;
  for (const file of files) for (const item of file.findings || []) {
    const severity = item.level === 'unsupported' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;
    const diagnostic = new vscode.Diagnostic(new vscode.Range(Math.max(0, item.line), 0, Math.max(0, item.line), 1), item.message, severity);
    diagnostic.source = 'IKEMaker CNS → ZSS'; diagnostic.code = item.code;
    const uri = vscode.Uri.file(file.source), key = uri.toString(); if (!grouped.has(key)) grouped.set(key, { uri, values: [] }); grouped.get(key).values.push(diagnostic);
  }
  for (const item of model.findings || []) {
    const diagnostic = new vscode.Diagnostic(new vscode.Range(Math.max(0, item.line), 0, Math.max(0, item.line), 1), item.message, item.level === 'unsupported' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning);
    diagnostic.source = 'IKEMaker CNS → ZSS'; diagnostic.code = item.code; const uri = vscode.Uri.file(model.source), key = uri.toString(); if (!grouped.has(key)) grouped.set(key, { uri, values: [] }); grouped.get(key).values.push(diagnostic);
  }
  for (const entry of grouped.values()) diagnostics.set(entry.uri, entry.values);
}
async function openSource(filename) { const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filename)); await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.Beside }); }
function conflicts(files) { return files.filter((file) => fs.existsSync(file.target)); }
async function approveOverwrite(existing) {
  if (!existing.length) return true;
  const answer = await vscode.window.showWarningMessage(`${existing.length} target ZSS file(s) already exist. Replace them using backups and mutation history?`, { modal: true, detail: existing.map((file) => file.target).join('\n') }, 'Replace Reviewed Targets');
  return answer === 'Replace Reviewed Targets';
}
async function saveCurrent(panel, model) {
  if (!model.canWrite) return vscode.window.showErrorMessage('Unsupported CNS structures must be resolved before this conversion can be saved.');
  if (!fs.existsSync(model.source) || hash(fs.readFileSync(model.source)) !== hash(model.sourceText)) return vscode.window.showErrorMessage('The CNS source changed after this preview was created. Refresh the converter before saving.');
  const picked = await vscode.window.showSaveDialog({ title: 'Save converted ZSS beside the original CNS', defaultUri: vscode.Uri.file(model.target), filters: { 'IKEMEN ZSS': ['zss'] } }); if (!picked) return;
  const expectedHash = fs.existsSync(picked.fsPath) ? hash(fs.readFileSync(picked.fsPath)) : undefined;
  if (fs.existsSync(picked.fsPath) && !await approveOverwrite([{ target: picked.fsPath }])) return;
  transactionalWrite(fs, picked.fsPath, model.text, optionsFromConfig(vscode, picked.fsPath, 'cns-to-zss-conversion', { expectedHash, allowExisting: true }));
  await openSource(picked.fsPath); vscode.window.showInformationMessage('Converted ZSS saved. The original CNS was retained and the character DEF was not changed.');
}
async function saveCharacter(panel, model, updateDef) {
  if (!model.canWrite) return vscode.window.showErrorMessage('Resolve unsupported files before applying the character conversion.');
  if (!fs.existsSync(model.defPath) || hash(fs.readFileSync(model.defPath)) !== hash(model.defText) || model.files.some((file) => !fs.existsSync(file.source) || hash(fs.readFileSync(file.source)) !== hash(file.sourceText))) return vscode.window.showErrorMessage('The character DEF or a CNS source changed after this preview was created. Refresh the converter before applying.');
  if (!await approveOverwrite(conflicts(model.files))) return;
  const review = totals(model).review, action = updateDef ? 'Save ZSS and Update DEF' : 'Save ZSS';
  const answer = await vscode.window.showWarningMessage(`${action} for ${model.files.length} character state file(s)?`, { modal: true, detail: `${review} review item(s) remain visible in the converter and Problems panel. Original CNS files will be retained.` }, action); if (answer !== action) return;
  const writes = model.files.map((file) => [file.target, file.text]);
  if (updateDef) writes.push([model.defPath, updateDefStateReferences(model.defText, model.files)]);
  const expectedHashes = {};
  for (const [filename] of writes) expectedHashes[path.resolve(filename)] = fs.existsSync(filename) ? hash(fs.readFileSync(filename)) : hash('');
  transactionalWriteSet(fs, writes, optionsFromConfig(vscode, model.defPath, updateDef ? 'cns-to-zss-character-and-def' : 'cns-to-zss-character', { journalRoot: path.dirname(model.defPath), aggregateJournal: true, expectedHashes, allowExisting: true }));
  vscode.window.showInformationMessage(updateDef ? 'Converted ZSS files were saved and the reviewed DEF state references were updated. Original CNS files remain available.' : 'Converted ZSS files were saved. The character DEF and original CNS files were not changed.');
  return populate(panel, model.defPath, 'character');
}
async function populate(panel, source, mode) {
  const model = mode === 'character' ? characterModel(source) : currentModel(source); publish(model); panel.title = `CNS → ZSS — ${model.title}`; panel.webview.options = { enableScripts: true }; panel.webview.html = require('./webview_policy').protect(converterHtml(model), panel.webview.cspSource);
  const sessions = require('./viewer_sessions');
  if (sessions.has(panel)) sessions.updateSource(panel, source); else sessions.register(panel, source, 'cns_converter');
  if (panel.converterMessage) panel.converterMessage.dispose();
  panel.converterMessage = panel.webview.onDidReceiveMessage(async (message) => { try {
    if (await handleLaunchMessage(message, source, 'code', panel)) return;
    if (message.type === 'openSource') return openSource(message.file);
    if (message.type === 'copy') return vscode.env.clipboard.writeText(message.text || '').then(() => vscode.window.showInformationMessage('Converted ZSS copied.'));
    if (message.type === 'refresh') return populate(panel, source, mode);
    if (message.type === 'save') return mode === 'character' ? saveCharacter(panel, model, false) : saveCurrent(panel, model);
    if (message.type === 'apply') return saveCharacter(panel, model, true);
    if (message.type === 'choose') return chooseAndOpen(panel);
  } catch (error) { vscode.window.showErrorMessage(`CNS → ZSS Converter: ${error.message}`); } });
}
async function chooseAndOpen(existingPanel, uri) {
  const active = activeFilename(uri), choices = [];
  if (/\.cns$/i.test(active) && fs.existsSync(active)) choices.push({ label: `$(file-code) Convert current CNS — ${path.basename(active)}`, source: active, mode: 'file' });
  const nearest = nearestCharacterDef(active); if (nearest) choices.push({ label: `$(person) Convert current character state files — ${path.basename(path.dirname(nearest))}`, source: nearest, mode: 'character' });
  choices.push({ label: '$(folder-opened) Browse for a CNS state file…', browse: 'file' }, { label: '$(folder-opened) Choose a character…', browse: 'character' });
  const picked = choices.length === 1 ? choices[0] : await vscode.window.showQuickPick(choices, { title: 'CNS → ZSS Converter', placeHolder: 'Convert one state file or all CNS state files assigned by a character DEF' }); if (!picked) return;
  let source = picked.source, mode = picked.mode;
  if ((picked.browse === 'file')) { source = await require('./open_target_picker').chooseFileOrFolder({ title: 'Choose a CNS-Compatible State File', filters: { 'CNS state files': ['cns', 'txt'] }, extensions: ['cns', 'txt'], allowAllFiles: true, includeAdditionalSourceExtensions: true, maxDepth: 4, emptyMessage: 'No compatible state files were found in that folder.' }); mode = 'file'; }
  if (picked.browse === 'character') { source = await chooseCharacterDef(uri, { title: 'Choose character for CNS → ZSS conversion' }); mode = 'character'; }
  if (!source) return;
  const panel = existingPanel || trackViewerPanel(vscode.window.createWebviewPanel('ikemenCnsConverter', 'CNS → ZSS Converter', preferredViewerColumn(vscode.ViewColumn.Active), { enableScripts: true, retainContextWhenHidden: true }));
  await populate(panel, source, mode);
  return panel;
}
async function openPreset(uri, options) {
  const source = uri?.fsPath, reference = options?.reference;
  if (!source || !fs.existsSync(source) || !reference || !['file', 'character'].includes(reference.mode)) return;
  const existing = require('./viewer_sessions').find(source, 'cns_converter');
  if (existing) { existing.reveal(preferredViewerColumn(vscode.ViewColumn.Active), false); return existing; }
  const panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenCnsConverter', 'CNS → ZSS Converter', preferredViewerColumn(vscode.ViewColumn.Active), { enableScripts: true, retainContextWhenHidden: true }));
  await populate(panel, source, reference.mode);
  return panel;
}
function registerCnsConverter(context) {
  diagnostics = vscode.languages.createDiagnosticCollection('ikemen-cns-converter');
  context.subscriptions.push(diagnostics,
    vscode.commands.registerCommand('ikemen.cnsConverter.open', (uri, options) => options?.preset ? openPreset(uri, options) : chooseAndOpen(null, uri)),
    vscode.commands.registerCommand('ikemen.cnsConverter.character', async (uri) => { const def = await chooseCharacterDef(uri, { title: 'Choose character for CNS → ZSS conversion' }); if (!def) return; const panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenCnsConverter', 'CNS → ZSS Converter', preferredViewerColumn(vscode.ViewColumn.Active), { enableScripts: true, retainContextWhenHidden: true })); await populate(panel, def, 'character'); }),
    vscode.window.registerWebviewPanelSerializer('ikemenCnsConverter', { async deserializeWebviewPanel(panel, state) { if (!state?.source || !fs.existsSync(state.source)) return panel.dispose(); await populate(panel, state.source, state.mode || 'file'); } })
  );
}

module.exports = { totals, converterHtml, currentModel, characterModel, openCnsConverter: chooseAndOpen, openPreset, registerCnsConverter };
