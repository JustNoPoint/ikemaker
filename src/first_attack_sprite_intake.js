'use strict';
const path = require('path'), fs = require('fs'), crypto = require('crypto');
const {parseDef} = require('./def_model');
const {assignedPath} = require('./character_dependency_model');
const same = (a,b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const valid = binding => binding && typeof binding.defPath === 'string' && path.isAbsolute(binding.defPath)
 && typeof binding.sffPath === 'string' && path.isAbsolute(binding.sffPath) && Number.isInteger(binding.action) && binding.action >= 0 && binding.action <= 2147483647;
function key(binding) { return 'ikemaker.firstAttack.sprite.' + hash(JSON.stringify([path.resolve(binding.defPath).toLowerCase(),path.resolve(binding.sffPath).toLowerCase(),binding.action])); }
function assignmentMatches(binding) {
 const entries=parseDef(fs.readFileSync(binding.defPath,'utf8'),binding.defPath).sections.filter(section=>section.name.toLowerCase()==='files').flatMap(section=>section.entries).filter(entry=>entry.key.toLowerCase()==='sprite');
 return entries.length===1 && same(assignedPath(binding.defPath,entries[0].value,'sprite')||'',binding.sffPath);
}
function spriteSeal(archive, sprite, reader) { return hash(reader.spritePng(archive,sprite,null)); }
async function remember(state,binding,built,reader=require('./sff_reader')) {
 if (!valid(binding) || !built?.written || built.verified!==true || !built.targetPath || !same(built.targetPath,binding.sffPath)
  || !Array.isArray(built.finalReady) || !built.finalReady.length || !assignmentMatches(binding)) return false;
 const first=built.finalReady[0], group=first.group, index=first.number;
 if (![group,index].every(value=>Number.isInteger(value)&&value>=0&&value<=65535)) return false;
 const archive=reader.readSff(binding.sffPath);
 if (!/^[0-9a-f]{64}$/i.test(built.byteHash||'') || hash(archive.buffer)!==built.byteHash.toLowerCase()) return false;
 const matches=archive.sprites.filter(sprite=>sprite.group===group&&sprite.number===index);
 if(matches.length!==1)return false;
 await state.update(key(binding),{version:1,group,index,seal:spriteSeal(archive,matches[0],reader)});
 return true;
}
function preferred(state,binding,archive,reader=require('./sff_reader')) {
 if(!valid(binding))return null;
 const saved=state.get(key(binding));if(saved?.version!==1)return null;
 try {
  if(!assignmentMatches(binding))return null;
  const matches=archive.sprites.filter(sprite=>sprite.group===saved.group&&sprite.number===saved.index);
  return matches.length===1&&spriteSeal(archive,matches[0],reader)===saved.seal ? [saved.group,saved.index] : null;
 } catch(_){return null}
}
const bindings=new WeakMap();
function bind(panel,filename,admission) {
 if(typeof admission?.record==='function' && valid(admission) && same(filename,admission.sffPath))bindings.set(panel,admission);
 else bindings.delete(panel);
}
async function completed(panel,filename,built) {
 const admission=bindings.get(panel);if(!admission||!same(filename,admission.sffPath))return false;
 try{return await admission.record(built)}catch(_){return false}
}
module.exports={key,remember,preferred,bind,completed};
