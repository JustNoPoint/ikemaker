'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const {hash}=require('../src/mutation_safety');

const source=fs.readFileSync(path.join(__dirname,'../src/move_constants_workspace.js'),'utf8');
const body=source.slice(source.indexOf('async function openStateTransitionRoute('),source.indexOf('function validProjectileEditValues('));
async function scenario({route='f'.repeat(48),active=true,current=true,disposed=false,generation=4,snapshots=3,mutateOnOpen=false,mutateOnShow=false}={}){
 const warnings=[],targetText='[StateDef 500]\nctrl = 0\n',authority={route,generation:4,targetPath:'C:/Hero/states.zss',targetHash:hash(targetText),targetStart:0,targetEnd:14,targetLine:0,state:500},record={kind:'state-transition',authority},owner={disposed,panel:{active},projectileGeneration:generation,projectileRoutes:new Map([[route,record]]),projectileConsumedRoutes:new Set()};let valid=true,shows=0;
 const document={fileName:authority.targetPath,text:targetText,getText(){return this.text},positionAt(offset){return{offset}}},editor={document,selection:null,revealed:null,revealRange(range){this.revealed=range}};const queue=Array.from({length:snapshots},()=>({authority}));
 const sandbox={hash,identity:value=>String(value).toLowerCase(),currentStateTransitionRoute:()=>valid?(queue.shift()||null):null,vscode:{Uri:{file:fsPath=>({fsPath})},Range:class Range{constructor(start,end){this.start=start;this.end=end}},Selection:class Selection{constructor(start,end){this.start=start;this.end=end}},TextEditorRevealType:{InCenter:1},workspace:{openTextDocument:async()=>{if(mutateOnOpen)valid=false;return document}},window:{showTextDocument:async()=>{shows++;if(mutateOnShow)valid=false;return editor},showWarningMessage:message=>warnings.push(message)}}};vm.runInNewContext(body,sandbox);const result=await sandbox.openStateTransitionRoute(owner,route,{isCurrent:()=>current});return{result,warnings,owner,editor,shows,invoke:()=>sandbox.openStateTransitionRoute(owner,route,{isCurrent:()=>current})};
}
(async()=>{const good=await scenario();assert.strictEqual(good.result.state,500);assert.strictEqual(good.shows,1);assert.strictEqual(good.editor.selection.start.offset,0);assert.strictEqual(good.editor.selection.end.offset,14);assert(good.editor.revealed);await good.invoke();assert.strictEqual(good.shows,1,'one-use transition route cannot replay');for(const options of [{active:false},{current:false},{disposed:true},{generation:5},{route:'short'},{snapshots:0},{mutateOnOpen:true},{mutateOnShow:true}]){const denied=await scenario(options);assert.strictEqual(denied.editor.selection,null,'inactive, forged, stale, or raced transition authority never selects source');}console.log('Move Lab ChangeState host consumes exact authority and rechecks every native reveal await');})().catch(error=>{console.error(error);process.exitCode=1});
