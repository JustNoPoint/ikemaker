'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {parseDef,sectionMap,unquote,kind}=require('./def_model');
const digest=text=>crypto.createHash('sha256').update(text).digest('hex');
const key=file=>path.resolve(file).toLowerCase();
const CODE_FILE=/^(?:st\d*|stcommon|common|cns|cmd|anim)$/;
const STATE_FILE=/^(?:st\d*|stcommon)$/i;

function stageCodeTargets(filename,text,services={},mainStage=true){
 const readText=services.readText||((file)=>fs.readFileSync(file,'utf8')),resolve=services.resolveAsset||((reference,owner)=>path.resolve(path.dirname(owner),reference));
 filename=path.resolve(filename);text=String(text);const document=parseDef(text,filename),stageDependency={filename,fingerprint:digest(text)},targets=[],seen=new Set();
 const stageContext={type:'stage',key:filename,label:path.basename(filename,path.extname(filename)),root:path.dirname(filename),ownerDef:'',files:[filename]};
 const add=target=>{const id=[key(target.filename||filename),target.line??0,key(target.context?.ownerDef||filename),target.label].join('|');if(!seen.has(id)){seen.add(id);targets.push({...target,id});}};
 const stageTarget=(label,line)=>add({label,description:`Stage DEF · line ${line+1}`,filename,line,available:true,context:stageContext,dependencies:[stageDependency]});
 stageTarget('Stage DEF — '+path.basename(filename),0);
 const stageInfo=document.sections.find(section=>section.normalized==='stageinfo'),floorLink=stageInfo?.entries.find(entry=>entry.normalized==='zoffsetlink');
 if(floorLink){
  const value=String(floorLink.value).trim(),id=/^-?\d+$/.test(value)?Number(value):NaN;
  if(!Number.isSafeInteger(id)||id< -2147483648||id>2147483647)add({label:'Linked floor — unresolved zoffsetlink',available:false,description:'StageInfo · line '+(floorLink.line+1),reason:'zoffsetlink needs a literal int32 BG ID before its owner can be resolved.'});
  else if(id>=0){
   const matches=document.sections.filter(section=>/^bg\s/i.test(section.name)).filter(section=>{
    const raw=sectionMap(section).id??'0';return /^-?\d+$/.test(String(raw).trim())&&Number(raw)===id;
   });
   if(matches.length)add({label:'Linked floor — '+matches[0].name+' · ID '+id,description:'Standing-line owner'+(matches.length>1?' · first of '+matches.length+' matching BGs (engine order)':'')+' · line '+(matches[0].line+1),filename,line:matches[0].line,available:true,context:stageContext,dependencies:[stageDependency]});
   else add({label:'Linked floor — missing BG ID '+id,description:'StageInfo · line '+(floorLink.line+1),available:false,reason:'No background matches zoffsetlink '+id+'. Open StageInfo to correct the reference.'});
  }
 }
 for(const section of document.sections){
  if(/^bgctrl(?:def)?(?:\s|$)/i.test(section.name)){
   const values=sectionMap(section);
   stageTarget(section.name+(values.sctrlid?' · controller ID '+values.sctrlid:'')+(values.ctrlid?' · BG IDs '+values.ctrlid:''),section.line);
  }
  else if(/^begin\s+action\s+-?\d+/i.test(section.name))stageTarget('Embedded AIR — '+section.name,section.line);
  else if(section.name)stageTarget(section.name,section.line);
 }
 const info=document.sections.find(s=>s.normalized==='info');
 for(const entry of info?.entries||[]){
  const round=mainStage&&/^round(\d+)def$/i.exec(entry.key);
  if(round){
   const reference=unquote(entry.value),prefix='Round '+round[1]+' / ';
   try{
    if(!reference)throw Error('No round stage file is declared.');
    const variant=path.resolve(resolve(reference,filename)),variantText=String(readText(variant));
    // IKEMEN reads roundXdef only from the main stage.
    for(const target of stageCodeTargets(variant,variantText,services,false)){
     add({...target,label:prefix+target.label,dependencies:[stageDependency,...(target.dependencies||[])]});
    }
   }catch(error){add({label:prefix+reference,description:'Unavailable declared round stage',available:false,reason:error.message});}
   continue;
  }
  if(!require('./stage_attached_declarations').isAttachedDeclaration(entry.key))continue;
  const reference=unquote(entry.value);let charFile,charText,charDocument;
  try{if(!reference)throw Error('No attached-character file is declared.');charFile=path.resolve(resolve(reference,filename));charText=String(readText(charFile));charDocument=parseDef(charText,charFile);if(kind(charDocument)!=='unknown'||!charDocument.sections.some(s=>s.normalized==='files'))throw Error('The declared file is not an attached-character DEF.');}
  catch(error){add({label:entry.key+' — '+reference,description:'Unavailable declared attached character',available:false,reason:error.message});continue;}
  const ownerDependency={filename:charFile,fingerprint:digest(charText)},declared=[];
  for(const section of charDocument.sections.filter(s=>s.normalized==='files'))for(const fileEntry of section.entries){
   if(!CODE_FILE.test(fileEntry.key.toLowerCase()))continue;
   const ref=unquote(fileEntry.value);if(!ref)continue;
   try{
    let source=path.resolve(resolve(ref,charFile)),content;
    try{content=String(readText(source));}
    catch(error){
     if(!STATE_FILE.test(fileEntry.key)||/\.zss$/i.test(ref))throw error;
     source=path.resolve(resolve(ref+'.zss',charFile));content=String(readText(source));
    }
    declared.push({filename:source,key:fileEntry.key,content});
   }catch(error){add({label:`${entry.key} / ${fileEntry.key} — ${ref}`,description:'Unavailable declared source',available:false,reason:error.message});}
  }
  const files=[charFile,...new Set(declared.map(row=>row.filename))],context={type:'character',key:path.dirname(charFile),root:path.dirname(charFile),label:path.basename(charFile,path.extname(charFile)),ownerDef:charFile,files};
  add({attachedKey:entry.normalized,label:`${entry.key} DEF — ${path.basename(charFile)}`,description:'Declared attached character',filename:charFile,line:0,available:true,context,dependencies:[stageDependency,ownerDependency]});
  for(const row of declared)add({assignedKey:row.key,label:`${entry.key} / ${row.key} — ${path.basename(row.filename)}`,description:path.relative(path.dirname(filename),row.filename)+` · ${path.extname(row.filename).slice(1).toUpperCase()}`,filename:row.filename,line:0,available:true,context,dependencies:[stageDependency,ownerDependency,{filename:row.filename,fingerprint:digest(row.content)}]});
 }
 if(mainStage&&services.projectRoot)for(const target of require('./stage_project_lua').stageProjectLua(services.projectRoot,readText))add({...target,dependencies:[stageDependency,...(target.dependencies||[])]});
 return targets;
}

