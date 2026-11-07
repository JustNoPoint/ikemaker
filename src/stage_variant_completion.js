'use strict';
const fs=require('node:fs'),{hash}=require('./mutation_safety');
function variantResourceIdentity(filename){const s=fs.lstatSync(filename,{bigint:true});if(!s.isFile()||s.isSymbolicLink())throw Error('The reviewed variant is not a regular file.');return [s.dev,s.ino,s.birthtimeNs,s.size,s.mtimeNs,s.ctimeNs].join(':');}
// A native Save may legitimately refresh the Stage generation. Retain exact
// panel/owner, decoded source and created-file authority instead of generation.
function notifyStageVariantCompletion(owner,result,services){
 const filename=owner.filename,panel=owner.panel,fingerprint=hash(services.readParent());
 const message='Created Stage variant '+result.destination+(result.binding?' · '+result.binding.key+' is an UNSAVED native parent edit. Save the parent DEF to use the binding in game. Native Save may normalize its line endings.':'. Current Stage is unchanged.');
 return Promise.resolve().then(()=>services.info(message,'Open Variant')).then(async choice=>{
  if(choice!=='Open Variant')return false;
  let current=false;try{current=!owner.disposed&&owner.panel===panel&&panel.active&&owner.filename===filename&&services.currentOwner()===owner&&hash(services.readParent())===fingerprint&&variantResourceIdentity(result.destination)===result.destinationIdentity&&hash(fs.readFileSync(result.destination))===result.candidateHash;}catch{}
  if(!current){await services.info('Open Variant action expired because the Stage owner, source or reviewed variant changed. Open the intended variant explicitly.');return false;}
  await services.openVariant(result.destination);return true;
 }).catch(async error=>{try{await services.info('Could not open Stage variant: '+error.message);}catch{}return false;});
}
module.exports={variantResourceIdentity,notifyStageVariantCompletion};
