'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { hash } = require('./mutation_safety');
const { createSffTransferMode } = require('./sff_transfer_mode');

let host = null;

function canonical(filename) { const resolved=path.resolve(filename);return process.platform==='win32'?resolved.toLocaleLowerCase('en-US'):resolved; }
function endpointForFile(filename, entityIdentity, label) {
  const exact=path.resolve(filename),bytes=fs.readFileSync(exact);
  return { kind:'sff', entityIdentity:String(entityIdentity||`sff-file:${canonical(exact)}`), fileIdentity:exact, fingerprint:hash(bytes), label:String(label||path.basename(exact)) };
}
function sameFile(left,right){return canonical(left)===canonical(right);}
function exactDragAuthority(snapshot,sourceHandleId,authority){
  if(!authority||typeof authority!=='object'||Array.isArray(authority)||Object.keys(authority).sort().join('|')!=='generation|schema|selection|sessionId|sourceHandleId')throw new Error('The Transfer drag authority is malformed.');
  if(authority.schema!=='ikemaker.sff-transfer-drag'||authority.sessionId!==snapshot.session.sessionId||authority.generation!==snapshot.session.generation||authority.sourceHandleId!==sourceHandleId)throw new Error('The Transfer drag belongs to a stale or different endpoint session.');
  if(!Array.isArray(authority.selection)||!authority.selection.length||authority.selection.length>512)throw new Error('The Transfer drag must contain an exact bounded source selection.');
  return authority.selection;
}
function exactDestinationBoundary(archive,boundary){
  if(!boundary||typeof boundary!=='object'||Array.isArray(boundary)||Object.keys(boundary).sort().join('|')!=='id|kind|position'||boundary.kind!=='between-sprites')throw new Error('The Transfer drop boundary is malformed.');
  const match=/^(-?\d+),(-?\d+)@(\d+)$/.exec(String(boundary.id||'')),position=Number(boundary.position);if(!match||!Number.isSafeInteger(position))throw new Error('The Transfer drop boundary is invalid.');
  const group=Number(match[1]),number=Number(match[2]),physicalIndex=Number(match[3]),sprite=archive?.sprites?.[physicalIndex];if(!sprite||sprite.group!==group||sprite.number!==number||![physicalIndex,physicalIndex+1].includes(position))throw new Error('The Transfer destination boundary is stale or mismatched.');
  return{kind:'between-sprites',id:`${group},${number}@${physicalIndex}`,position};
}
function boundaryLabel(boundary){const match=/^(-?\d+),(-?\d+)@(\d+)$/.exec(String(boundary?.id||'')),physicalIndex=match?Number(match[3]):-1;return match?`${Number(boundary.position)===physicalIndex?'before':'after'} ${match[1]},${match[2]} · physical ${physicalIndex}`:`${boundary?.id||'unknown'} at ${boundary?.position??'unknown'}`}

