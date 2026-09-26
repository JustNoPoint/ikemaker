'use strict';
const fs=require('fs/promises'),path=require('path');
const kinds=['air','sff','snd'],limit=128*1024*1024;
function validSnapshot(item,kind){
 if(!item||item.kind!==kind||typeof item.filename!=='string'||!path.isAbsolute(item.filename)||typeof item.identity!=='string'||typeof item.detail!=='string'||!Number.isInteger(item.selection?.group))return false;
 if(kind!=='air')return Number.isInteger(item.selection.number)&&typeof item.media==='string'&&new RegExp(kind==='sff'?'^data:image/png;base64,[A-Za-z0-9+/]+=*$':'^data:audio/[^;,]+;base64,[A-Za-z0-9+/]+=*$').test(item.media);
 const a=item.animation;
 return a&&Array.isArray(a.frames)&&a.frames.length>0&&a.frames.every(f=>Number.isFinite(f.rawTime)&&typeof f.flags==='string'&&typeof f.identity==='string'&&Array.isArray(f.clsn1)&&Array.isArray(f.clsn2))&&a.images&&typeof a.images==='object'&&Object.values(a.images).every(i=>typeof i.media==='string'&&/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(i.media));
}
function createStore(directory){
 let queue=Promise.resolve();
 const filename=kind=>{if(!kinds.includes(kind))throw Error('Unknown comparison type.');return path.join(directory,kind+'.json');};
 return {
  async read(kind){const file=filename(kind);let content;try{if((await fs.stat(file)).size>limit)throw Error('Saved comparison is too large.');content=await fs.readFile(file,'utf8');}catch(error){if(error.code==='ENOENT')return undefined;throw error;}
   const data=JSON.parse(content);if(data.version!==1||!validSnapshot(data.reference,kind)||(data.primary&&!validSnapshot(data.primary,kind)))throw Error('Saved comparison is invalid.');return data;
  },
  write(kind,record){const file=filename(kind),content=record?JSON.stringify({version:1,reference:record.reference,primary:record.primary}):undefined;
   if(content&&Buffer.byteLength(content)>limit)return Promise.reject(Error('Comparison exceeds the saved snapshot size limit.'));
   const operation=queue.catch(()=>{}).then(async()=>{await fs.mkdir(directory,{recursive:true});if(!content){await fs.rm(file,{force:true});return;}const temp=file+'.tmp';await fs.writeFile(temp,content,'utf8');await fs.rename(temp,file);});queue=operation;return operation;
  }
 };
}
module.exports={createStore,validSnapshot,kinds};
