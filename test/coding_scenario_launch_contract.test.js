'use strict';

const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const Module=require('module');
const original=Module._load;
class TreeItem{}
Module._load=function(request,parent,main){if(request==='vscode')return{TreeItem,TreeItemCollapsibleState:{Collapsed:1,None:0},env:{uiKind:1},UIKind:{Web:2},workspace:{workspaceFolders:[],getConfiguration:()=>({get:(_key,fallback)=>fallback})},window:{showQuickPick:async()=>null,showInformationMessage(){},showErrorMessage(){}},commands:{}};return original.call(this,request,parent,main);};
const {launchScenarioOwner}=require('../src/ikemen_hub');Module._load=original;

(async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-scenario-launch-')),ryu=path.join(root,'chars','Ryu','Ryu.def'),morrigan=path.join(root,'chars','Morrigan','Morrigan.def'),exe=path.join(root,'Ikemen_GO.exe');fs.mkdirSync(path.dirname(ryu),{recursive:true});fs.mkdirSync(path.dirname(morrigan),{recursive:true});fs.writeFileSync(ryu,'[Info]\n');fs.writeFileSync(morrigan,'[Info]\n');fs.writeFileSync(exe,'fixture');
  const calls=[],base={hostCapabilities:()=>({ikemenLaunch:true}),findGameRoot:()=>root,chooseStage:async()=> 'stages/test.def',launchTraining:async(...args)=>calls.push(['training',...args]),launchVersus:async(...args)=>calls.push(['versus',...args])};
  const training=await launchScenarioOwner({ownerDef:ryu,mode:'training'},base);assert.strictEqual(training.status,'launched');assert.strictEqual(training.character,'chars/Ryu/Ryu.def');assert.strictEqual(calls[0][2][0],'chars/Ryu/Ryu.def');assert.strictEqual(calls[0][3][0],'chars/Ryu/Ryu.def','the reviewed exact owner is supplied to both fighters');
  const versus=await launchScenarioOwner({ownerDef:morrigan,mode:'versus'},base);assert.strictEqual(versus.status,'launched');assert.strictEqual(calls[1][2][0],'chars/Morrigan/Morrigan.def','another open character cannot replace the captured scenario owner');
  const cancelled=await launchScenarioOwner({ownerDef:ryu,mode:'training'},{...base,chooseStage:async()=>null});assert.strictEqual(cancelled.status,'cancelled');assert.match(cancelled.reason,/cancelled/i);
  const unavailable=await launchScenarioOwner({ownerDef:ryu,mode:'training'},{...base,hostCapabilities:()=>({ikemenLaunch:false,reason:'web'})});assert.strictEqual(unavailable.status,'unavailable');
  const missingEngine=await launchScenarioOwner({ownerDef:ryu,mode:'game'},{...base,enginePath:()=>path.join(root,'missing.exe')});assert.strictEqual(missingEngine.status,'unavailable');assert.match(missingEngine.reason,/executable was not found/i);
  let runtimeSpec=null;const game=await launchScenarioOwner({ownerDef:ryu,mode:'game'},{...base,enginePath:()=>exe,runtimeLaunch:async spec=>{runtimeSpec=spec;}});assert.strictEqual(game.status,'manual-setup');assert.strictEqual(game.exactOwnerSelected,false);assert.match(game.reason,/Select chars\/Ryu\/Ryu\.def manually/);assert.strictEqual(runtimeSpec.cwd,root);assert.strictEqual(runtimeSpec.mode,'normal');assert.deepStrictEqual(runtimeSpec.args,[],'normal game does not falsely claim owner preselection');
  fs.rmSync(root,{recursive:true,force:true});console.log('Saved scenario launch uses exact owners for training/versus and labels normal-game character selection as manual');
})().catch(error=>{console.error(error);process.exitCode=1;});
