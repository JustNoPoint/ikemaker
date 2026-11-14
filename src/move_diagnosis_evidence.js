'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function savedHash(filename){const digest=crypto.createHash('sha256'),buffer=Buffer.allocUnsafe(1024*1024),handle=fs.openSync(filename,'r');try{let count;while((count=fs.readSync(handle,buffer,0,buffer.length,null))>0)digest.update(buffer.subarray(0,count));return digest.digest('hex');}finally{fs.closeSync(handle);}}
const canonical=file=>path.resolve(file).toLowerCase();
function inspectMoveRun(input,context,services={}){
 const natural=input?.kind==='move-natural-attempt';
 if(!['move-repeat','move-natural-attempt'].includes(input?.kind)||!input.binding||!Array.isArray(input.sources)||!input.sources.length||input.sources.length>256)throw Error('Expected a source-bound move-repeat or natural-attempt result.');
 const binding=context.binding;
 for(const name of ['defPath','defHash','filename','sourceHash','rangeHash']){
  if(typeof binding?.[name]!=='string'||!binding[name]||typeof input.binding[name]!=='string')throw Error('The result lacks an exact selected-source binding.');
  const match=/Path$|^filename$/.test(name)?canonical(binding[name])===canonical(input.binding[name]):binding[name]===input.binding[name];
  if(!match)throw Error('The result belongs to a different or changed selected source.');
 }
 if(input.sourceDigest!==sha(JSON.stringify(input.sources)))throw Error('The result source manifest digest is inconsistent.');
 const suffix=file=>String(file).replace(/\\/g,'/').toLowerCase(),def=suffix(binding.defPath),defs=input.sources.filter(item=>typeof item.file==='string'&&def.endsWith('/'+suffix(item.file)));
 if(defs.length!==1)throw Error('The source manifest does not identify the selected DEF uniquely.');
 const relative=defs[0].file.split('/'),root=path.resolve(binding.defPath,...relative.map(()=> '..'));
 const seen=new Map();
 for(const item of input.sources){
  if(typeof item.file!=='string'||!item.file||item.file.includes('\\')||path.isAbsolute(item.file)||item.file.split('/').some(part=>!part||part==='.'||part==='..')||!/^[a-f0-9]{64}$/.test(item.sha256||''))throw Error('The source manifest has an invalid path or hash.');
  const filename=path.resolve(root,item.file),key=canonical(filename);if(seen.has(key))throw Error('The source manifest has duplicate files.');
  if((services.readFile?sha(services.readFile(filename)):savedHash(filename))!==item.sha256)throw Error('A saved result source changed since the run.');seen.set(key,item.sha256);
 }
 for(const record of context.records||[]){if(!record.available)throw Error('Current assigned source inventory is incomplete.');if(!seen.has(canonical(record.filename))||seen.get(canonical(record.filename))!==record.sourceHash)throw Error('The result does not cover all current assigned sources, or the editor has unsaved changes.');}
 const observed=input.observations,checks=input.assertions;
 if(!observed||!Number.isSafeInteger(observed.ticks)||observed.ticks<1||observed.ticks>1000000||!checks||!Number.isSafeInteger(input.runIndex)||input.runIndex<1||typeof input.sessionId!=='string'||input.sessionId.length>200)throw Error('The result lacks a valid sampled run.');
 for(const key of ['maxHelper','maxProjectile','maxExplod'])if(!Number.isSafeInteger(observed[key])||observed[key]<0)throw Error('Invalid sampled entity counts.');
 for(const key of ['moveHit','moveGuarded'])if(typeof observed[key]!=='boolean')throw Error('Invalid sampled contact counters.');
 if(checks.state?.expected!==context.stateNumber||typeof checks.state?.observed!=='boolean'||!Number.isSafeInteger(checks.idle?.expected)||typeof checks.idle?.observed!=='boolean'||!['any','none','helper','projectile','explod'].includes(checks.spawn?.expected)||typeof checks.spawn?.observed!=='boolean'||typeof checks.spawn?.passed!=='boolean')throw Error('The result assertions do not match this selected state.');
 validateSpawnPeaks(checks.spawn,observed);
 if(!Number.isFinite(observed.distanceAtStart)||observed.distanceAtStart<0||![-1,1].includes(observed.facingAtStart))throw Error('Invalid sampled starting distance or facing.');
 const checksView=[{label:'P1 facing at run start',status:'observed',summary:String(observed.facingAtStart)+(natural?' (sampled at start; actual authored gates still run)':' (sampled at start only; facing gates bypassed)')},{label:'Absolute P2 X distance at run start',status:'observed',summary:String(observed.distanceAtStart)+' game units (sampled at start only)'}];
 const setup=input.setup||{},identityFields=['observedP1Def','observedP2Def','observedStageDef'];
 if(natural&&(!input.setup||identityFields.some(name=>!Object.hasOwn(setup,name))))throw Error('Natural input evidence requires sampled P1, P2 and stage identities.');
 if(identityFields.some(name=>Object.hasOwn(setup,name))){
  const expected=[binding.defPath,setup.opponent,setup.stage];
  identityFields.forEach((name,index)=>{if(typeof setup[name]!=='string'||!setup[name]||setup[name].length>4096||typeof expected[index]!=='string'||!expected[index]||canonical(path.resolve(root,setup[name]))!==canonical(path.resolve(root,expected[index])))throw Error('Runtime observed character or stage identity does not match this selected setup.');});
  checksView.push({label:'Observed actor and stage identities',status:'observed',summary:`P1 ${setup.observedP1Def}; P2 ${setup.observedP2Def}; stage ${setup.observedStageDef}. These are sampled paths matching launch intent, not independent authentication or proof of all opponent/stage content.`});
 }else checksView.push({label:'Observed actor and stage identities',status:'unavailable',summary:'This result contains no sampled DEF identities; its source binding and launch intent are not an independent runtime identity check.'});
 const startFields=['gameTickAtStart','roundAtStart','roundStateAtStart','p1StateAtStart','p1StanceAtStart','p1YAtStart','p1LifeAtStart','p1PowerAtStart','p1PaletteAtStart','p2StateAtStart','p2StanceAtStart','p2FacingAtStart','p2YAtStart','p2LifeAtStart','p2PowerAtStart','p2PaletteAtStart'];
 if(natural&&startFields.some(name=>!Object.hasOwn(observed,name)))throw Error('Natural input evidence requires a complete sampled starting actor snapshot.');
 if(startFields.some(name=>Object.hasOwn(observed,name))){
  for(const name of startFields){const value=observed[name];if(name.includes('Stance')?!['S','C','A','L','U'].includes(value):name==='p2FacingAtStart'?![-1,1].includes(value):!Number.isFinite(value)||(!name.includes('YAtStart')&&!Number.isSafeInteger(value)))throw Error('Invalid sampled starting actor observations.');}
  if(observed.gameTickAtStart<0||observed.roundAtStart<0||observed.p1PaletteAtStart<1||observed.p2PaletteAtStart<1)throw Error('Invalid sampled start chronology or palettes.');
  checksView.push({label:natural?'Starting snapshot before natural observation':'Starting snapshot before direct state entry',status:'observed',summary:`Game tick ${observed.gameTickAtStart}, round ${observed.roundAtStart}, roundState ${observed.roundStateAtStart}. ${natural?'No state was forced; this is the setup at the start of the input window.':'This snapshot precedes the direct changeState driver; it does not evaluate authored command/entry gates.'}`},{label:'Standing / crouching / airborne posture',status:'observed',summary:`At start: P1 StateType ${observed.p1StanceAtStart}, P2 StateType ${observed.p2StanceAtStart}. No per-tick posture trace or stance-gate verdict is provided.`},{label:'P1 starting state / Y / life / power / palette',status:'observed',summary:`${observed.p1StateAtStart} / ${observed.p1YAtStart} / ${observed.p1LifeAtStart} / ${observed.p1PowerAtStart} / ${observed.p1PaletteAtStart}`},{label:'P2 starting state / facing / Y / life / power / palette',status:'observed',summary:`${observed.p2StateAtStart} / ${observed.p2FacingAtStart} / ${observed.p2YAtStart} / ${observed.p2LifeAtStart} / ${observed.p2PowerAtStart} / ${observed.p2PaletteAtStart}`});
 }else checksView.push({label:'Standing / crouching / airborne posture',status:'unavailable',summary:'StateType was not sampled in this older result. Authored stance gates were bypassed by direct state entry.'});
 if(Object.hasOwn(observed,'lastCtrl')||Object.hasOwn(observed,'lastState')){if(typeof observed.lastCtrl!=='boolean'||!Number.isSafeInteger(observed.lastState)||!(natural?['returned-to-idle','window-complete']:['observing','returned-to-idle','timeout','state-unavailable']).includes(observed.finishReason))throw Error('Invalid sampled final state/control observation.');checksView.push({label:'Last sampled state and control',status:'observed',summary:`State ${observed.lastState}, Ctrl ${observed.lastCtrl}; ${observed.finishReason}, after ${observed.ticks} sampled ticks. This is an ending sample, not Ctrl at initial entry or proof of a specific CtrlSet controller.`});}
 checksView.push({label:'P1 control at entry; P2 hitpause; per-tick stance/position and RNG control',status:'unavailable',summary:'These checks are not retained as an evaluated trace. RNG is '+(observed.rng==='uncontrolled'?'explicitly uncontrolled':'not verified')+'.'},{label:'Native Projectile / Helper contact',status:'unavailable',summary:'Per-child hit/guard counters were not sampled.'});
 if(natural)return inspectNaturalAttempt(input,context,checksView,root,seen);
 const scope=`Within ${observed.ticks} sampled ticks of run ${input.runIndex}`;
 return{kind:'move-repeat',sourceBinding:'matched',sessionId:input.sessionId,runIndex:input.runIndex,notice:'Imported stock-engine result matched the saved source manifest and exact selected range at import time; re-run diagnosis after source edits. This user-supplied JSON is not independently authenticated; sampled absence is not a causal missed-hit explanation.',stages:{
  entry:{status:checks.state.observed?'observed':'not-observed',summary:`${scope}: State ${context.stateNumber} ${checks.state.observed?'was':'was not'} sampled. The test driver enters the state directly; this does not test command recognition or authored entry gates.`},
  contact:{status:observed.moveHit||observed.moveGuarded?'observed':'unavailable',summary:`${scope}: moveHit=${observed.moveHit}, moveGuarded=${observed.moveGuarded}. These counters concern P1’s own attacks; native Projectile and Helper contact is not instrumented here. False counters cannot establish that those attacks missed, or identify a particular HitDef/collision/rejection.`},
  recovery:{status:checks.idle.observed?'observed':'not-observed',summary:`${scope}: idle State ${checks.idle.expected} ${checks.idle.observed?'was':'was not'} sampled after entry. This does not establish CtrlSet or uninterrupted recovery.`}
 },checks:checksView,spawnSummary:`Sampled maxima: Helpers ${observed.maxHelper}, native Projectiles ${observed.maxProjectile}, Explods ${observed.maxExplod}. Spawn expectation ${checks.spawn.expected}: ${checks.spawn.passed?'met':'not met'} in this window; attribution to the selected controller is unavailable. ${validateSpawnPeaks(checks.spawn,observed)}`};
}

