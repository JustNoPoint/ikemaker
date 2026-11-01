'use strict';
const fs=require('fs'),path=require('path');
const {parseDef,sections,value,unquote}=require('./def_model');
const key=file=>path.resolve(file).toLowerCase();
function splitFiles(text){return (String(text||'').match(/"[^"]*"|[^,]+/g)||[]).map(item=>unquote(item.trim())).filter(Boolean);}
function collect(defPath,options={}) {
  const read=options.readText||(file=>fs.readFileSync(file,'utf8'));
  const root=options.gameRoot||require('./character_context').gameRoot(defPath);
  const candidates=[],diagnostics=[],seen=new Set(),commonSources=[],runtimeDiagnostics=[],controlFiles=new Set([defPath].filter(Boolean));
  let motif='',fight='';
  const runtimeIssue=message=>{runtimeDiagnostics.push(message);};
  const resolve=(name,owner)=>{
    if(!name)return '';
    const paths=[path.resolve(path.dirname(owner),unquote(name)),...(motif?[path.resolve(path.dirname(motif),unquote(name))]:[]),...(root?[path.resolve(root,unquote(name)),path.resolve(root,'data',unquote(name))]:[])];
    return paths.find(file=>fs.existsSync(file))||paths[0];
  };
  const add=(record)=>{
    record.runtime=record.runtime===true;
    record.displayPrefix=String(record.prefix||'');record.prefix=record.displayPrefix.toLowerCase();
    if(!/^[a-z_][a-z0-9_]*$/i.test(record.prefix)||record.prefix==='s'||record.prefix==='f'&&!record.system){const message='Invalid or reserved shared prefix in '+record.def;diagnostics.push(message);if(record.runtime)runtimeIssue(message);return;}
    const identity=[record.prefix,record.air,record.sff,record.snd].join('|').toLowerCase();
    if(!seen.has(identity)){seen.add(identity);candidates.push(record);}
  };
  const load=(filename,source,metadata={})=>{
    if(metadata.runtime)controlFiles.add(filename);
    try{
      const doc=parseDef(read(filename),filename),info=sections(doc,'info')[0],files=sections(doc,'files')[0];
      add({prefix:value(info,'prefix',''),def:filename,source,...metadata,air:resolve(value(files,'air',value(files,'anim','')),filename),sff:resolve(value(files,'sff',value(files,'sprite','')),filename),snd:resolve(value(files,'snd',value(files,'sound','')),filename)});
    }catch(error){const message='Cannot read shared archive definition '+filename+': '+error.message;diagnostics.push(message);if(metadata.runtime)runtimeIssue(message);}
  };
  if(root){
    const config=path.join(root,'save','config.ini');
    controlFiles.add(config);
    if(fs.existsSync(config))try{
      const doc=parseDef(read(config),config);
      motif=path.resolve(root,unquote(value(sections(doc,'config')[0],'motif','data/system.def')));
      controlFiles.add(motif);
      if(fs.existsSync(motif)){
        const system=parseDef(read(motif),motif),fightName=value(sections(system,'files')[0],'fight','');
        fight=fightName?resolve(fightName,motif):'';
        if(fight)controlFiles.add(fight);
        if(fight&&fs.existsSync(fight)){
          const files=sections(parseDef(read(fight),fight),'files')[0];
          add({prefix:'f',system:true,runtime:true,originKind:'fight-core',def:fight,source:'Fight screen',air:resolve(value(files,'fightfx.air',''),fight),sff:resolve(value(files,'fightfx.sff',''),fight),snd:resolve(value(files,'common.snd',''),fight)});
          for(const entry of files?.entries||[])if(/^fx\d*$/i.test(entry.key))for(const name of splitFiles(entry.value))load(resolve(name,fight),'Fight screen CommonFX: '+fight,{runtime:true,originKind:'fight-commonfx'});
        }else runtimeIssue(fight?'The configured fight definition is missing: '+fight:'The active motif does not assign a fight definition.');
      }else runtimeIssue('The configured motif definition is missing: '+motif);
      for(const entry of sections(doc,'common')[0]?.entries||[])if(/^fx\d*$/i.test(entry.key))for(const name of splitFiles(entry.value))load(resolve(name,fight||motif||defPath),'Game Common.Fx: '+config,{runtime:true,originKind:'game-commonfx'});
      for(const entry of sections(doc,'common')[0]?.entries||[])if(/^(?:states|air|cmd|const)\d*$/i.test(entry.key))for(const name of splitFiles(entry.value))commonSources.push(resolve(name,defPath));
    }catch(error){const message='Game shared FX configuration: '+error.message;diagnostics.push(message);runtimeIssue(message);}
    else runtimeIssue('The active game configuration is missing: '+config);
  }else runtimeIssue('No exact IKEMEN game root could be resolved for '+defPath+'.');
  let fightPrefix='';
  try{
    const doc=parseDef(read(defPath),defPath),files=sections(doc,'files')[0];
    fightPrefix=unquote(value(sections(doc,'info')[0],'fightfx.prefix','')).toLowerCase();
    for(const name of splitFiles(value(files,'fx','')))load(resolve(name,defPath),'Character DEF fx',{runtime:true,originKind:'character-commonfx'});
  }catch(error){const message='Cannot read character DEF: '+error.message;diagnostics.push(message);runtimeIssue(message);}
  for(const name of options.extraDefs||[])load(resolve(name,defPath),'Configured shared FX',{runtime:false,originKind:'configured-navigation'});
  try{
    const profile=require('./sound_profile'),filename=profile.locate(defPath);
    if(filename){const record=profile.read(filename);for(const archive of record.profile.archives||[]){const resolved=profile.resolveArchive(record.root,archive);add({prefix:archive.prefix,runtime:false,originKind:'sound-profile',def:resolved.fxDefPath,source:'Sound profile: '+filename,air:'',sff:'',snd:resolved.sndPath});}}
  }catch(error){diagnostics.push('Sound profile: '+error.message);}
  return {candidates,diagnostics,fightPrefix,commonSources,runtime:{complete:runtimeDiagnostics.length===0,diagnostics:runtimeDiagnostics,controlFiles:[...controlFiles]}};
}
function resolveReference(registry,prefix,kind) {
  prefix=String(prefix||'').toLowerCase();
  if(prefix==='f'&&registry.fightPrefix)prefix=registry.fightPrefix;
  const candidates=registry.candidates.filter(item=>item.prefix===prefix&&item[kind]);
  // Profile records and their generated DEF can describe the same target.
  const targets=new Map();
  for(const item of candidates){const identity=key(item[kind]),previous=targets.get(identity);targets.set(identity,previous?{...previous,air:previous.air||item.air,sff:previous.sff||item.sff,snd:previous.snd||item.snd}:item);}
  const unique=[...targets.values()];
  return {prefix,candidates:unique,diagnostics:registry.diagnostics};
}
module.exports={collect,resolveReference,splitFiles};
