'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),Module=require('module');
const serializers=new Map(),created=[];
function panel(){const callbacks=[];return {active:true,viewColumn:2,reveals:0,disposed:false,webview:{onDidReceiveMessage(){return {dispose(){}}}},onDidChangeViewState(){},onDidDispose(fn){callbacks.push(fn)},reveal(){this.reveals++},dispose(){if(this.disposed)return;this.disposed=true;callbacks.forEach(fn=>fn())}}}
const vscode={Uri:{file:fsPath=>({fsPath})},ViewColumn:{Active:1},workspace:{getConfiguration:()=>({get:(_k,f)=>f})},commands:{registerCommand:()=>({dispose(){}})},window:{createWebviewPanel(){const p=panel();created.push(p);return p},registerWebviewPanelSerializer(name,s){serializers.set(name,s);return {dispose(){}}},showErrorMessage(message){throw Error(message)}}};
const original=Module._load;Module._load=function(request,parent,main){return request==='vscode'?vscode:original.call(this,request,parent,main)};
const stage=require('../src/stage_workspace'),ui=require('../src/screenpack_workspace');Module._load=original;
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-panel-lifecycle-'));
(async()=>{const stageFile=path.join(root,'stage.def'),uiFile=path.join(root,'system.def');
fs.writeFileSync(stageFile,'[Info]\nname=Stage\n[Camera]\nboundleft=-10\nboundright=10\n[StageInfo]\nlocalcoord=320,240\n[BGDef]\nspr=missing.sff\n');
fs.writeFileSync(uiFile,'[Info]\nname=UI\n[Files]\nspr=missing.sff\nfight=fight.def\n[Title Info]\nmenu.pos=160,120\n');
stage.registerStageWorkspace({subscriptions:[]});ui.registerScreenpackWorkspace({subscriptions:[]});
for(const [file,open,type] of [[stageFile,stage.openStageWorkspace,'ikemenStageWorkspace'],[uiFile,ui.openUiWorkspace,'ikemenUiWorkspace']]){
const before=created.length;await open(vscode.Uri.file(file));const first=created.at(-1);await open(vscode.Uri.file(file));assert.equal(created.length,before+1,'reopen reuses the existing panel');assert.equal(first.reveals,1);
first.dispose();await open(vscode.Uri.file(file));assert.equal(created.length,before+2,'closing allows a fresh panel');created.at(-1).dispose();
const restored=panel();await serializers.get(type).deserializeWebviewPanel(restored,{filename:file,workspaceMode:'screenpack'});await open(vscode.Uri.file(file));assert.equal(created.length,before+2,'restored panel is reused');assert.equal(restored.reveals,1);
const duplicate=panel();await serializers.get(type).deserializeWebviewPanel(duplicate,{filename:file,workspaceMode:'screenpack'});assert(duplicate.disposed,'duplicate restored panel is consolidated');restored.dispose();
}
console.log('Stage and Screenpack panel lifecycle tests passed');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{for(const file of fs.readdirSync(root))fs.unlinkSync(path.join(root,file));fs.rmdirSync(root)});
