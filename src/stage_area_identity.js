'use strict';
const {parseDef,setSectionEntry}=require('./def_model'),{hash}=require('./mutation_safety');
const KEY=/^(ikm_area_[a-z0-9_]+)_identity_([012])$/i;
function areaIdentities(text){
 const groups=new Map();for(const entry of parseDef(text).sections.filter(s=>s.normalized==='constants').flatMap(s=>s.entries)){
  const match=KEY.exec(entry.normalized);if(!match)continue;if(!/^\d+$/.test(entry.value)||Number(entry.value)>16777215||Number(entry.value)<1)throw Error('Reserved area identity constant is malformed: '+entry.key);
  const group=groups.get(match[1])||[];if(group[Number(match[2])]!==undefined)throw Error('Duplicate reserved area identity constant: '+entry.key);group[Number(match[2])]=Number(entry.value);groups.set(match[1],group);
 }for(const [namespace,values]of groups)if(values.length!==3||[0,1,2].some(index=>values[index]===undefined))throw Error('Incomplete reserved area identity: '+namespace);return [...groups].map(([namespace,values])=>({namespace,values}));
}
function addAreaIdentity(text,filename,namespace){
 areaIdentities(text);const digest=hash(filename.toLowerCase()+'\0'+text+'\0'+namespace),values=[0,1,2].map(index=>1+parseInt(digest.slice(index*6,index*6+6),16)%16777215);let next=text;
 const constants=parseDef(next).sections.filter(section=>section.normalized==='constants');if(constants.length>1)throw Error('Multiple Constants sections require identity/source review.');if(!constants.length){const eol=next.includes('\r\n')?'\r\n':'\n';next+=(/[\r\n]$/.test(next)?'':eol)+eol+'[Constants]'+eol;}
 for(let index=0;index<3;index++){const document=parseDef(next),section=document.sections.find(s=>s.normalized==='constants'),key=namespace+'_identity_'+index;if(section.entries.some(entry=>entry.normalized===key.toLowerCase()))throw Error('Reserved area identity key already exists.');const later=document.sections.find(candidate=>candidate.line>section.line),lines=[...document.lines],at=later?later.line:lines.length-(lines.at(-1)===''?1:0);lines.splice(at,0,key+' = '+values[index]);next=lines.join(next.includes('\r\n')?'\r\n':'\n');}
 return {text:next,namespace,values,guard:values.map((value,index)=>'stageConst('+namespace+'_identity_'+index+') = '+value).join(' && ')};
}
function stripAreaIdentity(text){const document=parseDef(text.replace(/\r\n|\r/g,'\n')),remove=new Set(document.sections.filter(s=>s.normalized==='constants').flatMap(s=>s.entries.filter(e=>KEY.test(e.normalized)).map(e=>e.line))),parts=text.split(/(\r\n|\r|\n)/);for(let index=0;index<parts.length;index+=2)if(parts[index].trim().startsWith('; IKEMaker managed Stage recipe v1 '))remove.add(index/2);if(!remove.size)return text;return parts.filter((_,index)=>!remove.has(Math.floor(index/2))).join('');}
function assertDistinctAreaIdentities(records){const seen=new Map();for(const record of records)for(const identity of areaIdentities(record.text)){const key=identity.namespace+'|'+identity.values.join(',');if(seen.has(key))throw Error('Area identity is duplicated between '+seen.get(key)+' and '+record.filename+'. Regenerate the variant with reserved area identity constants excluded, or review/remove the copied reserved identity constants.');seen.set(key,record.filename);}return true;}
module.exports={KEY,areaIdentities,addAreaIdentity,stripAreaIdentity,assertDistinctAreaIdentities};
