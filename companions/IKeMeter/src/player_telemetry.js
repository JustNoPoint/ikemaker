'use strict';

const { createHash } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { TelemetryRing } = require('./telemetry_ring');

const { fieldNames: fields } = require('./player_telemetry_wire');
const absence = new Set(['unsupported', 'disabled', 'failed-read', 'failed-redirect', 'inactive', 'budget', 'unavailable']);
const MiB = 1024 * 1024;
const int32 = n => Number.isInteger(n) && n >= -2147483648 && n <= 2147483647;

function validValue(key, value) {
  if (key === 'ctrl') return typeof value === 'boolean';
  if (key === 'moveType') return ['I', 'A', 'H'].includes(value);
  if (key === 'stateType' || key === 'physics') return ['S', 'C', 'A', 'L', 'N'].includes(value);
  if (key === 'facing') return value === 1 || value === -1;
  if (/^(?:pos|vel|localCoord)[XYZ]$/.test(key) || key === 'cameraPosX' || key === 'configuredYAccel') return Number.isFinite(value);
  return int32(value);
}

class PlayerTelemetry {
  constructor(options = {}) {
    this.clock = options.clock || (() => performance.now());
    this.wall = options.wall || Date.now;
    this.seconds = 120;
    this.limits = options.limits || { frames: [32768,54*MiB], events: [2000,8*MiB], gaps: [32768,2*MiB] };
    this.session = null;
    this.timer = null;
    this.autoPrune = options.autoPrune !== false;
  }

  begin(id, epoch, metadata) {
    this.dispose();
    if (!metadata) return;
    if (!/^[0-9a-f]{64}$/.test(metadata.engineSha256) ||
        !['1,2','1,2,3,4'].includes(metadata.rootSlots?.join(','))) throw Error('Invalid telemetry session metadata');
    this.session = { id, epoch, engineSha256: metadata.engineSha256, phase: 'post-action-ui-loop',
      rootSlots: [...metadata.rootSlots], capabilities: Object.fromEntries(fields.map(key => [key,
        key !== 'effectiveGravity' && metadata.capabilities?.[key] === 'stock' ? 'stock' :
          metadata.capabilities?.[key] === 'disabled' ? 'disabled' : 'unavailable'])),
      diagnostics: { stdout: metadata.diagnostics?.stdout === 'owned-stream' ? 'owned-stream' : 'unavailable',
        stderr: metadata.diagnostics?.stderr === 'owned-stream' ? 'owned-stream' : 'unavailable', internalConsole: 'unavailable' } };
    this.origin = this.lastClock = this.clock();
    this.lastWall = this.wall();
    this.live = true;
    this.streamsStopped = false;
    this.clockRevision = 0;
    this.lastTick = null;
    this.lastSignature = null;
    this.coverageInterrupted = false;
    this.identities = new Map();
    this.generations = new Map();
    this.evictedBy = { age:0, bytes:0, index:0, eventQuota:0 };
    this.evictedFrames = this.evictedEvents = this.droppedEvents = this.truncatedEvents = this.duplicateCallbacks = 0;
    this.evictedThroughSeq = null;
    const make = (kind, onEvict) => new TelemetryRing(...this.limits[kind], (reason, serial) => {
      this.evictedBy[reason]++;
      onEvict?.(serial);
    });
    this.frames = make('frames', seq => { this.evictedFrames++; this.evictedThroughSeq = seq; });
    // Charge the 300 compact loss buckets to the diagnostic pool, including
    // their index space. Counters are separate from printable stream text.
    this.lossTimes = new Float64Array(300).fill(-1);
    this.lossCounts = new Float64Array(300);
    this.acceptTimes = new Float64Array(100).fill(-Infinity);
    this.nextAccept = 0;
    this.lossIndexBytes = this.lossTimes.byteLength + this.lossCounts.byteLength + this.acceptTimes.byteLength;
    const [eventCapacity,eventBytes] = this.limits.events;
    this.events = new TelemetryRing(eventCapacity,eventBytes-this.lossIndexBytes,reason => {
      this.evictedBy[reason === 'index' ? 'eventQuota' : reason]++;
      this.evictedEvents++;
    });
    this.gaps = make('gaps');
    if (this.autoPrune) {
      this.timer = setInterval(() => this.prune(), 250);
      this.timer.unref();
    }
  }

  dispose() {
    clearInterval(this.timer);
    this.timer = null;
    for (const ring of [this.frames,this.events,this.gaps]) {
      if (ring?.count) ring.prune(Infinity);
    }
    this.session = this.frames = this.events = this.gaps = null;
    this.acceptTimes = this.lossTimes = this.lossCounts = null;
  }

