'use strict';

async function insertCatalogItem(vscode,entry,services={}){
  if(!entry)return{inserted:false,reason:'missing-entry'};
  const capabilities=await services.capabilities?.(vscode.window.activeTextEditor?.document?.uri)||{};
  if(entry.nightlyString&&capabilities.nightlyStringsEnabled!==true){await vscode.window.showWarningMessage('This string authoring recipe is available only when the current project explicitly targets a verified supporting IKEMEN GO Nightly build. No text was inserted.');return{inserted:false,reason:'nightly-unavailable'};}
  if(services.entryAvailable&&!services.entryAvailable(entry,capabilities)){await vscode.window.showWarningMessage(`This authoring item requires the unavailable ${entry.capabilityId} engine capability. Review the exact project engine target; no text was inserted.`);return{inserted:false,reason:'capability-unavailable'};}
  let inserted=false;
  if(entry.kind==='personalExampleAdaptation')inserted=await services.insertReviewedLiteral?.(vscode,entry)===true;
  else if(entry.structureId)inserted=await services.insertStructure?.(services.structureById?.(entry.structureId))===true;
  else if(entry.snippet){
    const editor=vscode.window.activeTextEditor;
    if(!editor||!['zss','ikemen-cns'].includes(editor.document.languageId)){await vscode.window.showWarningMessage('Open a ZSS or CNS file before inserting this recipe section.');return{inserted:false,reason:'editor-unavailable'};}
    if(entry.allowedFileTypes?.length&&!entry.allowedFileTypes.includes(editor.document.languageId)){const expected=entry.allowedFileTypes.includes('zss')?'a ZSS code file':'an IKEMEN constants/CNS file';await vscode.window.showWarningMessage(`This recipe section belongs in ${expected}. No text was inserted.`);return{inserted:false,reason:'wrong-file-type'};}
    inserted=await editor.insertSnippet(new vscode.SnippetString(entry.snippet),editor.selection.active)!==false;
  }else{await vscode.commands.executeCommand(entry.kind==='examplePack'?'ikemen.authoring.openExamples':'ikemen.authoring.openRecipes');return{inserted:false,navigated:true};}
  if(!inserted)return{inserted:false,reason:'insertion-refused'};
  try{await services.recordRecent?.(entry.id);return{inserted:true,recentRecorded:true};}
  catch(error){await vscode.window.showWarningMessage?.(`The authoring item was inserted, but its Recent entry could not be saved: ${error.message||error}`);return{inserted:true,recentRecorded:false};}
}

module.exports={insertCatalogItem};
