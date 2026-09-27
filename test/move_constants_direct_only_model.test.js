'use strict';

const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const Module=require('module');

const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-direct-shell-')),defPath=path.join(root,'Hero.def'),code=path.join(root,'states.zss');
fs.writeFileSync(defPath,'[Info]\nname=Hero\n[Files]\nst=states.zss\n');fs.writeFileSync(code,'[StateDef 200]\nhitDef {\n damage: 25;\n}\n');
const vscode={workspace:{textDocuments:[]},languages:{getDiagnostics:()=>[]},window:{},commands:{},ViewColumn:{},Range:class{},WorkspaceEdit:class{}};
const original=Module._load;
Module._load=function(request,parent,main){
 if(request==='vscode')return vscode;
 if(request==='./related_work')return{resolveAssigned:()=>({def:defPath,code:[code],constants:'',air:'',sff:''})};
 return original.call(this,request,parent,main);
};
const workspace=require('../src/move_constants_workspace');
(async()=>{try{
 const assets=workspace.characterShellAssets(defPath),model=await workspace.shellModelFor(assets);
 assert.strictEqual(model.moves.length,0);assert.strictEqual(model.directComponents.length,1,'a direct CNS/ZSS HitDef remains available without constants, AIR, or SFF');
 assert.strictEqual(model.overview.controllers[0].reference.kind,'hitdef');assert.match(model.previewUnavailable,/Direct source inspection remains fully available/);
 const firstElementLoop=workspace.compactAirCatalog('[Begin Action 10]\nLoopStart\n0, 0, 0, 0, 1\n')[0],noLoop=workspace.compactAirCatalog('[Begin Action 11]\n0, 0, 0, 0, 1\n')[0];assert.strictEqual(firstElementLoop.loopStart,0);assert.strictEqual(firstElementLoop.hasLoopStart,true,'LoopStart before element 1 remains distinct from an action with no explicit marker');assert.strictEqual(noLoop.hasLoopStart,false);
 const page=workspace.html(model);assert.doesNotThrow(()=>new Function(page.match(/<script>([\s\S]*)<\/script>/)[1]));assert.match(page,/directWorkspace/);
 const constants=path.join(root,'constants.zss'),air=path.join(root,'Anim.air'),sff=path.join(root,'broken.sff');fs.writeFileSync(constants,'[Constants]\nnormal.lp.moveID = 200\n');fs.writeFileSync(air,'[Begin Action 200]\nClsn1: 1\nClsn1[0] = 0, 0, 4, 4\nClsn2Default: 1\nClsn2[0] = -2, -3, 5, 6\n0, 0, 0, 0, 2\nLoopStart\n0, 1, 0, 0, 3\n');fs.writeFileSync(sff,'not an sff');const degraded=await workspace.shellModelFor({...assets,constants,air,sff});assert.strictEqual(degraded.directComponents.length,1,'a corrupt optional preview cannot block direct source inspection');assert.match(degraded.previewUnavailable,/optional constants\/preview component is unavailable/);assert.deepStrictEqual(degraded.airActions,[{number:200,line:1,frames:2,ticks:5,loopStart:1,hasLoopStart:true,clsn1Frames:1,clsn2Frames:2,clsn1Boxes:1,clsn2Boxes:2}],'the read-only AIR\/Clsn catalog survives an unavailable SFF preview');assert.strictEqual(degraded.timingSources.air.length,64,'the fallback catalog records the exact current AIR revision');
 console.log('Move Lab shell renders direct HitDefs without requiring constants, AIR, or SFF');
}finally{Module._load=original;fs.rmSync(root,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
