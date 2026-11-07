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
  const players=options.players||['kfm','kfm'];if(!Array.isArray(players)||players.length!==2||players.some(p=>typeof p!=='string'||!p||p.startsWith('-')))throw new Error('Two explicit player identifiers are required');
  const args=['-p1',players[0],'-p2',players[1],'-s','stages/stage0.def','-p1.ai',mode==='fixture'?String(ai):'0','-p2.ai',String(ai)];
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
    this.gameLaunch=gameLaunchOptions(options);
    this.active = null;
    this.storageRoot=options.storageRoot;
  }

  detachedGameRunning(){const record=this.detachedGame;if(!record)return false;const game=record.game,proof=record.proof;return game instanceof ChildProcess&&game===proof?.game&&game.pid===proof.pid&&typeof proof.processStarted==='string'&&typeof proof.image==='string'&&proof.image===record.imagePath&&game.exitCode===null&&game.signalCode===null&&!game.killed;}
  processStatus(session){if(!session)return{detachedGameRunning:this.detachedGameRunning()};const active=this.active;if(!active||active.session.bootstrap.sessionId!==session.sessionId)return null;return{gameExited:active.gameExitCode!==undefined};}

  observeWindow(session,listener){const active=this.active;if(!active||active.session.bootstrap.sessionId!==session.sessionId)throw Error('Window observer belongs to another session');if(!active.windowListeners)return()=>{};active.windowListeners.add(listener);if(active.windowFailure)listener({error:'Owned window observation lost'});else if(active.windowState)listener(active.windowState);return()=>active.windowListeners.delete(listener);}
  beginWindowSuspension(session,token){const active=this.active;if(!active||active.revoked||active.session.bootstrap.sessionId!==session.sessionId||active.commandOffer)throw Error('A native command cannot be fenced safely');active.windowSuspended=true;active.windowIntervalToken=token;if(active.inflightSample)active.inflightSample.windowToken=token;}
  freshWindowOfferFloor(session){const active=this.active;if(!active||active.revoked||active.session.bootstrap.sessionId!==session.sessionId||!active.windowSuspended||active.commandOffer)throw Error('Window continuity cannot be verified');return active.nextSampleSequence;}
  completeWindowSuspension(session){const active=this.active;if(!active||active.revoked||active.session.bootstrap.sessionId!==session.sessionId)throw Error('Retired window authority');active.windowSuspended=false;}
  canRestartOwnedGame(session){const active=this.active;if(!active||!active.revoked||active.session.bootstrap.sessionId!==session?.sessionId||!(active.game instanceof ChildProcess))return false;if(active.gameExitCode!==undefined)return true;const game=active.game;return active.children.has(game)&&game.exitCode===null&&game.signalCode===null&&!game.killed&&active.windowProof?.game===game&&active.windowProof.sessionId===session.sessionId&&active.windowProof.pid===game.pid&&typeof active.windowProof.processStarted==='string'&&active.windowProof.image===active.imagePath;}
  async restartOwnedGame(session){if(!this.canRestartOwnedGame(session))throw Error('The prior owned child handle cannot be verified; no new game was started');const warning=await this.#cleanup(true);if(warning)throw Error('Previous game cleanup is incomplete; no new game was started: '+warning);}

  async connect() {
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
    const session = createSessionBootstrap(storage.sessions);
    const key = Buffer.from(session.bootstrap.key, 'base64url');
    const telemetryEndpoint = deriveOfferName(key,{epoch:1,sequence:1,direction:'telemetry',opcode:''});
    const config = path.join(session.directory, 'bridge.conf');
    const bridgeSource = path.join(this.root, 'bridge', 'ikemeter_bridge.lua');
    const bridgeBytes = installedBridgeBytes(fs.readFileSync(bridgeSource),session.bootstrap.sessionId);
    const baseLines = ['protocol=1',`session=${session.bootstrap.sessionId}`,'epoch=1',`telemetry=${telemetryEndpoint}`];
    this.active = { imagePath:fs.realpathSync(executable),session, key, baseLines, config, bridgeTarget, bridgeBytes, results: session.directory, recoveryFile:path.join(session.directory,'recovery.json'), operationAbort:new AbortController(), game: null, children:new Set(), nextSampleSequence:2, commandOffer:null, sampleOffer:null, sampling:false };
    try {
      fs.writeFileSync(config, baseLines.join('\n')+'\n',{encoding:'utf8',flag:'wx',mode:0o600});
      restrictFile(config, session.sid);
      this.#writeRecovery(this.active);
      installOwnedBridge(this.active);
      this.#writeRecovery(this.active);
      await this.#startSampleHost();
      const telemetryFile = path.join(session.directory, 'telemetry.json');
      await this.#startPipe(telemetryEndpoint, telemetryFile, 'Frame', 'Telemetry');
      const gameLog = path.join(session.directory, 'nightly.log');
      const logHandle = fs.openSync(gameLog, 'a');
      this.gameStartedAtMs=Date.now();this.gameStartedAtMonotonicMs=performance.now();
      this.active.spawnPending=true;this.#writeRecovery(this.active);
      const game = spawn(executable,this.gameLaunch.args,{cwd:this.runtime,env:{...process.env,IKEMETER_SESSION_FILE:config},windowsHide:this.gameLaunch.windowsHide,stdio:['ignore',logHandle,logHandle]});
      const startupFailure=new Promise((resolve,reject)=>{game.once('error',reject);game.once('exit',code=>reject(new Error('official nightly exited before startup completed (code '+code+')')));});startupFailure.catch(()=>{});
      fs.closeSync(logHandle);
      const activeSession=this.active;this.#track(game,activeSession);activeSession.game=game;
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
      return { sessionId: session.bootstrap.sessionId, epoch: 1, tick, notice:storage.notice };
    } catch (error) { await this.#cleanup(true); throw error; }
  }

  async command(opcode, session) {
    if (!['pause','step','resume'].includes(opcode) || !this.active || this.active.revoked || this.active.windowSuspended) throw new Error('command is unavailable');
    return this.#exchange(opcode, session.requestSequence);
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
    active.commandOffer=null;active.sampleOffer=null;
    try{this.#writeConfig();}catch(error){active.revocationWarning=error.message;}
    for(const child of active.children)if(child!==active.game){try{child.kill();}catch{}}
  }

  async shutdown() { const warning=await this.#cleanup(true);if(warning)throw new Error(`Cleanup incomplete; recovery record retained: ${warning}`); }

  async sample(session) {
    if (!this.active || this.active.revoked || session.epoch !== 1) throw new Error('sampling is unavailable');
    const active=this.active;
    const sequence=this.active.nextSampleSequence++;
    const sampleContext={sequence,windowToken:active.windowSuspended?active.windowIntervalToken:null};active.inflightSample=sampleContext;
    const endpoint=deriveOfferName(this.active.key,{epoch:1,sequence,direction:'telemetry',opcode:''});
    const resultFile=path.join(this.active.results,`sample-${sequence}.json`);
    const readyFile=`${resultFile}.ready`;const pipePrefix='\\\\.\\pipe\\';
    const nativeWindow=active.windowState?{processId:active.game.pid,processStarted:active.windowState.processStarted,threadId:active.windowState.threadId,hwnd:active.windowState.hwnd}:null;
    const job={pipeName:endpoint.slice(pipePrefix.length),resultPath:resultFile,readyPath:readyFile,nativeWindow};
    const queue=this.active.sampleQueue;const temp=`${queue}.tmp`;
    try {
    fs.writeFileSync(temp,JSON.stringify(job),{encoding:'utf8',flag:'wx'});fs.renameSync(temp,queue);
    await waitForFile(readyFile,3000,active.operationAbort.signal);
    if(this.active!==active)throw new Error('sample credit belongs to a retired session');
    active.sampleOffer={sequence,endpoint};this.#writeConfig();
    await waitForFile(resultFile,this.timeoutMs,active.operationAbort.signal);
    if(this.active!==active)throw new Error('sample completed for a retired session');
    const result=readResult(resultFile);if(!result.bounded){const error=new Error(result.error||'sample was not bounded');if(require('./owned_window_observer').isRetiredModalAccept(result,nativeWindow)){error.modalNoClient=true;error.offerSequence=sequence;error.modalIntervalToken=sampleContext.windowToken;}throw error;}
    const terminal=parseTerminalFrame(result.payload,{sessionId:session.sessionId,epoch:session.epoch,sequence});
    if(terminal)return {...terminal,offerSequence:sequence};
    const fields={};for(const part of result.payload.split('\t')){const match=part.match(/^([A-Za-z][A-Za-z0-9]*)=([A-Za-z0-9_.,+-]+)$/);if(match)fields[match[1]]=match[2];}
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
    return frame;
    } finally {if(active.inflightSample===sampleContext)active.inflightSample=null;await this.#removeTransient([resultFile,`${resultFile}.tmp`,readyFile,temp,queue]); }
  }

  startSampling(session,onFrame) {
    if(!this.active||this.active.revoked||this.active.sampling)throw new Error('sampling loop is unavailable or revoked');
    const active=this.active;active.sampling=true;active.onFailure=onFrame;
    const onGameExit=(code)=>{if(this.active===active&&active.sampling){try{onFrame({sessionId:session.sessionId,epoch:session.epoch,tick:null,complete:false,entities:[],fatal:true,reason:`game-exit:${code}`});}catch{}}};
    active.game.once('exit',onGameExit);
    if(active.gameExitCode!==undefined){queueMicrotask(()=>onGameExit(active.gameExitCode));return()=>{active.sampling=false;active.game.off('exit',onGameExit);};}
    const loop=async()=>{while(this.active===active&&active.sampling){try{onFrame(await this.sample(session));}catch(error){try{onFrame({sessionId:session.sessionId,epoch:session.epoch,tick:null,complete:false,entities:[],modalNoClient:error.modalNoClient===true,offerSequence:error.offerSequence,modalIntervalToken:error.modalIntervalToken,reason:`sample-error:${error.message}`});}catch{}await new Promise((resolve)=>setTimeout(resolve,25));}}};
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
      result={ epoch:Number(fields.epoch),requestSequence:Number(fields.seq),opcode:fields.op,status:fields.status,observedTick:Number(fields.tick),reason:fields.reason||'',fromTick:fields.from===undefined?null:Number(fields.from),heldSamples:fields.held===undefined?null:Number(fields.held) };
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
    const active=this.active;active.sampleQueue=path.join(active.results,'sample-job.json');active.sampleStop=path.join(active.results,'sample-stop');
    const ready=path.join(active.results,'sample-host.ready');const logHandle=fs.openSync(path.join(active.results,'sample-host.log'),'a');
    const script=path.join(this.root,'bridge','sample_credit_host.ps1');
    const child=spawn(this.powershell,['-NoProfile','-File',script,'-QueuePath',active.sampleQueue,'-StopPath',active.sampleStop,'-ReadyPath',ready],{windowsHide:true,stdio:['ignore',logHandle,logHandle]});fs.closeSync(logHandle);this.#track(child,active);
    await Promise.race([waitForFile(ready,3000,active.operationAbort.signal),new Promise((resolve,reject)=>child.once('error',reject)),new Promise((resolve,reject)=>child.once('exit',(code)=>reject(new Error(`sample host exited before ready (code ${code})`))))]);
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
    try { if(active.sampleStop&&!fs.existsSync(active.sampleStop))fs.writeFileSync(active.sampleStop,'stop'); }
    catch(error){warnings.push(`sample-stop:${error.code||error.message}`);}
    try { const left=await removeTransient([active.sampleQueue,active.sampleQueue?`${active.sampleQueue}.tmp`:null]);const warning=formatCleanupWarning('transient-files',left);if(warning)warnings.push(warning); }
    catch(error){warnings.push(`transient-files:${error.code||error.message}`);}
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

module.exports = { gameLaunchOptions, observeChildExit, persistRecoveryRecord, installOwnedBridge, removeOwnedBridge, AttachedNightlyDriver, waitForFile, removeTransient, formatCleanupWarning, appendCleanupWarning, retireCommandOffer };
