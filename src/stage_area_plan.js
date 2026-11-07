'use strict';
const path=require('path'),{hash}=require('./mutation_safety'),{parseDef,unquote}=require('./def_model');
const {expression,insertionPoint}=require('./stage_reaction_plan'),{isAttachedDeclaration}=require('./stage_attached_declarations'),{scanStageIntegration}=require('./stage_integration');
const {addAreaIdentity}=require('./stage_area_identity');
const ENGINE='6a09392477650c527c75575a64dd728a2c200c8c';
function one(document,name){const matching=document.sections.filter(s=>s.normalized===name);if(matching.length!==1)throw Error('Area review requires one explicit '+name+' section.');return matching[0];}
function entry(section,key){const matching=section.entries.filter(e=>e.normalized===key);if(matching.length!==1)throw Error('Area review requires one explicit '+key+' entry.');return unquote(matching[0].value);}
function integer(value,label){if(!Number.isSafeInteger(value)||Math.abs(value)>2147483647)throw Error(label+' must be an int32 literal.');return value;}
function literal(section,key){const text=entry(section,key);if(!/^-?\d+$/.test(text))throw Error('Use an explicit integer '+key+' before area review.');return integer(Number(text),key);}
function localWidth(section){const found=section.entries.filter(e=>e.normalized==='localcoord');if(!found.length)return 320;if(found.length!==1||!/^\d+\s*,\s*\d+$/.test(found[0].value.trim()))throw Error('Resolve localcoord before area review.');const width=Number(found[0].value.split(',')[0]);if(width<=0||width>32768)throw Error('Unsupported localcoord width.');return width;}
function planAreaExpansion(options){
 require('./stage_owner_role').assertDedicatedAttachedSource(options.ownerFilename,options.otherOwnerSources);
 const {stageText,stageFilename,ownerText,ownerFilename,ownerDefText,ownerDefFilename}=options;
 if(![stageText,ownerText,ownerDefText].every(value=>typeof value==='string')||![stageFilename,ownerFilename,ownerDefFilename].every(value=>typeof value==='string'&&path.isAbsolute(value))||!/\.zss$/i.test(ownerFilename))throw Error('Choose exact Stage, attached DEF and linked ZSS source identities.');
 const stage=parseDef(stageText),definition=parseDef(ownerDefText),info=one(stage,'info'),files=one(definition,'files');
 const same=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase(),links=[];
 const resolves=(entry,from,to)=>{const reference=unquote(entry.value),supplied=options.linkEvidence?.find(link=>same(link.from,from)&&link.reference===reference),resolved=supplied?.to||path.resolve(path.dirname(from),reference);if(!same(resolved,to))return false;links.push({from,reference,to:resolved});return true;};
 if(!info.entries.some(e=>isAttachedDeclaration(e.normalized)&&resolves(e,stageFilename,ownerDefFilename)))throw Error('Selected owner DEF is not directly linked from this Stage.');
 if(!files.entries.some(e=>/^st\d*$/.test(e.normalized)&&resolves(e,ownerDefFilename,ownerFilename)))throw Error('Selected ZSS source is not directly owned by the attached DEF.');
 if(options.ownerSourcesComplete!==true||!Array.isArray(options.ownerSources)||!options.ownerSources.length||!options.ownerSources.some(s=>s.filename===ownerFilename&&s.text===ownerText))throw Error('Provide the complete exact linked-owner source set.');
 const namespace=options.namespace;if(typeof namespace!=='string'||!/^ikm_area_[A-Za-z0-9_]{1,48}$/.test(namespace))throw Error('Use a distinct ikm_area_ namespace.');
 const names=new Set(),sources=options.ownerSources.map(source=>{
  if(typeof source?.filename!=='string'||typeof source.text!=='string'||names.has(source.filename))throw Error('Invalid or duplicated linked source identity.');names.add(source.filename);
  if(source.text.toLowerCase().includes(namespace.toLowerCase()))throw Error('Area namespace already occurs in linked source.');
  if(scanStageIntegration(source.text,source.filename).modifyStageVar.some(controller=>controller.parameters.some(parameter=>/^(?:camera\.(?:boundleft|boundright)|playerinfo\.(?:leftbound|rightbound))$/i.test(parameter))))throw Error('Another linked-owner bounds writer requires explicit shared priority/source review.');
  return {filename:source.filename,sha256:hash(source.text)};
 });
 if(options.movementPolicy!=='preserve-world-motion'||options.resetPolicy!=='owned-round-restore'||options.boundsOwnership!=='exclusive-reviewed')throw Error('Explicitly choose preserved world motion, owned round restoration, and reviewed exclusive bounds ownership.');
 const camera=one(stage,'camera'),players=one(stage,'playerinfo'),before={camera:{left:literal(camera,'boundleft'),right:literal(camera,'boundright')},players:{left:literal(players,'leftbound'),right:literal(players,'rightbound')}};
 const after={camera:{left:integer(options.camera?.left,'Camera left'),right:integer(options.camera?.right,'Camera right')},players:{left:integer(options.players?.left,'Player left'),right:integer(options.players?.right,'Player right')}};
 for(const group of ['camera','players'])if(before[group].left>=before[group].right||after[group].left>before[group].left||after[group].right<before[group].right)throw Error('This recipe only widens valid horizontal bounds; narrowing/relocation requires a separate reviewed transition.');
 if(JSON.stringify(before)===JSON.stringify(after))throw Error('Choose a real edge expansion.');
 const stageWidth=localWidth(one(stage,'stageinfo')),ownerWidth=localWidth(one(definition,'info')),ratio=ownerWidth/stageWidth;
 const convert=bounds=>Object.fromEntries(['camera','players'].map(group=>[group,Object.fromEntries(['left','right'].map(side=>[side,integer(bounds[group][side]*ratio,'Converted '+group+' '+side)]))]));
 const callerBefore=convert(before),callerAfter=convert(after),condition=expression(options.condition),offset=insertionPoint(ownerText),m=suffix=>'map("'+namespace+'_'+suffix+'")',set=(suffix,value)=>'mapSet{map: "'+namespace+'_'+suffix+'"; value: '+value+'}';
 const fields=[['camera.boundleft','camera','left'],['camera.boundright','camera','right'],['playerinfo.leftbound','players','left'],['playerinfo.rightbound','players','right']],baselineGuard=fields.map(([field,group,side])=>'stageVar('+field+') = '+callerBefore[group][side]).join(' && '),change='modifyStageVar{'+fields.map(([field,group,side])=>field+': '+callerAfter[group][side]).join('; ')+'}';
 const identity=addAreaIdentity(stageText,stageFilename,namespace),expandedGuard=fields.map(([field,group,side])=>'stageVar('+field+') = '+callerAfter[group][side]).join(' && '),restore='modifyStageVar{'+fields.map(([field,group,side])=>field+': '+callerBefore[group][side]).join('; ')+'}';
 const block=[
 '# IKEMaker same-stage area '+namespace+' — horizontal edge expansion only.',
 '# Global bounds change; no PosSet/VelSet/ChangeState/Control or cached participant IDs.',
 'if '+require('./stage_owner_role').OWNER_GUARD+' && ('+identity.guard+') {',
 '  if roundNo != '+m('round')+' || (roundState = 0 && '+m('previousRoundState')+' != 0) {',
 '    '+set('restoreConflict',0),
 '    if '+m('expanded')+' {',
 '      if '+expandedGuard+' { '+restore+' }',
 '      else if !('+baselineGuard+') { '+set('restoreConflict',1)+' }',
 '    }',
 ...['used','last','signal','conflict','expanded'].map(key=>'    '+set(key,0)),
 '    '+set('round','roundNo'),
 '  }',
 '  '+set('signal',0),
 '  if roundState = 2 { '+set('signal','('+condition+') != 0')+' }',
 '  if '+m('signal')+' && !'+m('last')+' && !'+m('used')+' && !'+m('conflict')+' {',
 '    if '+baselineGuard+' {',
 '      '+change,'      '+set('expanded',1),'      '+set('used',1),
 '    } else { '+set('conflict',1)+' }',
 '  }',
 '  '+set('last',m('signal')),
 '  '+set('previousRoundState','roundState'),
 '}',
 '# Restore only this token-identified Stage and unchanged owned expanded bounds; never another variant/writer.',
 '# End IKEMaker same-stage area '+namespace
 ].join('\n'),eol=ownerText.includes('\r\n')?'\r\n':'\n',insert=eol+block.replace(/\n/g,eol)+eol;
 const plan={kind:'stage-area-expansion-v1',engineRevision:ENGINE,stageFilename,ownerFilename,ownerDefFilename,links,identity:{namespace:identity.namespace,values:identity.values},stageAfter:identity.text,stageHash:hash(stageText),ownerHash:hash(ownerText),ownerDefHash:hash(ownerDefText),ownerSources:sources,namespace,condition,before,after,stageWidth,ownerWidth,callerBefore,callerAfter,movementPolicy:options.movementPolicy,resetPolicy:options.resetPolicy,boundsOwnership:options.boundsOwnership,edit:{offset,text:insert},runtimeVerified:false};
 plan.review='Same Stage DEF: '+stageFilename+'\nAttached owner: '+ownerDefFilename+'\nAdditive source destination: '+ownerFilename+'\nWhen (attached-owner context, fighting only): '+condition+'\nCamera X '+before.camera.left+'..'+before.camera.right+' → '+after.camera.left+'..'+after.camera.right+'; physical player X '+before.players.left+'..'+before.players.right+' → '+after.players.left+'..'+after.players.right+' (Stage localcoord '+stageWidth+'; owner '+ownerWidth+').\nGlobal widening affects every entity using native Stage/screen bounds. Fighters, partners, throws/binds, helpers and projectiles keep their current world position, velocity, control and source state; none are teleported, destroyed or forcibly released. Existing ScreenBound behavior remains authoritative. No participant ID is captured or assumed. Teams/tag/turns and camera-reset continuity require scenario-specific runtime acceptance.\nOne rising-edge expansion per round; no narrowing or relocation. On round change/intro reentry, restore baseline only in this explicit token-identified Stage and only if all four bounds still match the owned expanded values. Clear only owned maps; another writer�s changed bounds are preserved with restoreConflict flagged. Runtime baseline comparison refuses another writer’s changed bounds and latches conflict. Full owner source set scanned; other fighters/modules can still write bounds and require project ownership review. No priority arbitration, midmatch DEF loading, floor collision or falling-combat claim.\nAll affected files: '+stageFilename+' (reserved unique identity Constants) and '+ownerFilename+' (controller), one compound unsaved native edit after explicit reviewed Apply. Original assets stay unchanged. Identity tokens must be excluded from copied variants; manual clones require reviewed repair.\n\n'+insert;
 plan.review+='\n'+require('./stage_owner_role').ROLE_REVIEW;
 return plan;
}
function materializeAreaExpansion(plan,current){
 if(!plan||plan.kind!=='stage-area-expansion-v1'||current.stageFilename!==plan.stageFilename||current.ownerFilename!==plan.ownerFilename||current.ownerDefFilename!==plan.ownerDefFilename||hash(current.stageText)!==plan.stageHash||hash(current.ownerText)!==plan.ownerHash||hash(current.ownerDefText)!==plan.ownerDefHash)throw Error('Area Stage/owner identity changed. Review a new plan.');
 const checked=planAreaExpansion({...current,namespace:plan.namespace,condition:plan.condition,camera:plan.after.camera,players:plan.after.players,movementPolicy:plan.movementPolicy,resetPolicy:plan.resetPolicy,boundsOwnership:plan.boundsOwnership});
 if(JSON.stringify(checked)!==JSON.stringify(plan))throw Error('Area plan or linked sources changed. Review a new plan.');
 return current.ownerText.slice(0,plan.edit.offset)+plan.edit.text+current.ownerText.slice(plan.edit.offset);
}
module.exports={planAreaExpansion,materializeAreaExpansion};
