'use strict';

const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const source=fs.readFileSync(path.join(__dirname,'..','src','character_workbenches.js'),'utf8');
const start=source.indexOf('async function openCharacterSession');
const end=source.indexOf('\nasync function chooseDef',start);
const body=source.slice(start,end);

(async()=>{
  let releaseGrouped,groupedStarted,opens=0,saves=0,refreshes=0,toasts=0,closing=false;
  const groupedGate=new Promise(resolve=>{releaseGrouped=resolve;});
  const started=new Promise(resolve=>{groupedStarted=resolve;});
  const profile={id:'c:/chars/ryu',name:'Ryu',folder:'C:/chars/Ryu',defPath:'C:/chars/Ryu/Ryu.def',connectedFiles:['C:/chars/Ryu/code.zss'],files:[],addedFiles:[],assignments:{cns:[],anim:[],sprite:['C:/chars/Ryu/Ryu.sff'],sound:[]}};
  const sandbox={
    refreshedProfile:value=>value,chooseSessionOptions:async()=>['essentials'],normalized:value=>String(value).toLowerCase(),isClosingOwner:()=>closing,
    SESSION_GENERATIONS:new Map(),WORKBENCH_COLUMNS:new Map(),sharedWorkbenchColumn:()=>0,targetColumn:()=>1,Set,Number,fs:{existsSync:()=>true},
    assigned:(value,key)=>value.assignments[key]||[],categoryFor:()=> 'Code',groupedCodeFiles:()=>[],allFiles:()=>[],
    openGroupedCode:async()=>{groupedStarted();await groupedGate;return{viewColumn:1};},openFile:async()=>{opens++;return null;},
    load:()=>[profile],save:async()=>{saves++;},SESSION_OPTIONS:[{id:'essentials',label:'Essentials'}],
    vscode:{Uri:{file:fsPath=>({fsPath})},ViewColumn:{One:1},commands:{executeCommand:async()=>null},window:{showInformationMessage:()=>{toasts++;}}}
  };
  const provider={refresh(){refreshes++;}};
  vm.createContext(sandbox);vm.runInContext(`${body};this.run=openCharacterSession`,sandbox);
  const opening=sandbox.run(profile,{},provider);await started;
  sandbox.SESSION_GENERATIONS.set('c:/chars/ryu/ryu.def',1);releaseGrouped();await opening;
  assert.equal(opens,0,'a close that starts during grouped-code opening prevents later asset viewers');
  assert.equal(saves,0,'a cancelled opener does not save stale session choices');
  assert.equal(refreshes,0,'a cancelled opener does not refresh the saved workbench');
  assert.equal(toasts,0,'a cancelled opener never reports that the session opened');

  sandbox.WORKBENCH_COLUMNS.clear();closing=true;await sandbox.run(profile,{},provider);
  assert.equal(sandbox.WORKBENCH_COLUMNS.size,0,'a new session request made while the exact owner is closing never recreates its workbench column');
  assert.equal(opens,0);assert.equal(saves,0);assert.equal(toasts,0);
  console.log('Character session opener stops publishing when its owner begins closing');
})().catch(error=>{console.error(error);process.exitCode=1;});
