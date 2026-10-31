'use strict';

const path=require('path');
const {hash}=require('./mutation_safety');
const {parseStateSource}=require('./state_transfer_model');
const {MAX_SOURCE_BYTES}=require('./exact_controller_resource_authority');

const MAX_ASSIGNED_FILES=128,MAX_AGGREGATE_BYTES=32*1024*1024,MAX_INCOMING_PER_STATE=256,MAX_INCOMING_TOTAL=4096;
const canonical=value=>path.resolve(String(value||'')).toLowerCase();

function exactStateNumber(expression){
 const value=String(expression||'').trim();if(!/^\+?\d+$/.test(value))return null;
 const number=Number(value);return Number.isSafeInteger(number)&&number>=0?Object.freeze({number,expression:value}):null;
}

function normalizeAssignedStateSources(context={}){
 if(context.inventoryComplete!==true||!Array.isArray(context.sources)||!Array.isArray(context.assignedSources)||context.sources.length!==context.assignedSources.length||context.sources.length>MAX_ASSIGNED_FILES)return null;
 const assigned=context.assignedSources.map(canonical),seen=new Set(),sources=[];let total=0;
 for(let index=0;index<context.sources.length;index++){
  const item=context.sources[index],filename=item?.filename?path.resolve(item.filename):'',text=String(item?.text??''),bytes=Buffer.byteLength(text,'utf8'),key=canonical(filename);
  if(item?.available!==true||!filename||key!==assigned[index]||seen.has(key)||bytes>MAX_SOURCE_BYTES||(total+=bytes)>MAX_AGGREGATE_BYTES)return null;
  seen.add(key);sources.push(Object.freeze({filename,text,sourceHash:hash(text),syntax:item.syntax==='zss'?'zss':'cns'}));
 }
 return Object.freeze(sources);
}

function stateInventoryHash(sources){return hash(JSON.stringify((sources||[]).map(item=>({filename:canonical(item.filename),sourceHash:item.sourceHash,syntax:item.syntax}))));}

function buildStateDestinationSnapshot(context={}){
 const sources=normalizeAssignedStateSources(context);if(!sources)return null;const index=Object.create(null),incomingChangeStates=Object.create(null);let retainedIncoming=0,totalIncoming=0;
 for(const source of sources){
  const parsed=parseStateSource(source.text,source.filename,source.syntax==='cns'?'ikemen-cns':'zss');
  for(const declaration of parsed.declarations){if(declaration.dynamic||!Number.isSafeInteger(declaration.value)||declaration.value<0)continue;const key=String(declaration.value);if(!index[key])index[key]=[];const matches=index[key];if(matches.length<2)matches.push(Object.freeze({source,declaration}));}
  for(const transfer of parsed.transfers){if(transfer.kind!=='changestate'||transfer.dynamic||transfer.ambiguous||transfer.malformed||transfer.structurallyInvalid||transfer.redirected||String(transfer.field||'').toLowerCase()!=='value'||!Number.isSafeInteger(transfer.literal)||transfer.literal<0||transfer.owner?.kind!=='statedef'||!Number.isSafeInteger(transfer.owner.value))continue;const key=String(transfer.literal),bucket=incomingChangeStates[key]||(incomingChangeStates[key]={items:[],total:0});bucket.total++;totalIncoming++;if(bucket.items.length<MAX_INCOMING_PER_STATE&&retainedIncoming<MAX_INCOMING_TOTAL){const occurrence=hash(JSON.stringify({filename:canonical(source.filename),sourceHash:source.sourceHash,controllerStart:transfer.controllerStart,controllerEnd:transfer.controllerEnd,valueStart:transfer.start,valueEnd:transfer.end}));bucket.items.push(Object.freeze({source,transfer,occurrence}));retainedIncoming++;}}
 }
 for(const matches of Object.values(index))Object.freeze(matches);for(const bucket of Object.values(incomingChangeStates)){Object.freeze(bucket.items);Object.freeze(bucket);}Object.freeze(index);Object.freeze(incomingChangeStates);return Object.freeze({sources,inventoryHash:stateInventoryHash(sources),index,incomingChangeStates,incomingChangeStateStats:Object.freeze({total:totalIncoming,retained:retainedIncoming,omitted:Math.max(0,totalIncoming-retainedIncoming),perStateLimit:MAX_INCOMING_PER_STATE,totalLimit:MAX_INCOMING_TOTAL})});
}
function findUniqueStateDestination(snapshotOrSources,state){const snapshot=Array.isArray(snapshotOrSources)?buildStateDestinationSnapshot({inventoryComplete:true,sources:snapshotOrSources,assignedSources:snapshotOrSources.map(item=>item.filename)}):snapshotOrSources,matches=snapshot?.index?.[String(state)]||[];return Object.freeze({matches,match:matches.length===1?matches[0]:null});}

module.exports={MAX_ASSIGNED_FILES,MAX_AGGREGATE_BYTES,MAX_INCOMING_PER_STATE,MAX_INCOMING_TOTAL,exactStateNumber,normalizeAssignedStateSources,stateInventoryHash,buildStateDestinationSnapshot,findUniqueStateDestination};
