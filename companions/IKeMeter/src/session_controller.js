'use strict';
const { CaptureHistory } = require('./capture_history');
const { performance } = require('node:perf_hooks');
const { TERMINAL_REASONS } = require('./terminal_frame');

class SessionController {
  constructor(driver, options = {}) {
    if (!driver) throw new Error('a session driver is required');
    this.driver = driver;
    this.clock=options.clock||(()=>performance.now());
    this.contactLeaseMs=options.contactLeaseMs??3000;
    this.setWatchdog=options.setWatchdog||((callback)=>{const timer=setInterval(callback,250);timer.unref();return timer;});
    this.clearWatchdog=options.clearWatchdog||clearInterval;
    this.watchdog=null;
    this.windowPause=null;this.windowState=null;this.stopWindowObservation=null;
    if(!Number.isFinite(this.contactLeaseMs)||this.contactLeaseMs<=0)throw new Error('invalid contact lease');
    this.history = new CaptureHistory();
    this.session = null;this.connectionsStarted=0;
    this.busy = false;
    this.stopSampling = null;
    this.contactFailures = 0;
    this.performance = {count:0,sumUs:0,maxUs:0,drops:0,histogram:Array(10).fill(0),firstTick:null,lastTick:null,deliveredThroughTick:null,repeatedHooks:0,terminalObservedTick:null,sessionEnded:false,sendAttempts:0,sendFailures:0,truncatedEvents:0,truncatedEntities:0};
    this.lastReason = 'No authenticated bridge session';
  }

