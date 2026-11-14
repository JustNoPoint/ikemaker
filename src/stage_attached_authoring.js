'use strict';
const path=require('node:path'),fs=require('node:fs');
const {parseDef,unquote,kind}=require('./def_model');
const {setEntry}=require('./stage_source_edits');
const {createCharacterPlan}=require('./character_creation');
const {blankSff}=require('./asset_templates');
const {attachedCharacterTemplates}=require('./stage_integration');
const {isAttachedDeclaration}=require('./stage_attached_declarations');
const samePath=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
function canonicalPath(filename){let current=path.resolve(filename),tail=[];for(;;){try{return path.join(fs.realpathSync.native(current),...tail).toLowerCase();}catch(error){if(error.code!=='ENOENT'&&error.code!=='ENOTDIR')throw error;const parent=path.dirname(current);if(parent===current)throw error;tail.unshift(path.basename(current));current=parent;}}}
function samePhysical(a,b){if(canonicalPath(a)===canonicalPath(b))return true;try{const x=fs.statSync(a,{bigint:true}),y=fs.statSync(b,{bigint:true});return x.dev===y.dev&&x.ino===y.ino;}catch(error){if(error.code==='ENOENT'||error.code==='ENOTDIR')return false;throw error;}}

// Pinned nightly 6a093924 stage.go:1238-1265 accepts any integer suffix,
// then appends each successfully loaded declaration. Suffixes are not slots,
// and bare attachedchar and attachedchar1 are independent declarations.
function declarations(text){
 const doc=parseDef(text),infos=doc.sections.filter(s=>s.normalized==='info');
 if(kind(doc)!=='stage')throw Error('Choose a Stage DEF.');
 if(infos.length!==1)throw Error('Attached authoring requires one unambiguous [Info] section.');
 const entries=infos[0].entries.filter(e=>isAttachedDeclaration(e.normalized));
 const seen=new Set();for(const e of entries){if(seen.has(e.normalized))throw Error('Duplicate '+e.key+' requires source review.');seen.add(e.normalized);}
 return {doc,info:infos[0],entries};
}
function planAttachedLink(text,stageFilename,targetDef,services={}){
 const {info,entries}=declarations(text),relative=path.relative(path.dirname(stageFilename),targetDef).replace(/\\/g,'/');
 if(!relative||samePhysical(stageFilename,targetDef)||/[\r\n";]/.test(relative))throw Error('Choose a separate character DEF with a safe reference path.');
 const existing=entries.find(e=>{const ref=unquote(e.value);if(!ref)return false;const resolved=services.resolveAsset?services.resolveAsset(ref,stageFilename):path.resolve(path.dirname(stageFilename),ref);return samePhysical(resolved,targetDef);});
 if(existing)return {before:text,text,key:existing.key,relative,alreadyLinked:true};
 // Count unresolved and blank declarations too: never rely on a failed runtime
 // load to free capacity, or silently replace an authored declaration.
 if(entries.length>=4)throw Error('This Stage already declares four attached entities. Review its authored declarations before linking another.');
 const used=new Set(entries.map(e=>e.normalized));let key='attachedChar';
 for(let n=1;used.has(key.toLowerCase());n++)key='attachedChar'+n;
 return {before:text,text:setEntry(text,info.line,key,'"'+relative+'"'),key,relative,alreadyLinked:false};
}
function validateAttachedDef(text){
 const doc=parseDef(text);if(kind(doc)==='stage'||!doc.sections.some(s=>s.normalized==='info')||!doc.sections.some(s=>s.normalized==='files'))throw Error('Choose an authored character DEF containing [Info] and [Files].');
 // Scenery, controllers, platforms and NPCs need not satisfy fighter profiles.
 return doc;
}
function stageCoordinates(text){
 const sections=parseDef(text).sections.filter(s=>s.normalized==='stageinfo');
 if(sections.length>1)throw Error('Choose an explicit localcoord when StageInfo is ambiguous.');
 if(!sections.length)return [320,240];
 const values=sections[0].entries.filter(e=>e.normalized==='localcoord');
 if(values.length>1)throw Error('Choose an explicit localcoord when StageInfo.localcoord is duplicated.');
 const parts=(values[0]?.value||'320,240').split(',').map(Number);
 if(parts.length!==2||parts.some(n=>!Number.isFinite(n)||n<=0))throw Error('Stage localcoord must contain two positive finite numbers.');
 return parts;
}
function planAttachedCreation(stageText,stageFilename,targetDef,options={}){
 if(!/\.def$/i.test(targetDef))throw Error('Use a .def destination.');
 const coord=options.localcoord||stageCoordinates(stageText);
 if(!Array.isArray(coord)||coord.length!==2||coord.some(n=>!Number.isFinite(n)||n<=0))throw Error('Choose two positive finite localcoord values.');
 const stem=path.basename(targetDef,path.extname(targetDef)),directory=path.dirname(targetDef);
 if(!/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(stem))throw Error('Choose an entity filename starting with a letter, number or underscore and containing letters, numbers, underscores, dots or hyphens.');
 let files;
 if(options.profile==='character'){
  const base=createCharacterPlan(targetDef,{style:'minimal',displayName:options.name,engineTarget:'ikemen-zss'});
  // Keep the requested destination exact even for names the general creator sanitizes.
  if(!samePath(base.defPath,targetDef))throw Error('Choose a character filename containing letters, numbers, underscores, dots or hyphens.');
  files=new Map(base.files);files.delete(path.join(directory,'README.md'));
  files.set(path.join(directory,stem+'.stage-entity.md'),base.files.get(path.join(directory,'README.md')));
  files.set(targetDef,files.get(targetDef).replace('localcoord = 320,240','localcoord = '+coord.join(',')));
 }else{
  const templates=attachedCharacterTemplates({name:options.name||stem,prefix:options.prefix||'Stage_',sff:stem+'.sff'});
  files=new Map([[targetDef,templates.def.replace('localcoord = 320,240','localcoord = '+coord.join(',')).replace(/interaction\.air/g,stem+'.air').replace(/interaction\.zss/g,stem+'.zss')],[path.join(directory,stem+'.air'),templates.air],[path.join(directory,stem+'.zss'),templates.zss],[path.join(directory,stem+'.sff'),blankSff('2.1')],[path.join(directory,stem+'.stage-entity.md'),templates.readme]]);
 }
 return {stageFilename:path.resolve(stageFilename),targetDef:path.resolve(targetDef),profile:options.profile==='character'?'character':'controller',localcoord:coord,files,destinations:new Map([...files.keys()].map(filename=>[filename,canonicalPath(filename)])),link:planAttachedLink(stageText,stageFilename,targetDef,options)};
}
function attachedReview(plan){
 const purpose=plan.files.size?(plan.profile==='controller'?'Create an invisible Stage controller. Its empty SFF/AIR can be authored later. No fighter profile is required.':'Create a clean full character baseline. Its SFF and SND are empty; author artwork, animations, movement and project behavior with the existing character tools. This baseline expects project commons data/common1.cns.zss and data/common.cmd; resolve those dependencies before gameplay testing.'):'Link the existing authored character without changing its files or requiring a fighter profile.';
 const filePurpose=filename=>({'.def':'entity definition and owned file references','.sff':'empty sprite archive','.air':'owned animations','.zss':'owned runtime code','.cns':'character constants','.inp':'input commands','.snd':'empty sound archive','.dat':'movelist source','.md':'entity setup notes'})[path.extname(filename).toLowerCase()]||'entity source';
 return purpose+'\n\n'+(plan.files.size?'Create files (existing files are never replaced):\n'+[...plan.files.keys()].map(filename=>filename+' — '+filePurpose(filename)).join('\n'):'Existing owner: '+plan.targetDef)+(plan.targetSnapshot?.dirty?'\nUNSAVED attached character edits are retained. Save its authored files too before testing in game.':'')+'\n\nStage: '+plan.stageFilename+'\n'+(plan.link.alreadyLinked?'Already linked; no Stage edit.':plan.link.key+' = "'+plan.link.relative+'"')+(plan.localcoord?'\nNew entity localcoord: '+plan.localcoord.join(','):'')+'\n\nThe Stage binding is an UNSAVED native edit. Save the Stage DEF to use it in game. Native Undo covers the compound edit. Verify behavior in IKEMEN; one controller may manage many objects/helpers. Runtime entity order is not determined by the declaration suffix.';
}
module.exports={samePath,canonicalPath,samePhysical,declarations,planAttachedLink,validateAttachedDef,stageCoordinates,planAttachedCreation,attachedReview};
