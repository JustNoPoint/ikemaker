'use strict';
const assert=require('assert');
const metadata=require('../src/identifier_glossary_metadata');
const {IdentifierGlossaryPersistence}=require('../src/identifier_glossary_persistence');
(async()=>{
  let value,release,writes=0,errors=[];const storage={get:()=>value,update:async(_key,next)=>{writes++;if(writes===1)await new Promise(resolve=>{release=resolve;});value=next;}},owner=new IdentifierGlossaryPersistence(storage,'glossary',{onError:error=>errors.push(error.message)}),a='a'.repeat(32),b='b'.repeat(32);
  const first=owner.mutate(store=>metadata.putAnnotation(store,{id:a,description:'first',aliases:[],favorite:false}));const second=owner.mutate(store=>metadata.putAnnotation(store,{id:b,description:'second',aliases:[],favorite:false}));await new Promise(resolve=>setImmediate(resolve));release();await Promise.all([first,second]);assert(metadata.annotationFor(owner.snapshot(),a)&&metadata.annotationFor(owner.snapshot(),b),'serialized fresh-read mutations retain both concurrent annotations');
  const before=owner.snapshot(),failed=new IdentifierGlossaryPersistence({get:()=>before,update:async()=>{throw new Error('disk full');}},'glossary',{onError:error=>errors.push(error.message)}),result=await failed.mutate(store=>metadata.toggleFavorite(store,a));assert.strictEqual(result.saved,false);assert.deepStrictEqual(failed.snapshot(),before,'a rejected durable update retains the prior in-memory state');assert(errors.includes('disk full'));
  let current=false;const stale=await owner.mutate(store=>metadata.toggleFavorite(store,a),()=>current);assert.strictEqual(stale.reason,'stale-context');
  console.log('Identifier glossary persistence serializes fresh-read merges and preserves prior state on failure');
})().catch(error=>{console.error(error);process.exitCode=1;});
