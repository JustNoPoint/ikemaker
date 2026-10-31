'use strict';

const path=require('path');
const {hash}=require('./mutation_safety');
const {specialistComponentModel}=require('./move_lab_component_model');

const MAX_SOURCE_BYTES=4*1024*1024;
const canonical=value=>path.resolve(String(value||'')).toLowerCase();
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function lineBounds(text,startLine,endLine){const starts=[0];for(let at=0;at<text.length;at++)if(text[at]==='\n')starts.push(at+1);if(startLine<0||endLine<startLine||startLine>=starts.length)return null;const start=starts[startLine],next=starts[endLine+1]??text.length;let end=next;while(end>start&&(text[end-1]==='\n'||text[end-1]==='\r'))end--;return{start,end,text:text.slice(start,end)};}
function masked(text,syntax){const chars=[...String(text||'')];let quote='',escaped=false;for(let at=0;at<chars.length;at++){const value=chars[at],next=chars[at+1];if(quote){chars[at]='x';if(escaped)escaped=false;else if(value==='\\')escaped=true;else if(value===quote)quote='';continue;}if(value==='"'||value==="'"){quote=value;chars[at]='x';continue;}if(syntax==='cns'&&value===';'||syntax==='zss'&&(value==='#'||value==='/'&&next==='/')){while(at<chars.length&&chars[at]!=='\n'&&chars[at]!=='\r')chars[at++]=' ';at--;}}return chars.join('');}
function authoredId(text,syntax){const clean=masked(text,syntax),matches=[];if(syntax==='cns'){const pattern=/^\s*id\s*=\s*([^\r\n]*)/gim;let match;while((match=pattern.exec(clean)))matches.push({start:match.index+match[0].indexOf(match[1]),length:match[1].trimEnd().length});}else{const pattern=/\bid\s*:\s*([^;}\r\n]*)/gi;let match;while((match=pattern.exec(clean)))matches.push({start:match.index+match[0].indexOf(match[1]),length:match[1].trimEnd().length});}if(matches.length>1)return null;const expression=matches.length?text.slice(matches[0].start,matches[0].start+matches[0].length).trim():'';const literal=/^[+-]?\d+$/.test(expression);return freeze({status:literal?'literal':expression?'dynamic':'omitted',expression,literal,value:literal?Number(expression):null,runtimeIdentity:literal?'candidate':'unresolved'});}
function resolveExplodHandoff(component,{defPath,assignedFiles,sourceText}={}){
 if(!component||component.kind!=='explod'||!component.reference||canonical(component.reference.defPath)!==canonical(defPath))return null;
 const owner=path.resolve(defPath||''),filename=path.resolve(component.filename||''),folder=path.dirname(owner),relative=path.relative(folder,filename),admitted=new Set((assignedFiles||[]).map(canonical));
 if(relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative)||!admitted.has(canonical(filename)))return null;
 const text=String(sourceText??'');if(!text||Buffer.byteLength(text,'utf8')>MAX_SOURCE_BYTES||hash(text)!==component.sourceHash)return null;
 const bounds=lineBounds(text,component.startLine,component.endLine);if(!bounds||bounds.text!==component.sourceText||hash(bounds.text)!==component.rangeHash)return null;
 let parsed;try{parsed=specialistComponentModel({defPath:owner,folder,code:[filename]},[{fileName:filename,isClosed:false,getText:()=>text}],[]);}catch(_){return null;}
 const matches=(parsed.components||[]).filter(item=>item.kind==='explod'&&item.startLine===component.startLine&&item.endLine===component.endLine&&item.sourceHash===component.sourceHash&&item.rangeHash===component.rangeHash&&item.sourceText===bounds.text);
 if(matches.length!==1)return null;const fresh=matches[0],id=authoredId(bounds.text,fresh.syntax);if(!id)return null;
 return freeze({schema:'ikemaker.explod-handoff',version:1,defPath:owner,mode:'explod',selection:{filename,sourceHash:hash(text),startLine:fresh.startLine,endLine:fresh.endLine,startIndex:bounds.start,endIndex:bounds.end,rangeHash:hash(bounds.text),controllerHash:hash(bounds.text),syntax:fresh.syntax,stableId:fresh.stableId,id,owner:component.owner?{...component.owner}:null,receiver:component.lifecycleConnections?.selectedRecipient?{...component.lifecycleConnections.selectedRecipient}:null,receiverHints:[...(component.receiverHints||[])]}});
}
function validateExplodHandoff(reference,{defPath,assignedFiles,sourceText}={}){
 const selection=reference?.selection;if(reference?.schema!=='ikemaker.explod-handoff'||reference.version!==1||reference.mode!=='explod'||!selection||canonical(reference.defPath)!==canonical(defPath))return null;
 const component={kind:'explod',filename:selection.filename,startLine:selection.startLine,endLine:selection.endLine,sourceHash:selection.sourceHash,rangeHash:selection.rangeHash,sourceText:String(sourceText||'').slice(selection.startIndex,selection.endIndex),owner:selection.owner,receiverHints:selection.receiverHints,reference:{defPath}};
 const fresh=resolveExplodHandoff(component,{defPath,assignedFiles,sourceText});if(!fresh)return null;const next=fresh.selection;
 if(next.filename!==path.resolve(selection.filename)||next.sourceHash!==selection.sourceHash||next.startIndex!==selection.startIndex||next.endIndex!==selection.endIndex||next.controllerHash!==selection.controllerHash||next.syntax!==selection.syntax||next.stableId!==selection.stableId||JSON.stringify(next.id)!==JSON.stringify(selection.id))return null;
 return fresh;
}

module.exports={MAX_SOURCE_BYTES,lineBounds,authoredId,resolveExplodHandoff,validateExplodHandoff};