  prune() {
    if (!this.session) return 0;
    const now = this.clock(), wall = this.wall();
    const uncertain = now < this.lastClock || Math.abs((wall - this.lastWall) - (now - this.lastClock)) > 2000;
    this.lastClock = now;
    this.lastWall = wall;
    const t = Math.max(0, Math.floor(now - this.origin));
    const cutoff = uncertain ? Infinity : t - this.seconds * 1000;
    for (const ring of [this.frames, this.events, this.gaps]) ring.prune(cutoff);
    if (uncertain || this.lastLossCutoff !== cutoff) for (let i=0;i<this.lossTimes.length;i++) {
      if (this.lossTimes[i] >= 0 && this.lossTimes[i] <= cutoff) {
        this.lossTimes[i] = -1;
        this.lossCounts[i] = 0;
      }
    }
    this.lastLossCutoff = cutoff;
    if (uncertain) {
      this.clockRevision++;
      this.coverageInterrupted = true;
      this.acceptTimes.fill(-Infinity);
      this.identities.clear();
      this.addGap(t, 'discontinuity', 'receipt-clock-discontinuity');
    }
    return t;
  }

  setSeconds(seconds) {
    if (!Number.isInteger(seconds) || seconds < 30 || seconds > 300 || seconds % 30) throw Error('Select 30 through 300 seconds in steps of 30');
    this.seconds = seconds;
    this.prune();
  }

  addGap(receivedMs, kind, reason, fromTick = null, toTick = null, count = null) {
    this.gaps.append({ receivedMs, kind, fromTick, toTick, count, reason });
  }

  interrupt(reason) {
    if (!this.session || !this.live) return;
    this.identities.clear();
    this.coverageInterrupted = true;
    this.addGap(this.prune(), 'transport', reason);
  }

  end(reason) {
    if (!this.session || !this.live) return;
    this.live = false;
    const code = ['game-clock-rewind','disconnected','launcher-shutdown'].includes(reason) ? reason : 'session-ended';
    this.addGap(this.prune(), 'discontinuity', code);
  }

  addFrame(frame) {
    if (!this.live || !this.session || frame.sessionId !== this.session.id || frame.epoch !== this.session.epoch) return;
    const t = this.prune(), tick = frame.tick;
    if (frame.telemetryDiagnosticsStopped === true) this.noteStreamsStopped();
    if (!int32(tick) || tick < 0 || !frame.telemetry) {
      this.addGap(t, 'transport', 'telemetry-batch-unavailable');
      return;
    }
    const signature = createHash('sha256').update(JSON.stringify(frame.telemetry)).digest('hex');
    if (tick === this.lastTick) {
      this.duplicateCallbacks++;
      if (this.coverageInterrupted || this.lastSignature !== signature) {
        this.addGap(t, 'partial', 'same-tick-observation-changed', tick, tick);
        this.identities.clear();
      }
      this.coverageInterrupted = false;
      this.lastSignature = signature;
      return;
    }
    this.coverageInterrupted = false;
    this.lastSignature = signature;
    if (this.lastTick !== null && tick < this.lastTick) { this.end('game-clock-rewind'); return; }
    if (this.lastTick !== null && tick > this.lastTick + 1) {
      this.addGap(t, 'tick-gap', 'unobserved-ticks', this.lastTick + 1, tick - 1, tick - this.lastTick - 1);
    }
    this.lastTick = tick;
    const observation = frame.telemetry, roots = [], missingSlots = [];
    if (!Array.isArray(observation.roots) || observation.roots.length > 4) {
      this.interrupt('malformed-root-batch');
      return;
    }
    const ids = observation.roots.map(row => row?.id);
    for (const slot of this.session.rootSlots) {
      const candidates = observation.roots.filter(row => row?.slot === slot);
      const row = candidates.length === 1 ? candidates[0] : null;
      if (!row || !int32(row.id) || row.id < 0 || ids.indexOf(row.id) !== ids.lastIndexOf(row.id)) {
        const reason = observation.missingSlots?.find(entry => entry.slot === slot)?.reason;
        missingSlots.push({ slot, reason: absence.has(reason) ? reason : 'failed-redirect' });
        this.identities.delete(slot);
        continue;
      }
      if (this.identities.get(slot) !== row.id) {
        this.generations.set(slot, (this.generations.get(slot) || 0) + 1);
        this.identities.set(slot,row.id);
      }
      const values = {}, reasons = {};
      let validMask = 0;
      for (const [bit,key] of fields.entries()) {
        const capability = this.session.capabilities[key];
        const value = row.values?.[key];
        if (capability === 'stock' && validValue(key,value)) {
          values[key] = value;
          validMask += 2 ** bit;
        } else {
          values[key] = null;
          const reason = row.reasons?.[key];
          reasons[key] = capability === 'unavailable' ? 'unsupported' : capability === 'disabled' ? 'disabled' :
            absence.has(reason) ? reason : 'failed-read';
        }
      }
      roots.push({ slot, teamSide: [1,2].includes(row.teamSide) ? row.teamSide : null, id: row.id,
        generation: this.generations.get(slot), validMask, values, reasons });
    }
    if (!this.frames.append({seq:this.frames.next,receivedMs:t,gameTime:tick,paused:typeof observation.paused === 'boolean' ? observation.paused : null,roots,missingSlots})) {
      this.addGap(t,'partial','frame-byte-budget',tick,tick,1);
    } else if (missingSlots.length) this.addGap(t,'partial','missing-root',tick,tick,missingSlots.length);
  }

