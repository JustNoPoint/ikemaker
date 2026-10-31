'use strict';
const assert=require('assert'),vm=require('vm'),Module=require('module'),original=Module._load;
Module._load=function(request,parent,isMain){if(request==='vscode')return{};return original.call(this,request,parent,isMain);};
const {page,hitDefControlAvailability,hitDefListboxTarget,hitDefPostWriteFailure}=require('../src/hitdef_workspace');
Module._load=original;

let state=hitDefControlAvailability({currentIndex:0,blockCount:2,duplicateCount:0,changed:false,visualState:'unavailable',actionCount:0,fileCount:1,fileIndex:0});
assert.equal(state.previous.enabled,false);assert.match(state.previous.reason,/first HitDef/);
assert.equal(state.next.enabled,true);
assert.equal(state.apply.enabled,false);assert.match(state.apply.reason,/No field changes/);
assert.equal(state.visual.enabled,false);assert.match(state.visual.reason,/Choose a character/);
assert.equal(state.fileChoice.enabled,false);assert.match(state.fileChoice.reason,/No other connected/);
state=hitDefControlAvailability({currentIndex:1,blockCount:2,duplicateCount:1,changed:true,visualState:'ready',actionCount:3,sparkEnabled:false,fileCount:3,fileIndex:1,busy:true});
for(const key of ['previous','next','apply','create','filePrevious','fileNext','fileChoice']){assert.equal(state[key].enabled,false,key);assert.match(state[key].reason,/Wait/);}
state=hitDefControlAvailability({currentIndex:1,blockCount:2,duplicateCount:0,changed:true,visualState:'ready',actionCount:3,sparkEnabled:true,fileCount:3,fileIndex:1});
for(const key of ['previous','apply','visual','spark','filePrevious','fileNext','fileChoice'])assert.equal(state[key].enabled,true,key);
assert.equal(hitDefListboxTarget({length:4,index:2,key:'Home'}),0);assert.equal(hitDefListboxTarget({length:4,index:2,key:'End'}),3);assert.equal(hitDefListboxTarget({length:4,index:0,key:'ArrowLeft'}),0);assert.equal(hitDefListboxTarget({length:4,index:2,key:'ArrowDown'}),3);assert.equal(hitDefListboxTarget({length:0,index:0,key:'End'}),-1);
for(const action of ['apply','new']){const message=hitDefPostWriteFailure(action,Error('refresh failed'));assert.match(message,/open document/);assert.match(message,/still unsaved/);assert.match(message,/Do not repeat the action blindly/);assert.match(message,/Undo/);assert.match(message,/Follow Cursor/);assert.doesNotMatch(message,/Nothing was changed/);}

const html=page({file:'move.zss',fileLabel:'move.zss',syntax:'zss',sourceState:{available:true,dirty:false},currentIndex:0,blocks:[{}],duplicates:[],groups:[],description:'Attack',visual:{state:'unavailable',detail:'Choose character.'}});
for(const token of ['role="listbox"','role="option"','aria-selected','role="status"','aria-live="polite"','role="alert"','tabindex="0" role="img"','keyboard-editable alternative','hitdefMutationState','aria-disabled','ArrowDown','focusSnapshot','preventScroll'])assert.ok(html.includes(token),`Missing ${token}`);
for(const script of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]))assert.doesNotThrow(()=>new vm.Script(script));
console.log('HitDef control-state, keyboard-listbox, live-status, and generated-client checks passed');
