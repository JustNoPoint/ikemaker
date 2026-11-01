'use strict';

const path=require('path');
const {attachedTextLayout,attachedLayoutShape}=require('./text_editor_layout');

const delay=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const exact=filename=>path.resolve(filename||'').toLowerCase();
function tabFilename(tab){const input=tab?.input;if(!input||input.viewType||input.modified||input.original||!input.uri?.fsPath)return'';return path.resolve(input.uri.fsPath);}
function admittedSet(files){return new Set((files||[]).filter(Boolean).map(exact));}
function groups(api){return [...(api.window.tabGroups?.all||[])].sort((a,b)=>a.viewColumn-b.viewColumn);}
function nativeOnly(api,files){const admitted=admittedSet(files);return admitted.size>0&&groups(api).every(group=>(group?.tabs||[]).every(tab=>{const filename=tabFilename(tab);return filename&&admitted.has(exact(filename));}));}
async function waitFor(check,timeout=1500){const deadline=Date.now()+timeout;do{if(await check())return true;await delay(10);}while(Date.now()<deadline);return false;}
function documentFor(api,filename){const wanted=exact(filename);return(api.workspace.textDocuments||[]).find(document=>!document.isClosed&&exact(document.fileName)===wanted);}
function groupHas(group,filename){const wanted=exact(filename);return(group?.tabs||[]).some(tab=>exact(tabFilename(tab))===wanted);}

async function bootstrapEmptyWorkspace(api,admitted,admittedKeys,isCurrent,options={},timeout=1500){
  const liveGroups=groups(api);
  if(liveGroups.some(group=>(group?.tabs||[]).length))return{ok:false,reason:'no-live-source'};
  const selected=options.selectedFile&&admittedKeys.has(exact(options.selectedFile))?path.resolve(options.selectedFile):admitted[0];
  if(!selected)return{ok:false,reason:'no-live-source'};
  try{await api.commands.executeCommand('workbench.action.joinAllGroups');}catch(_){return{ok:false,reason:'join-failed'};}
  if(!isCurrent())return{ok:false,reason:'superseded'};
  try{await api.commands.executeCommand('vscode.setEditorLayout',attachedTextLayout());}catch(_){return{ok:false,reason:'layout-failed'};}
  if(!await waitFor(async()=>{if(!isCurrent()||groups(api).length!==2)return false;let layout;try{layout=await api.commands.executeCommand('vscode.getEditorLayout');}catch(_){return false;}return attachedLayoutShape(layout);},timeout))return{ok:false,reason:'layout-unsettled'};
  const currentGroups=groups(api),header=currentGroups[0],native=currentGroups[1];
  if(!header||!native)return{ok:false,reason:'topology-changed'};
  const document=documentFor(api,selected)||await api.workspace.openTextDocument(api.Uri.file(selected));
  if(!document||document.isClosed||exact(document.fileName)!==exact(selected))return{ok:false,reason:'document-changed'};
  const editor=await api.window.showTextDocument(document,{viewColumn:native.viewColumn,preview:false,preserveFocus:true});
  if(!isCurrent()||editor?.document!==document||editor?.viewColumn!==native.viewColumn)return{ok:false,reason:'editor-changed'};
  if(!await waitFor(()=>{const live=groups(api);return live.length===2&&live[0]===header&&live[1]===native&&groupHas(native,selected);},timeout))return{ok:false,reason:'tab-unsettled'};
  return{ok:true,coldStart:true,headerGroup:header,nativeGroup:native,headerColumn:header.viewColumn,nativeColumn:native.viewColumn};
}

