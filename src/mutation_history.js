'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { hash, transactionalWrite, optionsFromConfig } = require('./mutation_safety');
const { launchControlsHtml, launchControlsClientScript, handleLaunchMessage } = require('./launch_controls');
const { preferredViewerColumn, trackViewerPanel } = require('./viewer_group');

function nonce() { return [...Array(24)].map(() => Math.floor(Math.random() * 36).toString(36)).join(''); }
function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }

async function chooseHistory() {
  const active = vscode.window.tabGroups?.activeTabGroup?.activeTab?.input?.uri || vscode.window.activeTextEditor?.document.uri;
  if (active && active.scheme === 'file') {
    if (path.basename(active.fsPath) === 'mutations.json' && path.basename(path.dirname(active.fsPath)) === '.ikemen-tools') return active;
    let current = path.dirname(active.fsPath);
    for (let depth = 0; depth < 12; depth += 1) {
      const candidate = vscode.Uri.file(path.join(current, '.ikemen-tools', 'mutations.json'));
      try { await vscode.workspace.fs.stat(candidate); return candidate; } catch (_) {}
      const parent = path.dirname(current); if (parent === current) break; current = parent;
    }
  }
  const histories = await vscode.workspace.findFiles('**/.ikemen-tools/mutations.json', '**/{.git,node_modules}/**', 100);
  const picked = await vscode.window.showQuickPick([{ label: 'Browse for recovery history…', description: 'Choose .ikemen-tools/mutations.json for another asset or project.', browse: true }, ...histories.map((uri) => ({ label: vscode.workspace.asRelativePath(uri), description: uri.fsPath, uri }))], { title: 'Open mutation recovery history' });
  if (picked?.browse) {
    const files = await vscode.window.showOpenDialog({ title: 'Choose .ikemen-tools/mutations.json', canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { 'Recovery history': ['json'] } });
    return files?.[0] || null;
  }
  return picked && picked.uri;
}

function readHistory(uri) {
  const data = JSON.parse(fs.readFileSync(uri.fsPath, 'utf8').replace(/^\uFEFF/, ''));
  if (!data || !Array.isArray(data.entries)) throw new Error('Mutation history does not contain an entries list.');
  return data;
}

function projectRoot(uri) { return path.dirname(path.dirname(uri.fsPath)); }
function safeResolve(root, relative) {
  const base = path.resolve(root), target = path.resolve(base, String(relative || '')), prefix = `${base}${path.sep}`.toLowerCase();
  if (target.toLowerCase() !== base.toLowerCase() && !target.toLowerCase().startsWith(prefix)) throw new Error('History path leaves the project root.');
  return target;
}

