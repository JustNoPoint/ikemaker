'use strict';

const path=require('path');
const {hash}=require('./mutation_safety');
const {inspectSource}=require('./helper_authoring_model');

const MAX_SOURCE_BYTES=4*1024*1024;
const canonical=value=>path.resolve(String(value||'')).toLowerCase();
function lineBounds(text,startLine,endLine){const starts=[0];for(let at=0;at<text.length;at++)if(text[at]==='\n')starts.push(at+1);if(startLine<0||endLine<startLine||startLine>=starts.length)return null;const start=starts[startLine],next=starts[endLine+1]??text.length;let end=next;while(end>start&&(text[end-1]==='\n'||text[end-1]==='\r'))end--;return{start,end,text:text.slice(start,end)};}
function resolveHelperHandoff(component,{defPath,assignedFiles,sourceText,allowDynamicId=false}={}){
 if(!component||component.kind!=='helper'||!component.reference||canonical(component.reference.defPath)!==canonical(defPath))return null;
 const filename=path.resolve(component.filename||''),admitted=new Set((assignedFiles||[]).map(canonical));if(!admitted.has(canonical(filename)))return null;
 const text=String(sourceText??'');if(!text||Buffer.byteLength(text,'utf8')>MAX_SOURCE_BYTES||hash(text)!==component.sourceHash)return null;
 const bounds=lineBounds(text,component.startLine,component.endLine);if(!bounds||bounds.text!==component.sourceText||hash(bounds.text)!==component.rangeHash)return null;
 let inspected;try{inspected=inspectSource({filename,text});}catch(_){return null;}
 const matches=inspected.spawns.filter(node=>node.syntax===component.syntax&&node.startIndex>=bounds.start&&!text.slice(bounds.start,node.startIndex).trim()&&(
  node.endIndex<=bounds.end?!text.slice(node.endIndex,bounds.end).trim():!text.slice(bounds.end,node.endIndex).trim()
 ));
 if(matches.length!==1||(!allowDynamicId&&matches[0].dynamicId))return null;
 const node=matches[0],endIndex=Math.min(node.endIndex,bounds.end);return Object.freeze({defPath:path.resolve(defPath),view:'create',mode:'basic',editingUid:node.uid,evidence:Object.freeze({filename,sourceHash:hash(text),startIndex:node.startIndex,endIndex,controllerHash:hash(text.slice(node.startIndex,endIndex)),syntax:node.syntax})});
}

module.exports={MAX_SOURCE_BYTES,lineBounds,resolveHelperHandoff};