  status() {
    this.#checkLease();
    if(this.session&&this.driver.processStatus?.(this.session)?.gameExited===true){this.session.gameExited=true;this.#revoke('Official nightly exited; authenticated bridge contact ended');}
    if (!this.session) return { connected: false, detachedGameRunning:this.driver.processStatus?.(null)?.detachedGameRunning===true, epoch: null, controls: false, phase: 'disconnected', tick: null, reason: this.lastReason, samplingCost:this.#performanceSnapshot() };
    const history=this.history.snapshot();
    return {
      connected: true,
      gameExited: this.session.gameExited===true,
      epoch: this.session.epoch,
      sessionId: this.session.sessionId,
      controls: !this.busy && !this.session.revoked && ['running','paused'].includes(this.session.phase),
      continuityRevision:this.session.continuityRevision||0,
      restartAvailable:!this.busy&&this.session.revoked&&this.driver.canRestartOwnedGame?.(this.session)===true,
      phase: this.session.phase,
      tick: this.session.tick,
      reason: this.session.revoked ? this.lastReason : this.windowPause?(this.windowPause.finished?'Window operation ended; waiting for a fresh authenticated capture':'Verified Windows move/size; controls suspended and interval unknown'):(this.busy ? 'Waiting for bounded bridge acknowledgement' : ''),
      notice:this.session.notice,
      entityCount: history.lifetimes.filter((item)=>!item.closed).length,
      historyRecords: history.records.length,
      samplingCost: this.#performanceSnapshot(),
    };
  }

  acceptsActionAuthority(authority,action){
    this.#checkLease();const session=this.session;
    if(action==='connect')return authority===null;
    if(!session)return authority===null&&action!=='restart';
    if(authority===null)return action!=='restart'&&!session.requiresActionAuthority&&(session.continuityRevision||0)===0;
    return authority&&Object.getPrototypeOf(authority)===Object.prototype&&Object.keys(authority).sort().join('|')==='continuityRevision|epoch|sessionId'&&authority.sessionId===session.sessionId&&authority.epoch===session.epoch&&authority.continuityRevision===(session.continuityRevision||0);
  }

  async connect() {
    if (this.session || this.busy) throw new Error('a bridge session is already active');
    await this.#exclusive(async () => {
      const connected = await this.driver.connect();
      if(!connected||typeof connected.sessionId!=='string'||!connected.sessionId||!Number.isSafeInteger(connected.epoch)||connected.epoch<1||!Number.isSafeInteger(connected.tick)||connected.tick<0)throw new Error('invalid authenticated connection');
      this.connectionsStarted++;
      this.session = {
        sessionId: connected.sessionId,
        notice:typeof connected.notice==='string'?connected.notice:'',
        epoch: connected.epoch,
        tick: connected.tick,
        phase: 'running',
        gameExited:false,continuityRevision:0,requiresActionAuthority:this.connectionsStarted>1,
        nextRequestSequence: 2,
        revoked: false,
        lastContactAt:this.clock(),
        pendingAuthority:new Set(),
      };
      this.lastReason = '';
      this.contactFailures = 0;
      this.performance = {count:0,sumUs:0,maxUs:0,drops:0,histogram:Array(10).fill(0),firstTick:null,lastTick:null,deliveredThroughTick:null,repeatedHooks:0,terminalObservedTick:null,sessionEnded:false,sendAttempts:0,sendFailures:0,truncatedEvents:0,truncatedEntities:0};
      this.history.beginEpoch(connected.epoch, connected.sessionId);
      this.watchdog=this.setWatchdog(()=>this.#checkLease());
      if(typeof this.driver.observeWindow==='function'){try{const stop=this.driver.observeWindow({...this.session},state=>this.#windowObservation(state,connected.sessionId));if(typeof stop!=='function')throw Error('Window observer did not provide bounded cleanup');if(this.session.revoked)stop();else this.stopWindowObservation=stop;}catch(error){this.#revoke('Owned window observation setup failed');throw error;}}
      await this.#capture();
      if(!this.session.revoked&&typeof this.driver.startSampling==='function'){
        try{const stop=this.driver.startSampling({...this.session},(frame)=>this.#recordFrame(frame,connected.sessionId));if(this.session.revoked)stop();else this.stopSampling=stop;}
        catch(error){this.#revoke(`Sampling setup failed: ${error.message}`);throw error;}
      }
    });
    return this.status();
  }

  async command(opcode) {
    this.#checkLease();
    if (!this.session) throw new Error('no authenticated bridge session');
    if (this.busy) throw new Error('another bridge operation is pending');
    const allowed = {
      pause: ['running'],
      step: ['paused'],
      resume: ['paused'],
    };
    if (!allowed[opcode] || !allowed[opcode].includes(this.session.phase)) {
      throw new Error(`${opcode} is unavailable while ${this.session.phase}`);
    }
    const result = await this.#exclusive(async () => {
      const operationSession=this.session;
      const before = this.session.tick;
      const requestSequence = this.session.nextRequestSequence;
      this.session.nextRequestSequence += 2;
      let ack;
      try {
        ack = await this.#awaitAuthority(this.driver.command(opcode, { ...this.session, requestSequence }),operationSession);
        this.#checkLease();
        if(this.session!==operationSession||operationSession.revoked)throw new Error('bridge authority was revoked while the command was pending');
        this.#validateAck(opcode, requestSequence, ack);
        if (ack.status === 'applied' && opcode === 'step' && ack.observedTick !== before + 1) {
          throw new Error(`step contract failed: expected tick ${before + 1}, observed ${ack.observedTick}`);
        }
        if (!['applied','rejected','unavailable'].includes(ack.status)) throw new Error('bridge acknowledgement status is invalid');
        if (ack.status === 'applied' && opcode === 'step' && (ack.fromTick !== before || !Number.isSafeInteger(ack.heldSamples) || ack.heldSamples < 3)) {
          throw new Error('step acknowledgement did not prove its starting tick and paused hold');
        }
        if (ack.status === 'applied' && opcode === 'pause' && ack.observedTick < before) throw new Error('pause acknowledgement moved backwards');
        if (ack.status === 'applied' && opcode === 'resume' && ack.observedTick < before) throw new Error('resume acknowledgement moved backwards');
      } catch (error) {
        this.#revoke(error.message);
        throw new Error(`${error.message}; session is uncertain and must be disconnected`);
      }
      if (opcode === 'pause' && ack.status === 'rejected' && ack.reason === 'preexisting-pause') {
        this.#revoke('preexisting-pause');
      }
      if (ack.status !== 'applied') throw new Error(ack.reason || `${opcode} was rejected by the bridge`);
      this.session.lastContactAt=this.clock();
      this.session.tick = Math.max(this.session.tick,ack.observedTick);
      this.session.phase = opcode === 'resume' ? 'running' : 'paused';
      if(!this.stopSampling)await this.#capture();
      return ack;
    });
    return { ...this.status(), ack: result };
  }

  historySnapshot() {
    const snapshot=this.history.snapshot();
    // Closed history still belongs to the connected, now-revoked session.
    return this.session?.revoked?{...snapshot,sessionId:this.session.sessionId,epoch:this.session.epoch,terminal:true}:snapshot;
  }

  #windowObservation(state,sessionId){
    const session=this.session;if(!session||session.revoked||session.sessionId!==sessionId)return;
    if(state?.error){this.#revoke('Owned window observation unavailable; fresh session required');return;}
    this.windowState=state;this.#checkLease();if(session.revoked)return;
    const now=this.clock();if(!Number.isFinite(state?.receivedAt)||now-state.receivedAt<0||now-state.receivedAt>500){this.#revoke('Owned window signal was not fresh');return;}
    if(state.moving){
      if(this.windowPause?.finished){this.#revoke('Another window operation interrupted fresh authentication');return;}
      if(!this.windowPause){
        if(this.busy||session.pendingAuthority.size||this.contactFailures!==0||now-session.lastContactAt>500||!['running','paused'].includes(session.phase)||!state.visible||state.minimized){this.#revoke('Window operation overlapped a pending or ambiguous operation; fresh session required');return;}
        const token=String(state.hwnd||'owned')+':'+state.sequence;try{this.driver.beginWindowSuspension({...session},token);}catch{this.#revoke('Old native offers could not be fenced; fresh session required');return;}
        this.windowPause={token,fromPhase:session.phase,begunAt:now,startSequence:state.sequence,finished:false};session.phase='window-suspended';session.continuityRevision++;
        try{this.history.ingest({sessionId:session.sessionId,epoch:session.epoch,tick:session.tick,complete:false,entities:[],reason:'windows-move-size-unknown-interval'});}catch{this.#revoke('Window interval could not be marked safely');}
      }
    }else if(this.windowPause&&!this.windowPause.finished){
      if(state.sequence<=this.windowPause.startSequence||!state.visible||state.minimized){this.#revoke('Window operation did not have a matching verified finish');return;}
      try{const floor=this.driver.freshWindowOfferFloor({...session});if(!Number.isSafeInteger(floor)||floor<1)throw Error();this.windowPause.offerFloor=floor;this.windowPause.finished=true;this.windowPause.freshDeadline=now+3000;}catch{this.#revoke('Fresh capture offer could not be fenced');}
    }
  }

  #checkLease() {
    const session=this.session;if(!session||session.revoked)return;
    const now=this.clock();if(this.windowPause){
      const state=this.windowState;
      if(!state||now-state.receivedAt>500||now-state.receivedAt<0){this.#revoke('Owned window observation expired; fresh session required');return;}
      if(!this.windowPause.finished&&now-this.windowPause.begunAt>=8000){this.#revoke('Window suspension exceeded its bounded limit; fresh session required');return;}
      if(this.windowPause.finished&&now>=this.windowPause.freshDeadline)this.#revoke('Fresh authenticated contact did not return after window operation');
      return;
    }
    if(now-session.lastContactAt>=this.contactLeaseMs)this.#revoke('Authenticated bridge contact lost: elapsed contact lease expired');
  }

  #revoke(reason) {
    const session=this.session;if(!session||session.revoked)return;
    session.revoked=true;session.phase='uncertain';this.lastReason=reason;this.windowPause=null;
    if(this.stopWindowObservation){this.stopWindowObservation();this.stopWindowObservation=null;}
    this.performance.sessionEnded=true;
    if(this.watchdog!==null){this.clearWatchdog(this.watchdog);this.watchdog=null;}
    try{this.history.ingest({sessionId:session.sessionId,epoch:session.epoch,tick:session.tick,complete:false,entities:[],reason});}catch{}
    this.history.endEpoch(reason);
    if(this.stopSampling){const stop=this.stopSampling;this.stopSampling=null;stop();}
    for(const reject of session.pendingAuthority)reject(new Error(`bridge authority was revoked: ${reason}`));
    session.pendingAuthority.clear();
    try{this.driver.revoke?.(reason);}catch{}
  }

  async #awaitAuthority(operation, session) {
    let rejectAuthority;
    const revoked=new Promise((resolve,reject)=>{rejectAuthority=reject;session.pendingAuthority.add(reject);});
    try{return await Promise.race([operation,revoked]);}
    finally{session.pendingAuthority.delete(rejectAuthority);}
  }

  async #capture() {
    if(typeof this.driver.sample!=='function'||!this.session)return;
    const session=this.session;
    try{const frame=await this.#awaitAuthority(this.driver.sample({...session}),session);this.#recordFrame(frame,session.sessionId);}
    catch(error){if(this.session===session&&!session.revoked)this.#recordFrame({sessionId:session.sessionId,epoch:session.epoch,tick:null,complete:false,entities:[],reason:`sample-error:${error.message}`},session.sessionId);}
  }

  #recordFrame(frame,sessionId) {
    this.#checkLease();
    if(!this.session||this.session.revoked||this.session.sessionId!==sessionId)return;
    if(frame.sessionId!==sessionId||frame.epoch!==this.session.epoch){if(this.windowPause)this.#revoke('Window recovery received a mismatched session or epoch');return;}
    if(frame.driverFailure===true){this.#revoke(frame.reason||'Local driver failure');return;}
    if(frame.terminal===true){
      if(!TERMINAL_REASONS.has(frame.reason)||!Number.isSafeInteger(frame.lastTrustedTick)||frame.lastTrustedTick<0){this.#revoke('Malformed authenticated terminal notification');return;}
      this.#revoke(`Authenticated bridge terminal: ${frame.reason}`);return;
    }
    if(this.windowPause){
      const held=this.windowPause;if(frame.modalNoClient===true&&frame.reason==='sample-error:accept-deadline-exceeded'&&frame.modalIntervalToken===held.token&&Number.isSafeInteger(frame.offerSequence)&&(!held.finished||frame.offerSequence<held.offerFloor))return;
      if(frame.fatal===true||frame.complete!==true||!Number.isSafeInteger(frame.tick)||frame.tick<this.session.tick){if(frame.fatal&&String(frame.reason||'').startsWith('game-exit:'))this.session.gameExited=true;this.#revoke('Window operation mixed with lost continuity or game exit; fresh session required');return;}
      const pause=this.windowPause;if(!pause.finished)return;
      if(!Number.isSafeInteger(frame.offerSequence)){this.#revoke('Window recovery lacks fresh per-offer authentication');return;}
      if(frame.offerSequence<pause.offerFloor)return;
      try{this.driver.completeWindowSuspension({...this.session});}catch{this.#revoke('Window recovery authority was retired');return;}
      this.windowPause=null;this.session.phase=pause.fromPhase;
    }
    const validTick=Number.isSafeInteger(frame.tick)&&frame.tick>=0;
    const normalized=frame.complete?frame:{...frame,tick:validTick?frame.tick:this.session.tick,entities:Array.isArray(frame.entities)?frame.entities:[]};
    try{
      this.history.ingest(normalized);this.#applyMetrics(normalized.metrics);if(normalized.tick>=this.session.tick)this.session.tick=normalized.tick;
      if(validTick){this.contactFailures=0;this.session.lastContactAt=this.clock();}else this.contactFailures+=1;
      const fatalExit=frame.fatal===true&&String(frame.reason||'').startsWith('game-exit:');
      if(fatalExit)this.session.gameExited=true;
      if(fatalExit||this.contactFailures>=3)this.#revoke(fatalExit?'Official nightly exited; authenticated bridge contact ended':`Authenticated bridge contact expired after ${this.contactFailures} consecutive sample failures`);
    }catch(error){this.#revoke(`Sample continuity validation failed: ${error.message}`);}
  }

  #applyMetrics(metrics){
    if(!metrics)return;
    this.performance.count+=metrics.count;this.performance.sumUs+=metrics.sumUs;this.performance.maxUs=Math.max(this.performance.maxUs,metrics.maxUs);this.performance.drops+=metrics.drops;
    if(Number.isSafeInteger(metrics.firstTick))this.performance.firstTick=this.performance.firstTick===null?metrics.firstTick:Math.min(this.performance.firstTick,metrics.firstTick);
    if(Number.isSafeInteger(metrics.lastTick))this.performance.lastTick=this.performance.lastTick===null?metrics.lastTick:Math.max(this.performance.lastTick,metrics.lastTick);
    if(Number.isSafeInteger(metrics.deliveredThroughTick))this.performance.deliveredThroughTick=this.performance.deliveredThroughTick===null?metrics.deliveredThroughTick:Math.max(this.performance.deliveredThroughTick,metrics.deliveredThroughTick);
    this.performance.repeatedHooks+=metrics.repeatedHooks||0;this.performance.sendAttempts+=metrics.sendAttempts;this.performance.sendFailures+=metrics.sendFailures;this.performance.truncatedEvents+=metrics.truncatedEvents;this.performance.truncatedEntities+=metrics.truncatedEntities;
    for(let i=0;i<10;i++)this.performance.histogram[i]+=(metrics.histogram?.[i]||0);
  }
  #performanceSnapshot(){
    const bounds=[10,25,50,100,250,500,1000,2000,5000,null];const target=Math.ceil(this.performance.count*0.95);let cumulative=0,p95UpperUs=null,p95Label='no-data';
    if(target>0)for(let i=0;i<bounds.length;i++){cumulative+=this.performance.histogram[i];if(cumulative>=target){p95UpperUs=bounds[i];p95Label=bounds[i]===null?'>5000 us':`<=${bounds[i]} us`;break;}}
    const terminal=this.performance.terminalObservedTick,delivered=this.performance.deliveredThroughTick;
    const tailCoverage=terminal===null?(this.performance.sessionEnded?`terminal-ack-unavailable; tail-after-${delivered===null?'no-delivery':delivered}-unknown`:'session-active'):(delivered!==null&&delivered>=terminal?'delivered-through-terminal':`unknown-after-${delivered===null?'no-delivery':delivered}-through-${terminal}`);
    return{scope:'advancing-tick Lua scan/watch/events/payload/pipe-attempt; elapsed wall timer',count:this.performance.count,averageUs:this.performance.count?this.performance.sumUs/this.performance.count:null,maxUs:this.performance.count?this.performance.maxUs:null,p95UpperUs,p95Label,firstTick:this.performance.firstTick,lastTick:this.performance.lastTick,deliveredThroughTick:delivered,repeatedHooks:this.performance.repeatedHooks,terminalObservedTick:terminal,tailCoverage,drops:this.performance.drops,sendAttempts:this.performance.sendAttempts,sendFailures:this.performance.sendFailures,truncatedEvents:this.performance.truncatedEvents,truncatedEntities:this.performance.truncatedEntities};
  }

  async disconnect() {
    if (!this.session) return this.status();
    if (this.busy) throw new Error('another bridge operation is pending');
    if(this.windowPause)this.#revoke('Disconnected during window suspension; only local detach is available');
    await this.#exclusive(async () => {
      if(this.watchdog!==null){this.clearWatchdog(this.watchdog);this.watchdog=null;}
      const current = this.session;
      if(this.stopWindowObservation){this.stopWindowObservation();this.stopWindowObservation=null;}
      if(this.stopSampling){this.stopSampling();this.stopSampling=null;}
      try {
        const requestSequence = current.nextRequestSequence;
        const ack = await this.driver.disconnect({ ...current, requestSequence });
        this.#validateAck('disconnect', requestSequence, ack);
        if (ack.status !== 'applied') throw new Error(ack.reason || 'disconnect was rejected by the bridge');
        this.performance.terminalObservedTick=ack.observedTick;
        if (ack.cleanupWarning) this.lastReason = `Disconnected with cleanup warning: ${ack.cleanupWarning}`;
      } catch (error) {
        if (current.revoked) {
          throw new Error(`Disconnected locally; remote disconnect acknowledgement unavailable: ${error.message}`);
        }
        throw error;
      } finally {
        this.performance.sessionEnded=true;
        this.session = null;this.windowPause=null;this.windowState=null;
        if (!this.lastReason.startsWith('Disconnected with cleanup warning:')) this.lastReason = 'Disconnected; prior capabilities were revoked';
      }
    });
    return this.status();
  }

  async restart(){
    if(!this.session?.revoked||this.busy||this.session.phase!=='uncertain')throw Error('Restart requires an irrevocably revoked session');
    if(this.driver.canRestartOwnedGame?.(this.session)!==true)throw Error('The prior game handle cannot be verified; no new game was started');
    await this.#exclusive(async()=>{await this.driver.restartOwnedGame({...this.session});this.session=null;this.windowPause=null;this.windowState=null;this.lastReason='Previous owned game stopped; starting a fresh authenticated session';});
    return this.connect();
  }

  async shutdown() {
    this.#revoke('launcher-shutdown');
    if(this.watchdog!==null){this.clearWatchdog(this.watchdog);this.watchdog=null;}
    if(this.stopSampling){this.stopSampling();this.stopSampling=null;}
    let cleanupError;
    try { if(typeof this.driver.shutdown==='function')await this.driver.shutdown(); }
    catch(error){cleanupError=error;throw error;}
    finally {
      if(this.session)this.history.endEpoch('launcher-shutdown');
      this.performance.sessionEnded=true;
      this.session=null;
      this.lastReason=cleanupError?`IKeMeter stopped; cleanup incomplete: ${cleanupError.message}`:'IKeMeter stopped; owned runtime and capabilities were cleaned up';
    }
  }

  #validateAck(opcode, requestSequence, ack) {
    if (!ack || ack.epoch !== this.session.epoch || ack.requestSequence !== requestSequence || ack.opcode !== opcode || !Number.isSafeInteger(ack.observedTick) || ack.observedTick < 0) {
      throw new Error('stale, malformed, or mismatched bridge acknowledgement');
    }
  }

  async #exclusive(action) {
    this.busy = true;
    try { return await action(); }
    catch (error) {
      this.lastReason = error.message;
      throw error;
    } finally { this.busy = false; }
  }
}

module.exports = { SessionController };
