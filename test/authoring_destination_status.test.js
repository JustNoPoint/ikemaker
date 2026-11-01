'use strict';
const assert=require('assert');
const {MAX_DESTINATIONS,MAX_DIAGNOSTICS,createDestinationStatus,statusTokens,hasProblem,projectDestinationStatuses,summarizeHand,countDiagnostics,CoalescedEventScheduler}=require('../src/authoring_destination_status');

const status=createDestinationStatus({unsaved:true,recovery:true,conflict:true,closed:true,nativeRequired:true,unavailable:true,diagnostics:{known:true,error:1200,warning:2}});
assert(Object.isFrozen(status)&&Object.isFrozen(status.diagnostics));assert.strictEqual(status.diagnostics.error,999);assert(statusTokens(status).includes('Unavailable')&&statusTokens(status).includes('999 errors'));
assert(hasProblem(status));assert(!hasProblem(createDestinationStatus({unsaved:true,closed:true,diagnostics:{known:true}})),'plain unsaved/closed do not count as hand problems');
assert.deepStrictEqual(countDiagnostics([{severity:0},{severity:1},{severity:2},{severity:'Error'},{severity:'Warning'}]),{known:true,error:2,warning:2});
assert.strictEqual(countDiagnostics(Array(MAX_DIAGNOSTICS+1).fill({severity:0})).known,false,'diagnostic overflow is unknown');assert.strictEqual(countDiagnostics(null).known,false);
const projected=projectDestinationStatuses([{id:'a'},{id:'b'}],new Map([['b',status]]));assert.deepStrictEqual(projected.map((item)=>item.id),['a','b']);assert(Object.isFrozen(projected));assert.strictEqual(summarizeHand(['a','b'],new Map(projected.map((item)=>[item.id,item]))).text,'2 files · 1 with problems');
assert.throws(()=>projectDestinationStatuses(Array(MAX_DESTINATIONS+1).fill(0).map((_,id)=>({id:String(id)})),new Map()),/safe file limit/);
(async()=>{let runs=0;const scheduler=new CoalescedEventScheduler(()=>{runs+=1;});scheduler.schedule();scheduler.schedule();await new Promise(resolve=>setImmediate(resolve));assert.strictEqual(runs,1,'bursts coalesce');scheduler.schedule();scheduler.dispose();await new Promise(resolve=>setImmediate(resolve));assert.strictEqual(runs,1,'disposed callbacks are stale no-ops');console.log('Destination status projection, bounds, aggregation and event coalescing passed');})().catch((error)=>{console.error(error);process.exitCode=1;});
