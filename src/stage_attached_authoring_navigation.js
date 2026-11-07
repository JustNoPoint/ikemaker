'use strict';
const {stageCodeTargets}=require('./stage_code_targets');
function stageFileIdentity(filename){const fs=require('node:fs'),s=fs.statSync(filename,{bigint:true});if(!s.isFile())throw Error('Stage source is unavailable.');return [fs.realpathSync.native(filename).toLowerCase(),s.dev,s.ino,s.birthtimeNs].join(':');}
async function editAttachedEntity(api,owner,env){
 const filename=owner.filename,generation=owner.generation,document=await env.nativeDocument();
 if(owner.disposed||owner.filename!==filename||owner.generation!==generation||!owner.panel.active)return false;
 const authority=env.capture();if(!authority)return false;
 const current=()=>{try{env.assert(authority);return true;}catch{return false;}};
 const targets=()=>stageCodeTargets(filename,document.getText(),env).filter(t=>t.available&&t.context?.ownerDef===t.filename);
 // Decode owner DEFs through native buffers before retaining source fingerprints.
 for(const file of new Set(targets().map(t=>t.filename))){await api.workspace.openTextDocument(api.Uri.file(file));if(!current())return false;}
 const owners=targets();if(!owners.length){Promise.resolve(api.window.showInformationMessage('No readable linked character DEF is available. Use Stage Code to inspect its authored declaration.')).catch(()=>{});return false;}
 const picked=await api.window.showQuickPick(owners.map(target=>({label:target.label,description:target.filename,target})),{title:'Edit Stage attached entity',placeHolder:'Choose its exact authored owner'});
 if(!picked||!current()||!owners.includes(picked.target))return false;const target=picked.target;
 const sourceCurrent=()=>{try{return target.dependencies.every(d=>require('./mutation_safety').hash(env.readText(d.filename))===d.fingerprint);}catch{return false;}};
 if(!sourceCurrent())return false;
 const route=await api.window.showQuickPick([{label:'Stage Code',id:'code',description:'Open this exact character DEF with its assigned source tools'},{label:'Move Lab',id:'moveLab',description:'Author this owner and retain Return to Stage'}],{title:'Edit '+target.label});
 if(!route||!current()||!sourceCurrent())return false;
 if(route.id==='code')return env.openSource(target);
 // Entry dispatch uses strict source fingerprints. Return permits normal owner
 // authoring and checks the retained Stage plus its actual declared binding.
 const retainedIdentity=(env.stageFileIdentity||stageFileIdentity)(filename),entityIdentity=owner.entityIdentity;
 const retainedOwner=()=>{try{if(owner.disposed||owner.filename!==filename||owner.entityIdentity!==entityIdentity||(env.stageFileIdentity||stageFileIdentity)(filename)!==retainedIdentity)return false;const {parseDef,unquote}=require('./def_model'),doc=parseDef(env.readText(filename)),infos=doc.sections.filter(s=>s.normalized==='info');if(infos.length!==1)return false;const entries=infos[0].entries.filter(e=>e.normalized===target.attachedKey);if(entries.length!==1)return false;const resolved=env.resolveAsset(unquote(entries[0].value),filename);return require('./stage_attached_authoring').samePhysical(resolved,target.context.ownerDef);}catch{return false;}};
 return require('./stage_attached_move_lab').openAttachedMoveLab(api,{isCurrent:current,isRetainedCurrent:retainedOwner,returnToStage:()=>{if(retainedOwner())owner.panel.reveal(owner.panel.viewColumn,false);},onDispose:callback=>owner.panel.onDidDispose(callback)},{ownerDef:target.context.ownerDef,target},{sourceCurrent:()=>sourceCurrent()});
}
module.exports={editAttachedEntity};
