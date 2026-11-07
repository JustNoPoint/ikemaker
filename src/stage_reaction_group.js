'use strict';
const crypto=require('node:crypto');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const PREFIX='# IKEMaker managed reaction group v1 ';
function checkRecipe(r){
 if(!r||!/^ikm_rx_[A-Za-z0-9_]{1,48}$/.test(r.namespace)||!Number.isInteger(r.token)||r.token<=0||r.token>2147483647||!Number.isInteger(r.priority)||r.priority<0||r.priority>1000000||!['allow-higher','finish','return-on-false'].includes(r.interruptPolicy))throw Error('Managed reaction metadata requires source review.');
 require('./stage_reaction_plan').expression(r.condition);
 if(!Array.isArray(r.roundStates)||!r.roundStates.length||r.roundStates.some(n=>!Number.isInteger(n)||n<0||n>4)||!Number.isInteger(r.duration)||r.duration<1||r.duration>2147483647||!Number.isInteger(r.cooldown)||r.cooldown<0||r.cooldown>2147483647||typeof r.oncePerRound!=='boolean')throw Error('Invalid managed reaction timing metadata.');
 for(const name of ['resetCode','reactCode','returnCode'])if(!/^(?:modifyStageBG|modifyBGCtrl)\{[^{}\r\n#]*\}$/.test(r[name]||''))throw Error('Managed reaction code was changed; review source.');
 if(r.soundCode&&!/^playSnd\{[^{}\r\n#]*\}$/.test(r.soundCode))throw Error('Managed sound code was changed; review source.');
 for(const field of ['musicCode','musicReturnCode'])if(r[field]&&!/^playBgm\{[^{}\r\n#]*\}$/.test(r[field]))throw Error('Managed music code was changed; review source.');
}
function render(key,guard,recipes){
 for(const r of recipes)checkRecipe(r);
 const group=s=>'map("'+key+'_'+s+'")',gs=(s,v)=>'mapSet{map: "'+key+'_'+s+'"; value: '+v+'}',m=(r,s)=>'map("'+r.namespace+'_'+s+'")',set=(r,s,v)=>'mapSet{map: "'+r.namespace+'_'+s+'"; value: '+v+'}',lines=[];
 const add=(indent,text)=>lines.push(' '.repeat(indent)+text);
 add(0,'if '+require('./stage_owner_role').OWNER_GUARD+' && ('+guard+') {');
 add(2,'if roundNo != '+group('round')+' || (roundState = 0 && '+group('previousRoundState')+' != 0) {');
 add(4,recipes[0].resetCode);add(4,gs('owner',0));add(4,gs('priority',0));add(4,gs('locked',0));add(4,gs('musicOwner',0));add(4,gs('round','roundNo'));
 for(const r of recipes)for(const field of ['timer','cooldown','last','used','signal','active'])add(4,set(r,field,0));
 add(2,'}');
 // All conditions are sampled before winner selection or sound side effects.
 for(const r of recipes){add(2,'if '+m(r,'cooldown')+' > 0 { '+set(r,'cooldown',m(r,'cooldown')+' - 1')+' }');add(2,set(r,'signal',0));add(2,'if '+r.roundStates.map(n=>'roundState = '+n).join(' || ')+' { '+set(r,'signal','('+r.condition+') != 0')+' }');}
 for(const r of recipes){
  add(2,'if '+group('owner')+' = '+r.token+' {');add(4,set(r,'timer',m(r,'timer')+' - 1'));
  const expired=m(r,'timer')+' <= 0'+(r.interruptPolicy==='return-on-false'?' || !'+m(r,'signal'):'');
  add(4,'if '+expired+' {');add(6,r.returnCode);if(r.musicReturnCode){add(6,'if '+group('musicOwner')+' = '+r.token+' && ('+require('./stage_reaction_music').owns(r.namespace)+') { '+r.musicReturnCode+' } else { '+set(r,'musicConflict',1)+' }');}if(r.musicCode)add(6,gs('musicOwner',0));add(6,set(r,'active',0));add(6,set(r,'cooldown',r.cooldown));add(6,gs('owner',0));add(6,gs('priority',0));add(6,gs('locked',0));add(4,'}');add(2,'}');
 }
 add(2,gs('candidate',0));
 // Highest priority first; equal priority has stable namespace ordering. A
 // running member wins every tie. An uninterruptible member owns its full hold.
 for(const r of [...recipes].sort((a,b)=>b.priority-a.priority||a.namespace.localeCompare(b.namespace))){
  const eligible=m(r,'signal')+' && !'+m(r,'last')+' && !'+m(r,'cooldown')+(r.oncePerRound?' && !'+m(r,'used'):'');
  add(2,'if !'+group('candidate')+' && ('+eligible+') && (!'+group('owner')+' || (!'+group('locked')+' && '+r.priority+' > '+group('priority')+')) { '+gs('candidate',r.token)+' }');
 }
 add(2,'if '+group('candidate')+' {');
 // Preemption cancels the old member without Return, so it cannot overwrite the
 // winner's presentation. No queue/resume or cross-owner map bus is invented.
 for(const r of recipes)add(4,'if '+group('owner')+' = '+r.token+' { '+set(r,'active',0)+' '+set(r,'timer',0)+' '+set(r,'cooldown',r.cooldown)+' }');
 for(const r of recipes){add(4,'if '+group('candidate')+' = '+r.token+' {');add(6,r.reactCode);if(r.soundCode)add(6,r.soundCode);if(r.musicCode){add(6,r.musicCode);for(const line of require('./stage_reaction_music').snapshot(r.namespace))add(6,line);add(6,gs('musicOwner',r.token));add(6,set(r,'musicConflict',0));}add(6,gs('owner',r.token));add(6,gs('priority',r.priority));add(6,gs('locked',r.interruptPolicy==='finish'?1:0));add(6,set(r,'active',1));add(6,set(r,'timer',r.duration));add(6,set(r,'used',1));add(4,'}');}
 add(2,'}');for(const r of recipes)add(2,set(r,'last',m(r,'signal')));add(2,gs('previousRoundState','roundState'));add(0,'}');return lines.join('\n');
}
function buildGroup({ownerText,ownerFilename,ownerSources,foreignOwnerSources=[],stageTargets=[],stageText,target,identity,recipe,operation='new',offset}){
 const key='ikm_rg_'+hash(JSON.stringify({target,identity:{namespace:identity.namespace,values:identity.values}})).slice(0,12),header=PREFIX+key+' ',end='# End IKEMaker managed reaction group '+key;
 for(const source of [...ownerSources,...foreignOwnerSources])for(const match of source.text.matchAll(/# IKEMaker managed reaction group v1 (ikm_rg_[a-f0-9]{12}) ([^\r\n]+)/g)){
  let record;try{record=JSON.parse(match[2]);}catch{throw Error('Managed reaction metadata needs explicit source repair.');}
  if(record.guard!==identity.guard)continue;
  const old=record.target,physical=old&&stageTargets.find(t=>t.id===old.id&&t.index===old.index&&t.name===old.name&&t.type===old.type);
  if(!physical)throw Error('A managed BG target was renamed or renumbered. Repair/migrate its owned reaction group explicitly in source.');
  if(old.reactionKind==='visibility'&&!require('./stage_reaction_plan').visibilityGates(stageText,physical.physical).some(g=>g.id===old.visibilityControllerId))throw Error('A managed visibility gate changed. Repair its owned reaction group explicitly in source.');
 }
 const matches=[];for(const source of [...ownerSources,...foreignOwnerSources]){
  const start=source.text.indexOf(header);if(start<0)continue;
  if(source.text.indexOf(header,start+header.length)>=0)throw Error('Duplicate managed reaction groups require source review.');
  const lineEnd=source.text.indexOf('\n',start),last=source.text.indexOf(end,lineEnd);if(lineEnd<0||last<0)throw Error('Incomplete managed reaction group; preserve authored source.');
  let record;try{record=JSON.parse(source.text.slice(start+header.length,lineEnd).trim());}catch{throw Error('Managed reaction metadata changed; review source.');}
  const body=source.text.slice(lineEnd+1,last).replace(/\r\n/g,'\n').replace(/\n$/,'');
  if(!Array.isArray(record.recipes)||hash(JSON.stringify({target:record.target,recipes:record.recipes})+'\0'+body)!==record.hash||body!==render(key,record.guard,record.recipes))throw Error('Managed reaction block was edited; review source instead of replacing it.');
  matches.push({source,start,lineEnd,last,record,body});
 }
 if(matches.length>1)throw Error('This target has managed reactions in multiple owners/files. Consolidate them explicitly before arbitration.');
 const existing=matches[0];if(existing&&existing.source.filename!==ownerFilename)throw Error('This priority group belongs to '+existing.source.filename+'. Choose that exact owner/source.');
 if(!existing&&ownerSources.some(s=>s.text.includes(key)))throw Error('Generated priority map namespace collides with authored source.');
 const property=target.reactionKind==='animation'?/\bactionno\s*:/i:target.reactionKind==='position'?/\bstart\.[xy]\s*:/i:null;
 for(const source of [...ownerSources,...foreignOwnerSources]){
  let text=source.text;if(existing&&source.filename===existing.source.filename)text=text.slice(0,existing.start)+text.slice(existing.last+end.length);
  const code=require('./viewer_used_by_model').mask(text,true).replace(/#[^\r\n]*/g,s=>' '.repeat(s.length));
  if(recipe.musicCode&&/\b(?:playBgm|modifyBgm)\s*\{/i.test(code))throw Error('Global event music already has another source owner/group. Coordinate music in that exact managed group or review authored PlayBGM/ModifyBGM source explicitly.');
  for(const match of code.matchAll(/\b(modifyStageBG|modifyBGCtrl)\s*\{([^{}]*)\}/gi)){
   const type=match[1].toLowerCase(),body=match[2];if(target.reactionKind==='visibility'?(type!=='modifybgctrl'):(type!=='modifystagebg'||!property.test(body)))continue;
   const param=name=>{const m=new RegExp('(?:^|;)\\s*'+name+'\\s*:\\s*([^;]+)','i').exec(body);return m?.[1].trim();},literal=value=>/^[-+]?\d+$/.test(value||'')?Number(value):null,id=literal(param('id')),index=literal(param('index'));
   const conflicts=target.reactionKind==='visibility'?(id===null||id<0||id===target.visibilityControllerId):(id===null||id<0||id===target.id&&(index===null||index<0||index===target.index));
   if(conflicts)throw Error('An authored/legacy BG writer outside this managed group needs explicit source ownership review before priority arbitration: '+source.filename+'. A managed target may have been renamed/renumbered; choose its original target or explicitly repair/migrate the owned group in source.');
  }
 }
 const recipes=existing?[...existing.record.recipes]:[],memberAt=recipes.findIndex(r=>r.namespace===recipe.namespace);
 if(!['new','update','remove'].includes(operation)||operation!=='new'&&memberAt<0)throw Error('Choose an exact existing managed reaction to update/remove.');
 if(operation==='new'&&recipes.some(r=>r.namespace===recipe.namespace||r.token===recipe.token))throw Error('Reaction namespace/token collision. Choose a new reviewed name.');
 if(operation!=='remove'&&recipes.some(r=>r.resetCode!==recipe.resetCode))throw Error('Authored baseline changed since this group was generated. Review reset ownership in source.');
 if(operation==='new')recipes.push(recipe);else if(operation==='update')recipes.splice(memberAt,1,recipe);else recipes.splice(memberAt,1);
 const guard=identity.guard,body=recipes.length?render(key,guard,recipes):'',record={guard,target,recipes,hash:hash(JSON.stringify({target,recipes})+'\0'+body)},eol=ownerText.includes('\r\n')?'\r\n':'\n',text=recipes.length?(header+JSON.stringify(record)+'\n'+body+'\n'+end+'\n').replace(/\n/g,eol):'';
 const edit=existing?{offset:existing.start,deleteCount:existing.last+end.length-existing.start,text}:{offset,deleteCount:0,text:eol+text};
 return {key,edit,members:recipes.map(r=>({namespace:r.namespace,priority:r.priority,interruptPolicy:r.interruptPolicy})),recipes};
}
function inspectMembers(text,guard,target){
 const members=[];for(const match of text.matchAll(/# IKEMaker managed reaction group v1 (ikm_rg_[a-f0-9]{12}) ([^\r\n]+)/g)){
  const record=JSON.parse(match[2]);if(record.guard!==guard||!record.target||['id','index','name','type'].some(k=>record.target[k]!==target[k]))continue;
  const start=match.index+match[0].length,end=text.indexOf('# End IKEMaker managed reaction group '+match[1],start),body=text.slice(start,end).replace(/^\r?\n/,'').replace(/\r\n/g,'\n').replace(/\n$/,'');
  if(end<0||hash(JSON.stringify({target:record.target,recipes:record.recipes})+'\0'+body)!==record.hash||body!==render(match[1],guard,record.recipes))throw Error('Managed reaction was edited; inspect/repair source instead of overwriting it.');
  for(const recipe of record.recipes)if(recipe.parameters)members.push({id:recipe.namespace,label:recipe.namespace+' · priority '+recipe.priority,parameters:recipe.parameters,condition:recipe.condition,roundStates:recipe.roundStates,duration:recipe.duration,cooldown:recipe.cooldown,oncePerRound:recipe.oncePerRound,priority:recipe.priority,interruptPolicy:recipe.interruptPolicy,soundReceipt:recipe.soundReceipt||null,musicReceipt:recipe.musicReceipt||null});
 }return members;
}
module.exports={buildGroup,render,inspectMembers};