class SffTransferHost {
  constructor() {
    this.handles=new Map();this.openingContext=null;
    this.mode=createSffTransferMode({
      captureNormalContext:async()=>this.openingContext,
      resolveEndpoint:(candidate,role)=>this.resolveEndpoint(candidate,role),
      revalidateEndpoint:(endpoint)=>endpointForFile(endpoint.fileIdentity,endpoint.entityIdentity,endpoint.label),
      openPinnedEndpoint:(endpoint,options)=>this.openPinnedEndpoint(endpoint,options),
      closePinnedEndpoints:(handles)=>this.closePinnedEndpoints(handles),
      guardClose:(handles)=>require('./viewer_close').prepare(handles.map(handle=>this.handles.get(handle.id)?.panel).filter(Boolean),vscode),
      restoreNormalContext:context=>this.restoreNormalContext(context),
      updateEndpointRoles:(changes,context)=>this.updateEndpointRoles(changes,context),
      buildReview:input=>this.buildReview(input),
      continueAssembly:reference=>this.continueAssembly(reference)
    });
  }
  runtimeEntities(){return require('./entity_switch_runtime').currentEntitySwitchRuntime()?.coordinator?.snapshot?.().entities||[];}
  preparedEntity(descriptor){try{const prepared=require('./sff_viewer').prepareSffBinding(descriptor);return prepared.available?prepared:null}catch(_){return null}}
  sourceCandidate(filename){const exact=canonical(filename);for(const descriptor of this.runtimeEntities()){const prepared=this.preparedEntity(descriptor);if(prepared&&canonical(prepared.filename)===exact)return descriptor}return endpointForFile(filename,'',path.basename(filename));}
  async chooseEndpoint(role,excludedFile){
    const items=[];for(const descriptor of this.runtimeEntities()){const prepared=this.preparedEntity(descriptor);if(!prepared||sameFile(prepared.filename,excludedFile))continue;items.push({label:descriptor.label,description:path.basename(prepared.filename),detail:`${descriptor.ownerFile} · ${prepared.filename}`,descriptor})}
    items.sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true,sensitivity:'base'}));items.push({label:'Choose another SFF file…',description:'Exact file endpoint',browse:true});
    const titleRole=role==='source'?'Source':'Destination',picked=await vscode.window.showQuickPick(items,{title:`SFF Transfer — choose ${titleRole}`,placeHolder:role==='source'?'The chosen Source remains read-only.':'Destination conflicts are reviewed before any build.'});if(!picked)return null;
    if(!picked.browse)return picked.descriptor;
    const files=await vscode.window.showOpenDialog({title:`SFF Transfer — choose ${titleRole} SFF`,canSelectMany:false,filters:{'SFF sprite archives':['sff']}});if(!files?.[0])return null;
    if(sameFile(files[0].fsPath,excludedFile)){await vscode.window.showWarningMessage('Choose a different physical SFF. Transfer Source and Destination cannot be the same file.');return null}
    return endpointForFile(files[0].fsPath,'',path.basename(files[0].fsPath));
  }
  chooseDestination(sourceFile){return this.chooseEndpoint('destination',sourceFile)}
  async open(uri){
    if(this.mode.snapshot().active){await vscode.window.showInformationMessage('SFF Transfer is already open. Exit it before starting another session.');return this.mode.snapshot()}
    const filename=uri?.fsPath;if(!filename||path.extname(filename).toLowerCase()!=='.sff'||!fs.existsSync(filename)){await vscode.window.showInformationMessage('Open an SFF viewer before starting SFF Transfer.');return null}
    const destination=await this.chooseDestination(filename);if(!destination)return null;
    this.openingContext={filename:path.resolve(filename),viewColumn:vscode.window.tabGroups?.activeTabGroup?.viewColumn||vscode.ViewColumn.One};
    try{return await this.mode.open({source:this.sourceCandidate(filename),destination,sessionId:crypto.randomUUID()})}
    catch(error){await vscode.window.showErrorMessage(`Could not open SFF Transfer: ${error.message}`);return null}
    finally{this.openingContext=null}
  }
  async resolveEndpoint(candidate){
    if(candidate?.kind==='sff'&&candidate.fileIdentity)return endpointForFile(candidate.fileIdentity,candidate.entityIdentity,candidate.label);
    const prepared=this.preparedEntity(candidate);if(!prepared)throw new Error('That exact character no longer has a readable assigned SFF.');
    return endpointForFile(prepared.filename,candidate.identity||candidate.id,candidate.label||path.basename(prepared.filename));
  }
  async openPinnedEndpoint(endpoint,options){
    let handleId='';const callbacks={...options.callbacks,closed:id=>{const exact=id||handleId;if(exact)this.handles.delete(exact);require('./sff_browser').closeTransferSession(options.sessionId);return options.callbacks.closed(exact)}};
    const viewer=require('./sff_viewer'),panel=await viewer.openSffViewer(vscode.Uri.file(endpoint.fileIdentity),options.role==='source'?vscode.ViewColumn.One:vscode.ViewColumn.Beside,undefined,{transferPinned:true,transferRole:options.role,transferSessionId:options.sessionId,transferCallbacks:callbacks,entityIdentity:endpoint.entityIdentity});
    if(!panel)throw new Error(`The ${options.role} SFF viewer did not open.`);
    const id=`${options.sessionId}:${options.role}:${crypto.randomBytes(8).toString('hex')}`,handle={id,endpointIdentity:endpoint.identity,role:options.role,panel,filename:endpoint.fileIdentity,sessionId:options.sessionId,transferCallbacks:callbacks,entityIdentity:endpoint.entityIdentity};
    handleId=id;viewer.bindSffTransferHandle(panel,id);this.handles.set(id,handle);return {id,endpointIdentity:endpoint.identity,role:options.role};
  }
  async closePinnedEndpoints(handles){const sessionIds=new Set(handles.map(reference=>this.handles.get(reference.id)?.sessionId).filter(Boolean));for(const sessionId of sessionIds)require('./sff_browser').closeTransferSession(sessionId);for(const reference of handles){const handle=this.handles.get(reference.id);this.handles.delete(reference.id);try{handle?.panel?.dispose?.()}catch(_){}}}
  async restoreNormalContext(context){if(!context?.filename||!fs.existsSync(context.filename))return false;return Boolean(await require('./sff_viewer').openSffViewer(vscode.Uri.file(context.filename),context.viewColumn));}
  async updateEndpointRoles(changes,context){const prepared=changes.map(change=>({change,handle:this.handles.get(change.handle.id)}));if(prepared.some(item=>!item.handle||item.handle.sessionId!==context.sessionId))throw new Error('A pinned SFF Transfer panel closed or changed before Swap Sides.');const viewer=require('./sff_viewer'),applied=[];try{require('./sff_browser').closeTransferSession(context.sessionId);for(const item of prepared){const prior=item.handle.role;if(!viewer.updateSffTransferRole(item.handle.panel,item.change.role,context.sessionId))throw new Error('A pinned SFF Transfer role could not be updated.');applied.push({handle:item.handle,prior});}for(const item of prepared)item.handle.role=item.change.role}catch(error){for(const item of applied.reverse())viewer.updateSffTransferRole(item.handle.panel,item.prior,context.sessionId);throw error}}
  async buildReview({session,request}){
    const selected=request.selection.map(item=>item.label||item.id),detail=[`Source: ${session.source.fileIdentity}`,`Destination: ${session.destination.fileIdentity}`,request.boundary?`Destination boundary: ${boundaryLabel(request.boundary)}`:null,`Selected physical sprites: ${selected.length}`,...selected.slice(0,24).map(item=>`• ${item}`),selected.length>24?`• … ${selected.length-24} more`:null,'','This stages a review only. It does not write either SFF. Continue in Advanced Assembly to resolve destination IDs, links and palettes in the existing reviewed build workflow.'].filter(Boolean).join('\n');
    const answer=await vscode.window.showWarningMessage('Stage this SFF Transfer selection?',{modal:true,detail},'Stage Review');if(answer!=='Stage Review')return null;
    return {status:'ready',reviewFingerprint:request.requestIdentity,summary:`${selected.length} exact physical sprite occurrence(s) staged for destination conflict review.`};
  }
  async copySelected(role='source'){try{if(role!=='source')throw new Error('Copy Selected is available only from the current Source endpoint.');const result=await this.mode.reviewSelection('copy-selected');if(result.status==='ready')await vscode.window.showInformationMessage(`${result.request.selection.length} sprite occurrence(s) staged. Review conflicts in Advanced Assembly when ready.`);return result}catch(error){await vscode.window.showErrorMessage(`SFF Transfer: ${error.message}`);return null}}
  async dropSelected(role,destinationHandleId,authority,boundary){try{if(role!=='destination')throw new Error('Transfer drops are accepted only by the current Destination endpoint.');const snapshot=this.mode.snapshot(),sourceRef=snapshot.handles?.source,destinationRef=snapshot.handles?.destination;if(!snapshot.active||!sourceRef||!destinationRef||destinationRef.id!==destinationHandleId)throw new Error('The Transfer destination changed before the drop.');const sourceHandle=this.handles.get(sourceRef.id),destinationHandle=this.handles.get(destinationRef.id);if(!sourceHandle||!destinationHandle)throw new Error('A Transfer endpoint closed before the drop.');const references=exactDragAuthority(snapshot,sourceHandle.id,authority),sourceArchive=require('./sff_reader').readSff(sourceHandle.filename),destinationArchive=require('./sff_reader').readSff(destinationHandle.filename),selection=require('./sff_browser').transferSelectionItems(sourceArchive,references),resolved=exactDestinationBoundary(destinationArchive,boundary);this.mode.setSelection('source',selection,sourceHandle.id);const result=await this.mode.reviewSelection('drag-drop',{boundary:resolved});if(result.status==='ready')await vscode.window.showInformationMessage(`${result.request.selection.length} dropped sprite occurrence(s) staged at ${boundaryLabel(resolved)}.`);return result}catch(error){await vscode.window.showErrorMessage(`SFF Transfer drop: ${error.message}`);return null}}
  async swapSides(){try{return await this.mode.swapSides()}catch(error){await vscode.window.showErrorMessage(`Could not swap SFF Transfer sides: ${error.message}`);return null}}
  async changeEndpoint(role){try{const snapshot=this.mode.snapshot();if(!snapshot.active)return null;const other=role==='source'?'destination':'source',otherHandle=this.handles.get(snapshot.handles[other]?.id);if(!otherHandle)throw new Error(`The current ${other} endpoint is no longer open.`);const candidate=await this.chooseEndpoint(role,otherHandle.filename);if(!candidate)return null;return await this.mode.changeEndpoint(role,candidate)}catch(error){await vscode.window.showErrorMessage(`Could not change SFF Transfer ${role}: ${error.message}`);return null}}
  async exit(){try{return await this.mode.exit()}catch(error){await vscode.window.showErrorMessage(`Could not exit SFF Transfer: ${error.message}`);return null}}
  async continueAssembly(reference){
    const assembly=require('./sff_assembly_workspace'),preset=assembly.assemblyReference(reference.destination.fileIdentity,reference.source.fileIdentity);
    if(!preset)throw new Error('The exact SFF files could not be revalidated for Advanced Assembly.');
    const reader=require('./sff_reader'),transferSeed=require('./sff_transfer_assembly_adapter').createSffTransferAssemblySeed({reference:preset,session:reference.session,sourceArchive:reader.readSff(reference.source.fileIdentity),destinationArchive:reader.readSff(reference.destination.fileIdentity)});
    const panel=await vscode.commands.executeCommand('sff.openAssembly',vscode.Uri.file(reference.destination.fileIdentity),{preset:true,reference:preset,transferSeed});
    return{status:panel?'opened-advanced':'unavailable',requestIdentity:transferSeed.authority.requestIdentity}
  }
  async continueInAssembly(){try{return await this.mode.continueInAssembly()}catch(error){await vscode.window.showErrorMessage(`Could not continue SFF Transfer: ${error.message}`);return null}}
  async recordAssemblyResult(requestIdentity,details,mappings){
    let snapshot,handle,result;
    try{snapshot=this.mode.snapshot();const reference=snapshot.handles?.destination;handle=reference&&this.handles.get(reference.id);if(!snapshot.active||!handle)throw new Error('The pinned Destination endpoint is no longer open.');const destination=endpointForFile(handle.filename,handle.entityIdentity,path.basename(handle.filename));result=this.mode.finalizeAssemblyResult(requestIdentity,details,destination,mappings)}
    catch(error){await vscode.window.showErrorMessage(`Could not record SFF Transfer result: ${error.message}`);return null}
    require('./sff_browser').closeTransferSession(snapshot.session.sessionId);
    try{await require('./sff_viewer').populateSffPanel(handle.panel,handle.filename,{transferPinned:true,transferRole:'destination',transferSessionId:snapshot.session.sessionId,transferCallbacks:handle.transferCallbacks,entityIdentity:handle.entityIdentity});return result}
    catch(error){await vscode.window.showWarningMessage(`SFF Transfer was applied and recorded, but the pinned Destination viewer could not refresh: ${error.message}. Reopen the Destination viewer; the verified result remains attached.`);return{...result,viewerRefresh:'failed',viewerRefreshMessage:String(error.message||error)}}
  }
  roleForUri(uri){const filename=uri?.fsPath,snapshot=this.mode.snapshot();if(!filename||!snapshot.active)return'';for(const role of ['source','destination']){const ref=snapshot.handles[role],handle=ref&&this.handles.get(ref.id);if(handle&&sameFile(handle.filename,filename))return role}return''}
  async openBrowser(uri){const role=this.roleForUri(uri),snapshot=this.mode.snapshot();if(!role||!snapshot.active)return null;const handle=this.handles.get(snapshot.handles[role].id);return require('./sff_browser').open(vscode.Uri.file(handle.filename),{autoFloat:true,transferPinned:true,transferRole:role,transferSessionId:snapshot.session.sessionId,transferGeneration:snapshot.session.generation,transferSourceHandleId:snapshot.handles.source.id,transferCallbacks:{selectionChanged:(selection,projection)=>{const result=this.mode.setSelection(role,selection,handle.id);if(projection?.selected)handle.panel.webview.postMessage({type:'navigateReference',reference:projection.selected,marked:projection.marked,anchor:projection.anchor});return result},copy:()=>this.copySelected(role),drop:(authority,boundary)=>this.dropSelected(role,handle.id,authority,boundary),focus:()=>require('./sff_viewer').focusSffTransferEndpoint(handle.panel)}})}
}