function attachedFunctionTargets(sources, readText) {
 const {collectRecords}=require('./analyzer');
 const targets=[], byFile=new Map();
 for(const source of sources) {
  const text=readText(source.filename);
  if(digest(text)!==source.dependencies.at(-1).fingerprint)continue;
  const file=key(source.filename);
  if(!byFile.has(file))byFile.set(file,collectRecords(text,source.filename));
  const {functions,calls}=byFile.get(file);
  for(const record of [...functions.filter(row=>row.declaration),...calls]) {
   targets.push({...source,line:record.line,character:record.start,
    label:record.declaration?'Function '+record.displaySignature:'Call '+record.name,
    description:source.label+' / '+path.basename(source.context.ownerDef)+' / line '+(record.line+1)});
  }
 }
 return targets;
}

function attachedInteractionTargets(sources, readText) {
 const targets=[];
 for(const source of sources){
  const text=readText(source.filename);
  if(digest(text)!==source.dependencies.at(-1).fingerprint)continue;
  let records;
  if(/\.zss$/i.test(source.filename)){
   const scan=require('./stage_integration').scanStageIntegration(text,source.filename);
   records=[...scan.modifyStageBg.map(row=>({...row,name:'ModifyStageBG'})),...scan.modifyBgCtrl.map(row=>({...row,name:'ModifyBGCtrl'})),...scan.modifyStageVar.map(row=>({...row,name:'ModifyStageVar'}))]
    .map(row=>({name:row.name,line:row.line-1,start:row.index-text.lastIndexOf('\n',row.index-1)-1}));
  }else records=require('./analyzer').collectRecords(text,source.filename).controllers.filter(row=>/^(?:ModifyStageBG|ModifyBGCtrl|ModifyStageVar)$/i.test(row.name));
  for(const row of records)targets.push({...source,line:row.line,character:row.start,label:row.name,description:source.label+' / '+path.basename(source.context.ownerDef)+' / line '+(row.line+1)});
 }
 return targets;
}

