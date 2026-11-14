'use strict';
let vscode, sequence=0, current, switching=Promise.resolve();
const panels=new Map(), pending=new Map(), snapshots=new Map(), pinnedTransfers=new WeakMap();
const captureFailures=new WeakMap();
const openDispositions=new WeakMap();
function setOpenDisposition(panel,options={}){if(pinnedTransfers.has(panel))return false;openDispositions.set(panel,{mode:['current','new'].includes(options.assetOpenMode)?options.assetOpenMode:'default',replacePanel:options.assetReplacePanel});return true;}
function assertTransferSession(sessionId){if(typeof sessionId!=='string'||!sessionId.trim()||sessionId.length>256)throw new Error('Pinned asset Transfer requires its exact host-owned session.');}
function pinTransfer(panel,sessionId){assertTransferSession(sessionId);if(!panel)throw new Error('Pinned asset Transfer requires its exact panel.');const existing=pinnedTransfers.get(panel);if(existing&&existing!==sessionId)throw new Error('An asset panel cannot change pinned Transfer ownership.');if(!existing&&panels.has(panel))throw new Error('Pin the Transfer endpoint before attaching its asset workspace.');pinnedTransfers.set(panel,sessionId);return true;}
const key=file=>String(file||'').replace(/\\/g,'/').toLowerCase();
function configure(api){vscode=api;}
function compact(){const mode=vscode?.workspace.getConfiguration('ikemenZss').get('interfaceMode');return mode?mode!=='workspace':!vscode||vscode.workspace.getConfiguration('ikemenZss').get('simpleAssetInterface',true);}
function multiple(){const mode=vscode?.workspace.getConfiguration('ikemenZss').get('interfaceMode');return mode?mode==='workspace':!vscode||vscode.workspace.getConfiguration('ikemenZss').get('multipleAssetWorkspaces',false);}
async function capture(panel){
 if(!panels.has(panel)||panels.get(panel).suspended)return true;
 const entry=panels.get(panel);
 captureFailures.delete(panel);
 const id=++sequence;
 return new Promise(resolve=>{
  let settled=false;
  const finish=result=>{
   if(settled)return;
   settled=true;clearTimeout(timeout);pending.delete(id);resolve(result);
  };
  function unavailable(){
   if(settled)return;
   const snapshot=panels.get(panel)===entry && entry.captureWhenHidden?.();
   if(snapshot){remember(entry,snapshot);finish(true);return;}
   captureFailures.set(panel,'unresponsive');finish(false);
  }
  const timeout=setTimeout(unavailable,3000);
  pending.set(id,{panel,entry,finish});
  Promise.resolve(panel.webview.postMessage({type:'assetWorkspaceCapture',id})).then(sent=>{if(sent===false)unavailable();}).catch(unavailable);
 });

}
// Only host-owned unavailable views may skip the live edit capture handshake.
function suspend(panel){const entry=panels.get(panel);if(!entry||pinnedTransfers.has(panel))return false;entry.suspended=true;return true;}
async function beforeReplace(panel){if(pinnedTransfers.has(panel))return false;const clean=await capture(panel);if(!clean){vscode.window.showInformationMessage(captureFailures.get(panel)==='unresponsive'?'The current asset viewer did not respond. Wait for it to finish loading, then try switching again.':'Finish or revert the current sprite/animation edits before switching. You can also enable multiple asset workspaces in Settings.');panel.reveal(panel.viewColumn,false);}return clean;}
async function beforeOpen(file,options={}){
 if(options.transferSessionId!==undefined){assertTransferSession(options.transferSessionId);return true;}
 if(options.assetOpenMode==='new')return true;
 if(options.assetOpenMode==='current'){const old=options.assetReplacePanel;return !panels.has(old)||key(file)===key(panels.get(old).file)||await beforeReplace(old);}
 if(multiple())return true;
 for(const [panel,entry] of panels){if(pinnedTransfers.has(panel))continue;if(key(file)===key(entry.file))continue;if(!await beforeReplace(panel))return false;}
 return true;
}
function remember(entry,snapshot){
 const filename=key(entry.file);snapshots.delete(filename);snapshots.set(filename,snapshot);
 while(snapshots.size>40)snapshots.delete(snapshots.keys().next().value);
}
function decorate(panel,file,kind,page,explicitSelection=false,captureWhenHidden){
 require('./viewer_group').trackViewerPanel(panel);
 if(!pinnedTransfers.has(panel)&&page.includes('data-universal-slot="viewer-browser"'))require('./viewer_browser_state').registerOwner(panel,kind,file);
 const firstAttachment=!panels.has(panel);
 if(firstAttachment){
  panels.set(panel,{file,kind});panel.onDidDispose(()=>{panels.delete(panel);pinnedTransfers.delete(panel);openDispositions.delete(panel);if(current===panel)current=undefined;for(const request of [...pending.values()])if(request.panel===panel)request.finish(false);});
  panel.onDidChangeViewState?.(event=>{if(event.webviewPanel.active)current=panel;});
 }
 panels.set(panel,{file,kind,suspended:false,captureWhenHidden});
 let cached=firstAttachment&&!pinnedTransfers.has(panel)?snapshots.get(key(file)):undefined;
 if(firstAttachment&&!pinnedTransfers.has(panel))snapshots.delete(key(file));
 if(cached&&(explicitSelection||panel.pendingReference))cached={...cached,reference:undefined};
 if(cached){const data=JSON.stringify(cached).replace(/</g,'\\u003c');page=page.replace('acquireVsCodeApi()',`(()=>{const api=acquireVsCodeApi();globalThis.ikemenResumeAsset=${data};return {getState:()=>api.getState()||globalThis.ikemenResumeAsset.state,setState:value=>api.setState(value),postMessage:message=>api.postMessage(message)}})()`);}
 const placement=openDispositions.get(panel)?.mode,cachedState=JSON.stringify(cached?.state||{}).replace(/</g,'\\u003c');
 page=page.replace('acquireVsCodeApi()',`(()=>{const api=acquireVsCodeApi(),keep=${placement==='new'}||(${placement!=='current'}&&api.getState()?.assetOpenMode==='new');if(keep)api.setState({...${cachedState},...api.getState(),assetOpenMode:'new'});return {getState:()=>api.getState(),setState:value=>{const next={...value};if(keep)next.assetOpenMode='new';else delete next.assetOpenMode;if(api.getState()?.assetKeepTabsOnRestore)next.assetKeepTabsOnRestore=true;return api.setState(next)},postMessage:message=>api.postMessage(message)}})()`);
 if(compact())page=page.replace(/(<details\b[^>]*?)\sopen(?=[\s>])/g,'$1').replace('<body>','<body data-simple-assets="true">');
 return page;
}
async function handle(message,panel){
 if(message?.type==='assetWorkspaceCaptured'){
  const request=pending.get(message.id);if(!request||request.panel!==panel)return true;
  if(request.entry!==panels.get(panel)){request.finish(false);return true;}
  if(message.clean===true)remember(request.entry,{state:message.state,reference:message.reference,scroll:message.scroll,fields:message.fields});
  request.finish(message.clean===true);return true;
 }
 if(message?.type==='assetWorkspaceOptions'){await chooseMode();return true;}
 if(message?.type!=='assetWorkspaceReady')return false;
 if(message.openNewTab===true&&!openDispositions.has(panel))setOpenDisposition(panel,{assetOpenMode:'new'});
 if(message.restoreTabs===true&&!openDispositions.has(panel))openDispositions.set(panel,{mode:'restore'});
 switching=switching.catch(()=>{}).then(()=>activate(panel));await switching;return true;
}
async function activate(panel){
 if(!panels.has(panel)||pinnedTransfers.has(panel))return true;
 const disposition=openDispositions.get(panel);
 if(disposition?.mode==='new'){for(const old of panels.keys())if(!pinnedTransfers.has(old))old.webview.postMessage({type:'assetWorkspaceKeepOnRestore'});current=panel;return true;}
 if(disposition?.mode==='restore'){current=panel;return true;}
 const oldPanels=disposition?.mode==='current'?[disposition.replacePanel]:!multiple()?[...panels.keys()]:[];
 for(const old of oldPanels){
  if(!panels.has(old))continue;
  if(old===panel||pinnedTransfers.has(old))continue;
  if(!await capture(old)){const replacementClean=await capture(panel);if(replacementClean)panel.dispose();old.reveal(old.viewColumn,false);vscode.window.showInformationMessage(replacementClean?'The previous asset workspace has unfinished edits or is not responding. It was kept open.':'Both asset workspaces were kept open because edits or pending work could not be safely discarded. Save or revert before switching.');return true;}
  if(panels.has(panel)){panel.reveal(old.viewColumn,false);old.dispose();}
 }
 current=panel;return true;
}
async function chooseMode(){return require('./interface_mode').choose();}
async function openAsset(resource){
 const uri=resource?.fsPath?resource:(await vscode.window.showOpenDialog({title:'Open visual asset',canSelectFiles:true,canSelectFolders:false,canSelectMany:false,filters:{'IKEMaker visual assets':['sff','air','snd']}}))?.[0];if(!uri)return;
 const kind=/\.(sff|air|snd)$/i.exec(uri.fsPath||'')?.[1]?.toLowerCase();if(!kind)return;
 const choice=await vscode.window.showQuickPick([{label:'Open in current visual tab',mode:'current',description:'Replace the focused asset viewer only after unfinished edits are resolved'},{label:'Open in new visual tab',mode:'new',description:'Keep the existing asset viewers and their unfinished edits open'},{label:'Use interface mode default',mode:'default',description:'Follow the normal single or multiple asset workspace setting'}],{title:'Open '+kind.toUpperCase()+' asset',placeHolder:'Choose current tab or new tab with the arrow keys, then Enter'});if(!choice)return;
 const options=choice.mode==='default'?{}:{assetOpenMode:choice.mode,assetReplacePanel:current};
 if(kind==='air')return require('./air_viewer').openAirPreview(uri,{...options,preserveFocus:false});
 if(kind==='sff')return require('./sff_viewer').openSffViewer(uri,undefined,undefined,options);
 return require('./snd_viewer').openSndViewer(uri,undefined,undefined,undefined,options);
}
function register(context){context.subscriptions.push(vscode.commands.registerCommand('ikemen.configureAssetWorkspace',chooseMode),vscode.commands.registerCommand('ikemen.assets.open',openAsset));}
function client(){
 if(document.body.dataset.simpleAssets==='true'){
  const toolbar=document.querySelector('body > header, body > .toolbar, body > .header');
  if(toolbar){const tools=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Tools & view';tools.append(summary);
   for(const id of ['experience','openSff','airSource','gifToAir','actionLog','axisLayer','exportPreview','saveAirPalette','saveAirGroupPalette','clearAirGroupPalette','palFx','openEditor','copyCall','exportMarked','chooseEditor']){const button=document.getElementById(id);if(button&&toolbar.contains(button))tools.append(button);}
   for(const id of ['proofBackground','proofColor']){const control=document.getElementById(id);if(control&&toolbar.contains(control))tools.append(control.closest('label')||control);}
   const paneButtons=toolbar.querySelector('.pane-buttons');if(paneButtons)tools.append(paneButtons);
   const description=toolbar.querySelector(':scope > div > .muted');if(description)description.textContent=description.textContent.split(' · ').slice(0,3).join(' · ');
   if(tools.children.length>1)toolbar.append(tools);
  }
 }
 addEventListener('message',event=>{const m=event.data;if(m.type==='assetWorkspaceKeepOnRestore'){vscode.setState({...vscode.getState(),assetKeepTabsOnRestore:true});return;}if(m.type!=='assetWorkspaceCapture')return;
 const clean=typeof globalThis.ikemenCanLeaveAsset==='function'&&globalThis.ikemenCanLeaveAsset();
 const fields=Object.fromEntries([...document.querySelectorAll('input[id]')].filter(e=>/search|filter/i.test(e.id)).map(e=>[e.id,e.value]));
 const scroll=[...document.querySelectorAll('[id]')].filter(e=>e.scrollTop||e.scrollLeft).map(e=>({id:e.id,top:e.scrollTop,left:e.scrollLeft}));
 vscode.postMessage({type:'assetWorkspaceCaptured',id:m.id,clean,state:vscode.getState(),reference:globalThis.ikemenNavigationSelection?.(),fields,scroll});
 });
 requestAnimationFrame(()=>{
 const saved=globalThis.ikemenResumeAsset;
 if(saved){if(saved.reference){const surface=document.querySelector('[data-toolbar-surface]')?.dataset.toolbarSurface;window.dispatchEvent(new MessageEvent('message',{data:surface==='air'?{type:'selectAction',action:saved.reference.group,frameIndex:saved.reference.frameIndex}:{type:'navigateReference',reference:saved.reference}}));}
 for(const [id,value] of Object.entries(saved.fields||{})){const e=document.getElementById(id);if(e){e.value=value;e.dispatchEvent(new Event('input'));}}
 requestAnimationFrame(()=>{for(const position of saved.scroll||[]){const e=document.getElementById(position.id);if(e){e.scrollTop=position.top;e.scrollLeft=position.left;}}});}
 vscode.postMessage({type:'assetWorkspaceReady',openNewTab:vscode.getState()?.assetOpenMode==='new',restoreTabs:vscode.getState()?.assetKeepTabsOnRestore===true});
 });
}
module.exports={configure,register,compact,multiple,beforeOpen,beforeReplace,pinTransfer,suspend,setOpenDisposition,openAsset,decorate,handle,clientScript:()=>`(${client.toString()})();`};
