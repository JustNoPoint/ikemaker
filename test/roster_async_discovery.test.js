'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os'),Module=require('module');const original=Module._load;
const root=fs.mkdtempSync(path.join(os.tmpdir(),'roster-discovery-'));let cancel=false,change=false,edits=0,picks=0;const warnings=[];
fs.mkdirSync(path.join(root,'chars'));fs.mkdirSync(path.join(root,'stages'));fs.writeFileSync(path.join(root,'chars','one.def'),'[Info]\nname=One');fs.writeFileSync(path.join(root,'chars','two.def'),'[Info]\nname=Two');fs.writeFileSync(path.join(root,'stages','arena.zip'),'');
const doc={fileName:path.join(root,'data','select.def'),uri:{toString:()=> 'select'},version:1,getText:()=> '[Characters]\none.def\n[ExtraStages]\n',eol:1};
const api={ProgressLocation:{Notification:1},EndOfLine:{CRLF:2},Position:class{},WorkspaceEdit:class{insert(){}},workspace:{applyEdit:async()=>{edits++;return true;}},window:{withProgress:async(options,fn)=>{assert(options.cancellable);return fn({report(){}},{isCancellationRequested:cancel});},showWarningMessage:message=>warnings.push(message),showInformationMessage(){},showQuickPick:async choices=>{picks++;if(change)doc.version++;return[choices[0]];}}};
Module._load=function(name,parent,main){if(name==='vscode')return api;if(parent?.filename.endsWith('select_def_workspace.js')){if(name==='./launch_controls')return{handleLaunchMessage:async()=>false};if(name==='./select_roster_preview')return{...original.call(this,name,parent,main),gameRoot:()=>root};}return original.call(this,name,parent,main);};
(async()=>{
 const workspace=require('../src/select_def_workspace');
 const choices=await workspace.installedCharacters(doc,{characters:[{name:'one.def'}]});assert.equal(choices.length,1);assert.equal(choices[0].reference,'two.def');
 const stages=await workspace.installedStages(doc,{stages:[]});assert.equal(stages[0].reference,'stages/arena.zip');
 cancel=true;await workspace.handle(doc,{type:'addInstalled'});assert.equal(picks,0);assert.equal(edits,0);
 cancel=false;change=true;await workspace.handle(doc,{type:'addInstalled'});assert.equal(edits,0);assert(warnings.at(-1).includes('roster changed'));
 change=false;await workspace.handle(doc,{type:'addInstalled'});assert.equal(edits,1);
 console.log('Roster installed-content actions await scanning, filter existing entries, honor cancellation, and reject stale insertion positions');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{Module._load=original;fs.rmSync(root,{recursive:true,force:true});});
