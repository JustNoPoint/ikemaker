'use strict';
const path=require('path');
const {resolveReference}=require('./viewer_archive_registry');
const key=file=>file?path.resolve(file).toLowerCase():'';
function mask(text,zss) {
  const masked=String(text).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"/g,part=>part.replace(/[^\n]/g,' '));
  return zss?masked:masked.replace(/;[^\n]*/g,part=>' '.repeat(part.length));
}
function references(text,filename) {
  const zss=/\.zss$/i.test(filename),code=mask(text,zss),lines=String(text).split(/\r?\n/),result=[];
  let controller='',stack=[];
  const tokens=/\[[^\]\n]+\]|(?<![\w.])type\s*=\s*(\w+)|\b(\w+)\s*\{|}|(?<![\w.])(anim|animation|sparkno|guard\.sparkno|hitsound|guardsound|sprite|value)\s*[:=]\s*([^;}\n]*)/gi;
  let match;
  while((match=tokens.exec(code))){
    if(match[0][0]==='['){controller='';stack=[];continue;}
    if(match[1]){controller=match[1].toLowerCase();continue;}
    if(match[2]){stack.push(controller);controller=match[2].toLowerCase();continue;}
    if(match[0]==='}'){controller=stack.pop()||'';continue;}
    const field=match[3].toLowerCase(),expression=match[4].trim();
    const kind=field==='value'?(controller==='playsnd'?'snd':/^changeanim/.test(controller)?'air':''):/sound/.test(field)?'snd':field==='sprite'?'sff':'air';
    if(!kind)continue;
    const line=code.slice(0,match.index).split('\n').length-1;
    result.push({filename,line,character:0,text:lines[line],kind,expression,defaultPrefix:/sparkno|sound/.test(field)&&field!=='value'?'f':''});
  }
  if(/\.air$/i.test(filename)){
    let action=null;
    code.split(/\r?\n/).forEach((line,index)=>{
      const begin=/^\s*\[begin action\s+(-?\d+)\]/i.exec(line);if(begin){action=Number(begin[1]);return;}
      const frame=/^\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*-?\d+\s*,\s*-?\d+\s*,/.exec(line);
      if(action!==null&&frame)result.push({filename,line:index,character:0,text:lines[index],kind:'sff',expression:frame[1]+','+frame[2],defaultPrefix:'',action});
    });
  }
  return result;
}
function resolve(item,assets,registry,constants,airOwners) {
  let value=item.expression;
  const constant=/^const\(\s*([\w.]+)\s*\)$/i.exec(value);
  if(constant){const found=constants?.get(constant[1].toLowerCase());if(!found||!Number.isInteger(found.value))return null;value=String(found.value);}
  const known=registry.candidates.map(record=>record.prefix).sort((a,b)=>b.length-a.length);
  const prefix=known.find(name=>value.toLowerCase().startsWith(name)&&/^-?\d+(?:\s*,\s*-?\d+)?$/.test(value.slice(name.length).trim()));
  const match=prefix?new RegExp('^(-?\\d+)\\s*(?:,\\s*(-?\\d+))?$').exec(value.slice(prefix.length).trim()):/^([a-z_]*)\s*(-?\d+)\s*(?:,\s*(-?\d+))?$/i.exec(value);
  if(!match)return null;
  const selectedPrefix=prefix||match[1]||item.defaultPrefix;
  const group=Number(match[prefix?1:2]),number=match[prefix?2:3]===undefined?undefined:Number(match[prefix?2:3]);
  if(item.kind!=='air'&&number===undefined)return null;
  let files;
  if(item.kind==='sff'&&item.action!==undefined)files=airOwners.get(key(item.filename))||[];
  else if(!selectedPrefix||selectedPrefix.toLowerCase()==='s')files=[assets[item.kind]].filter(Boolean);
  else files=resolveReference(registry,selectedPrefix,item.kind).candidates.map(record=>record[item.kind]);
  files=[...new Set(files.map(key))];
  return files.length===1?{filename:files[0],group,number}:null;
}
function findUsedBy({documents,assets,registry,constants,target,reference}) {
  const airOwners=new Map();
  for(const record of [assets,...(assets.extraAir||[]).map(air=>({air,sff:assets.sff})),...registry.candidates])if(record.air&&record.sff){const id=key(record.air);airOwners.set(id,[...(airOwners.get(id)||[]),record.sff]);}
  const matches=[];let unresolved=0;
  for(const document of documents)for(const item of references(document.text,document.filename)){
    if(item.kind!==target.kind)continue;
    const resolved=resolve(item,assets,registry,constants,airOwners);
    if(!resolved){unresolved++;continue;}
    if(resolved.filename===key(target.filename)&&resolved.group===reference.group&&(target.kind==='air'||resolved.number===reference.number))matches.push(item);
  }
  return {matches,unresolved,files:documents.length};
}
module.exports={references,findUsedBy,mask};