function recoveryHtml(uri, data) {
  const token = nonce(), entries = [...data.entries].reverse().map((entry, displayIndex) => ({ ...entry, sourceIndex: data.entries.length - displayIndex - 1 }));
  const initial = JSON.stringify({ filename: uri.fsPath, entries }).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${token}'; script-src 'nonce-${token}'"><style nonce="${token}">
  *{box-sizing:border-box}body{margin:0;background:var(--vscode-editor-background);color:var(--vscode-foreground);font-family:var(--vscode-font-family)}header{padding:14px 18px;border-bottom:1px solid var(--vscode-panel-border);display:flex;gap:12px;align-items:center}.muted{color:var(--vscode-descriptionForeground);font-size:12px}.spacer{flex:1}input,select,button{background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);padding:7px}button{cursor:pointer}main{display:grid;grid-template-columns:minmax(360px,1fr) 390px;height:calc(100vh - 72px)}.list{overflow:auto;padding:12px}.details{border-left:1px solid var(--vscode-panel-border);padding:16px;overflow:auto}.entry{display:grid;grid-template-columns:160px 1fr auto;gap:10px;width:100%;text-align:left;padding:9px;border:0;border-bottom:1px solid var(--vscode-panel-border);background:transparent;color:inherit}.entry:hover,.entry.selected{background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground)}.operation{font-weight:700}.badge{padding:2px 7px;border:1px solid currentColor;border-radius:10px;font-size:11px}.row{display:grid;grid-template-columns:95px 1fr;gap:8px;margin:8px 0}.actions{display:grid;gap:7px;margin-top:18px}.danger{border-color:var(--vscode-errorForeground)}header{flex-wrap:wrap}.row>*{min-width:0;overflow-wrap:anywhere}.entry>*{min-width:0;overflow-wrap:anywhere}@media(max-width:780px){main{display:block;height:auto}.list{max-height:42vh}.details{display:block;border-left:0;border-top:1px solid var(--vscode-panel-border)}.entry{grid-template-columns:minmax(90px,1fr) minmax(0,2fr) auto}header input,header select{max-width:100%}}</style></head><body><header><div><b>IKEMEN Recovery Center</b><div class="muted">Reviewed direct saves, their backups, and bulk operations</div></div><span class="spacer"></span><input id="search" placeholder="Filter file or operation"><select id="kind"><option value="all">All changes</option><option value="recoverable">Recoverable backups</option><option value="bulk">Bulk operations</option></select></header><main><section class="list" id="list"></section><aside class="details"><h2 id="title">Choose a change</h2><div id="details" class="muted">A recovery action never overwrites the current file without first creating another backup.</div><div class="actions"><button disabled id="openFile">Open Current File</button><button disabled id="openBackup">Open Backup</button><button disabled id="compare">Compare Backup with Current</button><button disabled id="restore" class="danger">Restore This Backup…</button></div></aside></main><script nonce="${token}">
  const vscode=acquireVsCodeApi(),model=${initial};let selected=null;const list=document.getElementById('list'),search=document.getElementById('search'),kind=document.getElementById('kind');
  function esc(value){return String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function date(value){const d=new Date(value);return Number.isNaN(d.valueOf())?value:d.toLocaleString()}
  function render(){const q=search.value.trim().toLowerCase(),mode=kind.value;list.textContent='';for(const entry of model.entries){const recoverable=Boolean(entry.backup),bulk=Array.isArray(entry.files);if(mode==='recoverable'&&!recoverable||mode==='bulk'&&!bulk||q&&!((entry.file+' '+entry.operation).toLowerCase().includes(q)))continue;const button=document.createElement('button');button.className='entry'+(selected&&selected.sourceIndex===entry.sourceIndex?' selected':'');button.innerHTML='<span>'+esc(date(entry.time))+'</span><span><span class="operation">'+esc(entry.operation||'edit')+'</span><br><span class="muted">'+esc(entry.file)+'</span></span><span class="badge">'+(recoverable?'backup':bulk?'bulk':'logged')+'</span>';button.onclick=()=>{selected=entry;render();inspect()};list.append(button)}if(!list.children.length)list.innerHTML='<p class="muted">No changes match this filter.</p>'}
  function inspect(){if(!selected)return;document.getElementById('title').textContent=selected.operation||'Recorded change';const rows=[['Time',date(selected.time)],['File',selected.file],['Size',Number(selected.bytes||0).toLocaleString()+' bytes'],['Backup',selected.backup||'Not available'],['Before hash',selected.beforeHash||'—'],['After hash',selected.afterHash||'—']];if(selected.files)rows.push(['Files',selected.files.length+' files in this bulk operation']);document.getElementById('details').innerHTML=rows.map(row=>'<div class="row"><b>'+esc(row[0])+'</b><span>'+esc(row[1])+'</span></div>').join('');document.getElementById('openFile').disabled=Boolean(selected.files);for(const id of ['openBackup','compare','restore'])document.getElementById(id).disabled=!selected.backup}
  function send(type){if(selected)vscode.postMessage({type,index:selected.sourceIndex})}document.getElementById('openFile').onclick=()=>send('openFile');document.getElementById('openBackup').onclick=()=>send('openBackup');document.getElementById('compare').onclick=()=>send('compare');document.getElementById('restore').onclick=()=>send('restore');search.oninput=render;kind.onchange=render;globalThis.ikemenNavigationSelection=()=>({search:search.value,kind:kind.value,sourceIndex:selected?selected.sourceIndex:null});globalThis.ikemenCanRestoreNavigation=reference=>!!reference&&typeof reference.search==='string'&&['all','recoverable','bulk'].includes(reference.kind)&&(reference.sourceIndex===null||Number.isInteger(reference.sourceIndex)&&model.entries.some(entry=>entry.sourceIndex===reference.sourceIndex));globalThis.ikemenRestoreNavigation=reference=>{search.value=reference.search;kind.value=reference.kind;selected=reference.sourceIndex===null?null:model.entries.find(entry=>entry.sourceIndex===reference.sourceIndex);render();if(selected)inspect()};render();</script></body></html>`;
}

async function populate(panel, uri) {
  const data = readHistory(uri), root = projectRoot(uri);
  let restoring = false;
  panel.title = 'IKEMEN Recovery Center'; panel.webview.options = { enableScripts: true }; panel.webview.html = recoveryHtml(uri, data);
  const sessions = require('./viewer_sessions');
  if (sessions.has(panel)) sessions.updateSource(panel, uri.fsPath); else sessions.register(panel, uri.fsPath, 'mutation_history');
  panel.webview.onDidReceiveMessage(async (message) => { try {
    if (await handleLaunchMessage(message, projectRoot(uri), 'recovery', panel)) return;
    const current = readHistory(uri), entry = current.entries[Number(message.index)];
    if (!entry || Array.isArray(entry.files)) throw new Error('That history entry is not a single-file change.');
    const target = safeResolve(root, entry.file), backup = entry.backup ? safeResolve(root, entry.backup) : '';
    if (message.type === 'openFile') { if (!fs.existsSync(target)) throw new Error(`Current file is missing: ${target}`); return vscode.window.showTextDocument(vscode.Uri.file(target), { preview: false }); }
    if (!backup || !fs.existsSync(backup)) throw new Error('The recorded backup file is no longer available.');
    if (message.type === 'openBackup') return vscode.window.showTextDocument(vscode.Uri.file(backup), { preview: false });
    if (message.type === 'compare') return vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(backup), vscode.Uri.file(target), `Backup ↔ Current: ${path.basename(target)}`);
    if (message.type === 'restore') {
      if (restoring) return;
      restoring = true;
      try {
      const answer = await vscode.window.showWarningMessage(`Restore the recorded backup over ${path.basename(target)}?`, { modal: true, detail: 'The current file will first be saved as a new hidden backup, so this recovery can itself be reversed.' }, 'Restore Backup');
      if (answer !== 'Restore Backup') return;
      const currentContent = fs.existsSync(target) ? fs.readFileSync(target) : Buffer.alloc(0), backupContent = fs.readFileSync(backup);
      const result = transactionalWrite(fs, target, backupContent, optionsFromConfig(vscode, target, `restore-${entry.operation || 'change'}`, { journalRoot: root, expectedHash: hash(currentContent) }));
      vscode.window.showInformationMessage(`Restored ${path.basename(target)}.${result.backup ? ` Previous current version: ${path.basename(result.backup)}` : ''}`);
      panel.webview.html = recoveryHtml(uri, readHistory(uri));
      } finally { restoring = false; }
    }
  } catch (error) { vscode.window.showErrorMessage(`Recovery Center: ${error.message}`); } });
}

const recoveryScreenHtml = recoveryHtml;
recoveryHtml = (uri, data) => { const page = recoveryScreenHtml(uri, data), token = /<style nonce="([^"]+)"/.exec(page)[1]; return page.replace('<input id="search"', `${launchControlsHtml('mutation_history')}<input id="search"`).replace('</script></body>', `${launchControlsClientScript()}</script></body>`).replace(/<style(?![^>]*\bnonce\s*=)(?=[\s>])/gi, `<style nonce="${token}"`); };

async function openMutationHistory(seed) {
  let uri = seed?.fsPath && path.basename(seed.fsPath).toLowerCase() === 'mutations.json' ? seed : null;
  if (!uri) uri = await chooseHistory();
  if (!uri) return;
  const existing = require('./viewer_sessions').find(uri.fsPath, 'mutation_history');
  if (existing) { existing.reveal(preferredViewerColumn(vscode.ViewColumn.Active), false); return existing; }
  const panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenMutationRecovery', 'IKEMEN Recovery Center', preferredViewerColumn(vscode.ViewColumn.Active), { enableScripts: true, retainContextWhenHidden: true }));
  try { await populate(panel, uri); return panel; } catch (error) { panel.dispose(); vscode.window.showErrorMessage(`Could not open Recovery Center: ${error.message}`); }
}

function registerMutationHistory(context) { context.subscriptions.push(vscode.commands.registerCommand('ikemen.mutations.openHistory', openMutationHistory)); }

module.exports = { registerMutationHistory, openMutationHistory, chooseHistory, readHistory, safeResolve, recoveryHtml };
