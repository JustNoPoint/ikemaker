'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createEntitySwitchCoordinator } = require('./entity_switch_coordinator');
const { createEntitySwitchHost } = require('./entity_switch_host');
const { PREVIOUS_MESSAGE, READY_MESSAGE, STATE_MESSAGE } = require('./entity_header');

const STATE_KEY = 'ikemaker.entitySwitchRuntime.v1';
const STATE_VERSION = 1;
const MAX_PERSISTED_ENTITIES = 64;
const MAX_PERSISTED_BYTES = 2 * 1024 * 1024;
let activeRuntime = null;

function key(value) { const resolved=path.resolve(String(value||'.'));return process.platform==='win32'?resolved.toLocaleLowerCase('en-US'):resolved; }
function hash(value) { return crypto.createHash('sha256').update(String(value||'')).digest('hex'); }
function plain(value) { return Boolean(value)&&typeof value==='object'&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null); }
function boundedState(value){try{const encoded=JSON.stringify(value);return encoded&&Buffer.byteLength(encoded,'utf8')<=MAX_PERSISTED_BYTES?JSON.parse(encoded):null;}catch{return null;}}
function navigationState(value){
  const blocked=/(?:draft|edit|content|buffer|dirty|undo|redo|changes?|payload|pixelData|imageData|sourceText)/i,seen=new Set();
  const copy=(item,keyName='')=>{if(blocked.test(keyName))return undefined;if(item===null||['string','boolean'].includes(typeof item))return item;if(typeof item==='number')return Number.isFinite(item)?item:undefined;if(!item||typeof item!=='object'||seen.has(item))return undefined;seen.add(item);let output;if(Array.isArray(item))output=item.map(entry=>copy(entry)).filter(entry=>entry!==undefined);else{output=Object.create(null);for(const [name,entry] of Object.entries(item)){if(['__proto__','prototype','constructor'].includes(name))continue;const kept=copy(entry,name);if(kept!==undefined)output[name]=kept;}}seen.delete(item);return output;};
  const result=copy(value);return result===undefined?null:boundedState(result);
}

function classifyDef(filename,text=''){
  const name=path.basename(filename).toLowerCase();
  if(/^\s*\[\s*(?:bgdef|camera|stageinfo|playerinfo)\s*\]/im.test(text))return'stage';
  if(['system.def','fight.def','select.def'].includes(name)||/^\s*\[\s*(?:title info|select info)\s*\]/im.test(text))return'screenpack';
  return'character';
}

function ownerForEntry(entry){
  const type=String(entry?.type||entry?.kind||'').toLowerCase();
  if(type==='character')return typeof entry.ownerDef==='string'&&path.isAbsolute(entry.ownerDef)?path.resolve(entry.ownerDef):'';
  if(['stage','screenpack'].includes(type)){const candidate=entry.key||entry.files?.[0];return typeof candidate==='string'&&path.isAbsolute(candidate)?path.resolve(candidate):'';}
  if(type==='workspace'){const candidate=entry.key||entry.files?.[0];return typeof candidate==='string'&&path.isAbsolute(candidate)?path.resolve(candidate):'';}
  return'';
}

function projectIdFor(vscode,ownerFile){
  let root='';
  try{root=vscode.workspace.getWorkspaceFolder?.(vscode.Uri.file(ownerFile))?.uri?.fsPath||vscode.workspace.workspaceFile?.fsPath||vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath||path.dirname(ownerFile);}catch{root=path.dirname(ownerFile);}
  return`project-${hash(key(root)).slice(0,32)}`;
}
function projectLabelFor(vscode,ownerFile){try{const root=vscode.workspace.getWorkspaceFolder?.(vscode.Uri.file(ownerFile))?.uri?.fsPath||vscode.workspace.workspaceFile?.fsPath||vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath||'';return root?path.basename(root,path.extname(root)):'';}catch{return'';}}

function evidenceFor(entries,vscode){
  const dirtyFiles=new Set((vscode.workspace.textDocuments||[]).filter(document=>document&&!document.isClosed&&document.isDirty&&document.fileName).map(document=>key(document.fileName)));
  const owners=new Map();
  for(const entry of entries||[])for(const filename of entry.files||[]){const fileKey=key(filename);if(!owners.has(fileKey))owners.set(fileKey,new Set());owners.get(fileKey).add(String(entry.identity||entry.id||ownerForEntry(entry)));}
  return{dirtyFiles,owners};
}

