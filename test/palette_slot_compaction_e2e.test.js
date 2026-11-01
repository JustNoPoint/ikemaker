'use strict';

const assert=require('assert'),crypto=require('crypto'),fs=require('fs'),os=require('os'),path=require('path');
const {createSffBuildSpecificationV2}=require('../src/sff_build_specification_v2');
const {createSffV20Raw8Bytes}=require('../src/sff_v20_raw8_writer');
const {assertSffV20Raw8}=require('../src/sff_v20_strict_validator');
const domain=require('../src/palette_domain_model'),sync=require('../src/palette_reverse_sync_candidate');
const {compactPaletteSlots}=require('../src/palette_slot_compaction');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex'),colors=seed=>Array.from({length:256},(_,i)=>[(i+seed)&255,i,255-i,i?255:0]);
function source(){const pixels=Buffer.from([0,1,1,0]),sprites=[{entryId:'sprite:0',group:0,number:0,width:2,height:2,axisX:0,axisY:0,pixels:{kind:'indexed8',decodedHash:sha(pixels)},paletteEntryId:'palette:0',source:{kind:'complete-image',relativePath:'sprite.raw',byteHash:sha(pixels),decodedHash:sha(pixels)}}],palettes=[{entryId:'palette:0',group:1,number:5,colors:colors(0),source:{relativePath:'p0',byteHash:'a'.repeat(64)}},{entryId:'palette:1',group:1,number:8,colors:colors(0),contentLinkTargetEntryId:'palette:0',source:{relativePath:'p1',byteHash:'b'.repeat(64)}}],spec=createSffBuildSpecificationV2({planId:'compact-source',selection:{targetId:'sff-v2.0',backendId:'ikemaker-builtin-sff-v2.0'},archive:{identity:'active.sff'},logical:{sourceRoot:'embedded',sprites,palettes},encodingIntent:{compression:{default:'raw8'},crop:{default:'none'},storage:{byEntryId:{'palette:1':'share-identical'}},paletteMode:'embedded',backendOptions:{'ikemaker-builtin-sff-v2.0':{}}},capabilityRequest:{requiredFeatures:['transparency.index0-binary']}});return createSffV20Raw8Bytes(spec,{decodedPixelsByEntryId:{'sprite:0':pixels}})}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-compact-e2e-'));
try{
  const sffFilename=path.join(root,'active.sff'),metadataFilename=path.join(root,'domains.json'),candidatePath=path.join(root,'candidate.sff'),before=source();fs.writeFileSync(sffFilename,before);fs.writeFileSync(metadataFilename,JSON.stringify(domain.normalizeRegistry({schema:domain.SCHEMA,version:2,revision:1,archives:{'active.sff':domain.emptyArchive()}}),null,2)+'\n');
  const parsed=assertSffV20Raw8(before),review=compactPaletteSlots({palettes:parsed.palettes,group:1,start:5,end:8}),input={sffFilename,metadataFilename,candidatePath,archiveKey:'active.sff',operationId:'compact:e2e',proposals:review.proposals,referenceFiles:[],evidenceFiles:[],aliasDecisions:{},promptProjectUpdates:true},plan=sync.normalizePlan(input);assert(plan.ready,JSON.stringify(plan.blockers));
  const built=sync.buildCandidate({...input,plan}),candidate=assertSffV20Raw8(fs.readFileSync(candidatePath));assert.deepStrictEqual(candidate.palettes.map(item=>[item.group,item.number]),[[1,5],[1,6]]);assert.strictEqual(candidate.palettes[1].link,0);assert.strictEqual(candidate.palettes[1].dataSize,0);assert.strictEqual(built.verification.verified,true);
  const adopted=sync.adopt({...input,plan,manifest:built.manifest,expectedVerificationHash:built.verification.verificationHash});assert.deepStrictEqual(assertSffV20Raw8(fs.readFileSync(sffFilename)).palettes.map(item=>[item.group,item.number]),[[1,5],[1,6]]);sync.undo({metadataFilename,receiptFile:adopted.receiptFile});assert.deepStrictEqual(fs.readFileSync(sffFilename),before);
}finally{fs.rmSync(root,{recursive:true,force:true})}
console.log('palette slot compaction candidate/adopt/undo e2e tests passed');
