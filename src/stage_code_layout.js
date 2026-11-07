'use strict';
const path=require('node:path');
const {attachedLayoutShape,attachedTextLayout}=require('./text_editor_layout');
const key=file=>path.resolve(file||'.').toLowerCase();
const type=tab=>String(tab?.input?.viewType||'').replace(/^mainThreadWebview-/,'');

async function prepareStageCodeLayout(api,binding,files,services={}){
 const fallback=reason=>({compact:false,reason});
 if(binding.presentation==='native')return fallback('Native-only coding presentation is selected.');
 const origin=binding.originPanel,groups=api.window.tabGroups?.all;
 if(!origin||!Number.isInteger(origin.viewColumn)||!Array.isArray(groups))return fallback('The Stage editor group could not be verified.');
 const viewerGroup=services.viewerGroup||require('./viewer_group'),tracked=viewerGroup.trackedPanels();
 if(tracked.includes(origin)&&binding.presentation!=='integrated')return fallback('The Stage owns a separate visual group. It and its drafts were kept open. Use the native editor’s IKEMaker Text Actions and Coding Assistance menus.');
 const group=groups.find(g=>g.viewColumn===origin.viewColumn),originTab=group?.tabs?.find(t=>t.isActive&&type(t)==='ikemenStageWorkspace');
 if(!originTab)return fallback('The exact Stage tab could not be verified.');
 const admitted=new Set(files.map(key));
 const currentStageTab=()=>{const stages=api.window.tabGroups.all.flatMap(g=>(g.tabs||[]).map(tab=>({g,tab}))).filter(entry=>type(entry.tab)==='ikemenStageWorkspace');return stages.length===1&&stages[0].g.viewColumn===origin.viewColumn?stages[0].tab:null;};
 const owned=(allowDirty=false)=>Boolean(currentStageTab())&&api.window.tabGroups.all.every(g=>(g.tabs||[]).every(tab=>(allowDirty||!tab.isDirty)&&(tab===currentStageTab()||type(tab)==='ikemenTextCompanion'||!type(tab)&&tab.input?.uri?.fsPath&&admitted.has(key(tab.input.uri.fsPath)))));
 if(!owned())return fallback('Other viewers or unrelated text tabs share this window.');
 let rollback=async()=>{},permission,headerPermission;
 try{
  const layout=await api.commands.executeCommand('vscode.getEditorLayout');
  if(!binding.isRetainedCurrent()||!owned())return fallback('Stage ownership or editor groups changed.');
  if(!attachedLayoutShape(layout)||origin.viewColumn!==2||!groups.find(g=>g.viewColumn===1)?.tabs?.some(t=>type(t)==='ikemenTextCompanion')){
   if(binding.presentation!=='integrated'||groups.length!==1||api.window.tabGroups.all.length!==1||!owned())return fallback('A verified compact text header is not already present. Editor groups were left unchanged.');
   const originalColumn=origin.viewColumn,originalTabs=[...groups[0].tabs];
   // Only the exact single Stage/source group is transformed. Never join other groups.
   if(!binding.isRetainedCurrent()||api.window.tabGroups.all[0].tabs.some((tab,i)=>tab!==originalTabs[i])||api.window.tabGroups.all[0].tabs.length!==originalTabs.length)return fallback('Editor tabs changed before preparing the compact header.');
   await api.commands.executeCommand('vscode.setEditorLayout',attachedTextLayout());
   const preparedLayout=await api.commands.executeCommand('vscode.getEditorLayout');
   rollback=async()=>{if(binding.isRetainedCurrent()&&owned()&&JSON.stringify(await api.commands.executeCommand('vscode.getEditorLayout'))===JSON.stringify(preparedLayout))await api.commands.executeCommand('vscode.setEditorLayout',layout);};
   if(!binding.isRetainedCurrent()||!owned()||!attachedLayoutShape(preparedLayout)){await rollback();return fallback('Editor ownership/layout changed while preparing the compact header.');}
   if(!binding.document||!api.window.showTextDocument){await rollback();return fallback('The exact source editor is required before opening coding tools.');}
   permission=viewerGroup.permitOwnedViewerColumn?.(origin,binding,2);
   const editor=await api.window.showTextDocument(binding.document,{viewColumn:2,preview:false,preserveFocus:false,selection:binding.selection});
   if(!editor||editor.document!==binding.document||editor.viewColumn!==2||!binding.isRetainedCurrent()||!owned()){await rollback();permission?.dispose();headerPermission?.dispose();return fallback('Exact source ownership changed before opening coding tools.');}
   let companion;headerPermission=viewerGroup.permitOwnedViewerColumn?.(origin,{},originalColumn);
   companion=await api.commands.executeCommand('ikemen.textToolbar.openCompanion',{files,headerColumn:1,viewColumn:2,context:binding.context});
   if(companion&&typeof companion.reveal==='function'){
    let retired=false,viewSubscription,tabsSubscription,groupsSubscription;
    const retireHeader=()=>{if(retired)return;retired=true;headerPermission?.dispose();viewSubscription?.dispose?.();tabsSubscription?.dispose?.();groupsSubscription?.dispose?.();};
    const observeMove=()=>{if(origin.viewColumn===2&&currentStageTab())retireHeader();};
    // If the bounded wait refuses, a late native move still retires row1's exemption.
    // Until then it is retained only for this exact Stage, never a global permission.
    viewSubscription=origin.onDidChangeViewState?.(()=>setTimeout(observeMove,0));
    tabsSubscription=api.window.tabGroups.onDidChangeTabs?.(()=>setTimeout(observeMove,0));
    groupsSubscription=api.window.tabGroups.onDidChangeTabGroups?.(()=>setTimeout(observeMove,0));
    const release=()=>{retireHeader();permission?.dispose();};
    origin.onDidDispose?.(release);companion.onDidDispose?.(release);
   }
   if(!companion||typeof companion.reveal!=='function'){
    await rollback();permission?.dispose();headerPermission?.dispose();
    return fallback('The coding header could not be opened. The owned layout was restored when safe.');
   }
   if(!binding.isRetainedCurrent()||!owned()||JSON.stringify(await api.commands.executeCommand('vscode.getEditorLayout'))!==JSON.stringify(preparedLayout)||!currentStageTab()){
    // A concurrent user layout belongs to the user. Retain the existing owned header,
    // release only this temporary exemption; never dispose/move their tabs to roll back it.
    permission?.dispose();headerPermission?.dispose();return fallback('Editor ownership/layout changed while opening the coding header. No further tabs were relocated.');
   }
   origin.reveal(2,true);
   // reveal is void; the native viewColumn/tab event arrives later. Keep the temporary
   // row1 exemption until the same panel is observed in row2, or reservations can
   // relocate it into a third group while the move is still in flight.
   const deadline=Date.now()+(services.settleTimeout??1000);while(binding.isRetainedCurrent()&&!(origin.viewColumn===2&&currentStageTab()&&owned())&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
   if(!binding.isRetainedCurrent()||origin.viewColumn!==2||!currentStageTab()||!owned()||JSON.stringify(await api.commands.executeCommand('vscode.getEditorLayout'))!==JSON.stringify(preparedLayout))return fallback('The Stage move or editor layout did not settle. The retained Stage and source remain open; no further layout was forced.');
   headerPermission?.dispose();companion.reveal(1,true);
   const returnCurrent=()=>typeof binding.isReturnOwnerCurrent==='function'?binding.isReturnOwnerCurrent():binding.isRetainedCurrent();
   const tabIntent=()=>JSON.stringify(api.window.tabGroups.all.map(g=>[g.viewColumn,g.tabs.map(tab=>[type(tab),tab.input?.uri?.fsPath||''])]));
   let returnSubscription,returnBusy=false,returnArmed=false,returnLayout,returnTabs;
   const notice=text=>{const notices=require('./stage_terminal_notices').createStageNotices({info:message=>api.window.showInformationMessage?.(message)});notices.info(text);notices.flush();};
   const restoreStage=async()=>{
    if(!returnArmed||returnBusy||origin.active!==true)return false;returnBusy=true;
    try{
     const actual=await api.commands.executeCommand('vscode.getEditorLayout');
     if(!returnCurrent()||origin.active!==true||!owned(true)||tabIntent()!==returnTabs||JSON.stringify(actual)!==returnLayout){notice('Stage is retained. Coding Navigation stays open because source tabs or the editor layout changed.');return false;}
     const expectedRemaining=JSON.stringify(api.window.tabGroups.all.flatMap(g=>g.tabs).filter(tab=>type(tab)!=='ikemenTextCompanion').map(tab=>[type(tab),tab.input?.uri?.fsPath||'']));
     returnArmed=false;returnSubscription?.dispose?.();companion.dispose();
     const end=Date.now()+1000;while(api.window.tabGroups.all.some(g=>g.tabs.some(tab=>type(tab)==='ikemenTextCompanion'))&&Date.now()<end)await new Promise(resolve=>setTimeout(resolve,20));
     const remaining=api.window.tabGroups.all;
     if(!returnCurrent()||!owned(true)||remaining.length!==1||JSON.stringify(remaining[0].tabs.map(tab=>[type(tab),tab.input?.uri?.fsPath||'']))!==expectedRemaining){notice('Stage is retained. Editor groups changed while closing its coding header; no layout was forced.');return false;}
     // Closing the sole owned header already auto-collapses its empty row. Do not
     // issue setEditorLayout after an await: that could overwrite a new user layout.
     if(origin.active===true&&origin.viewColumn===originalColumn)origin.reveal(originalColumn,false);
     return true;
    }catch{notice('Stage is retained. Its previous layout could not be restored safely.');return false;}finally{returnBusy=false;}
   };
   const armReturn=async()=>{if(!returnCurrent()||!owned(true))return;returnLayout=JSON.stringify(await api.commands.executeCommand('vscode.getEditorLayout'));returnTabs=tabIntent();returnArmed=true;returnSubscription=origin.onDidChangeViewState?.(event=>{if(event.webviewPanel?.active===true)void restoreStage();});companion.onDidDispose?.(()=>{returnArmed=false;returnSubscription?.dispose?.();});origin.onDidDispose?.(()=>{returnArmed=false;returnSubscription?.dispose?.();});if(origin.active===true)void restoreStage();};
   return{compact:true,headerColumn:1,nativeColumn:2,created:true,originalColumn,armReturn,restoreStage,validate:async()=>binding.isRetainedCurrent()&&owned()&&JSON.stringify(await api.commands.executeCommand('vscode.getEditorLayout'))===JSON.stringify(preparedLayout)};
  }
  return{compact:true,headerColumn:1,nativeColumn:2,validate:async()=>binding.isRetainedCurrent()&&owned()&&JSON.stringify(await api.commands.executeCommand('vscode.getEditorLayout'))===JSON.stringify(layout)};
 }catch{try{await rollback();}catch{}permission?.dispose();headerPermission?.dispose();return fallback('The compact text layout is unavailable. The owned layout was restored when safe.');}
}

async function finishStageCodeLayout(api,layout,document,selection,options){
 if(!layout.compact||layout.validate&&!await layout.validate())return null;
 const panel=await api.commands.executeCommand('ikemen.textToolbar.openCompanion',{...options,headerColumn:layout.headerColumn,viewColumn:layout.nativeColumn});
 if(!panel||typeof panel.reveal!=='function'||layout.validate&&!await layout.validate())return null;
 panel.reveal(layout.headerColumn,true);
 await api.window.showTextDocument(document,{viewColumn:layout.nativeColumn,preview:false,preserveFocus:false,selection});
 return panel;
}
module.exports={prepareStageCodeLayout,finishStageCodeLayout};
