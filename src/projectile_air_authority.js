'use strict';

const path=require('path');
const {hash}=require('./mutation_safety');
const {parseAir}=require('./air_preview_model');

const MAX_DEF_BYTES=1024*1024,MAX_SOURCE_BYTES=4*1024*1024,MAX_AIR_BYTES=16*1024*1024;
const ANIMATION_FIELDS=Object.freeze(['projanim','projhitanim','projremanim','projcancelanim']);
const canonical=value=>path.resolve(String(value||'')).toLowerCase();
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function componentIdentity(component){return hash(JSON.stringify({kind:component?.kind,defPath:canonical(component?.reference?.defPath),filename:canonical(component?.filename),startLine:component?.startLine,endLine:component?.endLine,sourceHash:component?.sourceHash,rangeHash:component?.rangeHash,stableId:component?.stableId}));}
function reasonFor(field){if(!field)return'Animation property is unavailable.';if(field.status==='duplicate')return`${field.authoredName} is duplicated and unresolved.`;if(field.status==='omitted')return`${field.authoredName} is omitted.`;return`${field.authoredName} is dynamic and no exact AIR action is proven.`;}
function buildProjectileAirAuthorities(component,projection,context={}){
 const publicFields={},authorities=new Map(),defText=String(context.defText??''),airText=String(context.airText??''),sourceText=String(context.sourceText??''),defPath=path.resolve(context.defPath||''),airPath=path.resolve(context.airPath||''),generation=Number(context.generation),assignedSources=(context.assignedSources||[]).map(canonical);
 const failAll=reason=>{for(const name of ANIMATION_FIELDS){const field=projection?.fields?.find(item=>item.name===name);publicFields[name]={available:false,action:field?.value??null,reason};}return freeze({publicFields,authorities});};
 if(component?.kind!=='projectile'||projection?.status!=='ready')return failAll('The exact Projectile projection is unavailable.');
 if(context.defDirty)return failAll('Save or revert the character DEF before opening an exact assigned AIR action.');
 if(!defPath||Buffer.byteLength(defText,'utf8')>MAX_DEF_BYTES)return failAll('The character DEF is unavailable or exceeds the exact-assignment limit.');
 if(!assignedSources.includes(canonical(component.filename)))return failAll('The Projectile source is no longer an assigned state source.');
 if(!sourceText||Buffer.byteLength(sourceText,'utf8')>MAX_SOURCE_BYTES||hash(sourceText)!==component.sourceHash)return failAll('The exact Projectile source is stale or exceeds the inspection limit.');
 if(!airPath||!airText||Buffer.byteLength(airText,'utf8')>MAX_AIR_BYTES)return failAll('The assigned AIR is unavailable or exceeds the exact-navigation limit.');
 const cached=context.previewCache?.airActions,actions=cached?.text===airText?cached.actions:parseAir(airText),identity=componentIdentity(component),defHash=hash(defText),airHash=hash(airText);if(context.previewCache&&cached?.text!==airText)context.previewCache.airActions={text:airText,actions};
 for(const name of ANIMATION_FIELDS){const field=projection.fields.find(item=>item.name===name);if(!field?.navigable){publicFields[name]={available:false,action:field?.value??null,reason:reasonFor(field)};continue;}const matches=actions.filter(item=>item.number===field.value);if(matches.length!==1){publicFields[name]={available:false,action:field.value,reason:matches.length?`Assigned AIR has multiple Action ${field.value} blocks, so exact navigation is ambiguous.`:`Assigned AIR has no Action ${field.value}.`};continue;}const action=matches[0],route=String(context.token?.(name,field.value)||'');if(!/^[0-9a-f]{48}$/.test(route)){publicFields[name]={available:false,action:field.value,reason:'Exact navigation authority could not be issued.'};continue;}const authority=freeze({schema:'ikemaker.projectile-air-route',version:1,route,generation,componentIdentity:identity,field:name,action:action.number,defPath,defHash,sourcePath:path.resolve(component.filename),sourceHash:component.sourceHash,startLine:component.startLine,endLine:component.endLine,rangeHash:component.rangeHash,airPath,airHash,line:action.line,actionHash:hash(JSON.stringify(action))});authorities.set(route,authority);publicFields[name]={available:true,action:action.number,file:path.basename(airPath),line:action.line,route};}
 return freeze({publicFields,authorities});
}
function validateProjectileAirAuthority(authority,component,projection,context={}){
 if(authority?.schema!=='ikemaker.projectile-air-route'||authority.version!==1||authority.generation!==Number(context.generation)||componentIdentity(component)!==authority.componentIdentity)return null;
 const rebuilt=buildProjectileAirAuthorities(component,projection,{...context,token:(field,action)=>field===authority.field&&action===authority.action?authority.route:'0'.repeat(48)}),candidate=rebuilt.authorities.get(authority.route);
 if(!candidate)return null;for(const key of ['componentIdentity','field','action','defPath','defHash','sourcePath','sourceHash','startLine','endLine','rangeHash','airPath','airHash','line','actionHash'])if(candidate[key]!==authority[key])return null;return candidate;
}

module.exports={MAX_DEF_BYTES,MAX_SOURCE_BYTES,MAX_AIR_BYTES,ANIMATION_FIELDS,componentIdentity,buildProjectileAirAuthorities,validateProjectileAirAuthority};
