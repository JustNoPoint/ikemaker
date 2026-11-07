'use strict';
const fs=require('fs'),path=require('path');
function storyboardGameRoot(filename){let directory=path.dirname(path.resolve(filename));for(let depth=0;depth<12;depth++){if(fs.existsSync(path.join(directory,'data','system.def'))||fs.existsSync(path.join(directory,'data','system.base.def'))||fs.existsSync(path.join(directory,'Ikemen_GO.exe')))return directory;const parent=path.dirname(directory);if(parent===directory)break;directory=parent}return null;}
function storyboardResourceCandidates(storyboardFilename,declared,kind=''){
  const name=String(declared||'').trim().replace(/\\/g,path.sep);if(!name)return[];
  const root=storyboardGameRoot(storyboardFilename),bases=[path.dirname(path.resolve(storyboardFilename)),root,root&&path.join(root,'data')].filter(Boolean),prefixes=kind==='font'?['','font']:kind==='music'?['','sound']:[''];
  const output=[],seen=new Set();for(const candidate of [...bases.flatMap(base=>prefixes.map(prefix=>path.resolve(base,prefix,name))),name]){const resolved=path.resolve(candidate),key=resolved.toLowerCase();if(!seen.has(key)){seen.add(key);output.push(resolved)}}return output;
}
function resolveStoryboardResource(storyboardFilename,declared,kind=''){const candidates=storyboardResourceCandidates(storyboardFilename,declared,kind),filename=candidates.find(candidate=>{try{return fs.statSync(candidate).isFile()}catch(_){return false}})||'';return{filename,candidates,available:Boolean(filename)};}
module.exports={storyboardGameRoot,storyboardResourceCandidates,resolveStoryboardResource};
