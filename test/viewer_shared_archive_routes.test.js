'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os'),Module=require('module');
(async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'shared-viewer-routes-'));
  const def=path.join(folder,'char.def'),source=path.join(folder,'moves.zss'),air=path.join(folder,'shared.air'),sff=path.join(folder,'shared.sff');
  fs.writeFileSync(def,'[Files]\nanim = own.air\nsprite = own.sff\nst = moves.zss\nfx = shared.def\n');
  fs.writeFileSync(source,'explod { anim: SF6200; }');fs.writeFileSync(air,'[Begin Action 200]\n1,2,0,0,1\n');fs.writeFileSync(sff,'fixture');
  fs.writeFileSync(path.join(folder,'shared.def'),'[Info]\nprefix = SF6\n[Files]\nair = shared.air\nsff = shared.sff\n');
  const visits=[],notices=[],messages=[];let nav,extra=[],picked,dialogs=0;
  const panel={onDidDispose(){},webview:{postMessage:message=>{messages.push(message);return true;}}};
  const vscode={Uri:{file:fsPath=>({fsPath})},workspace:{textDocuments:[],getConfiguration:()=>({get:()=>extra})},window:{showQuickPick:async()=>picked,showOpenDialog:async()=>{dialogs++;return undefined;},showInformationMessage:text=>notices.push(text)},commands:{executeCommand:async(command,uri,column,reference)=>{visits.push({command,uri,reference});nav.registerSourcePanel(panel,uri.fsPath);return panel;}}};
  const original=Module._load;Module._load=function(request,parent,isMain){if(request==='vscode')return vscode;if(request==='./air_viewer'&&parent.filename.endsWith('viewer_navigation.js'))return{openAirPreview:async(uri,options)=>{visits.push({uri,options});nav.registerSourcePanel(panel,uri.fsPath);return{panel};}};if(request==='./sff_reader'&&parent.filename.endsWith('viewer_navigation.js'))return{readSff:()=>({sprites:[{group:1,number:2}]})};return original.call(this,request,parent,isMain);};
  try{
    nav=require('../src/viewer_navigation');
    await nav.openConnected(source,'air',nav.referenceAt(fs.readFileSync(source,'utf8'),0));
    assert.strictEqual(visits[0].uri.fsPath,air);assert.strictEqual(visits[0].options.action,200,'longest configured prefix disambiguates a numeric prefix suffix');assert.strictEqual(dialogs,0);
    assert(messages.some(message=>message.type==='viewerArchiveContext'&&message.label==='Shared SF6 · shared.air'));
    await nav.openConnected(air,'sff',{group:1,number:2});
    assert.strictEqual(visits[1].uri.fsPath,sff,'shared AIR hands off to its shared SFF, never character SFF');
    await nav.openConnected(air,'snd');assert.strictEqual(visits.length,2);assert(notices.at(-1).includes('shared prefix sf6'));
    fs.writeFileSync(path.join(folder,'other.def'),'[Info]\nprefix = SF6\n[Files]\nair = other.air\n');extra=['other.def'];
    await nav.openConnected(source,'air',{prefix:'SF6',group:200});assert.strictEqual(visits.length,2,'canceled duplicate-prefix choice never navigates');
    await nav.openConnected(source,'air',{prefix:'UNKNOWN',group:200});assert.strictEqual(dialogs,1);assert.strictEqual(visits.length,2,'unresolved prefix offers explicit browse without guessing');
    console.log('Configured shared routing, numeric prefixes, visible identity, shared handoffs and cancellation passed');
  }finally{Module._load=original;fs.rmSync(folder,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
