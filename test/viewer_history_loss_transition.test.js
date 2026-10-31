'use strict';

const assert=require('assert'),fs=require('fs'),Module=require('module'),path=require('path');
const original=Module._load;Module._load=function(request,parent,main){if(request==='vscode')return{window:{}};return original.call(this,request,parent,main)};const snd=require('../src/snd_viewer'),sff=require('../src/sff_viewer');Module._load=original;

const updates=[],sink=(filename,value)=>{updates.push({filename:path.resolve(filename),value});return true},sndFile=path.resolve('C:/chars/Test/lost.snd'),sffFile=path.resolve('C:/chars/Test/lost.sff');
assert.strictEqual(snd.publishSndHistoryUnavailable(sndFile,'SND owner closed.',{updateHistoryState:sink}),true);assert.strictEqual(sff.publishSffHistoryUnavailable(sffFile,'SFF owner closed.',{updateHistoryState:sink}),true);
assert.deepStrictEqual(updates,[
  {filename:sndFile,value:{available:false,undo:false,redo:false,reason:'SND owner closed.'}},
  {filename:sffFile,value:{available:false,undo:false,redo:false,reason:'SFF owner closed.'}}
],'viewer-loss publication targets the exact prior filename with an explicit unavailable reason');
const ordinary={transferPinned:false,disposed:false,unavailable:false},transfer={...ordinary,transferPinned:true};
assert.strictEqual(snd.publishSndHistoryState(ordinary,sndFile,{undo:[{}],redo:[]},{updateHistoryState:sink}),true);assert.strictEqual(sff.publishSffHistoryState(ordinary,sffFile,{undo:[],redo:[{}]},{updateHistoryState:sink}),true);
const beforeTransfer=updates.length;assert.strictEqual(snd.publishSndHistoryState(transfer,sndFile,{undo:[],redo:[]},{updateHistoryState:sink}),false);assert.strictEqual(sff.publishSffHistoryState(transfer,sffFile,{undo:[],redo:[]},{updateHistoryState:sink}),false);assert.strictEqual(updates.length,beforeTransfer,'same-file pinned Transfer endpoints cannot overwrite ordinary browser history state');
assert.strictEqual(snd.publishSndHistoryOwnerUnavailable(transfer,sndFile,'Transfer closed.',{updateHistoryState:sink}),false);assert.strictEqual(sff.publishSffHistoryOwnerUnavailable(transfer,sffFile,'Transfer closed.',{updateHistoryState:sink}),false);assert.strictEqual(updates.length,beforeTransfer,'closing or retargeting a same-file Transfer endpoint cannot disable ordinary browser history');
assert.deepStrictEqual(updates.slice(2),[{filename:sndFile,value:{available:true,undo:true,redo:false,reason:''}},{filename:sffFile,value:{available:true,undo:false,redo:true,reason:''}}]);
assert.strictEqual(snd.publishSndHistoryUnavailable('',undefined,{updateHistoryState:sink}),false);assert.strictEqual(sff.publishSffHistoryUnavailable('',undefined,{updateHistoryState:sink}),false);
const sndSource=fs.readFileSync(require.resolve('../src/snd_viewer'),'utf8'),sffSource=fs.readFileSync(require.resolve('../src/sff_viewer'),'utf8');
for(const [source,name] of [[sndSource,'SND'],[sffSource,'SFF']]){assert(source.includes('Viewer closed. Reopen it to use'),'dispose must invalidate '+name+' browser history');assert(source.includes('Viewer switched to another file. Reopen this exact'),'retarget must invalidate the prior '+name+' browser history');assert(source.includes('Viewer is unavailable. Reopen it to use'),'suspend must invalidate '+name+' browser history');assert(source.includes('!owner.transferPinned')||source.includes('!current.transferPinned'),'pinned Transfer disposal must not invalidate an independent ordinary '+name+' browser')}
console.log('SND/SFF Viewer close, retarget, and suspend paths publish exact-file unavailable history state');
