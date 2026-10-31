'use strict';

const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),Module=require('module');
const original=Module._load;Module._load=function(request,parent,main){if(request==='vscode')return{Uri:{file:filename=>({fsPath:filename,toString:()=>`file://${filename}`})}};return original.call(this,request,parent,main)};
const api=require('../src/stage_workspace'),{normalizeModel}=require('../src/visual_authoring_browser_companion');Module._load=original;

(async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'stage-visual-browser-')),filename=path.join(root,'stage.def');
  try{
    fs.writeFileSync(filename,'[Info]\nname=Browser Stage\n[Camera]\nboundleft=-100\nboundright=100\n[StageInfo]\nlocalcoord=320,240\nzoffset=220\n[BGDef]\nspr=missing.sff\n[BG Sky]\ntype=normal\nspriteno=0,0\nstart=0,0\n[BG Floor]\ntype=normal\nspriteno=1,0\nstart=0,220\n');
    const payload=api.stagePayload(filename),browser=payload.backgroundBrowser,posted=[],contextUpdates=[];payload.model.backgrounds[0].action=10;payload.images['0,0']='data:image/png;base64,AA==';payload.images['0,1']='data:image/png;base64,AQ==';payload.thumbnailAnimations={'10':{frames:[{thumbnailKey:'0,0',durationMs:50},{thumbnailKey:'0,1',durationMs:50}],truncated:false}};const owner={filename,payload,backgroundBrowser:{snapshot:()=>browser},generation:7,selected:0,selectedIndices:[0],selectionAnchor:0,document:null,panel:{active:true,webview:{postMessage:async message=>posted.push(message)}},contextModel:{update:value=>contextUpdates.push(value)},disposed:false};
    const model=api.stageBrowserModel(owner),normalized=normalizeModel(model,{surface:'stage',ownerKey:api.stageBrowserOwnerKey(filename),label:'Browser Stage'},{});
    assert.strictEqual(normalized.scopes.length,1);assert.strictEqual(normalized.scope.id,'backgrounds');assert.deepStrictEqual(normalized.selection.rowIds,[browser.rows[0].id]);assert.strictEqual(normalized.browser.rows.length,2);
    assert.strictEqual(normalized.thumbnailAnimations[browser.rows[0].id].frames.length,2);
    assert.strictEqual(api.applyStageBrowserSelection(owner,1,'toggle'),true);assert.deepStrictEqual(owner.selectedIndices,[0,1]);assert.strictEqual(owner.selected,1);
    assert.strictEqual(api.applyStageBrowserSelection(owner,0,'toggle'),true);assert.deepStrictEqual(owner.selectedIndices,[1],'Ctrl/Command toggle retains one authoritative selected background');
    owner.selectionAnchor=0;assert.strictEqual(api.applyStageBrowserSelection(owner,1,'range'),true);assert.deepStrictEqual(owner.selectedIndices,[0,1],'Shift range is computed by the Stage owner');
    assert.strictEqual(api.validStageMessage({type:'browserSelectionIntent',generation:7,selected:1,mode:'range'},7),true);assert.strictEqual(api.validStageMessage({type:'browserSelectionIntent',generation:7,selected:1,mode:'range',rows:[]},7),false);

    let registered=null,detached=null,published=0,disposed=0;const service={registerOwner(value){registered=value;return{dispose(){disposed++}}},detachOwner(surface,key){detached=[surface,key];return true},publish:async()=>{published++;return true}};
    api.attachStageBrowser(owner,service);assert.strictEqual(registered.surface,'stage');assert.strictEqual(registered.ownerKey,path.resolve(filename));assert.strictEqual(registered.getModel().binding,browser.binding);
    owner.selected=0;owner.selectedIndices=[0];owner.selectionAnchor=0;await registered.onSelect(browser.rows[1].id,'toggle');assert.deepStrictEqual(owner.selectedIndices,[0,1]);assert(posted.some(message=>message.type==='stageSelectionCommit'&&message.selectedIndices.length===2));assert(contextUpdates.length>0,'companion selection updates the owning Stage context without creating a draft');
    await api.publishStageBrowser(owner,service);assert.strictEqual(published,1);
    api.detachStageBrowser(owner,service);assert.strictEqual(disposed,1);assert.deepStrictEqual(detached,['stage',path.resolve(filename)]);

    const source=fs.readFileSync(path.join(__dirname,'..','src','stage_workspace.js'),'utf8');
    assert.match(source,/'viewer-browser':visualBrowser/);assert.match(source,/visualBrowserService\.open\('stage',owner\.visualBrowserOwnerKey\)/);assert.doesNotMatch(source,/'viewer-browser':execute\('ikemen\.authoringBrowser\.open'/);
    assert.match(source,/onAction:\(rowId,actionId\)=>routeStageBrowserAction/);assert.match(source,/return routeStageBrowserAction\(owner,message\.rowId,message\.actionId,message\.binding\)/);
    console.log('Stage production visual-browser owner, synchronized selection, routing, publish and detach contracts passed');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
