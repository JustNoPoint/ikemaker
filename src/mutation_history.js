'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { hash, transactionalWrite, optionsFromConfig } = require('./mutation_safety');
const { launchControlsHtml, launchControlsClientScript, handleLaunchMessage } = require('./launch_controls');
const { preferredViewerColumn, trackViewerPanel } = require('./viewer_group');

function nonce() { return [...Array(24)].map(() => Math.floor(Math.random() * 36).toString(36)).join(''); }
function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }

async function chooseHistory(seed) {
  const requested = seed?.scheme === 'file' && seed?.fsPath ? seed : null;
  const active = requested || vscode.window.tabGroups?.activeTabGroup?.activeTab?.input?.uri || vscode.window.activeTextEditor?.document.uri;
  if (active && active.scheme === 'file') {
    if (path.basename(active.fsPath).toLowerCase() === 'mutations.json' && path.basename(path.dirname(active.fsPath)).toLowerCase() === '.ikemen-tools') return active;
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
function historyEntryId(entry, sourceIndex) { return `${sourceIndex}:${hash(JSON.stringify(entry))}`; }

function recoveryHtml(uri, data, restore = null) {
  const token = nonce(), entries = [...data.entries].reverse().map((entry, displayIndex) => { const sourceIndex=data.entries.length-displayIndex-1;return { ...entry, sourceIndex, entryId: historyEntryId(entry,sourceIndex) }; });
  const initial = JSON.stringify({ filename: uri.fsPath, entries, restore }).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${token}'; script-src 'nonce-${token}'"><style nonce="${token}">
  *{box-sizing:border-box}body{margin:0;background:var(--vscode-editor-background);color:var(--vscode-foreground);font-family:var(--vscode-font-family)}header{padding:14px 18px;border-bottom:1px solid var(--vscode-panel-border);display:flex;gap:12px;align-items:center}.muted{color:var(--vscode-descriptionForeground);font-size:12px}.spacer{flex:1}input,select,button{background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);padding:7px}button{cursor:pointer}main{display:grid;grid-template-columns:minmax(360px,1fr) 390px;height:calc(100vh - 72px)}.list{overflow:auto;padding:12px}.details{border-left:1px solid var(--vscode-panel-border);padding:16px;overflow:auto}.entry{display:grid;grid-template-columns:160px 1fr auto;gap:10px;width:100%;text-align:left;padding:9px;border:0;border-bottom:1px solid var(--vscode-panel-border);background:transparent;color:inherit}.entry:hover,.entry.selected{background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground)}.operation{font-weight:700}.badge{padding:2px 7px;border:1px solid currentColor;border-radius:10px;font-size:11px}.row{display:grid;grid-template-columns:95px 1fr;gap:8px;margin:8px 0}.actions{display:grid;gap:7px;margin-top:18px}.danger{border-color:var(--vscode-errorForeground)}header{flex-wrap:wrap}.row>*{min-width:0;overflow-wrap:anywhere}.entry>*{min-width:0;overflow-wrap:anywhere}@media(max-width:780px){main{display:block;height:auto}.list{max-height:42vh}.details{display:block;border-left:0;border-top:1px solid var(--vscode-panel-border)}.entry{grid-template-columns:minmax(90px,1fr) minmax(0,2fr) auto}header input,header select{max-width:100%}}</style></head><body><header><div><b>IKEMEN Recovery Center</b><div class="muted">Reviewed direct saves, their backups, and bulk operations</div></div><span class="spacer"></span><input id="search" placeholder="Filter file or operation"><select id="kind"><option value="all">All changes</option><option value="recoverable">Recoverable backups</option><option value="bulk">Bulk operations</option></select></header><main><section class="list" id="list"></section><aside class="details"><h2 id="title">Choose a change</h2><div id="details" class="muted">A recovery action never overwrites the current file without first creating another backup.</div><div class="actions"><button disabled id="openFile">Open Current File</button><button disabled id="openBackup">Open Backup</button><button disabled id="compare">Compare Backup with Current</button><button disabled id="restore" class="danger">Restore This Backup…</button></div></aside></main><script nonce="${token}">
	  const vscode=acquireVsCodeApi(),model=${initial};let selected=null,busy=false;const list=document.getElementById('list'),search=document.getElementById('search'),kind=document.getElementById('kind'),status=document.getElementById('recoveryStatus'),actionIds=['openFile','openBackup','compare','restore'];
  function esc(value){return String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function date(value){const d=new Date(value);return Number.isNaN(d.valueOf())?value:d.toLocaleString()}
		  function matchesReference(entry,reference){const q=String(reference.search||'').trim().toLowerCase(),mode=reference.kind,recoverable=Boolean(entry.backup),bulk=Array.isArray(entry.files);return !((mode==='recoverable'&&!recoverable)||(mode==='bulk'&&!bulk)||(q&&!((entry.file+' '+entry.operation).toLowerCase().includes(q))))}function matches(entry){return matchesReference(entry,{search:search.value,kind:kind.value})}
	  function resetDetails(message='Choose a recorded change to inspect its recovery options.'){selected=null;document.getElementById('title').textContent='Choose a change';document.getElementById('details').textContent='A recovery action never overwrites the current file without first creating another backup.';status.textContent=message;for(const id of actionIds){const control=document.getElementById(id);control.disabled=true;control.title=id==='openFile'?'Choose a single-file change first.':'Choose a change with an available backup first.'}}
		  function render(focusSelected=false){if(selected&&!matches(selected))resetDetails('The selected change is outside the current filter. Choose a visible change.');list.textContent='';for(const entry of model.entries){if(!matches(entry))continue;const button=document.createElement('button'),active=selected&&selected.entryId===entry.entryId;button.className='entry'+(active?' selected':'');button.dataset.entryId=entry.entryId;button.tabIndex=active?0:-1;button.setAttribute('role','option');button.setAttribute('aria-selected',String(Boolean(active)));button.innerHTML='<span>'+esc(date(entry.time))+'</span><span><span class="operation">'+esc(entry.operation||'edit')+'</span><br><span class="muted">'+esc(entry.file)+'</span></span><span class="badge">'+(entry.backup?'backup':Array.isArray(entry.files)?'bulk':'logged')+'</span>';button.onclick=()=>{selected=entry;render(true);inspect()};list.append(button)}const options=[...list.querySelectorAll('[role="option"]')];if(!options.length)list.innerHTML='<p class="muted">No changes match this filter.</p>';else if(!options.some(option=>option.tabIndex===0))options[0].tabIndex=0;if(focusSelected&&selected)list.querySelector('[data-entry-id="'+selected.entryId+'"]')?.focus()}
	  function inspect(){if(!selected)return;document.getElementById('title').textContent=selected.operation||'Recorded change';const rows=[['Time',date(selected.time)],['File',selected.file],['Size',Number(selected.bytes||0).toLocaleString()+' bytes'],['Backup',selected.backup||'Not available'],['Before hash',selected.beforeHash||'—'],['After hash',selected.afterHash||'—']];if(selected.files)rows.push(['Files',selected.files.length+' files in this bulk operation']);document.getElementById('details').innerHTML=rows.map(row=>'<div class="row"><b>'+esc(row[0])+'</b><span>'+esc(row[1])+'</span></div>').join('');const bulk=Array.isArray(selected.files),hasBackup=Boolean(selected.backup),open=document.getElementById('openFile');open.disabled=busy||bulk;open.title=bulk?'Bulk history entries contain multiple files; choose a single-file change to open it.':busy?'Wait for the current recovery action to finish.':'Open the current project file.';for(const id of ['openBackup','compare','restore']){const control=document.getElementById(id);control.disabled=busy||!hasBackup;control.title=!hasBackup?'This recorded change has no backup file.':busy?'Wait for the current recovery action to finish.':id==='openBackup'?'Open the retained backup without changing the current file.':id==='compare'?'Compare the retained backup with the current file.':'Review and restore this backup after confirmation.'}status.textContent=bulk?'This bulk record can be inspected but not restored as one single-file action.':hasBackup?'This change has a recoverable backup.':'This change was logged without a recoverable backup.'}
	  function setBusy(value,message){busy=Boolean(value);if(selected)inspect();status.textContent=message||(busy?'Recovery action in progress…':'Recovery controls are ready.')}
		  function send(type){if(!selected||busy)return;setBusy(true,'Starting recovery action…');vscode.postMessage({type,index:selected.sourceIndex,entryId:selected.entryId})}document.getElementById('openFile').onclick=()=>send('openFile');document.getElementById('openBackup').onclick=()=>send('openBackup');document.getElementById('compare').onclick=()=>send('compare');document.getElementById('restore').onclick=()=>send('restore');search.oninput=()=>render();kind.onchange=()=>render();list.addEventListener('keydown',event=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;const options=[...list.querySelectorAll('[role="option"]')],at=options.indexOf(event.target.closest('[role="option"]'));if(at<0||!options.length)return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?options.length-1:Math.max(0,Math.min(options.length-1,at+(event.key==='ArrowUp'?-1:1))),entry=model.entries.find(item=>item.entryId===options[next].dataset.entryId);if(entry){selected=entry;render(true);inspect()}});addEventListener('message',event=>{if(event.data?.type==='recoveryBusy')setBusy(event.data.busy,event.data.status)});globalThis.ikemenNavigationSelection=()=>({search:search.value,kind:kind.value,entryId:selected?selected.entryId:null});globalThis.ikemenCanRestoreNavigation=reference=>!!reference&&typeof reference.search==='string'&&['all','recoverable','bulk'].includes(reference.kind)&&(reference.entryId===null||typeof reference.entryId==='string'&&model.entries.some(entry=>entry.entryId===reference.entryId&&matchesReference(entry,reference)));globalThis.ikemenRestoreNavigation=reference=>{search.value=reference.search;kind.value=reference.kind;selected=reference.entryId===null?null:model.entries.find(entry=>entry.entryId===reference.entryId&&matchesReference(entry,reference));render();if(selected)inspect();else resetDetails()};if(model.restore?.entryId)selected=model.entries.find(entry=>entry.entryId===model.restore.entryId)||null;render();if(selected)inspect();queueMicrotask(()=>{const focus=model.restore?.focusId&&document.getElementById(model.restore.focusId);(focus||list.querySelector('[role="option"]')||search).focus()});</script></body></html>`;
}

async function populate(panel, uri) {
  const data = readHistory(uri), root = projectRoot(uri);
  let actionPending = false;
  panel.title = 'IKEMEN Recovery Center'; panel.webview.options = { enableScripts: true }; panel.webview.html = recoveryHtml(uri, data);
  const sessions = require('./viewer_sessions');
  if (sessions.has(panel)) sessions.updateSource(panel, uri.fsPath); else sessions.register(panel, uri.fsPath, 'mutation_history');
  panel.webview.onDidReceiveMessage(async (message) => {
    if (await handleLaunchMessage(message, projectRoot(uri), 'recovery', panel)) return;
    const recoveryTypes = new Set(['openFile', 'openBackup', 'compare', 'restore']);
    if (!recoveryTypes.has(message?.type)) return;
    if (actionPending) { await panel.webview.postMessage?.({ type: 'recoveryBusy', busy: true, status: 'Wait for the current recovery action to finish.' }); return; }
    actionPending = true; await panel.webview.postMessage?.({ type: 'recoveryBusy', busy: true, status: 'Recovery action in progress…' });
    try {
      if (!Number.isInteger(message.index) || typeof message.entryId !== 'string' || Object.keys(message).some(key => !['type', 'index', 'entryId'].includes(key))) throw new Error('That recovery selection is invalid. Choose the history entry again.');
      const current = readHistory(uri), entry = current.entries[message.index];
      if (!entry || historyEntryId(entry,message.index) !== message.entryId) throw new Error('That recovery entry changed or expired. Refresh the Recovery Center and choose it again.');
      if (Array.isArray(entry.files)) throw new Error('That history entry is a bulk record. Choose a single-file change.');
      const target = safeResolve(root, entry.file), backup = entry.backup ? safeResolve(root, entry.backup) : '';
      if (message.type === 'openFile') { if (!fs.existsSync(target)) throw new Error(`Current file is missing: ${target}`); await vscode.window.showTextDocument(vscode.Uri.file(target), { preview: false }); return; }
      if (!backup || !fs.existsSync(backup)) throw new Error('The recorded backup file is no longer available.');
      if (message.type === 'openBackup') { await vscode.window.showTextDocument(vscode.Uri.file(backup), { preview: false }); return; }
      if (message.type === 'compare') { if (!fs.existsSync(target)) throw new Error(`Current file is missing: ${target}`); await vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(backup), vscode.Uri.file(target), `Backup ↔ Current: ${path.basename(target)}`); return; }
      const targetBefore=fs.existsSync(target)?fs.readFileSync(target):Buffer.alloc(0),backupBefore=fs.readFileSync(backup),targetBeforeHash=hash(targetBefore),backupBeforeHash=hash(backupBefore);
      const answer = await vscode.window.showWarningMessage(`Restore the recorded backup over ${path.basename(target)}?`, { modal: true, detail: 'The current file will first be saved as a new hidden backup, so this recovery can itself be reversed.' }, 'Restore Backup');
      if (answer !== 'Restore Backup') return;
      const afterConfirmation=readHistory(uri),confirmedEntry=afterConfirmation.entries[message.index];
      if(!confirmedEntry||historyEntryId(confirmedEntry,message.index)!==message.entryId)throw new Error('That recovery entry changed while confirmation was open. Refresh and choose it again.');
      const confirmedTarget=safeResolve(root,confirmedEntry.file),confirmedBackup=confirmedEntry.backup?safeResolve(root,confirmedEntry.backup):'';
      if(confirmedTarget!==target||confirmedBackup!==backup||!fs.existsSync(backup))throw new Error('That recovery source changed while confirmation was open. Refresh and choose it again.');
      const currentContent=fs.existsSync(target)?fs.readFileSync(target):Buffer.alloc(0),backupContent=fs.readFileSync(backup);
      if(hash(currentContent)!==targetBeforeHash)throw new Error('The current file changed while confirmation was open. Review the latest file before restoring.');
      if(hash(backupContent)!==backupBeforeHash)throw new Error('The backup changed while confirmation was open. Refresh the Recovery Center before restoring.');
      const result = transactionalWrite(fs, target, backupContent, optionsFromConfig(vscode, target, `restore-${entry.operation || 'change'}`, { journalRoot: root, expectedHash: hash(currentContent) }));
      vscode.window.showInformationMessage(`Restored ${path.basename(target)}.${result.backup ? ` Previous current version: ${path.basename(result.backup)}` : ''}`);
      const refreshed=readHistory(uri),refreshedId=refreshed.entries.some((item,index)=>historyEntryId(item,index)===message.entryId)?message.entryId:null;
      panel.webview.html = recoveryHtml(uri, refreshed, {entryId:refreshedId,focusId:refreshedId?'restore':'search'});
    } catch (error) { vscode.window.showErrorMessage(`Recovery Center: ${error.message}`); }
    finally { actionPending = false; await panel.webview.postMessage?.({ type: 'recoveryBusy', busy: false, status: 'Recovery controls are ready.' }); }
  });
}

const recoveryScreenHtml = recoveryHtml;
recoveryHtml = (uri, data, restore = null) => {
  const page = recoveryScreenHtml(uri, data, restore), token = /<style nonce="([^"]+)"/.exec(page)[1];
  return page
    .replace('button{cursor:pointer}', 'button{cursor:pointer}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:2px}')
    .replace('<b>IKEMEN Recovery Center</b>', '<b id="recoveryTitle">IKEMEN Recovery Center</b>')
    .replace('<input id="search" placeholder="Filter file or operation">', `${launchControlsHtml('mutation_history')}<label for="search">Filter</label><input id="search" aria-label="Filter recovery history by file or operation" placeholder="File or operation">`)
    .replace('<select id="kind">', '<label for="kind">Show</label><select id="kind" aria-label="Recovery history type">')
    .replace('</header><main>', '</header><div id="recoveryStatus" class="muted" role="status" aria-live="polite">Choose a recorded change to inspect its recovery options.</div><main>')
    .replace('<section class="list" id="list">', '<section class="list" id="list" role="listbox" aria-label="Recorded changes">')
    .replace('<aside class="details">', '<aside class="details" aria-labelledby="title">')
    .replace('<button disabled id="openFile">', '<button disabled title="Choose a single-file change first." id="openFile">')
    .replace('<button disabled id="openBackup">', '<button disabled title="Choose a change with an available backup first." id="openBackup">')
    .replace('<button disabled id="compare">', '<button disabled title="Choose a change with an available backup first." id="compare">')
    .replace('<button disabled id="restore"', '<button disabled title="Choose a change with an available backup first." id="restore"')
    .replace('</script></body>', `${launchControlsClientScript()}</script></body>`)
    .replace(/<style(?![^>]*\bnonce\s*=)(?=[\s>])/gi, `<style nonce="${token}"`);
};

async function openMutationHistory(seed) {
  let uri = seed?.fsPath && path.basename(seed.fsPath).toLowerCase() === 'mutations.json' ? seed : null;
  if (!uri) uri = await chooseHistory(seed);
  if (!uri) return;
  const existing = require('./viewer_sessions').find(uri.fsPath, 'mutation_history');
  if (existing) { existing.reveal(preferredViewerColumn(vscode.ViewColumn.Active), false); return existing; }
  const panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenMutationRecovery', 'IKEMEN Recovery Center', preferredViewerColumn(vscode.ViewColumn.Active), { enableScripts: true, retainContextWhenHidden: true }));
  try { await populate(panel, uri); return panel; } catch (error) { panel.dispose(); vscode.window.showErrorMessage(`Could not open Recovery Center: ${error.message}`); }
}

function registerMutationHistory(context) { context.subscriptions.push(vscode.commands.registerCommand('ikemen.mutations.openHistory', openMutationHistory)); }

module.exports = { registerMutationHistory, openMutationHistory, chooseHistory, readHistory, safeResolve, historyEntryId, recoveryHtml, populate };