function validateSpawnPeaks(spawn,observed){
 if(!Object.hasOwn(spawn,'peakIncrease')&&!Object.hasOwn(spawn,'expectedPeakIncrease'))return '';
 const peak=spawn.peakIncrease,desired=spawn.expectedPeakIncrease,kinds=['helper','projectile','explod'];
 if(!peak||typeof peak!=='object'||kinds.some(kind=>!Number.isSafeInteger(peak[kind])||peak[kind]<0||peak[kind]>observed[{helper:'maxHelper',projectile:'maxProjectile',explod:'maxExplod'}[kind]]))throw Error('Invalid sampled peak simultaneous spawn delta.');
 if(!(desired===null||Number.isSafeInteger(desired)&&desired>=1&&desired<=16&&kinds.includes(spawn.expected)))throw Error('Invalid expected peak simultaneous spawn increase.');
 const any=kinds.some(kind=>peak[kind]>0),passed=desired!==null?peak[spawn.expected]===desired:spawn.expected==='any'?true:spawn.expected==='none'?!any:peak[spawn.expected]>0;
 if(spawn.observed!==any||spawn.passed!==passed)throw Error('Sampled spawn peak assertions are inconsistent.');
 return `Peak simultaneous increase: Helper +${peak.helper}, native Projectile +${peak.projectile}, Explod +${peak.explod}${desired!==null?'; expected '+spawn.expected+' +'+desired:''}. These are simultaneous deltas, not distinct lifetimes.`;
}

