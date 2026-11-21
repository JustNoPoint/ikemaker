'use strict';
let vscode, sequence=0, current, switching=Promise.resolve();
const panels=new Map(), pending=new Map(), snapshots=new Map(), pinnedTransfers=new WeakMap();
const captureFailures=new WeakMap();
const openDispositions=new WeakMap();
function setOpenDisposition(panel,options={}){if(pinnedTransfers.has(panel))return false;openDispositions.set(panel,{mode:['current','new'].includes(options.assetOpenMode)?options.assetOpenMode:'default',replacePanel:options.assetReplacePanel});return true;}
function assertTransferSession(sessionId){if(typeof sessionId!=='string'||!sessionId.trim()||sessionId.length>256)throw new Error('Pinned asset Transfer requires its exact host-owned session.');}
function pinTransfer(panel,sessionId){assertTransferSession(sessionId);if(!panel)throw new Error('Pinned asset Transfer requires its exact panel.');const existing=pinnedTransfers.get(panel);if(existing&&existing!==sessionId)throw new Error('An asset panel cannot change pinned Transfer ownership.');if(!existing&&panels.has(panel))throw new Error('Pin the Transfer endpoint before attaching its asset workspace.');pinnedTransfers.set(panel,sessionId);return true;}
function key(file) {
 const value=String(file||'');
 return process.platform==='win32'?value.replace(/\\/g,'/').toLowerCase():value;
}
function configure(api){vscode=api;}
function compact(){const mode=vscode?.workspace.getConfiguration('ikemenZss').get('interfaceMode');return mode?mode!=='workspace':!vscode||vscode.workspace.getConfiguration('ikemenZss').get('simpleAssetInterface',true);}
function multiple(){const mode=vscode?.workspace.getConfiguration('ikemenZss').get('interfaceMode');return mode?mode==='workspace':!vscode||vscode.workspace.getConfiguration('ikemenZss').get('multipleAssetWorkspaces',false);}
async function capture(panel,onSnapshot){
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
   if(snapshot){remember(entry,snapshot);onSnapshot?.(snapshot);finish(true);return;}
   captureFailures.set(panel,'unresponsive');finish(false);
  }
  const timeout=setTimeout(unavailable,3000);
  pending.set(id,{panel,entry,finish,onSnapshot});
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
 if(kind==='air'||kind==='sff'){
  const owner=require('./character_view_policy').verifiedOwnerPresentation(panel);
  if(owner){
   const header=JSON.stringify(owner.header).replace(/</g,'\\u003c');
   page=page.replace('acquireVsCodeApi()',`(globalThis.ikemenVerifiedOwnerHeader=${header},acquireVsCodeApi())`);
  }
 }
 if(compact())page=page.replace(/(<details\b[^>]*?)\sopen(?=[\s>])/g,'$1').replace('<body>','<body data-simple-assets="true">');
 return page;
}
async function handle(message,panel){
 if(message?.type==='assetWorkspaceCaptured'){
  const request=pending.get(message.id);if(!request||request.panel!==panel)return true;
  if(request.entry!==panels.get(panel)){request.finish(false);return true;}
  if(message.clean===true){
   const snapshot={state:message.state,reference:message.reference,scroll:message.scroll,fields:message.fields};
   remember(request.entry,snapshot);
   request.onSnapshot?.(snapshot);
  }
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
  if(!await capture(old)){const replacementClean=await capture(panel);if(replacementClean)panel.dispose();old.reveal(old.viewColumn,false);const unresponsive=captureFailures.get(old)==='unresponsive';vscode.window.showInformationMessage(replacementClean?(unresponsive?'The previous asset viewer did not respond. It was kept open. Wait for it to finish loading, then try switching again.':'The previous asset workspace has unfinished edits. It was kept open. Finish or revert them before switching.'):'Both asset workspaces were kept open because edits or pending work could not be safely discarded. Save or revert before switching.');return true;}
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
const standalonePalettes=new WeakMap();
function trackStandalonePalette(panel,getFile){standalonePalettes.set(panel,getFile);}
function focusStandalonePalette(file){
 for(const [panel,entry] of panels){
  if(entry.suspended||key(standalonePalettes.get(panel)?.())!==key(file))continue;
  panel.reveal(panel.viewColumn,false);
  return panel;
 }
 return null;
}
async function saveMediaSession() {
 const codec=require('./media_session'),fs=require('fs'),path=require('path');
 const omitted=[],skipped=[],unsavedPalettes=[];
 const pendingTabs=Array.from(panels,async ([panel,entry])=>{
  if(entry.suspended||pinnedTransfers.has(panel)){skipped.push(path.basename(entry.file));return null;}
  const palette=standalonePalettes.get(panel)?.();
  if(palette)return {kind:'Palette',file:palette,active:panel.active};
  if(standalonePalettes.has(panel)){unsavedPalettes.push(panel.title||'Untitled palette');return null;}
  const kind={sff:'Sff',air:'Air',snd:'Snd'}[entry.kind];
  if(!kind)return null;
  const active=panel.active;
  let selection;
  const captured=await capture(panel,snapshot=>{selection=snapshot.reference;});
  if(!captured)omitted.push(path.basename(entry.file));
  return {kind,file:entry.file,active,selection:captured?selection:null};
 });
 const tabs=(await Promise.all(pendingTabs)).filter(Boolean);
 const runtime=require('./entity_switch_runtime').currentEntitySwitchRuntime();
 const entities=runtime?.coordinator.snapshot();
 for(const entity of entities?.entities||[]){
  if(path.extname(entity.ownerFile).toLowerCase()!=='.def')continue;
  tabs.push({kind:'Def',file:entity.ownerFile,name:entity.label,active:!tabs.some(tab=>tab.active)&&entity.identity===entities.activeIdentity});
 }
 if(!tabs.length)return void vscode.window.showInformationMessage(unsavedPalettes.length?'Save the palette draft to a file before saving this workspace.':'Open a media viewer or entity to save a workspace.');
 const uri=await vscode.window.showSaveDialog({title:'Save IKeMaker Workspace',filters:{'IKeMaker workspace':['imesession']}});
 if(!uri)return;
 const safety=require('./mutation_safety'),file=uri.fsPath;
 const baseline=fs.existsSync(file)?fs.readFileSync(file):Buffer.alloc(0);
 safety.transactionalWrite(fs,file,codec.encodeSession(file,tabs),{expectedHash:safety.hash(baseline),allowExisting:true});
 const detail=omitted.length?' Selection unavailable for '+omitted.join(', ')+'.':'';
 return void vscode.window.showInformationMessage('Saved '+tabs.length+' workspace '+(tabs.length===1?'tab.':'tabs.')+' Unsaved edits stay in their editors.'+detail+(unsavedPalettes.length?' Save these palette drafts to include them: '+unsavedPalettes.join(', ')+'.':'')+(skipped.length?' Skipped unavailable or transfer tabs: '+skipped.join(', ')+'.':''));
}

async function loadMediaSession() {
 const fs=require('fs'),path=require('path');
 const picked=await vscode.window.showOpenDialog({title:'Restore IKeMaker Workspace',canSelectMany:false,filters:{'IKeMaker workspace':['imesession']}});
 if(!picked?.length)return;
 const filename=picked[0].fsPath;
 const issues=[];
 let rows;
 try{
  if(fs.statSync(filename).size>1048576)throw Error('Workspace file exceeds 1 MB.');
  rows=require('./media_session').decodeSession(filename,fs.readFileSync(filename),message=>issues.push(message),fs.existsSync);
 }catch(error){
  return void vscode.window.showWarningMessage('Could not restore '+path.basename(filename)+'. '+error.message);
 }
 async function requireViewer(opening){
   const viewer=await opening;
   if(!viewer)throw Error('Viewer did not open');
   return viewer;
 }
 async function openRow(row){
   if(row.kind==='Palette'){const retained=focusStandalonePalette(row.file);if(retained)return retained;}
   if(!fs.statSync(row.file).isFile())throw Error('File unavailable');
   const uri=vscode.Uri.file(row.file),options={assetOpenMode:'new',preserveFocus:false};
   const ref=Object.keys(row.selection).length?row.selection:undefined;
   if(row.kind==='Sff')return requireViewer(require('./sff_viewer').openSffViewer(uri,undefined,ref,options));
   else if(row.kind==='Snd')return requireViewer(require('./snd_viewer').openSndViewer(uri,undefined,ref,undefined,options));
   else if(row.kind==='Air'&&path.extname(row.file).toLowerCase()==='.air'){
    return requireViewer(require('./air_viewer').openAirPreview(uri,{...options,action:ref?.group,frameIndex:ref?.frameIndex}));
   }else if(row.kind==='Palette'){
    const workshop=require('./palette_workspace_controller').paletteWorkspaceController();
    if(/\.ikpalette\.json$/i.test(row.file))return requireViewer(workshop.openScratchWorkspace(uri,options));
    else return requireViewer(workshop.importPaletteFile(row.file,options));
   }else{
    if(fs.statSync(row.file).size>4*1024*1024)throw Error('Definition exceeds 4 MB.');
    const kind=require('./entity_switch_runtime').classifyDef(row.file,fs.readFileSync(row.file,'utf8'));
    if(kind==='character'){
     const targets=require('./entity_target_resolver').resolveEntityTargets({kind,ownerFile:row.file});
     if(row.kind==='Air'){
      if(!targets.air.available)throw Error('Character has no available AIR file.');
      return requireViewer(require('./air_viewer').openAirPreview(vscode.Uri.file(targets.air.filename),{...options,ownerDefs:[row.file],action:ref?.group,frameIndex:ref?.frameIndex}));
     }else if(targets.sff.available)return requireViewer(require('./sff_viewer').openSffViewer(vscode.Uri.file(targets.sff.filename),undefined,undefined,{...options,ownerDefs:[row.file]}));
     else if(targets.air.available)return requireViewer(require('./air_viewer').openAirPreview(vscode.Uri.file(targets.air.filename),{...options,ownerDefs:[row.file]}));
     else return vscode.commands.executeCommand('vscode.open',uri);
    }else{
     const command=kind==='storyboard'?'ikemen.storyboard.open':kind==='stage'?'ikemen.stage.openWorkspace':path.basename(row.file).toLowerCase()==='select.def'?'ikemen.selectDef.openWorkspace':'ikemen.ui.openWorkspace';
     const options=command==='ikemen.selectDef.openWorkspace'?{requireExactRoster:true}:{};
     return requireViewer(vscode.commands.executeCommand(command,uri,options));
    }
   }
 }
 let count=0, lastOpened, activeRow, activePanel;
 for(const row of rows){
  try{
   const result=await openRow(row);
   lastOpened=row;
   if(row.active){activeRow=row;activePanel=result?.panel||result;}
   count++;
  }catch(error){issues.push(path.basename(row.file)+' ('+error.message+')');}
 }
 if(activeRow && activeRow!==lastOpened){
  try{
   if(typeof activePanel?.reveal==='function')activePanel.reveal(activePanel.viewColumn,false);
   else await openRow(activeRow);
  }catch(error){issues.push('Could not focus '+path.basename(activeRow.file)+' ('+error.message+')');}
 }
 const summary='Opened '+count+' workspace '+(count===1?'file.':'files.');
 if(issues.length)return void vscode.window.showWarningMessage(summary+' Could not open '+issues.join(', '));
 return void vscode.window.showInformationMessage(summary);
}
function register(context){context.subscriptions.push(vscode.commands.registerCommand('ikemen.media.saveSession',saveMediaSession),vscode.commands.registerCommand('ikemen.media.loadSession',loadMediaSession),vscode.commands.registerCommand('ikemen.configureAssetWorkspace',chooseMode),vscode.commands.registerCommand('ikemen.assets.open',openAsset));}
function client(){
 let evidenceHeader;
 function renderVerifiedOwner(header){
  if(typeof header!=='string'||(!header&&!evidenceHeader))return;
  if(!evidenceHeader){
   evidenceHeader=document.createElement('p');
   evidenceHeader.className='muted';
   evidenceHeader.setAttribute('role','note');
   document.body.prepend(evidenceHeader);
  }
  evidenceHeader.textContent=header;
  evidenceHeader.hidden=!header;
 }
 renderVerifiedOwner(globalThis.ikemenVerifiedOwnerHeader);
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
 addEventListener('message',event=>{const m=event.data;if(m?.type==='verifiedOwnerNavigation'){renderVerifiedOwner(m.header);return;}if(m.type==='assetWorkspaceKeepOnRestore'){vscode.setState({...vscode.getState(),assetKeepTabsOnRestore:true});return;}if(m.type!=='assetWorkspaceCapture')return;
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
module.exports={trackStandalonePalette,configure,register,compact,multiple,beforeOpen,beforeReplace,capture,pinTransfer,suspend,setOpenDisposition,openAsset,decorate,handle,clientScript:()=>`(${client.toString()})();`};
