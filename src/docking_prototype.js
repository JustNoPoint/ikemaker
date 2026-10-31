'use strict';

const vscode = require('vscode');
const { protect } = require('./webview_policy');
const { trackViewerPanel } = require('./viewer_group');

// VS Code view-container IDs are restricted to letters, numbers, `_`, and `-`.
// View and command IDs may still use dotted namespaces.
const CONTAINER_ID = 'ikemenDockingPrototype';
const CONTAINER_COMMAND = `workbench.view.extension.${CONTAINER_ID}`;
const EDITOR_VIEW_TYPE = 'ikemenDockingPrototypeEditor';
const LAYOUT_KEY = 'ikemaker.dockingPrototype.layout.v1';
const VIEWS = Object.freeze([
  { id: 'ikemen.dockingPrototype.knowledge', title: 'Project Knowledge', identity: 'project-knowledge', hint: 'Move this View among the Panel, Primary Sidebar, Secondary Sidebar, or another View group.' },
  { id: 'ikemen.dockingPrototype.controllers', title: 'Controllers & Favorites', identity: 'controllers-favorites', hint: 'Reorder or group this View separately from the other prototype Views.' },
  { id: 'ikemen.dockingPrototype.source', title: 'Source Preview (Read-only)', identity: 'source-preview', hint: 'This prototype remains read-only and never writes project files.' },
  { id: 'ikemen.dockingPrototype.qa', title: 'Problems & QA', identity: 'problems-qa', hint: 'Resize, collapse, hide, reopen, and restore this View to test lifecycle behavior.' }
]);
const PANEL_IDS=Object.freeze(['knowledge','controllers','source','qa']),ZONE_IDS=Object.freeze(['left','center','right','bottom']);
const DEFAULT_LAYOUT=Object.freeze({placement:{knowledge:'left',controllers:'center',source:'right',qa:'bottom'},active:{left:'knowledge',center:'controllers',right:'source',bottom:'qa'},hidden:[],left:24,right:28,bottom:34});
function plain(value){return Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null));}
function exact(value,keys){return plain(value)&&Object.keys(value).sort().join('\0')===[...keys].sort().join('\0');}
function normalizeLayoutState(raw){const out=JSON.parse(JSON.stringify(DEFAULT_LAYOUT));if(!plain(raw))return out;for(const id of PANEL_IDS)if(ZONE_IDS.includes(raw.placement?.[id]))out.placement[id]=raw.placement[id];out.hidden=Array.isArray(raw.hidden)?[...new Set(raw.hidden.filter(id=>PANEL_IDS.includes(id)))]:[];for(const zone of ZONE_IDS)if(PANEL_IDS.includes(raw.active?.[zone]))out.active[zone]=raw.active[zone];for(const key of ['left','right'])if(Number.isFinite(Number(raw[key])))out[key]=Math.max(15,Math.min(45,Number(raw[key])));if(Number.isFinite(Number(raw.bottom)))out.bottom=Math.max(18,Math.min(55,Number(raw.bottom)));if(out.left+out.right>75)out.right=75-out.left;return out;}
function normalizeViewState(raw){if(!plain(raw))return{selection:'Item A',note:''};return{selection:['Item A','Item B','Item C'].includes(raw.selection)?raw.selection:'Item A',note:typeof raw.note==='string'?raw.note.slice(0,2000):''};}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function jsonForHtml(value) {
  return JSON.stringify(value == null ? null : value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function workspacePage(state = {}) {
  const initial = jsonForHtml(normalizeLayoutState(state.layout));
  return protect(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{color-scheme:light dark;--left:24%;--center:48%;--right:28%;--bottom:34%}*{box-sizing:border-box}body{margin:0;overflow:hidden;font:13px var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background)}button,select{font:inherit;color:inherit;background:var(--vscode-button-secondaryBackground);border:1px solid var(--vscode-panel-border);padding:5px 8px}.master{height:43px;display:flex;align-items:center;gap:6px;padding:6px 8px;border-bottom:1px solid var(--vscode-panel-border);overflow-x:auto;white-space:nowrap}.brand{font-weight:700;margin-right:auto}.workspace{height:calc(100vh - 43px);display:grid;grid-template-columns:var(--left) 5px var(--center) 5px var(--right);grid-template-rows:calc(100% - var(--bottom) - 5px) 5px var(--bottom);min-height:0}.zone{min-width:0;min-height:0;border:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background);overflow:hidden;display:flex;flex-direction:column}.zone[data-zone=left]{grid-column:1;grid-row:1}.zone[data-zone=center]{grid-column:3;grid-row:1}.zone[data-zone=right]{grid-column:5;grid-row:1}.zone[data-zone=bottom]{grid-column:1/6;grid-row:3}.tabs{display:flex;gap:2px;min-height:34px;padding:3px;overflow-x:auto;border-bottom:1px solid var(--vscode-panel-border)}.tab{border-left:4px solid var(--accent);white-space:nowrap}.tab[aria-selected=true]{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}.surface{padding:12px;overflow:auto;height:100%}.surface h2{margin:0 0 8px;font-size:15px}.surface .identity{border-left:4px solid var(--accent);padding:7px 9px;background:var(--vscode-textBlockQuote-background)}.surface .tools{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}.muted{color:var(--vscode-descriptionForeground)}.splitter{background:var(--vscode-panel-border);position:relative}.splitter:hover,.splitter:focus{background:var(--vscode-focusBorder);outline:none}.splitter.v{cursor:col-resize;grid-row:1}.splitter[data-split=left]{grid-column:2}.splitter[data-split=right]{grid-column:4}.splitter.h{cursor:row-resize;grid-column:1/6;grid-row:2}.drop{outline:2px solid var(--vscode-focusBorder);outline-offset:-3px}.empty{padding:14px;color:var(--vscode-descriptionForeground)}details{position:relative}details>div{position:absolute;right:0;z-index:5;min-width:220px;padding:7px;background:var(--vscode-menu-background);border:1px solid var(--vscode-menu-border);box-shadow:0 3px 12px #0008}details button{display:block;width:100%;text-align:left;margin:3px 0}.status{font-size:12px;color:var(--vscode-descriptionForeground)}
@media(max-width:700px){body{overflow:auto}.master{position:sticky;top:0;z-index:8;background:var(--vscode-editor-background)}.workspace{height:auto;min-height:calc(100vh - 43px);display:flex;flex-direction:column;gap:5px;padding:5px}.zone{min-height:220px}.splitter{display:none}}
</style></head><body>
<header class="master"><span class="brand">IKEMaker Workspace Prototype</span><button id="return-main" title="Return this floating workspace to the main VS Code window">Return to Main Window</button><button id="save">Save Layout</button><button id="reset">Reset</button><button id="collapse">Collapse All</button><button id="restore">Restore Panels</button><details><summary>More…</summary><div id="hidden-list"><span class="muted">No hidden panels</span></div></details><span id="workspace-status" class="status" role="status" aria-live="polite">Prototype controls are ready.</span></header>
<main class="workspace" aria-label="IKEMaker docking workspace">
  <section class="zone" data-zone="left" aria-label="Left dock"><div class="tabs" role="tablist" aria-label="Left dock panels"></div><div class="body" id="body-left" role="tabpanel"></div></section><div class="splitter v" data-split="left" role="separator" aria-orientation="vertical" aria-valuemin="15" aria-valuemax="45" tabindex="0" aria-label="Resize left dock"></div>
  <section class="zone" data-zone="center" aria-label="Center dock"><div class="tabs" role="tablist" aria-label="Center dock panels"></div><div class="body" id="body-center" role="tabpanel"></div></section><div class="splitter v" data-split="right" role="separator" aria-orientation="vertical" aria-valuemin="15" aria-valuemax="45" tabindex="0" aria-label="Resize right dock"></div>
  <section class="zone" data-zone="right" aria-label="Right dock"><div class="tabs" role="tablist" aria-label="Right dock panels"></div><div class="body" id="body-right" role="tabpanel"></div></section><div class="splitter h" data-split="bottom" role="separator" aria-orientation="horizontal" aria-valuemin="18" aria-valuemax="55" tabindex="0" aria-label="Resize bottom dock"></div>
  <section class="zone" data-zone="bottom" aria-label="Bottom dock"><div class="tabs" role="tablist" aria-label="Bottom dock panels"></div><div class="body" id="body-bottom" role="tabpanel"></div></section>
</main><script>
const vscode=acquireVsCodeApi();
const panels={knowledge:{title:'Project Knowledge',accent:'#4aa3ff',text:'Contracts, maps, functions, recipes, and project notes will connect here.'},controllers:{title:'Controllers & Favorites',accent:'#b48cff',text:'Favorite controllers and authoring structures will remain close to the active source.'},source:{title:'Source Preview (Read-only)',accent:'#59c36a',text:'This prototype never writes source files. The future surface will follow the shared model.'},qa:{title:'Problems & QA',accent:'#f0a44b',text:'Diagnostics, testing, reviews, and bug reports remain reachable without covering the viewer.'}};
const defaults=${jsonForHtml(DEFAULT_LAYOUT)};
let layout=normalize(${initial}||vscode.getState()?.layout||defaults),dragging='';
function normalize(raw){const out=JSON.parse(JSON.stringify(defaults));if(!raw||typeof raw!=='object')return out;for(const id of Object.keys(panels)){const zone=raw.placement?.[id];if(['left','center','right','bottom'].includes(zone))out.placement[id]=zone;}out.hidden=Array.isArray(raw.hidden)?raw.hidden.filter(id=>panels[id]):[];for(const zone of ['left','center','right','bottom'])if(panels[raw.active?.[zone]])out.active[zone]=raw.active[zone];for(const key of ['left','right'])if(Number.isFinite(Number(raw[key])))out[key]=Math.max(15,Math.min(45,Number(raw[key])));if(Number.isFinite(Number(raw.bottom)))out.bottom=Math.max(18,Math.min(55,Number(raw.bottom)));if(out.left+out.right>75)out.right=75-out.left;return out;}
function persist(){vscode.setState({layout});document.documentElement.style.setProperty('--left',layout.left+'%');document.documentElement.style.setProperty('--right',layout.right+'%');document.documentElement.style.setProperty('--center',(100-layout.left-layout.right)+'%');document.documentElement.style.setProperty('--bottom',layout.bottom+'%');for(const splitter of document.querySelectorAll('.splitter'))splitter.setAttribute('aria-valuenow',String(splitter.dataset.split==='left'?layout.left:splitter.dataset.split==='right'?layout.right:layout.bottom));}
function move(id,zone){layout.placement[id]=zone;layout.hidden=layout.hidden.filter(x=>x!==id);layout.active[zone]=id;render();}
function render(){persist();for(const zone of ['left','center','right','bottom']){const host=document.querySelector('[data-zone="'+zone+'"]'),tabs=host.querySelector('.tabs'),body=host.querySelector('.body'),ids=Object.keys(panels).filter(id=>layout.placement[id]===zone&&!layout.hidden.includes(id));if(!ids.includes(layout.active[zone]))layout.active[zone]=ids[0];tabs.innerHTML='';for(const id of ids){const b=document.createElement('button'),selected=layout.active[zone]===id;b.id='tab-'+zone+'-'+id;b.className='tab';b.style.setProperty('--accent',panels[id].accent);b.textContent=panels[id].title;b.draggable=true;b.setAttribute('role','tab');b.setAttribute('aria-controls','body-'+zone);b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;b.onclick=()=>{layout.active[zone]=id;render()};b.ondragstart=()=>dragging=id;b.onkeydown=e=>{let next=-1;if(e.key==='ArrowRight')next=(ids.indexOf(id)+1)%ids.length;else if(e.key==='ArrowLeft')next=(ids.indexOf(id)+ids.length-1)%ids.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=ids.length-1;if(next<0)return;e.preventDefault();layout.active[zone]=ids[next];render();tabs.querySelector('[aria-selected=true]')?.focus();};tabs.appendChild(b);}const id=layout.active[zone];body.setAttribute('aria-labelledby',id?'tab-'+zone+'-'+id:'');if(!id||!ids.includes(id)){body.innerHTML='<div class="empty">Drop a panel here</div>';continue;}const p=panels[id];body.innerHTML='<article class="surface" style="--accent:'+p.accent+'"><div class="identity"><h2>'+p.title+'</h2><div class="muted">Panel '+id+' · '+zone+' dock</div></div><p>'+p.text+'</p><div class="tools"><label>Move panel <select aria-label="Move '+p.title+'"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option><option value="bottom">Bottom</option></select></label><button class="hide">Collapse panel</button></div><p class="status">Non-writing prototype · drag the tab or use the Move control.</p></article>';const select=body.querySelector('select');select.value=zone;select.onchange=()=>move(id,select.value);body.querySelector('.hide').onclick=()=>{layout.hidden.push(id);render()};}document.querySelectorAll('.zone').forEach(zone=>{zone.ondragover=e=>{e.preventDefault();zone.classList.add('drop')};zone.ondragleave=()=>zone.classList.remove('drop');zone.ondrop=e=>{e.preventDefault();zone.classList.remove('drop');if(dragging)move(dragging,zone.dataset.zone);dragging='';};});const hidden=document.getElementById('hidden-list');hidden.innerHTML='';if(!layout.hidden.length)hidden.innerHTML='<span class="muted">No hidden panels</span>';for(const id of layout.hidden){const b=document.createElement('button');b.textContent='Restore '+panels[id].title;b.onclick=()=>move(id,layout.placement[id]);hidden.appendChild(b);}}
function startResize(event,kind){event.preventDefault();const move=e=>{if(kind==='left')layout.left=Math.max(15,Math.min(45,e.clientX/innerWidth*100));if(kind==='right')layout.right=Math.max(15,Math.min(45,(innerWidth-e.clientX)/innerWidth*100));if(kind==='bottom')layout.bottom=Math.max(18,Math.min(55,(innerHeight-e.clientY)/(innerHeight-43)*100));if(layout.left+layout.right>75){if(kind==='left')layout.left=75-layout.right;else layout.right=75-layout.left;}persist();};const up=()=>{removeEventListener('pointermove',move);removeEventListener('pointerup',up);render()};addEventListener('pointermove',move);addEventListener('pointerup',up);}
document.querySelectorAll('.splitter').forEach(s=>{s.onpointerdown=e=>startResize(e,s.dataset.split);s.onkeydown=e=>{const d=(e.key==='ArrowRight'||e.key==='ArrowDown')?2:(e.key==='ArrowLeft'||e.key==='ArrowUp')?-2:0;if(!d)return;e.preventDefault();if(s.dataset.split==='left')layout.left+=d;if(s.dataset.split==='right')layout.right-=d;if(s.dataset.split==='bottom')layout.bottom-=d;layout=normalize(layout);render();};});
const hostControls=[document.getElementById('return-main'),document.getElementById('save')],workspaceStatus=document.getElementById('workspace-status');function hostBusy(busy,message){for(const control of hostControls){control.disabled=busy;control.title=busy?'Wait for the current prototype host action to finish.':''}workspaceStatus.textContent=message||(busy?'Prototype host action in progress…':'Prototype controls are ready.')}document.getElementById('return-main').onclick=()=>{hostBusy(true,'Returning this prototype to the main window…');vscode.postMessage({type:'returnToMainWindow'})};document.getElementById('save').onclick=()=>{persist();hostBusy(true,'Saving this workspace layout…');vscode.postMessage({type:'saveLayout',layout})};document.getElementById('reset').onclick=()=>{layout=normalize(defaults);render();workspaceStatus.textContent='Default prototype layout restored locally. Choose Save Layout to keep it.'};document.getElementById('collapse').onclick=()=>{layout.hidden=Object.keys(panels);render();workspaceStatus.textContent='All prototype panels collapsed. Use More to restore one, or Restore Panels.'};document.getElementById('restore').onclick=()=>{layout.hidden=[];render();workspaceStatus.textContent='All prototype panels restored locally. Choose Save Layout to keep it.'};addEventListener('message',event=>{if(event.data?.type==='hostStatus')hostBusy(event.data.busy,event.data.status)});render();
</script></body></html>`);
}

function page(surface, state = {}) {
  state=normalizeViewState(state);
  const title = escapeHtml(surface.title), identity = escapeHtml(surface.identity), hint = escapeHtml(surface.hint);
  const note = escapeHtml(state.note || ''), selection = escapeHtml(state.selection || 'Item A');
  const guide = surface.identity === 'project-knowledge' ? `<section class="guide"><h3>Native docking evaluation</h3><ol><li>Drag Views among the bottom Panel and either Sidebar.</li><li>Hold <kbd>Shift</kbd> while dragging across VS Code docking domains when prompted.</li><li>Group Views as tabs, split them, resize them, then close and reopen the workspace.</li><li>Open the optional editor probe, then move it into another editor group or a floating VS Code window.</li></ol><button id="open-editor" type="button">Open floating-workspace probe</button><p class="muted">Shift is an accepted VS Code convention. IKEMaker does not replace or intercept native docking.</p></section>` : '';
  return protect(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{color-scheme:light dark}body{font:var(--vscode-font-size) var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-sideBar-background);margin:0;padding:12px;box-sizing:border-box}*{box-sizing:border-box}.identity{border-left:3px solid var(--vscode-focusBorder);padding-left:10px}.muted{color:var(--vscode-descriptionForeground)}label{display:block;margin-top:12px}select,textarea{width:100%;margin-top:5px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);padding:6px}textarea{min-height:68px;resize:vertical}.status,.guide{margin-top:12px;padding:8px;background:var(--vscode-textBlockQuote-background);border:1px solid var(--vscode-panel-border)}.guide h3{margin-top:0}.guide ol{padding-left:22px}.guide button{color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:0;padding:7px 10px}.guide button:hover{background:var(--vscode-button-hoverBackground)}kbd,code{font-family:var(--vscode-editor-font-family)}</style></head>
<body><section class="identity"><strong>${title}</strong><div class="muted">Model: <code>${identity}</code></div></section><p>${hint}</p>${guide}
<label>Selection retained by this view<select id="selection"><option${selection === 'Item A' ? ' selected' : ''}>Item A</option><option${selection === 'Item B' ? ' selected' : ''}>Item B</option><option${selection === 'Item C' ? ' selected' : ''}>Item C</option></select></label>
<label>Harmless test note<textarea id="note" maxlength="2000" placeholder="Type here, move or hide the panel, then return.">${note}</textarea></label>
<div class="status" role="status" aria-live="polite"><span id="size">Measuring…</span><br><span id="lifecycle">Ready</span></div>
<script>
const vscode=acquireVsCodeApi(),selection=document.getElementById('selection'),note=document.getElementById('note'),size=document.getElementById('size'),lifecycle=document.getElementById('lifecycle');
function save(){const state={selection:selection.value,note:note.value};vscode.setState(state);vscode.postMessage({type:'state',state});}
selection.addEventListener('change',save);note.addEventListener('input',save);
new ResizeObserver(()=>{size.textContent='Viewport: '+document.documentElement.clientWidth+' × '+document.documentElement.clientHeight+' px';}).observe(document.documentElement);
addEventListener('message',event=>{if(event.data?.type==='visibility')lifecycle.textContent=event.data.visible?'Visible and restored':'Hidden';});
document.getElementById('open-editor')?.addEventListener('click',()=>vscode.postMessage({type:'openEditorProbe'}));
</script></body></html>`);
}

class PrototypeViewProvider {
  constructor(surface) { this.surface = surface; this.state = {}; }
  resolveWebviewView(view) {
    view.webview.options = { enableScripts: true, localResourceRoots: [] };
    view.webview.html = page(this.surface, this.state);
    view.webview.onDidReceiveMessage((message) => { if(exact(message,['type','state'])&&message.type==='state'&&exact(message.state,['selection','note']))this.state=normalizeViewState(message.state);else if(this.surface.identity==='project-knowledge'&&exact(message,['type'])&&message.type==='openEditorProbe')openEditorSurface(); });
    view.onDidChangeVisibility?.(() => view.webview.postMessage({ type: 'visibility', visible: view.visible }));
  }
}

let editorPanel = null;
let extensionContext = null;
function bindEditorPanel(panel, state = {}) {
  editorPanel = panel;
  trackViewerPanel(panel);
  panel.webview.options = { enableScripts: true, localResourceRoots: [] };
  const saved = extensionContext?.workspaceState?.get?.(LAYOUT_KEY);
  panel.webview.html = workspacePage(state?.layout ? state : { layout: saved });
  let alive=true,busy=false;const post=async message=>{if(!alive)return false;try{return(await panel.webview.postMessage(message))!==false}catch(_){return false}};panel.webview.onDidReceiveMessage(async(message)=>{
    const returning=exact(message,['type'])&&message.type==='returnToMainWindow',saving=exact(message,['type','layout'])&&message.type==='saveLayout'&&plain(message.layout);if(!returning&&!saving)return false;
    if(!alive)return false;if(busy){await post({type:'hostStatus',busy:true,status:'Wait for the current prototype host action to finish.'});return false;}busy=true;let failed=false;
    try{const announced=await post({type:'hostStatus',busy:true,status:returning?'Returning this prototype to the main window…':'Saving this workspace layout…'});if(!announced){failed=true;if(alive)await vscode.window.showErrorMessage('IKEMaker prototype action stopped because its view could not receive the pending status. Reopen the prototype and try again.');return false;}if(!alive)return false;if(returning)await vscode.commands.executeCommand('workbench.action.restoreEditorsToMainWindow');else{const layout=normalizeLayoutState(message.layout);await extensionContext?.workspaceState?.update?.(LAYOUT_KEY,layout);if(alive)await vscode.window.showInformationMessage('IKEMaker prototype layout saved for this workspace.');}return true;}
    catch(error){failed=true;if(alive){await post({type:'hostStatus',busy:false,status:`Prototype action stopped: ${error.message||error}`});await vscode.window.showErrorMessage(`IKEMaker prototype action stopped: ${error.message||error}`);}return false;}
    finally{busy=false;if(alive&&!failed)await post({type:'hostStatus',busy:false,status:'Prototype controls are ready.'});}
  });
  panel.onDidChangeViewState?.((event) => panel.webview.postMessage({ type: 'visibility', visible: event.webviewPanel.visible }));
  panel.onDidDispose(() => { alive=false;if (editorPanel === panel) editorPanel = null; });
  return panel;
}

function openEditorSurface() {
  if (editorPanel) { editorPanel.reveal(editorPanel.viewColumn || vscode.ViewColumn.Active, false); return editorPanel; }
  return bindEditorPanel(trackViewerPanel(vscode.window.createWebviewPanel(EDITOR_VIEW_TYPE, 'IKEMaker · Docking Prototype', vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true })));
}

