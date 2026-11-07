'use strict';
const fs=require('fs'),path=require('path'),{areaIdentities,assertDistinctAreaIdentities}=require('./stage_area_identity');
const key=filename=>path.resolve(filename).toLowerCase();
function insideProject(filename,root){if(!root)return false;const relative=path.relative(path.resolve(root),path.resolve(filename));return relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);}
function stageIdentityRecords(filename,text,env,additional=[]){
 const records=[{filename,text}],seen=new Set([key(filename)]),folders=[path.dirname(filename),...(env.root?[path.join(env.root,'stages')]:[])],visited=new Set();let files=0;
 for(const record of additional)if(!seen.has(key(record.filename))){seen.add(key(record.filename));records.push(record);}
 while(folders.length){const folder=folders.shift(),canonical=key(folder);if(visited.has(canonical)||!fs.existsSync(folder))continue;visited.add(canonical);if(visited.size>512)throw Error('Stage identity scan exceeded 512 folders. Narrow the Stage project before managed Apply.');
  for(const entry of fs.readdirSync(folder,{withFileTypes:true})){if(entry.isSymbolicLink())continue;const target=path.join(folder,entry.name);if(entry.isDirectory()){if(!/^\.(?:git|ikemaker)/i.test(entry.name))folders.push(target);continue;}if(!entry.isFile()||!/^\.def$/i.test(path.extname(entry.name))||seen.has(key(target)))continue;seen.add(key(target));if(++files>4096)throw Error('Stage identity scan exceeded 4096 DEF files. Narrow the Stage project before managed Apply.');if(fs.statSync(target).size>8*1024*1024)throw Error('A DEF exceeds the identity review budget: '+target);const source=env.readText(target);if(/ikm_area_[a-z0-9_]+_identity_[012]/i.test(source))records.push({filename:target,text:source});}
 }
 for(const record of records)try{areaIdentities(record.text);}catch(error){throw Error(record.filename+': '+error.message);}
 return records;
}
function assertUniqueStageIdentity(filename,text,env,additional=[]){assertDistinctAreaIdentities(stageIdentityRecords(filename,text,env,additional));return true;
}
module.exports={insideProject,stageIdentityRecords,assertUniqueStageIdentity};
