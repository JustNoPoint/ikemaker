'use strict';
const fs=require('node:fs'),path=require('node:path');
const {hash}=require('./mutation_safety');
const a=require('./stage_attached_authoring');
function identity(filename){const s=fs.lstatSync(filename,{bigint:true});if(!s.isFile()||s.isSymbolicLink())throw Error('Attached entity must be a regular character DEF.');return [s.dev,s.ino,s.birthtimeNs,s.mtimeNs,s.ctimeNs,s.size].join(':');}
function exists(filename){try{fs.lstatSync(filename);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
function openBuffer(api,filename){return api.workspace.textDocuments?.find(d=>!d.isClosed&&a.samePhysical(d.fileName,filename));}
function ownerSnapshot(api,filename){const document=openBuffer(api,filename);return {identity:identity(filename),disk:hash(fs.readFileSync(filename)),text:document?.getText()??fs.readFileSync(filename,'utf8'),version:document?.version,dirty:document?.isDirty===true};}
function assertSnapshot(api,filename,before){const now=ownerSnapshot(api,filename);if(JSON.stringify(now)===JSON.stringify(before))return;const cleanClosed=before.version!==undefined&&before.dirty===false&&now.version===undefined&&now.dirty===false&&now.identity===before.identity&&now.disk===before.disk;if(cleanClosed){const raw=fs.readFileSync(filename);try{if(require('./stage_source_representation').stageDiskEdit(raw,before.text,before.text).equals(raw))return;}catch{}}throw Error('The authored attached character changed during review. Nothing was applied.');}
function assertDestinations(api,plan){for(const filename of plan.files.keys()){if(plan.destinations&&a.canonicalPath(filename)!==plan.destinations.get(filename))throw Error('Destination directory identity changed during review: '+filename);if(exists(filename)||openBuffer(api,filename))throw Error('Nothing was created: destination is occupied or open: '+filename);}}
async function commitAttachedPlan(api,document,plan,services){
 const before=document.getText(),version=document.version,label=services.operationLabel||'Stage attached entity',ownerLabel=services.ownerLabel||'Stage';
 if(!a.samePath(document.fileName,plan.stageFilename)||before!==plan.link.before)throw Error(ownerLabel+' source changed during '+label+' review.');
 const stageIdentity=identity(plan.stageFilename),diskHash=hash(fs.readFileSync(plan.stageFilename));
 const check=()=>{services.assertCurrent();if(document.version!==version||document.getText()!==before||identity(plan.stageFilename)!==stageIdentity||hash(fs.readFileSync(plan.stageFilename))!==diskHash)throw Error(ownerLabel+' changed before the '+label+' edit.');assertDestinations(api,plan);if(plan.targetSnapshot)assertSnapshot(api,plan.targetDef,plan.targetSnapshot);};
 check();const edit=new api.WorkspaceEdit(),metadata={label};
 // Public resource WorkspaceEdits stop on failure and may retain partial work.
 // Create every exclusive resource before adding a potentially dangling link.
 for(const [filename,contents] of plan.files)edit.createFile(api.Uri.file(filename),{overwrite:false,ignoreIfExists:false,contents:Buffer.isBuffer(contents)?contents:Buffer.from(contents)},metadata);
 if(plan.link.text!==before)edit.replace(document.uri,new api.Range(document.positionAt(0),document.positionAt(before.length)),plan.link.text,metadata);
 check();let accepted,error;try{accepted=await api.workspace.applyEdit(edit,{label});}catch(e){error=e;}
 const observed=new Map([...plan.files].map(([filename,text])=>{try{return[filename,!exists(filename)?'not created':hash(fs.readFileSync(filename))===hash(text)?'created (reviewed content)':'created (unexpected content)'];}catch{return[filename,'unknown (unreadable destination)'];}})),created=[...observed].filter(([,state])=>state.startsWith('created')).map(([filename])=>filename),correct=[...observed.values()].every(state=>state==='created (reviewed content)');
 if(error||!accepted||document.getText()!==plan.link.text||!correct){const files=[plan.stageFilename,...plan.files.keys()],failure=Error('VS Code did not confirm the complete '+label+' edit.'+(error?' '+error.message:'')+' Review these exact sources before using native Undo:\n'+files.map(filename=>filename+' — '+(a.samePath(filename,document.fileName)?document.isClosed?'unknown (native source closed)':document.getText()===before?'unchanged':document.getText()===plan.link.text?'changed (reviewed text)':'changed (unexpected text)':observed.get(filename))).join('\n'));failure.partial=document.getText()!==before||[...observed.values()].some(state=>state!=='not created');failure.created=created;failure.affectedSources=files;throw failure;}
 return {applied:true,targetDef:plan.targetDef,created,stageDirty:document.isDirty,nativeCompound:true};
}

// The host opens the exact native Stage document before entry and supplies its
// retained owner/source authority. All prompts recheck that authority afterwards.
async function runAttachedAuthoring(api,env){
 let document=env.document,version=document.version;const stageFilename=document.fileName,text=document.getText();
 const assert=()=>{env.assertCurrent();if(document.version!==version||document.getText()!==text)throw Error('The Stage changed during attached entity authoring. Nothing was applied.');};
 const prompt=async operation=>{assert();const value=await operation();if(env.restoreNativeDocument){document=await env.restoreNativeDocument();version=document.version;}assert();return value;};
 assert();
 const choice=await prompt(()=>api.window.showQuickPick([{label:'Create invisible controller',id:'controller',description:'Stage behavior; add scenery, hazards or helpers as needed'},{label:'Link existing character',id:'existing',description:'Use its authored files unchanged: controller, scenery, NPC, platform or fighter'},{label:'Create full character baseline',id:'character',description:'Clean character files and empty SFF/SND; author with existing tools'}],{title:'Stage attached entity',placeHolder:'Choose an entity workflow'}));
 if(!choice)return {cancelled:true};let plan;
 if(choice.id==='existing'){
  const picked=await prompt(()=>api.window.showOpenDialog({title:'Link authored character DEF',canSelectMany:false,filters:{'Character DEF':['def']}}));if(!picked?.length)return {cancelled:true};
  const targetDef=picked[0].fsPath,targetSnapshot=ownerSnapshot(api,targetDef);a.validateAttachedDef(targetSnapshot.text);
  plan={stageFilename,targetDef,files:new Map(),targetSnapshot,link:a.planAttachedLink(text,stageFilename,targetDef,env)};
 }else{
  const base=path.basename(stageFilename,path.extname(stageFilename));
  const target=await prompt(()=>api.window.showSaveDialog({title:'New attached entity DEF',defaultUri:api.Uri.file(path.join(path.dirname(stageFilename),base+'_entity.def')),filters:{'Character DEF':['def']}}));if(!target)return {cancelled:true};
  const name=await prompt(()=>api.window.showInputBox({title:'Attached entity name',value:path.basename(target.fsPath,'.def'),validateInput:value=>value.trim()?undefined:'Enter an entity name.'}));if(!name)return {cancelled:true};
  plan=a.planAttachedCreation(text,stageFilename,target.fsPath,{profile:choice.id,name,resolveAsset:env.resolveAsset});assertDestinations(api,plan);
 }
 if(plan.link.alreadyLinked&&!plan.files.size){Promise.resolve(api.window.showInformationMessage('This character is already linked to the Stage.')).catch(()=>{});return {alreadyLinked:true,targetDef:plan.targetDef};}
 const answer=await prompt(()=>api.window.showInformationMessage('Review Stage attached entity',{modal:true,detail:a.attachedReview(plan)},'Apply Attached Entity'));if(answer!=='Apply Attached Entity')return {cancelled:true};
 assert();assertDestinations(api,plan);if(plan.targetSnapshot)assertSnapshot(api,plan.targetDef,plan.targetSnapshot);
 const result=await (env.commit||commitAttachedPlan)(api,document,plan,{assertCurrent:assert});
 await env.refresh?.(result);Promise.resolve(api.window.showInformationMessage('Attached entity applied. Save the Stage DEF to use its binding in game. Use Stage Code / Move Lab to author the exact linked owner.')).catch(()=>{});return result;
}
module.exports={identity,ownerSnapshot,assertSnapshot,assertDestinations,commitAttachedPlan,runAttachedAuthoring};

