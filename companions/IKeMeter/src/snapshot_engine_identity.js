'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');

const statOptions = {bigint:true};
const chunkBytes = 64 * 1024;

function sameFile(a, b) {
  return b.isFile() && ['dev','ino','size','mtimeNs'].every(key=>a[key]===b[key]);
}

function requireIdentity(expected, actual) {
  if (!sameFile(expected,actual)) throw Error('Snapshot executable identity changed since Connect');
}

function locateExecutable(filename) {
  const selected=fs.lstatSync(filename,statOptions);
  if (!selected.isFile()) throw Error('Choose an ordinary IKEMEN executable file');
  const imagePath=fs.realpathSync(filename);
  const identity=fs.lstatSync(imagePath,statOptions);
  requireIdentity(selected,identity);
  return {imagePath,identity};
}

function verifyLaunchExecutable(filename, imagePath, identity) {
  const current=locateExecutable(filename);
  if (path.relative(imagePath,current.imagePath)!=='') throw Error('The selected executable path changed before launch');
  requireIdentity(identity,current.identity);
}

async function hashSnapshotExecutable(imagePath, identity, signal) {
  signal.throwIfAborted();
  const io=fs.promises;
  requireIdentity(identity,await io.lstat(imagePath,statOptions));
  const descriptor=await io.open(imagePath,'r');
  try {
    signal.throwIfAborted();
    requireIdentity(identity,await descriptor.stat(statOptions));
    requireIdentity(identity,await io.stat(imagePath,statOptions));
    const hash=createHash('sha256'), chunk=Buffer.allocUnsafe(chunkBytes);
    let remaining=identity.size;
    while (remaining>0n) {
      signal.throwIfAborted();
      const length=remaining<BigInt(chunk.length)?Number(remaining):chunk.length;
      const {bytesRead}=await descriptor.read(chunk,0,length,null);
      if (!bytesRead) throw Error('Snapshot executable became shorter while hashing');
      hash.update(chunk.subarray(0,bytesRead));
      remaining-=BigInt(bytesRead);
    }
    signal.throwIfAborted();
    requireIdentity(identity,await descriptor.stat(statOptions));
    requireIdentity(identity,await io.lstat(imagePath,statOptions));
    requireIdentity(identity,await io.stat(imagePath,statOptions));
    signal.throwIfAborted();
    return {executable:'Ikemen_GO.exe',sha256:hash.digest('hex'),basis:'on-disk-launched-image-path-connect-file-identity'};
  } finally {
    await descriptor.close();
  }
}

module.exports={locateExecutable,verifyLaunchExecutable,hashSnapshotExecutable};
