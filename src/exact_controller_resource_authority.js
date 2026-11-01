'use strict';

const path=require('path');
const {hash}=require('./mutation_safety');
const {lineSlice}=require('./projectile_property_projection');
const {specialistComponentModel}=require('./move_lab_component_model');
const {componentIdentity:projectileComponentIdentity}=require('./projectile_air_authority');
const {parseHitDefs}=require('./hitdef_model');
const {createProjectileEditDraft}=require('./projectile_edit_draft');
const {parseReference}=require('./projectile_resource_authority');

const MAX_SOURCE_BYTES=4*1024*1024;
const canonical=value=>path.resolve(String(value||'')).toLowerCase();
const hitDefSignature=(text,block)=>hash(String(text).slice(block.start,block.end).replace(/\r\n?/g,'\n').trim());
function hitDefIdentity(evidence){return hash(JSON.stringify({kind:'hitdef',defPath:canonical(evidence.defPath),filename:canonical(evidence.sourcePath),syntax:evidence.syntax,sourceHash:evidence.sourceHash,startOffset:evidence.startOffset,endOffset:evidence.endOffset,rangeHash:evidence.rangeHash,signature:evidence.signature,occurrence:evidence.occurrence}));}
function common(evidence,context){
 const sourceText=String(context.sourceText??''),sourcePath=path.resolve(context.sourcePath||evidence?.sourcePath||'');if(!evidence||!['projectile','hitdef'].includes(evidence.kind)||!['cns','zss'].includes(evidence.syntax)||!sourcePath||canonical(sourcePath)!==canonical(evidence.sourcePath))return null;if(!sourceText||Buffer.byteLength(sourceText,'utf8')>MAX_SOURCE_BYTES||hash(sourceText)!==evidence.sourceHash)return null;const assigned=(context.assignedSources||[]).map(canonical);if(!assigned.includes(canonical(sourcePath)))return null;return{sourceText,sourcePath};
}
function proveExactController(evidence,context={}){
 const base=common(evidence,context);if(!base)return null;const {sourceText,sourcePath}=base,defPath=path.resolve(context.defPath||evidence.defPath||'');if(!defPath||canonical(defPath)!==canonical(evidence.defPath))return null;
 if(evidence.kind==='projectile'){
  if(!Number.isSafeInteger(evidence.startLine)||!Number.isSafeInteger(evidence.endLine)||evidence.startLine<0||evidence.endLine<evidence.startLine)return null;const bounds=lineSlice(sourceText,evidence.startLine,evidence.endLine);if(!bounds||hash(bounds.text)!==evidence.rangeHash)return null;const openDocument=context.sourceDocument&&canonical(context.sourceDocument.fileName)===canonical(sourcePath)?[context.sourceDocument]:[],matches=specialistComponentModel({defPath,folder:path.dirname(defPath),code:[sourcePath]},openDocument,[]).components.filter(item=>item.kind==='projectile'&&item.syntax===evidence.syntax&&item.startLine===evidence.startLine&&item.endLine===evidence.endLine&&item.sourceHash===evidence.sourceHash&&item.rangeHash===evidence.rangeHash&&item.sourceText===bounds.text&&projectileComponentIdentity(item)===evidence.identity);return matches.length===1?Object.freeze({kind:'projectile',component:matches[0],controllerText:bounds.text}):null;
 }
 if(!Number.isSafeInteger(evidence.startOffset)||!Number.isSafeInteger(evidence.endOffset)||evidence.startOffset<0||evidence.endOffset<=evidence.startOffset||evidence.endOffset>sourceText.length||!Number.isSafeInteger(evidence.occurrence)||evidence.occurrence<0)return null;const controllerText=sourceText.slice(evidence.startOffset,evidence.endOffset);if(hash(controllerText)!==evidence.rangeHash)return null;const blocks=parseHitDefs(sourceText,evidence.syntax),matches=blocks.map((block,index)=>({block,index,signature:hitDefSignature(sourceText,block),occurrence:blocks.slice(0,index).filter(item=>hitDefSignature(sourceText,item)===hitDefSignature(sourceText,block)).length})).filter(item=>item.block.start===evidence.startOffset&&item.block.end===evidence.endOffset&&item.signature===evidence.signature&&item.occurrence===evidence.occurrence);if(matches.length!==1||hitDefIdentity(evidence)!==evidence.identity)return null;return Object.freeze({kind:'hitdef',block:matches[0].block,index:matches[0].index,controllerText});
}
function proveControllerResourceReference(proven,origin,sourceText=''){
 if(!proven||origin?.resourceField!==true||origin.controllerKind!==proven.kind||!['sparkno','guard.sparkno','hitsound','guardsound'].includes(origin.field)||typeof origin.expression!=='string')return null;
 let expression='';if(proven.kind==='projectile'){const field=createProjectileEditDraft(proven.component,String(sourceText))?.fields?.find(item=>item.target===origin.field);if(!field||field.status!=='ready'||!field.editable)return null;expression=field.expression;}else{const block=proven.block;if(!block?.entries?.[origin.field]||(block.duplicates||[]).includes(origin.field))return null;expression=block.entries[origin.field].value;}
 if(expression!==origin.expression)return null;return parseReference(origin.field,expression);
}

module.exports={MAX_SOURCE_BYTES,hitDefSignature,hitDefIdentity,proveExactController,proveControllerResourceReference};
