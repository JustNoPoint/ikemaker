'use strict';
const path=require('path'),{hash}=require('./mutation_safety');
const CONVENTIONAL_STATES=Object.freeze([0,5,10,11,20,40,50,52,100,105,120,5000,5150,180,170]);
async function createOverride(owner,state,{api,isCurrent}={}){
 if(!CONVENTIONAL_STATES.includes(state)||!api||!isCurrent?.()||owner.disposed||owner.panel?.active===false)return false;
 const folder=path.resolve(owner.assets.folder||path.dirname(owner.assets.defPath)),inside=filename=>{const relative=path.relative(folder,path.resolve(filename));return relative&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)};
 const assigned=new Set((owner.assets.code||[]).map(filename=>path.resolve(filename).toLowerCase()));
 const source=(owner.model.behaviorComponents||[]).find(component=>assigned.has(path.resolve(component.filename).toLowerCase())&&inside(component.filename)&&/\.(?:zss|cns|st)$/i.test(component.filename));
 if(!source){await api.window.showInformationMessage('No indexed character-owned state source is available. Add a character state file in the DEF, then refresh. Common/shared files were not selected for an override.');return false;}
 const document=await api.workspace.openTextDocument(source.filename);
 if(!isCurrent()||owner.disposed||path.resolve(document.fileName).toLowerCase()!==path.resolve(source.filename).toLowerCase()||hash(document.getText())!==source.sourceHash)return false;
 const editor=await api.window.showTextDocument(document,{preview:false});
 if(!isCurrent()||owner.disposed||editor.document!==document||hash(document.getText())!==source.sourceHash)return false;
 void api.window.showInformationMessage('Create a character override for conventional StateDef '+state+'. The existing wizard will ask for its number and review the proposal. No state was created automatically.');
 if(!isCurrent()||owner.disposed)return false;
 return api.commands.executeCommand('ikemen.statedef.create');
}
module.exports={CONVENTIONAL_STATES,createOverride};