  diagnostic(packet) {
    if (!this.live || !this.session || packet.sessionId !== this.session.id || packet.epoch !== this.session.epoch) return;
    const t = this.prune();
    if (Number.isSafeInteger(packet.dropped) && packet.dropped > 0) {
      this.recordDropped(t, packet.dropped);
      return;
    }
    const e = packet.event;
    if (!e || typeof e.text !== 'string' || Buffer.byteLength(e.text) > 4096) return;
    if (t - this.acceptTimes[this.nextAccept] < 1000) {
      this.recordDropped(t, 1);
      return;
    }
    this.acceptTimes[this.nextAccept] = t;
    this.nextAccept = (this.nextAccept + 1) % this.acceptTimes.length;
    if (e.truncated) this.truncatedEvents++;
    this.events.append({...e,seq:this.events.next,receivedMs:t});
  }

  noteStreamsStopped() {
    if (!this.session || !this.live || this.streamsStopped) return;
    this.streamsStopped = true;
    this.addGap(this.prune(),'event-loss','owned-stream-diagnostics-stopped');
    this.meterDiagnostic('Owned stream diagnostics stopped','warning');
  }

  meterDiagnostic(text, severity) {
    if (!this.live || !this.session) return;
    let bounded = text.slice(0,512);
    if (bounded.length < text.length && /[\uD800-\uDBFF]$/.test(bounded)) bounded = bounded.slice(0,-1);
    this.diagnostic({sessionId:this.session.id, epoch:this.session.epoch, event:{
      source:'meter', origin:'meter', severity, text:bounded, truncated:bounded.length !== text.length,
      originalBytes:Buffer.byteLength(text), tickDomain:null, tick:null, entityId:null, stateNo:null,
      provenance:'meter-diagnostic'
    }});
  }

  recordDropped(t, count) {
    this.droppedEvents += count;
    const second = Math.floor(t / 1000), i = second % this.lossTimes.length;
    if (Math.floor(this.lossTimes[i] / 1000) !== second) {
      this.lossTimes[i] = t;
      this.lossCounts[i] = 0;
    }
    this.lossCounts[i] += count;
  }

  retention(t) {
    const rings = [this.frames,this.events,this.gaps];
    const indexBytes = rings.reduce((n,r) => n + r.indexBytes,this.lossIndexBytes);
    return {seconds:this.seconds,exportedAtMs:t,byteLimit:rings.reduce((n,r)=>n+r.indexBytes+r.pool.length,this.lossIndexBytes),
      retainedBytes:indexBytes+rings.reduce((n,r)=>n+r.used,0),indexBytes,
      evictedFrames:this.evictedFrames,evictedEvents:this.evictedEvents,droppedEvents:this.droppedEvents,
      truncatedEvents:this.truncatedEvents,upstreamLossUnknown:true,duplicateCallbacks:this.duplicateCallbacks,
      evictedThroughSeq:this.evictedThroughSeq,evictedBy:{...this.evictedBy}};
  }

  lossGaps() {
    const result = [];
    for (let i=0;i<this.lossTimes.length;i++) {
      if (this.lossTimes[i] >= 0) result.push({receivedMs:this.lossTimes[i],kind:'event-loss',fromTick:null,toTick:null,
        count:this.lossCounts[i],reason:'diagnostic-rate-limit'});
    }
    return result.sort((a,b)=>a.receivedMs-b.receivedMs);
  }

  frozenReceipt(tick) {
    if (!this.session || !this.live) return null;
    this.prune();
    const frame = this.frameAtTick(tick);
    if (frame?.paused !== true) return null;
    return createHash('sha256').update(JSON.stringify({session:this.session,frame})).digest('hex');
  }

  frameAtTick(tick) {
    let lo=this.frames.first, hi=this.frames.next-1;
    while (lo<=hi) {
      const mid=Math.floor((lo+hi)/2), frame=this.frames.read(mid);
      if (frame.gameTime===tick) return frame;
      if (frame.gameTime<tick) lo=mid+1;
      else hi=mid-1;
    }
    return null;
  }

