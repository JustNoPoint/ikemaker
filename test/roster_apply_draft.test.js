'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const source=fs.readFileSync(path.join(__dirname,'../src/select_def_workspace.js'),'utf8');
const start=source.indexOf("  if (message.type === 'reorderRoster') {"),branch=source.slice(start,source.indexOf("  if (message.type === 'edit')",start));
const {hash}=require('../src/mutation_safety'),{parseSelectDef}=require('../src/select_def_model'),{reorderCharacterLines}=require('../src/select_roster_preview'),{FormDrafts}=require('../src/form_drafts');
const text='[Characters]\na\nb\n',draft={uri:'roster',sourceHash:hash(text),lines:[2,1],names:['b','a']};let result=true,confirm='Apply Roster Order',duringApply,applied=0;
const rosterDrafts=new FormDrafts(),messages=[],document={uri:'roster',getText:()=>text,lineCount:4,lineAt:()=>({lineNumber:3,text:''})},panel={ikemenRosterDocument:document,webview:{postMessage:message=>messages.push(message)}};
const env={hash,reorderCharacterLines,model:parseSelectDef(text),rosterDrafts,draftKey:()=>draft.uri,vscode:{WorkspaceEdit:class{replace(){}},Range:class{},window:{showWarningMessage:async()=>confirm,showErrorMessage:message=>{throw Error(message);}},workspace:{applyEdit:async()=>{applied++;duringApply?.();return result;}}}};
vm.createContext(env);vm.runInContext('async function run(document,message,panel){'+branch+'};this.run=run',env);
const submit=()=>env.run(document,{type:'reorderRoster',sourceHash:hash(text),orderedLines:[2,1],draft},panel);
(async()=>{
 await rosterDrafts.stage('roster',draft);confirm=undefined;await submit();assert.equal(applied,0);assert.deepEqual(rosterDrafts.read('roster'),draft);
 confirm='Apply Roster Order';result=false;await submit();assert.deepEqual(rosterDrafts.read('roster'),draft);assert.equal(messages.length,0);
 result=true;const newer={...draft,lines:[1,2]};duringApply=()=>rosterDrafts.stage('roster',newer);await submit();assert.deepEqual(rosterDrafts.read('roster'),newer);assert.equal(messages.at(-1).sourceUri,'roster');
 duringApply=null;await rosterDrafts.stage('roster',draft);await submit();assert.equal(rosterDrafts.read('roster'),undefined);
 await rosterDrafts.stage('roster',draft);panel.ikemenRosterDocument=null;const before=applied;await submit();assert.equal(applied,before,'closed/rebound panel must not commit after confirmation');assert.deepEqual(rosterDrafts.read('roster'),draft);
 console.log('Roster Apply retains cancelled/failed/newer drafts, clears exact success and rejects closed-panel writes');
})().catch(error=>{console.error(error);process.exitCode=1;});

