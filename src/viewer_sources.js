'use strict';
const fs=require('fs'),path=require('path');
const {preferredViewerColumn,trackViewerPanel}=require('./viewer_group');
const panels=new Map();
const key=file=>path.resolve(file).toLowerCase();
const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function matchingLines(text,reference){
  if(typeof reference?.id!=='string'||!reference.id)return [];
  const prefix=reference.id.toLowerCase();
  return String(text).split(/\r?\n/).flatMap((line,index)=>line.toLowerCase().includes(prefix)?[index]:[]);
}
function html(owner,files,nonce,fromPoint){
  const metadata=JSON.stringify({owner,files,fromPoint:fromPoint?{filename:fromPoint.filename,kind:fromPoint.kind,reference:fromPoint.reference}:undefined}).replace(/</g,'\\u003c');
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'"><style>
  body{font:var(--vscode-font-size) var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);margin:0;display:flex;flex-direction:column;height:100vh}header{padding:10px 12px;border-bottom:1px solid var(--vscode-panel-border);flex:0 0 auto;max-height:50vh;overflow:auto;box-sizing:border-box}h1{font-size:18px;margin:0 0 8px}p{overflow-wrap:anywhere;margin:6px 0}nav,.actions{display:flex;gap:6px;flex-wrap:wrap}button,input{font:inherit;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,transparent);padding:6px;min-height:28px}button:focus-visible,input:focus-visible{outline:2px solid var(--vscode-focusBorder)}button[aria-pressed=true]{outline:1px solid var(--vscode-focusBorder)}main{overflow:auto;flex:1;min-height:0}pre{margin:0;font:var(--vscode-editor-font-size,13px) var(--vscode-editor-font-family,monospace)}.line{display:block;white-space:pre;min-height:1.4em}.line button{font:inherit;min-width:4em;padding:0 8px;border:0;background:transparent;color:var(--vscode-descriptionForeground);text-align:right}.match{background:var(--vscode-editor-findMatchHighlightBackground)}.owner{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}nav{flex-wrap:nowrap;overflow-x:auto;padding:3px 2px;margin:6px 0}nav button{flex:0 0 auto;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}details{margin:6px 0}summary{cursor:pointer;color:var(--vscode-descriptionForeground)}summary:focus-visible{outline:2px solid var(--vscode-focusBorder)}#filename{color:var(--vscode-descriptionForeground)}#search{max-width:100%;box-sizing:border-box}
  </style></head><body><header><h1>Pinned Sources</h1><p class="owner" title="${escape(owner)}">Character: ${escape(path.basename(owner))}</p><nav aria-label="Pinned source files">${files.map((file,index)=>`<button data-file="${index}" title="${escape(file)}" aria-pressed="false">${escape(path.basename(file))}</button>`).join('')}</nav><details id="locations"><summary>Source locations</summary><p>Character: ${escape(owner)}</p><p id="filename"></p></details><div class="actions"><button id="editor">Open Text Editor</button><button id="refresh">Refresh</button><label><input id="follow" type="checkbox" checked> Follow selected move</label><input id="search" aria-label="Find in pinned source" placeholder="Find text"><button id="next">Next Match</button></div><p id="status" role="status">Choose a pinned source.</p></header><main tabindex="0" aria-label="Source text"><pre id="code"></pre></main><script nonce="${nonce}">
  const vscode=acquireVsCodeApi(),state=vscode.getState()||{};let metadata=${metadata},index=Number.isInteger(state.index)&&state.index>=0&&state.index<${files.length}?state.index:0,lines=[],matches=[],activeLine=0,positions=state.positions||{},unavailable=false;
  const locations=document.getElementById('locations');locations.open=state.locationsExpanded===true;locations.ontoggle=()=>save();
  const follow=document.getElementById('follow'),search=document.getElementById('search');follow.checked=state.follow!==false;search.value=state.search||'';
  function save(){vscode.setState({...metadata,index,follow:follow.checked,search:search.value,positions,locationsExpanded:locations.open});}
  const main=document.querySelector('main');main.onscroll=()=>{if(unavailable)return;positions[index]={top:main.scrollTop,left:main.scrollLeft,line:activeLine};save();};function select(file,restorePosition=false){index=file;save();vscode.postMessage({type:'select',index,follow:follow.checked,restorePosition});}
  function mark(){const query=search.value.toLowerCase();matches=[];for(const [i,line] of lines.entries()){const match=query&&line.toLowerCase().includes(query);document.getElementById('line-'+i)?.classList.toggle('match',!!match);if(match)matches.push(i);}save();}
  function focusLine(line){activeLine=line;document.getElementById('line-'+line)?.scrollIntoView({block:'center'});}
  for(const button of document.querySelectorAll('[data-file]'))button.onclick=()=>select(Number(button.dataset.file));
  follow.onchange=()=>{save();select(index);};search.oninput=mark;document.getElementById('next').onclick=()=>{if(matches.length)focusLine(matches.find(line=>line>activeLine)??matches[0]);};
  document.getElementById('refresh').onclick=()=>select(index);document.getElementById('editor').onclick=()=>vscode.postMessage({type:'editor',index,line:activeLine});
  addEventListener('message',event=>{const m=event.data;if(m.type!=='source')return;metadata.fromPoint=m.fromPoint;index=m.index;unavailable=!!m.error;lines=m.error?[]:m.text.split(/\\r?\\n/);document.getElementById('editor').disabled=!!m.error;document.getElementById('filename').textContent=m.filename;document.getElementById('status').textContent=m.status;const code=document.getElementById('code');code.replaceChildren();for(const [i,text] of lines.entries()){const row=document.createElement('span');row.className='line';row.id='line-'+i;const button=document.createElement('button');button.textContent=String(i+1);button.setAttribute('aria-label','Open source line '+(i+1));button.onclick=()=>vscode.postMessage({type:'editor',index,line:i});row.append(button,document.createTextNode(text));code.append(row);}for(const button of document.querySelectorAll('[data-file]'))button.setAttribute('aria-pressed',String(Number(button.dataset.file)===index));mark();if(m.jump&&follow.checked)focusLine(m.line||0);else if(positions[index]){main.scrollTop=positions[index].top||0;main.scrollLeft=positions[index].left||0;activeLine=Math.min(positions[index].line||0,lines.length-1);}else focusLine(m.line||0);save();});select(index,!!positions[index]);
  ${require('./viewer_close').clientScript()}</script></body></html>`;
}
async function openSources(seed,fromPoint){
  const vscode=require('vscode'),navigation=require('./viewer_navigation');
  let owner=navigation.archiveContext(seed)?.ownerDef;
  if(!owner){const owners=navigation.associatedDefs(seed);if(owners.length===1)owner=owners[0];}
  if(!owner)owner=await require('./character_picker').chooseCharacterDef(vscode.Uri.file(seed),{title:'Choose the character for pinned sources'});
  if(!owner)return;
  const read=file=>vscode.workspace.textDocuments.find(doc=>key(doc.fileName)===key(file))?.getText()??fs.readFileSync(file,'utf8');
  const assets=require('./related_work').resolveAssigned(owner,read(owner)),registry=navigation.archiveRegistry(owner);
  const files=[...new Map([assets.constants,...assets.code,...(registry.commonSources||[])].filter(file=>file&&!/\.(air|sff|snd)$/i.test(file)).map(file=>[key(file),file])).values()];
  if(!files.length)return vscode.window.showInformationMessage('No assigned source files were found for this character.');
  const chosen=await vscode.window.showQuickPick(files.map(file=>({label:path.basename(file),description:file,picked:file===assets.constants,filename:file})),{title:'Pin constants, common code, or functions',canPickMany:true,matchOnDescription:true});
  if(!chosen?.length)return;
  return attachSources(owner,chosen.map(item=>item.filename),fromPoint);
}
function attachSources(owner,selected,fromPoint,restoredPanel){
  const vscode=require('vscode'),navigation=require('./viewer_navigation');
  const read=file=>vscode.workspace.textDocuments.find(doc=>key(doc.fileName)===key(file))?.getText()??fs.readFileSync(file,'utf8');
  const identity=key(owner)+'\n'+selected.map(key).sort().join('\n');
  if(panels.has(identity)){const existing=panels.get(identity);if(restoredPanel){if(restoredPanel!==existing.panel)restoredPanel.dispose();return existing.panel;}existing.fromPoint=fromPoint;existing.panel.reveal(undefined,false);existing.refresh();return existing.panel;}
  const panel=trackViewerPanel(restoredPanel||vscode.window.createWebviewPanel('ikemenPinnedSources','Pinned Sources · '+path.basename(owner),preferredViewerColumn(vscode.ViewColumn.Beside),{enableScripts:true,retainContextWhenHidden:true}));
  panel.webview.options={...panel.webview.options,enableScripts:true};
  const entry={panel,fromPoint,refresh:null,follow:true};let current=0,follow=true,snapshot='';
  const refresh=(jump=false)=>{snapshot=null;try{snapshot=read(selected[current]);const matches=follow?matchingLines(snapshot,entry.fromPoint?.reference):[];panel.webview.postMessage({type:'source',jump,index:current,filename:selected[current],text:snapshot,fromPoint:entry.fromPoint?{filename:entry.fromPoint.filename,kind:entry.fromPoint.kind,reference:entry.fromPoint.reference}:undefined,line:matches[0]||0,status:(vscode.workspace.textDocuments.find(doc=>key(doc.fileName)===key(selected[current]))?.isDirty?'Unsaved source · ':'')+(follow&&entry.fromPoint?.reference?.id?(matches.length?matches.length+' text match(es) for '+entry.fromPoint.reference.id:'No direct text match for '+entry.fromPoint.reference.id):'Read-only preview · open the text editor to edit.')});}catch(error){panel.webview.postMessage({type:'source',error:true,jump:false,index:current,filename:selected[current],text:'',status:'Source unavailable: '+error.message});}};
  entry.refresh=refresh;panels.set(identity,entry);
  panel.webview.onDidReceiveMessage(async message=>{try{
    if(message.type==='select'&&Number.isInteger(message.index)&&selected[message.index]){current=message.index;follow=message.follow!==false;entry.follow=follow;refresh(message.restorePosition!==true);}
    if(message.type==='editor'&&message.index===current&&Number.isInteger(message.line)&&message.line>=0&&snapshot!==null){const lines=snapshot.split(/\r?\n/);if(message.line<lines.length)await navigation.openReferenceSource({filename:selected[current],line:message.line,text:lines[message.line]},entry.fromPoint);}
  }catch(error){vscode.window.showErrorMessage('Pinned Sources: '+error.message);}});
  const changes=vscode.workspace.onDidChangeTextDocument(event=>{if(key(event.document.fileName)===key(selected[current]))refresh();});
  const watchers=[];
  if(vscode.workspace.createFileSystemWatcher&&vscode.RelativePattern)for(const directory of new Set(selected.map(file=>path.dirname(file)))){
    const watcher=vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(directory,'*'));
    const update=uri=>{if(key(uri.fsPath)===key(selected[current]))refresh();};
    watcher.onDidChange(update);watcher.onDidCreate(update);watcher.onDidDelete(update);watchers.push(watcher);
  }
  let visibility, initialized=false, closed=false;
  panel.onDidDispose(()=>{closed=true;visibility?.dispose();changes.dispose();for(const watcher of watchers)watcher.dispose();panels.delete(identity);});
  const initialize=()=>{if(initialized||closed)return;initialized=true;visibility?.dispose();visibility=null;panel.webview.html=html(owner,selected,require('crypto').randomBytes(16).toString('hex'),entry.fromPoint);};
  // A restored panel in a collapsed group has no usable viewport yet. Build its
  // document on first visibility, keeping VS Code's saved webview state intact.
  if(restoredPanel&&panel.visible===false&&panel.onDidChangeViewState){visibility=panel.onDidChangeViewState(event=>{if(event.webviewPanel.visible)initialize();});}
  else initialize();
  return panel;
}
function restoreSources(panel,state){
  if(typeof state?.owner!=='string'||!path.isAbsolute(state.owner)||!Array.isArray(state.files)||!state.files.length||state.files.some(file=>typeof file!=='string'||!path.isAbsolute(file))){panel.dispose();return;}
  const point=state.fromPoint&&typeof state.fromPoint.filename==='string'&&path.isAbsolute(state.fromPoint.filename)?state.fromPoint:undefined;
  return attachSources(state.owner,[...new Set(state.files)],point,panel);
}
function registerSources(context){context.subscriptions.push(require('vscode').window.registerWebviewPanelSerializer('ikemenPinnedSources',{deserializeWebviewPanel:restoreSources}));}
function followSelection(point){for(const entry of panels.values())if(point?.filename&&entry.fromPoint?.filename&&key(entry.fromPoint.filename)===key(point.filename)){entry.fromPoint=point;if(entry.follow)entry.refresh(true);}}
module.exports={html,matchingLines,openSources,followSelection,restoreSources,registerSources};
