'use strict';
// Sole linked-owner generated-source mutation boundary. No disk write or Save.
async function applyLinkedOwnerPatch(api,{document,before,after,patches,assertCurrent,label='Stage linked owner reaction'}){
 const rows=(patches||[{document,before,after}]).map(row=>({...row,version:row.document.version})),names=new Set();
 if(!rows.length)throw Error('Choose a native source patch.');
 for(const row of rows){const key=require('node:path').resolve(row.document.fileName).toLowerCase();if(names.has(key))throw Error('A compound source patch cannot target one document twice.');names.add(key);if(typeof row.before!=='string'||typeof row.after!=='string')throw Error('Native source patch must contain exact text.');if(row.document.isReadonly===true||row.document.uri?.scheme&&row.document.uri.scheme!=='file'||api.workspace.fs?.isWritableFileSystem?.('file')===false)throw Error('The linked source is read-only.');}
 const check=()=>{assertCurrent();for(const row of rows)if(row.document.version!==row.version||row.document.getText()!==row.before)throw Error('Linked source changed before native Apply.');};
 check();const edit=new api.WorkspaceEdit();for(const row of rows)edit.replace(row.document.uri,new api.Range(row.document.positionAt(0),row.document.positionAt(row.before.length)),row.after,{label});check();
 let confirmed=false,cause;try{confirmed=await api.workspace.applyEdit(edit,{label});}catch(error){cause=error;}
 const observed=rows.map(row=>{try{if(row.document.isClosed===true)throw Error('Native source closed.');const text=row.document.getText();return {filename:row.document.fileName,state:text===row.before?'unchanged':'changed',matchesReviewed:text===row.after};}catch{return {filename:row.document.fileName,state:'unknown',matchesReviewed:false};}});
 if(!confirmed||observed.some(row=>!row.matchesReviewed)){
  const error=Error('Native edit was not confirmed. Sources: '+observed.map(row=>row.filename+' ['+row.state+(row.state==='changed'?(row.matchesReviewed?'; reviewed text':'; unexpected text'):'')+']').join('; ')+'. Inspect these sources before using native Undo.');
  error.affectedSources=observed;if(cause)error.cause=cause;throw error;
 }
 return {applied:true,filename:rows[0].document.fileName,filenames:rows.map(row=>row.document.fileName),nativeUndo:true,unsaved:rows.some(row=>row.document.isDirty===true)};
}
module.exports={applyLinkedOwnerPatch};
