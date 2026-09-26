'use strict';
const path=require('path');
const {FormDrafts}=require('./form_drafts');
const STORE_KEY='ikemaker.airRuntimeDrafts.v1';
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const canonicalPath=value=>path.resolve(String(value||'')).replace(/\\/g,'/').toLowerCase();
const prefixFor=airPath=>canonicalPath(airPath)+'|';
const storageKey=airPath=>canonicalPath(airPath);
function validRecord(value){return value&&typeof value==='object'&&value.value&&typeof value.value==='object'&&Number.isSafeInteger(Number(value.revision))&&Number(value.revision)>0;}
function normalizeEntries(airPath,entries){
 const prefix=prefixFor(airPath),out={},source=entries&&typeof entries==='object'&&!Array.isArray(entries)?entries:{};
 for(const [rawKey,record] of Object.entries(source)){
  const key=String(rawKey).replace(/\\/g,'/').toLowerCase();
  if(!key.startsWith(prefix)||!validRecord(record))throw new Error('AIR runtime draft data does not match the open AIR file.');
  out[key]=clone(record);
 }
 if(Object.keys(out).length>2048||JSON.stringify(out).length>2*1024*1024)throw new Error('AIR runtime draft recovery exceeded its safe local-storage limit.');
 return out;
}
function mergeEntries(...sources){
 const out={};
 for(const source of sources)for(const [rawKey,record] of Object.entries(source||{})){
  const key=String(rawKey).replace(/\\/g,'/').toLowerCase();
  if(!validRecord(record))continue;
  if(!out[key]||Number(record.revision)>=Number(out[key].revision))out[key]=clone(record);
 }
 return out;
}
class RuntimeDraftStore{
 constructor(storage){this.drafts=new FormDrafts(storage,STORE_KEY);}
 read(airPath){return normalizeEntries(airPath,this.drafts.read(storageKey(airPath))||{});}
 async sync(airPath,entries){const normalized=normalizeEntries(airPath,entries),key=storageKey(airPath),current=this.drafts.read(key);if(Object.keys(normalized).length)return this.drafts.stage(key,normalized);if(current!==undefined)return this.drafts.discard(key,current);return true;}
 async finish(airPath,key,expected){
  const canonical=String(key||'').replace(/\\/g,'/').toLowerCase(),prefix=prefixFor(airPath);
  if(!canonical.startsWith(prefix)||!validRecord(expected))return false;
  const storeKey=storageKey(airPath),current=this.drafts.read(storeKey)||{};
  if(JSON.stringify(current[canonical])!==JSON.stringify(expected))return false;
  const next={...current};delete next[canonical];
  return Object.keys(next).length?this.drafts.stage(storeKey,next):this.drafts.discard(storeKey,current);
 }
 flush(){return this.drafts.flush();}
}
function createDrafts(initial={},persist=()=>{}){
 const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
 let entries=clone(initial),sequence=Object.values(initial).reduce((max,entry)=>Math.max(max,Number(entry.revision)||0),0),pending;
 const publish=()=>persist(clone(entries));
 return{
  read:key=>clone(entries[key]?.value),
  record:key=>clone(entries[key]),
  dirty:prefix=>Object.keys(entries).some(key=>key.startsWith(prefix)),
  busy:()=>!!pending,
  stage(key,value){entries[key]={value:clone(value),revision:++sequence};publish();},
  discard(key){delete entries[key];publish();},
  discardPrefix(prefix){for(const key of Object.keys(entries))if(key.startsWith(prefix))delete entries[key];publish();},
  submit(key){if(pending||!entries[key])return null;const id=++sequence;pending={id,key,revision:entries[key].revision};return id;},
  finish(id,success){if(!pending||pending.id!==id)return null;const saved=pending;pending=undefined;if(success&&entries[saved.key]?.revision===saved.revision){delete entries[saved.key];publish();}return saved.key;}
 };
}
function clientScript(hostEntries={}){const initial=JSON.stringify(hostEntries).replace(/</g,'\\u003c');return`function canonicalRuntimeEntries(source){const out={};for(const [rawKey,record] of Object.entries(source||{})){const key=String(rawKey).replace(/\\\\/g,'/').toLowerCase();if(!record||typeof record!=='object'||!record.value||typeof record.value!=='object'||!Number.isFinite(Number(record.revision)))continue;if(!out[key]||Number(record.revision)>=Number(out[key].revision))out[key]=record;}return out}const runtimeHostDrafts=canonicalRuntimeEntries(${initial}),runtimeLocalDrafts=canonicalRuntimeEntries(vscode.getState()?.airRuntimeDrafts||{}),runtimeInitialDrafts=canonicalRuntimeEntries({...runtimeHostDrafts,...runtimeLocalDrafts});for(const [key,record] of Object.entries(runtimeHostDrafts))if(!runtimeInitialDrafts[key]||Number(record.revision)>Number(runtimeInitialDrafts[key].revision))runtimeInitialDrafts[key]=record;const runtimeDrafts=(${createDrafts.toString()})(runtimeInitialDrafts,entries=>{vscode.setState({...vscode.getState(),airRuntimeDrafts:entries});vscode.postMessage({type:'runtimeDraftSync',airPath:model.airPath,entries})});function runtimePrefix(){return String(model.airPath||'').replace(/\\\\/g,'/').toLowerCase()+'|'}function runtimeKey(kind=document.getElementById('runtimeKind').value){return runtimePrefix()+(action?.number??'none')+'|'+(frameIndex+1)+'|'+kind}`;}
module.exports={createDrafts,RuntimeDraftStore,prefixFor,normalizeEntries,mergeEntries,clientScript};
