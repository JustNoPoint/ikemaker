'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { preserveTargetBackup } = require('./sff_build_safety');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const identity = stat => `${stat.dev}:${stat.ino}`;
function fileSeal(filename) {
  const stat=fs.lstatSync(filename);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Recovery evidence is not a direct regular file.');
  return {path:path.resolve(filename),identity:identity(stat),hash:sha(fs.readFileSync(filename))};
}
function createTransactionRecovery(snapshot) {
  const root=require('./sff_private_storage').directory('recovery');fs.mkdirSync(root,{recursive:true});
  const directory=fs.mkdtempSync(path.join(root,'transaction-')),directoryIdentity=identity(fs.statSync(directory)),realpath=fs.realpathSync.native(directory);
  const marker=path.join(directory,'owner.json'),token=crypto.randomUUID();
  fs.writeFileSync(marker,JSON.stringify({token,target:snapshot.filename,hash:snapshot.hash,retention:'transaction-only'}),{flag:'wx'});
  try {
    const recovery=preserveTargetBackup(fs,snapshot,{directory,journal:false});
    return {...recovery,retention:'transaction-only; removed after verified target and execution receipt',directory,directoryIdentity,realpath,marker:fileSeal(marker),file:fileSeal(recovery.path)};
  } catch(error){throw Error(`${error.message} Transaction recovery evidence was retained at ${directory}.`);}
}
function completeTransactionRecovery(recovery,{targetFilename,expectedTargetHash,receiptPath,receiptHash}) {
  if(!recovery)return {verified:true,removed:true,retained:false};
  let verified=false;
  const retain=(reason,verified=true)=>({verified,removed:false,retained:true,path:recovery.directory,reason});
  try {
    if(path.resolve(targetFilename)!==path.resolve(recovery.source)||fileSeal(targetFilename).hash!==expectedTargetHash)return retain('The final target changed; recovery was retained.',false);
    if(fileSeal(receiptPath).hash!==receiptHash)return retain('The execution receipt changed; recovery was retained.',false);
    verified=true;
    const stat=fs.lstatSync(recovery.directory);
    if(!stat.isDirectory()||stat.isSymbolicLink()||identity(stat)!==recovery.directoryIdentity||fs.realpathSync.native(recovery.directory)!==recovery.realpath)return retain('The owned recovery directory identity changed.');
    const names=fs.readdirSync(recovery.directory).sort(),expected=[path.basename(recovery.path),path.basename(recovery.marker.path)].sort();
    if(JSON.stringify(names)!==JSON.stringify(expected))return retain('Unexpected contents were left untouched in recovery storage.');
    for(const seal of [recovery.file,recovery.marker]) {
      if(path.dirname(seal.path)!==recovery.directory||path.dirname(fs.realpathSync.native(seal.path))!==recovery.realpath)return retain('A recovery path changed.');
      const current=fileSeal(seal.path);if(current.identity!==seal.identity||current.hash!==seal.hash)return retain('Recovery bytes or file identity changed.');
    }
    // Delete only the two witnessed owned files, never a recursive or computed
    // user directory. A foreign file appearing now causes rmdir to refuse.
    fs.unlinkSync(recovery.file.path);fs.unlinkSync(recovery.marker.path);fs.rmdirSync(recovery.directory);
    return {verified:true,removed:true,retained:false,retention:'transaction-only'};
  } catch(error){return retain(`Recovery cleanup was refused: ${error.message}`,verified);}
}
module.exports={createTransactionRecovery,completeTransactionRecovery};
