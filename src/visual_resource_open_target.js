'use strict';
const fs=require('node:fs'),path=require('node:path'),{parseDef,kind}=require('./def_model');
function matches(filename,type){try{if(path.extname(filename).toLowerCase()!=='.def')return false;const text=fs.readFileSync(filename,'utf8');if(type==='storyboard')return /^\s*\[SceneDef\]/im.test(text);return type==='stage'?kind(parseDef(text,filename))==='stage':['screenpack','lifebar'].includes(kind(parseDef(text,filename)));}catch{return false;}}
async function resolveVisualResourceOpen(api,type,uri,services={}){
 if(!['stage','screenpack','storyboard'].includes(type))throw new Error('Unsupported visual resource type');
 const accepts=services.matches||matches,supplied=uri?.fsPath;
 if(supplied&&accepts(supplied,type))return{filename:path.resolve(supplied)};
 if(!supplied){const active=api.window.activeTextEditor?.document?.uri;if(active?.fsPath&&accepts(active.fsPath,type))return{filename:path.resolve(active.fsPath)};}
 const runtime=services.runtime===undefined?require('./entity_switch_runtime').currentEntitySwitchRuntime():services.runtime;
 const entities=services.entities||runtime?.coordinator?.snapshot?.().entities||[];
 const contexts=services.contexts||require('./authoring_context_registry').openContexts();
 const seen=new Set(),choices=[];
 for(const entry of [...entities,...contexts]){
  const entryType=String(entry.kind||entry.type||'').toLowerCase();if(entryType!==type)continue;
  const filename=entry.ownerFile||entry.key||entry.files?.[0];if(typeof filename!=='string'||!path.isAbsolute(filename)||!accepts(filename,type))continue;
  const resolved=path.resolve(filename),key=resolved.toLowerCase();if(seen.has(key))continue;seen.add(key);choices.push({label:entry.label||path.basename(resolved),description:resolved,filename:resolved});
 }
 if(choices.length===1)return{filename:choices[0].filename};
 if(choices.length>1){const picked=await api.window.showQuickPick(choices,{title:type==='stage'?'Open Loaded Stage':type==='storyboard'?'Open Loaded Storyboard':'Open Loaded Screenpack / Fight UI',placeHolder:'Choose the loaded resource to open'});return picked?{filename:picked.filename}:{cancelled:true};}
 return{filename:''};
}
module.exports={resolveVisualResourceOpen,matches};
