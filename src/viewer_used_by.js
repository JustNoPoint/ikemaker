'use strict';
const fs=require('fs'),path=require('path');
const {findUsedBy}=require('./viewer_used_by_model');
const {preferredViewerColumn,trackViewerPanel}=require('./viewer_group');
function escape(text){return String(text).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function html(model,nonce) {
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'"><style>body{font:var(--vscode-font-size) var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:16px;box-sizing:border-box}h1{font-size:20px}p{overflow-wrap:anywhere}.muted{color:var(--vscode-descriptionForeground)}button,input{font:inherit;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,transparent);padding:7px}button{cursor:pointer}button:focus-visible,input:focus-visible{outline:2px solid var(--vscode-focusBorder)}#filter{width:min(480px,70%)}article{border-top:1px solid var(--vscode-panel-border);padding:12px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}button[data-line]{text-align:left;max-width:100%;overflow-wrap:anywhere}</style></head><body><h1>Used By · ${escape(model.identity)}</h1><p>${escape(model.filename)}</p><p class="muted">Character: ${escape(model.owner)} · ${model.files} source files checked</p><p><input id="filter" aria-label="Filter references" placeholder="Filter file or source text"> <button id="refresh">Refresh</button></p><p role="status" id="count">${model.matches.length} exact reference(s).</p><p>${model.unresolved} dynamic or unresolved reference(s) could not be assigned to an archive.</p>${model.diagnostics.length?'<details><summary>Configuration and missing-file details</summary><ul>'+model.diagnostics.map(item=>'<li>'+escape(item)+'</li>').join('')+'</ul></details>':''}<main>${model.matches.map((item,index)=>`<article data-search="${escape((item.filename+' '+item.text).toLowerCase())}"><button data-line="${index}">Open ${escape(path.basename(item.filename))}:${item.line+1}${item.action===undefined?'':' · Action '+item.action}</button><p class="muted">${escape(item.filename)}</p><pre>${escape(item.text)}</pre></article>`).join('')||'<p>No exact references found in the checked files.</p>'}</main><p id="empty-filter" hidden>No references match this filter.</p><script nonce="${nonce}">const vscode=acquireVsCodeApi();document.getElementById('refresh').onclick=()=>vscode.postMessage({type:'refresh'});const filter=document.getElementById('filter');filter.value=vscode.getState()?.filter||'';function applyFilter(){const q=filter.value.toLowerCase();let count=0;for(const row of document.querySelectorAll('article')){row.hidden=!row.dataset.search.includes(q);if(!row.hidden)count++;}document.getElementById('count').textContent=q?count+' of ${model.matches.length} exact reference(s) shown.':'${model.matches.length} exact reference(s).';document.getElementById('empty-filter').hidden=!!count||!q;vscode.setState({filter:filter.value});}filter.oninput=applyFilter;applyFilter();for(const button of document.querySelectorAll('[data-line]'))button.onclick=()=>vscode.postMessage({type:'source',index:Number(button.dataset.line)});${require('./viewer_close').clientScript()}</script></body></html>`;
}
async function openUsedBy(seed,kind,reference,fromPoint) {
  const vscode=require('vscode'),navigation=require('./viewer_navigation');
  if(!['air','sff','snd'].includes(kind)||!Number.isInteger(reference?.group))return vscode.window.showInformationMessage('Select an animation, sprite, or sound in its viewer to find Used By references.');
  const context=navigation.archiveContext(seed),owners=context?[context.ownerDef]:navigation.associatedDefs(seed).filter(filename=>{
    try{const {parseDef,sections,value}=require('./def_model');return !value(sections(parseDef(fs.readFileSync(filename,'utf8')),'info')[0],'prefix','');}catch{return false;}
  });
  let def=owners.length===1?owners[0]:'';
  if(owners.length>1){const picked=await vscode.window.showQuickPick(owners.map(filename=>({label:path.basename(filename),description:filename,filename})),{title:'Choose the character to search',matchOnDescription:true});if(!picked)return;def=picked.filename;}
  if(!def)def=await require('./character_picker').chooseCharacterDef(vscode.Uri.file(seed),{title:'Choose the character to search for references'});
  if(!def)return;
  const panel=trackViewerPanel(vscode.window.createWebviewPanel('ikemenUsedBy','Used By · '+path.basename(seed),preferredViewerColumn(vscode.ViewColumn.Beside),{enableScripts:true,retainContextWhenHidden:true}));
  const nonce=require('crypto').randomBytes(16).toString('hex');let model;
  const refresh=()=>{
    const read=filename=>vscode.workspace.textDocuments.find(doc=>path.resolve(doc.fileName).toLowerCase()===path.resolve(filename).toLowerCase())?.getText()??fs.readFileSync(filename,'utf8');
    const assets=require('./related_work').resolveAssigned(def,read(def)),registry=navigation.archiveRegistry(def),diagnostics=[...registry.diagnostics],documents=[];
    const sources=[...assets.code,assets.air,...registry.candidates.map(item=>item.air),...(registry.commonSources||[])].filter(Boolean);
    assets.extraAir=(registry.commonSources||[]).filter(file=>/\.air$/i.test(file));
    for(const filename of new Map(sources.map(file=>[path.resolve(file).toLowerCase(),file])).values())try{documents.push({filename,text:read(filename)});}catch(error){diagnostics.push('Cannot read '+filename+': '+error.message);}
    let constants=new Map();
    for(const filename of [...(registry.commonSources||[]).filter(file=>/\.const$/i.test(file)),assets.constants].filter(Boolean))try{for(const [name,record] of require('./move_constants_model').parseConstants(read(filename)).byName)constants.set(name,record);}catch(error){diagnostics.push('Constants: '+error.message);}
    model={...findUsedBy({documents,assets,registry,constants,target:{filename:seed,kind},reference}),diagnostics,filename:seed,owner:def,identity:kind.toUpperCase()+' '+reference.group+(reference.number===undefined?'':','+reference.number)};
    panel.webview.html=html(model,nonce);
  };
  panel.webview.onDidReceiveMessage(async message=>{
    try{if(message.type==='refresh')refresh();else if(message.type==='source'&&Number.isInteger(message.index)&&model.matches[message.index])await navigation.openReferenceSource(model.matches[message.index],fromPoint);}
    catch(error){vscode.window.showErrorMessage('Used By: '+error.message);}
  });
  try{refresh();return panel;}catch(error){panel.dispose();throw error;}
}
module.exports={html,openUsedBy};
