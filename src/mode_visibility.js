'use strict';
const panels=new Set();
const valid=mode=>['player','simple','workspace'].includes(mode);
function css(mode){
  return require('./interface_capabilities').commandStyle(mode)+(mode==='player'
    ? '.launch-controls,[data-tab=other],[data-view=creator],[data-view=dialogue],#layout,#code,#systemCode,#selectCode,#selectCode2,#createArc,#menuModes{display:none!important}.player-navigation{display:inline-flex;flex-wrap:wrap;gap:4px}'
    : '.player-navigation{display:none!important}');
}
function html(){return '<style data-ikemen-mode-style>'+css(require('./interface_mode').current())+'</style>';}
async function send(panel,mode){const setup=require('./workspace_setup').current();return panel.webview.postMessage({type:'ikemenModeVisibility',mode,css:css(mode),workspaceSetup:setup,workspaceSetupSummary:require('./workspace_setup').summary(setup)});}
async function publish(mode){if(valid(mode))await Promise.allSettled([...panels].map(panel=>send(panel,mode)));}
async function handle(message,panel){
  if(message?.type!=='ikemenModeReady')return false;
  if(!panel?.webview)return true;
  if(!panels.has(panel)){panels.add(panel);panel.onDidDispose?.(()=>panels.delete(panel));}
  await send(panel,require('./interface_mode').current());return true;
}
function client(initialMode){
  let mode=initialMode,lastCss='',pending;
  let notice;
  function apply(){
    if(!pending)return;
    if(document.querySelector('dialog[open]')){if(!notice){notice=document.createElement('p');notice.setAttribute('role','status');document.body.append(notice);}notice.textContent='Mode controls will update when the open dialog closes. Your input stays here.';notice.hidden=false;return;}
    const next=pending;pending=undefined;if(notice)notice.hidden=true;
    if(next.mode===mode&&next.css===lastCss)return;
    const focusWasInToolbar=document.activeElement?.closest?.('.launch-controls');
    const focusWasInPlayer=document.activeElement?.closest?.('.player-navigation');
    mode=next.mode;lastCss=next.css;
    // Reuse the existing nonce-bearing style element; never rebuild the page.
    for(const style of document.querySelectorAll('[data-ikemen-mode-style]'))style.textContent=next.css;
    for(const options of document.querySelectorAll('[data-toolbar-surface]')){
      options.dataset.mode=mode;
      options.dataset.compact=String(['air','sff','snd'].includes(options.dataset.toolbarSurface)&&mode!=='workspace');
      vscode.postMessage({type:'viewerToolbarReady',surface:options.dataset.toolbarSurface,mode});
      if(options.querySelector('[data-viewer-layout]'))vscode.postMessage({type:'viewerLayoutReady',surface:options.dataset.toolbarSurface,mode});
    }
    if(document.documentElement){document.documentElement.dataset.ikemenMode=mode;document.documentElement.dataset.workspaceScope=next.workspaceSetup?.scope||'full-game';document.documentElement.dataset.workspaceCollaboration=next.workspaceSetup?.collaboration||'solo';}
    for(const label of document.querySelectorAll('[data-workspace-setup-summary]'))label.textContent=next.workspaceSetupSummary||'';
    globalThis.ikemenModeVisibilityChanged?.(next);
    if(mode==='player'&&focusWasInToolbar)document.querySelector('[data-player-command="ikemen.openHome"]')?.focus();
    else if(mode!=='player'&&focusWasInPlayer)document.querySelector('[data-toolbar-more]')?.focus();
  }
  addEventListener('message',event=>{
    const m=event.data;
    if(m?.type!=='ikemenModeVisibility'||!['player','simple','workspace'].includes(m.mode)||typeof m.css!=='string')return;
    pending=m;apply();
  });
  // close does not bubble, including native Escape dismissal.
  addEventListener('close',apply,true);
  vscode.postMessage({type:'ikemenModeReady'});
}
module.exports={html,css,publish,handle,clientScript:()=>`(${client.toString()})(${JSON.stringify(require('./interface_mode').current())});`};