function registerSffTransferHost(context){
  host=new SffTransferHost();context.subscriptions.push(
    vscode.commands.registerCommand('sff.openTransferMode',uri=>host.open(uri)),
    vscode.commands.registerCommand('sff.transfer.copySelected',uri=>host.copySelected(host.roleForUri(uri))),
    vscode.commands.registerCommand('sff.transfer.swapSides',()=>host.swapSides()),
    vscode.commands.registerCommand('sff.transfer.changeSource',()=>host.changeEndpoint('source')),
    vscode.commands.registerCommand('sff.transfer.changeDestination',()=>host.changeEndpoint('destination')),
    vscode.commands.registerCommand('sff.transfer.openBrowser',uri=>host.openBrowser(uri)),
    vscode.commands.registerCommand('sff.transfer.exit',()=>host.exit()),
    vscode.commands.registerCommand('sff.transfer.continueAssembly',()=>host.continueInAssembly()),
    vscode.commands.registerCommand('sff.transfer.recordAssemblyResult',(requestIdentity,details,mappings)=>host.recordAssemblyResult(requestIdentity,details,mappings))
  );return host;
}
function currentSffTransferHost(){return host;}

module.exports={SffTransferHost,registerSffTransferHost,currentSffTransferHost,endpointForFile,sameFile,exactDragAuthority,exactDestinationBoundary};
