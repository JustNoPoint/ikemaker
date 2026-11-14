'use strict';
const path=require('path');
const {leafPaths}=require('./text_dropdown_layout');
const {tabFilename}=require('./text_transition_layout');
const key=filename=>path.resolve(filename||'.').toLowerCase();
async function waitFor(check){const deadline=Date.now()+1500;do{if(check())return true;await new Promise(resolve=>setTimeout(resolve,10));}while(Date.now()<deadline);return false;}
async function retainOriginWithSource(api,originGroup,files,selectedFile){
 const filename=selectedFile||files?.[0];
 if(!filename||!path.isAbsolute(filename)||!(files||[]).some(item=>key(item)===key(filename)))throw Error('The requested source is not part of the connected text editor.');
 const before=[...(api.window.tabGroups?.all||[])];
 if(!before.includes(originGroup))throw Error('The originating editor group changed.');
 const document=(api.workspace.textDocuments||[]).find(item=>!item.isClosed&&key(item.fileName)===key(filename))||await api.workspace.openTextDocument(api.Uri.file(filename));
 if(document.isClosed||key(document.fileName)!==key(filename))throw Error('The requested source changed before opening.');
 const editor=await api.window.showTextDocument(document,{viewColumn:originGroup.viewColumn,preview:false,preserveFocus:false});
 const current=api.window.tabGroups.all||[];
 if(current.length!==before.length||before.some((group,index)=>current[index]!==group)||editor?.document!==document||editor?.viewColumn!==originGroup.viewColumn)throw Error('The editor groups changed before the Text Editor handoff. Existing tabs were retained.');
 return document;
}
// EditorLayout children alternate orientation; leaf order is ViewColumn order.
// Split only the originating region, preserving every other leaf and its size.
function splitOriginLayout(layout,column){
 const result=JSON.parse(JSON.stringify(layout)),paths=leafPaths(result),target=paths[column-1];
 if(!target||![0,1].includes(result.orientation))throw Error('The originating editor layout is unavailable.');
 let parent=result,orientation=result.orientation;
 for(const index of target.slice(0,-1)){parent=parent.groups[index];orientation=1-orientation;}
 const index=target.at(-1),leaf=parent.groups[index],size=Number(leaf.size);
 if(orientation===0)parent.groups[index]={...leaf,groups:[{size:.28},{size:.72}]};
 else{if(!Number.isFinite(size)||size<=0)throw Error('The originating editor size is unavailable.');parent.groups.splice(index,1,{size:size*.28},{size:size*.72});}
 return{layout:result,headerColumn:column,nativeColumn:column+1};
}
async function prepareOriginTextLayout(api,originGroup,selectedFile,isCurrent=()=>true){
 const before=[...(api.window.tabGroups?.all||[])].sort((a,b)=>a.viewColumn-b.viewColumn);
 if(!before.includes(originGroup)||!isCurrent())throw Error('The originating editor group changed. Open the Text Editor again.');
 const snapshots=before.map(group=>({group,tabs:[...(group.tabs||[])]}));
 const layout=await api.commands.executeCommand('vscode.getEditorLayout');
 const unchanged=()=>isCurrent()&&snapshots.every(({group,tabs})=>(api.window.tabGroups.all||[]).includes(group)&&tabs.length===(group.tabs||[]).length&&tabs.every((tab,index)=>group.tabs[index]===tab));
 if(!unchanged()||leafPaths(layout).length!==before.length)throw Error('The editor tabs changed while preparing the Text Editor. Nothing was closed.');
 const prepared=splitOriginLayout(layout,before.indexOf(originGroup)+1);
 const document=(api.workspace.textDocuments||[]).find(item=>!item.isClosed&&key(item.fileName)===key(selectedFile))||await api.workspace.openTextDocument(api.Uri.file(selectedFile));
 if(!isCurrent()||document.isClosed||key(document.fileName)!==key(selectedFile))throw Error('The requested text source changed during the handoff.');
 const focused=await api.window.showTextDocument(document,{viewColumn:originGroup.viewColumn,preview:false,preserveFocus:false});
 if(!isCurrent()||focused?.document!==document||focused?.viewColumn!==originGroup.viewColumn)throw Error('The originating text region could not be focused.');
 const focusedGroups=[...(api.window.tabGroups.all||[])].sort((a,b)=>a.viewColumn-b.viewColumn);
 if(focusedGroups.length!==before.length||focusedGroups.some((group,index)=>group!==before[index])||snapshots.some(({group,tabs})=>tabs.some(tab=>!group.tabs.includes(tab))||group.tabs.some(tab=>!tabs.includes(tab)&&!(group===originGroup&&key(tabFilename(tab))===key(selectedFile)))))throw Error('The editor tabs changed before the attached text region opened.');
 for(const snapshot of snapshots)snapshot.tabs=[...snapshot.group.tabs];
 // setEditorLayout alone appends groups in grid order. Insert below the focused
 // source first so applying the nested layout cannot shift another group's tabs.
 let insertedGroup=null;
 try{
 await api.commands.executeCommand('workbench.action.newGroupBelow');
 if(!await waitFor(()=>{const inserted=[...(api.window.tabGroups.all||[])].sort((a,b)=>a.viewColumn-b.viewColumn),exactInsertion=inserted.length===before.length+1&&snapshots.every(({group,tabs},index)=>inserted[index+(index>before.indexOf(originGroup)?1:0)]===group&&tabs.length===group.tabs.length&&tabs.every((tab,tabIndex)=>group.tabs[tabIndex]===tab));if(exactInsertion)insertedGroup=inserted[prepared.nativeColumn-1];return isCurrent()&&exactInsertion;}))throw Error('The attached text group did not open below the originating region. Existing tabs were retained.');
 await api.commands.executeCommand('vscode.setEditorLayout',prepared.layout);
 let after;
 if(!await waitFor(()=>{after=[...(api.window.tabGroups.all||[])].sort((a,b)=>a.viewColumn-b.viewColumn);return isCurrent()&&after.length===before.length+1&&after[prepared.nativeColumn-1]===insertedGroup&&snapshots.every(({group,tabs},index)=>{const target=after[index+(index>before.indexOf(originGroup)?1:0)];return target===group&&tabs.length===target.tabs.length&&tabs.every((tab,tabIndex)=>target.tabs[tabIndex]===tab);});}))throw Error('The editor layout changed during the Text Editor handoff. Existing tabs were retained.');
 const header=after[prepared.headerColumn-1],native=after[prepared.nativeColumn-1];
 const editor=await api.window.showTextDocument(document,{viewColumn:native.viewColumn,preview:false,preserveFocus:false});
 if(!isCurrent()||editor?.document!==document||editor?.viewColumn!==native.viewColumn)throw Error('The requested text editor did not open in its prepared group.');
 return{...prepared,headerGroup:header,nativeGroup:native,document};
 }catch(error){
  // Only our still-empty inserted group may be closed on interruption. Never
  // close a user-filled group, a diff, or any group from the original snapshot.
  if(insertedGroup&&(api.window.tabGroups.all||[]).includes(insertedGroup)&&(insertedGroup.tabs||[]).length===0&&typeof api.window.tabGroups.close==='function')await api.window.tabGroups.close(insertedGroup,true);
  throw error;
 }
}
async function finishOriginTextLayout(api,panel,prepared,selectedFile){
 const groups=api.window.tabGroups.all||[];
 if(!groups.includes(prepared.headerGroup)||!groups.includes(prepared.nativeGroup))throw Error('The attached text groups changed before the header opened.');
 panel.reveal(prepared.headerGroup.viewColumn,true);
 if(!await waitFor(()=>prepared.headerGroup.tabs.some(tab=>String(tab.input?.viewType||'').replace(/^mainThreadWebview-/,'')==='ikemenTextCompanion')))throw Error('Code Navigation did not finish opening above the text editor.');
 // Remove only duplicate native tabs of this exact source, never custom/diff tabs.
 const duplicates=prepared.headerGroup.tabs.filter(tab=>key(tabFilename(tab))===key(selectedFile));
 if(duplicates.length&&await api.window.tabGroups.close(duplicates)!==true)throw Error('The source opened, but its duplicate tab could not be removed.');
 await api.window.showTextDocument(prepared.document,{viewColumn:prepared.nativeGroup.viewColumn,preview:false,preserveFocus:false});
 return true;
}
module.exports={retainOriginWithSource,splitOriginLayout,prepareOriginTextLayout,finishOriginTextLayout};
