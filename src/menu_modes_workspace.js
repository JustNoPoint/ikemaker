'use strict';

const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { parseDef, sections, setSectionEntry, kind } = require('./def_model');
const { parseSelectDef } = require('./select_def_model');
const { buildMenuModesModel, installedActionIds } = require('./menu_modes_model');
const { locateCharacterSelectMotif } = require('./screenpack_workspace');
const { gameRoot } = require('./select_roster_preview');
const { launchControlsHtml, launchControlsClientScript, handleLaunchMessage } = require('./launch_controls');
const { chooseFileOrFolder } = require('./open_target_picker');
const { preferredViewerColumn, trackViewerPanel, revealInViewerGroup } = require('./viewer_group');
const { sourceState, saveSourceDocument } = require('./source_document_save');

const sessions = new Map();
const sessionKey = filename => path.resolve(filename).toLowerCase();
const safe = (value) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

function findSelect(systemFile) {
  const root = gameRoot(systemFile);
  const candidates = [root && path.join(root, 'data', 'select.def'), path.join(path.dirname(systemFile), 'select.def')].filter(Boolean);
  return candidates.find((item) => fs.existsSync(item)) || null;
}

async function resolveFiles(uri) {
  let systemFile = uri?.fsPath;
  if (systemFile && path.basename(systemFile).toLowerCase() === 'select.def') systemFile = await locateCharacterSelectMotif(uri);
  if (systemFile && /\.def$/i.test(systemFile)) {
    try { if (kind(parseDef(fs.readFileSync(systemFile, 'utf8'), systemFile)) !== 'screenpack') systemFile = null; } catch (_) { systemFile = null; }
  }
  if (!systemFile) systemFile = await locateCharacterSelectMotif(uri || vscode.window.activeTextEditor?.document.uri);
  if (!systemFile) {
    systemFile = await chooseFileOrFolder({ title: 'Choose Screenpack for Menu and Modes', filters: { 'IKEMEN screenpack': ['def'] }, extensions: ['def'], predicate: (candidate) => kind(parseDef(fs.readFileSync(candidate, 'utf8'), candidate)) === 'screenpack', maxDepth: 4, invalidMessage: 'That DEF is not a screenpack system definition.', emptyMessage: 'No screenpack system DEF was found in that folder.' });
  }
  if (!systemFile) return null;
  let selectFile = findSelect(systemFile);
  if (!selectFile) {
    selectFile = await chooseFileOrFolder({ title: 'Choose Matching select.def', filters: { 'IKEMEN roster': ['def'] }, extensions: ['def'], predicate: (candidate) => path.basename(candidate).toLowerCase() === 'select.def', maxDepth: 4, invalidMessage: 'Choose a select.def roster definition.', emptyMessage: 'No select.def was found in that folder.' });
  }
  return selectFile ? { systemFile, selectFile } : null;
}

async function loadModel(files) {
  const systemDocument = await vscode.workspace.openTextDocument(vscode.Uri.file(files.systemFile));
  const selectDocument = await vscode.workspace.openTextDocument(vscode.Uri.file(files.selectFile));
  const root = gameRoot(files.systemFile), mainLua = root && path.join(root, 'external', 'script', 'main.lua');
  const actions = mainLua && fs.existsSync(mainLua) ? installedActionIds(fs.readFileSync(mainLua, 'utf8')) : [];
  return { systemDocument, selectDocument, model: { ...buildMenuModesModel(parseDef(systemDocument.getText(), files.systemFile), parseSelectDef(selectDocument.getText()), { ...files, verificationFile: mainLua || '' }, actions), sourceStates: { system: sourceState(systemDocument, path.basename(systemDocument.fileName)), select: sourceState(selectDocument, path.basename(selectDocument.fileName)) } } };
}

