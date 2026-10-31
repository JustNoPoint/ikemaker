'use strict';

const path=require('path');
const {hash}=require('./mutation_safety');
const {parseStateSource}=require('./state_transfer_model');
const {resolveHelperHandoff}=require('./helper_handoff');
const {MAX_DEF_BYTES}=require('./projectile_air_authority');
const {exactStateNumber,buildStateDestinationSnapshot,findUniqueStateDestination}=require('./exact_state_destination_authority');

const canonical=value=>path.resolve(String(value||'')).toLowerCase();
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function componentIdentity(component){return hash(JSON.stringify({kind:component?.kind,defPath:canonical(component?.reference?.defPath),filename:canonical(component?.filename),startLine:component?.startLine,endLine:component?.endLine,sourceHash:component?.sourceHash,rangeHash:component?.rangeHash,stableId:component?.stableId}));}
const unavailable=(expression,reason)=>freeze({available:false,expression:String(expression||''),reason});
function sameControllerRange(transfer,handoff,text){
 if(transfer.controllerStart!==handoff.startIndex||transfer.controllerEnd<handoff.endIndex)return false;
 return !String(text).slice(handoff.endIndex,transfer.controllerEnd).trim();
}
function snapshotMatchesContext(snapshot,context){
 if(context.inventoryComplete!==true||!Array.isArray(context.assignedSources)||!Array.isArray(context.sources)||context.assignedSources.length!==snapshot?.sources?.length||context.sources.length!==snapshot.sources.length)return false;
 return snapshot.sources.every((source,index)=>canonical(source.filename)===canonical(context.assignedSources[index])&&canonical(source.filename)===canonical(context.sources[index]?.filename)&&source.sourceHash===hash(String(context.sources[index]?.text??''))&&context.sources[index]?.available===true);
}

function buildHelperStateAuthority(component,context={}){
 const none=(expression,reason)=>freeze({publicState:unavailable(expression,reason),authorities:new Map(),evidence:null});
 if(component?.kind!=='helper')return none('','The exact Helper creation controller is unavailable.');
 if(context.defDirty)return none('','Save or revert the character DEF before exact state navigation.');
 const defPath=path.resolve(context.defPath||''),defText=String(context.defText??'');if(!defPath||!defText||Buffer.byteLength(defText,'utf8')>MAX_DEF_BYTES)return none('','The character DEF is unavailable or exceeds the exact-assignment limit.');
 const snapshot=context.stateSnapshot||buildStateDestinationSnapshot(context),sources=snapshot?.sources;if(!sources||!snapshotMatchesContext(snapshot,context))return none('','The complete assigned state-source inventory is unavailable, stale, or exceeds its bounded inspection limit.');
 const source=sources.find(item=>canonical(item.filename)===canonical(component.filename));if(!source||source.sourceHash!==component.sourceHash||String(context.sourceText??'')!==source.text)return none('','The Helper source is no longer one exact assigned state source.');
 const handoff=resolveHelperHandoff(component,{defPath,assignedFiles:context.assignedSources,sourceText:source.text,allowDynamicId:true});if(!handoff)return none('','The exact authored Helper creation controller could not be proven.');
 const parsedSource=parseStateSource(source.text,source.filename,component.syntax==='cns'?'ikemen-cns':'zss'),transfers=parsedSource.transfers.filter(item=>item.kind==='helper'&&String(item.field).toLowerCase()==='stateno'&&sameControllerRange(item,handoff.evidence,source.text));
 if(transfers.length!==1)return none('',transfers.length?'The Helper has multiple starting-state fields; resolve them in source first.':'No exact authored Helper starting state was found.');
 const transfer=transfers[0],expression=String(transfer.expression||'');if(transfer.dynamic||transfer.ambiguous||transfer.malformed||transfer.structurallyInvalid||transfer.redirected)return none(expression,'The Helper starting state is dynamic, ambiguous, malformed, or redirected.');
 const state=exactStateNumber(expression);if(!state||transfer.literal!==state.number)return none(expression,'Only an authored nonnegative static safe-integer starting state can be opened exactly.');
 const found=findUniqueStateDestination(snapshot,state.number);if(!found.match)return none(expression,found.matches.length?'The assigned sources contain duplicate matching StateDef declarations.':`StateDef ${state.number} is absent from the complete assigned source set.`);
 const target=found.match,declarationText=target.source.text.slice(target.declaration.start,target.declaration.end),route=String(context.token?.(state)||'');if(!/^[0-9a-f]{48}$/.test(route))return none(expression,'Exact state navigation authority could not be issued.');
 const evidence=freeze({componentIdentity:componentIdentity(component),handoff:handoff.evidence}),authority=freeze({schema:'ikemaker.helper-state-route',version:1,route,generation:Number(context.generation),componentIdentity:evidence.componentIdentity,expression:state.expression,state:state.number,defPath,defHash:hash(defText),inventoryHash:snapshot.inventoryHash,evidence,targetPath:target.source.filename,targetHash:target.source.sourceHash,targetSyntax:target.source.syntax,targetStart:target.declaration.start,targetEnd:target.declaration.end,targetLine:target.declaration.line,targetRangeHash:hash(declarationText)}),authorities=new Map([[route,authority]]);
 return freeze({publicState:freeze({available:true,state:state.number,file:path.basename(target.source.filename),line:target.declaration.line,route}),authorities,evidence});
}

function validateHelperStateAuthority(authority,component,context={}){
 if(authority?.schema!=='ikemaker.helper-state-route'||authority.version!==1||authority.generation!==Number(context.generation)||componentIdentity(component)!==authority.componentIdentity)return null;
 const rebuilt=buildHelperStateAuthority(component,{...context,token:state=>state.expression===authority.expression&&state.number===authority.state?authority.route:'0'.repeat(48)}),candidate=rebuilt.authorities.get(authority.route);if(!candidate)return null;
 for(const key of ['componentIdentity','expression','state','defPath','defHash','inventoryHash','targetPath','targetHash','targetSyntax','targetStart','targetEnd','targetLine','targetRangeHash'])if(candidate[key]!==authority[key])return null;if(JSON.stringify(candidate.evidence)!==JSON.stringify(authority.evidence))return null;return candidate;
}

module.exports={componentIdentity,buildHelperStateAuthority,validateHelperStateAuthority};
