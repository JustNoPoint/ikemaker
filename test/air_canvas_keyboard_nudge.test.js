'use strict';

const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const original=Module._load;Module._load=function(request,parent,main){if(request==='vscode')return{};return original.call(this,request,parent,main)};
const { collisionNudgeMutationPlan }=require('../src/air_viewer');Module._load=original;

const fingerprint='C'.repeat(64),evidence={target:{channel:'stable',version:'1.0'},allocationDecision:{enabled:false,status:'unsupported',capabilityFingerprint:fingerprint},capabilityFingerprint:fingerprint};
const source=`[Begin Action 900]
Clsn2: 2
Clsn2[0] = -10, -20, 10, 0
Clsn2[1] = 20, -30, 40, -5
900,0,0,0,1`;
const plan=collisionNudgeMutationPlan({airPath:'Anim.air'},source,{action:900,elementIndex:0,groupKey:'clsn2',slots:[0,1],beforeBoxes:[[-10,-20,10,0],[20,-30,40,-5]],afterBoxes:[[0,-30,20,-10],[30,-40,50,-15]],dx:10,dy:-10},evidence),result=source.slice(0,plan.patch.start)+plan.patch.replacement+source.slice(plan.patch.end);
assert(result.includes('Clsn2[0] = 0, -30, 20, -10'));
assert(result.includes('Clsn2[1] = 30, -40, 50, -15'));
assert.deepStrictEqual(plan.afterBoxes.map((box,index)=>box.map((value,coordinate)=>value-plan.beforeBoxes[index][coordinate])),[[10,-10,10,-10],[10,-10,10,-10]],'every selected box receives the same AIR-unit delta');
assert.throws(()=>collisionNudgeMutationPlan({airPath:'Anim.air'},source,{action:900,elementIndex:0,groupKey:'clsn2',slots:[0,1],beforeBoxes:[[-10,-20,10,0],[20,-30,40,-5]],afterBoxes:[[0,-30,20,-10],[30,-40,51,-15]],dx:10,dy:-10},evidence),/relative geometry/);
assert.throws(()=>collisionNudgeMutationPlan({airPath:'Anim.air'},source,{action:900,elementIndex:0,groupKey:'clsn2',slots:[0,1],beforeBoxes:[[-9,-20,10,0],[20,-30,40,-5]],afterBoxes:[[1,-30,20,-10],[30,-40,50,-15]],dx:10,dy:-10},evidence),/source box changed/);

const viewerSource=fs.readFileSync(path.join(__dirname,'../src/air_viewer.js'),'utf8');
assert(viewerSource.includes("event.target!==canvas||spriteMoveTypingTarget(event.target)||event.ctrlKey||event.metaKey||event.altKey"),'arrow nudge remains focused-canvas-only and preserves typing/native modified arrows');
assert(viewerSource.includes('const step=event.shiftKey?10:1'),'Shift+Arrow uses ten AIR units');
assert(viewerSource.includes('nudgeCollisionSelection(dx,dy)||nudgeArmedSprite(dx,dy)'),'collision selection has priority over an explicitly armed sprite');
assert(viewerSource.includes("['c','x','v']")&&viewerSource.includes("['delete','1','2','d']"),'existing clipboard and collision keyboard commands remain present');
assert(viewerSource.includes('All selected boxes retain their relative geometry. This is one undoable AIR editor change'),'multi-box nudging uses a reviewed single source transaction');
assert(viewerSource.includes("edit.scope==='frame'?'Save Frame Override':'Apply to CNS'")&&viewerSource.includes('review its chosen destination'),'Push / Size nudging retains the previously chosen destination and its existing Apply path');
assert(viewerSource.includes("document.getElementById('revertBoxEdit').addEventListener('click',()=>{abandonKeyboardCollisionNudge()")&&viewerSource.includes('selectFrameBeforeKeyboardNudge')&&viewerSource.includes('applyModelBeforeKeyboardNudge'),'Revert, frame changes, action changes, and model refreshes cancel the debounced draft');
assert(viewerSource.includes("if(!edit||edit.kind!==state.kind||action?.number!==state.action||frameIndex!==state.elementIndex){abandonKeyboardCollisionNudge();return}"),'a stale debounce is discarded without restoring old coordinates into a new edit');
console.log('AIR focused-canvas keyboard nudge planning and shortcut contracts passed');