const INPUT_KEYS=['B','D','F','U','L','R','a','b','c','x','y','z','s','d','w','m'];
function inspectNaturalAttempt(input,context,checksView,root,manifest){
 const a=input.attempt,o=input.observations,checks=input.assertions;
 if(input.schemaVersion!==1||input.status!=='sampled'||!a||Object.keys(a).sort().join(',')!=='commandActiveTicks,commandFirstTick,commandName,endingState,inputSamples,startingState,stateFirstTick,windowTicks'||a.windowTicks!==600||o.ticks>a.windowTicks||typeof a.commandName!=='string'||!a.commandName||!(context.inputCommands||[]).some(command=>command.name===a.commandName))throw Error('The natural attempt does not match a current exact incoming authored command.');
 const setup=input.setup;
 const defRecord=(context.records||[]).find(record=>canonical(record.filename)===canonical(context.binding.defPath));
 const defText=typeof defRecord?.text==='string'?defRecord.text:fs.readFileSync(context.binding.defPath,'utf8');
 const entries=require('./def_model').parseDef(defText,context.binding.defPath).sections.filter(section=>section.name.toLowerCase()==='files').flatMap(section=>section.entries);
 for(const entry of entries.filter(entry=>/^(sprite|sound|anim|cmd|cns|st(?:common|\d*)?)$/i.test(entry.key))){const file=require('./character_dependency_model').assignedPath(context.binding.defPath,entry.value,entry.key);if(file&&!manifest.has(canonical(file)))throw Error('Natural attempt source manifest omits a currently assigned character asset or source.');}
 for(const file of [setup.opponent,setup.stage])if(typeof file!=='string'||!manifest.has(canonical(path.resolve(root,file))))throw Error('Natural attempt source manifest must bind the opponent DEF and stage DEF.');
 if(!Number.isFinite(setup.distance)||setup.distance<0||setup.distance>2000||![-1,1].includes(setup.facing)||Math.abs(o.distanceAtStart-setup.distance)>8||o.facingAtStart!==setup.facing)throw Error('Natural attempt starting distance or facing differs from the reviewed setup.');
 if(!Number.isSafeInteger(a.commandActiveTicks)||a.commandActiveTicks<0||a.commandActiveTicks>o.ticks)throw Error('Invalid natural command sample count.');
 const first=(value,present)=>present?Number.isSafeInteger(value)&&value>=1&&value<=o.ticks:value===null;
 if(!first(a.commandFirstTick,a.commandActiveTicks>0)||!first(a.stateFirstTick,checks.state.observed))throw Error('Natural command/state chronology is inconsistent.');
 if(a.commandActiveTicks>0&&a.commandActiveTicks>o.ticks-a.commandFirstTick+1)throw Error('Natural command samples cannot fit after their first tick.');
 if(!Number.isSafeInteger(a.startingState)||!Number.isSafeInteger(a.endingState)||a.startingState!==o.p1StateAtStart||a.endingState!==o.lastState)throw Error('Natural attempt start/end state differs from actor observations.');
 if(typeof o.lastCtrl!=='boolean'||!['window-complete','returned-to-idle'].includes(o.finishReason))throw Error('The natural observation window did not finish with a valid final sample.');
 if(o.finishReason==='window-complete'&&o.ticks!==a.windowTicks||o.finishReason==='returned-to-idle'&&!checks.idle.observed)throw Error('Natural finish chronology is inconsistent.');
 if(!Array.isArray(a.inputSamples)||a.inputSamples.length!==INPUT_KEYS.length)throw Error('Natural attempt lacks the complete bounded input-counter sample set.');
 const keys=new Set();let available=0,jumps=0;
 for(const item of a.inputSamples){
  if(!item||Object.keys(item).sort().join(',')!=='counterJumpCount,firstCounterJumpTick,key,maxValue,minValue'||!INPUT_KEYS.includes(item.key)||keys.has(item.key))throw Error('Invalid or duplicate natural input counter key.');keys.add(item.key);
  if(!Number.isSafeInteger(item.counterJumpCount)||item.counterJumpCount<0||item.counterJumpCount>Math.max(0,o.ticks-1)||!first(item.firstCounterJumpTick,item.counterJumpCount>0)||item.counterJumpCount>0&&item.firstCounterJumpTick<2)throw Error('Invalid input-counter discontinuity chronology.');
  if(item.counterJumpCount>0&&item.counterJumpCount>o.ticks-item.firstCounterJumpTick+1)throw Error('Input-counter discontinuities cannot fit after their first tick.');
  if(item.minValue===null&&item.maxValue===null){if(item.counterJumpCount!==0)throw Error('Unavailable input counter claims a discontinuity.');continue;}
  if(!Number.isSafeInteger(item.minValue)||!Number.isSafeInteger(item.maxValue)||item.minValue>item.maxValue)throw Error('Invalid raw input-counter range.');available++;jumps+=item.counterJumpCount;
 }
 const scope=`Within ${o.ticks} sampled ticks of the ${a.windowTicks}-tick window`,recognized=a.commandActiveTicks>0;
 checksView.unshift(
  {label:'Raw inputTime counter samples',status:available?'sampled':'unavailable',summary:`${available}/${INPUT_KEYS.length} counters had numeric samples; ${jumps} discontinuity candidates. Nonzero values, decreasing values and counter jumps are not classified as physical presses, releases or successful input sequences.`},
  {label:'Physical key/button input',status:'unavailable',summary:'No physical device-event trace is bound to this result. inputTime counters cannot independently prove a press or the intended motion.'},
  {label:'Named command activation',status:recognized?'observed':'not-observed',summary:`Command ${JSON.stringify(a.commandName)} was active on ${a.commandActiveTicks} sampled tick(s); first ${a.commandFirstTick??'not observed'}. A command buffer may predate the window; this does not identify which definition or physical sequence produced it.`},
  {label:'Natural target state sampling',status:checks.state.observed?'observed':'not-observed',summary:`State ${context.stateNumber}; first ${a.stateFirstTick??'not observed'}. Starting state ${a.startingState}, ending ${a.endingState}. ${a.startingState===context.stateNumber?'The window started in the selected state, so later state samples do not prove entry.':'No state was forced; command and state observations alone do not identify which authored transition executed.'}`},
  {label:'Entity spawn sampling',status:checks.spawn.observed?'observed':'not-observed',summary:`Spawn expectation ${checks.spawn.expected}: ${checks.spawn.passed?'met':'not met'}. Sampled maxima: Helper ${o.maxHelper}, native Projectile ${o.maxProjectile}, Explod ${o.maxExplod}. Counts are not a controller-precise attribution. ${validateSpawnPeaks(checks.spawn,o)}`}
 );
 return{kind:'move-natural-attempt',sourceBinding:'matched',sessionId:input.sessionId,runIndex:input.runIndex,notice:'Imported natural-attempt result matched current saved source/range, actor identities and setup at import. No state was forced. This user-supplied JSON is not independently authenticated; input counters, named command activity, state samples and spawns remain separate observations.',
  stages:{input:{status:available?'sampled':'unavailable',summary:`${scope}: ${available} raw inputTime counters sampled. They are not physical-button or command-recognition proof.`},
   command:{status:recognized?'observed':'not-observed',summary:`${scope}: named command ${JSON.stringify(a.commandName)} active ${a.commandActiveTicks} tick(s), first ${a.commandFirstTick??'not observed'}; buffer origin and physical sequence are unproven.`},
   entry:{status:checks.state.observed?'observed':'not-observed',summary:`${scope}: State ${context.stateNumber} ${checks.state.observed?'sampled':'not sampled'}; first ${a.stateFirstTick??'not observed'}. ${a.startingState===context.stateNumber?'Already in this state at window start; entry is unproven.':'No forced state entry; the executing transition/gate is not traced.'}`},
   spawn:{status:checks.spawn.observed?'observed':'not-observed',summary:`${scope}: spawn ${checks.spawn.observed?'sampled':'not sampled'}; expectation ${checks.spawn.expected} ${checks.spawn.passed?'met':'not met'}. No individual creation controller attribution. ${validateSpawnPeaks(checks.spawn,o)}`},
   contact:{status:o.moveHit||o.moveGuarded?'observed':'unavailable',summary:`${scope}: P1 moveHit=${o.moveHit}, moveGuarded=${o.moveGuarded}; Helper/native Projectile contact and causal collision rejection are not captured.`},
   recovery:{status:checks.idle.observed?'observed':'not-observed',summary:`${scope}: idle State ${checks.idle.expected} ${checks.idle.observed?'sampled after the target state':'not sampled after the target state'}. Control returned=${o.lastCtrl}; no causal CtrlSet attribution.`}},
  checks:checksView,inputCounters:a.inputSamples.map(item=>({...item})),spawnSummary:`Command, raw input counters, state and spawn are separately sampled; no causal missed-input or missed-hit conclusion is inferred.`};
}

module.exports={inspectMoveRun,inspectNaturalAttempt,INPUT_KEYS};
