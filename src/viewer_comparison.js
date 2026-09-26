'use strict';
const path=require('path');
const {preferredViewerColumn,trackViewerPanel}=require('./viewer_group');
const references=new Map(),panels=new Map();
let store,ready=Promise.resolve();
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
function html(primary,reference,nonce){
  if(primary.kind==='air')return require('./viewer_animation_comparison').html(primary,reference,nonce);
  const side=(label,item)=>`<section><h2>${label} · ${escape(item.identity)}</h2><p>${escape(item.filename)}</p><p>${escape(item.detail)}</p>${item.kind==='snd'?`<audio controls preload="metadata" src="${escape(item.media)}"></audio>`:`<div class="image"><img alt="${escape(item.identity)}" src="${escape(item.media)}"></div>`}</section>`;
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; media-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'"><style>body{font:var(--vscode-font-size) var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);margin:16px}h1{font-size:20px}h2{font-size:16px}p{overflow-wrap:anywhere;color:var(--vscode-descriptionForeground)}main{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}section{border:1px solid var(--vscode-panel-border);padding:12px;min-width:0}.image{overflow:auto;min-height:260px;background:repeating-conic-gradient(#303030 0% 25%,#404040 0% 50%) 0/20px 20px;display:flex;align-items:center;justify-content:center}img{image-rendering:pixelated;max-width:100%;object-fit:contain}audio{width:100%}@media(max-width:650px){main{grid-template-columns:1fr}}button{font:inherit;padding:6px;color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:1px solid var(--vscode-button-border)}button:focus-visible{outline:2px solid var(--vscode-focusBorder)}</style></head><body><h1>Compare ${primary.kind==='snd'?'sounds':'sprites'}</h1><p>Each side is a frozen snapshot with its source described below. ${primary.kind==='snd'?'Sound snapshots use saved archive audio. Play one side at a time.':'Sprite viewer previews include visible unsaved changes, palette, axes and overlays.'} Replace or clear the reference through Compare in a viewer.</p><button id="swap">Swap primary and reference</button><main>${side('Primary',primary)}${side('Reference',reference)}</main><script nonce="${nonce}">const vscode=acquireVsCodeApi();vscode.setState({kind:${JSON.stringify(primary.kind)}});document.getElementById('swap').onclick=()=>vscode.postMessage({type:'swap'});for(const player of document.querySelectorAll('audio'))player.onplay=()=>{for(const other of document.querySelectorAll('audio'))if(other!==player)other.pause();};${require('./viewer_close').clientScript()}</script></body></html>`;
}
async function openComparison(filename,kind,selection,options={}){
  const vscode=require('vscode');
  await ready;
  if(!['air','sff','snd'].includes(kind))return vscode.window.showInformationMessage('Comparison is available from AIR, SFF and SND.');
  const pinned=references.get(kind),choices=[{label:'Pin selected item as reference',action:'pin'}];
  if(pinned)choices.push({label:'Compare selected item with reference',description:pinned.identity+' · '+pinned.filename,action:'compare'},{label:'Clear pinned reference',action:'clear'});
  const choice=await vscode.window.showQuickPick(choices,{title:kind.toUpperCase()+' comparison · pinned snapshots',matchOnDescription:true});if(!choice)return;
  if(choice.action==='clear'){if(store)await store.write(kind,undefined);references.delete(kind);panels.get(kind)?.panel.dispose();return;}
  if(options.requirePreview&&!options.preview)throw Error('Wait for the selected sprite preview to finish loading, then choose Compare again.');
  const selected=kind==='air'?await animationSnapshot(filename,selection):snapshot(filename,kind,selection,options.preview);
  if(!selected)return;
  if(choice.action==='pin'){const existing=panels.get(kind);await persist(kind,existing?.primary,selected);references.set(kind,selected);if(existing){existing.reference=selected;render(existing);}vscode.window.showInformationMessage('Pinned '+selected.identity+' from '+path.basename(filename)+'. Select another item and choose Compare.');return;}
  if(!pinned)return;
  await persist(kind,selected,pinned);
  let record=panels.get(kind);
  if(!record){
    const panel=trackViewerPanel(vscode.window.createWebviewPanel('ikemenComparison','Compare · '+kind.toUpperCase(),preferredViewerColumn(vscode.ViewColumn.Beside),{enableScripts:true,retainContextWhenHidden:true}));record=attachPanel(panel,kind,selected,pinned);
  }else{record.primary=selected;record.reference=pinned;record.panel.reveal(undefined,false);}
  render(record);return record.panel;
}
function attachPanel(panel,kind,primary,reference){
  const record={panel,primary,reference};panels.set(kind,record);
  panel.webview.onDidReceiveMessage(async message=>{if(message.type!=='swap'||record.swapping)return;record.swapping=true;try{await persist(kind,record.reference,record.primary);[record.primary,record.reference]=[record.reference,record.primary];references.set(kind,record.reference);render(record);}catch(error){require('vscode').window.showWarningMessage('Could not save comparison; the previous pair is unchanged: '+error.message);}finally{record.swapping=false;}});
  panel.onDidDispose(()=>{if(panels.get(kind)===record)panels.delete(kind);});return record;
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
function render(record){record.panel.webview.html=html(record.primary,record.reference,require('crypto').randomBytes(16).toString('hex'));}
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
module.exports={snapshot,html,openComparison,animationSnapshot,registerComparison};
