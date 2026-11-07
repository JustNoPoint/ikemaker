'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {parseDef,unquote}=require('./def_model');
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
// Read-only source navigation. A registration is not proof the runtime executed it.
function stageProjectLua(root,readText=file=>fs.readFileSync(file,'utf8')){
 root=path.resolve(root);const targets=[],seen=new Set(),limit=80;
 const context={type:'stage',key:root,root,label:'Shared project Lua',ownerDef:'',files:[]};
 function read(file){const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2*1024*1024)throw Error('Source is not a regular file within the 2 MiB navigation limit.');const text=String(readText(file));if(Buffer.byteLength(text)>2*1024*1024)throw Error('Open source exceeds the navigation limit.');return{text,dependency:{filename:file,fingerprint:hash(text)}};}
 function add(target){if(targets.length>=limit)return;const id=(target.filename||target.label)+'|'+(target.line||0);if(seen.has(id))return;seen.add(id);targets.push({...target,context:{...context,files:target.filename?[target.filename]:[]}});}
 function unavailable(label,reason){add({label,available:false,description:'Shared project Lua · unresolved',reason});}
 function moduleFile(reference,dependencies,label,registrationFile){
  // main.lua removes leading dots/slashes, the final extension, then uses require.
  const value=unquote(reference).trim();if(!value)return;
  if(!/\.lua$/i.test(value)||/[\r\n\0]/.test(value)){unavailable(label,'This registration needs loader-aware resolution. Open its configuration source; no path was guessed.');return;}
  const moduleName=value.replace(/^[.\/\\]+/,'').replace(/\.[^.]+$/,'').replace(/[\/\\]+/g,'.'),relative=moduleName.replaceAll('.',path.sep)+'.lua',file=path.resolve(root,relative);
  if(!file.toLowerCase().startsWith(root.toLowerCase()+path.sep)){unavailable(label,'Module path leaves the project root. Open the configuration source to inspect its loader.');return;}
  try{const source=read(file),registration=registrationFile&&path.resolve(registrationFile)!==file?[read(registrationFile).dependency]:[];add({label,description:'Shared runtime registration · '+path.relative(root,file),filename:file,line:0,available:true,dependencies:[...dependencies,...registration,source.dependency]});}catch(error){unavailable(label,error.message);}
 }
 let config;
 const configFile=path.join(root,'save','config.ini');
 try{config=read(configFile);}catch{}
 if(config){const document=parseDef(config.text),dep=[config.dependency];
  for(const section of document.sections.filter(s=>s.normalized==='common'))for(const entry of section.entries){
   if(!/^(?:lua|modules)\d*$/i.test(entry.key)||!entry.value.trim())continue;
   add({label:'Shared Lua configuration — '+entry.key,description:/^lua/i.test(entry.key)?'Inline Lua code · not a filename':'Module registrations · shared across stages',filename:configFile,line:entry.line,available:true,dependencies:dep});
   if(/^modules/i.test(entry.key))for(const value of entry.value.split(',').slice(0,limit))moduleFile(value,dep,'Shared module — '+unquote(value).trim());
  }
  const motif=document.sections.filter(s=>s.normalized==='config').flatMap(s=>s.entries).filter(e=>e.normalized==='motif').at(-1);
  if(motif){const motifFile=path.resolve(root,unquote(motif.value));try{const source=read(motifFile);for(const section of parseDef(source.text).sections.filter(s=>s.normalized==='files'))for(const entry of section.entries.filter(e=>e.normalized==='module'&&e.value.trim())){
   add({label:'Shared motif module registration',description:'Configured motif · runtime overrides may select another motif',filename:motifFile,line:entry.line,available:true,dependencies:[...dep,source.dependency]});
   moduleFile(entry.value,[...dep,source.dependency],'Shared motif Lua — '+unquote(entry.value));
  }}catch(error){unavailable('Shared motif Lua',error.message);}}
 }
 const directory=path.join(root,'external','mods'),queue=[{directory,depth:0}];let visited=0,scanned=0,truncated=false;
 const physicalRoot=fs.realpathSync(root),insidePhysicalRoot=file=>{const relative=path.relative(physicalRoot,fs.realpathSync(file));return relative!== '..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);};
 while(queue.length&&targets.length<limit&&scanned<4096){const current=queue.shift();if(++visited>64){truncated=true;break;}let entries;try{if(fs.lstatSync(current.directory).isSymbolicLink()||!insidePhysicalRoot(current.directory)){unavailable('Shared autoload folder — '+path.relative(root,current.directory),'Automatic discovery skips linked folders outside the selected project.');continue;}entries=[];const handle=fs.opendirSync(current.directory);try{let entry;while(scanned<4096&&(entry=handle.readSync())){scanned++;entries.push(entry);if(entries.length>=512){truncated=true;break;}}}finally{handle.closeSync();}entries.sort((a,b)=>a.name.localeCompare(b.name));}catch{continue;}
  for(const entry of entries){if(targets.length>=limit){truncated=true;break;}if(entry.isSymbolicLink())continue;const file=path.join(current.directory,entry.name);if(entry.isDirectory()){if(current.depth<8)queue.push({directory:file,depth:current.depth+1});else truncated=true;continue;}if(!entry.isFile()||!entry.name.toLowerCase().endsWith('.lua'))continue;
   if(entry.name.startsWith('-')){unavailable('Disabled mod — '+path.relative(directory,file),'The runtime skips Lua basenames beginning with a dash.');continue;}
   moduleFile(path.relative(root,file),[],'Shared autoload mod — '+path.relative(directory,file),file);
  }
 }
 if(queue.length||truncated||targets.length>=limit||scanned>=4096)targets.push({label:'Additional shared Lua sources not indexed',available:false,description:'Bounded discovery',reason:'Navigation limits: 80 targets, 64 folders, 8 nested levels, 512 directory entries per folder and 4096 total. Use the native source browser for the remainder.'});
 return targets;
}
module.exports={stageProjectLua};
