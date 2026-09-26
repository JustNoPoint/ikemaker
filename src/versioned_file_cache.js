'use strict';
const fs=require('fs'),path=require('path');
const clone=value=>JSON.parse(JSON.stringify(value));
function createCache({maxEntries=128,maxBytes=2*1024*1024}={}){
 const entries=new Map();let bytes=0;
 const version=file=>{const stat=fs.statSync(file,{bigint:true});return [stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].join(':');};
 function remove(key){const old=entries.get(key);if(old){bytes-=old.bytes;entries.delete(key);}}
 function get(file,revision,load){
  const key=path.resolve(file).toLowerCase()+'#'+revision;let before;
  try{before=version(file);}catch(error){remove(key);throw error;}
  const old=entries.get(key);
  if(old?.version===before){entries.delete(key);entries.set(key,old);return clone(old.value);}
  remove(key);
  const value=load(file),after=version(file);
  if(before!==after)throw Error('File changed while being read: '+file+'. Refresh to retry.');
  const serialized=JSON.stringify(value),size=Buffer.byteLength(serialized);
  if(size<=maxBytes&&maxEntries>0){while(entries.size>=maxEntries||bytes+size>maxBytes)remove(entries.keys().next().value);entries.set(key,{version:after,value:JSON.parse(serialized),bytes:size});bytes+=size;}
  return clone(value);
 }
 return{get,clear(){entries.clear();bytes=0;},stats:()=>({entries:entries.size,bytes})};
}
module.exports={createCache};
