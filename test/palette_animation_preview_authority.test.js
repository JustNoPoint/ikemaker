'use strict';

const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const Module=require('module');

const originalLoad=Module._load;
const vscode={
  Uri:{file:fsPath=>({fsPath})},
  ViewColumn:{One:1,Beside:-2},
  commands:{executeCommand:async()=>undefined},
  window:{tabGroups:{activeTabGroup:{viewColumn:1}}},
  workspace:{getConfiguration:()=>({get:(_key,fallback)=>fallback,update:async()=>{}})}
};
Module._load=function(request,parent,main){if(request==='vscode')return vscode;return originalLoad.call(this,request,parent,main)};

try{
  const serviceModule=require('../src/palette_workspace_service');
  const service=serviceModule.configurePaletteWorkspaceService(null);
  const {palettePreviewSession}=require('../src/palette_workspace_controller');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'palette-animation-authority-'));
  const filename=path.join(root,'preview.sff');
  fs.writeFileSync(filename,Buffer.from('stable palette preview authority'));
  service.open(filename);
  let notifications=0;
  const detach=service.attach(filename,'animation-preview-test',()=>{notifications++});
  notifications=0;
  const before=service.snapshot(filename);
  assert.strictEqual(palettePreviewSession(service,filename),before);
  assert.strictEqual(service.snapshot(filename).revision,before.revision,'read-only animation preview validation must not revise the shared session');
  assert.strictEqual(notifications,0,'one animation preview must not republish every Palette Workshop projection');
  fs.writeFileSync(filename,Buffer.from('changed palette preview authority'));
  assert.throws(()=>palettePreviewSession(service,filename),/SFF changed/);
  assert.strictEqual(notifications,0,'stale read-only preview rejection must not mutate or notify the shared session');
  detach();
  fs.rmSync(root,{recursive:true,force:true});
  console.log('Palette animation preview authority is read-only and cannot start a Workshop replay loop');
}finally{
  Module._load=originalLoad;
}
