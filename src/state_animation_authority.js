'use strict';

const path=require('path');
const {hash}=require('./mutation_safety');
const {parseAir}=require('./air_preview_model');

const MAX_DEF_BYTES=1024*1024,MAX_SOURCE_BYTES=4*1024*1024,MAX_AIR_BYTES=16*1024*1024;
const canonical=value=>path.resolve(String(value||'')).toLowerCase();
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function componentIdentity(component){return hash(JSON.stringify({kind:component?.kind,defPath:canonical(component?.reference?.defPath),filename:canonical(component?.filename),startLine:component?.startLine,endLine:component?.endLine,sourceHash:component?.sourceHash,rangeHash:component?.rangeHash,stableId:component?.stableId,signature:component?.signature}));}
function withoutComment(line,legacy){let quote=false;for(let index=0;index<line.length;index+=1){if(line[index]==='"'&&line[index-1]!=="\\")quote=!quote;if(line[index]===(legacy?';':'#')&&!quote)return line.slice(0,index);}return line;}
function parseStateDefaultAnimation(component){
 const unavailable=reason=>freeze({available:false,reason});
 if(component?.kind!=='state'||!['cns','zss'].includes(component.syntax))return unavailable('Select one exact CNS/ST or ZSS StateDef.');
 const text=String(component.text??component.sourceText??'');if(/@customstate\b/i.test(text))return unavailable('This StateDef is marked as custom-state-sensitive, so assigned character AIR ownership is not assumed.');
 const lines=text.split(/\r?\n/),matches=[];
 if(component.syntax==='cns'){
  if(!/^\s*\[\s*statedef\b/i.test(withoutComment(lines[0]||'',true)))return unavailable('The exact CNS/ST StateDef header is unavailable.');
  for(let line=1;line<lines.length;line+=1){const code=withoutComment(lines[line]||'',true);if(/^\s*\[/.test(code))break;const match=/^\s*(anim)\s*=\s*(.*?)\s*$/i.exec(code);if(match){const fieldStart=match.index+match[0].indexOf(match[1]),rawStart=match.index+match[0].indexOf(match[2]),leading=match[2].length-match[2].trimStart().length,expression=match[2].trim();matches.push({line,start:fieldStart,fieldStart,fieldEnd:fieldStart+match[1].length,valueStart:rawStart+leading,valueEnd:rawStart+leading+expression.length,expression});}}
 }else{
  const header=withoutComment(lines[0]||'',false);if(!/^\s*\[\s*statedef\b/i.test(header))return unavailable('The exact ZSS StateDef header is unavailable.');
  const pattern=/\b(anim)\s*:\s*([^;\]]+)/gi;for(let match=pattern.exec(header);match;match=pattern.exec(header)){const rawStart=match.index+match[0].indexOf(match[2]),leading=match[2].length-match[2].trimStart().length,expression=match[2].trim();matches.push({line:0,start:match.index,fieldStart:match.index,fieldEnd:match.index+match[1].length,valueStart:rawStart+leading,valueEnd:rawStart+leading+expression.length,expression});}
 }
 if(matches.length!==1)return unavailable(matches.length?'The StateDef has duplicate anim declarations.':'The StateDef does not author one default anim declaration.');
 const field=matches[0];if(!/^(?:0|[1-9]\d*)$/.test(field.expression))return unavailable('The authored default anim is dynamic, negative, or not a conservative integer literal.');
 const action=Number(field.expression);if(!Number.isSafeInteger(action))return unavailable('The authored default anim exceeds the safe integer range.');
 return freeze({available:true,action,expression:field.expression,line:Number(component.startLine)+field.line,start:field.start,fieldStart:field.fieldStart,fieldEnd:field.fieldEnd,valueStart:field.valueStart,valueEnd:field.valueEnd});
}
// One decoration pass can inspect hundreds of states in the same AIR file.
function indexAnimationActions(airText){
 const actions=new Map();
 for(const action of parseAir(airText)){
  const matches=actions.get(action.number);
  if(matches)matches.push(action);
  else actions.set(action.number,[action]);
 }
 return {text:airText,actions};
}
function buildStateAnimationAuthority(component,context={}){
 const parsed=parseStateDefaultAnimation(component),unavailable=reason=>freeze({publicAnimation:freeze({available:false,action:parsed.action??null,reason}),authorities:new Map()});
 if(!parsed.available)return unavailable(parsed.reason);const defText=String(context.defText??''),sourceText=String(context.sourceText??''),airText=String(context.airText??''),defPath=path.resolve(context.defPath||''),airPath=path.resolve(context.airPath||''),assigned=(context.assignedSources||[]).map(canonical);
 if(context.defDirty)return unavailable('Save or revert the character DEF before opening its exact assigned AIR action.');if(context.sourceDocument?.isDirty)return unavailable('Save or revert the StateDef source before opening its exact assigned AIR action.');
 if(!defPath||Buffer.byteLength(defText,'utf8')>MAX_DEF_BYTES)return unavailable('The character DEF is unavailable or exceeds the exact-assignment limit.');
 if(!assigned.includes(canonical(component.filename)))return unavailable('The selected StateDef source is no longer assigned by the character DEF.');
 if(!sourceText||Buffer.byteLength(sourceText,'utf8')>MAX_SOURCE_BYTES||hash(sourceText)!==component.sourceHash)return unavailable('The exact StateDef source is stale or exceeds the inspection limit.');
 if(!airPath||!airText||Buffer.byteLength(airText,'utf8')>MAX_AIR_BYTES)return unavailable('The assigned AIR is unavailable or exceeds the exact-navigation limit.');
 const index=context.animationIndex?.text===airText?context.animationIndex:indexAnimationActions(airText);const matches=index.actions.get(parsed.action)||[];if(matches.length!==1)return unavailable(matches.length?`Assigned AIR has multiple Action ${parsed.action} blocks, so exact navigation is ambiguous.`:`Assigned AIR has no Action ${parsed.action}.`);
 const action=matches[0],route=String(context.token?.(parsed.action)||'');if(!/^[0-9a-f]{48}$/.test(route))return unavailable('Exact navigation authority could not be issued.');
 const authority=freeze({schema:'ikemaker.state-animation-route',version:1,route,generation:Number(context.generation),componentIdentity:componentIdentity(component),stableId:String(component.stableId||''),syntax:component.syntax,stateSignature:String(component.signature||''),fieldLine:parsed.line,fieldStart:parsed.fieldStart,fieldEnd:parsed.fieldEnd,valueStart:parsed.valueStart,valueEnd:parsed.valueEnd,expression:parsed.expression,action:parsed.action,defPath,defHash:hash(defText),sourcePath:path.resolve(component.filename),sourceHash:component.sourceHash,startLine:component.startLine,endLine:component.endLine,rangeHash:component.rangeHash,airPath,airHash:hash(airText),line:action.line,actionHash:hash(JSON.stringify(action))}),authorities=new Map([[route,authority]]);
 return freeze({publicAnimation:freeze({available:true,action:parsed.action,file:path.basename(airPath),line:action.line,route}),authorities});
}
function validateStateAnimationAuthority(authority,component,context={}){
 if(authority?.schema!=='ikemaker.state-animation-route'||authority.version!==1||authority.generation!==Number(context.generation)||componentIdentity(component)!==authority.componentIdentity)return null;
 const rebuilt=buildStateAnimationAuthority(component,{...context,token:action=>action===authority.action?authority.route:'0'.repeat(48)}),candidate=rebuilt.authorities.get(authority.route);if(!candidate)return null;
 for(const key of Object.keys(candidate))if(candidate[key]!==authority[key])return null;return candidate;
}
function targetOrigin(authority){return freeze({schema:'ikemaker.state-default-animation-authority',version:1,componentIdentity:authority.componentIdentity,stableId:authority.stableId,syntax:authority.syntax,stateSignature:authority.stateSignature,fieldLine:authority.fieldLine,fieldStart:authority.fieldStart,fieldEnd:authority.fieldEnd,valueStart:authority.valueStart,valueEnd:authority.valueEnd,expression:authority.expression,action:authority.action,filename:authority.sourcePath,sourceHash:authority.sourceHash,startLine:authority.startLine,endLine:authority.endLine,rangeHash:authority.rangeHash});}
function validateStateAnimationOriginSource(origin,context={}){
 if(origin?.schema!=='ikemaker.state-default-animation-authority'||origin.version!==1||typeof origin.componentIdentity!=='string'||!origin.componentIdentity||typeof origin.stableId!=='string'||!origin.stableId||!['cns','zss'].includes(origin.syntax)||!Number.isSafeInteger(origin.startLine)||!Number.isSafeInteger(origin.endLine)||origin.endLine<origin.startLine)return false;
 const sourceText=String(context.sourceText??'');if(Buffer.byteLength(sourceText,'utf8')>MAX_SOURCE_BYTES||hash(sourceText)!==origin.sourceHash)return false;const eol=sourceText.includes('\r\n')?'\r\n':'\n',range=sourceText.split(/\r?\n/).slice(origin.startLine,origin.endLine+1).join(eol);if(hash(range)!==origin.rangeHash)return false;
 const component={kind:'state',syntax:origin.syntax,text:range,startLine:origin.startLine,endLine:origin.endLine,signature:origin.stateSignature,filename:origin.filename,sourceHash:origin.sourceHash,rangeHash:origin.rangeHash,stableId:origin.stableId,reference:{defPath:context.defPath}},parsed=parseStateDefaultAnimation(component);
 return Boolean(componentIdentity(component)===origin.componentIdentity&&parsed.available&&parsed.action===origin.action&&parsed.expression===origin.expression&&parsed.line===origin.fieldLine&&parsed.start===origin.fieldStart);
}

module.exports={indexAnimationActions,MAX_DEF_BYTES,MAX_SOURCE_BYTES,MAX_AIR_BYTES,componentIdentity,parseStateDefaultAnimation,buildStateAnimationAuthority,validateStateAnimationAuthority,targetOrigin,validateStateAnimationOriginSource};
