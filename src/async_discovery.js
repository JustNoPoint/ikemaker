'use strict';
const fs=require('fs'),path=require('path');
async function discover(root,{maxDepth=4,extensions=['.def'],accept=async()=>true,token,onProgress=()=>{}}={}){
 const files=[],errors=[],queue=[{folder:root,depth:0}];let folders=0;
 const cancelled=()=>token?.isCancellationRequested===true;
 while(queue.length){
  if(cancelled())return{files:[],errors,cancelled:true};
  const {folder,depth}=queue.shift();let entries;
  try{entries=await fs.promises.readdir(folder,{withFileTypes:true});}catch(error){errors.push({file:folder,message:error.message});continue;}
  onProgress(++folders);
  for(const entry of entries){
   if(cancelled())return{files:[],errors,cancelled:true};
   if(entry.name.startsWith('.'))continue;
   const file=path.join(folder,entry.name);
   // Directory symlinks are skipped to avoid cycles or duplicate discoveries.
   if(entry.isDirectory()){if(depth<maxDepth)queue.push({folder:file,depth:depth+1});continue;}
   if(!entry.isFile()||!extensions.includes(path.extname(entry.name).toLowerCase()))continue;
   try{if(await accept(file))files.push(file);}catch(error){errors.push({file,message:error.message});}
  }
 }
 return{files:cancelled()?[]:files,errors,cancelled:cancelled()};
}
module.exports={discover};
