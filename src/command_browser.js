'use strict';

const { launchControlsHtml, launchControlsClientScript, handleLaunchMessage } = require('./launch_controls');
const { protect } = require('./webview_policy');
const panels = new WeakMap();

function browserHtml(commands) {
  const rows = commands.map((command, index) => '<li><button data-index="' + index + '">' +
    escapeText(command.name) + '</button> <code>' + escapeText(command.command) + '</code></li>').join('');
  return protect('<!doctype html><html><head><meta charset="utf-8"><style>body{color:var(--vscode-foreground);font:var(--vscode-font-size) var(--vscode-font-family)}ul{list-style:none;padding:0}li{padding:.25rem 0}button,input{color:var(--vscode-input-foreground);background:var(--vscode-input-background)}code{overflow-wrap:anywhere}</style></head><body>' +
    launchControlsHtml('command_movelist', {includeUniversal:true,includeLayout:false,iconSurface:'code'}) +
    '<main><h2>Command Browser</h2><label>Find a command <input type="search" id="filter"></label><ul>'+rows+'</ul><p id="empty">No matching commands.</p></main><script>const vscode=acquireVsCodeApi();' +
    "const filter=document.getElementById('filter'),rows=[...document.querySelectorAll('main li')];function search(){const q=filter.value.toLowerCase();for(const row of rows)row.hidden=!row.textContent.toLowerCase().includes(q);document.getElementById('empty').hidden=rows.some(row=>!row.hidden);}filter.oninput=search;search();for(const button of document.querySelectorAll('[data-index]'))button.onclick=()=>vscode.postMessage({type:'pickCommand',index:Number(button.dataset.index)});" +
    launchControlsClientScript() + '</script></body></html>');
}

function escapeText(text) {
  return String(text || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function openBrowser(api, owner, seed, commands, select) {
  let record = panels.get(owner);
  if (!record) {
    const panel = api.window.createWebviewPanel('ikemenCommandBrowser','Command Browser',api.ViewColumn.Beside,{enableScripts:true,retainContextWhenHidden:true});
    record = {panel};
    panels.set(owner,record);
    const close = owner.onDidDispose(()=>panel.dispose());
    panel.onDidDispose(()=>{close?.dispose();panels.delete(owner);});
    panel.webview.onDidReceiveMessage(async message=>{
      if(message?.type==='pickCommand'){
        if(!Number.isSafeInteger(message.index)||!record.commands[message.index])return;
        await record.select(message.index);
      }else if(message?.type==='ikemenBrowserShortcut' || message?.slotId==='viewer-browser'){
        owner.reveal(owner.viewColumn,false);
      }else await handleLaunchMessage(message,seed,'commands',panel);
    });
  }
  record.commands=commands;
  record.select=select;
  record.panel.webview.html=browserHtml(commands);
  record.panel.reveal(record.panel.viewColumn,false);
  return record.panel;
}

module.exports={openBrowser,browserHtml};