async function preserveUnrelatedGroups(api,admitted,admittedKeys,isCurrent,options={}){
  const liveGroups=groups(api),connectedGroups=liveGroups.filter(group=>(group.tabs||[]).some(tab=>admittedKeys.has(exact(tabFilename(tab)))));
  if(connectedGroups.some(group=>(group.tabs||[]).some(tab=>{const filename=tabFilename(tab);return!filename||!admittedKeys.has(exact(filename));})))return{ok:false,reason:'unsafe'};
  const selected=options.selectedFile&&admittedKeys.has(exact(options.selectedFile))?path.resolve(options.selectedFile):'',target=connectedGroups.find(group=>selected&&groupHas(group,selected))||connectedGroups[0];
  if(!target){
    const filename=selected||admitted[0];
    if(!filename)return{ok:false,reason:'no-live-source'};
    const document=documentFor(api,filename)||await api.workspace.openTextDocument(api.Uri.file(filename));
    if(!document||document.isClosed||exact(document.fileName)!==exact(filename))return{ok:false,reason:'document-changed'};
    const editor=await api.window.showTextDocument(document,{viewColumn:api.ViewColumn?.Beside??-2,preview:false,preserveFocus:true});
    if(!isCurrent()||editor?.document!==document||!Number.isInteger(editor?.viewColumn))return{ok:false,reason:'editor-changed'};
    return{ok:true,materializedSource:true,preservedUnrelated:true,headerGroup:null,nativeGroup:null,headerColumn:api.ViewColumn?.Beside??-2,nativeColumn:editor.viewColumn};
  }
  const live=[...new Map(connectedGroups.flatMap(group=>(group.tabs||[]).map(tab=>tabFilename(tab))).filter(filename=>admittedKeys.has(exact(filename))).map(filename=>[exact(filename),path.resolve(filename)])).values()],ordered=[...new Map([...live,selected].filter(Boolean).map(filename=>[exact(filename),filename])).values()];
  for(const filename of ordered){
    if(!isCurrent())return{ok:false,reason:'superseded'};
    const document=documentFor(api,filename)||await api.workspace.openTextDocument(api.Uri.file(filename));
    if(!document||document.isClosed||exact(document.fileName)!==exact(filename))return{ok:false,reason:'document-changed'};
    const editor=await api.window.showTextDocument(document,{viewColumn:target.viewColumn,preview:false,preserveFocus:true});
    if(!isCurrent()||editor?.document!==document||editor?.viewColumn!==target.viewColumn)return{ok:false,reason:'editor-changed'};
  }
  return{ok:true,preservedUnrelated:true,headerGroup:null,nativeGroup:target,headerColumn:api.ViewColumn?.Beside??-2,nativeColumn:target.viewColumn};
}

async function consolidate(api,files,isCurrent=()=>true,options={}){
  const timeout=Number.isFinite(options.timeout)&&options.timeout>=0?options.timeout:1500;
  const admitted=[...new Map((files||[]).filter(Boolean).map(filename=>[exact(filename),path.resolve(filename)])).values()],admittedKeys=admittedSet(admitted);
  if(!admitted.length||!isCurrent())return{ok:false,reason:'unsafe'};
  if(groups(api).every(group=>(group?.tabs||[]).length===0))return bootstrapEmptyWorkspace(api,admitted,admittedKeys,isCurrent,options,timeout);
  // Keep all already-open native buffers in the lower editor row, including
  // shared templates outside the current character's connected-file list.
  // This only affects layout; it does not assign them to the character.
  if(groups(api).every(group=>(group.tabs||[]).every(tab=>Boolean(tabFilename(tab))))){
    for(const group of groups(api))for(const tab of group.tabs||[]){const filename=tabFilename(tab);if(!admittedKeys.has(exact(filename))){admitted.push(filename);admittedKeys.add(exact(filename));}}
  }
  if(!nativeOnly(api,admitted))return preserveUnrelatedGroups(api,admitted,admittedKeys,isCurrent,options);
  const live=[...new Map(groups(api).flatMap(group=>(group.tabs||[]).map(tab=>tabFilename(tab))).filter(filename=>admittedKeys.has(exact(filename))).map(filename=>[exact(filename),path.resolve(filename)])).values()],selected=options.selectedFile&&admittedKeys.has(exact(options.selectedFile))?path.resolve(options.selectedFile):'';
  const ordered=[...new Map([...live,selected].filter(Boolean).map(filename=>[exact(filename),filename])).values()];
  if(!ordered.length)return{ok:false,reason:'no-live-source'};
  try{await api.commands.executeCommand('workbench.action.joinAllGroups');}catch(_){return{ok:false,reason:'join-failed'};}
  if(!await waitFor(()=>isCurrent()&&groups(api).length===1&&nativeOnly(api,admitted),timeout))return{ok:false,reason:'join-unsettled'};
  try{await api.commands.executeCommand('vscode.setEditorLayout',attachedTextLayout());}catch(_){return{ok:false,reason:'layout-failed'};}
  if(!await waitFor(async()=>{if(!isCurrent()||groups(api).length!==2||!nativeOnly(api,admitted))return false;let layout;try{layout=await api.commands.executeCommand('vscode.getEditorLayout');}catch(_){return false;}return attachedLayoutShape(layout);},timeout))return{ok:false,reason:'layout-unsettled'};
  for(const filename of ordered){
    if(!isCurrent())return{ok:false,reason:'superseded'};
    const currentGroups=groups(api),target=currentGroups[1];if(currentGroups.length!==2||!target)return{ok:false,reason:'topology-changed'};
    const document=documentFor(api,filename)||await api.workspace.openTextDocument(api.Uri.file(filename));
    if(!document||document.isClosed||exact(document.fileName)!==exact(filename))return{ok:false,reason:'document-changed'};
    const editor=await api.window.showTextDocument(document,{viewColumn:target.viewColumn,preview:false,preserveFocus:true});
    if(!isCurrent()||editor?.document!==document||editor?.viewColumn!==target.viewColumn)return{ok:false,reason:'editor-changed'};
    if(!await waitFor(()=>{const live=groups(api);return live.length===2&&live.includes(target)&&groupHas(target,filename);},timeout))return{ok:false,reason:'tab-unsettled'};
  }
  let currentGroups=groups(api),header=currentGroups[0],native=currentGroups[1];
  if(currentGroups.length!==2||!header||!native||!ordered.every(filename=>groupHas(native,filename)))return{ok:false,reason:'native-incomplete'};
  const duplicates=(header.tabs||[]).filter(tab=>{const filename=tabFilename(tab);return filename&&groupHas(native,filename);});
  if(duplicates.length){
    if(typeof api.window.tabGroups?.close!=='function')return{ok:false,reason:'duplicates-unclosable'};
    try{if(!await api.window.tabGroups.close(duplicates))return{ok:false,reason:'duplicates-unclosed'};}catch(_){return{ok:false,reason:'duplicates-unclosed'};}
    if(!await waitFor(()=>{const live=groups(api);return live.length===2&&!live[0].tabs?.some(tab=>Boolean(tabFilename(tab)))&&ordered.every(filename=>groupHas(live[1],filename));},timeout))return{ok:false,reason:'duplicates-unsettled'};
  }
  currentGroups=groups(api);header=currentGroups[0];native=currentGroups[1];
  if(!isCurrent()||currentGroups.length!==2||(header.tabs||[]).some(tab=>Boolean(tabFilename(tab)))||!ordered.every(filename=>groupHas(native,filename)))return{ok:false,reason:'final-topology'};
  return{ok:true,headerGroup:header,nativeGroup:native,headerColumn:header.viewColumn,nativeColumn:native.viewColumn};
}

