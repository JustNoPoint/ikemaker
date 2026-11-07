'use strict';
const fs=require('node:fs'),path=require('node:path'),{hash}=require('./mutation_safety'),{canonical,stageDiskEdit}=require('./stage_source_representation'),{parseDef}=require('./def_model');
const HASH=/^[a-f0-9]{64}$/,isHash=value=>typeof value==='string'&&HASH.test(value),FIELDS=['canonicalHash','decodedSourceHash','filename','rawSourceHash','sourceDiskHash','structureHash','version'],fileKey=file=>path.resolve(file).toLowerCase();
function validShape(alias){return Boolean(alias&&typeof alias==='object'&&Object.keys(alias).sort().join('|')===FIELDS.join('|')&&alias.version===1&&typeof alias.filename==='string'&&alias.filename.length<=4096&&!/[\0\r\n]/.test(alias.filename)&&path.isAbsolute(alias.filename)&&['canonicalHash','decodedSourceHash','rawSourceHash','sourceDiskHash','structureHash'].every(key=>isHash(alias[key])));}
function representations(raw){
 if(!Buffer.isBuffer(raw))throw Error('A raw Stage byte snapshot is required for draft decoding.');
 const text=raw.toString('utf8');if(!Buffer.from(text,'utf8').equals(raw)||!stageDiskEdit(raw,text,text).equals(raw))throw Error('Stage draft decoding requires exact UTF-8 source bytes.');
 const normalized=canonical(text),structureHash=hash(JSON.stringify(parseDef(text).sections)),candidates=[text,text.replace(/^\uFEFF/,''),normalized,normalized.replace(/\n/g,'\r\n'),'\uFEFF'+normalized,'\uFEFF'+normalized.replace(/\n/g,'\r\n')];
 return {rawSourceHash:hash(raw),canonicalHash:hash(normalized),structureHash,decodedHashes:new Set(candidates.filter(candidate=>hash(JSON.stringify(parseDef(candidate).sections))===structureHash&&stageDiskEdit(raw,candidate,candidate).equals(raw)).map(hash))};
}
function validAlias(alias,raw,filename){
 try{if(!validShape(alias)||filename&&fileKey(filename)!==fileKey(alias.filename))return false;const expected=representations(raw);return alias.sourceDiskHash===hash(raw)&&alias.rawSourceHash===expected.rawSourceHash&&alias.canonicalHash===expected.canonicalHash&&alias.structureHash===expected.structureHash&&expected.decodedHashes.has(alias.decodedSourceHash);}catch{return false;}
}
function createStageDecodeAlias(owner,result){
 if(owner.disposed||owner.invalidated||!owner.payload||!result||!['previousSourceHash','sourceHash','sourceDiskHash'].every(key=>isHash(result[key])))throw Error('A current clean Stage decode result is required for its draft alias.');
 const raw=fs.readFileSync(owner.filename),expected=representations(raw),alias={version:1,filename:path.resolve(owner.filename),sourceDiskHash:hash(raw),rawSourceHash:result.previousSourceHash,decodedSourceHash:result.sourceHash,canonicalHash:expected.canonicalHash,structureHash:expected.structureHash};
 if(owner.payload.sourceDiskHash!==alias.sourceDiskHash||result.sourceDiskHash!==alias.sourceDiskHash||owner.payload.sourceHash!==alias.decodedSourceHash||!validAlias(alias,raw,owner.filename))throw Error('Stage bytes or decoded representation changed before creating its draft alias.');
 owner.sourceDecodeAlias=Object.freeze(alias);return owner.sourceDecodeAlias;
}
function validStageDecodeAlias(alias,payload,rawBytes){return Boolean(payload&&typeof payload.filename==='string'&&isHash(payload.sourceHash)&&isHash(payload.sourceDiskHash)&&Buffer.isBuffer(rawBytes)&&hash(rawBytes)===payload.sourceDiskHash&&validAlias(alias,rawBytes,payload.filename)&&alias.sourceDiskHash===payload.sourceDiskHash&&[alias.rawSourceHash,alias.decodedSourceHash].includes(payload.sourceHash));}
function stageDraftBaselineMatches(record,payload,rawBytes){
 if(!record||!payload||!isHash(record.sourceHash)||!isHash(payload.sourceHash)||!isHash(payload.sourceDiskHash)||!Buffer.isBuffer(rawBytes)||hash(rawBytes)!==payload.sourceDiskHash)return false;
 if(record.sourceHash===payload.sourceHash)return true;
 const alias=record.sourceDecodeAlias;
 if(alias!==undefined){if(!validStageDecodeAlias(alias,payload,rawBytes))return false;const accepted=new Set([alias.rawSourceHash,alias.decodedSourceHash]);return accepted.has(record.sourceHash)&&accepted.has(payload.sourceHash);}
 return false;
}
async function rebaseStageDecodeDraft(store,key,alias){
 if(!validShape(alias))throw Error('A bounded Stage draft decode alias is required.');const raw=fs.readFileSync(alias.filename);if(!validAlias(alias,raw))throw Error('Stage draft decode alias no longer matches the exact disk bytes.');
 const record=store.read(key);if(record===undefined)return false;
 if(![alias.rawSourceHash,alias.decodedSourceHash].includes(record?.sourceHash))return false;
 // FormDrafts.read clones, and stage replaces synchronously before its queued
 // flush. No await may separate this fresh read and stage: newer state wins.
 const writing=store.stage(key,{...record,sourceDecodeAlias:alias});await writing;return true;
}
module.exports={validStageDecodeAlias,createStageDecodeAlias,rebaseStageDecodeDraft,stageDraftBaselineMatches};
