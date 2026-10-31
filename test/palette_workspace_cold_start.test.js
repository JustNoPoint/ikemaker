'use strict';

const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const Module=require('module');

const originalLoad=Module._load,calls=[];
const vscode={
  ViewColumn:{One:1,Beside:-2},
  Uri:{file:fsPath=>({fsPath})},
  commands:{async executeCommand(command){calls.push(command);return command==='ikemen.textToolbar.suspendForVisualViewer';}},
  window:{tabGroups:{activeTabGroup:{viewColumn:3}}},
  workspace:{getConfiguration:()=>({get:(_key,fallback)=>fallback,update:async()=>{}})}
};
Module._load=function(request,parent,main){if(request==='vscode')return vscode;return originalLoad.call(this,request,parent,main)};

(async()=>{
  try{
    const viewerGroup=require('../src/viewer_group');viewerGroup.resetViewerGroupForTests();
    const controllerModule=require('../src/palette_workspace_controller');
    assert.strictEqual(await controllerModule.paletteWorkspaceColumn(),3,'Palette Workshop suspends Code Navigation and uses the joined visual workspace instead of the protected header row');
    assert.deepStrictEqual(calls,['ikemen.textToolbar.suspendForVisualViewer']);

    const root=fs.mkdtempSync(path.join(os.tmpdir(),'palette-cold-start-')),target=path.join(root,'cold.sff');fs.writeFileSync(target,Buffer.from('cold-start-evidence'));
    const serviceModule=require('../src/palette_workspace_service'),service=serviceModule.configurePaletteWorkspaceService(null);service.open(target);
    const owner=new controllerModule.PaletteWorkspaceController({}),seen=[];
    for(const method of ['sendLibrary','postCertification','postTemporary','postSyncedImages','postDomainMatrix','postMigration','postFamily','postBulk','postLive','publish'])owner[method]=()=>seen.push(method);
    assert.strictEqual(owner.replaySff({filename:target,post(){}}),true);
    assert.deepStrictEqual(seen,['sendLibrary','postCertification','postTemporary','postSyncedImages','postDomainMatrix','postMigration','postFamily','postBulk','postLive','publish'],'the ready handshake republishes every Palette Workshop option model without requiring SFF Viewer state');
    const source=fs.readFileSync(path.join(__dirname,'..','src','palette_workspace_controller.js'),'utf8');
    assert.match(source,/message\?\.type==='assetWorkspaceReady'[\s\S]{0,180}owner\.replay\(\)/,'the authoritative target panel replays its complete projection only after the webview is ready');
    assert.doesNotMatch(source,/createWebviewPanel\('ikemenPalette(?:Scratch|Workspace)'[^\n]+vscode\.ViewColumn\.Active/,'Palette Workshop panels never inherit the active protected text-header group');
    const registration=fs.readFileSync(path.join(__dirname,'..','src','player_palette_workspace.js'),'utf8');
    assert.match(registration,/configurePaletteWorkspaceService\(context\.workspaceState\)/);
    assert.match(registration,/configurePaletteWorkspaceController\(context\)/,'Palette Workshop owns its cold-start initialization instead of relying on SFF Viewer registration');
    fs.rmSync(root,{recursive:true,force:true});
    console.log('Palette Workshop cold-start routing, ready replay, and independent initialization tests passed');
  }finally{Module._load=originalLoad;}
})().catch(error=>{console.error(error);process.exitCode=1});