// Place the header before removing duplicate native tabs: otherwise VS Code
// can collapse the empty header group and renumber columns mid-transition.
async function attachHeaderLayout(api,panel,selectedFile){
  if(!panel||!api.window.tabGroups?.all||!api.window.tabGroups?.close)return false;
  const files=[...new Map(groups(api).flatMap(group=>(group.tabs||[]).map(tabFilename)).filter(Boolean).concat(selectedFile||[]).map(filename=>[exact(filename),filename])).values()];
  await api.commands.executeCommand('workbench.action.joinAllGroups');
  await api.commands.executeCommand('vscode.setEditorLayout',attachedTextLayout());
  panel.reveal(1,true);
  const headerReady=()=>groups(api).find(group=>group.viewColumn===1)?.tabs?.some(tab=>String(tab.input?.viewType||'').replace(/^mainThreadWebview-/,'')==='ikemenTextCompanion');
  if(!await waitFor(headerReady))throw new Error('Code Navigation did not finish moving to the upper group.');
  for(const filename of files){
    const document=documentFor(api,filename)||await api.workspace.openTextDocument(api.Uri.file(filename));
    await api.window.showTextDocument(document,{viewColumn:2,preview:false,preserveFocus:true});
  }
  const header=groups(api).find(group=>group.viewColumn===1),native=groups(api).find(group=>group.viewColumn===2);
  if(!header||!native)return false;
  const duplicates=(header.tabs||[]).filter(tab=>{const filename=tabFilename(tab);return filename&&groupHas(native,filename);});
  if(duplicates.length&&!await api.window.tabGroups.close(duplicates))return false;
  // reveal() is asynchronous in VS Code. Do not let duplicate cleanup remove
  // its destination before the header tab has actually arrived there.
  if(!await waitFor(()=>headerReady()&&groups(api).length===2))throw new Error('Text header groups did not settle.');
  await api.commands.executeCommand('vscode.setEditorLayout',attachedTextLayout());
  if(selectedFile){const document=documentFor(api,selectedFile)||await api.workspace.openTextDocument(api.Uri.file(selectedFile));await api.window.showTextDocument(document,{viewColumn:2,preview:false,preserveFocus:false});}
  return true;
}

module.exports={attachHeaderLayout,tabFilename,nativeOnly,bootstrapEmptyWorkspace,consolidate};