function rawHtml(model, initialView = 'player') {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;font:13px var(--vscode-font-family);background:var(--vscode-editor-background);color:var(--vscode-foreground)}header{position:sticky;top:0;z-index:4;display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-editor-background)}button,input,select{font:inherit;color:inherit;border:1px solid var(--vscode-input-border);background:var(--vscode-input-background);padding:6px 9px}button{cursor:pointer;background:var(--vscode-button-secondaryBackground)}button.primary,.tabs button.active{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}.grow{flex:1}.tabs{display:flex;gap:5px;padding:9px 12px;border-bottom:1px solid var(--vscode-panel-border)}main{padding:14px;max-width:1500px}.panel{display:none}.panel.active{display:block}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px}.card{border:1px solid var(--vscode-panel-border);border-radius:5px;padding:11px;background:var(--vscode-sideBar-background)}.card h3{margin:0 0 7px}.muted{color:var(--vscode-descriptionForeground)}.badge{display:inline-block;padding:2px 7px;border-radius:10px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);margin-right:4px}.native{border-color:var(--vscode-charts-green)}.module{border-color:var(--vscode-charts-yellow)}.tree{margin-left:calc(var(--depth)*18px);display:flex;gap:8px;align-items:center;padding:6px;border-bottom:1px solid var(--vscode-panel-border)}.tree.disabled{opacity:.55}.tree .name{min-width:210px}.evidence{border-left:4px solid var(--vscode-focusBorder);padding:4px 10px;margin:10px 0}.actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:9px}.counts{display:flex;gap:5px;flex-wrap:wrap}.file{font-family:var(--vscode-editor-font-family);font-size:11px}.warning{color:var(--vscode-charts-yellow)}
</style></head><body><header><b>MENU & MODES</b><span class="badge">IKEMEN 1.0 VERIFIED</span><span class="file">${model.files.systemFile}</span><span class="grow"></span><button id="reload">Reload</button><button id="systemCode">system.def</button><button id="selectCode">select.def</button></header>
<nav class="tabs"><button data-view="player">Player Mode</button><button data-view="creator">Creator Mode</button></nav><main>
<section id="player" class="panel"><h1>Modes players can configure safely</h1><p class="muted">These recipes keep normal roster editing approachable. They use native IKEMEN behavior unless a card explicitly says that a module is required.</p><div class="grid" id="recipes"></div><h2>Current fight order</h2><div id="playerOrders"></div></section>
<section id="creator" class="panel"><h1>Complete menu and roster-mode configuration</h1><div class="evidence"><b>Capability boundary</b><p>${model.evidence.screenpack}<br>${model.evidence.roster}<br>${model.evidence.behavior}</p><p class="muted">Installed action verification: ${model.files.verificationFile || 'fallback catalog (engine script not located)'}</p></div><div class="actions"><button id="addNative">Add built-in action…</button><button id="addSubmenu">Add submenu…</button></div><h2>Screenpack menu tree</h2><div id="menu"></div><h2>Built-in action catalog</h2><div class="grid" id="catalog"></div><h2>Mode-specific select.def configuration</h2><div id="creatorOrders"></div><div id="options"></div></section>
</main><script>
const vscode=acquireVsCodeApi(),data=${safe(model)},savePending=new Set();let view=vscode.getState()?.view||'${initialView}';const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));for(const [key,label] of [['system','Save system.def'],['select','Save select.def']]){const button=document.createElement('button'),status=document.createElement('span');button.id='save-'+key;button.textContent=label;button.title='Save the complete open '+key+' document to disk.';status.id='save-status-'+key;status.className='muted';document.getElementById('reload').before(button,status);button.onclick=()=>{savePending.add(key);renderSourceSave(key,data.sourceStates[key],'Saving complete document…');vscode.postMessage({type:key==='system'?'saveSystem':'saveSelect'})}}function renderSourceSave(key,state,message=''){const button=$('save-'+key),status=$('save-status-'+key);status.textContent=message||(!state?.available?'Source unavailable':state.dirty?'Unsaved document changes':'Saved to disk');status.title=state?.filename||'';button.disabled=savePending.has(key)||!state?.available||!state?.dirty}renderSourceSave('system',data.sourceStates.system);renderSourceSave('select',data.sourceStates.select);window.addEventListener('message',event=>{const message=event.data;if(message.type==='sourceSaveStatus'){savePending.delete(message.key);renderSourceSave(message.key,message.state,message.message||'')}});
function setView(next){if(!['player','creator'].includes(next))return;view=next;document.querySelectorAll('.panel').forEach(x=>x.classList.toggle('active',x.id===view));document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===view));vscode.setState({view,systemFile:data.files.systemFile})}
function badge(status){const module=status==='module';return '<span class="badge">'+(module?'MODULE REQUIRED':status==='native-config'?'NATIVE + SELECT.DEF':'NATIVE')+'</span>'}
function orders(){const render=target=>{target.innerHTML=data.orders.map(mode=>'<div class="card"><h3>'+esc(mode.mode==='default'?'Default order':mode.mode+' order')+'</h3><div class="counts">'+mode.counts.map(x=>'<span class="badge">Order '+x.order+': '+x.count+'</span>').join('')+'</div></div>').join('')||'<p class="muted">No positive roster order assignments were found.</p>'};render($('playerOrders'));render($('creatorOrders'))}
function render(){
 $('recipes').innerHTML=data.recipes.map(r=>'<article class="card '+(r.status==='module'?'module':'native')+'"><h3>'+esc(r.label)+'</h3>'+badge(r.status)+'<p>'+esc(r.summary)+'</p><div class="actions">'+(r.id==='standard'?'<button class="primary" data-recipe="standard">Ensure standard menu</button>':r.id==='fightall'?'<button class="primary" data-recipe="fightall">Set up Fight Everyone</button>':r.id==='bossrush'?'<button data-recipe="bossrush">Review module requirement</button>':'<button data-recipe="custom">Explain boundary</button>')+'</div></article>').join('');
 $('menu').innerHTML=data.menu.map(e=>'<div class="tree '+(e.enabled?'':'disabled')+'" style="--depth:'+(e.path.length-1)+'"><span class="name"><b>'+esc(e.label||'(hidden)')+'</b><br><span class="muted">'+esc(e.key)+'</span></span>'+badge(e.capability==='native'||e.capability==='submenu'?'native':e.capability==='module'?'module':'native-config')+'<span class="grow"></span><button data-menu="rename" data-key="'+esc(e.key)+'" data-label="'+esc(e.label)+'">Rename</button><button data-menu="toggle" data-key="'+esc(e.key)+'" data-enabled="'+e.enabled+'">'+(e.enabled?'Hide':'Enable')+'</button><button data-source="system" data-line="'+e.line+'">Source</button></div>').join('')||'<p class="muted">No menu.itemname entries were found in [Title Info].</p>';
 $('catalog').innerHTML=data.nativeActions.map(a=>'<article class="card native"><h3>'+esc(a.label)+'</h3><span class="badge">'+esc(a.id)+'</span><p>'+esc(a.description)+'</p><button data-enable="'+esc(a.id)+'" data-label="'+esc(a.label.toUpperCase())+'">Add to menu</button></article>').join('');
 $('options').innerHTML='<h3>Roster length settings</h3>'+data.options.map(x=>'<div class="tree" style="--depth:0"><span class="name"><b>'+esc(x.name)+'</b></span><span>'+esc(x.value)+'</span><span class="grow"></span><button data-source="select" data-line="'+x.line+'">Source</button></div>').join('');orders();bind()
}
function bind(){document.querySelectorAll('[data-recipe]').forEach(b=>b.onclick=()=>vscode.postMessage({type:'recipe',id:b.dataset.recipe}));document.querySelectorAll('[data-enable]').forEach(b=>b.onclick=()=>vscode.postMessage({type:'enable',action:b.dataset.enable,label:b.dataset.label}));document.querySelectorAll('[data-menu]').forEach(b=>b.onclick=()=>vscode.postMessage({type:b.dataset.menu,key:b.dataset.key,label:b.dataset.label,enabled:b.dataset.enabled==='true'}));document.querySelectorAll('[data-source]').forEach(b=>b.onclick=()=>vscode.postMessage({type:'source',file:b.dataset.source,line:Number(b.dataset.line)}))}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));$('reload').onclick=()=>vscode.postMessage({type:'reload'});$('systemCode').onclick=()=>vscode.postMessage({type:'source',file:'system',line:0});$('selectCode').onclick=()=>vscode.postMessage({type:'source',file:'select',line:0});$('addNative').onclick=()=>vscode.postMessage({type:'chooseNative'});$('addSubmenu').onclick=()=>vscode.postMessage({type:'addSubmenu'});globalThis.ikemenNavigationSelection=()=>({view});globalThis.ikemenCanRestoreNavigation=reference=>!!reference&&['player','creator'].includes(reference.view);globalThis.ikemenRestoreNavigation=reference=>setView(reference.view);addEventListener('message',event=>{if(event.data.type==='menuModesSetView')setView(event.data.view)});setView(view);render();
</script></body></html>`;
}

function html(model, initialView = 'player') {
  return rawHtml(model, initialView).replace('</header>', `${launchControlsHtml('menu_modes')}</header>`).replace('</script></body>', `${launchControlsClientScript()}</script></body>`);
}

async function replaceDocument(document, next) {
  const edit = new vscode.WorkspaceEdit();
  const last = document.lineAt(document.lineCount - 1);
  edit.replace(document.uri, new vscode.Range(0, 0, last.lineNumber, last.text.length), next);
  if (!await vscode.workspace.applyEdit(edit)) throw new Error(`VS Code did not apply changes to ${path.basename(document.fileName)}. Nothing was saved.`);
}

async function setDefValue(document, sectionName, key, value) {
  const parsed = parseDef(document.getText(), document.fileName), section = sections(parsed, sectionName)[0];
  if (!section) throw new Error(`${path.basename(document.fileName)} has no [${sectionName}] section.`);
  await replaceDocument(document, setSectionEntry(parsed, section.line, key, value));
}

async function setSelectOption(document, key, value) {
  const model = parseSelectDef(document.getText()), section = model.sections.find((item) => item.name === 'options');
  if (!section) throw new Error('select.def has no [Options] section.');
  const existing = model.options.find((item) => item.name.toLowerCase() === key.toLowerCase());
  const lines = [...model.lines];
  if (existing) lines[existing.line] = `${key} = ${value}`;
  else lines.splice(section.endLine + 1, 0, `${key} = ${value}`);
  await replaceDocument(document, lines.join(document.getText().includes('\r\n') ? '\r\n' : '\n'));
}

async function reveal(document, line) {
  const editor = await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.One });
  const at = Math.max(0, Math.min(document.lineCount - 1, Number(line) || 0));
  editor.selection = new vscode.Selection(at, 0, at, 0); editor.revealRange(new vscode.Range(at, 0, at, 0), vscode.TextEditorRevealType.InCenter);
}

async function refresh(owner, requestedView = owner?.view) {
  if (!owner || sessions.get(sessionKey(owner.files.systemFile)) !== owner) return;
  const loaded = await loadModel(owner.files);
  if (sessions.get(sessionKey(owner.files.systemFile)) !== owner) return;
  owner.systemDocument = loaded.systemDocument; owner.selectDocument = loaded.selectDocument; owner.view = ['player', 'creator'].includes(requestedView) ? requestedView : owner.view;
  owner.panel.webview.html = require('./webview_policy').protect(html(loaded.model, owner.view), owner.panel.webview.cspSource);
}

async function handle(owner, message) {
  if (!owner || sessions.get(sessionKey(owner.files.systemFile)) !== owner) return;
  if (await handleLaunchMessage(message, owner.files.systemFile, 'menus', owner.panel)) return;
  if (message.type === 'saveSystem' || message.type === 'saveSelect') {
    const key = message.type === 'saveSystem' ? 'system' : 'select', document = key === 'system' ? owner.systemDocument : owner.selectDocument;
    const result = await saveSourceDocument(document, path.basename(document.fileName));
    return owner.panel.webview.postMessage({ type: 'sourceSaveStatus', key, state: sourceState(document, path.basename(document.fileName)), message: result.message });
  }
  if (message.type === 'reload') return refresh(owner);
  if (message.type === 'source') return reveal(message.file === 'select' ? owner.selectDocument : owner.systemDocument, message.line);
  if (message.type === 'rename') {
    const value = await vscode.window.showInputBox({ title: 'Rename screenpack menu entry', value: message.label, prompt: 'This changes only the displayed label; the native action identifier remains unchanged.' });
    if (value !== undefined) await setDefValue(owner.systemDocument, 'Title Info', message.key, value);
  } else if (message.type === 'toggle') {
    let next = '';
    if (!message.enabled) {
      const loaded = await loadModel(owner.files), action = String(message.key).split('.').pop().toLowerCase(), known = loaded.model.nativeActions.find((item) => item.id === action);
      next = known ? known.label.toUpperCase() : await vscode.window.showInputBox({ title: 'Enable menu entry', value: message.label || action.replace(/_/g, ' ').toUpperCase() });
      if (next === undefined) return;
    }
    await setDefValue(owner.systemDocument, 'Title Info', message.key, next);
  }
  else if (message.type === 'enable') await setDefValue(owner.systemDocument, 'Title Info', `menu.itemname.${message.action}`, message.label);
  else if (message.type === 'chooseNative') {
    const loaded = await loadModel(owner.files), picked = await vscode.window.showQuickPick(loaded.model.nativeActions.map((item) => ({ label: item.label, description: item.id, detail: item.description, item })), { title: 'Add a built-in IKEMEN 1.0 menu action' });
    if (picked) await setDefValue(owner.systemDocument, 'Title Info', `menu.itemname.${picked.item.id}`, picked.item.label.toUpperCase());
  } else if (message.type === 'addSubmenu') {
    const id = await vscode.window.showInputBox({ title: 'New native screenpack submenu', prompt: 'Simple identifier, for example menumission.', validateInput: (v) => /^[a-z][a-z0-9_]*$/i.test(v) ? null : 'Use letters, numbers, and underscores; begin with a letter.' }); if (!id) return;
    const label = await vscode.window.showInputBox({ title: 'Submenu label', value: id.replace(/^menu/i, '').replace(/_/g, ' ').toUpperCase() }); if (label === undefined) return;
    await setDefValue(owner.systemDocument, 'Title Info', `menu.itemname.${id}`, label);
  } else if (message.type === 'recipe' && message.id === 'standard') {
    const answer = await vscode.window.showInformationMessage('Add or restore the standard native menu entries? Existing labels for these actions will be updated to the standard labels. Changes support VS Code Undo. Your Auto Save setting still applies.', { modal: true }, 'Apply'); if (answer !== 'Apply') return;
    for (const [id, label] of [['arcade','ARCADE'],['versus','VS MODE'],['training','TRAINING'],['watch','WATCH'],['options','OPTIONS'],['exit','EXIT']]) await setDefValue(owner.systemDocument, 'Title Info', `menu.itemname.${id}`, label);
  } else if (message.type === 'recipe' && message.id === 'fightall') {
    const loaded = await loadModel(owner.files), plan = loaded.model.fightAll;
    if (plan.blockedReason) return vscode.window.showWarningMessage(`Fight Everyone was not changed: ${plan.blockedReason}`);
    if (!plan.optionValue || !plan.counts.length) return vscode.window.showWarningMessage('No positive default order assignments were found. Assign roster orders before generating Fight Everyone.');
    const summary = plan.counts.map((x) => `order ${x.order}: ${x.count}`).join(', '), answer = await vscode.window.showWarningMessage(`Set up FIGHT EVERYONE using the native Time Attack action?\n\nRoster source: ${plan.orderSource}\nRoster: ${summary}\n${plan.optionKey} = ${plan.optionValue}\n\nThis preserves normal Arcade. It repurposes the Time Attack menu slot; keeping both as separate modes would require a small alias module.`, { modal: true }, 'Apply Native Recipe'); if (answer !== 'Apply Native Recipe') return;
    await setDefValue(owner.systemDocument, 'Title Info', plan.menuKey, plan.label); await setSelectOption(owner.selectDocument, plan.optionKey, plan.optionValue);
  } else if (message.type === 'recipe' && message.id === 'bossrush') return vscode.window.showInformationMessage('Boss Rush is an official external mode module in IKEMEN 1.0. The screenpack entry and orderbossrush data are native, but the match-flow action must be supplied by the installed module. The editor will not fake that behavior with a label alone.');
  else if (message.type === 'recipe' && message.id === 'custom') return vscode.window.showInformationMessage('A custom menu or submenu is native screenpack configuration. A new leaf action requires an external module only when it does not map to one of the listed built-in IKEMEN 1.0 actions.');
  await refresh(owner);
}

async function openMenuModesWorkspace(uri, initialView = 'player') {
  const files = await resolveFiles(uri); if (!files) return vscode.window.showWarningMessage('A matching system.def and select.def are required.');
  const key = sessionKey(files.systemFile), existing = sessions.get(key);
  if (existing) { await refresh(existing, initialView); revealInViewerGroup(existing.panel, false, vscode.ViewColumn.Active); return existing.panel; }
  const loaded = await loadModel(files);
  const panel = trackViewerPanel(vscode.window.createWebviewPanel('ikemenMenuModesWorkspace', 'IKEMEN Menu & Modes', preferredViewerColumn(vscode.ViewColumn.Active), { enableScripts: true, retainContextWhenHidden: true }));
  const owner = { panel, files, systemDocument: loaded.systemDocument, selectDocument: loaded.selectDocument, view: initialView, busy: 0 }; sessions.set(key, owner); panel.webview.html = require('./webview_policy').protect(html(loaded.model, initialView), panel.webview.cspSource);
  require('./viewer_sessions').register(panel, files.systemFile, 'menu_modes');
  panel.webview.onDidReceiveMessage((message) => { if(owner.busy)return owner.panel.webview.postMessage({type:'sourceSaveStatus',key:message.type==='saveSelect'?'select':'system',state:sourceState(message.type==='saveSelect'?owner.selectDocument:owner.systemDocument),message:'Wait for the current menu edit or save to finish.'}); owner.busy++; return handle(owner, message).catch((error) => vscode.window.showErrorMessage(`Menu & Modes: ${error.message}`)).finally(()=>owner.busy--); });
  panel.onDidDispose(() => { if (sessions.get(key) === owner) sessions.delete(key); });
  return panel;
}

function registerMenuModesWorkspace(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('ikemen.menuModes.openPlayer', (uri, options) => openMenuModesWorkspace(uri, options?.preset ? options.reference?.view : 'player')),
    vscode.commands.registerCommand('ikemen.menuModes.openCreator', (uri, options) => openMenuModesWorkspace(uri, options?.preset ? options.reference?.view : 'creator')),
    vscode.workspace.onDidChangeTextDocument(handleMenuDocumentChange),
    vscode.workspace.onDidSaveTextDocument((document) => { for (const owner of sessions.values()) { const key = owner.systemDocument.uri.toString() === document.uri.toString() ? 'system' : owner.selectDocument.uri.toString() === document.uri.toString() ? 'select' : ''; if (key) owner.panel.webview.postMessage({ type: 'sourceSaveStatus', key, state: sourceState(document, path.basename(document.fileName)) }); } }),
    vscode.window.registerWebviewPanelSerializer('ikemenMenuModesWorkspace', { async deserializeWebviewPanel(panel, state) { panel.dispose(); if (state?.systemFile) await openMenuModesWorkspace(vscode.Uri.file(state.systemFile), state.view || 'player'); } })
  );
}

function handleMenuDocumentChange(event, owners = sessions.values()) { for (const owner of owners) { const key=owner.systemDocument.uri.toString()===event.document.uri.toString()?'system':owner.selectDocument.uri.toString()===event.document.uri.toString()?'select':'';if(!key)continue;if(Array.isArray(event.contentChanges)&&event.contentChanges.length===0){owner.panel.webview.postMessage({type:'sourceSaveStatus',key,state:sourceState(event.document,path.basename(event.document.fileName))});continue}refresh(owner).catch(()=>{}); } }

module.exports = { registerMenuModesWorkspace, openMenuModesWorkspace, resolveFiles, findSelect, html, setSelectOption, handleMenuDocumentChange };