function descriptorForEntry(entry,vscode,evidence=evidenceFor([entry],vscode)){
  const rawType=String(entry?.type||entry?.kind||'').toLowerCase(),kind=rawType==='project'?'workspace':rawType,ownerFile=ownerForEntry({...entry,type:kind});
  if(!['character','stage','screenpack','workspace'].includes(kind)||!ownerFile)return null;
  if(kind==='character'&&path.extname(ownerFile).toLowerCase()!=='.def')return null;
  const files=[...new Set([ownerFile,...(entry.files||[])].filter(Boolean).map(value=>path.resolve(value)))],dirty=Boolean(entry.draftLease)||files.some(filename=>evidence.dirtyFiles.has(key(filename))),sharedFiles=files.filter(filename=>(evidence.owners.get(key(filename))?.size||0)>1),shared=sharedFiles.length>0;
  const notes=[ownerFile,`Files: ${files.map(filename=>path.basename(filename)).join(', ')}`];
  if(dirty){const changed=files.filter(filename=>evidence.dirtyFiles.has(key(filename))).map(filename=>path.basename(filename));if(entry.draftLease?.owner)changed.push(`${entry.draftLease.owner} draft`);notes.push(`Modified: ${changed.join(', ')||'retained viewer draft'}`);}
  if(shared)notes.push(`Shared: ${sharedFiles.map(filename=>path.basename(filename)).join(', ')}`);
  return{kind,projectId:projectIdFor(vscode,ownerFile),ownerFile,label:String(entry.label||path.basename(ownerFile,path.extname(ownerFile))),detail:notes.join(' · '),dirty,shared,supported:true,unavailableReason:'',transferPinned:false};
}

class EntitySwitchRuntime{
  constructor(vscode,context,services={}){
    this.vscode=vscode;this.context=context;this.services=services;this.coordinator=services.coordinator||createEntitySwitchCoordinator();this.attachments=new Map();this.canonical=new Map();this.closedResources=new Map();this.disposed=false;this.suppressPersist=false;
    this.host=services.host||createEntitySwitchHost({coordinator:this.coordinator,openEntity:request=>this.openEntity(request),focusEntity:request=>require('./entity_viewer_focus').focusEntityViewer(this,request),closeEntity:request=>this.closeEntity(request),restoreEntity:request=>this.restoreEntity(request)});
    this.registry=services.registry||require('./authoring_context_registry');
    this.restore();this.lastEntries=[];
    this.registrySubscription=this.registry.subscribeRegistry?.(snapshot=>{this.lastEntries=snapshot;this.observe(snapshot);});
    const refresh=()=>this.observe(this.lastEntries);
    this.documentSubscriptions=[this.vscode.workspace.onDidChangeTextDocument?.(refresh),this.vscode.workspace.onDidSaveTextDocument?.(refresh),this.vscode.workspace.onDidCloseTextDocument?.(refresh)].filter(Boolean);
    this.persistSubscription=this.coordinator.subscribe(()=>{this.persist();this.updateCommandContext();});
    this.commandSubscription=this.vscode.commands&&typeof this.vscode.commands.registerCommand==='function'?this.vscode.commands.registerCommand('ikemen.entity.previous',()=>this.previous()):null;
    if(this.commandSubscription)context?.subscriptions?.push?.(this.commandSubscription);
    this.updateCommandContext();
    context?.subscriptions?.push?.({dispose:()=>this.dispose()});
  }

  observe(entries=[]){
    if(this.disposed)return;
    const evidence=evidenceFor(entries,this.vscode),snapshot=this.coordinator.snapshot(),existing=new Map([...snapshot.entities,...(snapshot.closedEntities||[])].map(item=>[item.identity,item])),prepared=entries.map(entry=>descriptorForEntry(entry,this.vscode,evidence)).filter(Boolean),counts=new Map();
    for(const descriptor of prepared)counts.set(descriptor.label.toLocaleLowerCase('en-US'),(counts.get(descriptor.label.toLocaleLowerCase('en-US'))||0)+1);
    const closedIds=new Set((snapshot.closedEntities||[]).map(item=>item.identity));
    for(const source of prepared){const descriptor=counts.get(source.label.toLocaleLowerCase('en-US'))>1?{...source,label:`${source.label} — ${projectLabelFor(this.vscode,source.ownerFile)||path.basename(path.dirname(source.ownerFile))} · ${path.basename(source.ownerFile)}`} : source;const identity=`${descriptor.kind}\0${descriptor.projectId}\0${process.platform==='win32'?path.normalize(descriptor.ownerFile).toLocaleLowerCase('en-US'):path.normalize(descriptor.ownerFile)}`,prior=existing.get(identity);if(!prior)this.coordinator.register(descriptor,{active:!this.coordinator.snapshot().activeIdentity});else{const patch={label:descriptor.label,detail:descriptor.detail,dirty:descriptor.dirty,shared:descriptor.shared,transferPinned:descriptor.transferPinned,...(closedIds.has(identity)?{}:{supported:descriptor.supported,unavailableReason:descriptor.unavailableReason})};if(Object.entries(patch).some(([name,value])=>prior[name]!==value))this.coordinator.update(identity,patch);}}
  }