async function openStageCode(api,binding,services={}){
 const fallbackRead=services.readText||((file)=>fs.readFileSync(file,'utf8')),isCurrent=binding.isCurrent,documents=new Map();
 // Terminal notifications must not hold the Stage's serialized message queue.
 const notices=require('./stage_terminal_notices').createStageNotices({info:message=>api.window.showInformationMessage(message)});
 const notice=message=>{notices.info(message);notices.flush();return false;};
 const readText=file=>documents.get(key(file))?.getText()??fallbackRead(file);
 const current=()=>{try{return typeof isCurrent==='function'&&isCurrent();}catch{return false;}};
 const retained=()=>{try{return (binding.isRetainedCurrent||isCurrent)();}catch{return false;}};
 if(!current())return notice('Activate the Stage Workspace before opening Stage Code.');
 let targets;
 try{
  // Decode through VS Code before snapshotting. Opening text can normalize BOM/EOL/encoding.
  const stageDocument=await api.workspace.openTextDocument(api.Uri.file(binding.filename));documents.set(key(binding.filename),stageDocument);
  if(!current())return notice('The active Stage changed while opening Stage Code. Try again.');
  for(let pass=0;pass<3;pass++){
   targets=stageCodeTargets(binding.filename,readText(binding.filename),{...services,readText});
   const files=[...new Set(targets.flatMap(target=>(target.dependencies||[]).map(d=>d.filename)))].filter(file=>!documents.has(key(file)));
   if(!files.length)break;
   for(const file of files){documents.set(key(file),await api.workspace.openTextDocument(api.Uri.file(file)));if(!current())return notice('The active Stage changed while opening Stage Code. Try again.');}
  }
  targets=stageCodeTargets(binding.filename,readText(binding.filename),{...services,readText});
 }catch(error){return notice('Stage Code could not read the declared source: '+error.message);}
 const choices=targets.map(target=>({label:target.label,description:target.description,detail:target.reason,target}));
 let picked;
 if(binding.target){
  // Host-owned motion inventory targets may be exact property/write lines,
  // rather than DEF section headings. Never accept this object from a webview.
  const target=binding.target;if(!target.available||!Array.isArray(target.dependencies)||!target.dependencies.length||!target.dependencies.every(d=>digest(String(readText(d.filename)))===d.fingerprint))return notice('The selected motion source changed. Inspect motion owners again.');
  targets=[target];picked={target};
 }else if(binding.controller){
  const {line,heading}=binding.controller;
  picked=choices.find(({target})=>target.filename===binding.filename&&target.line===line&&target.context?.type==='stage'&&(target.label===heading||target.label.startsWith(heading+' ·')));
  if(!picked)return notice('That controller changed. Refresh the Stage Workspace and select it again.');
 }else {
  const reference={label:'Search Stage code reference...',description:'Offline triggers, controllers, Lua functions and DEF parameters',target:{available:true}};
  const functionSources=targets.filter(row=>row.context?.type==='character'&&/\.zss$/i.test(row.filename));
  const functions={label:'Find attached functions and calls...',description:'Search declarations and call sites in assigned ZSS',target:{available:true}};
  const codeSources=targets.filter(row=>row.context?.type==='character'&&/\.(?:zss|cns|cmd|st|inp|jnp)$/i.test(row.filename));
  const interactions={label:'Find attached Stage controls...',description:'Locate background, controller and camera writes',target:{available:true}};
  choices.splice(1,0,reference,...(functionSources.length?[functions]:[]),...(codeSources.length?[interactions]:[]));
  picked=await api.window.showQuickPick(choices,{title:'Stage Code — '+path.basename(binding.filename),placeHolder:'Choose source or search the offline Stage reference',matchOnDescription:true});
  if(picked===interactions && current()){
   targets=attachedInteractionTargets(codeSources,readText);
   if(!targets.length)return notice('No attached Stage controller writes found in the assigned code.');
   picked=await api.window.showQuickPick(targets.map(target=>({label:target.label,description:target.description,target})),{title:'Stage Code - Attached Stage controls',placeHolder:'Search controller, owner or filename',matchOnDescription:true});
  }
  if(picked===functions && current()){
   const symbols=attachedFunctionTargets(functionSources,readText);
   if(!symbols.length)return notice('No attached ZSS functions or calls found in the current sources.');
   targets=symbols;
   picked=await api.window.showQuickPick(symbols.map(target=>({label:target.label,description:target.description,target})),{title:'Stage Code - Attached functions and calls',placeHolder:'Search by name, owner or filename',matchOnDescription:true});
  }
  if(picked===reference && current())return require('./stage_reference_picker').openStageReference(api,current,binding);
 }
 if(!picked)return false;if(!targets.includes(picked.target))return false;const target=picked.target;
 if(!target.available)return notice(target.reason||'The declared source is unavailable.');
 const sourcesCurrent=()=>{try{return target.dependencies.every(d=>digest(String(readText(d.filename)))===d.fingerprint);}catch{return false;}};
 if(!current()||!sourcesCurrent())return notice('Stage Code source or ownership changed while choosing. Open Stage Code again.');
 const document=documents.get(key(target.filename));
 if(!document||key(document.fileName)!==key(target.filename))return notice('The selected Stage Code source is no longer available. Try again.');
 const line=Math.min(target.line,document.getText().split(/\r?\n/).length-1),character=target.character??0,selection=new api.Range(line,character,line,character);
 const presentation=services.presentation?await services.presentation():undefined;if(!current()||!sourcesCurrent())return notice('Stage ownership or source changed while choosing coding presentation.');
 const layoutApi=services.layout||require('./stage_code_layout'),layout=await layoutApi.prepareStageCodeLayout(api,{...binding,presentation,document,selection,context:target.context,isRetainedCurrent:()=>retained()&&sourcesCurrent()},target.context.files);
 if(!retained()||!sourcesCurrent())return notice('Stage Code source or ownership changed before navigation.');
 const editor=await api.window.showTextDocument(document,{...(layout.compact?{viewColumn:layout.nativeColumn}:{}),preview:false,preserveFocus:false,selection});
 // Opening text legitimately changes the active surface; retain exact source/owner checks.
 if(!retained()||!sourcesCurrent()||api.window.activeTextEditor?.document!==document)return false;
 if(layout.compact){const companion=await layoutApi.finishStageCodeLayout(api,layout,document,selection,{files:target.context.files,selectedFile:target.filename,viewColumn:editor.viewColumn,context:target.context});if(!companion)return notice('Stage Code source opened. Coding header ownership/layout changed; no further tabs were moved.');}
 else if(presentation!=='native')notice('Stage Code opened the exact source. The compact header was not moved: '+layout.reason);
 await layout.armReturn?.();
 return true;
}
module.exports={stageCodeTargets,openStageCode};
