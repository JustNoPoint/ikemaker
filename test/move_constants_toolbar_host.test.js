'use strict';

const assert=require('assert'),crypto=require('crypto'),fs=require('fs'),os=require('os'),path=require('path'),Module=require('module');
const original=Module._load,commands=[],information=[];
let documentText='normal.sLP.moveID = 200\n',documentVersion=1;
const document={fileName:'',uri:{},getText:()=>documentText,get lineCount(){return documentText.split(/\r?\n/).length;},lineAt:line=>({text:documentText.split(/\r?\n/)[line]||''}),get version(){return documentVersion;}};
const vscode={
  Uri:{file:fsPath=>({fsPath})},ViewColumn:{},Position:class{},Range:class{},WorkspaceEdit:class{},
  workspace:{textDocuments:[document],openTextDocument:async filename=>{document.fileName=filename;return document;}},
  window:{showInformationMessage:async message=>information.push(message),showQuickPick:async()=>undefined,showTextDocument:async()=>{}},
  commands:{executeCommand:async(...args)=>commands.push(args)}
};
Module._load=function(request,parent,main){if(request==='vscode')return vscode;return original.call(this,request,parent,main);};
const workspace=require('../src/move_constants_workspace'),registry=require('../src/authoring_context_registry'),{MESSAGE_TYPE}=require('../src/universal_toolbar_webview'),{hash}=require('../src/mutation_safety');
Module._load=original;

function panel(active=false){const view=[],dispose=[];return{active,webview:{postMessage:async message=>sent.push(message)},dispose(){this.disposed=(this.disposed||0)+1;dispose.forEach(fn=>fn());},onDidChangeViewState(fn){view.push(fn);return{dispose(){}};},onDidDispose(fn){dispose.push(fn);},activate(){this.active=true;view.forEach(fn=>fn({webviewPanel:this}));}};}
const sent=[],opened=[],owner={panel:panel(true),assets:{defPath:path.resolve('Hero.def')},model:{character:'Hero',moves:[{id:'normal.slp',prefix:'normal.sLP'}]},displaySelection:{kind:'constants',id:'normal.slp',prefix:'normal.sLP',frameIndex:0}};
let snapshot={identity:'character\0hero',selectionRevision:3,activeSurfaceId:'move.constants',selection:workspace.selectionEnvelope(owner)};
owner.contextModel={snapshot:()=>snapshot,update:change=>{snapshot={...snapshot,...change,selectionRevision:snapshot.selectionRevision+1};return snapshot;}};
const route=kind=>({filename:path.resolve(kind==='direct'?'normal.zss':'constants.zss'),line:kind==='direct'?8:0,fingerprint:hash(documentText),version:String(documentVersion),selectionKey:kind==='direct'?'direct:hitdef:a:8':'constants:normal.slp:normal.sLP',label:kind});
let nextRoute=route('constants'),current=true,closeAllowed=false;
const navigation={openReferenceSource:async value=>opened.push(value),currentPoint:()=>({kind:'constants'})};
const toolbar=workspace.createMoveToolbar(owner,{navigation,isCurrent:()=>current,resolveSource:async()=>nextRoute,viewerClose:{prepare:async()=>closeAllowed}});
const invoke=slotId=>toolbar.dispatch('move.constants',{type:MESSAGE_TYPE,slotId});

