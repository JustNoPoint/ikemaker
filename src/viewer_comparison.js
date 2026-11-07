'use strict';
const path=require('path');
const {preferredViewerColumn,trackViewerPanel}=require('./viewer_group');
const {adapt}=require('./universal_toolbar_adapter');
const sharedHeader=require('./shared_workspace_header');
const {MESSAGE_TYPE,universalToolbarStyle,createUniversalToolbarDispatcher}=require('./universal_toolbar_webview');
const references=new Map(),panels=new Map(),mutationQueues=new Map();
let store,ready=Promise.resolve();
const TOOLBAR_COMMANDS=Object.freeze({new:'ikemen.file.createNew',open:'workbench.action.files.openFile',project:'ikemen.projectManager.open','actions-search':'ikemen.textActions.open','suite-switch':'ikemen.switchSuite',settings:'ikemen.openExtensionSettings'});
const FROZEN_REASON='Comparison uses frozen snapshots and has no truthful single live source or connected-resource context.';
function comparisonToolbarModel(){const capabilities={close:{enabled:true,dispatch:'internal:close-comparison'},help:{enabled:true,dispatch:'command:ikemen.help.open'},'text-source':{enabled:false,reason:FROZEN_REASON},'connected-resources':{enabled:false,reason:FROZEN_REASON}};for(const [slotId,command]of Object.entries(TOOLBAR_COMMANDS))capabilities[slotId]={enabled:true,dispatch:'command:'+command};return adapt('companion.comparison',capabilities);}
async function persist(kind,primary,reference=references.get(kind)){if(store)await store.write(kind,reference?{reference,primary}:undefined);}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function snapshot(filename,kind,selection,preview){
  if(!Number.isInteger(selection?.group)||!Number.isInteger(selection?.number))throw Error('Select a sprite or sound before comparing.');
  if(preview){
    if(kind!=='sff'||preview.group!==selection.group||preview.number!==selection.number||typeof preview.media!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(preview.media)||preview.media.length>32*1024*1024)throw Error('The viewer preview is unavailable or does not match the selected sprite. Wait for it to load and try again.');
    return{filename:path.resolve(filename),kind,selection:{...selection},identity:`SFF ${selection.group},${selection.number}`,media:preview.media,detail:'Pinned viewer preview · includes visible palette, axes and overlays · captured before choosing this action'};
  }
  let media,detail;
  if(kind==='sff'){
    const reader=require('./sff_reader'),archive=reader.readSff(filename),item=archive.sprites.find(item=>item.group===selection.group&&item.number===selection.number);
    if(!item)throw Error('The selected sprite no longer exists in the saved archive.');
    media=reader.spriteDataUri(archive,item);detail=`${item.width} × ${item.height} px · saved archive palette`;
  }else if(kind==='snd'){
    const reader=require('./snd_reader'),archive=reader.readSnd(filename),item=archive.entries.find(item=>item.group===selection.group&&item.index===selection.number);
    if(!item)throw Error('The selected sound no longer exists in the saved archive.');
    media=reader.soundDataUri(archive,item);detail='Saved archive audio';
  }else throw Error('Comparison for this viewer is not available yet.');
  return{filename:path.resolve(filename),kind,selection:{...selection},identity:`${kind.toUpperCase()} ${selection.group},${selection.number}`,media,detail};
}
function html(primary,reference,nonce,options={}){
  const toolbar=sharedHeader.html('comparison',comparisonToolbarModel()),toolbarStyle=universalToolbarStyle(),toolbarClient=sharedHeader.clientScript('vscode');
  if(primary.kind==='air')return require('./viewer_animation_comparison').html(primary,reference,nonce,{toolbar,toolbarStyle,toolbarClient,focusSwap:!!options.focusSwap});
  const side=(label,item)=>`<section><h2>${label} · ${escape(item.identity)}</h2><p>${escape(item.filename)}</p><p>${escape(item.detail)}</p>${item.kind==='snd'?`<audio controls preload="metadata" aria-label="${escape(label+' '+item.identity)}" src="${escape(item.media)}"></audio>`:`<div class="image"><img alt="${escape(label+' '+item.identity)}" src="${escape(item.media)}"></div>`}</section>`;
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; media-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'"><style>${toolbarStyle}body{font:var(--vscode-font-size) var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);margin:0}.comparison-content{padding:16px}.comparison-content h1{font-size:20px}.comparison-content h2{font-size:16px}.comparison-content p{overflow-wrap:anywhere;color:var(--vscode-descriptionForeground)}.comparison-content main{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}.comparison-content section{border:1px solid var(--vscode-panel-border);padding:12px;min-width:0}.comparison-content .image{overflow:auto;min-height:260px;background:repeating-conic-gradient(#303030 0% 25%,#404040 0% 50%) 0/20px 20px;display:flex;align-items:center;justify-content:center}.comparison-content img{image-rendering:pixelated;max-width:100%;object-fit:contain}.comparison-content audio{width:100%}.comparison-content .swap-status{padding-inline-start:8px;color:var(--vscode-descriptionForeground)}@media(max-width:650px){.comparison-content main{grid-template-columns:1fr}.comparison-content{padding:10px}}.comparison-content button{font:inherit;padding:6px;color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:1px solid var(--vscode-button-border)}.comparison-content button:focus-visible{outline:2px solid var(--vscode-focusBorder)}</style></head><body>${toolbar}<div class="comparison-content"><h1>Compare ${primary.kind==='snd'?'sounds':'sprites'}</h1><p>Each side is a frozen snapshot with its source described below. ${primary.kind==='snd'?'Sound snapshots use saved archive audio. Play one side at a time.':'Sprite viewer previews include visible unsaved changes, palette, axes and overlays.'} Replace or clear the reference through Compare in a viewer.</p><button id="swap" aria-describedby="swapStatus">Swap primary and reference</button><span id="swapStatus" class="swap-status" role="status" aria-live="polite">Ready to swap the two frozen snapshots.</span><main>${side('Primary',primary)}${side('Reference',reference)}</main></div><script nonce="${nonce}">const vscode=acquireVsCodeApi(),swap=document.getElementById('swap'),swapStatus=document.getElementById('swapStatus');${toolbarClient}vscode.setState({kind:${JSON.stringify(primary.kind)}});swap.onclick=()=>{if(swap.disabled)return;swap.disabled=true;swap.title='Wait for the current snapshot swap to finish.';swapStatus.textContent='Saving and swapping the frozen snapshots…';vscode.postMessage({type:'swap'})};globalThis.addEventListener?.('message',event=>{const message=event.data;if(message&&typeof message==='object'&&!Array.isArray(message)&&Object.keys(message).length===2&&message.type==='comparisonSwapResult'&&message.ok===false){swap.disabled=false;swap.title='Swap primary and reference';swapStatus.textContent='The snapshots could not be swapped. Review the warning and try again.';swap.focus()}});${options.focusSwap?'swap.focus();':''}for(const player of document.querySelectorAll('audio'))player.onplay=()=>{for(const other of document.querySelectorAll('audio'))if(other!==player)other.pause();};</script></body></html>`;
}
async function runMutation(kind,work){
  const previous=mutationQueues.get(kind);
  let release;const gate=new Promise(resolve=>{release=resolve;}),tail=previous?previous.catch(()=>{}).then(()=>gate):gate;mutationQueues.set(kind,tail);
  // Begin an uncontended mutation immediately. Apart from making the busy
  // state truthful in the same event turn, this lets Close observe the exact
  // pending persistence operation instead of a not-yet-started microtask.
  if(previous)await previous.catch(()=>{});
  try{return await work();}finally{release();if(mutationQueues.get(kind)===tail)mutationQueues.delete(kind);}
}
async function openComparison(filename,kind,selection,options={}){
  const vscode=require('vscode');
  await ready;
  if(!['air','sff','snd'].includes(kind))return vscode.window.showInformationMessage('Comparison is available from AIR, SFF and SND.');
  const pinned=references.get(kind),choices=[{label:'Pin selected item as reference',action:'pin'}];
  if(pinned)choices.push({label:'Compare selected item with reference',description:pinned.identity+' · '+pinned.filename,action:'compare'},{label:'Clear pinned reference',action:'clear'});
  const choice=await vscode.window.showQuickPick(choices,{title:kind.toUpperCase()+' comparison · pinned snapshots',matchOnDescription:true});if(!choice)return;
  if(choice.action==='clear')return runMutation(kind,async()=>{if(store)await store.write(kind,undefined);references.delete(kind);panels.get(kind)?.panel.dispose();});
  if(options.requirePreview&&!options.preview)throw Error('Wait for the selected sprite preview to finish loading, then choose Compare again.');
  const selected=kind==='air'?await animationSnapshot(filename,selection):snapshot(filename,kind,selection,options.preview);
  if(!selected)return;
  if(choice.action==='pin')return runMutation(kind,async()=>{const existing=panels.get(kind);await persist(kind,existing?.primary,selected);references.set(kind,selected);if(existing){existing.reference=selected;render(existing);}vscode.window.showInformationMessage('Pinned '+selected.identity+' from '+path.basename(filename)+'. Select another item and choose Compare.');});
  if(!pinned)return;
  return runMutation(kind,async()=>{
    const currentReference=references.get(kind);if(!currentReference)return;
    await persist(kind,selected,currentReference);
    let record=panels.get(kind);
    if(!record){
      const panel=trackViewerPanel(vscode.window.createWebviewPanel('ikemenComparison','Compare · '+kind.toUpperCase(),preferredViewerColumn(vscode.ViewColumn.Beside),{enableScripts:true,retainContextWhenHidden:true}));record=attachPanel(panel,kind,selected,currentReference);
    }else{record.primary=selected;record.reference=currentReference;record.panel.reveal(undefined,false);}
    render(record);return record.panel;
  });
}
function attachPanel(panel,kind,primary,reference){
  const vscode=require('vscode');sharedHeader.attachObserver(panel,'companion.comparison');const record={panel,primary,reference,swapping:false,pendingSwap:null,disposed:false};panels.set(kind,record);
  const close=async()=>{if(record.pendingSwap)try{await record.pendingSwap;}catch{}if(!record.disposed)panel.dispose();};
  const toolbarHandlers={close,help:async()=>vscode.commands.executeCommand('ikemen.help.open')};for(const [slotId,command]of Object.entries(TOOLBAR_COMMANDS))toolbarHandlers[slotId]=async()=>vscode.commands.executeCommand(command);
  const toolbarDispatcher=createUniversalToolbarDispatcher({handlersBySurface:{'companion.comparison':toolbarHandlers},getToolbar:async()=>comparisonToolbarModel()});
  panel.webview.onDidReceiveMessage(async message=>{
    if(message?.type===MESSAGE_TYPE){try{await toolbarDispatcher.dispatch('companion.comparison',message);}catch{}return;}
    if(sharedHeader.isSharedMessage(message))return sharedHeader.handle(message,{panel,disposed:record.disposed},'comparison');
    if(!message||Object.getPrototypeOf(message)!==Object.prototype||Object.keys(message).length!==1||message.type!=='swap'||record.swapping||record.disposed)return;
    record.swapping=true;const operation=runMutation(kind,async()=>{const previousPrimary=record.primary,previousReference=record.reference,nextPrimary=previousReference,nextReference=previousPrimary;try{await persist(kind,nextPrimary,nextReference);}catch(error){error.comparisonPersistFailed=true;throw error;}if(record.disposed){record.primary=nextPrimary;record.reference=nextReference;references.set(kind,nextReference);return;}try{render(record,{primary:nextPrimary,reference:nextReference,focusSwap:true});}catch(error){try{await persist(kind,previousPrimary,previousReference);}catch(rollbackError){const failure=Error(error.message+'; restoring the prior saved comparison also failed: '+rollbackError.message);failure.comparisonRollbackFailed=true;failure.committedPrimary=nextPrimary;failure.committedReference=nextReference;throw failure;}throw error;}record.primary=nextPrimary;record.reference=nextReference;references.set(kind,nextReference);});record.pendingSwap=operation;
    try{await operation;}catch(error){if(error.comparisonRollbackFailed){record.primary=error.committedPrimary;record.reference=error.committedReference;references.set(kind,error.committedReference);if(!record.disposed)panel.dispose();vscode.window.showWarningMessage('The comparison was saved in swapped order, but its view could not refresh and the previous saved pair could not be restored. The stale comparison was closed; reopen Compare to continue. '+error.message);}else if(!record.disposed){await panel.webview.postMessage?.({type:'comparisonSwapResult',ok:false});vscode.window.showWarningMessage(error.comparisonPersistFailed?'Could not swap comparison; the previous pair is unchanged: '+error.message:'Could not swap comparison; the previous pair was restored: '+error.message);}}finally{if(record.pendingSwap===operation)record.pendingSwap=null;record.swapping=false;}
  });
  panel.onDidDispose(()=>{record.disposed=true;if(panels.get(kind)===record)panels.delete(kind);});return record;
}
function registerComparison(context){
  const vscode=require('vscode'),storage=context.storageUri||context.globalStorageUri;
  if(storage)store=require('./viewer_comparison_store').createStore(path.join(storage.fsPath,'viewer-comparisons'));
  ready=Promise.all(['air','sff','snd'].map(async kind=>{try{const saved=await store?.read(kind);if(saved)references.set(kind,saved.reference);}catch(error){vscode.window.showWarningMessage('Could not restore '+kind.toUpperCase()+' comparison reference: '+error.message);}}));
  context.subscriptions.push(vscode.window.registerWebviewPanelSerializer('ikemenComparison',{async deserializeWebviewPanel(panel,state){
    await ready;const kind=state?.kind;if(!['air','sff','snd'].includes(kind)){panel.dispose();return;}
    try{const saved=await store?.read(kind);if(!saved?.primary){panel.dispose();return;}const existing=panels.get(kind);if(existing){panel.dispose();existing.panel.reveal(undefined,false);return;}
      panel.webview.options={enableScripts:true};panel.title='Compare · '+kind.toUpperCase();const record=attachPanel(panel,kind,saved.primary,saved.reference);render(record);
    }catch(error){panel.dispose();vscode.window.showWarningMessage('Could not restore comparison: '+error.message);}
  }}));
}
function render(record,options={}){if(record.disposed)return false;const primary=options.primary||record.primary,reference=options.reference||record.reference;record.panel.webview.html=html(primary,reference,require('crypto').randomBytes(16).toString('hex'),options);return true;}
async function animationSnapshot(filename,selection){
  if(!Number.isInteger(selection?.group))throw Error('Select an AIR action before comparing.');
  const vscode=require('vscode'),fs=require('fs'),navigation=require('./viewer_navigation'),context=navigation.archiveContext(filename);
  if(context?.invalid)throw Error('Resolve this shared archive context before comparing.');
  let spriteFile=context?.record?.sff;
  if(context&&!spriteFile)throw Error('This shared archive has no configured SFF for comparison.');
  if(!spriteFile){const owners=navigation.associatedDefs(filename);let owner=owners.length===1?owners[0]:undefined;if(!owner){const picked=await vscode.window.showQuickPick(owners.map(file=>({label:path.basename(file),description:file,file})),{title:'Choose the owning character for AIR comparison',matchOnDescription:true});if(!picked)return;owner=picked.file;}spriteFile=require('./related_work').resolveAssigned(owner).sff;}
  if(!spriteFile)throw Error('No SFF is assigned to this AIR owner.');
  const document=vscode.workspace.textDocuments.find(doc=>path.resolve(doc.fileName).toLowerCase()===path.resolve(filename).toLowerCase()),reader=require('./sff_reader');
  const animation=require('./viewer_animation_comparison').build(document?document.getText():fs.readFileSync(filename,'utf8'),selection.group,reader.readSff(spriteFile),reader.spriteDataUri);
  return{filename:path.resolve(filename),kind:'air',selection:{...selection},identity:'AIR '+selection.group,animation,detail:(document?.isDirty?'Unsaved AIR text':'AIR text')+' · saved sprites: '+spriteFile+(animation.missing.length?' · Missing sprites: '+animation.missing.join('; '):'')};
}
module.exports={TOOLBAR_COMMANDS,FROZEN_REASON,comparisonToolbarModel,snapshot,html,openComparison,animationSnapshot,registerComparison};
