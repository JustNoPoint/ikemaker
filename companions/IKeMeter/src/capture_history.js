'use strict';

function baseKey(entity) { return `${entity.kind}:${entity.owner}:${entity.runtimeId}`; }

class CaptureHistory {
  constructor(options = {}) {
    this.maxRecords = options.maxRecords || 4096;
    this.maxLifetimes = options.maxLifetimes || 256;
    this.epoch = null;
    this.sessionId = null;
    this.records = [];
    this.active = new Map();
    this.baseState = new Map();
    this.lifetimes = new Map();
    this.nextAllocation = 1;
    this.lastTick = null;
  }

  beginEpoch(epoch, sessionId = '') {
    if (!Number.isSafeInteger(epoch) || epoch < 1) throw new Error('epoch must be a positive integer');
    if (this.epoch !== null && (this.epoch !== epoch || this.sessionId !== sessionId)) this.#closeActive('session-boundary', null);
    this.epoch = epoch;
    this.sessionId = sessionId;
    this.lastTick = null;
    this.#append({ type:'session-boundary', sessionId, epoch, tick:null });
  }

  endEpoch(reason = 'session-boundary') {
    if(this.epoch===null)return;
    this.#closeActive(reason,null);
    this.#append({type:'session-end',sessionId:this.sessionId,epoch:this.epoch,tick:null,reason});
    this.epoch=null;this.sessionId=null;this.lastTick=null;
  }

  ingest(frame) {
    if (frame.epoch !== this.epoch) throw new Error('sample belongs to a stale or unknown epoch');
    if (frame.sessionId !== undefined && frame.sessionId !== this.sessionId) throw new Error('sample belongs to a stale or unknown session');
    if (!Number.isSafeInteger(frame.tick) || frame.tick < 0) throw new Error('sample tick is invalid');
    if (!Array.isArray(frame.entities)) throw new Error('entities must be an array');
    if (this.lastTick !== null && frame.tick < this.lastTick) throw new Error('sample tick moved backwards');
    const identities=new Set();
    for (const entity of frame.entities) {
      if (!entity || !['player','helper','projectile'].includes(entity.kind) || !Number.isSafeInteger(entity.owner) || !Number.isSafeInteger(entity.runtimeId)) throw new Error('entity identity is invalid');
      const base=baseKey(entity);if(identities.has(base))throw new Error('duplicate entity identity in one sample');identities.add(base);
    }
    const events=frame.events||[];if(!Array.isArray(events))throw new Error('events must be an array');
    for(const event of events){if(!event||!['first','gone','last','gap'].includes(event.action)||!Number.isSafeInteger(event.tick)||event.tick<0||event.tick>frame.tick||!Number.isSafeInteger(event.sampleTick)||event.sampleTick<0||event.sampleTick>event.tick)throw new Error('lifetime event is invalid');if(event.action!=='gap'&&(!['player','helper','projectile'].includes(event.kind)||!Number.isSafeInteger(event.owner)||!Number.isSafeInteger(event.runtimeId)))throw new Error('lifetime event identity is invalid');if(!event.watch||!['state','anim','x','y','vx','vy'].every((key)=>Number.isFinite(event.watch[key])))throw new Error('lifetime event watch is invalid');}
    this.#ingestEvents(events,Number.isSafeInteger(frame.eventDrops)?frame.eventDrops:0);
    const previousTick=this.lastTick;
    this.lastTick=frame.tick;
    if (frame.complete !== true) {
      this.#append({ type:'gap', epoch:this.epoch, tick:frame.tick, reason:frame.reason || 'incomplete-scan',partial:false });
      for(const lifetime of this.active.values())lifetime.hasGapSinceSeen=true;
      this.#trimLifetimes();
      return {accepted:false,reason:frame.reason || 'incomplete-scan'};
    }
    if (identities.size>this.maxLifetimes) {
      this.lastTick=frame.tick;
      this.#append({type:'gap',epoch:this.epoch,tick:frame.tick,reason:'entity-capacity-overflow',partial:false});
      for(const lifetime of this.active.values())lifetime.hasGapSinceSeen=true;
      this.#trimLifetimes();
      return {accepted:false,reason:'entity-capacity-overflow'};
    }
    if(previousTick!==null&&frame.tick>previousTick+1){
      this.#append({type:'gap',epoch:this.epoch,tick:frame.tick,fromTick:previousTick+1,toTick:frame.tick-1,reason:'unsampled-interval',partial:false});
      for(const lifetime of this.active.values())lifetime.hasGapSinceSeen=true;
    }
    const seen = new Set();
    for (const entity of frame.entities) {
      const base = baseKey(entity);seen.add(base);
      let lifetime = this.active.get(base);
      if (!lifetime) {
        lifetime=this.#openLifetime(entity.kind,entity.owner,entity.runtimeId,frame.tick,entity.kind==='projectile'?entity.state:null,entity.sourceRuntimeId);
      }
      if(lifetime.hasGapSinceSeen){lifetime.identityAmbiguous=true;lifetime.hasGapSinceSeen=false;this.#append({type:'identity-ambiguity',epoch:this.epoch,tick:frame.tick,lifetimeId:lifetime.id,reason:'same-runtime-id-observed-after-gap'});}
      lifetime.lastTick=frame.tick;
      const sample={ tick:frame.tick,state:entity.state,anim:entity.anim,x:entity.x,y:entity.y,vx:entity.vx,vy:entity.vy };
      lifetime.samples.push(sample);
      this.#append({ type:'sample',epoch:this.epoch,tick:frame.tick,lifetimeId:lifetime.id,sample });
    }
    for (const [base,lifetime] of this.active) {
      if (!seen.has(base)) this.#depart(base,lifetime,frame.tick,lifetime.kind==='projectile'&&lifetime.identityAmbiguous?'identity-observation-boundary':(lifetime.hasGapSinceSeen?'first-complete-absence-after-gap':'first-complete-absence'));
    }
    this.#trimLifetimes();
  }

  snapshot() {
    return { sessionId:this.sessionId,epoch:this.epoch,records:this.records.map((value)=>({...value})),lifetimes:[...this.lifetimes.values()].map((value)=>({...value,samples:value.samples.map((sample)=>({...sample}))})) };
  }

  #depart(base,lifetime,tick,reason) {
    lifetime.closed=true;lifetime.departed=reason.startsWith('first-complete-absence')||reason==='per-tick-first-absence';lifetime.departedTick=tick;lifetime.departureReason=reason;
    this.active.delete(base);
    this.#append({ type:'departed',epoch:this.epoch,tick,lifetimeId:lifetime.id,reason });
  }

