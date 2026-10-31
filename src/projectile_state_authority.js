'use strict';

const path=require('path');
const {hash}=require('./mutation_safety');
const {componentIdentity,MAX_DEF_BYTES}=require('./projectile_air_authority');
const {proveExactController}=require('./exact_controller_resource_authority');
const {exactStateNumber,buildStateDestinationSnapshot,findUniqueStateDestination}=require('./exact_state_destination_authority');

const STATE_FIELDS=Object.freeze(['p1stateno','p2stateno']);
const canonical=value=>path.resolve(String(value||'')).toLowerCase();
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function unavailable(field,reason){return freeze({available:false,expression:String(field?.expression||''),reason});}
function controllerEvidence(component,context){return freeze({kind:'projectile',identity:componentIdentity(component),defPath:path.resolve(context.defPath),sourcePath:path.resolve(component.filename),syntax:component.syntax,sourceHash:component.sourceHash,startLine:component.startLine,endLine:component.endLine,rangeHash:component.rangeHash});}

function buildProjectileStateAuthorities(component,draft,context={}){
 const publicFields={},authorities=new Map(),fields=new Map((draft?.fields||[]).filter(field=>STATE_FIELDS.includes(field.target)).map(field=>[field.target,field])),failAll=reason=>{for(const target of STATE_FIELDS){const field=fields.get(target);if(field&&field.status!=='omitted')publicFields[target]=unavailable(field,reason);}return freeze({publicFields,authorities,evidence:null});};
 if(component?.kind!=='projectile'||!draft)return failAll('The exact Projectile edit model is unavailable.');
 if(context.defDirty)return failAll('Save or revert the character DEF before exact state navigation.');
 const defPath=path.resolve(context.defPath||''),defText=String(context.defText??'');if(!defPath||!defText||Buffer.byteLength(defText,'utf8')>MAX_DEF_BYTES)return failAll('The character DEF is unavailable or exceeds the exact-assignment limit.');
 const snapshot=context.stateSnapshot||buildStateDestinationSnapshot(context),sources=snapshot?.sources;if(!sources)return failAll('The complete assigned state-source inventory is unavailable or exceeds its bounded inspection limit.');
 const source=sources.find(item=>canonical(item.filename)===canonical(component.filename));if(!source||source.sourceHash!==component.sourceHash||String(context.sourceText??'')!==source.text)return failAll('The Projectile source is no longer one exact assigned state source.');
 const evidence=controllerEvidence(component,context),defHash=hash(defText),inventoryHash=snapshot.inventoryHash,generation=Number(context.generation);
 if(!proveExactController(evidence,{defPath,sourcePath:component.filename,sourceText:source.text,sourceDocument:context.sourceDocument,assignedSources:context.assignedSources}))return failAll('The exact authored Projectile controller could not be proven.');
 for(const target of STATE_FIELDS){
  const field=fields.get(target);if(!field||field.status==='omitted')continue;
  if(field.status!=='ready'||!field.editable){publicFields[target]=unavailable(field,field.reason||'The authored expression is not one exact editable literal.');continue;}
  const parsed=exactStateNumber(field.expression);if(!parsed){publicFields[target]=unavailable(field,'Only an authored nonnegative static safe-integer state can be opened exactly.');continue;}
  const found=findUniqueStateDestination(snapshot,parsed.number),matches=found.matches;if(!found.match){publicFields[target]=unavailable(field,matches.length?'The assigned sources contain duplicate matching StateDef declarations.':`StateDef ${parsed.number} is absent from the complete assigned source set.`);continue;}
  const match=found.match,declarationText=match.source.text.slice(match.declaration.start,match.declaration.end),route=String(context.token?.(target,parsed)||'');if(!/^[0-9a-f]{48}$/.test(route)){publicFields[target]=unavailable(field,'Exact state navigation authority could not be issued.');continue;}
  const authority=freeze({schema:'ikemaker.projectile-state-route',version:1,route,generation,componentIdentity:evidence.identity,field:target,expression:parsed.expression,state:parsed.number,defPath,defHash,inventoryHash,evidence,targetPath:match.source.filename,targetHash:match.source.sourceHash,targetSyntax:match.source.syntax,targetStart:match.declaration.start,targetEnd:match.declaration.end,targetLine:match.declaration.line,targetRangeHash:hash(declarationText)});
  authorities.set(route,authority);publicFields[target]=freeze({available:true,state:parsed.number,file:path.basename(match.source.filename),line:match.declaration.line,route});
 }
 return freeze({publicFields,authorities,evidence});
}

function validateProjectileStateAuthority(authority,component,draft,context={}){
 if(authority?.schema!=='ikemaker.projectile-state-route'||authority.version!==1||authority.generation!==Number(context.generation)||componentIdentity(component)!==authority.componentIdentity)return null;
 const source=context.sources?.find(item=>canonical(item.filename)===canonical(component.filename));
 if(!source?.available||!proveExactController(authority.evidence,{defPath:context.defPath,sourcePath:component.filename,sourceText:source.text,sourceDocument:context.sourceDocument,assignedSources:context.assignedSources}))return null;
 const rebuilt=buildProjectileStateAuthorities(component,draft,{...context,token:(field,parsed)=>field===authority.field&&parsed.expression===authority.expression&&parsed.number===authority.state?authority.route:'0'.repeat(48)}),candidate=rebuilt.authorities.get(authority.route);if(!candidate)return null;
 for(const key of ['componentIdentity','field','expression','state','defPath','defHash','inventoryHash','targetPath','targetHash','targetSyntax','targetStart','targetEnd','targetLine','targetRangeHash'])if(candidate[key]!==authority[key])return null;
 if(JSON.stringify(candidate.evidence)!==JSON.stringify(authority.evidence))return null;return candidate;
}

module.exports={STATE_FIELDS,buildProjectileStateAuthorities,validateProjectileStateAuthority};
