'use strict';
const path=require('path');
const mapping=require('../data/workspace-setup-map.json');
const KEY='ikemaker.workspaceSetup.v1',SCOPES=['full-game','character','stage','ui'],COLLABORATION=['solo','team'];
const clone=value=>JSON.parse(JSON.stringify(value));
function normalize(value={}){const configured=value.configured===true;return{configured,scope:SCOPES.includes(value.scope)?value.scope:'full-game',collaboration:COLLABORATION.includes(value.collaboration)?value.collaboration:'solo',showAll:configured&&value.showAll===true,pins:[...new Set((value.pins||[]).map(String).filter(Boolean))]};}
function classify(command){if(mapping.sharedCommands.includes(command)||String(command).startsWith('ikemen.workspaceSetup.'))return'shared';for(const rule of mapping.scopeRules)if(rule.prefixes.some(prefix=>command.startsWith(prefix)))return rule.scope;return'full-game';}
function visible(command,setup){const value=normalize(setup);if(!value.configured||value.showAll||value.pins.includes(command)||value.scope==='full-game')return true;const category=classify(command);return category==='shared'||category===value.scope;}
function controlVisible(control,setup){const value=normalize(setup);if(!value.configured||value.showAll)return true;if(mapping.soloControls.includes(control))return true;if(mapping.teamControls.includes(control))return value.collaboration==='team';return true;}
class WorkspaceSetups{
 constructor(storage){this.storage=storage;this.entries=clone(storage?.get(KEY,{}))||{};this.writing=Promise.resolve();}
 read(projectId){return normalize(this.entries[String(projectId||'').toLowerCase()]);}
 async set(projectId,value){const id=String(projectId||'').trim().toLowerCase();if(!id)throw Error('A project identity is required.');this.entries={...this.entries,[id]:normalize({...value,configured:true})};await this.flush();return this.read(id);}
 async showAll(projectId,enabled=true){const current=this.read(projectId);return this.set(projectId,{...current,showAll:Boolean(enabled)});}
 async pin(projectId,command,enabled=true){const current=this.read(projectId),pins=new Set(current.pins);enabled?pins.add(command):pins.delete(command);return this.set(projectId,{...current,pins:[...pins]});}
 flush(){const snapshot=clone(this.entries);this.writing=this.writing.catch(()=>{}).then(()=>this.storage?.update(KEY,snapshot));return this.writing;}
}