async function openPrototype() {
  try {
    // Open the contributed container itself. Focusing the generic Panel can
    // restore Terminal, Problems, or another previously active location and
    // makes a failed View focus look as if this command did nothing.
    await vscode.commands.executeCommand(CONTAINER_COMMAND);
    // Focus the first real View after revealing the container. If the user has
    // moved that View to another native docking domain, VS Code honors it.
    await vscode.commands.executeCommand(`${VIEWS[0].id}.focus`);
  } catch (error) {
    await vscode.window.showErrorMessage(`IKEMaker could not open the Docking Prototype: ${error.message || error}`);
  }
}

function register(context) {
  extensionContext = context;
  for (const surface of VIEWS) context.subscriptions.push(vscode.window.registerWebviewViewProvider(surface.id, new PrototypeViewProvider(surface), { webviewOptions: { retainContextWhenHidden: true } }));
  context.subscriptions.push(
    vscode.commands.registerCommand('ikemen.dockingPrototype.open', openPrototype),
    vscode.commands.registerCommand('ikemen.dockingPrototype.openEditor', openEditorSurface),
    vscode.window.registerWebviewPanelSerializer(EDITOR_VIEW_TYPE, { async deserializeWebviewPanel(panel, state) { bindEditorPanel(panel, state || {}); } })
  );
}

module.exports = { CONTAINER_ID, CONTAINER_COMMAND, EDITOR_VIEW_TYPE, LAYOUT_KEY, VIEWS, PrototypeViewProvider, page, workspacePage, bindEditorPanel, openEditorSurface, openPrototype, register };
