'use strict';

const entityHeader = require('./entity_header');
const companion = require('./companion_browser_layout');
const {resizeActiveAuxiliaryWindowBy} = require('./windows_auxiliary_window');
const {handleLaunchMessage} = require('./launch_controls');
const { protect } = require('./webview_policy');
const panels = new WeakMap();

function browserEntries(data) {
  const presets = (data.presets || []).filter(preset => !preset.custom).map(preset => ({
    id:preset.id, kind:'preset', label:preset.label, detail:preset.explanation,
    action:preset.kind === 'native' ? 'Review and add' : 'Copy recognizer / setup'
  }));
  const families = (data.timedCatalog?.families || []).filter(family => family.origin === 'reference' || family.reference).map(family => ({
    id:family.id, kind:'family', label:family.displayName || family.id,
    detail:family.variants?.[0]?.definitions?.[0]?.command || family.kind,
    action:family.parserOnly ? 'Review parser route' : 'Choose buttons and add'
  }));
  return [...presets, ...families];
}

function browserHtml(commands, entries = []) {
  const premade = entries.map((entry,index) => '<li><b>'+escapeText(entry.label)+'</b> <button data-recipe="'+index+'">'+escapeText(entry.action)+'</button><br>'+escapeText(entry.detail)+'</li>').join('');
  const rows = commands.map((command, index) => '<li><button data-index="' + index + '">' +
    escapeText(command.name) + '</button> <code>' + escapeText(command.command) + '</code></li>').join('');
  return protect(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    ${companion.style()}${entityHeader.style()}
    *{box-sizing:border-box}body{margin:0;font:13px var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background)}
    button,input{font:inherit;color:inherit;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);padding:5px}
    .bar,.tabs,.tools{display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:6px 8px;border-bottom:1px solid var(--vscode-panel-border)}
    .bar{min-height:44px}.bar strong{margin-right:auto}.panel{border-top:3px solid #4aa3ff}
    .tabs button[aria-pressed=true]{background:var(--vscode-button-background);color:var(--vscode-button-foreground);outline:2px solid var(--vscode-focusBorder)}
    .tools input{flex:1;min-width:0}ul{list-style:none;padding:0;margin:0}li{padding:7px;border-bottom:1px solid var(--vscode-panel-border)}code{overflow-wrap:anywhere}
    </style></head><body class="ikemaker-companion-browser">${entityHeader.html()}
    <header class="bar"><strong>Command Browser</strong><button id="floatWindow">Float Window</button><button id="owner">Focus Command Maker</button><button id="closeBrowser">Close Browser</button></header>
    <main class="panel"><div class="tabs"><button id="existing" aria-pressed="true">Character Commands</button><button id="premade" aria-pressed="false">Premade Commands</button></div>
    <label class="tools">Find <input type="search" id="filter" placeholder="Command name or input"></label>
    <ul id="ownedRows">${rows}</ul><ul id="recipeRows" hidden>${premade}</ul><p id="empty">No matching commands.</p></main>
    <script>const vscode=acquireVsCodeApi();(${browserClient.toString()})(vscode);
    ${entityHeader.clientScript({vscodeVariable:'vscode'})}${companion.clientScript()}${require('./universal_toolbar_webview').companionBrowserShortcutClientScript()}</script></body></html>`);

}

function browserClient(vscode) {
  const el=id=>document.getElementById(id), saved=vscode.getState()||{};
  let recipes=saved.recipes===true;
  const filter=el('filter');
  filter.value=saved.query||'';
  function render() {
    const q=filter.value.trim().toLowerCase();
    el('existing').setAttribute('aria-pressed',String(!recipes));
    el('premade').setAttribute('aria-pressed',String(recipes));
    el('ownedRows').hidden=recipes;
    el('recipeRows').hidden=!recipes;
    const rows=Array.from((recipes?el('recipeRows'):el('ownedRows')).children);
    for(const row of rows)row.hidden=!row.textContent.toLowerCase().includes(q);
    el('empty').hidden=rows.some(row=>!row.hidden);
    vscode.setState({...vscode.getState(),recipes,query:filter.value});
  }
  el('existing').onclick=()=>{recipes=false;render();};
  el('premade').onclick=()=>{recipes=true;render();};
  el('floatWindow').onclick=()=>vscode.postMessage({type:'floatCommandBrowser'});
  el('owner').onclick=()=>vscode.postMessage({type:'focusCommandMaker'});
  el('closeBrowser').onclick=()=>vscode.postMessage({type:'closeCommandBrowser'});
  filter.oninput=render;
  for(const button of document.querySelectorAll('[data-index]'))button.onclick=()=>vscode.postMessage({type:'pickCommand',index:Number(button.dataset.index)});
  for(const button of document.querySelectorAll('[data-recipe]'))button.onclick=()=>vscode.postMessage({type:'pickRecipe',index:Number(button.dataset.recipe)});
  window.addEventListener('message',event=>{if(event.data?.type==='commandBrowserFloating')el('floatWindow').textContent=event.data.value?'Return to Main Window':'Float Window';});
  render();

}

function escapeText(text) {
  return String(text || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function openBrowser(api, owner, seed, commands, select, entries = [], pickRecipe, storage) {
  let record = panels.get(owner);
  const fresh=!record;
  if (!record) {
    const panel = api.window.createWebviewPanel('ikemenCommandBrowser','Command Browser',api.ViewColumn.Active,{enableScripts:true,retainContextWhenHidden:true});
    record = {panel,readiness:require('./companion_browser_lifecycle').createBrowserReadinessController()};
    const width=companion.createMinimumWidthController(panel,api.commands,undefined,{floatingOnly:true,storage,preferenceKey:'ikemaker.companionBrowserWidth.v2.commands',resizeNative:resizeActiveAuxiliaryWindowBy});
    record.float=async()=>{
      panel.reveal(panel.viewColumn,false);
      if(!panel.active) return;
      if(record.floating){
        await api.commands.executeCommand('workbench.action.restoreEditorsToMainWindow');
        record.floating=false;
        width.endFloating();
        await panel.webview.postMessage({type:'commandBrowserFloating',value:false});
        return;
      }
      await api.commands.executeCommand('workbench.action.moveEditorToNewWindow');
      record.floating=true;
      width.beginOpening();
      await width.request();
      await panel.webview.postMessage({type:'commandBrowserFloating',value:true});
    };
    panels.set(owner,record);
    const close = owner.onDidDispose(()=>panel.dispose());
    panel.onDidDispose(()=>{close?.dispose();panels.delete(owner);});
    panel.webview.onDidReceiveMessage(async message=>{
      if(record.readiness.signal(message)){
        if(record.floating)await panel.webview.postMessage({type:'commandBrowserFloating',value:true});
      }else if(message?.type==='companionBrowserViewport'){
        if(panel.active)await width.handle(message);
      }else if(message?.type==='closeCommandBrowser'){
        panel.dispose();
      }else if(message?.type==='focusCommandMaker'){
        owner.reveal(owner.viewColumn,false);
      }else if(message?.type==='floatCommandBrowser'){
        await record.float();
      }else if(message?.type==='pickRecipe'){
        if(!Number.isSafeInteger(message.index)||!record.entries[message.index])return;
        await record.pickRecipe(record.entries[message.index]);
      }else if(message?.type==='pickCommand'){
        if(!Number.isSafeInteger(message.index)||!record.commands[message.index])return;
        await record.select(message.index);
      }else if(message?.type==='ikemenBrowserShortcut' || message?.slotId==='viewer-browser'){
        owner.reveal(owner.viewColumn,false);
      }else await handleLaunchMessage(message,seed,'commands',panel);
    });
  }
  record.commands=commands;
  record.select=select;
  record.entries=entries;
  record.pickRecipe=pickRecipe;
  record.readiness.arm();
  record.panel.webview.html=browserHtml(commands,entries);
  record.panel.reveal(record.panel.viewColumn,false);
  if(fresh && await record.readiness.wait())await record.float();
  return record.panel;
}

module.exports={openBrowser,browserHtml,browserEntries};