let api,context,setups,lastIdentity,listeners=new Set(),changing;
function fileUri(uri){return uri?.scheme==='file'?uri:null;}
function uriFromTab(tab){return fileUri(tab?.input?.uri||tab?.input?.modified||tab?.input?.notebookUri);}
function activeUri(){
 const editor=api?.window?.activeTextEditor;if(fileUri(editor?.document?.uri))return editor.document.uri;
 const active=uriFromTab(api?.window?.tabGroups?.activeTabGroup?.activeTab);if(active)return active;
 for(const group of api?.window?.tabGroups?.all||[]){const uri=uriFromTab(group.activeTab);if(uri)return uri;}
 for(const visible of api?.window?.visibleTextEditors||[]){const uri=fileUri(visible?.document?.uri);if(uri)return uri;}
 return null;
}
function projectIdentity(){
 if(!api)return{id:'unconfigured',projectId:'universal',name:'Current project',root:''};
 const uri=activeUri(),workspace=(uri&&api.workspace.getWorkspaceFolder?.(uri)?.uri?.fsPath)||api.workspace.workspaceFolders?.[0]?.uri?.fsPath||'';
 const seed=uri?.fsPath||workspace;
 if(!seed)return lastIdentity||{id:'unconfigured',projectId:'universal',name:'Current project',root:''};
 const gameRoot=require('./character_context').gameRoot(seed)||workspace||path.dirname(seed);
 let project={id:'universal',name:path.basename(gameRoot)||'Current project'},registry='';
 try{
  const metadata=require('./metadata_registry'),filename=metadata.find(seed)||metadata.find(gameRoot);
  if(filename){const loaded=metadata.read(filename);registry=filename;project=require('./project_context_model').contextFor(seed,gameRoot,loaded.registry).project||project;}
  else project=require('./project_context_model').inferredProject(seed)||project;
 }catch(_){/* Presentation setup must never block authoring when metadata is incomplete. */}
 const boundary=path.resolve(registry||gameRoot||workspace).replace(/\\/g,'/').toLowerCase();
 lastIdentity={id:`${boundary}::${project.id||'universal'}`,projectId:project.id||'universal',name:project.name||project.id||'Current project',root:gameRoot||workspace};return lastIdentity;
}
function current(){const identity=projectIdentity();return setups?setups.read(identity.id):normalize();}
function summary(value=current()){if(!value.configured)return'All Workspace tools (not customized)';const scope=({'full-game':'Full Game',character:'Character',stage:'Stage',ui:'UI / Screenpack'})[value.scope],collaboration=value.collaboration==='team'?'Team':'Solo';return`${scope} · ${collaboration}${value.showAll?' · Show All Tools':''}`;}
function onDidChange(listener){listeners.add(listener);return{dispose:()=>listeners.delete(listener)};}
async function publish(){
 const value=current(),identity=projectIdentity();
 await Promise.allSettled([
  api?.commands?.executeCommand?.('setContext','ikemen.workspaceSetup.configured',value.configured),
  api?.commands?.executeCommand?.('setContext','ikemen.workspaceSetup.scope',value.scope),
  api?.commands?.executeCommand?.('setContext','ikemen.workspaceSetup.collaboration',value.collaboration),
  api?.commands?.executeCommand?.('setContext','ikemen.workspaceSetup.showAll',value.showAll)
 ]);
 for(const listener of [...listeners])try{listener({identity,setup:value});}catch(_){}
 await require('./interface_mode').refresh?.();
}
async function choose(){
 if(changing)return changing;
 changing=(async()=>{
  const identity=projectIdentity();if(!identity.root)return api.window.showWarningMessage('Open a project folder before changing Workspace Setup.');
  const scopeChoice=await api.window.showQuickPick([
   {label:'Full Game',description:'Show tools for characters, stages, UI, testing, and release work.',value:'full-game'},
   {label:'Single Component — Character',description:'Focus on character code, animations, sprites, sounds, palettes, moves, throws, and helpers.',value:'character'},
   {label:'Single Component — Stage',description:'Focus on stage files, Stage Rig, parallax, animation, and stage testing.',value:'stage'},
   {label:'Single Component — UI / Screenpack',description:'Focus on roster, menus, stories, storyboards, screenpacks, and fight UI.',value:'ui'}
  ],{title:`${identity.name} — Workspace Setup`,placeHolder:'This changes what is shown, never what IKEMaker can open.',ignoreFocusOut:true});if(!scopeChoice)return false;
  const collaboration=await api.window.showQuickPick([
   {label:'Solo',description:'Keep personal tasks and issue notes; hide team assignment and handoff controls.',value:'solo'},
   {label:'Team',description:'Show team assignment, handoff, and review controls.',value:'team'}
  ],{title:'How is this project being made?',placeHolder:'You can change this later without changing project files.',ignoreFocusOut:true});if(!collaboration)return false;
  await setups.set(identity.id,{scope:scopeChoice.value,collaboration:collaboration.value,showAll:false,pins:current().pins});await publish();
  api.window.showInformationMessage(`${identity.name}: ${summary()}. Workspace Setup only changes presentation; open files and unfinished drafts remain intact.`);return true;
 })().finally(()=>{changing=null;});return changing;
}
async function toggleShowAll(){const identity=projectIdentity(),value=current();if(!value.configured)return choose();await setups.showAll(identity.id,!value.showAll);await publish();api.window.showInformationMessage(value.showAll?'Returned to the saved Workspace Setup.':'Showing all IKEMaker tools. Your saved focus remains available.');}
async function pinTool(){
 const identity=projectIdentity(),value=current();if(!value.configured){const configured=await choose();if(!configured)return;}
 const commands=require('../package.json').contributes.commands.filter(item=>!visible(item.command,current())&&!item.command.startsWith('ikemen.workspaceSetup.')).map(item=>({label:item.title,description:item.command,command:item.command}));
 if(!commands.length)return api.window.showInformationMessage('Every contributed tool is already visible in this Workspace Setup.');
 const selected=await api.window.showQuickPick(commands,{title:'Pin an additional tool',placeHolder:'Pinned tools stay visible for this project.',matchOnDescription:true});if(!selected)return;
 await setups.pin(identity.id,selected.command,true);await publish();api.window.showInformationMessage(`Pinned ${selected.label} for ${identity.name}.`);
}
function configure(vscode,extensionContext){api=vscode;context=extensionContext;setups=new WorkspaceSetups(context.workspaceState);}
function register(vscode,extensionContext){
 configure(vscode,extensionContext);
 const changed=()=>{const before=lastIdentity?.id;const next=projectIdentity().id;if(before&&before!==next)publish().catch(()=>{});};
 extensionContext.subscriptions.push(
  vscode.commands.registerCommand('ikemen.workspaceSetup.change',choose),
  vscode.commands.registerCommand('ikemen.workspaceSetup.showAll',toggleShowAll),
  vscode.commands.registerCommand('ikemen.workspaceSetup.pin',pinTool),
  vscode.window.onDidChangeActiveTextEditor(changed),
  vscode.window.tabGroups?.onDidChangeTabs?.(changed)||{dispose(){}},
  {dispose(){listeners.clear();}}
 );
 void publish();
}
module.exports={KEY,SCOPES,COLLABORATION,mapping,normalize,classify,visible,controlVisible,WorkspaceSetups,configure,register,projectIdentity,current,summary,onDidChange,publish,choose,toggleShowAll,pinTool};
