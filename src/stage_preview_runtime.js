'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function freezeManifest(input){const value=JSON.parse(JSON.stringify(input));for(const row of value.files)Object.freeze(row);Object.freeze(value.files);return Object.freeze(value);}
const LEGACY=freezeManifest(require('./stage_live_runtime_manifest.json')),OFFICIAL=freezeManifest(require('./stage_live_runtime_fb269c9.json')),PROFILES=Object.freeze([LEGACY,OFFICIAL]);
const LABEL='6a093924 or fb269c9';
function profileForSha(digest){return PROFILES.find(profile=>profile.files.find(row=>row.path==='Ikemen_GO.exe').sha256===digest)||null;}
function selectRuntime(executable){const profile=profileForSha(sha(fs.readFileSync(executable)));if(!profile)throw Error('Stage preview requires an exact reviewed Windows runtime ('+LABEL+'). Unknown or changed executables are not accepted.');return profile;}
function verifyRuntime(directory,profile,generatedSelect=false){
 if(!PROFILES.includes(profile))throw Error('Unreviewed Stage preview runtime profile.');
 for(const row of profile.files){if(path.isAbsolute(row.path)||row.path.split(/[\\/]/).some(part=>part==='..')||!/^([a-f0-9]{64})$/.test(row.sha256))throw Error('Unsafe Stage preview runtime manifest.');if(generatedSelect===true&&row.path==='data/select.def')continue;if(sha(fs.readFileSync(path.join(directory,row.path)))!==row.sha256)throw Error('Disposable reviewed runtime changed before launch: '+row.path);}
}
module.exports={LEGACY,OFFICIAL,PROFILES,LABEL,profileForSha,selectRuntime,verifyRuntime};
