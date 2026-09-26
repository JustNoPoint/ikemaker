const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const source=fs.readFileSync(path.join(__dirname,'../src/select_def_workspace.js'),'utf8');
const helpers=source.split('\n').filter(line=>/^function (persistOrder|receiveRosterModel|discardOrderDraft|restoreOrderDraft|resetOrder)\(/.test(line)).join('\n');
const initial={uri:'roster',sourceHash:'old',characters:[{line:1,name:'A'},{line:2,name:'B'}],preview:{cells:[{line:1,draggable:true},{line:2,draggable:true}]}};
const env={model:initial,dirty:true,orderDraft:null,orderConflict:false,pendingModel:null,workingLines:[2,1],selectedLines:new Set(),faceCell:'',vscode:{postMessage(){}},saveState(){},render(){}};vm.createContext(env);vm.runInContext(helpers,env);
env.persistOrder();assert.deepEqual(Array.from(env.orderDraft.names),['B','A']);env.receiveRosterModel({...initial,preview:{...initial.preview,updated:true}});assert.equal(env.dirty,true);assert.deepEqual(Array.from(env.workingLines),[2,1]);assert.equal(env.orderConflict,false);
const changed={...initial,sourceHash:'new'};env.receiveRosterModel(changed);assert.equal(env.orderConflict,true);assert.equal(env.model.sourceHash,'old');assert.deepEqual(Array.from(env.orderDraft.names),['B','A']);env.discardOrderDraft();assert.equal(env.model.sourceHash,'new');assert.equal(env.dirty,false);assert.equal(env.orderDraft,null);
env.restoreOrderDraft({uri:'roster',sourceHash:'new',lines:[2,1],names:['B','A']});assert.equal(env.dirty,true);assert.deepEqual(Array.from(env.workingLines),[2,1]);
vm.runInContext(source.match(/globalThis\.ikemenCanLeaveAsset=\(\)=>!dirty;/)[0],env);assert.equal(env.ikemenCanLeaveAsset(),false,'drag-only roster draft must veto close');env.discardOrderDraft();assert.equal(env.ikemenCanLeaveAsset(),true);
// Exercise the actual host branch with a source changing while confirmation is open.
const start=source.indexOf("  if (message.type === 'reorderRoster') {"),end=source.indexOf("  if (message.type === 'edit')",start),branch=source.slice(start,end);
const {hash}=require('../src/mutation_safety'),{parseSelectDef}=require('../src/select_def_model'),{reorderCharacterLines}=require('../src/select_roster_preview');
let text='[Characters]\na\nb\n',prompts=0,writes=0;
const host={hash,reorderCharacterLines,model:parseSelectDef(text),vscode:{window:{showWarningMessage:async()=>{prompts++;if(prompts===1){text+='; external change\n';return 'Apply Roster Order';}}},workspace:{applyEdit:async()=>{writes++;return true;}}}};vm.createContext(host);vm.runInContext('async function run(document,message,panel){'+branch+'};this.run=run',host);
(async()=>{await host.run({getText:()=>text},{type:'reorderRoster',sourceHash:hash(text),orderedLines:[2,1]},{});assert.equal(writes,0);assert.equal(prompts,2);console.log('Roster drafts survive refresh, source conflicts block apply, discard adopts latest source; concurrent changes are not overwritten');})().catch(error=>{console.error(error);process.exitCode=1;});
