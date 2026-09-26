'use strict';
const assert=require('assert');const {FormDrafts}=require('../src/form_drafts');
(async()=>{
 let saved={},fail=false;const storage={get:()=>saved,update:async(key,value)=>{if(fail)throw Error('storage full');saved=value;}};
 const store=new FormDrafts(storage),a={base:'a',fields:[{name:'damage',value:'40',enabled:true}]};
 await Promise.all([store.stage('file-a#0',a),store.stage('file-b#0',{base:'b',fields:[]})]);
 assert(new FormDrafts(storage).read('file-a#0'));assert(new FormDrafts(storage).read('file-b#0'));
 const newer={...a,fields:[{name:'damage',value:'50',enabled:true}]};await store.stage('file-a#0',newer);
 assert.equal(await store.discard('file-a#0',a),false,'an old Apply acknowledgement cannot remove later typing');
 assert.deepEqual(store.read('file-a#0'),newer);
 fail=true;await assert.rejects(store.stage('file-c#0',a),/storage full/);assert.deepEqual(store.read('file-c#0'),a,'failed persistence retains the session draft');
 fail=false;await store.flush();assert(new FormDrafts(storage).read('file-c#0'));
 await store.discard('file-a#0',newer);assert.equal(new FormDrafts(storage).read('file-a#0'),undefined);assert(store.read('file-b#0'));
 console.log('Form draft storage retains per-context recovery, serializes writes, protects newer input, and retries storage failure');
})().catch(error=>{console.error(error);process.exitCode=1;});
