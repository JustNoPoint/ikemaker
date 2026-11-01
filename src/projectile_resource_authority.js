'use strict';

const path=require('path');
const {hash}=require('./mutation_safety');
const {parseAir}=require('./air_preview_model');
const {parseSndBuffer}=require('./snd_reader');
const {componentIdentity,MAX_DEF_BYTES,MAX_SOURCE_BYTES,MAX_AIR_BYTES}=require('./projectile_air_authority');

const MAX_SND_BYTES=64*1024*1024;
const RESOURCE_FIELDS=Object.freeze(['sparkno','guard.sparkno','hitsound','guardsound']);
const canonical=value=>path.resolve(String(value||'')).toLowerCase();
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function parseReference(target,expression){
 const text=String(expression||'').trim();if(!/^s/i.test(text))return{scope:'engine-common'};
 if(['sparkno','guard.sparkno'].includes(target)){const match=/^s([+-]?\d+)$/i.exec(text);if(!match)return null;const action=Number(match[1]);return Number.isSafeInteger(action)&&action>=0?{kind:'air',action,expression:text}:null;}
 const match=/^s([+-]?\d+)\s*,\s*([+-]?\d+)$/i.exec(text);if(!match)return null;const group=Number(match[1]),index=Number(match[2]);return Number.isSafeInteger(group)&&group>=0&&Number.isSafeInteger(index)&&index>=0?{kind:'snd',group,index,expression:text}:null;
}
function unavailable(field,reason,scope='unresolved'){return freeze({available:false,scope,expression:String(field?.expression||''),reason});}
function buildProjectileResourceAuthorities(component,draft,context={}){
 const publicFields={},authorities=new Map(),generation=Number(context.generation),defText=String(context.defText??''),sourceText=String(context.sourceText??''),airText=String(context.airText??''),sndBuffer=Buffer.isBuffer(context.sndBuffer)?context.sndBuffer:null,defPath=path.resolve(context.defPath||''),airPath=path.resolve(context.airPath||''),sndPath=path.resolve(context.sndPath||''),assignedSources=(context.assignedSources||[]).map(canonical);
 const fields=new Map((draft?.fields||[]).filter(field=>RESOURCE_FIELDS.includes(field.target)).map(field=>[field.target,field]));
 const failAll=reason=>{for(const target of RESOURCE_FIELDS){const field=fields.get(target);if(field&&field.status!=='omitted')publicFields[target]=unavailable(field,reason);}return freeze({publicFields,authorities});};
 if(component?.kind!=='projectile'||!draft)return failAll('The exact Projectile edit model is unavailable.');
 if(context.defDirty)return failAll('Save or revert the character DEF before opening an exact assigned resource.');
 if(!defPath||!defText||Buffer.byteLength(defText,'utf8')>MAX_DEF_BYTES)return failAll('The character DEF is unavailable or exceeds the exact-assignment limit.');
 if(!assignedSources.includes(canonical(component.filename)))return failAll('The Projectile source is no longer assigned by this character DEF.');
 if(!sourceText||Buffer.byteLength(sourceText,'utf8')>MAX_SOURCE_BYTES||hash(sourceText)!==component.sourceHash)return failAll('The exact Projectile source is stale or exceeds the inspection limit.');
 let actions=null,archive=null;const identity=componentIdentity(component),defHash=hash(defText),airHash=airText?hash(airText):'',sndHash=sndBuffer?hash(sndBuffer):'';
 for(const target of RESOURCE_FIELDS){const field=fields.get(target);if(!field||field.status==='omitted')continue;if(field.status!=='ready'||!field.editable){publicFields[target]=unavailable(field,field.reason||'The authored expression is not an exact editable literal.');continue;}const parsed=parseReference(target,field.expression);if(parsed?.scope==='engine-common'){publicFields[target]=unavailable(field,'This value uses the engine-common resource scope; no character-local file is inferred.','engine-common');continue;}if(!parsed){publicFields[target]=unavailable(field,'The authored character-local resource identity is invalid.');continue;}
  let targetEvidence={};if(parsed.kind==='air'){if(!airPath||!airText||Buffer.byteLength(airText,'utf8')>MAX_AIR_BYTES){publicFields[target]=unavailable(field,'The character DEF’s assigned AIR is unavailable or exceeds the exact-navigation limit.');continue;}actions ||= parseAir(airText);const matches=actions.filter(item=>item.number===parsed.action);if(matches.length!==1){publicFields[target]=unavailable(field,matches.length?'The assigned AIR contains duplicate matching actions.':`The assigned AIR has no Action ${parsed.action}.`);continue;}targetEvidence={targetPath:airPath,targetHash:airHash,action:parsed.action,line:matches[0].line,targetIdentityHash:hash(JSON.stringify(matches[0]))};}
  else{if(!sndPath||!sndBuffer||sndBuffer.length>MAX_SND_BYTES){publicFields[target]=unavailable(field,'The character DEF’s assigned SND is unavailable or exceeds the exact-navigation limit.');continue;}try{archive ||= parseSndBuffer(sndBuffer,sndPath);}catch(_){publicFields[target]=unavailable(field,'The assigned SND could not be parsed exactly.');continue;}const matches=archive.entries.filter(item=>item.group===parsed.group&&item.index===parsed.index);if(matches.length!==1){publicFields[target]=unavailable(field,matches.length?'The assigned SND contains duplicate matching sound identities.':`The assigned SND has no sound ${parsed.group},${parsed.index}.`);continue;}targetEvidence={targetPath:sndPath,targetHash:sndHash,group:parsed.group,index:parsed.index,archiveIndex:matches[0].archiveIndex,targetIdentityHash:hash(JSON.stringify({group:matches[0].group,index:matches[0].index,archiveIndex:matches[0].archiveIndex,subheaderOffset:matches[0].subheaderOffset,dataOffset:matches[0].dataOffset,dataSize:matches[0].dataSize}))};}
  const route=String(context.token?.(target,parsed)||'');if(!/^[0-9a-f]{48}$/.test(route)){publicFields[target]=unavailable(field,'Exact navigation authority could not be issued.');continue;}const authority=freeze({schema:'ikemaker.projectile-resource-route',version:1,route,generation,kind:parsed.kind,componentIdentity:identity,field:target,expression:parsed.expression,syntax:component.syntax,defPath,defHash,sourcePath:path.resolve(component.filename),sourceHash:component.sourceHash,startLine:component.startLine,endLine:component.endLine,rangeHash:component.rangeHash,...targetEvidence});authorities.set(route,authority);publicFields[target]=freeze({available:true,scope:'character-local',kind:parsed.kind,expression:parsed.expression,file:path.basename(targetEvidence.targetPath),action:parsed.action,group:parsed.group,index:parsed.index,route});
 }
 return freeze({publicFields,authorities});
}
function validateProjectileResourceAuthority(authority,component,draft,context={}){
 if(authority?.schema!=='ikemaker.projectile-resource-route'||authority.version!==1||authority.generation!==Number(context.generation)||componentIdentity(component)!==authority.componentIdentity)return null;
 const rebuilt=buildProjectileResourceAuthorities(component,draft,{...context,token:(field,parsed)=>field===authority.field&&parsed.kind===authority.kind&&String(parsed.expression)===authority.expression?authority.route:'0'.repeat(48)}),candidate=rebuilt.authorities.get(authority.route);if(!candidate)return null;
 for(const key of ['kind','componentIdentity','field','expression','syntax','defPath','defHash','sourcePath','sourceHash','startLine','endLine','rangeHash','targetPath','targetHash','action','line','group','index','archiveIndex','targetIdentityHash'])if(candidate[key]!==authority[key])return null;return candidate;
}

module.exports={MAX_SND_BYTES,RESOURCE_FIELDS,parseReference,buildProjectileResourceAuthorities,validateProjectileResourceAuthority};
