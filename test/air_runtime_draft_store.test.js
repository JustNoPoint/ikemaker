'use strict';
const assert=require('assert');
const {RuntimeDraftStore,prefixFor,normalizeEntries,mergeEntries}=require('../src/air_runtime_drafts');

(async()=>{
 let saved={},fail=false;
 const storage={get:(key,fallback)=>saved[key]??fallback,update:async(key,value)=>{if(fail)throw Error('storage full');saved[key]=value;}};
 const air='C:\\Game\\chars\\Ryu\\Anim.air',other='C:\\Game\\chars\\Ken\\Anim.air';
 const key=prefixFor(air)+'200|1|width',record={value:{values:[10,20]},revision:1};
 let store=new RuntimeDraftStore(storage);
 await store.sync(air,{[key]:record});
 assert.deepEqual(store.read(air)[key],record);
 store=new RuntimeDraftStore(storage);
 assert.deepEqual(store.read(air)[key],record,'host recovery survives a new AIR panel/extension store instance');
 assert.deepEqual(store.read(other),{},'drafts are isolated by AIR source');
 assert.equal(await store.finish(air,key,{...record,revision:2}),false,'a stale acknowledgement cannot clear recovery');
 const newer={value:{values:[30,40]},revision:2};
 await store.sync(air,{[key]:newer});
 assert.equal(await store.finish(air,key,record),false,'later typing survives an older saved request');
 assert.deepEqual(store.read(air)[key],newer);
 assert.equal(await store.finish(air,key,newer),true);
 assert.deepEqual(store.read(air),{},'the exact saved draft clears even if the panel closes before receiving its acknowledgement');
 await assert.rejects(store.sync(air,{[prefixFor(other)+'200|1|width']:record}),/does not match/);
 assert.throws(()=>normalizeEntries(air,{[key]:{value:{},revision:0}}),/does not match/);
 assert.deepEqual(mergeEntries({[key]:record},{[key]:newer})[key],newer,'newest revision wins while host and retained webview state merge');
 fail=true;await assert.rejects(store.sync(air,{[key]:record}),/storage full/);assert.deepEqual(store.read(air)[key],record,'failed persistence keeps the in-session recovery record');
 fail=false;await store.flush();store=new RuntimeDraftStore(storage);assert.deepEqual(store.read(air)[key],record,'a later flush retries failed local persistence');
 console.log('AIR runtime host drafts survive direct close/reopen, isolate sources, preserve newer edits, clear exact saves, validate scope, and retry storage failure');
})().catch(error=>{console.error(error);process.exitCode=1;});

