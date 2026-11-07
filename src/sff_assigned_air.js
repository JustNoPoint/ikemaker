'use strict';
const fs=require('fs'),path=require('path');
function samePath(a,b){const physical=value=>{try{return fs.realpathSync.native(value)}catch(_){return path.resolve(value)}};return physical(a).toLowerCase()===physical(b).toLowerCase()}
function airSources(sffPath,options={},dependencies={}){
  const associated=dependencies.associatedDefs||require('./viewer_navigation').associatedDefs,resolve=dependencies.resolveAssigned||require('./related_work').resolveAssigned;
  const api=options.api||require('vscode'),read=filename=>{const document=api.workspace?.textDocuments?.find(item=>!item.isClosed&&samePath(item.fileName,filename));return document?document.getText():fs.readFileSync(filename,'utf8')};
  const explicit=Array.isArray(options.ownerDefs)&&options.ownerDefs.length>0,candidates=explicit?options.ownerDefs:associated(sffPath),owners=[];
  for(const filename of candidates){try{const text=read(filename),assets=resolve(filename,text);if(assets.sff&&samePath(assets.sff,sffPath))owners.push({filename,assets})}catch(_){}}
  if(owners.length>1)return{files:[],assigned:false,reason:'Multiple character DEFs assign this SFF. Open the exact character context before AIR discovery.'};
  if(owners.length===1){const owner=owners[0],filename=owner.assets.air;if(!filename)return{files:[],assigned:true,reason:'The exact character DEF has no assigned AIR.'};try{return{files:[{filename,label:path.relative(path.dirname(sffPath),filename),text:read(filename),assigned:true,ownerDef:path.resolve(owner.filename)}],assigned:true,reason:`AIR assigned by ${path.basename(owner.filename)}.`}}catch(_){return{files:[],assigned:true,reason:'The character DEF assigned AIR is unavailable.'}}}
  if(explicit||candidates.length)return{files:[],assigned:false,reason:'The retained character DEF no longer assigns this SFF. Refresh its owner context.'};
  const directory=path.dirname(sffPath),files=[];
  for(const name of fs.readdirSync(directory).filter(name=>/\.air$/i.test(name))){const filename=path.join(directory,name);try{files.push({filename,label:`Unassigned nearby / ${name}`,text:read(filename),assigned:false})}catch(_){}}
  return{files,assigned:false,reason:'Unowned archive: nearby AIR matches are suggestions, not assigned character references.'};
}
function resolveAirReference(sffPath,reference,options={}){
  const match=/^(.*\.air): Action (-?\d+)$/i.exec(String(reference||''));if(!match)return null;
  const source=airSources(sffPath,options).files.find(item=>item.label===match[1]);if(!source)return null;
  const action=Number(match[2]),present=source.text.split(/\r?\n/).some(line=>{const heading=/^\s*\[\s*begin\s+action\s+(-?\d+)\s*\]/i.exec(line.replace(/;.*/,''));return heading&&Number(heading[1])===action});
  return present?{filename:source.filename,action,ownerDef:source.ownerDef||''}:null;
}
module.exports={airSources,resolveAirReference};
