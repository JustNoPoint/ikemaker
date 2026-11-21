'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn, ChildProcess } = require('node:child_process');
const { writeManifest, installedBridgeBytes, recoverSessions } = require('./recover_sessions');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { parseTerminalFrame } = require('./terminal_frame');
const { createSessionBootstrap, restrictFile } = require('./session_bootstrap');
const { deriveOfferName } = require('./transport_protocol');
const {prepareSessionStorage}=require('./session_storage');
const {resolveScreenshotPlan,pngState,waitForStablePng,preserveSnapshot,preserveSnapshotPair,parseSnapshotEntity,addSnapshotRootCustomState}=require('./snapshot_capture');
const {locateExecutable,verifyLaunchExecutable,hashSnapshotExecutable}=require('./snapshot_engine_identity');
const {loadLaunchManifest,retainPrelaunchBinding,writeBindingReceipt,bindingReceiptPath,parseRootSelection}=require('./snapshot_binding');
const {openSampleCreditRelay}=require('./sample_credit_relay');
const {verifyStockTelemetryPhase,telemetrySession,parsePlayerTelemetry}=require('./player_telemetry_wire');
const {watchPlan,encodeWatchPlan,decodeWatchRows}=require('./watch_wire');
const {createTelemetryDiagnostics}=require('./telemetry_diagnostics');

function waitForFile(file, timeoutMs = 12000, signal) {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      if(signal?.aborted)return reject(signal.reason||new Error('session revoked'));
      if (fs.existsSync(file)) return resolve(file);
      if (performance.now() - started >= timeoutMs) return reject(new Error(`bounded wait expired for ${path.basename(file)}`));
      setTimeout(poll, 25);
    };
    poll();
  });
}

function assertSnapshotAuthority(current,active,sessionId,interval) {
  if(current!==active||active.revoked||active.windowSuspended||active.operationAbort.signal.aborted||
     active.session.bootstrap.sessionId!==sessionId||active.windowIntervalToken!==interval) {
    throw Error('Snapshot lost its session or window authority before evidence retention');
  }
}

function readResult(file) {
  return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
}

async function removeTransient(files, options = {}) {
  const exists = options.exists || fs.existsSync;
  const remove = options.remove || ((file) => fs.rmSync(file));
  const delay = options.delay || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const attempts = options.attempts || 20;
  const leftovers = [];
  for (const file of files.filter(Boolean)) {
    for (let attempt = 0; attempt < attempts && exists(file); attempt += 1) {
      try { remove(file); }
      catch (error) {
        if (error.code === 'ENOENT') break;
        if (!['EPERM','EBUSY'].includes(error.code)) throw error;
        await delay(10);
      }
    }
    if (exists(file)) leftovers.push(file);
  }
  return leftovers;
}

function formatCleanupWarning(prefix, files) {
  return files.length ? `${prefix}:${files.map((file)=>path.basename(file)).join(',')}` : '';
}

function appendCleanupWarning(result, warning) {
  if (!warning) return result;
  return { ...result, cleanupWarning: [result.cleanupWarning,warning].filter(Boolean).join('; ') };
}

function retireCommandOffer(active, requestSequence, pipeChildren, writeConfig) {
  for (const child of pipeChildren) if (child && !child.killed) child.kill();
  if (active.commandOffer?.sequence !== requestSequence) return false;
  active.commandOffer = null;
  writeConfig();
  return true;
}

function installOwnedBridge(active) {
  fs.writeFileSync(active.bridgeTarget,active.bridgeBytes,{flag:'wx'});
  active.bridgeOwned=true;
}
function removeOwnedBridge(active) {
  if (!active.bridgeOwned || !fs.existsSync(active.bridgeTarget)) return '';
  const stat=fs.lstatSync(active.bridgeTarget);
  if (stat.isSymbolicLink() || !stat.isFile() || !fs.readFileSync(active.bridgeTarget).equals(active.bridgeBytes)) return 'bridge-bytes-changed';
  fs.unlinkSync(active.bridgeTarget);
  return '';
}

function observeChildExit(child,active,persist) {
  child.once('exit',()=>{active.children.delete(child);try{persist(active);}catch{ /* persistence already latches failure; callbacks must not throw */ }});
}

function persistRecoveryRecord(active,runtime,options={}) {
  if(active.recoveryFailed)throw new Error('Recovery journal is frozen after a failed commit');
  const payload={version:2,generation:(active.recoveryGeneration||0)+1,bridgeOwned:!!active.bridgeOwned,bridgeSha256:crypto.createHash('sha256').update(active.bridgeBytes).digest('hex'),spawnPending:!!active.spawnPending,sessionId:active.session.bootstrap.sessionId,ownerPid:process.pid,runtime:fs.realpathSync(runtime),gamePid:active.children.has(active.game)?active.game.pid:null,childPids:[...active.children].filter((child)=>child!==active.game&&Number.isSafeInteger(child.pid)).map((child)=>child.pid),bridgeTarget:active.bridgeTarget,config:active.config,sessionFile:active.session.file,sampleStop:path.join(active.results,'sample-stop')};
  try {
    (options.write||writeManifest)(active.recoveryFile,payload);
    (options.restrict||restrictFile)(active.recoveryFile,active.session.sid);
    active.recoveryGeneration=payload.generation;
  } catch(error){active.recoveryFailed=true;active.recoveryWarning=error.message;throw error;}
  return payload;
}

