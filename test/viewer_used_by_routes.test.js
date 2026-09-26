'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os'),Module=require('module');
(async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'used-by-routes-')),def=path.join(folder,'char.def'),code=path.join(folder,'moves.zss'),air=path.join(folder,'own.air');
  fs.writeFileSync(def,'[Files]\nanim = own.air\nst = moves.zss\n');fs.writeFileSync(code,'explod { anim: 210; }\n');fs.writeFileSync(air,'[Begin Action 210]\n1,0,0,0,1\n');
  let receive,dirty='explod { anim: 210; }\n';const opened=[],from={filename:air,kind:'air',reference:{group:210}};
  const panel={webview:{html:'',onDidReceiveMessage:fn=>{receive=fn;return{dispose(){}};}},onDidDispose(){},dispose(){}};
  const vscode={Uri:{file:fsPath=>({fsPath})},ViewColumn:{Beside:2},workspace:{textDocuments:[{fileName:code,getText:()=>dirty}]},window:{createWebviewPanel:()=>panel,showInformationMessage(){},showErrorMessage:message=>{throw Error(message);}}};
  const original=Module._load;Module._load=function(request,parent,isMain){if(request==='vscode')return vscode;if(request==='./viewer_navigation'&&parent.filename.endsWith('viewer_used_by.js'))return{archiveContext:()=>null,associatedDefs:()=>[def],archiveRegistry:()=>({candidates:[],diagnostics:[],commonSources:[]}),openReferenceSource:async(origin,point)=>opened.push({origin,point})};return original.call(this,request,parent,isMain);};
  try{
    const used=require('../src/viewer_used_by');await used.openUsedBy(air,'air',{group:210},from);
    assert(panel.webview.html.includes('1 exact reference(s)'));
    await receive({type:'source',index:0});assert.strictEqual(opened[0].origin.filename,code);assert.strictEqual(opened[0].origin.line,0);assert.strictEqual(opened[0].point,from);
    await receive({type:'source',index:-1});await receive({type:'source',index:100});assert.strictEqual(opened.length,1);
    dirty='// inserted\nexplod { anim: 210; }\n';await receive({type:'refresh'});await receive({type:'source',index:0});assert.strictEqual(opened[1].origin.line,1,'Refresh indexes unsaved document contents');
    dirty='explod { anim: 999; }\n';await receive({type:'refresh'});assert(panel.webview.html.includes('0 exact reference(s)'));
    await receive({type:'source',index:0});assert.strictEqual(opened.length,2,'stale row ids cannot open an unrelated result after refresh');
    console.log('Used By panel routing, unsaved refresh, exact source locations and invalid result guards passed');
  }finally{Module._load=original;fs.rmSync(folder,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
