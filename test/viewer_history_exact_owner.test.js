'use strict';

const assert=require('assert'),Module=require('module'),path=require('path');
const notices=[],original=Module._load,vscode={window:{async showInformationMessage(message){notices.push(message)}}};Module._load=function(request,parent,main){if(request==='vscode')return vscode;return original.call(this,request,parent,main)};
const snd=require('../src/snd_viewer'),sff=require('../src/sff_viewer');Module._load=original;

(async()=>{
  const sndFile=path.resolve('C:/chars/Test/exact.snd'),sndPanel={},sndCalls=[],sndOwner={filename:sndFile,disposed:false,unavailable:false,transferPinned:false,assetHistories:{get(){return{undo:[{}],redo:[]}}},historyAction(direction){sndCalls.push(direction);return true}},sndServices={panelFor(){return sndPanel},ownerFor(panel){assert.strictEqual(panel,sndPanel);return sndOwner},showInformationMessage:async message=>notices.push(message)};
  assert.strictEqual(snd.resolveSndHistoryOwner(sndFile,sndServices),sndOwner);assert.deepStrictEqual(snd.sndViewerHistoryState(sndFile,sndServices),{available:true,undo:true,redo:false,reason:''});assert.strictEqual(await snd.requestSndViewerHistory(sndFile,'undo',sndServices),true);assert.deepStrictEqual(sndCalls,['undo']);
  for(const change of [{disposed:true},{unavailable:true},{transferPinned:true},{filename:path.resolve('C:/chars/Other/other.snd')}]){const blocked={...sndOwner,...change};assert.strictEqual(snd.resolveSndHistoryOwner(sndFile,{...sndServices,ownerFor:()=>blocked}),null)}
  assert.strictEqual(await snd.requestSndViewerHistory(sndFile,'redo',{...sndServices,panelFor:()=>null}),false);assert.match(notices.at(-1),/exact SND Viewer/);

  const sffFile=path.resolve('C:/chars/Test/exact.sff'),sffPanel={},sffCalls=[],sffOwner={filename:sffFile,disposed:false,unavailable:false,transferPinned:false,assetHistory:{undo:[],redo:[{}]},historyAction(direction){sffCalls.push(direction);return true}},sffServices={panelFor(){return sffPanel},ownerFor(panel){assert.strictEqual(panel,sffPanel);return sffOwner},showInformationMessage:async message=>notices.push(message)};
  assert.strictEqual(sff.resolveSffHistoryOwner(sffFile,sffServices),sffOwner);assert.deepStrictEqual(sff.sffViewerHistoryState(sffFile,sffServices),{available:true,undo:false,redo:true,reason:''});assert.strictEqual(await sff.requestSffViewerHistory(sffFile,'redo',sffServices),true);assert.deepStrictEqual(sffCalls,['redo']);
  for(const change of [{disposed:true},{unavailable:true},{transferPinned:true},{filename:path.resolve('C:/chars/Other/other.sff')}]){const blocked={...sffOwner,...change};assert.strictEqual(sff.resolveSffHistoryOwner(sffFile,{...sffServices,ownerFor:()=>blocked}),null)}
  assert.strictEqual(await sff.requestSffViewerHistory(sffFile,'undo',{...sffServices,panelFor:()=>null}),false);assert.match(notices.at(-1),/exact SFF Viewer/);
  console.log('SND/SFF history owner APIs bind exact filenames and reject missing, mismatched, disposed, unavailable, and Transfer owners');
})().catch(error=>{console.error(error);process.exitCode=1});
