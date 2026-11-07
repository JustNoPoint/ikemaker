'use strict';
const fs=require('node:fs'),path=require('node:path'),{hash}=require('./mutation_safety');
const owned=new WeakMap();
const samePath=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
async function prepareNativeStageVariant(api,owner,assertRetained){
 const raw=fs.readFileSync(owner.filename),before=stamp(owner.filename),diskHash=hash(raw),payload=owner.payload;
 if(diskHash!==payload.sourceDiskHash)throw Error('Stage disk bytes changed before variant review.');
 const document=await api.workspace.openTextDocument(api.Uri.file(owner.filename));assertRetained();
 if(owner.payload!==payload||stamp(owner.filename)!==before||hash(fs.readFileSync(owner.filename))!==diskHash)throw Error('Stage changed while opening its native variant buffer.');
 const text=document.getText();if(hash(text)!==payload.sourceHash){
  if(document.isDirty||hash(raw.toString('utf8'))!==payload.sourceHash)throw Error('Stage source changed before native variant review.');
  require('./stage_source_representation').stageDiskEdit(raw,text,text);
  // Opening only decodes the native text; no tab or file write is introduced.
  // The model's source lines/selection and all Canvas draft objects stay intact.
  payload.sourceHash=hash(text);
 }
 return document;
}
function stamp(file){const s=fs.lstatSync(file,{bigint:true});if(!s.isFile()||s.isSymbolicLink())throw Error('Variant resource is not a regular owned file.');return [s.dev,s.ino,s.birthtimeNs,s.size,s.mtimeNs,s.ctimeNs].join(':');}
function existing(file){try{return stamp(file)}catch(e){if(e.code==='ENOENT')return null;throw e}}
function resourceCheck(api,resource,state){
 const doc=api.workspace.textDocuments.find(d=>samePath(d.fileName,resource.destination));
 if(doc?.isDirty)throw Error('The variant has unsaved edits; resource Undo/Redo was refused.');
 const current=existing(resource.destination);
 if(state.present){if(!current||current!==state.identity||hash(fs.readFileSync(resource.destination))!==resource.candidateHash)throw Error('The variant changed or was replaced; resource Undo was refused.');}
 else if(current)throw Error('The variant destination is occupied; resource Redo was refused.');
 return current;
}
async function apply(api,document,resource,state,before,after,create,assertCurrent){
 const version=document.version,source=document.getText(),disk=stamp(document.fileName),diskHash=hash(fs.readFileSync(document.fileName));
 if(source!==before)throw Error('The parent source changed before the compound variant edit.');
 resourceCheck(api,resource,state);assertCurrent();
 const edit=new api.WorkspaceEdit(),uri=api.Uri.file(resource.destination),metadata={label:'Stage round variant'};
 // Create first: a failed exclusive creation must never leave a dangling binding.
 if(create)edit.createFile(uri,{overwrite:false,ignoreIfExists:false,contents:Buffer.from(resource.text)},metadata);
 if(before!==after)edit.replace(document.uri,new api.Range(document.positionAt(0),document.positionAt(before.length)),after,metadata);
 // Remove only after restoring the parent. Public resource edits stop on failure;
 // they do not promise transactional rollback. Never compensate with text alone.
 if(!create)edit.deleteFile(uri,{recursive:false,ignoreIfNotExists:false},metadata);
 if(document.version!==version||document.getText()!==before||stamp(document.fileName)!==disk||hash(fs.readFileSync(document.fileName))!==diskHash)throw Error('The parent changed while preparing the compound variant edit.');
 resourceCheck(api,resource,state);assertCurrent();
 let accepted,error;try{accepted=await api.workspace.applyEdit(edit,{label:create?'Create Stage round variant':'Undo Stage round variant'});}catch(e){error=e;}
 const present=existing(resource.destination),parent=document.getText(),correct=create?Boolean(present&&hash(fs.readFileSync(resource.destination))===resource.candidateHash):!present;
 if(error||!accepted||parent!==after||!correct){
  const failure=Error('VS Code did not confirm the complete compound Stage variant edit.'+(error?' '+error.message:''));
  failure.rollbackPending=parent!==before||Boolean(present)!==state.present;failure.destination=resource.destination;
  if(failure.rollbackPending)failure.message+=' Partial resource changes were retained for review; use native Undo only after checking both files.';
  throw failure;
 }
 state.present=create;state.identity=create?present:null;
 return {destination:resource.destination,created:create,bindingApplied:resource.before!==resource.after,dirty:document.isDirty,nativeCompound:true};
}
async function commitNativeStageVariant(api,document,plan,services){
 const before=document.getText(),after=plan.parentText||before,destination=path.resolve(plan.destination);
 if(!samePath(document.fileName,plan.sourceFilename)||samePath(destination,document.fileName)||!samePath(path.dirname(destination),path.dirname(document.fileName))||hash(before)!==plan.sourceHash||hash(plan.text)!==plan.candidateHash)throw Error('Stage variant identity changed before native commit.');
 const state={present:false,identity:null},resource=Object.freeze({kind:'stage-variant',destination,text:plan.text,candidateHash:plan.candidateHash,before,after,checkHistory(action){if(document.getText()!==(action==='undo'?after:before))throw Error('The parent no longer matches the retained resource operation.');if(state.present!==(action==='undo'))throw Error('The native resource phase changed.');resourceCheck(api,resource,state);}});
 const result=await apply(api,document,resource,state,before,after,true,services.assertCurrent);
 owned.set(resource,state);services.history?.record(before,after,'create-round-variant',resource);return {...result,candidateHash:resource.candidateHash,destinationIdentity:state.identity};
}
async function replayNativeStageVariant(api,document,entry,action,assertCurrent){
 const resource=entry.resource,state=owned.get(resource);if(resource?.kind!=='stage-variant'||!state)throw Error('No retained resource ownership is available for this variant history entry.');
 const create=action==='redo';return apply(api,document,resource,state,create?resource.before:resource.after,create?resource.after:resource.before,create,assertCurrent);
}
module.exports={prepareNativeStageVariant,commitNativeStageVariant,replayNativeStageVariant};
