'use strict';

const path = require('path');
const { digest } = require('./character_scale_review_model');

function samePath(a,b){const left=path.resolve(a),right=path.resolve(b);return process.platform==='win32'?left.toLowerCase()===right.toLowerCase():left===right;}
function validateBatch(batch){
  if(!batch||batch.schema!=='ikemaker.reviewed-workspace-edit-batch'||batch.version!==1||!Array.isArray(batch.sources)||!batch.sources.length)throw new Error('The reviewed scale-edit batch is missing or malformed.');
  for(const source of batch.sources){
    if(!path.isAbsolute(source.sourcePath)||!Array.isArray(source.patches)||!source.patches.length||typeof source.sourceHash!=='string')throw new Error('A reviewed scale-edit source is malformed.');
    let end=-1;for(const patch of [...source.patches].sort((a,b)=>a.start-b.start)){if(!Number.isSafeInteger(patch.start)||!Number.isSafeInteger(patch.end)||patch.start<0||patch.end<=patch.start||patch.start<end||typeof patch.before!=='string'||typeof patch.replacement!=='string'||!patch.replacement)throw new Error('Reviewed scale-edit patches must be non-overlapping narrow replacements.');end=patch.end;}
  }
  for(const authority of batch.authorities||[])if(!path.isAbsolute(authority.sourcePath)||typeof authority.sourceHash!=='string'||typeof authority.open!=='boolean'||typeof authority.dirty!=='boolean'||authority.open&&!Number.isSafeInteger(authority.version)||!authority.open&&authority.version!==null)throw new Error('A reviewed scale-edit authority snapshot is malformed.');
  return batch;
}
async function applyReviewedWorkspaceEditBatch(vscode,batch,services={}){
  validateBatch(batch);const opened=[],authorityDocuments=[],documents=new Map(),openExact=async source=>{const identity=path.resolve(source.sourcePath),existing=documents.get(identity),document=existing||await vscode.workspace.openTextDocument(source.sourcePath),text=document.getText();documents.set(identity,document);if(!samePath(document.fileName,source.sourcePath)||document.isClosed||digest(text)!==source.sourceHash||source.open===true&&(document.version!==source.version||document.isDirty!==source.dirty)||source.open!==true&&document.isDirty)throw new Error(`Scale review stopped because ${path.basename(source.sourcePath)} changed after review.`);return{source,document,text};};
  for(const authority of batch.authorities||[])authorityDocuments.push(await openExact(authority));
  for(const source of batch.sources){const openedSource=await openExact(source),{document,text}=openedSource;for(const patch of source.patches)if(text.slice(patch.start,patch.end)!==patch.before)throw new Error(`Scale review stopped because an exact field in ${path.basename(source.sourcePath)} changed after review.`);opened.push(openedSource);}
  if(services.verifyAuthority&&services.verifyAuthority({batch,authorities:authorityDocuments,sources:opened})!==true)throw new Error('Scale review stopped because character ownership or assignment authority changed after review.');
  const edit=new vscode.WorkspaceEdit();for(const item of opened)for(const patch of item.source.patches)edit.replace(item.document.uri,new vscode.Range(item.document.positionAt(patch.start),item.document.positionAt(patch.end)),patch.replacement);
  const applied=await vscode.workspace.applyEdit(edit);if(applied!==true)throw new Error('VS Code declined the reviewed scale changes. Nothing was saved.');
  for(const item of opened){let expected=item.text;for(const patch of [...item.source.patches].sort((a,b)=>b.start-a.start))expected=expected.slice(0,patch.start)+patch.replacement+expected.slice(patch.end);if(item.document.getText()!==expected)throw new Error(`The native editor result for ${path.basename(item.source.sourcePath)} differs from the reviewed scale changes.`);}
  return Object.freeze({applied:true,files:opened.length,patches:opened.reduce((sum,item)=>sum+item.source.patches.length,0),saved:false,undo:'VS Code Undo'});
}

module.exports={validateBatch,applyReviewedWorkspaceEditBatch};
