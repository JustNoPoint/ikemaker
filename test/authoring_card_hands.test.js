'use strict';

const assert = require('assert');
const {
  SCHEMA, VERSION, MAX_CONTEXTS, MAX_HANDS, MAX_FILES, MAX_TOTAL_BYTES,
  validateRecord, validateEnvelope, emptyRecord, reconcileCardHands, AuthoringCardHandsStore
} = require('../src/authoring_card_hands');
const { createNavigationState, projectNavigation, resolveDestinationKey } = require('../src/authoring_navigation_model');

const contextId='character\0c:/chars/ryu', ids=['a','b','c','d'], H1=`hand-${'1'.repeat(32)}`, H2=`hand-${'2'.repeat(32)}`;
const valid={contextId,handOrder:[H2,H1],hands:[{id:H1,label:'Normals',memberIds:['a']},{id:H2,label:'Specials',memberIds:['c','b']}],fileOrder:['c','a','b'],collapsedHandIds:[H2],mode:'cards'};
assert(validateRecord(valid));
assert(validateRecord({...valid,hands:[{id:H1,label:'😀'.repeat(32),memberIds:['a']},{id:H2,label:'Specials',memberIds:['c','b']}]}),'128-byte Unicode labels are allowed');
assert.strictEqual(validateRecord({...valid,hands:[{id:H1,label:'😀'.repeat(33),memberIds:['a']},{id:H2,label:'Specials',memberIds:['c','b']}]}),null);
for(const label of ['', '   ', '\n\t', '\u0000Hidden']) assert.strictEqual(validateRecord({...valid,hands:[{id:H1,label,memberIds:['a']},{id:H2,label:'Specials',memberIds:['c','b']}]}),null,'empty/control labels fail closed');
for(const id of ['h1','states-code','hand-zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',' hand-'+ '1'.repeat(32)]) assert.strictEqual(validateRecord({...valid,handOrder:[H2,id],hands:[{id,label:'Bad',memberIds:['a']},{id:H2,label:'Specials',memberIds:['c','b']}]}),null,'only exact host-generated opaque hand IDs are accepted');
assert.strictEqual(validateRecord({...valid,fileOrder:['a','a','b','c']}),null,'duplicate canonical files fail closed');
assert.strictEqual(validateRecord({...valid,hands:[{id:H1,label:'One',memberIds:['a']},{id:H2,label:'Two',memberIds:['a']}]}),null,'a file cannot belong to multiple hands');
assert.strictEqual(validateRecord({...valid,handOrder:[H1,H1]}),null);
assert.strictEqual(validateRecord({...valid,collapsedHandIds:[H2,H2]}),null);
assert.strictEqual(validateRecord({...valid,hands:Array.from({length:MAX_HANDS+1},(_,i)=>({id:`h${i}`,label:'x',memberIds:[]})),handOrder:Array.from({length:MAX_HANDS+1},(_,i)=>`h${i}`)}),null);
assert.strictEqual(validateRecord({...valid,fileOrder:Array.from({length:MAX_FILES+1},(_,i)=>`f${i}`)}),null);
assert.strictEqual(validateEnvelope({schema:SCHEMA,version:VERSION,contexts:Array.from({length:MAX_CONTEXTS+1},(_,i)=>emptyRecord(`c${i}`))}),null);
const oversized={schema:SCHEMA,version:VERSION,contexts:[{contextId:'x',handOrder:[],hands:[],fileOrder:Array.from({length:40},(_,i)=>`${i}-${'x'.repeat(8190)}`),collapsedHandIds:[],mode:'tabs'}]};
assert(Buffer.byteLength(JSON.stringify(oversized),'utf8')>MAX_TOTAL_BYTES&&validateEnvelope(oversized)===null,'total serialized bytes are bounded');
assert.strictEqual(validateEnvelope({schema:SCHEMA,version:VERSION,contexts:[valid,valid]}),null,'duplicate context identities fail closed');

