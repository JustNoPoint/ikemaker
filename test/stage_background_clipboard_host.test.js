'use strict';

const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),Module=require('module');

(async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'stage-bg-clipboard-host-')),filename=path.join(root,'stage.def');
  fs.writeFileSync(filename,'[Info]\nname=Clipboard Stage\n[Camera]\nstartx=0\n[StageInfo]\nzoffset=200\n[BGDef]\n[BG Sky]\n; preserved note\ntype=normal\nspriteno=0,0\nstart=0,0\n[BG Floor]\ntype=normal\nspriteno=0,1\nstart=0,200\n');
  const commands=new Map(),answers=[],infos=[],errors=[],posted=[];let panel;
  const uri=file=>({fsPath:file,toString:()=>`file://${file}`});
  const vscode={Uri:{file:uri},Range:class{},WorkspaceEdit:class{},ViewColumn:{Active:1,Beside:2},env:{clipboard:{writeText:async()=>{throw Error('system clipboard must not be used')}}},workspace:{textDocuments:[],getConfiguration:()=>({get:(_key,fallback)=>fallback}),onDidChangeTextDocument:()=>({dispose(){}}),onDidCloseTextDocument:()=>({dispose(){}})},window:{createWebviewPanel:()=>{const listeners=[];panel={active:true,reveal(){},onDidChangeViewState:()=>({dispose(){}}),onDidDispose:()=>{},dispose(){},webview:{cspSource:'test',onDidReceiveMessage(fn){listeners.push(fn);panel.receive=message=>Promise.all(listeners.map(listener=>listener(message)));return{dispose(){}}},postMessage:async message=>{posted.push(message);return true}}};return panel;},registerWebviewPanelSerializer:()=>({dispose(){}}),onDidChangeActiveTextEditor:()=>({dispose(){}}),onDidChangeTextEditorSelection:()=>({dispose(){}}),showWarningMessage:async()=>answers.shift(),showInformationMessage:async message=>infos.push(message),showErrorMessage:async message=>errors.push(message),showInputBox:async()=>undefined,showQuickPick:async()=>undefined},commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return{dispose(){}}},executeCommand:async(id,...args)=>commands.get(id)?.(...args)}};
  const original=Module._load;Module._load=function(request,parent,main){if(request==='vscode')return vscode;if(request==='./viewer_group')return{preferredViewerColumn:()=>2,trackViewerPanel:value=>value,revealInViewerGroup:()=>{}};return original.call(this,request,parent,main)};
  try{
    const api=require('../src/stage_workspace'),context={subscriptions:[],workspaceState:{get:(_key,fallback)=>fallback,update:async()=>{}}};api.registerStageWorkspace(context);await vscode.commands.executeCommand('ikemen.stage.openWorkspace',uri(filename));
    let payload=api.stagePayload(filename),row=payload.backgroundBrowser.rows[0];
    assert(row.actions.some(action=>action.id==='copy-background'));assert(row.actions.some(action=>action.id==='cut-background'&&action.mutating));assert(row.actions.some(action=>action.id==='paste-after'&&action.mutating));assert(row.actions.some(action=>action.id==='duplicate-background'&&action.mutating));
    await panel.receive({type:'visualBrowserAction',generation:1,binding:payload.backgroundBrowser.binding,rowId:row.id,actionId:'copy-background'});
    answers.push('Paste Background');await panel.receive({type:'visualBrowserAction',generation:1,binding:payload.backgroundBrowser.binding,rowId:row.id,actionId:'paste-after'});
    let text=fs.readFileSync(filename,'utf8');assert(text.includes('[BG Sky 2]\n; preserved note'),'host paste preserves full source and uses collision-safe name');assert(infos.some(message=>String(message).includes('in-session IKEMaker BG clipboard')));assert.strictEqual(errors.length,0,errors.join(' | '));
    payload=api.stagePayload(filename);row=payload.backgroundBrowser.rows.find(candidate=>candidate.label==='Sky 2');answers.push('Cut Background');await panel.receive({type:'visualBrowserAction',generation:2,binding:payload.backgroundBrowser.binding,rowId:row.id,actionId:'cut-background'});
    text=fs.readFileSync(filename,'utf8');assert(!text.includes('[BG Sky 2]'),'host cut removes the exact contextual section');assert(text.includes('[BG Sky]')&&text.includes('[BG Floor]'));
    assert(posted.some(message=>message.type==='visualWorkspaceHistoryState'&&message.generation===3&&message.state.canUndo&&!message.state.busy),'contextual mutation re-enables the visible owning Undo control');
    await panel.receive({type:'visualWorkspaceHistory',generation:3,action:'undo'});text=fs.readFileSync(filename,'utf8');assert(text.includes('[BG Sky 2]\n; preserved note'),'cut is recorded in the owning Stage Undo history');
    payload=api.stagePayload(filename);const floor=payload.backgroundBrowser.rows.find(candidate=>candidate.label==='Floor'),sky=payload.backgroundBrowser.rows.find(candidate=>candidate.label==='Sky');answers.push('Move Backgrounds');await panel.receive({type:'stageBackgroundDrop',generation:4,binding:payload.backgroundBrowser.binding,sourceRowIds:[floor.id],targetRowId:sky.id,placement:'before'});
    text=fs.readFileSync(filename,'utf8');assert(text.indexOf('[BG Floor]')<text.indexOf('[BG Sky]'),'internal drag/drop moves the exact BG section to the reviewed placement');assert(text.includes('[BG Sky]\n; preserved note'));
    await panel.receive({type:'visualWorkspaceHistory',generation:5,action:'undo'});text=fs.readFileSync(filename,'utf8');assert(text.indexOf('[BG Sky]')<text.indexOf('[BG Floor]'),'internal drag/drop is recorded in owning Stage Undo history');
    console.log('Stage contextual browser copy/paste/cut host mutations and in-session clipboard passed');
  }finally{Module._load=original;fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
