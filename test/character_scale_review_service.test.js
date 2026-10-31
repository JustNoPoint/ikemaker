'use strict';

const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {createCharacterScaleReviewService,ownerDef,validatedSourceSelection,BASELINES,MONITOR}=require('../src/character_scale_review_service');
const {digest}=require('../src/character_scale_review_model');

function state(){return{data:{},get(key,fallback){return Object.prototype.hasOwnProperty.call(this.data,key)?this.data[key]:fallback;},async update(key,value){if(value===undefined)delete this.data[key];else this.data[key]=value;}};}
(async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-scale-review-')),def=path.join(root,'fighter.def'),constants=path.join(root,'constants.cns'),states=path.join(root,'states.cns');
  fs.writeFileSync(def,'[Files]\ncns = constants.cns\nst = states.cns\n');
  fs.writeFileSync(constants,'[Size]\nxscale = 1\nyscale = 1\n');
  fs.writeFileSync(states,'[State 0, spark]\ntype = Explod\npostype = P1\npos = 10, -20\nscale = 1, 1\n');
  const workspaceState=state(),messages=[],configurationReads=[];let changeListener=null;
  const vscode={Uri:{file:fsPath=>({fsPath})},workspace:{textDocuments:[],workspaceFolders:[{uri:{fsPath:root}}],getConfiguration(section,uri){configurationReads.push([section,uri.fsPath]);return{get(key,fallback){return fallback;}};},onDidChangeTextDocument(listener){changeListener=listener;return{dispose(){}};}},window:{activeTextEditor:null,showInformationMessage(message){messages.push(message);return Promise.resolve(message);},showWarningMessage(message){messages.push(message);return Promise.resolve(message);}},commands:{executeCommand(){return Promise.resolve();}}};
  const context={workspaceState,subscriptions:[]},service=createCharacterScaleReviewService(vscode,context,{resolveAssigned(defPath){return{def:defPath,constants,code:[constants,states]};},associatedDefs(){return[def];}});
  const selection={filename:states,line:3,fingerprint:digest(fs.readFileSync(states,'utf8'))},selectionServices={resolveAssigned:defPath=>({def:defPath,constants,code:[constants,states]})};assert.deepStrictEqual(validatedSourceSelection(vscode,def,selection,selectionServices),selection,'Scale Review independently adopts an exact assigned Coding Insight source');assert.strictEqual(validatedSourceSelection(vscode,def,{...selection,fingerprint:'0'.repeat(64)},selectionServices),null,'Scale Review rejects stale handoff fingerprints');assert.strictEqual(validatedSourceSelection(vscode,def,{...selection,filename:path.join(root,'unassigned.cns')},selectionServices),null,'Scale Review rejects unassigned handoff files');assert.strictEqual(validatedSourceSelection(vscode,def,{...selection,line:999999},selectionServices),null,'Scale Review rejects an out-of-range exact-source line');const trailing=path.join(root,'trailing.cns'),empty=path.join(root,'empty.cns');fs.writeFileSync(trailing,'line\n');fs.writeFileSync(empty,'');const boundaryServices={resolveAssigned:defPath=>({def:defPath,constants,code:[trailing,empty]})};assert(validatedSourceSelection(vscode,def,{filename:trailing,line:1,fingerprint:digest('line\n')},boundaryServices),'a trailing newline owns one final empty editor line');assert.strictEqual(validatedSourceSelection(vscode,def,{filename:trailing,line:2,fingerprint:digest('line\n')},boundaryServices),null);assert(validatedSourceSelection(vscode,def,{filename:empty,line:0,fingerprint:digest('')},boundaryServices),'an empty editor document still owns line zero');assert.strictEqual(validatedSourceSelection(vscode,def,{filename:empty,line:1,fingerprint:digest('')},boundaryServices),null);
  assert.strictEqual(service.monitoringEnabled(def),false,'monitoring defaults off');
  const baseline=await service.capture(def);assert.strictEqual(baseline.status,'baseline');assert(workspaceState.data[BASELINES]);
  fs.writeFileSync(constants,'[Size]\nxscale = 2\nyscale = 0.5\n');
  const review=await service.capture(def);assert.strictEqual(review.status,'review');assert.deepStrictEqual(review.transition.ratio,[2,.5]);assert(review.review.coverage.checked>=2);
  const staleRun=await service.run({fsPath:def},{sourceSelection:{...selection,fingerprint:'0'.repeat(64)}});assert.match(staleRun,/stale, unassigned/,'direct Scale Review invocation fails closed before accepting a stale source handoff');
  await service.toggle({fsPath:def});assert.strictEqual(workspaceState.data[MONITOR][path.normalize(def).toLowerCase()],true);assert(configurationReads.length>0);assert(messages.some(message=>/enabled/.test(message)));
  changeListener({document:{fileName:constants}});await service.toggle({fsPath:def});await new Promise(resolve=>setTimeout(resolve,450));assert(!messages.some(message=>/Run Scale Review to inspect/.test(message)),'disabling monitoring cancels its pending timer');
  const second=path.join(root,'other.def'),shared=path.join(root,'shared.cns');let ownerPrompt='';const chosen=await ownerDef({...vscode,window:{...vscode.window,showQuickPick:async(items,options)=>{ownerPrompt=options.title;return items[1];}}},{fsPath:shared},{associatedDefs:()=>[def,second],navigation:{}});assert.strictEqual(chosen,path.resolve(second));assert.match(ownerPrompt,/Choose Exact Character Owner/);
  service.dispose();fs.rmSync(root,{recursive:true,force:true});
  console.log('Character scale review service establishes baselines, keeps monitoring default-off, detects independent axes, and persists per-character opt-in');
})().catch(error=>{console.error(error);process.exitCode=1;});
