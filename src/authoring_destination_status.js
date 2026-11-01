'use strict';

const MAX_DESTINATIONS=512, MAX_DIAGNOSTICS=4096;
function plain(value){return value&&typeof value==='object'&&!Array.isArray(value);}
function freeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.values(value).forEach(freeze);return Object.freeze(value);}
function boundedCount(value){return Number.isSafeInteger(value)&&value>=0?Math.min(999,value):0;}
function createDestinationStatus(value={}){
  const diagnostics=plain(value.diagnostics)?value.diagnostics:{};
  return freeze({unsaved:value.unsaved===true,recovery:value.recovery===true,conflict:value.conflict===true,closed:value.closed===true,nativeRequired:value.nativeRequired===true,unavailable:value.unavailable===true,diagnostics:{known:diagnostics.known===true,error:boundedCount(diagnostics.error),warning:boundedCount(diagnostics.warning)}});
}
function statusTokens(status){const value=createDestinationStatus(status),tokens=[];if(value.unavailable)tokens.push('Unavailable');if(value.nativeRequired)tokens.push('Native editor required');if(value.conflict)tokens.push('Conflict');if(value.recovery)tokens.push('Recovery');if(value.unsaved)tokens.push('Unsaved');if(value.closed)tokens.push('Closed');if(value.diagnostics.known){if(value.diagnostics.error)tokens.push(`${value.diagnostics.error} error${value.diagnostics.error===1?'':'s'}`);if(value.diagnostics.warning)tokens.push(`${value.diagnostics.warning} warning${value.diagnostics.warning===1?'':'s'}`);}else tokens.push('Diagnostics unknown');return Object.freeze(tokens);}
function hasProblem(status){const value=createDestinationStatus(status);return value.unavailable||value.nativeRequired||value.conflict||value.recovery||value.diagnostics.error>0||value.diagnostics.warning>0;}
function projectDestinationStatuses(items,statuses){if(!Array.isArray(items)||items.length>MAX_DESTINATIONS)throw new RangeError('Destination status projection exceeds its safe file limit.');const source=statuses instanceof Map?statuses:new Map(Object.entries(plain(statuses)?statuses:{}));return freeze(items.map((item)=>({...item,status:createDestinationStatus(source.get(item.id))})));}
function summarizeHand(itemIds,byId){const ids=Array.isArray(itemIds)?itemIds.slice(0,MAX_DESTINATIONS):[],problems=ids.reduce((count,id)=>count+(hasProblem(byId.get(id)?.status)?1:0),0);return freeze({files:ids.length,problems,text:`${ids.length} file${ids.length===1?'':'s'} · ${problems} with problems`});}
function countDiagnostics(entries){if(!Array.isArray(entries))return freeze({known:false,error:0,warning:0});if(entries.length>MAX_DIAGNOSTICS)return freeze({known:false,error:0,warning:0});let error=0,warning=0;for(const entry of entries){const severity=entry?.severity;if(severity===0||severity==='Error')error+=1;else if(severity===1||severity==='Warning')warning+=1;}return freeze({known:true,error:boundedCount(error),warning:boundedCount(warning)});}
class CoalescedEventScheduler{
  constructor(run){this.run=run;this.pending=false;this.disposed=false;this.generation=0;}
  schedule(){if(this.disposed||this.pending)return;this.pending=true;const generation=this.generation;queueMicrotask(()=>{this.pending=false;if(!this.disposed&&generation===this.generation)this.run(generation);});}
  invalidate(){this.generation+=1;this.pending=false;}
  dispose(){this.disposed=true;this.generation+=1;this.pending=false;}
}
module.exports={MAX_DESTINATIONS,MAX_DIAGNOSTICS,createDestinationStatus,statusTokens,hasProblem,projectDestinationStatuses,summarizeHand,countDiagnostics,CoalescedEventScheduler};
