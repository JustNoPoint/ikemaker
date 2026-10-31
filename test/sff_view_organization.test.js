'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const {snapshot,createRecord,reconcile,exactOrder,moveMarkedBlock,ViewOrganizationStore,KEY}=require('../src/sff_view_organization');
const sprite=(group,number,offset,extra={})=>({group,number,width:2,height:2,axisX:0,axisY:0,format:0,colorDepth:8,paletteIndex:0,dataOffset:offset,dataSize:4,...extra});
const palette=(group,number,index,extra={})=>({group,number,index,dataSize:4,...extra});
const archive={filename:'fighter.sff',header:{literalDataOffset:0},buffer:Buffer.from('AAAABBBBCCCC'),palettes:[palette(1,0,0),palette(1,1,1)],sprites:[sprite(1,0,0),sprite(1,0,4),sprite(2,0,8)]};
const physicalBefore=archive.sprites.map(item=>[item.group,item.number,item.dataOffset]);
const scope=snapshot(archive);assert.strictEqual(scope.rows.length,3);assert.notStrictEqual(scope.rows[0].rowId,scope.rows[1].rowId,'duplicate group/index physical occurrences receive distinct opaque row ids');
const order=[scope.rows[2].rowId,scope.rows[0].rowId,scope.rows[1].rowId],record=createRecord('Effects first',scope,order),same=reconcile(record,scope);assert.deepStrictEqual(same.orderedRowIds,order);assert.strictEqual(same.exact,true);
assert.deepStrictEqual(archive.sprites.map(item=>[item.group,item.number,item.dataOffset]),physicalBefore,'creating and reconciling a view order never mutates physical SFF order');
assert.throws(()=>exactOrder(scope,[scope.rows[0].rowId,scope.rows[0].rowId,scope.rows[2].rowId]),/duplicate|stale/);

const blockOrder=['a','b','c','d','e'];
const movedBlock=moveMarkedBlock(blockOrder,['b','d'],'e','after');
assert.deepStrictEqual([...movedBlock.order],['a','c','e','b','d'],'discontiguous marked rows move as one stable block in their existing visual order');
assert.deepStrictEqual([...movedBlock.movedRowIds],['b','d'],'the result reports the exact moved rows in stable order');
assert.strictEqual(movedBlock.changed,true);
assert.deepStrictEqual([...moveMarkedBlock(blockOrder,['b','c'],'d','before').order],blockOrder,'dropping an already-adjacent block at its current boundary is a no-op');
assert.strictEqual(moveMarkedBlock(blockOrder,['b','c'],'b','after').changed,false,'dropping onto a row inside the marked block is safely ignored');
assert.throws(()=>moveMarkedBlock(blockOrder,['missing'],'e'),/missing|stale/);
assert.throws(()=>moveMarkedBlock(blockOrder,['b'],'missing'),/missing|stale/);
assert.throws(()=>moveMarkedBlock(blockOrder,['b','b'],'e'),/distinct/);
assert.deepStrictEqual(blockOrder,['a','b','c','d','e'],'block movement never mutates the caller-owned draft order');

for(const [label,edited] of [
  ['pixel edit',{...archive,buffer:Buffer.from('AAAAXXXXCCCC')}],
  ['axis edit',{...archive,sprites:archive.sprites.map((item,index)=>index===0?{...item,axisX:9}:item)}],
  ['palette assignment edit',{...archive,sprites:archive.sprites.map((item,index)=>index===0?{...item,paletteIndex:1}:item)}]
]){const result=reconcile(record,snapshot(edited));assert.strictEqual(result.unresolvedCount,0,label+' remains bound to the same physical occurrence');assert.strictEqual(result.unplacedRowIds.length,0);assert.strictEqual(result.orderedRowIds[0],snapshot(edited).rows[2].rowId,label+' preserves the saved first row');assert.ok(result.changedCount>=1,label+' is visibly reported as changed');}

