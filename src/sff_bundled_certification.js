'use strict';
const path=require('node:path'),crypto=require('node:crypto'),{loadCreatorCertificationEvidence}=require('./sff_creator_certification_evidence_intake');
const TARGET='sff-v2.1',BACKEND='ikemaker-builtin-sff-v21-png8-prerelease',MANIFEST_SHA='bd0465d869ef2c3695f79046fa0ceb3ccd9892a3a3bb39b9115fee96ee066aeb',LEDGER_SHA='15f2d2820024252151d887f125dc793b5e70787a60912a3521f1b76f5ca6ccc4';
const sha=text=>crypto.createHash('sha256').update(text,'utf8').digest('hex');
function resolveBundledSffCertification(targetId,backendId){
 const unavailable=reason=>({available:false,reason,label:'Runtime verification unavailable',capabilityRequest:null});
 if(process.platform!=='win32'||process.arch!=='x64')return unavailable('Bundled SFF runtime verification covers Windows x64 only. Linux remains unverified.');
 if(targetId!==TARGET||backendId!==BACKEND)return unavailable('This target/backend has no bundled Windows runtime certification.');
 try{
  const root=path.resolve(__dirname,'../data/sff-runtime-certification/windows-x64-v21'),loaded=loadCreatorCertificationEvidence({targetId,backendId,manifestPath:path.join(root,'manifest.json'),ledgerPath:path.join(root,'ledger.json'),evidenceRoot:path.join(root,'evidence')}),evidence=loaded.freshCapabilityRequest.evidence.certification;
  // Validate the exact observed run as well as the registry-pinned fixture set.
  // No caller-authored platform, path or precomputed validation is accepted.
  if(loaded.validationScope!=='windows-x64'||sha(evidence.manifestText)!==MANIFEST_SHA||sha(evidence.ledgerText)!==LEDGER_SHA||loaded.evidenceArtifactCount!==66)throw Error('Bundled certification identity changed.');
  return{available:true,reason:'',label:'Windows verified; Linux unverified',scope:loaded.validationScope,unverifiedPlatforms:loaded.unverifiedPlatforms,capabilityRequest:loaded.freshCapabilityRequest,provenance:{manifestSha256:MANIFEST_SHA,ledgerSha256:LEDGER_SHA,evidenceArtifactCount:loaded.evidenceArtifactCount}};
 }catch(error){return unavailable(`Bundled Windows certification is unavailable or changed: ${error.message}`);}
}
module.exports={resolveBundledSffCertification};