const reconciled=reconcileCardHands(contextId,valid,ids);
assert.deepStrictEqual(reconciled.fileOrder,['c','a','b','d'],'surviving order is retained and new files append once in natural host order');
assert.deepStrictEqual(reconciled.handOrder,[H2,H1]);
assert.deepStrictEqual(reconciled.hands.map((hand)=>[hand.id,hand.memberIds]),[[H2,['c','b']],[H1,['a']]]);
const pruned=reconcileCardHands(contextId,reconciled,['a','d']);
assert.deepStrictEqual(pruned.fileOrder,['a','d']); assert.deepStrictEqual(pruned.hands.map((hand)=>hand.memberIds),[[],['a']]);
const deleted=reconcileCardHands(contextId,{...pruned,handOrder:[],hands:[],collapsedHandIds:[]},['a','d']);
assert.deepStrictEqual(deleted.fileOrder,['a','d'],'deleting hands never deletes files');

const state=createNavigationState({items:ids.map((id)=>({id,title:id})),order:reconciled.fileOrder,currentId:'a',mode:'cards',customGroups:reconciled.hands.map((hand)=>({id:hand.id,label:hand.label,itemIds:hand.memberIds})),collapsedHandIds:[H2]});
const projected=projectNavigation(state);
assert.deepStrictEqual(projected.visibleItems.map((item)=>item.id),['c','a','b','d'],'collapsed card hands never affect canonical files');
assert.deepStrictEqual(projected.slider,{empty:false,single:false,min:1,max:4,value:2,index:1,title:'2 of 4 · a',previousDisabled:false,nextDisabled:false});
assert.strictEqual(resolveDestinationKey(projected.visibleItems.map((item)=>item.id),'a','ArrowRight'),'b');
assert.strictEqual(projected.groups.find((group)=>group.id===H2).collapsed,true);
assert.strictEqual(projected.groups.find((group)=>group.id===H2).expanded,false,'an inactive collapsed hand stays compact');
const activeCollapsed=projectNavigation(createNavigationState({...state,currentId:'c'}));
assert.strictEqual(activeCollapsed.groups.find((group)=>group.id===H2).expanded,true,'the collapsed hand containing the current file is effectively expanded');
const tabsProjection=projectNavigation(createNavigationState({...state,mode:'tabs'}));
assert.deepStrictEqual(tabsProjection.visibleItems.map((item)=>item.id),projected.visibleItems.map((item)=>item.id),'Card-only collapse is inert in Tabs');
const fallbackState=createNavigationState({items:ids.map((id)=>({id,title:id,kind:'zss'})),order:reconciled.fileOrder,currentId:'a',mode:'cards',customGroups:reconciled.hands.map((hand)=>({id:hand.id,label:hand.label,itemIds:hand.memberIds})),autoGroups:[{id:'automatic',label:'Automatic',itemIds:ids}]});
assert(projectNavigation(fallbackState).groups.some((group)=>group.id==='automatic'&&group.itemIds.includes('d')),'new unassigned files retain an automatic fallback group');

