'use strict';

const { launchControlsHtml, launchControlsClientScript, handleLaunchMessage } = require('./launch_controls');
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
  return protect('<!doctype html><html><head><meta charset="utf-8"><style>body{color:var(--vscode-foreground);font:var(--vscode-font-size) var(--vscode-font-family)}ul{list-style:none;padding:0}li{padding:.25rem 0}button,input{color:var(--vscode-input-foreground);background:var(--vscode-input-background)}code{overflow-wrap:anywhere}</style></head><body>' +
    launchControlsHtml('command_movelist', {includeUniversal:true,includeLayout:false,iconSurface:'code'}) +
    '<main><h2>Command Browser</h2><button id="existing" aria-pressed="true">Character Commands</button> <button id="premade" aria-pressed="false">Premade Commands</button> <button id="floatWindow">Float Window</button><p><label>Find a command <input type="search" id="filter"></label></p><ul id="ownedRows">'+rows+'</ul><ul id="recipeRows" hidden>'+premade+'</ul><p id="empty">No matching commands.</p></main><script>const vscode=acquireVsCodeApi();' +
    '(' + browserClient.toString() + ')(vscode);' +
    launchControlsClientScript() + '</script></body></html>');
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
  filter.oninput=render;
  for(const button of document.querySelectorAll('[data-index]'))button.onclick=()=>vscode.postMessage({type:'pickCommand',index:Number(button.dataset.index)});
  for(const button of document.querySelectorAll('[data-recipe]'))button.onclick=()=>vscode.postMessage({type:'pickRecipe',index:Number(button.dataset.recipe)});
  window.addEventListener('message',event=>{if(event.data?.type==='commandBrowserFloating')el('floatWindow').hidden=event.data.value;});
  render();
  vscode.postMessage({type:'companionBrowserReady'});
}

function escapeText(text) {
  return String(text || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function openBrowser(api, owner, seed, commands, select, entries = [], pickRecipe) {
  let record = panels.get(owner);
  const fresh=!record;
  if (!record) {
    const panel = api.window.createWebviewPanel('ikemenCommandBrowser','Command Browser',api.ViewColumn.Active,{enableScripts:true,retainContextWhenHidden:true});
    record = {panel,readiness:require('./companion_browser_lifecycle').createBrowserReadinessController()};
    record.float=async()=>{
      panel.reveal(panel.viewColumn,false);
      if(!panel.active) return;
      await api.commands.executeCommand('workbench.action.moveEditorToNewWindow');
      record.floating=true;
      await panel.webview.postMessage({type:'commandBrowserFloating',value:true});
    };
    panels.set(owner,record);
    const close = owner.onDidDispose(()=>panel.dispose());
    panel.onDidDispose(()=>{close?.dispose();panels.delete(owner);});
    panel.webview.onDidReceiveMessage(async message=>{
      if(record.readiness.signal(message)){
        if(record.floating)await panel.webview.postMessage({type:'commandBrowserFloating',value:true});
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
