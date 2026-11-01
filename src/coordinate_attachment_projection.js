'use strict';

const path=require('path');
const crypto=require('crypto');
const { inspectSpatialEvidence }=require('./character_scale_review_model');
const { createTrajectoryContextAdapter, adapterSeed }=require('./trajectory_context_adapters');

const LIMITS=Object.freeze({files:256,sourceBytes:16*1024*1024,perSourceBytes:4*1024*1024,controllers:512,outputBytes:512*1024});
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function digest(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function ownerSeed(attachment){
  if(attachment.kind==='screen')return{coordinateSpace:'screen',owner:{kind:'screen',reviewed:true}};
  if(attachment.kind==='body')return{coordinateSpace:'owner-relative',owner:{kind:'self',reviewed:attachment.confidence==='proven'}};
  if(attachment.kind==='opponent')return{coordinateSpace:'owner-relative',owner:{kind:'p2',reviewed:attachment.confidence==='proven'}};
  if(attachment.kind==='world')return{coordinateSpace:'world',owner:{kind:'expression',expression:'authored world/camera edge',reviewed:true}};
  return{coordinateSpace:'local',owner:{kind:'expression',expression:'unresolved runtime owner',reviewed:false}};
}
function unavailable(reason,details={}){return freeze({schema:'ikemaker.coordinate-attachment-projection',version:1,status:'unavailable',complete:false,items:[],counts:{files:0,controllers:0,omitted:0},limitations:[reason],...details});}
function buildCoordinateAttachmentProjection(files,options={}){
  const input=Array.isArray(files)?files:[];
  if(input.length>LIMITS.files)return unavailable(`The coordinate review exceeds the ${LIMITS.files}-file limit.`);
  let aggregate=0;for(const file of input){if(!file?.filename||typeof file.text!=='string')return unavailable('A coordinate-review source is missing its filename or text.');const bytes=Buffer.byteLength(file.text,'utf8');if(bytes>LIMITS.perSourceBytes)return unavailable(`${path.basename(file.filename)} exceeds the 4 MiB per-source limit.`);aggregate+=bytes;}
  if(aggregate>LIMITS.sourceBytes)return unavailable('Coordinate-review sources exceed the 16 MiB aggregate limit.');
  const ownerIdentity=String(options.ownerIdentity||''),items=[];let omitted=0;
  for(const file of input){
    const evidence=inspectSpatialEvidence({sourcePath:file.filename,text:file.text,localCoord:options.localCoord});omitted+=evidence.omitted||0;
    for(const controller of evidence.controllers){
      if(items.length>=LIMITS.controllers){omitted+=1;continue;}
      const seed=ownerSeed(controller.attachment),adapter=createTrajectoryContextAdapter({kind:'spatial',id:`coordinate-${controller.id}`,label:`${controller.controller} coordinate evidence`,target:{language:controller.syntax,engine:String(options.engine||'ikemen-1.0'),capabilityState:String(options.capabilityState||'unknown')},mutation:{allowed:false,reason:'Coordinate inspection is read-only; use the established spatial or scale-review owner for edits.'}}),normalized=adapterSeed(adapter,{...seed,localCoord:Array.isArray(options.localCoord)?options.localCoord:[320,240]});
      items.push({id:digest([evidence.sourcePath,evidence.sourceHash,controller.id]),controller:controller.controller,syntax:controller.syntax,attachment:controller.attachment,coordinate:controller.coordinate,fields:controller.fields,trajectory:{coordinateSpace:normalized.coordinateSpace,owner:normalized.owner,localCoord:normalized.localCoord,previewOnly:adapter.previewOnly},source:{filename:evidence.sourcePath,line:controller.line,endLine:controller.line,fingerprint:evidence.sourceHash,ownerIdentity},limitations:[...controller.limitations,'Facing, redirects, camera motion, and dynamic values are not fabricated.']});
    }
  }
  const limitations=[];if(!ownerIdentity)limitations.push('Exact character ownership is unavailable; source evidence remains read-only.');if(!Array.isArray(options.localCoord))limitations.push('The exact owning DEF localcoord is unresolved; the trajectory adapter fallback is shown explicitly and is not treated as authored evidence.');if(omitted)limitations.push(`${omitted} controller(s) were omitted by projection bounds.`);
  const result={schema:'ikemaker.coordinate-attachment-projection',version:1,status:limitations.length?'incomplete':'ready',complete:limitations.length===0,ownerIdentity,items,counts:{files:input.length,controllers:items.length,omitted},limitations};
  if(Buffer.byteLength(JSON.stringify(result),'utf8')>LIMITS.outputBytes)return unavailable('The coordinate/attachment projection exceeds its 512 KiB output limit.',{counts:result.counts});
  return freeze(result);
}

module.exports={LIMITS,buildCoordinateAttachmentProjection,ownerSeed};
