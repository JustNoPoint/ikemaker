'use strict';
const {isDeepStrictEqual}=require('node:util');
const {TelemetryRing}=require('./telemetry_ring');
const {entityKinds}=require('./watch_wire');

const engineBuild='6a09392477650c527c75575a64dd728a2c200c8c';

function stateContext(tick,entityId,current,previous){
  const observed=(sample,expectedTick)=>sample?.tick===expectedTick&&sample?.entityId===entityId?sample:null;
  return {current:observed(current,tick),previous:observed(previous,tick-1),runStateTarget:null,executingEntityId:null};
}

class WatchLog {
  constructor(clock,limits=[8192,4*1024*1024],wall=Date.now){
    this.clock=clock;
    this.wall=wall;
    this.limits=limits;
    this.seconds=120;
    this.session=null;
  }
  setSeconds(seconds){
    if(!Number.isInteger(seconds)||seconds<30||seconds>300||seconds%30)throw Error('Select 30 through 300 seconds in steps of 30');
    this.seconds=seconds;
    this.prune();
  }
  begin(sessionId,epoch,watch){
    this.dispose();
    this.live=false;
    if(!watch?.plan.length)return;
    this.session={engineBuild,projectId:watch.projectId,sessionId,epoch};
    this.plan=watch.plan;
    this.origin=this.clock();
    this.lastClock=this.origin;
    this.lastWall=this.wall();
    this.receiptMs=0;
    this.tick=null;
    this.dropped=0;
    this.truncated=0;
    this.states=this.plan.map(()=>null);
    this.ring=new TelemetryRing(...this.limits,reason=>{if(reason!=='age')this.dropped++;});
    this.live=true;
    this.timer=setInterval(()=>this.prune(),1000).unref();
  }
  prune(){
    if(!this.ring)return;
    const now=this.clock(),wall=this.wall();
    const uncertain=now<this.lastClock||Math.abs((wall-this.lastWall)-(now-this.lastClock))>2000;
    if(now<this.lastClock)this.origin=now-this.receiptMs;
    this.lastClock=now;this.lastWall=wall;
    this.receiptMs=Math.max(this.receiptMs,Math.floor(now-this.origin));
    const cutoff=uncertain?Infinity:this.receiptMs-this.seconds*1000;
    this.ring.prune(cutoff);
    for(let i=0;i<this.states.length;i++){
      if(this.states[i]?.receiptMs<=cutoff)this.states[i]=null;
      if(uncertain&&this.tick!==null){
        this.gap(i,this.tick,null,entityKinds.has(this.plan[i].kind)?'count':'value','receipt-clock-discontinuity');
      }
    }
  }
  end(interrupt=false){
    if(interrupt)this.interrupt();
    this.live=false;
    this.states=[];
    clearInterval(this.timer);
    this.timer=null;
    // Retained rows must continue aging after disconnect.
    if(this.ring?.count)this.timer=setInterval(()=>{
      this.prune();
      if(!this.ring?.count){clearInterval(this.timer);this.timer=null;}
    },1000).unref();
  }
  dispose(){
    clearInterval(this.timer);
    this.timer=null;
    this.states=[];
    this.live=false;
    this.dropped=0;
    this.truncated=0;
    this.ring?.prune(Infinity);
    this.ring=null;
    this.session=null;
  }
  append(i,tick,event,field,ownerId,before,after,coverage,identity=null,reason=null,context=null){
    const spec=this.plan[i], isEntity=entityKinds.has(spec.kind);
    const record={
      seq:this.ring.next,tick,receiptMs:this.receiptMs,kind:spec.kind,ownerId,
      slot:spec.slot,ownerHelperId:spec.ownerHelperId,
      parentId:identity?.parentId??null,rootId:identity?.rootId??ownerId,
      entityId:identity?.entityId??(isEntity?null:ownerId),
      authoredId:identity?.authoredId??(isEntity?spec.key:null),
      ordinal:identity?.ordinal??null,generation:null,field,
      key:isEntity?null:spec.key,mapIndex:spec.mapIndex,
      before,after,event,coverage,sourceHints:[],stateContext:context??stateContext(tick,null),...(reason&&{reason,droppedCount:null})
    };
    if(!this.ring.append(record,record.receiptMs))this.dropped++;
  }
  gap(i,tick,ownerId,field,reason,identity=null){
    const state=this.states[i];
    if(state?.gap)return;
    const spec=this.plan[i];
    const scope='P'+spec.slot+(spec.ownerHelperId==null?'':' helper #'+spec.ownerHelperId);
    this.append(i,tick,'gap',field,ownerId,null,null,'unknown',identity,reason+' ('+scope+')');
    this.states[i]={gap:true,ownerId,receiptMs:this.receiptMs};
  }
  interrupt(){
    if(!this.live||this.tick===null)return;
    this.prune();
    for(let i=0;i<this.plan.length;i++){
      const spec=this.plan[i], prior=this.states[i];
      const ownerId=prior?.ownerId??null;
      this.gap(i,this.tick,spec.ownerHelperId==null?ownerId:null,entityKinds.has(spec.kind)?'count':'value',
        'observation-interrupted',spec.ownerHelperId==null?null:{rootId:ownerId});
    }
  }
  add(frame){
    if(!this.live||frame.sessionId!==this.session.sessionId||frame.epoch!==this.session.epoch)return;
    this.prune();
    const {tick,watchRows}=frame;
    if(!Number.isInteger(tick)||tick<0){this.interrupt();return;}
    if(this.tick!==null&&tick<=this.tick){
      if(tick<this.tick)this.end(true);
      else this.checkRepeatedTick(tick,watchRows);
      return;
    }
    const adjacent=this.tick===null||tick===this.tick+1;
    this.tick=tick;
    const receiptMs=this.receiptMs;
    for(let i=0;i<this.plan.length;i++){
      const spec=this.plan[i], row=watchRows?.[i], isEntity=entityKinds.has(spec.kind);
      const field=isEntity?'count':'value';
      let prior=this.states[i];
      if(spec.ownerHelperId!=null){
        this.addOwnedEffects(i,tick,receiptMs,adjacent,row,prior);
        continue;
      }
      if(!row||row.value===null){
        this.truncated++;
        this.gap(i,tick,row?.ownerId??null,field,row?'value-unavailable':'sample-missing');
        continue;
      }
      if(!adjacent||(!prior?.gap&&prior&&
         (prior.ownerId!==row.ownerId||receiptMs-prior.receiptMs>=this.seconds*1000))){
        this.gap(i,tick,prior?.ownerId??null,field,!adjacent?'tick-gap':'baseline-retired');
        prior=null;
      }
      if(prior?.gap)prior=null;
      const complete=spec.kind!=='helper'||row.helpers!==null;
      if(!complete)this.truncated++;
      if(!prior||prior.value!==row.value){
        this.append(i,tick,isEntity?'count':prior?'change':'baseline',field,row.ownerId,
          prior?.value??null,row.value,complete?'complete':'partial',null,null,
          stateContext(tick,row.ownerId,row.state,prior?.state));
      }
      if(spec.kind==='helper')this.helperEvents(i,tick,row,prior);
      this.states[i]={...row,receiptMs};
    }
  }
  checkRepeatedTick(tick,watchRows){
    for(let i=0;i<this.plan.length;i++){
      const prior=this.states[i];
      if(!prior||prior.gap)continue;
      const {receiptMs,...earlier}=prior;
      const row=watchRows?.[i];
      if(isDeepStrictEqual(earlier,row))continue;
      const spec=this.plan[i];
      const sharedRoot=row?.ownerId===earlier.ownerId?earlier.ownerId:null;
      const identity=spec.ownerHelperId==null?null:{rootId:sharedRoot};
      this.gap(i,tick,spec.ownerHelperId==null?sharedRoot:null,entityKinds.has(spec.kind)?'count':'value',
        'same-tick-observation-conflict',identity);
    }
  }
  addOwnedEffects(i,tick,receiptMs,adjacent,row,prior){
    if(!row?.owners){
      this.truncated++;
      this.gap(i,tick,null,'count',row?'owner-scan-incomplete':'sample-missing',{rootId:row?.ownerId??null});
      return;
    }
    const rootId=row.ownerId;
    if(!adjacent||(prior&&!prior.gap&&
       (prior.ownerId!==rootId||receiptMs-prior.receiptMs>=this.seconds*1000))){
      this.gap(i,tick,null,'count',!adjacent?'tick-gap':'baseline-retired',{rootId});
      prior=null;
    }
    const previous=new Map(prior?.owners?.map(owner=>[owner.ownerId,owner]));
    for(const owner of row.owners){
      const identity={rootId};
      let earlier=previous.get(owner.ownerId);
      previous.delete(owner.ownerId);
      if(earlier&&earlier.parentId!==owner.parentId){
        this.append(i,tick,'gap','count',owner.ownerId,null,null,'unknown',identity,'owner-lineage-changed');
        earlier=undefined;
      }
      if(!earlier||earlier.value!==owner.value){
        this.append(i,tick,'count','count',owner.ownerId,earlier?.value??null,owner.value,'complete',identity,null,
          stateContext(tick,owner.ownerId,owner.state,earlier?.state));
      }
    }
    for(const owner of previous.values()){
      this.append(i,tick,'gap','count',owner.ownerId,null,null,'unknown',{rootId},'owner-no-longer-observable');
    }
    this.states[i]={...row,receiptMs};
  }
  helperEvents(i,tick,row,prior){
    if(row.helpers===null){
      if(!prior||prior.helpers!==null)this.append(i,tick,'gap','presence',row.ownerId,null,null,'partial',null,'helper-scan-incomplete');
      return;
    }
    const previous=new Map(prior?.helpers?.map(item=>[item.entityId,item]));
    const current=new Set(row.helpers.map(item=>item.entityId));
    for(const entity of row.helpers){
      const earlier=previous.get(entity.entityId);
      if(earlier&&(earlier.authoredId!==entity.authoredId||earlier.parentId!==entity.parentId)){
        this.append(i,tick,'gap','presence',row.ownerId,null,null,'partial',entity,'helper-lineage-changed');
        this.append(i,tick,'baseline','presence',row.ownerId,null,true,'complete',entity,null,
          stateContext(tick,entity.entityId,entity.state));
      }else if(!earlier){
        this.append(i,tick,prior?.helpers?'first':'baseline','presence',row.ownerId,
          null,true,'complete',entity,null,stateContext(tick,entity.entityId,entity.state));
      }
    }
    for(const entity of previous.values()){
      if(!current.has(entity.entityId)){
        this.append(i,tick,'last','presence',row.ownerId,true,false,'complete',{...entity,ordinal:null},null,
          stateContext(tick,entity.entityId,null,entity.state));
      }
    }
  }
  records(limit=this.ring?.count??0){
    this.prune();
    if(!this.ring)return [];
    const records=[];
    for(let i=Math.max(this.ring.first,this.ring.next-limit);i<this.ring.next;i++)records.push(this.ring.read(i));
    return records;
  }
  view(){
    const records=this.records(200);
    return {session:this.session,live:!!this.live,retentionSeconds:this.seconds,records,
      retained:this.ring?.count??0,dropped:this.dropped??0,truncated:this.truncated??0};
  }
  export(){
    if(!this.session)throw Error('No stock watch session to export');
    return {schema:'ikemeter.watch-log',version:1,...this.session,records:this.records(),
      retentionSeconds:this.seconds,dropped:this.dropped,truncated:this.truncated};
  }
}
module.exports={WatchLog,engineBuild};
