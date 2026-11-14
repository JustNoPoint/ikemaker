'use strict';
// Source reference 6e564af (controller paths also byte-identical to 6a093924): compiler.go:145-174, 7808/7864; bytecode.go:16378;
// char.go:8496 index is ordinal among matching BG IDs, not physical index.
const crypto=require('node:crypto');
const path=require('node:path');
const {parseDef,unquote}=require('./def_model');
const {parseSndBuffer}=require('./snd_reader');
const {mask}=require('./viewer_used_by_model');
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
function validateSound(receipt,evidence,ownerFilename){
 if(!receipt)return null;
 if(!evidence||typeof evidence.ownerDefText!=='string'||!Buffer.isBuffer(evidence.sndBytes))throw Error('Provide current owner DEF text and SND bytes for sound review.');
 const sound={};for(const key of ['ownerDef','ownerDefHash','filename','sourceHash','group','index','channel','archiveIndex'])sound[key]=receipt[key];
 if(!path.isAbsolute(sound.ownerDef||'')||!path.isAbsolute(sound.filename||'')||hash(evidence.ownerDefText)!==sound.ownerDefHash||hash(evidence.sndBytes)!==sound.sourceHash)throw Error('Sound owner or archive evidence changed.');
 for(const k of ['group','index'])if(!Number.isInteger(sound[k])||sound[k]<-2147483648||sound[k]>2147483647)throw Error('Choose an exact int32 sound identity.');
 integer(sound.channel,'Sound channel');integer(sound.archiveIndex,'Sound archive index');
 const files=parseDef(evidence.ownerDefText).sections.filter(s=>s.normalized==='files');if(files.length!==1)throw Error('Sound owner Files section is ambiguous.');
 if(!require('./stage_linked_owner_inventory').validateSourceLink(evidence.ownerDefText,sound.ownerDef,ownerFilename,evidence.link))throw Error('Sound DEF does not own the selected ZSS source; review indirect/shared ownership in source.');
 const value=unquote(entry(files[0],'sound')),resolved=path.resolve(path.dirname(sound.ownerDef),value);
 if(resolved.toLowerCase()!==path.resolve(sound.filename).toLowerCase())throw Error('SND is not assigned to this exact owner DEF.');
 const archive=parseSndBuffer(evidence.sndBytes,sound.filename),matches=archive.entries.filter(e=>e.group===sound.group&&e.index===sound.index);
 if(matches.length!==1||matches[0].archiveIndex!==sound.archiveIndex||!matches[0].wav.valid)throw Error('Choose one unique readable sound occurrence from the linked owner.');
 return sound;
}
function integer(n,name,min=0){if(!Number.isSafeInteger(n)||n<min||n>2147483647)throw Error(name+' must be a whole number from '+min+' to 2147483647.');return n;}
function point(value,name){if(!Array.isArray(value)||value.length!==2||value.some(n=>!Number.isFinite(n)||Math.abs(n)>10000000))throw Error(name+' needs two finite Stage coordinates.');return [...value];}
function entry(section,key){const found=section.entries.filter(e=>e.normalized===key);if(found.length!==1)throw Error('Choose an explicit unambiguous '+key+' in the selected BG.');return found[0].value.trim();}
function numberEntry(section,key){const raw=entry(section,key);if(!/^\d+$/.test(raw))throw Error('Selected BG '+key+' must be a nonnegative literal.');return integer(Number(raw),key);}
// stage.go:118 id int32 is Go-zero-initialized by newBackGround:172;
// read at478 changes it only when present. char.go:8496 counts matching IDs.
function backgroundId(section){return section.entries.some(e=>e.normalized==='id')?numberEntry(section,'id'):0;}
function visibilityGates(stageText,physical){
 const sections=parseDef(stageText).sections,bgs=sections.filter(s=>/^bg\s+/i.test(s.name)),bg=bgs[physical];if(!bg)return [];
 const id=backgroundId(bg);if(bgs.filter(s=>backgroundId(s)===id).length!==1)return [];
 const controllers=require('./stage_model').stageModel(parseDef(stageText)).controllers;
 const visibilityOwners=controllers.filter(c=>['visible','enable'].includes(c.type)&&c.affectedBackgrounds.includes(physical));
 return controllers.filter(c=>c.type==='visible'&&visibilityOwners.length===1&&c.affectedBackgrounds.length===1&&c.affectedBackgrounds[0]===physical&&c.time.every(n=>n===-1)&&c.raw.value==='1'&&/^\d+$/.test(c.raw.sctrlid||'')&&String(c.raw.ctrlid).trim()===String(id)&&controllers.filter(other=>(other.sctrlid??0)===c.sctrlid).length===1).map(c=>({id:c.sctrlid,line:c.line,label:c.heading+' · sctrlid '+c.sctrlid}));
}
function reactionIdentity(text,filename){const api=require('./stage_area_identity'),namespace='ikm_area_event_stage',existing=api.areaIdentities(text).find(i=>i.namespace===namespace);return existing?{text,namespace,values:existing.values,guard:existing.values.map((n,i)=>'stageConst('+namespace+'_identity_'+i+') = '+n).join(' && ')}:api.addAreaIdentity(text,filename,namespace);}
function managedMembers(stageText,physical,sourceText){const identity=require('./stage_area_identity').areaIdentities(stageText).find(i=>i.namespace==='ikm_area_event_stage');if(!identity)return [];const bgs=parseDef(stageText).sections.filter(s=>/^bg\s+/i.test(s.name)),bg=bgs[physical];if(!bg)return [];const id=backgroundId(bg),target={id,index:bgs.slice(0,physical).filter(s=>backgroundId(s)===id).length,name:bg.name,type:entry(bg,'type').toLowerCase()},guard=identity.values.map((n,i)=>'stageConst('+identity.namespace+'_identity_'+i+') = '+n).join(' && ');return require('./stage_reaction_group').inspectMembers(sourceText,guard,target);}
function expression(text){if(typeof text!=='string'||!text.trim()||text.length>4096||/[\r\n{};#]/.test(text)||/\/\*|\/\//.test(text))throw Error('Use one explicit owner-context condition expression, without statements or comments.');let depth=0,quoted=false;for(let i=0;i<text.length;i++){if(text[i]==='"'&&text[i-1]!=='\\')quoted=!quoted;if(!quoted){if(text[i]==='(')depth++;if(text[i]===')'&&--depth<0)throw Error('Unbalanced condition.');}}if(quoted||depth)throw Error('Unbalanced condition.');return text.trim();}
function insertionPoint(source){
 const code=mask(source,true).replace(/#[^\r\n]*/g,s=>' '.repeat(s.length)),headers=[...code.matchAll(/^[ \t]*\[(StateDef|Function)\s+([^\]\r\n]+)\]/gim)];
 const globals=headers.filter(h=>h[1].toLowerCase()==='statedef'&&/^-4(?:\s|;|$)/.test(h[2]));if(globals.length!==1)throw Error('Choose ZSS source with one existing StateDef -4; review missing or duplicate globals in source.');
 let depth=0;const top=[];for(let i=0;i<code.length;i++){if(code[i]==='{')depth++;else if(code[i]==='}'&&--depth<0)throw Error('Unbalanced owner source.');if(code[i]==='['&&depth===0)top.push(i);}if(depth)throw Error('Unbalanced owner source.');
 const selected=globals[0],start=selected.index+selected[0].indexOf('[');if(!top.includes(start))throw Error('Global StateDef must be at top level.');
 const next=headers.find(h=>h.index>selected.index);return next?next.index:source.length;
}
function planReaction(options){
 require('./stage_owner_role').assertDedicatedAttachedSource(options.ownerFilename,options.foreignOwnerSources);
 const {stageText,ownerText,stageFilename,ownerFilename}=options;
 if(typeof stageText!=='string'||typeof ownerText!=='string'||!stageFilename||!ownerFilename||!/\.zss$/i.test(ownerFilename))throw Error('Choose exact Stage and linked ZSS owner sources.');
 const name=options.namespace;if(typeof name!=='string'||!/^ikm_rx_[A-Za-z0-9_]{1,48}$/.test(name))throw Error('Choose an explicit ikm_rx_ map namespace.');
 if(options.ownerSourcesComplete!==true||!Array.isArray(options.ownerSources)||!options.ownerSources.length)throw Error('Provide the complete linked owner source set for namespace review.');
 const editOperation=options.editOperation||'new';if(!['new','update','remove'].includes(editOperation))throw Error('Choose New, Update or Remove.');
 const sourceNames=new Set(),ownerSources=options.ownerSources.map(s=>{if(!s||typeof s.filename!=='string'||typeof s.text!=='string'||sourceNames.has(s.filename))throw Error('Invalid linked owner source set.');sourceNames.add(s.filename);if(editOperation==='new'&&s.text.toLowerCase().includes(name.toLowerCase()))throw Error('Reaction namespace already occurs in linked owner source: '+s.filename);return {filename:s.filename,sha256:hash(s.text)};});
 if(!options.ownerSources.some(s=>s.filename===ownerFilename&&s.text===ownerText))throw Error('Linked owner source set must include the exact insertion document.');
 const sections=parseDef(stageText).sections,bgs=sections.filter(s=>/^bg\s+/i.test(s.name));
 const physical=integer(options.bgPhysicalIndex,'BG physical index'),bg=bgs[physical];if(!bg)throw Error('Selected BG no longer exists.');
 const reactionKind=options.reactionKind||'animation',bgType=entry(bg,'type').toLowerCase();if(!['animation','position','visibility'].includes(reactionKind))throw Error('Choose Animation, authored-start Position or Visibility reaction.');
 if(reactionKind==='animation'&&bgType!=='anim')throw Error('Animation reactions require an animated BG.');
 const id=backgroundId(bg),index=bgs.slice(0,physical).filter(s=>backgroundId(s)===id).length;
 // Reject ambiguous IDs throughout the preceding selection domain: ordinal must
 // have the same meaning to our parser and the runtime.
 // backgroundId rejects malformed or duplicate authored IDs instead of relying
 // on a different parser fallback; omitted IDs are the verified default zero.
 const baseline=reactionKind==='animation'?numberEntry(bg,'actionno'):null,action=reactionKind==='animation'?integer(options.action,'Reaction action'):null,returnAction=reactionKind==='animation'?integer(options.returnAction??baseline,'Return action'):null,duration=integer(options.duration,'Duration',1),cooldown=integer(options.cooldown??0,'Cooldown');
 const actions=sections.filter(s=>/^begin\s+action\s+\d+$/i.test(s.name)).map(s=>Number(s.name.match(/\d+$/)[0]));
 if(reactionKind==='animation')for(const n of [baseline,action,returnAction])if(actions.filter(a=>a===n).length!==1)throw Error('Baseline, reaction and return require unique existing Stage AIR actions.');
 let baselinePosition=null,position=null,returnPosition=null;if(reactionKind==='position'){
  const starts=bg.entries.filter(e=>e.normalized==='start');if(starts.length>1)throw Error('Resolve duplicate BG start before position authoring.');const raw=(starts[0]?.value||'0,0').split(',').map(s=>s.trim());if(raw.length!==2||raw.some(s=>!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(s)))throw Error('Position reaction needs literal authored BG start coordinates.');
  baselinePosition=point(raw.map(Number),'Baseline start');position=point(options.position,'React start');returnPosition=point(options.returnPosition??baselinePosition,'Return start');
 }
 let visibilityControllerId=null,stageEdit=null,visible=null,returnVisible=null;if(reactionKind==='visibility'){
  if(typeof options.visible!=='boolean'||typeof options.returnVisible!=='boolean')throw Error('Choose explicit React and Return visibility.');visible=options.visible;returnVisible=options.returnVisible;
  if(options.visibilityControllerId==='auto'){
   if(!bg.entries.some(e=>e.normalized==='id')||bgs.filter(s=>backgroundId(s)===id).length!==1)throw Error('Automatic per-element visibility needs a unique explicit BG ID. Shared/default IDs need reviewed reference migration or an explicitly authored group controller.');
   const existingGates=visibilityGates(stageText,physical);if(existingGates.length===1)visibilityControllerId=existingGates[0].id;
   if(visibilityControllerId===null&&require('./stage_model').stageModel(parseDef(stageText)).controllers.some(c=>['visible','enable'].includes(c.type)&&c.affectedBackgrounds.includes(physical)))throw Error('An authored Visible/Enable BGCtrl already affects this BG. Review exclusive visibility ownership in source instead of adding a competing gate.');
   if(visibilityControllerId===null){
   const controls=sections.filter(s=>/^bgctrl(?:\s|$)/i.test(s.name)),used=new Set(controls.map(s=>s.entries.some(e=>e.normalized==='sctrlid')?numberEntry(s,'sctrlid'):0));let candidate=1;while(used.has(candidate))candidate++;visibilityControllerId=integer(candidate,'Visibility controller ID');
   const eol=stageText.includes('\r\n')?'\r\n':'\n',gate=['','[BGCtrlDef IKEMaker '+name+']','ctrlid = '+id,'looptime = -1','[BGCtrl IKEMaker '+name+']','type = visible','ctrlid = '+id,'sctrlid = '+visibilityControllerId,'time = -1,-1,-1','value = 1',''].join(eol);stageEdit={offset:stageText.length,text:gate};
   }
  }else{visibilityControllerId=integer(options.visibilityControllerId,'Visibility controller ID');if(!visibilityGates(stageText,physical).some(c=>c.id===visibilityControllerId))throw Error('Choose an exact dormant Visible BGCtrl with unique sctrlid, direct unique BG ctrlid, time=-1,-1,-1 and value=1.');}
 }
 if(typeof options.oncePerRound!=='boolean')throw Error('Choose once-per-round behavior explicitly.');
 if(!Array.isArray(options.roundStates)||!options.roundStates.length||options.roundStates.some(n=>!Number.isInteger(n)||n<0||n>4)||new Set(options.roundStates).size!==options.roundStates.length)throw Error('Choose explicit eligible RoundState values 0 through 4.');
 const roundStates=[...options.roundStates].sort(),eligible=roundStates.map(n=>'roundState = '+n).join(' || '),ownerSound=validateSound(options.ownerSound,options.ownerSoundEvidence,ownerFilename);
 const music=require('./stage_reaction_music'),ownerMusic=music.validate(options.ownerMusic,options.ownerMusicEvidence,ownerFilename,stageFilename,stageText),musicCode=music.code(ownerMusic),musicReturnCode=music.returnCode(ownerMusic);
 const when=expression(options.condition),at=insertionPoint(ownerText),m=s=>'map('+name+'_'+s+')',set=(s,v)=>'mapSet{map: "'+name+'_'+s+'"; value: '+v+'}',change=a=>'modifyStageBG{id: '+id+'; index: '+index+'; actionno: '+a+'}';
 const move=p=>'modifyStageBG{id: '+id+'; index: '+index+'; start.x: '+p[0]+'; start.y: '+p[1]+'}',show=value=>'modifyBGCtrl{id: '+visibilityControllerId+'; time: stageTime + 1, stageTime + 1, -1; value: '+(value?1:0)+'}',resetCode=reactionKind==='animation'?change(baseline):reactionKind==='position'?move(baselinePosition):show(true),reactCode=reactionKind==='animation'?change(action):reactionKind==='position'?move(position):show(visible),returnCode=reactionKind==='animation'?change(returnAction):reactionKind==='position'?move(returnPosition):show(returnVisible);
 const scopedStage=stageEdit?stageText+stageEdit.text:stageText,identity=reactionIdentity(scopedStage,stageFilename);
 const block=[
 '# IKEMaker reaction '+name+' — explicit attached-owner condition; no fighter convention assumed.',
 'if '+require('./stage_owner_role').OWNER_GUARD+' && ('+identity.guard+') {',
 '  if roundNo != '+m('round')+' || (roundState = 0 && '+m('previousRoundState')+' != 0) {',
 '    '+resetCode,...['active','timer','cooldown','last','used','signal'].map(s=>'    '+set(s,0)),
 '    '+set('round','roundNo'),
 '  }',
 '  if 1 {',
 '    if '+m('cooldown')+' > 0 { '+set('cooldown',m('cooldown')+' - 1')+' }',
 '    if '+m('active')+' {',
 '      '+set('timer',m('timer')+' - 1'),
 '      if '+m('timer')+' <= 0 {',
 '        '+returnCode,...(musicReturnCode?['        if '+music.owns(name)+' { '+musicReturnCode+' } else { '+set('musicConflict',1)+' }']:[]),'        '+set('active',0),'        '+set('cooldown',cooldown),
 '      }','    }',
 '    '+set('signal',0),
 '    if '+eligible+' { '+set('signal','('+when+') != 0')+' }',
 '    if '+m('signal')+' && !'+m('last')+' && !'+m('active')+' && !'+m('cooldown')+(options.oncePerRound?' && !'+m('used'):'')+' {',
 '      '+reactCode,...(ownerSound?['      playSnd{value: '+ownerSound.group+', '+ownerSound.index+'; channel: '+ownerSound.channel+'; loop: 0}']:[]),...(musicCode?['      '+musicCode,...music.snapshot(name).map(line=>'      '+line),'      '+set('musicConflict',0)]:[]),'      '+set('active',1),'      '+set('timer',duration),'      '+set('used',1),
 '    }','    '+set('last',m('signal')),
 '  }','  '+set('previousRoundState','roundState'),'}', '# End IKEMaker reaction '+name
 ].join('\n');
 const eol=ownerText.includes('\r\n')?'\r\n':'\n';let insert=eol+block.replace(/\n/g,eol)+eol,edit={offset:at,text:insert},group=null;
 const foreignOwnerSources=(options.foreignOwnerSources||[]).map(s=>({filename:s.filename,sha256:hash(s.text)}));
 if(options.priority!==undefined){
  const priority=integer(options.priority,'Reaction priority');if(priority>1000000||!['allow-higher','finish','return-on-false'].includes(options.interruptPolicy))throw Error('Choose priority 0..1000000 and an explicit active interruption policy.');
  const token=1+parseInt(hash(name).slice(0,7),16),recipe={namespace:name,token,priority,interruptPolicy:options.interruptPolicy,condition:when,roundStates,duration,cooldown,oncePerRound:options.oncePerRound,resetCode,reactCode,returnCode,soundCode:ownerSound?'playSnd{value: '+ownerSound.group+', '+ownerSound.index+'; channel: '+ownerSound.channel+'; loop: 0}':'',soundReceipt:ownerSound,musicCode,musicReturnCode,musicReceipt:ownerMusic,parameters:{reactionKind,action,returnAction,position,returnPosition,visibilityControllerId,visible,returnVisible}};
  group=require('./stage_reaction_group').buildGroup({ownerText,ownerFilename,ownerSources:options.ownerSources,foreignOwnerSources:options.foreignOwnerSources,stageText,stageTargets:bgs.map((s,i)=>({physical:i,id:backgroundId(s),index:bgs.slice(0,i).filter(p=>backgroundId(p)===backgroundId(s)).length,name:s.name,type:entry(s,'type').toLowerCase()})),target:{id,index,type:bgType,name:bg.name,reactionKind,...(reactionKind==='visibility'?{visibilityControllerId}:{})},identity,recipe,operation:editOperation,offset:at});edit=group.edit;insert=edit.text;
 }
 if(editOperation!=='new'&&!group)throw Error('Update/remove requires a verified managed reaction member.');
 const plan={kind:'stage-reaction-plan-v1',engineRevision:'6e564af055bb1341b787990f971828ff930935b4',engineRevisionRole:'source-reference',stageFilename,ownerFilename,stageHash:hash(stageText),ownerHash:hash(ownerText),ownerSources,foreignOwnerSources,ownerSound,ownerMusic,roundStates,target:{physicalIndex:physical,line:bg.line,id,index,type:bgType},namespace:name,condition:when,editOperation,reactionKind,action,returnAction,baseline,baselinePosition,position,returnPosition,visibilityControllerId,visibilityAuto:options.visibilityControllerId==='auto',visible,returnVisible,stageEdit,stageAfter:identity.text,identity:{namespace:identity.namespace,values:identity.values},priority:options.priority??null,interruptPolicy:options.interruptPolicy??null,group:group?{key:group.key,members:group.members}:null,duration,cooldown,oncePerRound:options.oncePerRound,edit,runtimeVerified:false};
 plan.review='Owner expression context: '+ownerFilename+' (not automatically P1/P2); evaluated once per eligible tick.\nStage: '+stageFilename+'\nBG physical '+physical+', line '+(bg.line+1)+': id '+id+', matching-ID ordinal '+index+'.\nAnimation '+baseline+' → '+action+' for '+duration+' owner ticks → '+returnAction+'. Cooldown '+cooldown+' ticks; '+(options.oncePerRound?'once per round':'rising-edge retrigger')+'. Trigger RoundStates: '+roundStates.join(',')+'. Active timers continue outside that trigger window.\nReset once on roundNo change or reentry to RoundState 0. Caller supplied complete linked-owner namespace scan: '+ownerSources.map(s=>s.filename).join(', ')+'. Source integration is additive inside the existing -4. Existing early return/other BG writers require source review. This reaction edits artwork. Use Physical one-way segments with compatible character code for gameplay surfaces and combat falls.\nReview explicit Apply to an unsaved native edit. Save the reviewed files and test this exact game and its other authored controllers.\n\n'+insert;
 if(reactionKind==='position')plan.review=plan.review.replace('Animation '+baseline+' → '+action+' for '+duration+' owner ticks → '+returnAction,'Authored start '+baselinePosition.join(',')+' → '+position.join(',')+' for '+duration+' owner ticks → '+returnPosition.join(',')+' (Stage units; underlying BG velocity/controllers continue; no physical collision)');
 if(reactionKind==='visibility')plan.review=plan.review.replace('Animation '+baseline+' → '+action+' for '+duration+' owner ticks → '+returnAction,'Visible true → '+visible+' for '+duration+' owner ticks → '+returnVisible+' through BGCtrl sctrlid '+visibilityControllerId+' (scheduled for next Stage tick; paused Stage delays it)');
 if(group)plan.review=plan.review.replace('This reaction edits artwork. Use Physical one-way segments with compatible character code for gameplay surfaces and combat falls.','Managed priority group '+group.key+': '+group.members.map(r=>r.namespace+' priority '+r.priority+' / '+r.interruptPolicy).join('; ')+'. Highest eligible edge wins before any sound. Active ties retain their winner; idle ties use stable namespace order. Preempted members cancel without Return or automatic resume. Arbitration is private to this exact owner/BG/property; arbitrary project writers need source review. This reaction edits artwork. Use Physical one-way segments with compatible character code for gameplay surfaces and combat falls.');
 if(identity.text!==scopedStage)plan.review+='\nAlso add exact Stage identity Constants to '+stageFilename+':\n'+identity.values.map((n,i)=>identity.namespace+'_identity_'+i+' = '+n).join('\n')+'\nSave this Stage DEF AND the linked owner source. One compound native Undo covers both. The identity guards all reset/react/return writes; do not copy reserved identity constants into a variant.\n';
 if(stageEdit)plan.review+='\nAlso append this dormant dedicated visibility gate to '+stageFilename+' (compound native Undo with linked source; both remain unsaved):\n'+stageEdit.text;
 if(ownerSound)plan.review+='\nSound on reaction entry: '+ownerSound.ownerDef+' → '+ownerSound.filename+' ['+ownerSound.group+','+ownerSound.index+'], channel '+ownerSound.channel+', loop off. Original SND unchanged. Audition the chosen sound and test its timing in this exact game.\n';
 if(ownerMusic)plan.review+='\nMATCH music on reaction: '+ownerMusic.filename+' ('+ownerMusic.sampleRate+' Hz, original source frames '+ownerMusic.start+' → '+ownerMusic.end+'); volume '+ownerMusic.volume+', loop '+ownerMusic.loop+'. Owner-relative reference: '+ownerMusic.relative+'. Return policy '+ownerMusic.returnPolicy+'; stage-default restarts the Stage default, not the previously playing position. Round music remains engine-owned. Preemption does not rewind global music unless the winner replaces it. Source audio is referenced unchanged.\n';if(editOperation!=='new')plan.review=editOperation.toUpperCase()+' exact managed member '+name+' in '+ownerFilename+'. External authored source is preserved. Shared Stage identity and dormant gates are retained.\n'+plan.review;
 plan.review+='\n'+require('./stage_owner_role').ROLE_REVIEW;
 return plan;
}
function materializeReactionBundle(plan,current){
 if(!plan||plan.kind!=='stage-reaction-plan-v1'||current.stageFilename!==plan.stageFilename||current.ownerFilename!==plan.ownerFilename||hash(current.stageText)!==plan.stageHash||hash(current.ownerText)!==plan.ownerHash)throw Error('Reaction source or target changed; review a new plan.');
 // Recompute the complete sealed proposal from the current source. A mutable
 // review object can never authorize changed code or a changed target.
 const checked=planReaction({...current,namespace:plan.namespace,bgPhysicalIndex:plan.target.physicalIndex,condition:plan.condition,editOperation:plan.editOperation,reactionKind:plan.reactionKind,position:plan.position,returnPosition:plan.returnPosition,visibilityControllerId:plan.visibilityAuto?'auto':plan.visibilityControllerId,visible:plan.visible,returnVisible:plan.returnVisible,priority:plan.priority===null?undefined:plan.priority,interruptPolicy:plan.interruptPolicy===null?undefined:plan.interruptPolicy,action:plan.action,returnAction:plan.returnAction,duration:plan.duration,cooldown:plan.cooldown,oncePerRound:plan.oncePerRound,roundStates:plan.roundStates,ownerSound:plan.ownerSound,ownerMusic:plan.ownerMusic});
 if(JSON.stringify(checked)!==JSON.stringify(plan))throw Error('Reaction review changed; review a new plan.');
 return {ownerText:current.ownerText.slice(0,plan.edit.offset)+plan.edit.text+current.ownerText.slice(plan.edit.offset+(plan.edit.deleteCount||0)),stageText:plan.stageAfter};
}
function materializeReaction(plan,current){return materializeReactionBundle(plan,current).ownerText;}
module.exports={planReaction,materializeReaction,materializeReactionBundle,insertionPoint,expression,visibilityGates,managedMembers};
