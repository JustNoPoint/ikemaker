'use strict';
const path=require('path'),recipes=require('./stage_area_recipes');

// Read-only diagnostics. A recorded path/hash is not source ownership proof,
// an original body snapshot, or permission to remove code/identity markers.
function describeRecipeFailure(owner,env,type,error){
 if(error?.partial)return null;
 try{
  env.assert();const filename=owner.filename;if(typeof filename!=='string'||!path.isAbsolute(filename))return null;
  const lines=['Stage: '+filename,'Observed refusal: '+String(error?.message||error),''];
  let raw;try{raw=recipes.readRecipe(env.readText(filename),type);}catch(metadataError){lines.push('Receipt could not be validated: '+metadataError.message);}
  if(raw){
   let resolved=null;try{resolved=recipes.resolveRecipe(raw,filename,env.root);}catch(bindingError){lines.push('UNVERIFIED receipt location: '+bindingError.message);}
   lines.push('Recorded recipe: '+raw.type+' / '+raw.namespace,'Recorded source references (not current ownership approval):');
   raw.documents.forEach((document,index)=>{lines.push(document.role+': '+(resolved?resolved.documents[index].filename:'UNVERIFIED reference '+document.reference),'Expected generated-body SHA256: '+document.bodyHash);});
  }
  lines.push('','Only hashes are stored; no original-body diff is available.','Edited block: use its existing Open compatibility source / Open linked source action, or Stage Code, then native Undo or version control to recover the intended source.','Missing/moved source: restore its exact file and DEF link, then Refresh sources.','Legacy basename receipt: open this exact Stage receipt source and review its owner/participant references; its original Stage location cannot be inferred. Recover a verified source/receipt through native Undo or version control.','No release, marker deletion, ownership removal or automatic repair is performed.');
  return {summary:'Source ownership needs review. Open the exact Stage receipt below; restore intended source/links, then refresh.',detail:lines.join('\n'),canOpenStageSource:typeof env.openParticipantSource==='function'};
 }catch{return null;}
}
async function openStageReceiptSource(owner,env){
 env.assert();const filename=owner.filename;if(typeof filename!=='string'||!path.isAbsolute(filename))throw Error('The exact Stage source is unavailable.');
 // This is the existing generic openViewerSource route supplied by Stage. It
 // accepts .def as well as participant code and retains the Stage return point.
 if(typeof env.openParticipantSource!=='function')throw Error('Use Stage Code → Stage DEF to inspect this exact receipt. The source route is unavailable.');
 env.readText(filename);env.assert();const opened=await env.openParticipantSource(filename);env.assert();if(opened===false)throw Error('The exact Stage source could not open. Restore the missing Stage source and reopen Stage Code.');return true;
}
module.exports={describeRecipeFailure,openStageReceiptSource};
