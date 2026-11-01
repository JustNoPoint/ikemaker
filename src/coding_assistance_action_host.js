'use strict';

const fs=require('fs');
const path=require('path');
const crypto=require('crypto');

const ACTIONS=new Set(['focus-similar-code','open-example-templates','open-recipe-library','open-native-diff','open-coordinate-tools']);
const key=value=>path.resolve(String(value||'')).toLowerCase();
const digest=value=>crypto.createHash('sha256').update(String(value)).digest('hex');

function exactSource(api,source,context={}){
  if(!source||typeof source.filename!=='string'||!path.isAbsolute(source.filename))return null;
  const filename=path.resolve(source.filename),allowed=new Set((context.files||context.connectedFiles||[]).filter(value=>typeof value==='string'&&path.isAbsolute(value)).map(key));if(!allowed.has(key(filename)))return null;
  const document=(api.workspace?.textDocuments||[]).find(item=>!item.isClosed&&key(item.fileName)===key(filename));let text;try{text=document?document.getText():fs.readFileSync(filename,'utf8');}catch{return null;}
  const fingerprint=digest(text);if(source.fingerprint&&source.fingerprint!==fingerprint)return null;
  return{filename,text,fingerprint,document,line:Number.isInteger(source.line)&&source.line>=0?source.line:0};
}

async function execute(api,intent,context={},services={}){
  const isCurrent=typeof services.isCurrent==='function'?services.isCurrent:()=>true;if(!isCurrent()||!intent||!ACTIONS.has(intent.action))return false;
  if(intent.action==='focus-similar-code')return services.focusSimilar?.()||false;
  if(intent.action==='open-example-templates')return api.commands.executeCommand('ikemen.authoring.openExamples');
  if(intent.action==='open-recipe-library')return api.commands.executeCommand('ikemen.authoring.openRecipes');
  const exact=exactSource(api,intent.source,context);if(!exact)return api.window.showWarningMessage('The selected Coding Insight source changed or is no longer assigned. Refresh Coding Assistance and try again.');
  if(intent.action==='open-native-diff'){
    if(!exact.document?.isDirty)return api.window.showInformationMessage('The selected source no longer has unsaved changes. Refresh Coding Assistance.');
    let disk;try{disk=fs.readFileSync(exact.filename,'utf8');}catch(error){return api.window.showWarningMessage(`The saved source could not be read for comparison: ${error.message}`);}
    if(!isCurrent()||digest(exact.document.getText())!==exact.fingerprint)return false;
    const original=await api.workspace.openTextDocument({content:disk,language:exact.document.languageId});if(!isCurrent()||digest(exact.document.getText())!==exact.fingerprint)return false;
    return api.commands.executeCommand('vscode.diff',original.uri,exact.document.uri,`Saved ↔ Unsaved Semantic Change · ${path.basename(exact.filename)}`,{preview:false});
  }
  const owner=context.ownerDef;if(typeof owner!=='string'||!path.isAbsolute(owner))return api.window.showWarningMessage('The exact character owner is unavailable. Reopen Coding Assistance from the character and try again.');
  const picked=await api.window.showQuickPick([{label:'Position & Camera',description:'Inspect and model the exact selected source in the character spatial workspace.',id:'position'},{label:'Character Scale Review',description:'Run before/after scale review with findings from the selected source prioritized.',id:'scale'}],{title:`Coordinate / Attachment Inspector — ${path.basename(exact.filename)}:${exact.line+1}`});
  if(!picked||!isCurrent()||!exactSource(api,intent.source,context))return false;
  const seed=api.Uri.file(path.resolve(owner)),sourceSelection={filename:exact.filename,line:exact.line,fingerprint:exact.fingerprint};
  return picked.id==='position'?api.commands.executeCommand('ikemen.positionCamera.open',seed,{sourceSelection}):api.commands.executeCommand('ikemen.scaleReview.run',seed,{preferredSourcePath:exact.filename,sourceSelection});
}

module.exports={ACTIONS,exactSource,execute};