  attach(panel,options={}){
    if(this.disposed)throw new Error('The synchronized entity runtime is disposed.');
    if(!panel?.webview||typeof options.createAdapter!=='function'||typeof options.surfaceId!=='string'||!options.surfaceId.trim())throw new TypeError('A synchronized entity surface requires a panel, surfaceId, and adapter factory.');
    if(this.attachments.has(panel))return this.attachments.get(panel).public;
    const record={panel,options:{...options,surfaceId:options.surfaceId.trim()},header:null,adapter:null,disposed:false,public:null};
    record.public={dispose:()=>this.detach(panel)};this.attachments.set(panel,record);
    // Transfer endpoints and legacy duplicate ordinary panels must not receive
    // the global active projection: their content intentionally remains pinned,
    // so an observer header would make a false ownership claim. They remain
    // eligible for promotion after the canonical ordinary panel closes.
    if(options.transferPinned===true||this.canonical.has(record.options.surfaceId))this._exclude(record);
    else this._promote(record);
    record.panelDisposal=panel.onDidDispose?.(()=>this.detach(panel));
    this.updateCommandContext();
    return record.public;
  }

  detach(panel){
    const record=this.attachments.get(panel);if(!record||record.disposed)return false;
    record.disposed=true;record.header?.dispose?.();record.excludedHeader?.dispose?.();record.adapter?.dispose?.();record.panelDisposal?.dispose?.();this.attachments.delete(panel);
    if(this.canonical.get(record.options.surfaceId)===record){this.canonical.delete(record.options.surfaceId);const replacement=[...this.attachments.values()].find(item=>!item.disposed&&item.options.surfaceId===record.options.surfaceId&&item.options.transferPinned!==true);if(replacement){replacement.header?.dispose?.();replacement.header=null;this._promote(replacement);}}
    this.updateCommandContext();return true;
  }

  _exclude(record){
    record.excluded=true;
    const publish=()=>{
      if(record.disposed||!record.excluded)return;
      const reason=record.options.transferPinned===true?'Pinned Transfer pane. Use the main viewer header to switch entities.':'Independent viewer pane. Use the main viewer header to switch entities.';
      // Empty disabled state conveys no global active entity and grants no
      // switch/open/restore authority to this intentionally independent pane.
      record.panel.webview.postMessage({type:STATE_MESSAGE,revision:this.coordinator.snapshot().revision,activeIdentity:'',previousIdentity:'',canOpen:false,entities:[],closedEntities:[],openUnavailableReason:reason,status:reason});
    };
    record.excludedHeader=record.panel.webview.onDidReceiveMessage?.(message=>{if(message?.type===READY_MESSAGE&&Object.keys(message).length===1)publish();});
    publish();
  }
  _promote(record){record.excludedHeader?.dispose?.();record.excludedHeader=null;const adapter=record.options.createAdapter();if(!adapter||adapter.surfaceId!==record.options.surfaceId)throw new Error(`The ${record.options.surfaceId} adapter does not match its surface.`);const lease=this.host.registerAdapter(adapter);try{record.header=this.host.registerHeader(record.panel,{surfaceId:record.options.surfaceId,adapterId:adapter.id});record.adapter=lease;this.canonical.set(record.options.surfaceId,record);record.excluded=false;}catch(error){lease.dispose();throw error;}}

  async openEntity(){
    const picked=await this.vscode.window.showOpenDialog?.({title:'Open IKEMaker entity definition',canSelectMany:false,filters:{'IKEMEN definitions':['def']}});if(!picked?.[0])return{status:'cancelled'};
    const filename=path.resolve(picked[0].fsPath||'' );
    try{const stat=fs.statSync(filename);if(!stat.isFile()||stat.size>4*1024*1024)throw new Error('The selected definition is not a bounded readable file.');const text=fs.readFileSync(filename,'utf8'),kind=classifyDef(filename,text),descriptor={kind,projectId:projectIdFor(this.vscode,filename),ownerFile:filename,label:path.basename(filename,path.extname(filename)),detail:filename,dirty:false,shared:false,supported:true,unavailableReason:'',transferPinned:false},identity=this.coordinator.register(descriptor);return{status:'opened',identity};}catch(error){return{status:'failed',reason:`Open Entity could not load that definition: ${error.message}`};}
  }