function gameLaunchOptions(options={}) {
  const mode=options.launchMode||'interactive';
  if(!['interactive','fixture'].includes(mode))throw new Error('Unknown game launch mode');
  const ai=options.aiLevel??8;if(!Number.isInteger(Number(ai))||Number(ai)<0||Number(ai)>8)throw new Error('AI level must be 0 through 8');
  const players=options.players||['kfm','kfm'];if(!Array.isArray(players)||![2,4].includes(players.length)||players.some(p=>typeof p!=='string'||!p||p.startsWith('-')))throw new Error('Two or four explicit player identifiers are required');
  if(players.length===4&&options.launchManifest)throw Error('Asset binding requires a two-root launch');
  const args=['-p1',players[0],'-p2',players[1],'-s','stages/stage0.def','-p1.ai',mode==='fixture'?String(ai):'0','-p2.ai',String(ai)];
  if(players.length===4)args.push('-p3',players[2],'-p4',players[3],'-p3.ai',String(ai),'-p4.ai',String(ai),'-tmode1','1','-tmode2','1');
  if(mode==='fixture')args.push('-time','1','-rounds','1');
  args.push('-loadmotif','1');
  return {args,windowsHide:mode==='fixture'};
}

class AttachedNightlyDriver {
  constructor(options = {}) {
    this.root = path.resolve(options.root || path.join(__dirname, '..'));
    this.runtime = path.resolve(options.runtime || '');
    this.powershell = options.powershell || process.env.IKEMETER_PWSH || 'pwsh.exe';
    this.timeoutMs = options.timeoutMs || 12000;
    this.players = options.players || ['kfm','kfm'];
    this.aiLevel = String(options.aiLevel ?? 8);
    if(options.launchManifest&&options.players?.length===4)throw Error('Asset binding requires a two-root launch');
    this.launchBinding=options.launchManifest?loadLaunchManifest(options.launchManifest,this.runtime):null;
    this.gameLaunch=gameLaunchOptions(this.launchBinding ? {...options,players:this.launchBinding.manifest.selections.map(item=>item.launchArgument)} : options);
    this.rootSlots=(this.launchBinding||this.players.length===2)?[1,2]:[1,2,3,4];
    this.active = null;
    this.storageRoot=options.storageRoot;
  }

  setTelemetryDiagnosticSink(sink){this.telemetryDiagnosticSink=typeof sink==='function'?sink:null;}
  telemetryDiagnosticsStopped(session){
    const active=this.active;
    return Boolean(active?.diagnosticFailure&&session?.epoch===1&&
      active.session.bootstrap.sessionId===session.sessionId);
  }