  #closeActive(reason,tick) { for (const [base,lifetime] of [...this.active]) this.#depart(base,lifetime,tick,reason); }
  #openLifetime(kind,owner,runtimeId,tick,authoredId=null,sourceRuntimeId=runtimeId) {
    const base=`${kind}:${owner}:${runtimeId}`;const retained=this.baseState.get(base);const generation=(retained?.generation||0)+1;
    this.baseState.set(base,{generation,lastUsed:this.nextAllocation});const id=`${this.epoch}:allocation:${this.nextAllocation++}`;
    const lifetime={id,sessionId:this.sessionId,epoch:this.epoch,kind,owner,runtimeId,sourceRuntimeId,authoredId,generation,generationScope:retained?'retained-base':'retained-window',firstTick:tick,lastTick:tick,departed:false,closed:false,identityAmbiguous:kind==='projectile',identityReason:kind==='projectile'?'native-projectile-ordinal-has-no-stable-instance-id':'',samples:[]};
    this.active.set(base,lifetime);this.lifetimes.set(id,lifetime);this.#append({type:'first-seen',epoch:this.epoch,tick,lifetimeId:id});return lifetime;
  }
  #ingestEvents(events,drops) {
    if(drops>0){this.#append({type:'gap',epoch:this.epoch,tick:events.at(-1)?.tick??this.lastTick,reason:'event-buffer-overflow',dropped:drops,partial:false});for(const lifetime of this.active.values())lifetime.hasGapSinceSeen=true;}
    for(const event of events){
      if(event.action==='gap'){this.#append({type:'gap',epoch:this.epoch,tick:event.tick,reason:'per-tick-scan-incomplete',partial:false});for(const lifetime of this.active.values())lifetime.hasGapSinceSeen=true;continue;}
      const base=`${event.kind}:${event.owner}:${event.runtimeId}`;const current=this.active.get(base);
      if(event.action==='gone'||event.action==='last'){if(current){this.#appendEventWatch(current,event);this.#depart(base,current,event.tick,event.action==='last'?'identity-observation-boundary':'per-tick-first-absence');}continue;}
      if(current){current.identityAmbiguous=true;this.#depart(base,current,event.tick,'event-identity-reuse');}
      if(this.active.size>=this.maxLifetimes){this.#append({type:'gap',epoch:this.epoch,tick:event.tick,reason:'event-capacity-overflow',partial:false});continue;}
      this.#appendEventWatch(this.#openLifetime(event.kind,event.owner,event.runtimeId,event.tick,event.kind==='projectile'?event.watch.state:null,event.sourceRuntimeId),event);
    }
  }
  #appendEventWatch(lifetime,event){
    const last=lifetime.samples.at(-1);if(last&&last.tick===event.sampleTick)return;
    const sample={tick:event.sampleTick,...event.watch};lifetime.samples.push(sample);lifetime.lastTick=Math.max(lifetime.lastTick,event.sampleTick);this.#append({type:'sample',epoch:this.epoch,tick:event.sampleTick,lifetimeId:lifetime.id,sample,source:'per-tick-event'});
  }
  #append(record) {
    this.records.push(record);
    while (this.records.length > this.maxRecords) {
      const removed=this.records.shift();
      if (removed.type==='sample') {
        const lifetime=this.lifetimes.get(removed.lifetimeId);
        if (lifetime && lifetime.samples[0]===removed.sample) lifetime.samples.shift();
      }
    }
  }
  #trimLifetimes() {
    if (this.lifetimes.size > this.maxLifetimes) {
      for (const [id,lifetime] of this.lifetimes) {
        if (!lifetime.closed) continue;
        this.lifetimes.delete(id);
        if (this.lifetimes.size <= this.maxLifetimes) break;
      }
    }
    const maxBaseKeys=Math.max(this.maxLifetimes*2,4);
    if(this.baseState.size>maxBaseKeys){
      for(const base of [...this.baseState.keys()]){
        if(this.active.has(base))continue;
        this.baseState.delete(base);
        if(this.baseState.size<=maxBaseKeys)break;
      }
    }
  }
}

module.exports = { CaptureHistory };