  async previous(){const snapshot=this.coordinator.snapshot(),panel=this.host.headers.keys().next().value;if(!panel||!snapshot.previousIdentity||!this.host.ready()){await this.vscode.window.showInformationMessage?.('No safely synchronized previous entity is available.');return{status:'unavailable'};}return this.host.handleMessage(panel,{type:PREVIOUS_MESSAGE,revision:snapshot.revision});}
  updateCommandContext(){const snapshot=this.coordinator.snapshot();Promise.resolve(this.vscode.commands?.executeCommand?.('setContext','ikemen.entitySwitchReady',Boolean(this.host.ready()&&snapshot.previousIdentity))).catch(()=>{});}

  resourcesFor(identity){
    const entity=[...this.coordinator.snapshot().entities,...(this.coordinator.snapshot().closedEntities||[])].find(item=>item.identity===identity),owner=entity?.ownerFile?path.resolve(entity.ownerFile):'';
    const entry=(this.lastEntries||[]).find(item=>key(ownerForEntry(item))===key(owner));
    return[...new Set([owner,...(entry?.files||[])].filter(filename=>typeof filename==='string'&&path.isAbsolute(filename)).map(filename=>path.resolve(filename)))].slice(0,512);
  }

  async closeEntity({identity,panel}={}){
    const snapshot=this.coordinator.snapshot(),entity=snapshot.entities.find(item=>item.identity===identity);
    if(!entity)return{status:'unchanged',reason:'That entity is not currently loaded.'};
    const dirty=()=>{const current=this.coordinator.snapshot().entities.find(item=>item.identity===identity),resources=this.resourcesFor(identity).map(key);return current?.dirty||(this.vscode.workspace.textDocuments||[]).some(doc=>doc.isDirty&&resources.includes(key(doc.fileName)));};
    if(dirty())return{status:'unavailable',reason:'Save or revert this entity’s text edits and retained preview draft before unloading it. No files were changed.'};
    if(snapshot.pending)return{status:'unavailable',reason:'Wait for the current entity switch before unloading this tab.'};
    if(identity===snapshot.activeIdentity){
      const next=snapshot.entities.find(item=>item.identity!==identity&&item.supported!==false&&!item.dirty);
      if(!next||!panel||!this.host.ready())return{status:'unavailable',reason:'Open another safely synchronized entity before unloading the last active entity. Its files and preview remain open.'};
      const switched=await this.host.handleMessage(panel,{type:require('./entity_header').SWITCH_MESSAGE,identity:next.identity,revision:snapshot.revision});
      if(switched.status!=='committed')return{status:switched.status,reason:switched.reason||'The active entity could not be safely left; it remains loaded.'};
      const after=this.coordinator.snapshot();if(after.activeIdentity!==next.identity||after.pending||dirty())return{status:'unavailable',reason:'The entity context changed while closing. The requested entity remains loaded.'};
    }
    const current=this.coordinator.snapshot().entities.find(item=>item.identity===identity);if(!current)return{status:'unchanged'};
    const resources=this.resourcesFor(identity);this.closedResources.set(identity,resources);
    this.coordinator.retain(identity,navigationState(current.retainedState));this.coordinator.close(identity);
    return{status:'closed',identity};
  }

  async restoreEntity({identity}={}){
    const entity=(this.coordinator.snapshot().closedEntities||[]).find(item=>item.identity===identity);
    if(!entity)return{status:'unchanged',reason:'That entity is not in Restore Closed Entity.'};
    const fail=message=>{try{this.coordinator.update(identity,{supported:false,unavailableReason:message});}catch{}return{status:'unavailable',reason:message};};
    try{
      if(!path.isAbsolute(entity.ownerFile))return fail('The closed entity owner is no longer an absolute path.');
      const ownerStat=fs.statSync(entity.ownerFile);if(!ownerStat.isFile())return fail('The closed entity owner is no longer a file.');
      if(entity.kind!=='workspace'){
        if(ownerStat.size>4*1024*1024)return fail('The closed entity definition is too large to revalidate safely.');
        const currentKind=classifyDef(entity.ownerFile,fs.readFileSync(entity.ownerFile,'utf8'));if(currentKind!==entity.kind)return fail(`The closed entity owner now describes a ${currentKind}, not a ${entity.kind}.`);
      }
      for(const filename of this.closedResources.get(identity)||[entity.ownerFile]){const stat=fs.statSync(filename);if(!stat.isFile())return fail(`A retained entity resource is no longer a file: ${path.basename(filename)}`);}
    }catch(error){return fail(`The closed entity cannot be restored because an owner or retained resource is unavailable: ${error.message}`);}
    if(entity.supported===false)this.coordinator.update(identity,{supported:true,unavailableReason:''});
    this.coordinator.restoreClosed(identity);
    return{status:'restored',identity};
  }

