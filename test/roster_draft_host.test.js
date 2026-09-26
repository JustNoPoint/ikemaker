'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const source=fs.readFileSync(path.join(__dirname,'../src/select_def_workspace.js'),'utf8');
const {FormDrafts}=require('../src/form_drafts');let stored={},allow=false,preflights=0,delayed;
const storage={get:()=>stored,update:async(key,value)=>{stored=value;}};
const makeDocument=id=>({fileName:id,uri:{toString:()=>id},getText:()=>id});const first=makeDocument('first/select.def'),second=makeDocument('second/select.def');
const messages=[],panels=[];
const api={ViewColumn:{Active:1},window:{createWebviewPanel(){let dispose;const panel={webview:{onDidReceiveMessage(fn){panel.receive=fn;},postMessage:async m=>{messages.push(m);}},onDidDispose(fn){dispose=fn;},dispose(){dispose();}};panels.push(panel);return panel;},showWarningMessage(){},showErrorMessage:message=>{throw Error(message);}}};
const env={session:null,openSequence:0,rosterDrafts:new FormDrafts(storage),draftKey:d=>d.uri.toString(),path,vscode:api,chooseDocument:async uri=>uri,
 buildPayload:async document=>{if(delayed&&document===first)await delayed;return{uri:document.uri.toString(),orderDraft:env.rosterDrafts.read(document.uri.toString()),preview:{motif:{}},paletteCandidates:[]};},html:JSON.stringify,
 preferredViewerColumn:x=>x,trackViewerPanel:x=>x,revealInViewerGroup(){},require:name=>name==='./viewer_close'?{support(){},prepare:async()=>{preflights++;return allow;}}:name==='./viewer_navigation'?{registerSourcePanel(){}}:name==='./webview_policy'?{protect:html=>html}:require(name)};
vm.createContext(env);
const branch=source.slice(source.indexOf("  if(message.type==='rosterOrderDraft')"),source.indexOf('  if(message.sourceUri&&'));
vm.runInContext('async function handle(document,message,panel){'+branch+'}',env);
vm.runInContext(source.slice(source.indexOf('async function refreshSession()'),source.indexOf('async function deserializePanel(')),env);
(async()=>{
 const panel=await env.openSelectDefWorkspace(first);const draft={uri:first.uri.toString(),sourceHash:'original',lines:[2,1],names:['B','A']};
 await panel.receive({type:'rosterOrderDraft',sourceUri:draft.uri,draft});assert.deepEqual(stored[draft.uri],draft);
 await env.openSelectDefWorkspace(second,{preset:true,reference:{}});assert.equal(env.session.document,first);assert.equal(preflights,0,'preset must not rebind a live roster');
 env.paletteSource=filename=>{if(filename==='missing.act')throw Error('missing palette');return{name:'Saved colors',kind:'act'};};await env.openSelectDefWorkspace(first,{preset:true,reference:{extraFiles:['colors.act']}});assert.equal(messages.at(-1).model.paletteCandidates[0].filename,'colors.act');await assert.rejects(env.openSelectDefWorkspace(first,{preset:true,reference:{extraFiles:['missing.act']}}),/missing palette/);assert.equal(env.session.paletteCandidates[0].filename,'colors.act');
 const before=messages.length;await env.openSelectDefWorkspace(second);assert.equal(preflights,1);assert.equal(env.session.document,first);assert.equal(messages.length,before,'cancelled switch cannot deliver a new source');
 allow=true;await env.openSelectDefWorkspace(second);assert.equal(env.session.document,second);assert.equal(messages.at(-1).type,'rosterContext');assert.deepEqual(stored[draft.uri],draft,'switch preserves previous roster draft');
 panel.dispose();env.rosterDrafts=new FormDrafts(storage);const reopened=await env.openSelectDefWorkspace(first);assert.deepEqual(JSON.parse(reopened.webview.html).orderDraft,draft,'new panel after store reload receives saved draft');
 await reopened.receive({type:'rosterOrderDraft',sourceUri:'other',draft:null});assert.deepEqual(stored[draft.uri],draft,'another roster cannot discard this draft');
 await reopened.receive({type:'rosterOrderDraft',sourceUri:draft.uri,draft:null});assert.equal(stored[draft.uri],undefined);
 let release;delayed=new Promise(resolve=>{release=resolve;});const refresh=env.refreshSession();await env.openSelectDefWorkspace(second);const after=messages.length;release();await refresh;assert.equal(messages.length,after,'stale refresh cannot replace the newly selected roster');
 console.log('Roster host stores drafts, retains cancelled context, recovers new panels, isolates discard and rejects stale refresh');
})().catch(error=>{console.error(error);process.exitCode=1;});
