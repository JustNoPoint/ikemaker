'use strict';
const assert=require('assert');
const path=require('path');
const transition=require('../src/text_transition_layout');

const uri=fsPath=>({fsPath:path.resolve(fsPath)});
const tab=filename=>({input:{uri:uri(filename)},label:path.basename(filename)});
const document=filename=>({fileName:path.resolve(filename),uri:uri(filename),isClosed:false,isDirty:true,saveCalls:0,async save(){this.saveCalls++;return true;}});

(async()=>{
  const common=document('C:/chars/Ryu/common.zss'),def=document('C:/chars/Ryu/Ryu.def'),closed='C:/chars/Ryu/closed-but-connected.zss',calls=[];let openCalls=0;
  const state={layout:{orientation:0,groups:[{size:.5},{size:.5}]},groups:[{viewColumn:1,tabs:[tab(common.fileName)]},{viewColumn:2,tabs:[tab(def.fileName)]}]};
  const api={
    Uri:{file:uri},workspace:{textDocuments:[common,def],async openTextDocument(){openCalls++;throw new Error('live dirty documents must be reused');}},
    commands:{async executeCommand(id,arg){calls.push(id);if(id==='workbench.action.joinAllGroups'){state.groups=[{viewColumn:1,tabs:state.groups.flatMap(group=>group.tabs)}];return;}if(id==='vscode.setEditorLayout'){state.layout=arg;state.groups=[{viewColumn:1,tabs:[...state.groups[0].tabs]},{viewColumn:2,tabs:[...(state.groups[1]?.tabs||[])]}];return;}if(id==='vscode.getEditorLayout')return state.layout;}},
    window:{
      tabGroups:{get all(){return state.groups;},async close(tabs){calls.push('close-duplicates');const closing=new Set(tabs);for(const group of state.groups)group.tabs=group.tabs.filter(item=>!closing.has(item));return true;}},
      async showTextDocument(doc,options){calls.push(`show:${path.basename(doc.fileName)}`);const target=state.groups.find(group=>group.viewColumn===options.viewColumn);target.tabs.push(tab(doc.fileName));return{document:doc,viewColumn:target.viewColumn};}
    }
  };
  const result=await transition.consolidate(api,[def.fileName,closed],()=>true,{timeout:30});
  assert.strictEqual(result.ok,true,'connected and unrelated native buffers consolidate into the canonical text workspace');
  assert.deepStrictEqual(calls.slice(0,2),['workbench.action.joinAllGroups','vscode.setEditorLayout'],'native groups join before the two-row layout is created');
  assert(calls.indexOf('close-duplicates')>calls.indexOf('show:Ryu.def'),'header duplicates close only after every live document is present below');
  assert.strictEqual(state.groups.length,2);assert.strictEqual(state.groups[0].tabs.length,0,'the header row is empty before Code Navigation attaches');
  assert.deepStrictEqual(state.groups[1].tabs.map(transition.tabFilename).map(value=>value.toLowerCase()).sort(),[common.fileName,def.fileName].map(value=>path.resolve(value).toLowerCase()).sort());
  assert.strictEqual(common.isDirty,true);assert.strictEqual(def.isDirty,true);assert.strictEqual(common.saveCalls+def.saveCalls,0,'dirty buffers remain the same unsaved live documents');
  assert.strictEqual(openCalls,0,'an admitted but previously closed connected file is not materialized as a new tab');

  const headerTab={label:'IKEMaker Code Navigation',input:{viewType:'mainThreadWebview-ikemenTextCompanion'}};
  state.groups.push({viewColumn:3,tabs:[headerTab]},{viewColumn:4,tabs:[]});
  const headerPanel={reveal(column){for(const group of state.groups)group.tabs=group.tabs.filter(tab=>tab!==headerTab);setTimeout(()=>state.groups.find(group=>group.viewColumn===column).tabs.push(headerTab),30);}};
  const originalShow=api.window.showTextDocument;let finalFocus;
  api.window.showTextDocument=async(doc,options)=>{if(options.preserveFocus===false)finalFocus={doc,column:options.viewColumn};return originalShow(doc,options);};
  assert.strictEqual(await transition.attachHeaderLayout(api,headerPanel,def.fileName),true);
  assert.strictEqual(state.groups.length,2,'header repair removes empty and side-by-side groups');
  assert.deepStrictEqual(state.groups[0].tabs,[headerTab],'header occupies the upper group alone');
  assert(state.groups[1].tabs.some(tab=>transition.tabFilename(tab)===common.fileName),'all pre-existing native files survive the final layout');
  assert.strictEqual(state.layout.orientation,1);
  assert.strictEqual(state.layout.groups[0].size,0.28,'header uses the approved 28% height');
  assert.strictEqual(state.layout.groups[1].size,0.72);
  assert.strictEqual(finalFocus.doc,def);assert.strictEqual(finalFocus.column,2,'code below the header gains focus');
  assert.strictEqual(common.saveCalls+def.saveCalls,0,'repair preserves unsaved buffers');
  api.window.showTextDocument=originalShow;

  const unrelatedGroups=[{viewColumn:1,tabs:[tab(common.fileName),tab(def.fileName)]},{viewColumn:2,tabs:[{input:{viewType:'foreign.custom'},label:'Foreign Viewer'}]}],unrelatedCalls=[];
  const unrelated={ViewColumn:{Beside:-2},Uri:{file:uri},workspace:api.workspace,commands:{async executeCommand(id){unrelatedCalls.push(id);}},window:{tabGroups:{all:unrelatedGroups},async showTextDocument(doc,options){unrelatedCalls.push(`show:${path.basename(doc.fileName)}`);return{document:doc,viewColumn:options.viewColumn};}}};
  const preserved=await transition.consolidate(unrelated,[common.fileName,def.fileName],()=>true,{timeout:10,selectedFile:def.fileName});
  assert.strictEqual(preserved.ok,true,'an unrelated custom surface in another group no longer blocks the connected text editor');
  assert.strictEqual(preserved.preservedUnrelated,true);assert.strictEqual(preserved.nativeColumn,1);assert.strictEqual(preserved.headerColumn,-2);
  assert(!unrelatedCalls.includes('workbench.action.joinAllGroups')&&!unrelatedCalls.includes('vscode.setEditorLayout'),'the non-destructive route never joins or replaces unrelated editor groups');
  assert.strictEqual(unrelatedGroups[1].tabs[0].label,'Foreign Viewer','the unrelated viewer remains untouched');

  const cold=document('C:/chars/Ryu/Ryu.air'),coldCalls=[];
  const coldState={layout:{orientation:0,groups:[{size:.18},{size:.82}]},groups:[{viewColumn:1,tabs:[]}]};
  const coldApi={
    Uri:{file:uri},workspace:{textDocuments:[],async openTextDocument(){coldCalls.push('open:Ryu.air');return cold;}},
    commands:{async executeCommand(id,arg){coldCalls.push(id);if(id==='workbench.action.joinAllGroups'){coldState.groups=[{viewColumn:1,tabs:[]}];return;}if(id==='vscode.setEditorLayout'){coldState.layout=arg;coldState.groups=[{viewColumn:1,tabs:[]},{viewColumn:2,tabs:[]}];return;}if(id==='vscode.getEditorLayout')return coldState.layout;}},
    window:{tabGroups:{get all(){return coldState.groups;}},async showTextDocument(doc,options){coldCalls.push('show:Ryu.air');const target=coldState.groups.find(group=>group.viewColumn===options.viewColumn);target.tabs.push(tab(doc.fileName));return{document:doc,viewColumn:target.viewColumn};}}
  };
  const coldStarted=await transition.consolidate(coldApi,[cold.fileName],()=>true,{timeout:30,selectedFile:cold.fileName});
  assert.strictEqual(coldStarted.ok,true,'a clean reload with no source tab bootstraps the canonical text workspace');
  assert.strictEqual(coldStarted.coldStart,true,'the transition reports the explicit cold-start route');
  assert.deepStrictEqual(coldCalls.slice(0,3),['workbench.action.joinAllGroups','vscode.setEditorLayout','vscode.getEditorLayout'],'the empty workspace builds the text layout without requiring a pre-existing source tab');
  assert(coldCalls.includes('open:Ryu.air')&&coldCalls.includes('show:Ryu.air'),'the requested source is opened only after the empty text layout exists');
  assert.strictEqual(coldState.groups[0].tabs.length,0,'the compact header group remains available for Code Navigation');
  assert.strictEqual(transition.tabFilename(coldState.groups[1].tabs[0]),path.resolve(cold.fileName),'the exact requested source opens in the native editor group');

  const mixed={...unrelated,window:{...unrelated.window,tabGroups:{all:[{viewColumn:1,tabs:[tab(common.fileName),{input:{viewType:'foreign.custom'},label:'Foreign Viewer'}]}]}}};
  assert.deepStrictEqual(await transition.consolidate(mixed,[common.fileName,def.fileName],()=>true,{timeout:10}),{ok:false,reason:'unsafe'},'a foreign tab sharing the connected native group still fails closed');

  const residualState={layout:{orientation:0,groups:[{size:.5},{size:.5}]},groups:[{viewColumn:1,tabs:[tab(common.fileName)]},{viewColumn:2,tabs:[tab(def.fileName)]}]},residualCalls=[];
  const residual={Uri:{file:uri},workspace:api.workspace,window:{tabGroups:{get all(){return residualState.groups;}},showTextDocument:api.window.showTextDocument},commands:{async executeCommand(id){residualCalls.push(id);if(id==='vscode.getEditorLayout')return residualState.layout;}}};
  assert.deepStrictEqual(await transition.consolidate(residual,[common.fileName,def.fileName],()=>true,{timeout:15}),{ok:false,reason:'join-unsettled'});
  assert(!residualCalls.includes('vscode.setEditorLayout'),'a join that does not settle aborts before layout mutation');
  console.log('Text transition safely consolidates only admitted native tabs and preserves dirty document identity');
})().catch(error=>{console.error(error);process.exitCode=1;});
