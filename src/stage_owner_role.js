'use strict';
const fs=require('node:fs'),path=require('node:path');
// Official 6e564af: system.go6275–6286 assigns attached roots teamside=-1,
// fighters0/1. bytecode.go2735 exposes teamside+1; compiler.go4257 accepts it.
// Helpers inherit teamside (char.go7192), hence the separate !isHelper guard.
// This identifies the neutral attached role, not a guessed declaration/slot order.
const OWNER_GUARD='!isHelper && teamSide = 0';
function sourceIdentity(filename){const resolved=path.resolve(filename);if(fs.existsSync(resolved)){const stat=fs.statSync(resolved,{bigint:true});if(stat.ino!==0n)return 'physical:'+stat.dev+':'+stat.ino;return fs.realpathSync(resolved).toLowerCase();}return resolved.toLowerCase();}
function assertDedicatedAttachedSource(ownerFilename,otherOwnerSources=[]){
 if(typeof ownerFilename!=='string')return; // The caller reports its normal missing-source error.
 const own=sourceIdentity(ownerFilename);for(const source of otherOwnerSources)if(sourceIdentity(source.filename)===own)throw Error('This writable source is also loaded by another attached owner: '+source.filename+'. Choose or create a dedicated attached-owner ZSS source before generating Stage behavior. Fighter reuse is role-guarded; multiple attached runtime instances are not interchangeable.');
}
const ROLE_REVIEW='Coordinator runs only as a neutral attached root (teamSide0, no helper). Fighter reuse of this source cannot coordinate Stage writes. The writable source must not be loaded by another attached DEF; complete linked-owner inventories are checked. Declaration numbers are not runtime slot identities.';
module.exports={OWNER_GUARD,ROLE_REVIEW,assertDedicatedAttachedSource};
