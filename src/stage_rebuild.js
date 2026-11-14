'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {StageLiveRig}=require('./stage_live_rig'),runtimes=require('./stage_preview_runtime'),manifest=runtimes.LEGACY;
const {verifySnapshot,writeSnapshot,sha,inside}=require('./stage_snapshot'),{parseDef}=require('./def_model'),{stageModel}=require('./stage_model'),{setEntry}=require('./stage_source_edits');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function checkSnapshotTargets(snapshot,profile=manifest){
 const pinned=new Map(profile.files.map(f=>[f.path.toLowerCase(),f.sha256]));
 for(const file of snapshot.files){const relative=file.relative.replace(/\\/g,'/').toLowerCase();if(/^(?:owner\.json|lease\.txt|rebuild\.tsv|engine\.log|save\/|captures\/|chars\/\.ikemaker-stage-rig\/|external\/mods\/|data\/select\.def$)/.test(relative))throw Error('Dependency collides with reserved rebuild output: '+file.relative);if(/\.(?:exe|dll)$/i.test(relative)||/^(?:external\/|lib\/)/.test(relative)||pinned.has(relative)&&pinned.get(relative)!==file.sha256)throw Error('Dependency would replace pinned runtime content: '+file.relative);}
}
function verifyRuntime(directory,profile=manifest){runtimes.verifyRuntime(directory,profile,true);}
function retainedPose(model,pose){
 if(!pose||![pose.x,pose.y,pose.zoom].every(Number.isFinite)||Math.abs(pose.x)>1000000||Math.abs(pose.y)>1000000||pose.zoom<.1||pose.zoom>10)throw Error('Retained camera is outside the supported finite bounds.');
 if(!Number.isInteger(pose.x)||!Number.isInteger(pose.y)){const error=Error('Pinned camera start positions are integer stage units; this fractional pose cannot be reproduced exactly.');error.code='FRACTIONAL_CAMERA';error.requested={...pose};error.proposal={...pose,x:Math.round(pose.x),y:Math.round(pose.y)};throw error;}
 if(!Number.isSafeInteger(pose.tick)||pose.tick<0)throw Error('Reference tick must be a nonnegative integer.');
 return{x:pose.x,y:pose.y,zoom:pose.zoom,tick:pose.tick,localCoord:[...model.localCoord]};
}
function cameraSource(source,pose){
 let result=source;for(const [key,value]of Object.entries({startx:pose.x,starty:pose.y,startzoom:pose.zoom,zoomout:Math.min(pose.zoom,1),zoomin:Math.max(pose.zoom,1)})){const section=parseDef(result).sections.find(s=>s.normalized==='camera');if(!section)throw Error('Retained camera requires an authored Camera section.');result=setEntry(result,section.line,key,String(value));}return result;
}
function parseReadback(raw,session,digest){
 if(typeof raw!=='string'||raw.length>32768||!raw.endsWith('\n'))return null;
 const rows=raw.trimEnd().split('\n').map(line=>line.split('\t'));
 if(rows.length!==5||rows.some(r=>r.length!==11||r[0]!==session||r[1]!==digest||r.slice(2).some(x=>x===''||!Number.isFinite(Number(x)))))return null;
 const values=rows.map(r=>r.slice(2).map(Number));if(values.some(r=>r.some(n=>Math.abs(n)>2147483647)||!Number.isInteger(r[0])||!Number.isInteger(r[1])||!Number.isInteger(r[2])||r[0]<0||r[1]<1||r[2]<0||r[5]<=0||r[6]<=0||r[7]<=0))return null;
 return values.map(([tick,round,count,x,y,zoom,width,height,stageTick])=>({tick,round,count,x,y,zoom,width,height,stageTick}));
}
function validateReadback(rows,pose,count){
 if(!rows||rows.length!==5)throw Error('Incomplete engine camera readback.');
 const first=rows[0],scale=first.width/pose.localCoord[0],near=(a,b)=>Math.abs(a-b)<=Math.max(.0001,Math.abs(b)*.00001);let previous=null;
 for(const row of rows){if(row.count!==count||row.round!==first.round||row.width!==first.width||row.height!==first.height||!near(row.x,pose.x*scale)||!near(row.y,pose.y*scale)||!near(row.zoom,pose.zoom)||(previous&&(row.tick<=previous.tick||row.stageTick<=previous.stageTick)))throw Error('Engine did not reproduce the retained camera; configured values are not accepted as readback.');previous=row;}
 return{baseCamera:{x:first.x/scale,y:first.y/scale,zoom:first.zoom,nativeX:first.x,nativeY:first.y},measuredRows:rows,referenceTick:pose.tick,runtimeStageTick:first.stageTick,tickRestored:false,controllerStateRestored:false,renderedTransformVerified:false,notice:'Camera measured in the pinned engine. Tick/controller state restarted; separate Zoom/attached-code rendered effects are not certified.'};
}
class StageRebuildRig extends StageLiveRig{
 async start({executable,snapshot,pose,scenario={kind:'stage-rig'},hidden=true,documents=[]}){
  if(this.child||this.directory)throw Error('Stop the owned rebuild preview first.');if(scenario.kind!=='stage-rig')throw Error('This rebuild requires the same generated Stage Rig scenario; fighter-action scenarios are unresolved.');
  if(!this.options.isCurrent?.())throw Error('Stage intent changed before rebuilding.');verifySnapshot(snapshot,{documents});const runtimeProfile=runtimes.selectRuntime(executable);checkSnapshotTargets(snapshot,runtimeProfile);this.runtimeProfile=runtimeProfile;
  const source=snapshot.files.find(f=>f.relative===snapshot.stage).bytes.toString('utf8'),model=stageModel(parseDef(source,snapshot.filename)),requested=retainedPose(model,pose);
  this.result=null;this.captureSequence=0;this.capturePending=false;this.terminalReason='';this.session=crypto.randomBytes(24).toString('hex');this.sourceHash=snapshot.digest;this.emit('starting','Preparing reviewed disposable dependency copy.');
  const base=fs.realpathSync(this.options.tempRoot||os.tmpdir());this.directory=fs.mkdtempSync(path.join(base,'ikemaker-stage-rebuild-'));this.createdDirectory=fs.realpathSync(this.directory);fs.writeFileSync(path.join(this.directory,'owner.json'),JSON.stringify({session:this.session,digest:snapshot.digest}),{flag:'wx'});
  try{
   const runtime=path.dirname(executable);for(const item of runtimeProfile.files){const target=path.resolve(this.directory,item.path);if(!inside(this.directory,target))throw Error('Unsafe pinned runtime manifest.');const bytes=fs.readFileSync(path.join(runtime,item.path));if(sha(bytes)!==item.sha256)throw Error('Pinned runtime differs: '+item.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});}
   // Identical pinned dependencies may be shared. Different runtime/bootstrap
   // bytes were refused before creating the clone.
   for(const file of snapshot.files){const target=path.resolve(this.directory,file.relative);if(!inside(this.directory,target))throw Error('Dependency target escaped disposable copy.');if(fs.existsSync(target))fs.unlinkSync(target);}
   const stageFile=writeSnapshot(snapshot,this.directory);fs.writeFileSync(stageFile,cameraSource(source,requested));
   const plan=(this.options.buildRigPlan||require('./stage_rig').buildStageRigPlan)(this.directory,model,stageFile,scenario);
   for(const [filename,bytes]of plan.writes){if(!inside(this.directory,path.resolve(filename)))throw Error('Rig destination escaped disposable copy.');fs.mkdirSync(path.dirname(filename),{recursive:true});const value=/\.zss$/i.test(filename)?String(bytes).replace('[StateDef -4]','[StateDef -4]\n# Preserve Camera.Init pose from the first update; no same-frame position/freeze race.\nassertSpecial{flag: cameraFreeze}') :bytes;fs.writeFileSync(filename,value,{flag:'wx'});}
   fs.writeFileSync(path.join(this.directory,'data','select.def'),'[Characters]\n'+plan.character+'\n[ExtraStages]\n'+snapshot.stage+'\n[Options]\n');
   this.readbackPath=path.join(this.directory,'rebuild.tsv');fs.mkdirSync(path.join(this.directory,'external','mods'),{recursive:true});
   fs.writeFileSync(path.join(this.directory,'external','mods','ikemaker-rebuild.lua'),bridge(this.session,snapshot.digest));
   fs.mkdirSync(path.join(this.directory,'captures'),{recursive:true});fs.mkdirSync(path.join(this.directory,'save'),{recursive:true});
   fs.writeFileSync(path.join(this.directory,'save','config.ini'),'[Config]\nMotif = data/ikemen1/system.def\nScreenshotFolder = captures/\n[Video]\nGameWidth = 320\nGameHeight = 240\nWindowWidth = 640\nWindowHeight = 480\nFullscreen = 0\nVSync = 0\n[Debug]\nForceStageZoomout = 0\nForceStageZoomin = 0\nForceStageAutoZoom = 0\n');
   verifySnapshot(snapshot,{documents});verifyRuntime(this.directory,runtimeProfile);if(!this.options.isCurrent?.())throw Error('Stage intent changed during rebuild preparation.');
   const fd=fs.openSync(path.join(this.directory,'engine.log'),'wx');try{this.child=(this.options.spawn||spawn)(path.join(this.directory,'Ikemen_GO.exe'),['-loadmotif','-time','-1','-rounds','-1','-tmode1','0','-tmode2','0','-s',snapshot.stage,'-p1',plan.character,'-p2',plan.character],{cwd:this.directory,windowsHide:hidden,stdio:['ignore',fd,fd]});}finally{fs.closeSync(fd)}
   let launchError;this.child.once('error',error=>{launchError=error});
   const deadline=Date.now()+(this.options.timeout||18000);let rows;
   while(Date.now()<deadline){if(launchError)throw launchError;if(this.child.exitCode!==null||this.child.signalCode!==null)throw Error('Owned rebuild engine exited before camera verification.');if(!this.options.isCurrent?.())throw Error('Stage intent changed while waiting for engine readback.');try{rows=parseReadback(fs.readFileSync(this.readbackPath,'utf8'),this.session,snapshot.digest)}catch(error){if(error.code!=='ENOENT'&&error.code!=='EBUSY')throw error}if(rows)break;await sleep(50)}
   this.result=validateReadback(rows,requested,model.backgrounds.length);this.result.scenario={...scenario};this.result.snapshotDigest=snapshot.digest;this.result.dirtySources=[...snapshot.dirty];this.result.directory=this.directory;
   this.child.once('exit',()=>{this.emit('closed','Owned rebuild engine exited.');void this.cleanup().catch(error=>this.emit('cleanup-pending',error.message))});
   this.result.engineRevision=runtimeProfile.revision;this.result.executableSha256=runtimeProfile.files.find(f=>f.path==='Ikemen_GO.exe').sha256;
   this.heartbeat=setInterval(()=>{if(!this.options.isCurrent?.()){this.terminalReason='Stage intent changed; rebuild again for the new source.';void this.stop().catch(()=>{});return}try{fs.writeFileSync(path.join(this.directory,'lease.txt'),this.session+' '+Date.now())}catch{}},500);this.heartbeat.unref?.();
   this.emit('ready',this.result.notice);return this.result;
  }catch(error){try{this.lastLog=fs.readFileSync(path.join(this.directory,'engine.log'),'utf8').slice(-8000)}catch{}await this.stop();throw error;}
 }
 async capture({minimumStageTick=0,timeout=6000}={}){
  if(this.capturePending)throw Error('Wait for the current native capture.');
  if(this.state!=='ready'||!this.child||!this.directory)throw Error('Start the reviewed full-engine preview before capturing.');
  if(!Number.isSafeInteger(minimumStageTick)||minimumStageTick<0)throw Error('Capture tick must be a nonnegative integer.');
  this.capturePending=true;const session=this.session,digest=this.sourceHash,directory=this.directory,sequence=(this.captureSequence||0)+1;this.captureSequence=sequence;
  const current=()=>this.session===session&&this.directory===directory&&this.child&&this.child.exitCode===null&&this.child.signalCode===null&&this.options.isCurrent?.()===true;
  try{
   if(!current())throw Error('Native capture owner changed.');
   const folder=path.join(directory,'captures'),before=new Set(fs.readdirSync(folder).filter(name=>/\.png$/i.test(name)));
   const request=path.join(directory,'capture-request.txt'),temporary=request+'.tmp';fs.writeFileSync(temporary,[session,digest,sequence,minimumStageTick].join('\t'));fs.renameSync(temporary,request);
   const ackFile=path.join(directory,'capture-ack.txt'),deadline=Date.now()+timeout;let ack;
   while(Date.now()<deadline){
    if(!current())throw Error('Native capture owner changed or engine exited.');
    try{ack=parseCaptureAck(fs.readFileSync(ackFile,'utf8'),session,digest,sequence)}catch(error){if(!['ENOENT','EBUSY','EPERM'].includes(error.code))throw error}
    const names=fs.readdirSync(folder).filter(name=>/\.png$/i.test(name)&&!before.has(name));
    if(ack&&names.length===1){try{const png=fs.readFileSync(path.join(folder,names[0]));if(png.length>16*1024*1024)throw Error('Native capture exceeds image budget.');const image=require('./palette_index_organizer_model').decodePng(png,{maximumDimension:4096,maximumPixels:4096*4096});if(!current())throw Error('Native capture owner changed.');if(ack.stageTick<minimumStageTick)throw Error('Native capture tick precedes requested sample.');const frame={session,snapshotDigest:digest,sequence,stageTick:ack.stageTick,gameTick:ack.gameTick,width:image.width,height:image.height,sha256:sha(png),png};fs.unlinkSync(path.join(folder,names[0]));try{fs.unlinkSync(ackFile)}catch{}return frame}catch(error){if(Date.now()+75>=deadline)throw error}}
    if(names.length>1)throw Error('Ambiguous native screenshot output; capture rejected.');await sleep(25);
   }
   throw Error('Native screenshot acknowledgement timed out.');
  }finally{this.capturePending=false}
 }
 status(){return{state:this.state,reason:this.reason||'',readback:this.result||null}}
}
function bridge(session,digest){return `local token=${JSON.stringify(session)};local digest=${JSON.stringify(digest)}
local captureSequence=0;local pendingCapture=nil
local count=0;local started=nil;local boundRound=nil;local previousTick=nil;local lastLease=nil;local idle=0
hook.add('loop','ikemaker-rebuild',function()
 if not gameRunning() or not player(1) then return end
 if not started then started=gameTime();boundRound=roundNo() end
 if roundNo()~=boundRound or previousTick and stageTime()<previousTick then os.exit();return end
 previousTick=stageTime()
 local lease=io.open('lease.txt','rb');local value=lease and lease:read(256);if lease then lease:close() end
 if value and value~=lastLease then idle=0;lastLease=value else idle=idle+1 end
 if gameTime()-started>600 and idle>300 then os.exit();return end
 local request=io.open('capture-request.txt','rb');local command=request and request:read(512);if request then request:close() end
 if pendingCapture and gameTime()>=pendingCapture.gameTick+2 then
  local a=assert(io.open('capture-ack.txt','wb'));a:write(table.concat({token,digest,pendingCapture.sequence,pendingCapture.stageTick,pendingCapture.gameTick},'\\t')..'\\n');a:close();pendingCapture=nil
 end
 if command then
  local owner,source,seq,minimum=command:match('^([^\\t]+)\\t([^\\t]+)\\t(%d+)\\t(%d+)$');seq=tonumber(seq);minimum=tonumber(minimum)
  if owner==token and source==digest and seq and seq>captureSequence and not pendingCapture and stageTime()>=minimum then
   setFightScreenElements({active=false});screenshot();captureSequence=seq;pendingCapture={sequence=seq,stageTick=stageTime(),gameTick=gameTime()}
  end
 end
 if count>=5 or stageTime()<120 then return end
 setFightScreenElements({active=false})
 local f=assert(io.open('rebuild.tsv',count==0 and 'wb' or 'ab'))
 f:write(table.concat({token,digest,gameTime(),roundNo(),numStageBg(-1),cameraPosX(),cameraPosY(),cameraZoom(),screenWidth(),screenHeight(),stageTime()},'\\t')..'\\n');f:close()
 count=count+1
end)
`}
function parseCaptureAck(raw,session,digest,sequence){if(typeof raw!=='string'||raw.length>512||!raw.endsWith('\n'))return null;const fields=raw.trimEnd().split('\t');if(fields.length!==5||fields[0]!==session||fields[1]!==digest||Number(fields[2])!==sequence||!fields.slice(2).every(value=>/^\d+$/.test(value)&&Number.isSafeInteger(Number(value))&&Number(value)<=2147483647))return null;return{sequence:Number(fields[2]),stageTick:Number(fields[3]),gameTick:Number(fields[4])};}
module.exports={parseCaptureAck,StageRebuildRig,retainedPose,cameraSource,parseReadback,validateReadback,bridge,checkSnapshotTargets,verifyRuntime};