(async()=>{
  let persisted, reject=false;
  const storage={get(){return persisted;},async update(_key,value){if(reject)throw new Error('disk full');persisted=value;}};
  const store=new AuthoringCardHandsStore(storage,'hands');
  await store.set(contextId,reconciled,()=>true,{expectedRevision:store.getWithRevision(contextId).revision});
  const before=store.serialize();reject=true;
  await assert.rejects(()=>store.set(contextId,{...reconciled,hands:reconciled.hands.map((hand)=>hand.id===H1?{...hand,label:'Changed'}:hand)},()=>true,{expectedRevision:store.getWithRevision(contextId).revision}),/disk full/);
  assert.strictEqual(store.serialize(),before,'failed persistence retains the exact prior in-memory envelope');
  const restored=new AuthoringCardHandsStore({get(){return persisted;}},'hands');
  assert.deepStrictEqual(restored.get(contextId),reconciled);
  const corrupt=new AuthoringCardHandsStore({get(){return {schema:SCHEMA,version:VERSION,contexts:[valid,valid]};}},'hands');
  assert.strictEqual(corrupt.get(contextId),null,'corrupt persisted envelopes fail closed');
  let releaseFirst;const firstBlocked=new Promise((resolve)=>{releaseFirst=resolve;}), writes=[];
  const queuedStore=new AuthoringCardHandsStore({get(){},async update(_key,value){writes.push(value);if(writes.length===1)await firstBlocked;}},'hands');
  const other=emptyRecord('character\0c:/chars/ken',['ken']);
  const firstWrite=queuedStore.set(contextId,reconciled,()=>true,{expectedRevision:0}),secondWrite=queuedStore.set(other.contextId,other,()=>true,{expectedRevision:0});releaseFirst();await Promise.all([firstWrite,secondWrite]);
  assert(queuedStore.get(contextId)&&queuedStore.get(other.contextId),'one global store queue preserves concurrent writes for different contexts');
  const sameContextA=queuedStore.getWithRevision(contextId),sameContextB=queuedStore.getWithRevision(contextId),aRecord={...sameContextA.record,mode:'tabs'};
  await queuedStore.set(contextId,aRecord,()=>true,{expectedRevision:sameContextA.revision});
  const durableAfterA=queuedStore.serialize();
  await assert.rejects(()=>queuedStore.set(contextId,{...sameContextB.record,mode:'cards'},()=>true,{expectedRevision:sameContextB.revision}),error=>error?.code==='STALE_CARD_HANDS');
  assert.strictEqual(queuedStore.serialize(),durableAfterA,'a stale same-context panel cannot overwrite the newer panel record or durable envelope');
  assert.strictEqual(queuedStore.getWithRevision(other.contextId).revision,1,'same-context CAS does not create spurious conflicts for another context');
  let durable=queuedStore.serialize(),allow=true,releaseCandidate;const candidateBlocked=new Promise((resolve)=>{releaseCandidate=resolve;}), beforeStale=durable;
  let blockNext=true;const staleStore=new AuthoringCardHandsStore({get(){return durable;},async update(_key,value){durable=value;if(blockNext){blockNext=false;await candidateBlocked;}}},'hands');
  const staleBefore=staleStore.serialize(),staleCandidate={...reconciled,mode:'tabs'},staleWrite=staleStore.set(contextId,staleCandidate,()=>allow,{expectedRevision:0});await Promise.resolve();allow=false;releaseCandidate();
  await assert.rejects(()=>staleWrite,/prior metadata was restored/);assert.strictEqual(staleStore.serialize(),staleBefore);assert.deepStrictEqual(durable,staleBefore,'a stale post-write authorization restores the prior durable envelope');
  let rollbackCalls=0,unsafeDurable=beforeStale,unsafeAllow=true,releaseUnsafe;const unsafeBlocked=new Promise((resolve)=>{releaseUnsafe=resolve;});
  const unsafeStore=new AuthoringCardHandsStore({get(){return unsafeDurable;},async update(_key,value){rollbackCalls+=1;if(rollbackCalls===1){unsafeDurable=value;await unsafeBlocked;return;}throw new Error('rollback denied');}},'hands'),unsafeBefore=unsafeStore.serialize();
  const unsafeWrite=unsafeStore.set(contextId,staleCandidate,()=>unsafeAllow,{expectedRevision:0});await Promise.resolve();unsafeAllow=false;releaseUnsafe();await assert.rejects(()=>unsafeWrite,/durable layout may need reload/);assert.strictEqual(unsafeStore.serialize(),unsafeBefore,'rollback failure retains the exact prior in-memory authority');
  console.log('Authoring card-hand bounds, reconciliation, collapse isolation and atomic persistence passed');
})().catch((error)=>{console.error(error);process.exitCode=1;});
