'use strict';
const assert=require('assert'),close=require('../src/viewer_close'),vm=require('vm');
function makePanel(state){const listeners=[];return{title:'Draft view',webview:{onDidReceiveMessage:fn=>{listeners.push(fn);return{dispose(){}};},postMessage:m=>{queueMicrotask(()=>listeners.forEach(fn=>fn({type:'ikemenCloseState',id:m.id,...state})));return true;}},onDidDispose(){},reveal(){}};}
(async()=>{
 let answer='Close Without Applying',prompts=0,kept=0,fail=false,busy=false,choices;
 const api={window:{showInformationMessage:async()=>{},showWarningMessage:async(message,options,...buttons)=>{prompts++;choices=buttons;return answer;}}};
 const state={clean:false,busy:true,canKeepDraft:true},panel=makePanel(state);close.support(panel,{isBusy:()=>busy,keepDraft:async()=>{if(fail)throw Error('storage full');kept++;}});
 assert.equal(await close.prepare([panel],api),false);assert.equal(prompts,0,'pending write never offers a discard override');
 state.busy=false;answer='Keep Draft and Close';assert.equal(await close.prepare([panel],api),true);assert.equal(kept,1);assert(choices.includes(answer));
 fail=true;assert.equal(await close.prepare([panel],api),false,'storage failure retains the panel');fail=false;
 state.clean=true;busy=true;const before=prompts;assert.equal(await close.prepare([panel],api),false);assert.equal(prompts,before,'host busy state wins over clean client');
 busy=false;state.clean=false;state.canKeepDraft=false;answer=undefined;assert.equal(await close.prepare([panel],api),false);assert(!choices.includes('Keep Draft and Close'),'unrecoverable forms cannot promise draft recovery');
 state.verified=false;const failedChecks=prompts;assert.equal(await close.prepare([panel],api),false);assert.equal(prompts,failedChecks,'failed inspection offers no discard override');
 const messages=[],handlers={};let formDirty=false;const env={document:{querySelectorAll:()=>[],addEventListener(){}},addEventListener:(type,fn)=>{handlers[type]=fn;},vscode:{postMessage:m=>messages.push(m)},ikemenIsBusy:()=>true,ikemenCanKeepDraft:()=>true,ikemenHasUnappliedForms:()=>formDirty,ikemenCanLeaveAsset:()=>false};vm.runInNewContext(close.clientScript(),env);
 handlers.message({data:{type:'ikemenPrepareClose',id:1}});assert(messages.at(-1).busy);assert(!messages.at(-1).clean);
 env.ikemenIsBusy=()=>false;handlers.message({data:{type:'ikemenPrepareClose',id:2}});assert(messages.at(-1).canKeepDraft);formDirty=true;env.ikemenCanKeepDraft=()=>false;handlers.message({data:{type:'ikemenPrepareClose',id:3}});assert(!messages.at(-1).canKeepDraft,'additional unprotected input prevents a keep-all promise');
 env.ikemenCanKeepDraft=()=>true;handlers.message({data:{type:'ikemenPrepareClose',id:4}});assert(messages.at(-1).canKeepDraft,'authoritative stored drafts can be kept');
 env.ikemenHasUnappliedForms=()=>{throw Error('model unavailable');};handlers.message({data:{type:'ikemenPrepareClose',id:4}});assert.equal(messages.at(-1).verified,false);
 console.log('Close protocol blocks pending writes, verifies draft persistence, retains failed recovery and distinguishes unprotected forms');
})().catch(error=>{console.error(error);process.exitCode=1;});
