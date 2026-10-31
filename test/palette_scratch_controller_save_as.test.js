'use strict';

const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const Module=require('module');

const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-palette-save-as-'));
const target=path.join(root,'existing.ikpalette.json');
fs.writeFileSync(target,'existing palette bytes');
const originalLoad=Module._load;
let replacementAnswer;
const vscode={
  Uri:{file:fsPath=>({fsPath})},ConfigurationTarget:{WorkspaceFolder:1},
  workspace:{getConfiguration:()=>({get:(_key,fallback)=>fallback,update:async()=>{}})},
  window:{
    showSaveDialog:async()=>vscode.Uri.file(target),
    showWarningMessage:async()=>replacementAnswer,
    showOpenDialog:async()=>undefined,showInputBox:async()=>undefined,
    showInformationMessage:async()=>undefined
  }
};
Module._load=function(request,parent,main){if(request==='vscode')return vscode;return originalLoad.call(this,request,parent,main)};

(async()=>{try{
  const {PaletteWorkspaceController}=require('../src/palette_workspace_controller');
  const controller=new PaletteWorkspaceController({});
  const calls=[];
  controller.scratchService={
    snapshot:()=>({destination:null}),
    save:(draftId,filename,options)=>{calls.push({draftId,filename,options});return{filename}}
  };
  replacementAnswer=undefined;
  assert.strictEqual(await controller.scratchSaveAs('draft-1'),null,'cancelling replacement returns without saving');
  assert.strictEqual(calls.length,0,'cancelling replacement must not write the selected file');
  replacementAnswer='Replace Existing File';
  await controller.scratchSaveAs('draft-1');
  assert.strictEqual(calls.length,1,'explicit replacement confirmation reaches the save service once');
  assert.strictEqual(calls[0].filename,path.resolve(target));
  assert.strictEqual(calls[0].options.replace,true);
  assert.strictEqual(calls[0].options.replaceEvidence.filename,path.resolve(target),'replacement is bound to the reviewed destination evidence');
  console.log('Palette scratch Save As cancel and explicit replacement review tests passed');
}finally{Module._load=originalLoad;fs.rmSync(root,{recursive:true,force:true})}})().catch(error=>{console.error(error);process.exitCode=1});