const linkedArchive={...archive,sprites:[sprite(1,0,0),sprite(1,0,0,{dataSize:0,link:0}),sprite(1,0,0,{dataSize:0,link:1})]},linkedScope=snapshot(linkedArchive),linkedOrder=[linkedScope.rows[2].rowId,linkedScope.rows[0].rowId,linkedScope.rows[1].rowId],linkedRecord=createRecord('Links',linkedScope,linkedOrder),retargeted={...linkedArchive,sprites:[linkedArchive.sprites[0],{...linkedArchive.sprites[1],link:2},linkedArchive.sprites[2]]},retargetedScope=snapshot(retargeted),retargetedResult=reconcile(linkedRecord,retargetedScope);
assert.notStrictEqual(linkedScope.rows[1].topology,retargetedScope.rows[1].topology,'exact authored link targets participate in topology evidence');
assert.strictEqual(retargetedResult.unresolvedCount,0,'an unchanged physical inventory retains its custom positions after link retargeting');assert.ok(retargetedResult.topologyChangedCount>=1,'link retargeting is visibly reported');assert.strictEqual(retargetedResult.orderedRowIds[0],retargetedScope.rows[2].rowId);

const movedArchive={...archive,buffer:Buffer.from('CCCCAAAABBBB'),sprites:[sprite(2,0,0),sprite(1,0,4),sprite(1,0,8)]},movedScope=snapshot(movedArchive),moved=reconcile(record,movedScope);assert.strictEqual(moved.unresolvedCount,0,'uniquely moved unchanged sprite evidence reconciles');assert.strictEqual(moved.unplacedRowIds.length,0);assert.strictEqual(moved.exact,false,'archive drift is visible even when rows reconcile');
const ambiguousArchive={...archive,buffer:Buffer.from('AAAACCCCAAAA'),sprites:[sprite(1,0,0),sprite(2,0,4),sprite(1,0,8)]},ambiguous=reconcile(record,snapshot(ambiguousArchive));assert.ok(ambiguous.unresolvedCount>=1,'ambiguous duplicate occurrences remain unresolved after topology changes');

const viewerSource=fs.readFileSync(path.join(__dirname,'../src/sff_viewer.js'),'utf8');
assert.match(viewerSource,/className='view-order-handle'/,'custom ordering uses a dedicated drag handle');
assert.match(viewerSource,/Math\.hypot\([^)]*\)>=8/,'pointer reorder requires a deliberate eight-pixel movement');
assert.match(viewerSource,/pointercancel/,'pointer cancellation abandons a drag');
assert.match(viewerSource,/event\.key==='Escape'/,'Escape abandons a drag');
assert.match(viewerSource,/type:'prepareViewOrganization'/,'the client asks the host to prepare an exact reviewed order');
assert.match(viewerSource,/type:'commitViewOrganization'/,'the client commits only the host-issued reviewed token');
assert.match(viewerSource,/pendingViewOrganization=null/,'the host consumes pending order authority before commit checks');

let data={};let failUpdate=false,commitThenThrow=false;const state={get:(key,fallback)=>key===KEY?data:fallback,update:async(key,value)=>{assert.strictEqual(key,KEY);if(commitThenThrow){commitThenThrow=false;data=value;throw new Error('ack lost');}if(failUpdate){failUpdate=false;throw new Error('storage unavailable');}data=value}},store=new ViewOrganizationStore(state);
(async()=>{
  const first=await store.write(archive.filename,0,[record]);assert.strictEqual(first.generation,1);assert.strictEqual(store.read(archive.filename).records[0].name,'Effects first');
  await assert.rejects(()=>store.write(archive.filename,0,[record]),/another window/,'stale generation cannot overwrite a newer organization');
  failUpdate=true;await assert.rejects(()=>store.write(archive.filename,1,[record]),error=>error.committed===true&&error.verified===false);const afterFailure=await store.write(archive.filename,1,[record]);assert.strictEqual(afterFailure.generation,2,'the serialization queue recovers after a failed write');
  commitThenThrow=true;await assert.rejects(()=>store.write(archive.filename,2,[record]),error=>error.committed===true&&error.verified===false);assert.strictEqual(store.read(archive.filename).generation,3,'write-then-throw remains visibly committed-but-uncertain');
  const good=data;data={...good,[path.resolve(archive.filename).toLowerCase()]:{generation:2,records:[{bad:true}]}};await assert.rejects(()=>store.write(archive.filename,2,[record]),/invalid|malformed/,'malformed existing storage is never overwritten');data=good;
  let verifyData={};const verifyState={get:(key,fallback)=>key===KEY?verifyData:fallback,update:async()=>{}},verifyStore=new ViewOrganizationStore(verifyState);await assert.rejects(()=>verifyStore.write('verify.sff',0,[record]),error=>error.committed===true&&error.verified===false,'a post-update reread mismatch is committed-but-uncertain');
  console.log('SFF view organizations preserve edited physical identity without rewriting the archive');
})().catch(error=>{console.error(error);process.exitCode=1});