  view({seq,tick}={}) {
    if (!this.session) return {session:null,seconds:this.seconds};
    const t=this.prune(), first=this.frames.first, last=this.frames.next-1;
    const selected=tick!==undefined ? this.frameAtTick(tick) : this.frames.read(seq??last);
    const recent=(ring,count) => Array.from({length:Math.min(count,ring.count)},(_,i)=>ring.read(Math.max(ring.first,ring.next-count)+i));
    return {session:this.session,live:this.live,retention:this.retention(t),firstSeq:this.frames.count?first:null,
      lastSeq:this.frames.count?last:null,frameCount:this.frames.count,eventCount:this.events.count,
      selected,selectionStatus:selected?'retained':seq!==undefined&&seq<first?'evicted':'unavailable',
      events:recent(this.events,12),gaps:[...recent(this.gaps,12),...this.lossGaps().slice(-12)].sort((a,b)=>a.receivedMs-b.receivedMs).slice(-12)};
  }

  // Capture ordinal boundaries, not references to retained payloads. Reading
  // an expired/recycled slot terminates the download instead of mixing clips.
  exportClip({firstSeq,lastSeq,includeDiagnostics=false}={}) {
    if (!this.session) throw Error('No telemetry session');
    const t=this.prune(), session=this.session, revision=this.clockRevision;
    const bounded=firstSeq!==undefined||lastSeq!==undefined;
    const start=firstSeq??this.frames.first, stop=lastSeq??(this.frames.next-1);
    if (bounded && (!Number.isSafeInteger(start)||!Number.isSafeInteger(stop)||start>stop||
        start<this.frames.first||stop>=this.frames.next)) throw Error('The requested sequence range is unavailable');
    const minTime=bounded?this.frames.times[this.frames.slot(start)]:0;
    const maxTime=bounded?this.frames.times[this.frames.slot(stop)]:t;
    const ordinals=(ring)=>{
      let lo=ring.first, end=ring.next;
      while(lo<end && ring.times[ring.slot(lo)]<minTime)lo++;
      while(end>lo && ring.times[ring.slot(end-1)]>maxTime)end--;
      return [lo,end];
    };
    const [eventFirst,eventEnd]=includeDiagnostics?ordinals(this.events):[0,0];
    const [gapFirst,gapEnd]=ordinals(this.gaps);
    const loss=this.lossGaps().filter(g=>g.receivedMs>=minTime&&g.receivedMs<=maxTime);
    if (gapEnd-gapFirst+loss.length>32768) throw Error('Select a smaller clip to include all coverage gaps');
    const header=JSON.stringify({schema:'ikemeter.player-telemetry',version:1,includeDiagnostics,
      session,retention:this.retention(t)}).slice(0,-1);
    const frames=this.frames,events=this.events,gaps=this.gaps;
    const checkAge=receivedMs=>{
      const current = this.prune();
      if (this.session !== session || revision !== this.clockRevision || current - receivedMs >= this.seconds * 1000)
        throw Error('The selected interval expired during export');
    };
    const read=(ring,i)=>{
      checkAge(ring.times[ring.slot(i)]);
      if(this.session!==session)throw Error('Session changed during export');
      const bytes=ring.bytes(i);
      if(!bytes)throw Error('The selected interval expired during export');
      return bytes;
    };
    function* rows(ring,lo,end) {
      for(let i=lo;i<end;i++){if(i>lo)yield ',';yield read(ring,i);}
    }
    function* chunks(){
      yield header+',"frames":[';
      yield* rows(frames,start,stop+1);
      yield '],"events":[';
      yield* rows(events,eventFirst,eventEnd);
      yield '],"gaps":[';
      let i=gapFirst,j=0,separator='';
      while(i<gapEnd||j<loss.length){
        yield separator;separator=',';
        if(j<loss.length&&(i===gapEnd||loss[j].receivedMs<=gaps.times[gaps.slot(i)])){checkAge(loss[j].receivedMs);yield JSON.stringify(loss[j++]);}
        else yield read(gaps,i++);
      }
      yield '],"links":[]}';
    }
    const arraySize=(ring,lo,end)=>{
      let n=Math.max(0,end-lo-1);
      for(let i=lo;i<end;i++)n+=ring.lengths[ring.slot(i)];
      return n;
    };
    const length=Buffer.byteLength(header+',"frames":[],"events":[],"gaps":[],"links":[]}')+
      arraySize(frames,start,stop+1)+arraySize(events,eventFirst,eventEnd)+arraySize(gaps,gapFirst,gapEnd)+
      loss.reduce((sum,g)=>sum+Buffer.byteLength(JSON.stringify(g)),0)+Math.max(0,loss.length-(gapEnd>gapFirst?0:1));
    if(length>64*MiB)throw Error('Select a smaller clip to fit the export limit');
    return {length,chunks:chunks()};
  }
}

module.exports = { PlayerTelemetry, fields };
