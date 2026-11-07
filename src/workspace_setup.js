'use strict';
const path=require('path');
const mapping=require('../data/workspace-setup-map.json');
const KEY='ikemaker.workspaceSetup.v1',DEFAULT_KEY='ikemaker.workspaceSetup.default.v2',SCOPES=['full-game','character','stage','screenpack','storyboard'],COLLABORATION=['solo','team'];
const clone=value=>JSON.parse(JSON.stringify(value));
function normalize(value={}){value=value||{};const configured=value.configured===true;let focuses=Array.isArray(value.focuses)?value.focuses.filter(scope=>SCOPES.includes(scope)):null;if(!focuses){const legacy=String(value.scope||'full-game');focuses=legacy==='ui'?['screenpack','storyboard']:legacy==='full-game'?[...SCOPES]:SCOPES.includes(legacy)?[legacy]:[...SCOPES]}return{configured,focuses:[...new Set(focuses)],collaboration:COLLABORATION.includes(value.collaboration)?value.collaboration:'solo',showAll:configured&&value.showAll===true,pins:[...new Set((value.pins||[]).map(String).filter(Boolean))]};}
function classify(command){if(mapping.sharedCommands.includes(command)||mapping.sharedPrefixes?.some(prefix=>command.startsWith(prefix))||String(command).startsWith('ikemen.workspaceSetup.'))return'shared';for(const rule of mapping.scopeRules)if(rule.prefixes.some(prefix=>command.startsWith(prefix)))return rule.scope;return'full-game';}
function visible(command,setup){const value=normalize(setup);if(!value.configured||value.showAll||value.pins.includes(command))return true;const category=classify(command);return category==='shared'||value.focuses.includes(category);}
function controlVisible(control,setup){const value=normalize(setup);if(mapping.soloControls.includes(control))return true;if(mapping.teamControls.includes(control))return !value.configured||value.collaboration==='team';return true;}
class WorkspaceSetups{
 constructor(storage){this.storage=storage;this.entries=clone(storage?.get(KEY,{}))||{};this.writing=Promise.resolve();}
 read(projectId,defaultProfile){const id=String(projectId||'').toLowerCase();return normalize(Object.prototype.hasOwnProperty.call(this.entries,id)?this.entries[id]:defaultProfile);}
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
function defaultProfile(){return context?.globalState?.get(DEFAULT_KEY)||null;}
function current(){const identity=projectIdentity();return setups?setups.read(identity.id,defaultProfile()):normalize();}
function summary(value=current()){if(!value.configured)return'All tools (not customized)';const names={'full-game':'Full Game',character:'Character',stage:'Stage',screenpack:'Screenpack',storyboard:'Storyboard'},focus=value.focuses.map(scope=>names[scope]).join(', ')||'No focus selected',collaboration=value.collaboration==='team'?'Team':'Single user';return`${focus} · ${collaboration}${value.showAll?' · Show All Tools':''}`;}
function onDidChange(listener){listeners.add(listener);return{dispose:()=>listeners.delete(listener)};}
async function publish(){
 const value=current(),identity=projectIdentity();
 await Promise.allSettled([
  api?.commands?.executeCommand?.('setContext','ikemen.workspaceSetup.configured',value.configured),
  api?.commands?.executeCommand?.('setContext','ikemen.workspaceSetup.scope',value.focuses.join(',')),
  api?.commands?.executeCommand?.('setContext','ikemen.workspaceSetup.collaboration',value.collaboration),
  api?.commands?.executeCommand?.('setContext','ikemen.workspaceSetup.showAll',value.showAll)
 ]);
 for(const listener of [...listeners])try{listener({identity,setup:value});}catch(_){}
 await require('./interface_mode').refresh?.();
}
async function applyPreferences(value,{defaultForNew=false}={}){const identity=projectIdentity(),normalized=normalize({...value,configured:true});if(defaultForNew||!identity.root)await context.globalState.update(DEFAULT_KEY,normalized);if(identity.root)await setups.set(identity.id,normalized);await publish();return normalized;}
async function choose(){
 if(changing)return changing;
 changing=(async()=>{
  return require('./interface_mode').choose(false);
 })().finally(()=>{changing=null;});return changing;
}
async function toggleShowAll(){const value=current();if(!value.configured)return choose();await applyPreferences({...value,showAll:!value.showAll});api.window.showInformationMessage(value.showAll?'Returned to the saved Workspace Setup.':'Showing all IKEMaker tools. Your saved focus remains available.');}
async function pinTool(){
 const identity=projectIdentity(),value=current();if(!value.configured){const configured=await choose();if(!configured)return;}
 const commands=require('../package.json').contributes.commands.filter(item=>!visible(item.command,current())&&!item.command.startsWith('ikemen.workspaceSetup.')).map(item=>({label:item.title,description:item.command,command:item.command}));
 if(!commands.length)return api.window.showInformationMessage('Every contributed tool is already visible in this Workspace Setup.');
 const selected=await api.window.showQuickPick(commands,{title:'Pin an additional tool',placeHolder:'Pinned tools stay visible for this project.',matchOnDescription:true});if(!selected)return;
 await applyPreferences({...current(),pins:[...new Set([...current().pins,selected.command])]});api.window.showInformationMessage(`Pinned ${selected.label} for ${identity.name}.`);
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
module.exports={KEY,DEFAULT_KEY,SCOPES,COLLABORATION,mapping,normalize,classify,visible,controlVisible,WorkspaceSetups,configure,register,projectIdentity,current,defaultProfile,summary,onDidChange,publish,applyPreferences,choose,toggleShowAll,pinTool};
