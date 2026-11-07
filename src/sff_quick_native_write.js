'use strict';

const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {hashCanonical,createSffCapabilityReport}=require('./sff_capability_report');
const {specificationHash}=require('./sff_build_specification');
const {createSffV21Bytes}=require('./sff_v21_writer');
const {assertSffV21Mixed}=require('./sff_v21_mixed_strict_validator');
const {assertQuickWriteIntent}=require('./sff_quick_write_intent');
const safety=require('./sff_build_safety'),recovery=require('./sff_transaction_recovery');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const physical=stat=>({device:String(stat.dev),inode:String(stat.ino)});
const BACKEND='ikemaker-builtin-sff-v21-png8-prerelease';
function fail(message){throw Error('Quick SFF Write: '+message);}
function samePath(a,b){const key=value=>process.platform==='win32'?path.resolve(value).toLowerCase():path.resolve(value);return key(a)===key(b);}
function directFile(filename,expectedHash){
 const name=path.resolve(filename),before=fs.lstatSync(name,{bigint:true});
 if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||!samePath(fs.realpathSync.native(name),name))fail('Source or target is not a direct regular file: '+name);
 const bytes=fs.readFileSync(name),after=fs.lstatSync(name,{bigint:true}),byteHash=sha(bytes);
 if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeNs!==after.mtimeNs||before.ctimeNs!==after.ctimeNs||BigInt(bytes.length)!==after.size)fail('File changed while being read: '+name);
 if(expectedHash&&byteHash!==String(expectedHash).toLowerCase())fail('File changed after Write SFF was chosen: '+name);
 return {path:name,identity:physical(after),byteHash,byteLength:bytes.length,bytes};
}
function sameFile(a,b){return a.path===b.path&&a.byteHash===b.byteHash&&a.byteLength===b.byteLength&&hashCanonical(a.identity)===hashCanonical(b.identity);}
function requiredFeatures(spec){
 const features=new Set();
 for(const item of spec?.sprites||[]){const format=String(item.format);features.add(format==='png8'?'sprite.indexed8':format==='png24'?'sprite.truecolor24':'sprite.alpha32');features.add('compression.'+format);if(item.linkTargetEntryId)features.add('sprite.links');if(item.paletteId)features.add('palette.per-sprite');}
 if(spec?.palettes?.length)features.add('palette.embedded');if(spec?.palettes?.some(item=>item.linkTargetEntryId))features.add('palette.links');
 return [...features].sort();
}
function inspectQuickNativeAvailability({draft,build,capabilityRequest}={}){
 const version=String(draft?.target?.sffVersion||build?.specification?.target?.sffVersion||'');
 if(version!=='2.1')return {enabled:false,reason:'Direct IKEMaker Write requires a currently certified SFF 2.1 target. Choose an available writer; no writer is substituted automatically.',targetId:'sff-v'+version,backendId:BACKEND};
 try{
  if(!capabilityRequest)capabilityRequest=require('./sff_bundled_certification').resolveBundledSffCertification('sff-v2.1',BACKEND).capabilityRequest;
  const assessment=createSffCapabilityReport({targetId:'sff-v2.1',backendId:BACKEND,requiredFeatures:build?requiredFeatures(build.specification):[],evidence:capabilityRequest?.evidence||{}});
  const enabled=assessment.exactBuildAllowed===true&&!assessment.mismatches.length;
  return {enabled,reason:enabled?'':assessment.mismatches.map(item=>item.detail||item.code).join(' ')||'Current Windows runtime evidence is unavailable.',targetId:'sff-v2.1',backendId:BACKEND,assessmentHash:hashCanonical(assessment)};
 }catch(error){return {enabled:false,reason:error.message,targetId:'sff-v2.1',backendId:BACKEND};}
}
function sourceSnapshots(build){
 const root=path.resolve(build.outputDirectory),sources=new Map(),seals=[];
 for(const entry of build.specification.sprites){
  const relative=String(entry.source?.relativePath||''),filename=path.resolve(root,...relative.replace(/\\/g,'/').split('/'));
  if(!relative||path.isAbsolute(relative)||filename===root||!filename.startsWith(root+path.sep))fail('A source escaped its sealed build package.');
  const observed=directFile(filename,entry.source.byteHash);sources.set(relative,observed.bytes);seals.push({entryId:entry.entryId,path:filename,identity:observed.identity,byteHash:observed.byteHash,byteLength:observed.byteLength});
 }
 return {sources,seals};
}
function artifact(directory,name,core){
 const receiptHash=hashCanonical(core),value={...core,receiptHash},bytes=Buffer.from(JSON.stringify(value)+'\n'),filename=path.join(directory,name),fd=fs.openSync(filename,'wx',0o600);
 try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 return {path:filename,byteHash:sha(bytes),receiptHash,value};
}
async function executeQuickNativeWrite(input){
 const {build,draft,plan,intent,assertCurrent}=input||{};
 // Evidence is one immutable byte snapshot for this action; it is not described as a fresh disk observation after awaits.
 const capabilityRequest=JSON.parse(JSON.stringify(input?.capabilityRequest||require('./sff_bundled_certification').resolveBundledSffCertification('sff-v2.1',BACKEND).capabilityRequest||{}));
 if(typeof assertCurrent!=='function')fail('The current source/view authority guard is required.');
 assertQuickWriteIntent(intent,{build,draft,plan,writerMode:'ikemaker'});
 const available=inspectQuickNativeAvailability({draft,build,capabilityRequest});if(!available.enabled)fail(available.reason);
 if(!build.specificationPath||!build.outputDirectory)fail('The sealed build package is missing.');
 return safety.withTargetLease(intent.target.path,async()=>{
  await assertCurrent();assertQuickWriteIntent(intent,{build,draft,plan,writerMode:'ikemaker'});
  const target=directFile(intent.target.path,intent.target.expectedHash),snapshot={filename:target.path,exists:true,hash:target.byteHash};
  const specificationFile=directFile(build.specificationPath),specification=JSON.parse(specificationFile.bytes.toString('utf8'));
  if(specificationHash(specification)!==String(intent.specificationHash).toLowerCase()||hashCanonical(specification)!==hashCanonical(build.specification))fail('The sealed specification changed.');
  const admitted=draft.sources.map(source=>{const value=directFile(source.path,source.byteHash);return {path:value.path,identity:value.identity,byteHash:value.byteHash,byteLength:value.byteLength};});
  const prepared=sourceSnapshots(build),bytes=createSffV21Bytes(specification,{sources:prepared.sources}),validation=assertSffV21Mixed(bytes,specification,{compatibilityProfile:'canonical'}),candidateHash=sha(bytes);
  const privateParent=require('./sff_private_storage').directory('builds'),run=safety.createPrivateRun(fs,target.path,{parent:privateParent});
  fs.writeFileSync(run.candidate,bytes,{flag:'wx',mode:0o600});const candidate=directFile(run.candidate,candidateHash);
  let retainedRecovery=null,adoptionStarted=false,adopted=false,executionReceipt=null;
  try{
   await assertCurrent();assertQuickWriteIntent(intent,{build,draft,plan,writerMode:'ikemaker'});
   const finalAvailability=inspectQuickNativeAvailability({draft,build,capabilityRequest});if(!finalAvailability.enabled)fail(finalAvailability.reason);
   if(!sameFile(specificationFile,directFile(build.specificationPath,specificationFile.byteHash)))fail('The specification file identity changed.');
   for(const source of [...prepared.seals,...admitted]){const fresh=directFile(source.path,source.byteHash);if(hashCanonical(fresh.identity)!==hashCanonical(source.identity))fail('A sealed source file was replaced.');}
   if(!sameFile(target,directFile(target.path,target.byteHash)))fail('The target identity changed before adoption.');
   retainedRecovery=recovery.createTransactionRecovery(snapshot);
   if(!sameFile(target,directFile(target.path,target.byteHash)))fail('The target changed while recovery was created.');
   adoptionStarted=true;
   const adoption=safety.adoptCandidate(fs,{bytes:Buffer.from(candidate.bytes),hash:candidateHash},snapshot,{label:'single-explicit-quick-native-sff-write',backup:false,journal:true,journalRoot:run.directory});adopted=true;
   const installed=directFile(target.path,candidateHash);assertSffV21Mixed(installed.bytes,specification,{compatibilityProfile:'canonical'});
   executionReceipt=artifact(run.directory,'quick-write-execution.json',{schema:'ikemaker.sff-quick-native-write-execution',version:1,authorization:'single-explicit-Write-SFF-action',intentHash:intent.intentHash,specificationHash:intent.specificationHash,specificationArtifactByteHash:specificationFile.byteHash,sourceSnapshotHash:hashCanonical(prepared.seals),capabilityAssessmentHash:finalAvailability.assessmentHash,capabilityEvidenceHash:hashCanonical(capabilityRequest),backendId:BACKEND,status:'written-target-verified-recovery-pending',targetBefore:{path:target.path,identity:target.identity,byteHash:target.byteHash},installed:{path:installed.path,identity:installed.identity,byteHash:installed.byteHash,byteLength:installed.byteLength},candidateHash,validationProfile:validation.profile,transactionJournal:adoption.journal||null,recoveryPath:retainedRecovery.directory});
   const recoveryCleanup=recovery.completeTransactionRecovery(retainedRecovery,{targetFilename:target.path,expectedTargetHash:candidateHash,receiptPath:executionReceipt.path,receiptHash:executionReceipt.byteHash});
   const candidateNow=directFile(run.candidate,candidateHash);if(hashCanonical(candidateNow.identity)!==hashCanonical(candidate.identity))fail('The owned candidate was replaced before cleanup.');fs.unlinkSync(run.candidate);
   const completion=artifact(run.directory,'quick-write-completion.json',{schema:'ikemaker.sff-quick-native-write-completion',version:1,intentHash:intent.intentHash,executionReceiptByteHash:executionReceipt.byteHash,status:recoveryCleanup.removed?'written-cleanup-complete':'written-recovery-retained',targetPath:target.path,byteHash:candidateHash,recoveryCleanup,rollbackAvailable:recoveryCleanup.removed?false:null});
   return {cancelled:false,written:true,verified:recoveryCleanup.verified===true,status:completion.value.status,targetPath:target.path,byteHash:candidateHash,candidatePath:null,specificationPath:build.specificationPath,executionReceiptPath:executionReceipt.path,completionReceiptPath:completion.path,recoveryCleanup,finalReady:plan.ready,...(recoveryCleanup.retained?{warning:'SFF written; temporary recovery was retained: '+recoveryCleanup.path}: {})};
  }catch(error){
   let observed=null;try{observed=directFile(target.path);}catch(_){}
   const targetState=observed&&sameFile(target,observed)?'original-seal':observed?.byteHash===candidateHash?'candidate-bytes':'changed-or-unobservable',targetWritten=!adoptionStarted?false:adopted||targetState==='candidate-bytes'?true:targetState==='original-seal'?false:null,recoveryExists=Boolean(retainedRecovery&&fs.existsSync(retainedRecovery.file.path));
   error.quickWrite={targetWritten,targetState,targetChanged:targetState!=='original-seal',targetPath:target.path,candidatePath:run.candidate,recoveryPath:recoveryExists?retainedRecovery.directory:null,rollbackAvailable:recoveryExists,executionReceiptPath:executionReceipt?.path||null};
   if(targetWritten!==false)error.message='The SFF write may have completed; verify the target before retrying. '+error.message;
   if(recoveryExists)error.message+=' Recovery retained at '+retainedRecovery.directory+'.';
   else if(retainedRecovery)error.message+=' No temporary rollback copy remains; inspect the execution receipt.';
   throw error;
  }
 });
}
module.exports={inspectQuickNativeAvailability,executeQuickNativeWrite};
