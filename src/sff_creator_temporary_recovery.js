'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { hashCanonical } = require('./sff_capability_report');
const { reviewedPathKey } = require('./sff_creator_reviewed_path');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const identity = stat => ({device:String(stat.dev), inode:String(stat.ino)});
const sameReviewedPath = (left,right) => typeof left==='string'&&typeof right==='string'&&path.isAbsolute(left)&&path.isAbsolute(right)&&reviewedPathKey(left)===reviewedPathKey(right);
function fail(message) { throw new Error(`SFF temporary recovery: ${message}`); }
function directDirectory(filename) {
  const absolute=path.resolve(filename), stat=fs.lstatSync(absolute,{bigint:true});
  if(!stat.isDirectory()||stat.isSymbolicLink()||fs.realpathSync.native(absolute).toLowerCase()!==absolute.toLowerCase())fail(`directory is not direct: ${absolute}`);
  return {path:absolute,identity:identity(stat)};
}
function readJson(filename) {
  const stat=fs.lstatSync(filename,{bigint:true});
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1n||stat.size>65536n)fail(`invalid receipt file: ${filename}`);
  return JSON.parse(fs.readFileSync(filename,'utf8'));
}
function syncDirectory(directory) {
  let fd;try{fd=fs.openSync(directory,'r');fs.fsyncSync(fd);}catch(error){if(!['EISDIR','EINVAL','ENOTSUP','EPERM','EACCES'].includes(error.code))throw error;}finally{if(fd!==undefined)fs.closeSync(fd);}
}
function writeJson(filename,value) {
  const bytes=Buffer.from(JSON.stringify(value)+'\n'), fd=fs.openSync(filename,'wx',0o600);
  try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  syncDirectory(path.dirname(filename));
}
function prepareTemporaryRecovery(storageRoot,operationId,activePath) {
  if(!/^[a-f0-9]{64}$/.test(operationId))fail('operation identity is invalid.');
  const storage=directDirectory(storageRoot), root=path.join(storage.path,'sff-creator-recovery');
  if(!fs.existsSync(root))fs.mkdirSync(root,{mode:0o700});directDirectory(root);
  const directory=path.join(root,operationId), marker={schema:'ikemaker.sff-temporary-recovery-owner',version:1,operationId,activePath:path.resolve(activePath)};
  if(!fs.existsSync(directory)){fs.mkdirSync(directory,{mode:0o700});writeJson(path.join(directory,'owner.json'),marker);}
  const seal=directDirectory(directory), owner=readJson(path.join(directory,'owner.json'));
  if(!owner||Object.keys(owner).sort().join(',')!=='activePath,operationId,schema,version'||owner.schema!==marker.schema||owner.version!==marker.version||owner.operationId!==operationId||!sameReviewedPath(owner.activePath,marker.activePath))fail('private recovery ownership differs.');
  // Keep the original marker and its exact hash. A resume through the other
  // spelling of the same Windows drive must not rewrite sealed authority.
  return {mode:'temporary',operationId,activePath:owner.activePath,directory:seal,ownerHash:hashCanonical(owner)};
}
function assertTemporaryRecovery(recovery,activePath) {
  if(!recovery||Object.keys(recovery).sort().join(',')!=='activePath,directory,mode,operationId,ownerHash'||recovery.mode!=='temporary'||!sameReviewedPath(recovery.activePath,path.resolve(activePath))||!/^[a-f0-9]{64}$/.test(recovery.operationId))fail('reviewed recovery descriptor is invalid.');
  const seal=directDirectory(recovery.directory.path);
  if(path.basename(seal.path)!==recovery.operationId||path.basename(path.dirname(seal.path))!=='sff-creator-recovery'||hashCanonical(seal)!==hashCanonical(recovery.directory))fail('private recovery directory identity drifted.');
  const marker=readJson(path.join(seal.path,'owner.json'));
  if(hashCanonical(marker)!==recovery.ownerHash||marker.operationId!==recovery.operationId||!sameReviewedPath(marker.activePath,recovery.activePath))fail('private recovery owner marker drifted.');
  return seal.path;
}
function exactFile(filename,hash,length,expectedIdentity) {
  const stat=fs.lstatSync(filename,{bigint:true});
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1n||stat.size!==BigInt(length)||expectedIdentity&&hashCanonical(identity(stat))!==hashCanonical(expectedIdentity))fail(`file identity/length drifted: ${filename}`);
  const bytes=fs.readFileSync(filename);if(sha(bytes)!==hash)fail(`file bytes drifted: ${filename}`);
  return identity(stat);
}
function recoveryAuthority(snapshot) {
  const row=snapshot.authority.artifacts.find(item=>item.name==='sff17b-execution-layout-approval-receipt');
  if(!row)return null;
  const layout=JSON.parse(snapshot.readArtifactBytes(row.name).toString('utf8'));
  if(!layout.rollback?.recovery)return null;
  const recovery=layout.rollback.recovery, directory=assertTemporaryRecovery(recovery,snapshot.authority.activePath);
  if(recovery.operationId!==snapshot.authority.operationId||!sameReviewedPath(layout.paths.backupPath,path.join(directory,'previous.sff'))||!sameReviewedPath(layout.paths.destinationPath,snapshot.authority.activePath))fail('completed recovery binding drifted.');
  const outcomeRow=snapshot.authority.artifacts.find(item=>item.name==='sff17d-execution-outcome-receipt');
  if(!outcomeRow)fail('completed recovery lacks sealed execution outcome.');
  const outcome=JSON.parse(snapshot.readArtifactBytes(outcomeRow.name).toString('utf8'));
  // A completed rollback keeps its private old archive. It never authorizes the
  // committed-install cleanup that removes that copy.
  if(outcome.state==='rolled_back' && outcome.rollbackAttempted===true && outcome.rollbackSucceeded===true) {
    if(!sameReviewedPath(outcome.backup?.path,layout.paths.backupPath) || !sameReviewedPath(outcome.active?.path,layout.paths.destinationPath) || outcome.active?.byteHash!==layout.active.byteHash || outcome.backup?.byteHash!==layout.active.byteHash) fail('completed rollback backup or restored archive binding drifted.');
    const terminalHash=snapshot.authority.terminalHistoryEvidence?.terminalReceiptHash;
    if(hashCanonical(outcome)!==terminalHash) {
      const terminalRow=snapshot.authority.artifacts.find(item=>item.name==='sff19c-recovery-outcome-receipt');
      if(!terminalRow)fail('completed rollback lacks its exact recovery terminal receipt.');
      const terminal=JSON.parse(snapshot.readArtifactBytes(terminalRow.name).toString('utf8'));
      if(hashCanonical(terminal)!==terminalHash || terminal.schema!=='ikemaker.sff-creator-restart-recovery-execution-receipt' || terminal.recoveryCompleted!==true || terminal.terminalState!=='recovery_complete' || terminal.selectedAction!=='cleanup-verified-terminal-artifacts' || terminal.operationId!==hashCanonical(layout) || !sameReviewedPath(terminal.destination?.activePath,layout.paths.destinationPath) || terminal.destination.expectedAfterAuthority!=='old-active' || terminal.destination.expectedAfterByteHash!==layout.active.byteHash || terminal.destination.expectedAfterByteLength!==layout.active.byteLength || terminal.backupModified!==false || terminal.activeArchiveModified!==false)fail('completed rollback recovery receipt drifted.');
    }
    return {layout,recovery,directory,outcome,retainedAfterRollback:true};
  }
  if(outcome.status!=='committed'||outcome.terminalState!=='cleanup_complete'||outcome.cleanupIssues?.length||hashCanonical(outcome)!==snapshot.authority.terminalHistoryEvidence.terminalReceiptHash||!sameReviewedPath(outcome.backup?.path,layout.paths.backupPath)||!sameReviewedPath(outcome.installed?.path,layout.paths.destinationPath))fail('temporary cleanup requires an exact clean committed outcome.');
  return {layout,recovery,directory,outcome};
}
function cleanupBinding(snapshot,authority) {
  const {layout,recovery}=authority;
  return {schema:'ikemaker.sff-temporary-recovery-cleanup',version:1,operationId:snapshot.authority.operationId,completedCheckpointHash:snapshot.authority.semanticHeadRecordHash,recovery,backup:{path:layout.paths.backupPath,byteHash:layout.active.byteHash,byteLength:layout.active.byteLength},installed:{path:layout.paths.destinationPath,byteHash:layout.candidate.byteHash,byteLength:layout.candidate.byteLength}};
}
function validateCleanup(raw,binding,status) {
  const {receiptHash,...core}=raw;
  if(core.status!==status||hashCanonical(core)!==receiptHash||hashCanonical({...core,status:undefined,backupIdentity:undefined,installedIdentity:undefined,rollbackAvailable:undefined})!==hashCanonical(binding)||core.rollbackAvailable!==false)fail('cleanup receipt binding drifted.');
  return raw;
}
function currentTarget(binding,expectedIdentity) {
  try{exactFile(binding.installed.path,binding.installed.byteHash,binding.installed.byteLength,expectedIdentity);return {currentTargetStatus:'matched'};}
  catch(error){return {currentTargetStatus:'changed-or-unavailable',currentTargetError:String(error.message).slice(0,1000)};}
}
function observeTemporaryRecoveryProjection(snapshot) {
  const authority=recoveryAuthority(snapshot);if(!authority)return null;
  if(authority.retainedAfterRollback) {
    const {layout,outcome}=authority;
    exactFile(layout.paths.backupPath,layout.active.byteHash,layout.active.byteLength,outcome.backup.identity);
    const target={installed:{path:layout.paths.destinationPath,byteHash:layout.active.byteHash,byteLength:layout.active.byteLength}};
    return {...currentTarget(target,outcome.active.identity),mode:'temporary',status:'retained-after-rollback',backupPath:layout.paths.backupPath,rollbackAvailable:true,cleanupRequired:false,receiptHash:snapshot.authority.terminalHistoryEvidence.terminalReceiptHash};
  }
  const binding=cleanupBinding(snapshot,authority), intentPath=path.join(authority.directory,'cleanup-intent.json'), receiptPath=path.join(authority.directory,'cleanup-receipt.json');
  if(fs.existsSync(receiptPath)) {
    const receipt=validateCleanup(readJson(receiptPath),binding,'cleanup-complete');
    if(hashCanonical(receipt.backupIdentity)!==hashCanonical(authority.outcome.backup.identity)||hashCanonical(receipt.installedIdentity)!==hashCanonical(authority.outcome.installed.identity))fail('cleanup receipt differs from sealed file identities.');
    if(fs.existsSync(binding.backup.path))fail('cleaned recovery backup unexpectedly exists.');
    return {...currentTarget(binding,receipt.installedIdentity),mode:'temporary',status:'cleaned',backupPath:binding.backup.path,rollbackAvailable:false,cleanupRequired:false,receiptHash:receipt.receiptHash};
  }
  if(fs.existsSync(intentPath)) {
    const intent=validateCleanup(readJson(intentPath),binding,'cleanup-intent');
    if(hashCanonical(intent.backupIdentity)!==hashCanonical(authority.outcome.backup.identity)||hashCanonical(intent.installedIdentity)!==hashCanonical(authority.outcome.installed.identity))fail('cleanup intent differs from sealed file identities.');
    const exists=fs.existsSync(binding.backup.path);
    if(exists)exactFile(binding.backup.path,binding.backup.byteHash,binding.backup.byteLength,intent.backupIdentity);
    return {...currentTarget(binding,intent.installedIdentity),mode:'temporary',status:'cleanup-interrupted',backupPath:binding.backup.path,rollbackAvailable:exists,cleanupRequired:true,receiptHash:intent.receiptHash};
  }
  exactFile(binding.backup.path,binding.backup.byteHash,binding.backup.byteLength,authority.outcome.backup.identity);
  return {...currentTarget(binding,authority.outcome.installed.identity),mode:'temporary',status:'retained',backupPath:binding.backup.path,rollbackAvailable:true,cleanupRequired:true,receiptHash:null};
}
function readTemporaryRecoveryProjection(snapshot) {
  try{return observeTemporaryRecoveryProjection(snapshot);}
  catch(error){return {mode:'temporary',status:'recovery-unverified',backupPath:null,rollbackAvailable:false,cleanupRequired:true,receiptHash:null,error:String(error.message).slice(0,1000)};}
}
function cleanupCompletedTemporaryRecovery(locator,options={}) {
  // Completed remains independently verified historical authority. Cleanup has
  // a separate current-availability receipt, never a replacement outcome.
  require('./sff_creator_saved_completed_verifier').verifySavedCreatorCompletedFromVault(locator);
  const snapshot=require('./sff_creator_operation_vault').readCreatorOperationVaultCheckpointSnapshot(locator), authority=recoveryAuthority(snapshot);
  if(!authority)return null;
  const projection=readTemporaryRecoveryProjection(snapshot);if(projection.status==='cleaned'||projection.status==='retained-after-rollback')return projection;
  const binding=cleanupBinding(snapshot,authority), intentPath=path.join(authority.directory,'cleanup-intent.json'), receiptPath=path.join(authority.directory,'cleanup-receipt.json');
  let intent;
  if(fs.existsSync(intentPath))intent=validateCleanup(readJson(intentPath),binding,'cleanup-intent');
  else {
    const installedIdentity=exactFile(binding.installed.path,binding.installed.byteHash,binding.installed.byteLength,authority.outcome.installed.identity), backupIdentity=exactFile(binding.backup.path,binding.backup.byteHash,binding.backup.byteLength,authority.outcome.backup.identity), core={...binding,backupIdentity,installedIdentity,status:'cleanup-intent',rollbackAvailable:false};
    intent={...core,receiptHash:hashCanonical(core)};writeJson(intentPath,intent);
  }
  if(typeof options.faultAt==='function')options.faultAt('cleanup-intent-retained');
  if(hashCanonical(intent.backupIdentity)!==hashCanonical(authority.outcome.backup.identity)||hashCanonical(intent.installedIdentity)!==hashCanonical(authority.outcome.installed.identity))fail('cleanup intent identity authority drifted.');
  exactFile(binding.installed.path,binding.installed.byteHash,binding.installed.byteLength,intent.installedIdentity);
  assertTemporaryRecovery(authority.recovery,binding.installed.path);
  if(fs.existsSync(binding.backup.path)){exactFile(binding.backup.path,binding.backup.byteHash,binding.backup.byteLength,intent.backupIdentity);fs.unlinkSync(binding.backup.path);syncDirectory(authority.directory);}
  if(typeof options.faultAt==='function')options.faultAt('backup-removed');
  const {receiptHash:unused,...intentCore}=intent, core={...intentCore,status:'cleanup-complete'}, receipt={...core,receiptHash:hashCanonical(core)};
  writeJson(receiptPath,receipt);
  return readTemporaryRecoveryProjection(snapshot);
}
module.exports={prepareTemporaryRecovery,assertTemporaryRecovery,exactFile,readJson,writeJson,readTemporaryRecoveryProjection,cleanupCompletedTemporaryRecovery};