(async()=>{
  await invoke('text-source');assert.equal(opened.length,1);assert.equal(opened[0].line,0,'constants selection opens its first declaration');
  owner.displaySelection={kind:'direct',componentReference:{kind:'hitdef',stableId:'a'}};snapshot={...snapshot,selectionRevision:4,selection:workspace.selectionEnvelope(owner)};documentText=Array.from({length:10},(_,index)=>`line ${index}`).join('\n');nextRoute=route('direct');document.fileName=nextRoute.filename;
  await invoke('text-source');assert.equal(opened.at(-1).line,8,'direct selection opens the exact current component start');

  const before=opened.length;documentText+='; changed during open\n';await invoke('text-source');assert.equal(opened.length,before,'a changed fingerprint between resolution and open navigates nowhere');
  documentText=Array.from({length:10},(_,index)=>`line ${index}`).join('\n');documentVersion=2;nextRoute={...route('direct'),version:'1'};await invoke('text-source');assert.equal(opened.length,before,'a changed open-document version navigates nowhere');
  documentVersion=1;nextRoute=route('direct');snapshot={...snapshot,selectionRevision:5,activeSurfaceId:'companion.text-toolbar'};await invoke('text-source');assert.equal(opened.length,before,'a background/other-surface selection navigates nowhere');
  snapshot={...snapshot,selectionRevision:6,activeSurfaceId:'move.constants',selection:{surfaceId:'move.constants',kind:'direct',componentReference:{kind:'hitdef',stableId:'other'}}};await invoke('text-source');assert.equal(opened.length,before,'a stale/reassigned component selection navigates nowhere');
  snapshot={...snapshot,selectionRevision:7,selection:workspace.selectionEnvelope(owner)};nextRoute=null;await invoke('text-source');assert.equal(opened.length,before,'a removed component navigates nowhere');

  await assert.rejects(toolbar.dispatch('move.constants',{type:MESSAGE_TYPE,slotId:'help',extra:true}),/forged|extra/i);
  await assert.rejects(invoke('save'),/native documents/i);
  await invoke('help');assert.equal(commands.at(-1)[0],'ikemen.help.open');await invoke('actions-search');assert.equal(sent.at(-1).type,'ikemaker.move-constants.open-actions');
  const commandsBefore=commands.length;const freshOwner={...owner,panel:panel(false)};workspace.createMoveToolbar(freshOwner,{navigation,isCurrent:()=>true,resolveSource:async()=>route('constants'),viewerClose:{prepare:async()=>true}});assert.equal(commands.length,commandsBefore,'creating/restoring Move Lab never auto-opens the browser');
  await invoke('viewer-browser');assert.equal(commands.at(-1)[0],'ikemen.authoringBrowser.open');
  await invoke('close');assert.equal(owner.panel.disposed||0,0,'guarded close cannot dispose when draft/busy review rejects it');closeAllowed=true;await invoke('close');assert.equal(owner.panel.disposed,1);

  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-move-context-')),one=path.join(root,'one'),two=path.join(root,'two');fs.mkdirSync(one);fs.mkdirSync(two);
  const make=(folder,name)=>{const file=path.join(folder,name);fs.writeFileSync(file,'');return file;},def1=make(one,'one.def'),def2=make(two,'two.def'),code=make(two,'state.zss'),air=make(two,'anim.air');
  const contextPanel=panel(false),contextOwner={panel:contextPanel,assets:{defPath:def1,folder:one,code:[]},model:{character:'One'},displaySelection:{kind:'constants',id:'a',prefix:'a',frameIndex:0}};
  workspace.bindCharacterContext(contextOwner);const oldIdentity=contextOwner.contextModel.identity;contextOwner.assets={defPath:def2,folder:two,air,code:[code,code],resources:[code,path.join(two,'missing.zss')]};contextOwner.model={character:'Two'};workspace.bindCharacterContext(contextOwner);
  assert.notEqual(contextOwner.contextModel.identity,oldIdentity,'character rebind replaces the old context identity');assert.deepStrictEqual(new Set(contextOwner.contextModel.snapshot().files),new Set([def2,air,code].map(value=>path.resolve(value))),'rebind contributes only existing flattened deduped files and excludes the folder string');
  assert.equal(contextOwner.contextModel.snapshot().selection,null,'background rebind does not steal the shared selection');contextPanel.activate();workspace.claimContextSelection(contextOwner);assert.deepStrictEqual(contextOwner.contextModel.snapshot().selection,workspace.selectionEnvelope(contextOwner),'active viewer explicitly reclaims its private display selection');
  contextPanel.dispose();fs.rmSync(root,{recursive:true,force:true});
  console.log('Move Lab universal toolbar host, exact-source staleness, guarded close, manual browser, and context rebind tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
