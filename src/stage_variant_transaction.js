'use strict';
const fs=require('node:fs'),path=require('node:path'),{hash}=require('./mutation_safety');
// Called only after the candidate's explicit Apply. The source adapter must use
// an atomic source edit (native WorkspaceEdit or the Stage mutation service).
async function commitStageVariant(plan,services){
 const io=services.fs||fs;if(!services.assertCurrent||!services.readSource)throw Error('Variant commit requires current-owner and source services.');
 const original=await services.readSource();if(hash(original)!==plan.sourceHash||hash(plan.text)!==plan.candidateHash)throw Error('Variant source/candidate changed before commit.');if(plan.parentText&&!services.applyParent)throw Error('Round binding requires an atomic parent edit service.');
 const destination=path.resolve(plan.destination);if(destination.toLowerCase()===path.resolve(plan.sourceFilename).toLowerCase()||path.dirname(destination).toLowerCase()!==path.dirname(path.resolve(plan.sourceFilename)).toLowerCase())throw Error('Variant destination changed after review.');
 services.assertCurrent();if(io.existsSync(destination))throw Error('Variant destination exists; no file was replaced.');let created=false,parentAttempted=false,ownedIdentity,writeCompleted=false,partialFingerprint,partialSize;
 try{
  const descriptor=io.openSync(destination,'wx+');created=true;
  try{
   ownedIdentity=io.fstatSync(descriptor,{bigint:true});
   try{io.writeFileSync(descriptor,plan.text);writeCompleted=true;}catch(error){
    // Fingerprint partial bytes through the still-owned descriptor, before a
    // close hook or another writer can change the destination in place.
    try{const before=io.fstatSync(descriptor,{bigint:true}),expected=Buffer.from(plan.text);if(before.size>BigInt(expected.length))throw Error('Unexpected partial output size.');const bytes=Buffer.alloc(Number(before.size));let offset=0;while(offset<bytes.length){const count=io.readSync(descriptor,bytes,offset,bytes.length-offset,offset);if(count<=0)throw Error('Partial output could not be read completely.');offset+=count;}const after=io.fstatSync(descriptor,{bigint:true});if(before.size!==after.size||before.mtimeNs!==after.mtimeNs||before.ctimeNs!==after.ctimeNs||!bytes.equals(expected.subarray(0,bytes.length)))throw Error('Partial output changed while establishing ownership.');partialFingerprint=hash(bytes);partialSize=after.size;}catch{ /* Unknown partial ownership must retain the file. */ }
    throw error;
   }
  }finally{io.closeSync(descriptor)}
  services.assertCurrent();if(hash(await services.readSource())!==plan.sourceHash)throw Error('Source changed while creating the variant.');
  if(plan.parentText){parentAttempted=true;const result=await services.applyParent(plan.parentText);if(result===false)throw Error('Parent round binding edit was rejected.');if(hash(await services.readSource())!==hash(plan.parentText))throw Error('Parent round binding did not match its reviewed text.');}
  return{destination,created:true,bindingApplied:Boolean(plan.parentText),sourceHash:plan.sourceHash,candidateHash:plan.candidateHash};
 }catch(error){
  let rollbackError;
  try{
   if(parentAttempted){const current=await services.readSource();if(hash(current)===hash(plan.parentText)){if(await services.applyParent(original)===false||hash(await services.readSource())!==plan.sourceHash)throw Error('Parent rollback did not restore the original source.');}else if(hash(current)!==plan.sourceHash)throw Error('Parent changed concurrently; rollback preserved the newer text.');}
   if(created){const current=io.lstatSync(destination,{bigint:true});if(!ownedIdentity||!current.isFile()||current.dev!==ownedIdentity.dev||current.ino!==ownedIdentity.ino||current.birthtimeNs!==ownedIdentity.birthtimeNs)throw Error('Created variant ownership changed; concurrent replacement retained for review.');if(!writeCompleted&&(partialFingerprint===undefined||current.size!==partialSize))throw Error('Partial variant content ownership is unavailable or changed; retained it for review.');if(hash(io.readFileSync(destination))!==(writeCompleted?plan.candidateHash:partialFingerprint))throw Error('Created variant changed concurrently; retained it for review.');io.unlinkSync(destination);}
  }catch(failure){rollbackError=failure}
  if(rollbackError){const failure=Error(error.message+' Rollback needs review: '+rollbackError.message);failure.destination=destination;failure.rollbackPending=true;throw failure;}throw error;
 }
}
module.exports={commitStageVariant};