  restore(){
    const raw=boundedState(this.context?.workspaceState?.get?.(STATE_KEY,null));if(!plain(raw)||raw.version!==STATE_VERSION||!Array.isArray(raw.entities))return false;this.suppressPersist=true;
    try{for(const item of raw.entities.slice(0,MAX_PERSISTED_ENTITIES)){if(!plain(item)||!plain(item.descriptor))continue;const descriptor=item.descriptor;try{if(!path.isAbsolute(descriptor.ownerFile)||!fs.existsSync(descriptor.ownerFile))continue;this.coordinator.register(descriptor,{retainedState:navigationState(item.retainedState),pinned:item.pinned===true,active:item.identity===raw.activeIdentity});}catch{}}
      const wanted=raw.entities.map(item=>item.identity).filter(Boolean);for(let index=wanted.length-1;index>=0;index-=1){const identity=wanted[index];if(this.coordinator.snapshot().entities.some(item=>item.identity===identity))try{this.coordinator.reorder(identity,index+1<wanted.length?wanted[index+1]:null);}catch{}}
      for(const item of (Array.isArray(raw.closedEntities)?raw.closedEntities:[]).slice(0,Math.max(0,MAX_PERSISTED_ENTITIES-this.coordinator.snapshot().entities.length))){if(!plain(item)||!plain(item.descriptor))continue;try{const identity=this.coordinator.register(item.descriptor,{retainedState:navigationState(item.retainedState),pinned:item.pinned===true});this.closedResources.set(identity,Array.isArray(item.resources)?item.resources.filter(filename=>typeof filename==='string'&&path.isAbsolute(filename)).slice(0,512):[item.descriptor.ownerFile]);this.coordinator.close(identity);}catch{}}
      return true;
    }finally{this.suppressPersist=false;}
  }

  persist(){
    if(this.disposed||this.suppressPersist||!this.context?.workspaceState?.update)return false;const snapshot=this.coordinator.snapshot(),descriptor=item=>({kind:item.kind,projectId:item.projectId,ownerFile:item.ownerFile,label:item.label,detail:item.detail,dirty:false,shared:item.shared,supported:item.supported,unavailableReason:item.unavailableReason,transferPinned:item.transferPinned}),loaded=snapshot.entities.slice(0,MAX_PERSISTED_ENTITIES),closed=(snapshot.closedEntities||[]).slice(0,Math.max(0,MAX_PERSISTED_ENTITIES-loaded.length)),state=boundedState({version:STATE_VERSION,activeIdentity:snapshot.activeIdentity,previousIdentity:snapshot.previousIdentity,entities:loaded.map(item=>({identity:item.identity,descriptor:descriptor(item),pinned:item.pinned,retainedState:navigationState(item.retainedState)})),closedEntities:closed.map(item=>({identity:item.identity,descriptor:descriptor(item),pinned:item.pinned,retainedState:navigationState(item.retainedState),resources:this.closedResources.get(item.identity)||[item.ownerFile]}))});if(!state)return false;Promise.resolve(this.context.workspaceState.update(STATE_KEY,state)).catch(()=>{});return true;
  }

  dispose(){if(this.disposed)return false;this.disposed=true;this.registrySubscription?.dispose?.();this.persistSubscription?.dispose?.();this.commandSubscription?.dispose?.();for(const subscription of this.documentSubscriptions||[])subscription?.dispose?.();for(const panel of [...this.attachments.keys()])this.detach(panel);this.host.dispose();Promise.resolve(this.vscode.commands?.executeCommand?.('setContext','ikemen.entitySwitchReady',false)).catch(()=>{});if(activeRuntime===this)activeRuntime=null;return true;}
}

function initializeEntitySwitchRuntime(vscode,context,services={}){activeRuntime?.dispose?.();activeRuntime=new EntitySwitchRuntime(vscode,context,services);return activeRuntime;}
function attachEntitySurface(panel,options){return activeRuntime?.attach(panel,options)||{dispose(){}};}
function currentEntitySwitchRuntime(){return activeRuntime;}

module.exports={STATE_KEY,STATE_VERSION,MAX_PERSISTED_ENTITIES,MAX_PERSISTED_BYTES,classifyDef,ownerForEntry,projectIdFor,projectLabelFor,evidenceFor,descriptorForEntry,navigationState,EntitySwitchRuntime,initializeEntitySwitchRuntime,attachEntitySurface,currentEntitySwitchRuntime};
