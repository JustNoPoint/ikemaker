'use strict';
const crypto=require('node:crypto'),{hash}=require('./mutation_safety'),{parseDef}=require('./def_model'),{stageModel}=require('./stage_model');
const identityKeys=['token','sourceHash','candidateHash','ownerGeneration','ownerFilename','filename'];
function createCandidatePreview(owner,sourceText,text,{label,detail,layerIndices,filename=owner.filename}={}){
 if(typeof text!=='string'||Buffer.byteLength(text)>2*1024*1024)throw Error('Stage candidate exceeds the 2 MiB Canvas review limit.');
 const model=stageModel(parseDef(text,filename)),indices=layerIndices||model.backgrounds.map((_,i)=>i);if(indices.some(i=>!Number.isInteger(i)||!model.backgrounds[i]))throw Error('Candidate background selection is stale.');
 return Object.freeze({kind:'stage-candidate',token:crypto.randomBytes(24).toString('hex'),sourceHash:hash(sourceText),candidateHash:hash(text),ownerGeneration:owner.generation,ownerFilename:owner.filename,filename,text,label:String(label||'Stage candidate'),detail:String(detail||''),layerIndices:Object.freeze([...indices])});
}
function candidateReceipt(candidate){return Object.fromEntries([...identityKeys.map(k=>[k,candidate[k]]),['accepted',true]])}
function assertCandidateReceipt(candidate,receipt){
 if(!receipt||receipt.accepted!==true)return false;
 if(identityKeys.some(key=>receipt[key]!==candidate[key])||hash(candidate.text)!==candidate.candidateHash)throw Error('Candidate Canvas approval is stale or belongs to another Stage.');
 return true;
}
module.exports={createCandidatePreview,candidateReceipt,assertCandidateReceipt};