  #wireGameDiagnostics(active,game) {
    const sessionId=active.session.bootstrap.sessionId;
    const ready=()=>this.active===active&&active.diagnosticsAuthenticated&&!active.operationAbort.signal.aborted;
    const publish=(value)=>{if(ready())this.telemetryDiagnosticSink?.({sessionId,epoch:1,...value});};
    const stopDiagnostics=()=>{
      if(this.active!==active||active.operationAbort.signal.aborted||active.diagnosticFailure||!active.diagnosticCapture)return;
      active.diagnosticFailure=true;
      active.diagnosticsAuthenticated=false;
      active.diagnosticCapture?.close();
    };
    if(this.telemetryDiagnosticSink){
      active.diagnosticCapture=createTelemetryDiagnostics({onEvent:event=>publish({event}),onDrop:dropped=>publish({dropped})});
    }
    for(const source of ['stdout','stderr']){
      const stream=game[source];
      let processing=false,ended=false,discardStartupTail=false;
      const finish=()=>{
        if(ended&&!processing&&ready()){
          try{active.diagnosticCapture?.end(source);}catch{stopDiagnostics();}
        }
      };
      stream.on('data',chunk=>{
        if(!ready()||!active.diagnosticCapture){
          if(chunk.length)discardStartupTail=chunk[chunk.length-1]!==10;
          return;
        }
        processing=true;
        stream.pause();
        let offset=0;
        const next=()=>{
          if(!ready()||offset===chunk.length){
            processing=false;
            finish();
            stream.resume();
            return;
          }
          const end=Math.min(offset+4096,chunk.length);
          let part=chunk.subarray(offset,end);
          if(discardStartupTail){
            const newline=part.indexOf(10);
            discardStartupTail=newline<0;
            part=discardStartupTail?part.subarray(part.length):part.subarray(newline+1);
          }
          try{if(part.length)active.diagnosticCapture.write(source,part);}
          catch{stopDiagnostics();processing=false;stream.resume();return;}
          offset=end;
          setImmediate(next);
        };
        next();
      });
      stream.once('end',()=>{ended=true;finish();});
      stream.on('error',stopDiagnostics);
    }
  }

  detachedGameRunning(){const record=this.detachedGame;if(!record)return false;const game=record.game,proof=record.proof;return game instanceof ChildProcess&&game===proof?.game&&game.pid===proof.pid&&typeof proof.processStarted==='string'&&typeof proof.image==='string'&&proof.image===record.imagePath&&game.exitCode===null&&game.signalCode===null&&!game.killed;}
  processStatus(session){if(!session)return{detachedGameRunning:this.detachedGameRunning()};const active=this.active;if(!active||active.session.bootstrap.sessionId!==session.sessionId)return null;return{gameExited:active.gameExitCode!==undefined,...(active.bindingLatest&&{snapshotBinding:active.bindingLatest})};}

  observeWindow(session,listener){const active=this.active;if(!active||active.session.bootstrap.sessionId!==session.sessionId)throw Error('Window observer belongs to another session');if(!active.windowListeners)return()=>{};active.windowListeners.add(listener);if(active.windowFailure)listener({error:'Owned window observation lost'});else if(active.windowState)listener(active.windowState);return()=>active.windowListeners.delete(listener);}
  beginWindowSuspension(session,token){const active=this.active;if(!active||active.revoked||active.session.bootstrap.sessionId!==session.sessionId||active.commandOffer)throw Error('A native command cannot be fenced safely');active.windowSuspended=true;active.windowIntervalToken=token;if(active.inflightSample)active.inflightSample.windowToken=token;}
  freshWindowOfferFloor(session){const active=this.active;if(!active||active.revoked||active.session.bootstrap.sessionId!==session.sessionId||!active.windowSuspended||active.commandOffer)throw Error('Window continuity cannot be verified');return active.nextSampleSequence;}
  completeWindowSuspension(session){const active=this.active;if(!active||active.revoked||active.session.bootstrap.sessionId!==session.sessionId)throw Error('Retired window authority');active.windowSuspended=false;}
  canRestartOwnedGame(session){const active=this.active;if(!active||!active.revoked||active.session.bootstrap.sessionId!==session?.sessionId||!(active.game instanceof ChildProcess))return false;if(active.gameExitCode!==undefined)return true;const game=active.game;return active.children.has(game)&&game.exitCode===null&&game.signalCode===null&&!game.killed&&active.windowProof?.game===game&&active.windowProof.sessionId===session.sessionId&&active.windowProof.pid===game.pid&&typeof active.windowProof.processStarted==='string'&&active.windowProof.image===active.imagePath;}
  async restartOwnedGame(session){if(!this.canRestartOwnedGame(session))throw Error('The prior owned child handle cannot be verified; no new game was started');const warning=await this.#cleanup(true);if(warning)throw Error('Previous game cleanup is incomplete; no new game was started: '+warning);}

  async connect({watches=[]}={}) {
    const configuredWatches=watchPlan(watches,this.rootSlots);
    if (this.active) throw new Error('attached nightly is already active');
    if(this.detachedGameRunning())throw Error('The previously Meter-owned game is still running. Close it before Connect starts a new game.');this.detachedGame=null;
    const executable = path.join(this.runtime, 'Ikemen_GO.exe');
    const mods = path.join(this.runtime, 'external', 'mods');
    const save = path.join(this.runtime, 'save');
    if (!fs.existsSync(executable) || !fs.existsSync(mods) || !fs.existsSync(save)) throw new Error('configured official-nightly runtime is incomplete');
    const bridgeTarget = path.join(mods, 'ikemeter_bridge.lua');
    const leaseFile=path.join(this.runtime,'.ikemeter-owner.json');
    const leaseStat=fs.lstatSync(leaseFile);
    if(leaseStat.isSymbolicLink()||!leaseStat.isFile())throw new Error('Runtime lease is unsafe');
    const lease=JSON.parse(fs.readFileSync(leaseFile,'utf8'));
    if(lease.version!==1||lease.pid!==process.pid||typeof lease.token!=='string')throw new Error('Connect requires this launcher to hold the runtime lease');
    const storage=prepareSessionStorage({root:this.storageRoot,packageRoot:this.root,runtime:this.runtime,powershell:this.powershell});
    const failures=recoverSessions(this.root,{runtime:fs.realpathSync(this.runtime)},{additionalSessionRoots:[storage.sessions]});
    if(failures.length)throw new Error(`Prior session cleanup requires attention: ${failures.join('; ')}`);
    if (fs.existsSync(bridgeTarget)) throw new Error('an unowned IKeMeter bridge file already exists in the runtime');
    const launchImage=locateExecutable(executable);
    const session = createSessionBootstrap(storage.sessions);
    const key = Buffer.from(session.bootstrap.key, 'base64url');
    const telemetryEndpoint = deriveOfferName(key,{epoch:1,sequence:1,direction:'telemetry',opcode:''});
    const config = path.join(session.directory, 'bridge.conf');
    const bridgeSource = path.join(this.root, 'bridge', 'ikemeter_bridge.lua');
    const bridgeBytes = installedBridgeBytes(fs.readFileSync(bridgeSource),session.bootstrap.sessionId);
    const baseLines = ['protocol=1',`session=${session.bootstrap.sessionId}`,'epoch=1',`telemetry=${telemetryEndpoint}`];
    if(this.rootSlots.length===4)baseLines.push('rootSlots=4');
    if(this.launchBinding)baseLines.push('binding=1');
    this.active = { ...launchImage,session, key, baseLines, config, bridgeTarget, bridgeBytes, results: session.directory, recoveryFile:path.join(session.directory,'recovery.json'), operationAbort:new AbortController(), game: null, children:new Set(), nextSampleSequence:2, commandOffer:null, sampleOffer:null, sampling:false,snapshotIntervals:new WeakMap() };
    const activeSession=this.active;
    try {
      fs.writeFileSync(config, baseLines.join('\n')+'\n',{encoding:'utf8',flag:'wx',mode:0o600});
      restrictFile(config, session.sid);
      this.#writeRecovery(this.active);
      installOwnedBridge(this.active);
      this.#writeRecovery(this.active);
      await this.#startSampleHost();
      const telemetryFile = path.join(session.directory, 'telemetry.json');
      await this.#startPipe(telemetryEndpoint, telemetryFile, 'Frame', 'Telemetry');
      activeSession.launchEngine=await hashSnapshotExecutable(activeSession.imagePath,activeSession.identity,activeSession.operationAbort.signal);
      activeSession.richTelemetry=verifyStockTelemetryPhase(this.runtime,activeSession.launchEngine.sha256);
      if(this.rootSlots.length===4&&!activeSession.richTelemetry)throw Error('Four-root capture requires the pinned stock telemetry runtime');
      if(activeSession.richTelemetry){
        baseLines.push('richTelemetry=1');
        if(configuredWatches.length){
          activeSession.watch={plan:configuredWatches,projectId:this.launchBinding?.manifest.projectId??null};
          baseLines.push(`watchPlan=${encodeWatchPlan(configuredWatches)}`);
        }
        this.#writeConfig();
      }
      if(this.launchBinding){
        await retainPrelaunchBinding(this.launchBinding,activeSession,this.gameLaunch.args,()=>{
          activeSession.operationAbort.signal.throwIfAborted();
          if(this.active!==activeSession||activeSession.revoked)throw Error('Connect lost launch authority');
        });
      }
      activeSession.operationAbort.signal.throwIfAborted();
      if(this.active!==activeSession)throw Error('Connect lost launch authority');
      verifyLaunchExecutable(executable,activeSession.imagePath,activeSession.identity);
      this.gameStartedAtMs=Date.now();this.gameStartedAtMonotonicMs=performance.now();
      this.active.spawnPending=true;this.#writeRecovery(this.active);
      const game = spawn(activeSession.imagePath,this.gameLaunch.args,{cwd:this.runtime,env:{...process.env,IKEMETER_SESSION_FILE:config},windowsHide:this.gameLaunch.windowsHide,stdio:['ignore','pipe','pipe']});
      const startupFailure=new Promise((resolve,reject)=>{game.once('error',reject);game.once('exit',code=>reject(new Error('official nightly exited before startup completed (code '+code+')')));});startupFailure.catch(()=>{});
      this.#wireGameDiagnostics(activeSession,game);
      this.#track(game,activeSession);activeSession.game=game;
      this.#writeRecovery(activeSession);
      game.once('exit',(code)=>{if(this.active===activeSession)activeSession.gameExitCode=code;});
      if(!this.gameLaunch.windowsHide)await Promise.race([this.#startWindowObserver(activeSession),startupFailure]);
      await Promise.race([
        waitForFile(telemetryFile,this.timeoutMs,this.active.operationAbort.signal),
        startupFailure,
      ]);
      const telemetry = readResult(telemetryFile).fields;
      if (telemetry.session !== session.bootstrap.sessionId || telemetry.epoch !== '1' || telemetry.mode !== 'quickvs') throw new Error('telemetry did not authenticate the expected offline session');
      const tick = Number(telemetry.tick);
      if (!Number.isSafeInteger(tick)) throw new Error('telemetry tick is malformed');
      if(activeSession.richTelemetry){
        activeSession.telemetrySession=telemetrySession(activeSession.launchEngine.sha256,this.rootSlots,true,Boolean(activeSession.diagnosticCapture));
        activeSession.diagnosticsAuthenticated=!activeSession.diagnosticFailure;
      }
      return { sessionId: session.bootstrap.sessionId, epoch: 1, tick, notice:storage.notice,
        ...(activeSession.telemetrySession&&{telemetrySession:activeSession.telemetrySession}),
        ...(activeSession.watch&&{watch:activeSession.watch}) };
    } catch (error) { await this.#cleanup(true); throw error; }
  }

  async command(opcode, session) {
    if (!['pause','step','resume','snapshot'].includes(opcode) || !this.active || this.active.revoked || this.active.windowSuspended) throw new Error('command is unavailable');
    return this.#exchange(opcode, session.requestSequence);
  }

  async captureSnapshot(session){
    if(!this.active||this.active.revoked||this.active.windowSuspended)throw Error('snapshot is unavailable');
    const active=this.active,interval=active.windowIntervalToken,{folder,prefix}=resolveScreenshotPlan(this.runtime),before=pngState(folder);
    const ack=await this.#exchange('snapshot',session.requestSequence);
    if(ack.status!=='applied')return ack;
    assertSnapshotAuthority(this.active,active,session.sessionId,interval);
    if(ack.epoch!==session.epoch||ack.requestSequence!==session.requestSequence||ack.opcode!=='snapshot'||ack.observedTick!==session.tick||ack.snapshotFrame?.paused!==true||ack.snapshotFrame.tick!==session.tick)throw Error('snapshot acknowledgement did not prove current frozen authority');
    const signal=active.operationAbort.signal;
    const [captured,engine]=await Promise.all([
      waitForStablePng(folder,before,{timeoutMs:this.timeoutMs,prefix,signal}),
      hashSnapshotExecutable(active.imagePath,active.identity,signal),
    ]);
    if(engine.sha256!==active.launchEngine.sha256)throw Error('Snapshot executable digest changed since Connect');
    verifyLaunchExecutable(path.join(this.runtime,'Ikemen_GO.exe'),active.imagePath,active.identity);
    assertSnapshotAuthority(this.active,active,session.sessionId,interval);
    const snapshot=preserveSnapshot(captured.file,captured.bytes,path.join(active.results,'snapshots'),{
      sessionId:session.sessionId,epoch:session.epoch,tick:ack.observedTick,paused:true,capturedAt:new Date().toISOString(),
      engine,
      frame:ack.snapshotFrame,
      capabilities:{fullComposite:'candidate-until-duplicate-hash-verification',renderedFrame:'stock-screenshot-observed',animationMetadata:'bounded-stock-hook-observations-and-timing-estimates-for-roots-and-helpers',animationOwnerSlots:'reported-animPN-and-spritePN-source-mapping-unavailable',alpha:'opaque-window-composite-engine-forces-alpha-255',transparentLayers:'unavailable-without-matting-or-instrumented-renderer',bgFgSeparation:'unavailable-stock-engine',explodAndAttachedEnumeration:'unavailable-current-bridge',pixelProvenance:'unavailable-stock-engine',paletteWorkshopTrace:'handoff-pending-index-provenance'},
      uncertainty:['stock framebuffer screenshot is not renderer-instrumented','nightly asynchronous screenshot may be a later redraw of the same paused simulation state'],
    });
    active.snapshotIntervals.set(snapshot,{interval,binding:ack.snapshotBinding});
    return{...ack,snapshot};
  }

  verifySnapshotPair(first,second,metadata){
    const active=this.active;
    const left=active?.snapshotIntervals.get(first),right=active?.snapshotIntervals.get(second);
    if(!left||!right||left.interval!==right.interval)throw Error('snapshot verification belongs to a retired session or window interval');
    const assertCurrent=()=>assertSnapshotAuthority(this.active,active,metadata.sessionId,left.interval);
    assertCurrent();
    const pair=preserveSnapshotPair(path.join(active.results,'snapshots'),first,second,metadata);
    active.snapshotIntervals.delete(first);active.snapshotIntervals.delete(second);
    if(!pair.stable||!active.bindingPre)return pair;
    const receipt=bindingReceiptPath(path.dirname(pair.verificationPath),pair.id);
    const state={pairId:pair.id,status:'pending',receiptPath:receipt};
    active.bindingLatest=state;
    const assertReceiptCurrent=()=>{
      if(this.active===active&&!active.revoked&&!active.operationAbort.signal.aborted&&
         (active.windowSuspended||active.windowIntervalToken!==left.interval)){
        throw Error('Window continuity changed while checking the binding receipt');
      }
      assertCurrent();
    };
    active.bindingWork=(active.bindingWork||Promise.resolve()).then(()=>{
      assertReceiptCurrent();
      return writeBindingReceipt(active,this.launchBinding,first,second,pair,left.binding,right.binding,assertReceiptCurrent);
    }).then(result=>{Object.assign(state,result);}).catch(error=>{
      state.status='unavailable';
      state.reason=error.message;
      if(this.active===active&&!active.operationAbort.signal.aborted)console.error('Snapshot binding receipt unavailable: '+error.message);
    });
    return {...pair,bindingReceiptPath:receipt};
  }

  async disconnect(session) {
    if (!this.active) throw new Error('no attached nightly is active');
    let acknowledgement;
    let exchangeError;
    try { acknowledgement = await this.#exchange('disconnect', session.requestSequence); }
    catch (error) { exchangeError = error; }
    const cleanupWarning = await this.#cleanup(false);
    if (exchangeError) throw exchangeError;
    return appendCleanupWarning(acknowledgement,cleanupWarning);
  }

  revoke(reason) {
    const active=this.active;if(!active||active.revoked)return;
    active.revoked=reason||'session revoked';active.sampling=false;
    active.operationAbort.abort(new Error(active.revoked));
    active.diagnosticsAuthenticated=false;
    active.diagnosticCapture?.close();
    active.commandOffer=null;active.sampleOffer=null;
    try{this.#writeConfig();}catch(error){active.revocationWarning=error.message;}
    for(const child of active.children)if(child!==active.game){try{child.kill();}catch{}}
  }

  async shutdown() { const warning=await this.#cleanup(true);if(warning)throw new Error(`Cleanup incomplete; recovery record retained: ${warning}`); }

  async sample(session) {
    if (!this.active || this.active.revoked || session.epoch !== 1 ||
        this.active.session.bootstrap.sessionId!==session.sessionId || this.active.inflightSample) {
      throw new Error('sampling is unavailable');
    }
    const active=this.active;
    const sequence=this.active.nextSampleSequence++;
    const sampleContext={sequence,windowToken:active.windowSuspended?active.windowIntervalToken:null};active.inflightSample=sampleContext;
    const endpoint=deriveOfferName(this.active.key,{epoch:1,sequence,direction:'telemetry',opcode:''});
    const pipePrefix='\\\\.\\pipe\\';
    const nativeWindow=active.windowState?{processId:active.game.pid,processStarted:active.windowState.processStarted,threadId:active.windowState.threadId,hwnd:active.windowState.hwnd}:null;
    const job={pipeName:endpoint.slice(pipePrefix.length),sequence,nativeWindow};
    try {
    const result=await active.sampleRelay.request(job,()=>{
      if(this.active!==active||active.revoked||active.operationAbort.signal.aborted)throw Error('sample credit belongs to a retired session');
      active.sampleOffer={sequence,endpoint};this.#writeConfig();
    });
    if(this.active!==active||active.revoked||active.operationAbort.signal.aborted)throw new Error('sample completed for a retired session');
    if(!result.bounded){const error=new Error(result.error||'sample was not bounded');if(require('./owned_window_observer').isRetiredModalAccept(result,nativeWindow)){error.modalNoClient=true;error.offerSequence=sequence;error.modalIntervalToken=sampleContext.windowToken;}throw error;}
    const terminal=parseTerminalFrame(result.payload,{sessionId:session.sessionId,epoch:session.epoch,sequence});
    if(terminal)return {...terminal,offerSequence:sequence};
    const fields=Object.create(null);
    const parts=result.payload.split('\t');
    for(const part of parts){
      const match=part.match(/^([A-Za-z][A-Za-z0-9]*)=([A-Za-z0-9_.,+-]+)$/);
      if(match){
        if(Object.hasOwn(fields,match[1])&&/^(?:epoch|tick|root(?:Observation|\d+))$/.test(match[1]))throw Error('duplicate sample identity field');
        fields[match[1]]=match[2];
      }
    }
    const tick=Number(fields.tick);
    if(fields.epoch!=='1'||!/^\d+$/.test(fields.tick||'')||!Number.isInteger(tick)||tick>2147483647) {
      throw Error('sample time identity is malformed');
    }
    const entities=[];
    const entityKeys=Object.keys(fields).filter((name)=>/^entity\d+$/.test(name)).sort((a,b)=>Number(a.slice(6))-Number(b.slice(6)));
    for(const key of entityKeys){
      const values=fields[key].split(',');if(values.length!==10)throw new Error('sample entity is malformed');
      entities.push({kind:values[0],owner:Number(values[1]),runtimeId:Number(values[2]),sourceRuntimeId:Number(values[3]),state:Number(values[4]),anim:Number(values[5]),x:Number(values[6]),y:Number(values[7]),vx:Number(values[8]),vy:Number(values[9])});
    }
    const events=[];const eventKeys=Object.keys(fields).filter((name)=>/^event\d+$/.test(name)).sort((a,b)=>Number(a.slice(5))-Number(b.slice(5)));
    for(const key of eventKeys){const values=fields[key].split(',');if(values.length!==13)throw new Error('sample event is malformed');events.push({action:values[0],kind:values[1],owner:Number(values[2]),runtimeId:Number(values[3]),sourceRuntimeId:Number(values[4]),tick:Number(values[5]),sampleTick:Number(values[6]),watch:{state:Number(values[7]),anim:Number(values[8]),x:Number(values[9]),y:Number(values[10]),vx:Number(values[11]),vy:Number(values[12])}});}
    const declaredCount=Number(fields.count);const dense=Number.isSafeInteger(declaredCount)&&declaredCount===entityKeys.length&&entityKeys.every((key,index)=>key===`entity${index+1}`);
    const declaredEvents=Number(fields.eventCount);const eventsDense=Number.isSafeInteger(declaredEvents)&&declaredEvents===eventKeys.length&&eventKeys.every((key,index)=>key===`event${index+1}`);
    const complete=fields.complete==='1'&&dense&&eventsDense;
    const histogram=(fields.costHistogram||'').split(',').map(Number);if(histogram.length!==10||histogram.some((value)=>!Number.isSafeInteger(value)||value<0))throw new Error('sample cost histogram is malformed');
    const metricCount=Number(fields.costCount)||0;if(histogram.reduce((sum,value)=>sum+value,0)!==metricCount)throw new Error('sample cost histogram count mismatch');
    const firstTick=Number(fields.costFirstTick);const lastTick=Number(fields.costLastTick);const deliveredThroughTick=Number(fields.deliveredThroughTick);const repeatedHooks=Number(fields.repeatedHooks);
    if(!Number.isSafeInteger(deliveredThroughTick)||deliveredThroughTick<0||!Number.isSafeInteger(repeatedHooks)||repeatedHooks<0||(metricCount>0&&(!Number.isSafeInteger(firstTick)||firstTick<0||!Number.isSafeInteger(lastTick)||lastTick<firstTick)))throw new Error('sample metric coverage is malformed');
    const frame={offerSequence:sequence,sessionId:active.session.bootstrap.sessionId,epoch:Number(fields.epoch),tick:Number(fields.tick),complete,entities,events,eventDrops:Number(fields.eventDrops)||0,metrics:{count:metricCount,sumUs:Number(fields.costSumUs)||0,maxUs:Number(fields.costMaxUs)||0,p95Us:Number(fields.costP95Us)||0,drops:Number(fields.costDrops)||0,histogram,firstTick:metricCount?firstTick:null,lastTick:metricCount?lastTick:null,deliveredThroughTick,repeatedHooks,sendAttempts:Number(fields.sendAttempts)||0,sendFailures:Number(fields.sendFailures)||0,truncatedEvents:Number(fields.truncatedEvents)||0,truncatedEntities:Number(fields.truncatedEntities)||0},reason:complete?'':(dense&&eventsDense?'bridge-incomplete-scan':'sample-count-mismatch')};
    if(active.telemetrySession)frame.telemetry=parsePlayerTelemetry(fields,active.telemetrySession,true);
    if(active.watch)frame.watchRows=decodeWatchRows(parts,active.watch.plan,frame.telemetry,tick);
    if(active.diagnosticFailure)frame.telemetryDiagnosticsStopped=true;
    return frame;
    } finally {if(active.inflightSample===sampleContext)active.inflightSample=null;if(active.sampleOffer?.sequence===sequence)active.sampleOffer=null;}
  }

  startSampling(session,onFrame) {
    if(!this.active||this.active.revoked||this.active.sampling)throw new Error('sampling loop is unavailable or revoked');
    const active=this.active;active.sampling=true;active.onFailure=onFrame;
    const onGameExit=(code)=>{if(this.active===active&&active.sampling){try{onFrame({sessionId:session.sessionId,epoch:session.epoch,tick:null,complete:false,entities:[],fatal:true,reason:`game-exit:${code}`});}catch{}}};
    active.game.once('exit',onGameExit);
    if(active.gameExitCode!==undefined){queueMicrotask(()=>onGameExit(active.gameExitCode));return()=>{active.sampling=false;active.game.off('exit',onGameExit);};}
    const loop=async()=>{while(this.active===active&&active.sampling){try{onFrame(await this.sample(session));}catch(error){try{onFrame({sessionId:session.sessionId,epoch:session.epoch,tick:null,complete:false,entities:[],fatal:error.relayFatal===true,modalNoClient:error.modalNoClient===true,offerSequence:error.offerSequence,modalIntervalToken:error.modalIntervalToken,reason:`sample-error:${error.message}`});}catch{}await new Promise((resolve)=>setTimeout(resolve,25));}}};
    loop();return()=>{active.sampling=false;active.game.off('exit',onGameExit);};
  }

  async #exchange(opcode, requestSequence) {
    const prefix = `${requestSequence}-${opcode}`;
    const ackFile = path.join(this.active.results, `${prefix}-ack.json`);
    const commandFile = path.join(this.active.results, `${prefix}-command.json`);
    const command = deriveOfferName(this.active.key,{epoch:1,sequence:requestSequence,direction:'command',opcode});
    const ack = deriveOfferName(this.active.key,{epoch:1,sequence:requestSequence,direction:'ack',opcode:''});
    const transient=[ackFile,`${ackFile}.ready`,`${ackFile}.server.log`,commandFile,`${commandFile}.ready`,`${commandFile}.server.log`];
    let result;let exchangeError;const pipeChildren=[];const active=this.active;
    try{
      pipeChildren.push(await this.#startPipe(ack, ackFile, 'Frame', 'Ack'));
      pipeChildren.push(await this.#startPipe(command, commandFile, 'Presence', 'Metadata'));
      this.active.commandOffer={sequence:requestSequence,opcode,command,ack};this.#writeConfig();
      await Promise.all([waitForFile(commandFile,this.timeoutMs,active.operationAbort.signal),waitForFile(ackFile,this.timeoutMs,active.operationAbort.signal)]);
      const received = readResult(ackFile);
      if (!received.bounded) throw new Error(received.error || 'bridge acknowledgement was not bounded');
      const fields = received.fields || {};
      const snapshotKeys=Object.keys(fields).filter(name=>/^snap\d+$/.test(name)).sort((a,b)=>Number(a.slice(4))-Number(b.slice(4)));
      const snapshotEntities=snapshotKeys.map(name=>{
        const entity=parseSnapshotEntity(fields[name],Boolean(active.bindingPre));
        return active.richTelemetry&&fields.paused==='1'?addSnapshotRootCustomState(entity,fields):entity;
      });
      const snapshotBinding=active.bindingPre&&fields.paused==='1'?{
        roots:[parseRootSelection(fields.bind1,1),parseRootSelection(fields.bind2,2)],
        prefixes:snapshotKeys.map((name,index)=>{
          const entity=snapshotEntities[index],parts=fields[name].split(',');
          if((entity.kind==='player'||entity.kind==='helper')&&parts.length===20&&/^[a-zA-Z0-9]{1,16}$/.test(parts[19])){
            return {kind:entity.kind,runtimeId:entity.runtimeId,prefix:parts[19]};
          }
          return null;
        }).filter(Boolean)
      }:null;
      const camera=fields.cameraCoverage==='observed'&&fields.cameraX!==undefined&&fields.cameraY!==undefined&&fields.cameraZoom!==undefined?{x:Number(fields.cameraX),y:Number(fields.cameraY),zoom:Number(fields.cameraZoom),provenance:'engine-observed-at-hook'}:null;
      result={ epoch:Number(fields.epoch),requestSequence:Number(fields.seq),opcode:fields.op,status:fields.status,observedTick:Number(fields.tick),reason:fields.reason||'',fromTick:fields.from===undefined?null:Number(fields.from),heldSamples:fields.held===undefined?null:Number(fields.held),snapshotFrame:fields.paused==='1'?{tick:Number(fields.tick),paused:true,camera,cameraCoverage:fields.cameraCoverage||'unavailable',entities:snapshotEntities,entityCoverage:{captured:Number(fields.entityCaptured)||snapshotEntities.length,total:Number(fields.entityTotal)||snapshotEntities.length,truncated:fields.entityTruncated==='1'},coverage:fields.coverage||'bounded-roots-helpers-projectiles'}:null };
      if(result.snapshotFrame){
        result.snapshotFrame.entityCoverage.ownerSlotsOmitted=/^(?:[0-9]|[12][0-9]|3[0-2])$/.test(fields.ownerSlotsOmitted)?Number(fields.ownerSlotsOmitted):null;
        if(snapshotBinding)result.snapshotBinding=snapshotBinding;
      }
    }catch(error){exchangeError=error;}
    if(this.active===active)retireCommandOffer(active,requestSequence,pipeChildren,()=>this.#writeConfig());
    else for(const child of pipeChildren)if(child&&!child.killed)child.kill();
    const leftovers=await this.#removeTransient(transient);
    if(exchangeError)throw exchangeError;
    return appendCleanupWarning(result,formatCleanupWarning('transient-files',leftovers));
  }

  async #removeTransient(files){return removeTransient(files);}

  #writeConfig() {
    const lines=[...this.active.baseLines];const command=this.active.commandOffer;const sample=this.active.sampleOffer;
    if(command&&!this.active.revoked)lines.push(`sequence=${command.sequence}`,`opcode=${command.opcode}`,`command=${command.command}`,`ack=${command.ack}`);
    if(sample&&!this.active.revoked)lines.push(`sampleSequence=${sample.sequence}`,`sample=${sample.endpoint}`);
    fs.writeFileSync(this.active.config,lines.join('\n')+'\n',{encoding:'utf8',flag:'w'});
  }

  async #startPipe(endpoint, resultFile, mode, kind) {
    const readyFile = `${resultFile}.ready`;
    const pipePrefix = '\\\\.\\pipe\\';
    if (!endpoint.startsWith(pipePrefix)) throw new Error('refusing a non-local pipe endpoint');
    const pipeName = endpoint.slice(pipePrefix.length);
    const script = path.join(this.root, 'bridge', 'secure_pipe_server.ps1');
    const logHandle = fs.openSync(`${resultFile}.server.log`, 'a');
    this.active.spawnPending=true;this.#writeRecovery(this.active);
    const child = spawn(this.powershell,['-NoProfile','-File',script,'-PipeName',pipeName,'-ResultPath',resultFile,'-ReadyPath',readyFile,'-Mode',mode,'-Kind',kind],{windowsHide:true,stdio:['ignore',logHandle,logHandle]});
    fs.closeSync(logHandle);
    const active=this.active;
    this.#track(child,active);
    await Promise.race([
      waitForFile(readyFile,3000,active.operationAbort.signal),
      new Promise((resolve,reject)=>child.once('error',reject)),
      new Promise((resolve,reject)=>child.once('exit',(code)=>reject(new Error(`pipe helper exited before ready (code ${code})`)))),
    ]);
    return child;
  }

  async #startWindowObserver(active){
    active.windowListeners=new Set();const script=path.join(this.root,'bridge','owned_window_observer.ps1');
    const log=fs.openSync(path.join(active.results,'window-observer.log'),'a');active.spawnPending=true;this.#writeRecovery(active);
    const child=spawn(this.powershell,['-NoProfile','-File',script,'-GamePid',String(active.game.pid),'-HostPid',String(process.pid),'-Executable',active.imagePath],{windowsHide:true,stdio:['ignore','pipe',log]});fs.closeSync(log);this.#track(child,active);
    let ready=false;await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{child.kill();reject(Error('Owned window observer did not become ready'));},6000);
      const failure=error=>{if(!ready){clearTimeout(timer);reject(error);}if(this.active===active&&!active.revoked){active.windowFailure=true;for(const listener of active.windowListeners)listener({error:'Owned window observation lost'});}};
      const reader=require('./owned_window_observer').createWindowStateReader(active.game.pid,state=>{if(this.active!==active)return;active.windowState=state;if(!ready){ready=true;active.windowProof={game:active.game,sessionId:active.session.bootstrap.sessionId,pid:active.game.pid,processStarted:state.processStarted,image:active.imagePath};clearTimeout(timer);resolve();}for(const listener of active.windowListeners)listener(state);},failure);
      child.stdout.on('data',chunk=>reader.push(chunk));child.once('error',failure);child.once('exit',()=>reader.fail());
    });
  }

  async #startSampleHost() {
    const active=this.active,script=path.join(this.root,'bridge','sample_credit_relay.ps1');
    const child=spawn(this.powershell,['-NoProfile','-File',script],{windowsHide:true,stdio:['pipe','pipe','ignore']});
    active.sampleRelay=openSampleCreditRelay(child,active.operationAbort.signal,this.timeoutMs);
    active.sampleRelay.ready.catch(()=>{});
    this.#track(child,active);
    await active.sampleRelay.ready;
  }
  #writeRecovery(active) {
    if(!active||this.active!==active)return;
    try{persistRecoveryRecord(active,this.runtime);}
    catch(error){
      const reason='Recovery manifest failed; session authority revoked';
      try{active.onFailure?.({sessionId:active.session.bootstrap.sessionId,epoch:1,tick:null,complete:false,entities:[],driverFailure:true,reason});}catch{}
      this.revoke(reason);throw error;
    }
  }
  #track(child,active) {
    active.children.add(child);active.spawnPending=false;
    // Install the exit handler before any fallible persistence operation.
    observeChildExit(child,active,(session)=>this.#writeRecovery(session));
    this.#writeRecovery(active);
  }
  async #cleanup(killGame) {
    const active=this.active;this.active=null;if(!active)return;
    if(!killGame&&active.game&&active.windowProof&&active.children.has(active.game)&&active.game.exitCode===null&&active.game.signalCode===null)this.detachedGame={game:active.game,proof:active.windowProof,imagePath:active.imagePath};
    active.operationAbort.abort(new Error('session ended'));
    const warnings=[];
    if(active.recoveryFailed)warnings.push('recovery-manifest-failed; retained for inspection');
    active.sampling=false;
    active.sampleRelay?.close();
    active.diagnosticCapture?.close();
    const stopping=[...active.children].filter((child)=>child!==active.game||killGame);
    for(const child of stopping){try{child.kill();}catch(error){warnings.push(`child-stop:${error.code||error.message}`);}}
    for(let attempt=0;attempt<50&&stopping.some((child)=>active.children.has(child));attempt++)await new Promise((resolve)=>setTimeout(resolve,10));
    if(stopping.some((child)=>active.children.has(child)))warnings.push('child-exit-unconfirmed');
    try { const warning=removeOwnedBridge(active);if(warning)warnings.push(warning); }
    catch(error){if(error.code!=='ENOENT')warnings.push(`bridge:${error.code||error.message}`);}
    const statusFile=`${active.config}.status`;
    try { if(fs.existsSync(statusFile))fs.copyFileSync(statusFile,path.join(active.results,'bridge-status.txt')); }
    catch(error){if(error.code!=='ENOENT')warnings.push(`status-copy:${error.code||error.message}`);}
    try { const left=await removeTransient([active.config,statusFile,active.session.file]);const warning=formatCleanupWarning('session-files',left);if(warning)warnings.push(warning); }
    catch(error){warnings.push(`session-files:${error.code||error.message}`);}
    if (!warnings.length) {
      try { const left=await removeTransient([active.recoveryFile]);if(left.length)warnings.push('recovery-record-retained'); }
      catch(error){warnings.push(`recovery-record:${error.code||error.message}`);}
    }
    return warnings.join('; ');
  }
}

module.exports = { gameLaunchOptions, observeChildExit, persistRecoveryRecord, installOwnedBridge, removeOwnedBridge, AttachedNightlyDriver, waitForFile, removeTransient, formatCleanupWarning, appendCleanupWarning, retireCommandOffer, assertSnapshotAuthority };
