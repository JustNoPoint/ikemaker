'use strict';

const fs=require('fs'), os=require('os'), path=require('path');
const {hash,transactionalWrite}=require('./mutation_safety');
const {readSff,paletteRgba}=require('./sff_reader');
const {analyzeSffTransferConflicts}=require('./sff_transfer_conflict_model');
const {planSffTransferResolution}=require('./sff_transfer_resolution_model');

function dependencyDecisions(analysis,destination){
  const imported=new Map(),used=new Set(destination.palettes.map(p=>p.group+','+p.number));
  const items=analysis.items.map(item=>{
    const choice={id:item.id};
    if(item.collision.decisionRequired)choice.identity={action:'add-next-free'};
    if(item.link.status==='broken')throw Error('Broken source sprite link at '+item.identity);
    if(item.link.decisionRequired)choice.link={action:'flatten-copy'};
    const palette=item.palette;
    if(palette.status==='missing-or-invalid')throw Error('Missing attached palette for '+item.identity);
    if(palette.status==='unmatched'){
      if(!imported.has(palette.sourcePaletteIndex)){
        const [group,original]=palette.sourcePaletteIdentity.split(',').map(Number);
        let number=original;
        if(used.has(group+','+number)){number=0;while(used.has(group+','+number))number++;}
        if(number>65535)throw Error('No free palette ID in group '+group);
        used.add(group+','+number);
        imported.set(palette.sourcePaletteIndex,{action:'import-source-palette',destinationPaletteGroup:group,destinationPaletteIndex:number});
      }
      choice.palette=imported.get(palette.sourcePaletteIndex);
    }
    return choice;
  });
  return {items,placement:{kind:'append-end'}};
}

function planImport(review,source,destination){
  if(review.missingSourceSprites.length)throw Error('Missing or ambiguous source sprites: '+review.missingSourceSprites.map(d=>d.id).join(', '));
  const endpoints=require('./sff_transfer_host');
  const evidence={source:endpoints.endpointForFile(source.filename),destination:endpoints.endpointForFile(destination.filename)};
  for(const [role,archive] of [['source',source],['destination',destination]])
    if(evidence[role].fingerprint.toLowerCase()!==hash(archive.buffer))throw Error('The '+role+' SFF changed during review.');
  const dependencies=review.spriteDependencies;
  const map=(d,id)=>{const [destinationGroup,destinationIndex]=id.split(',').map(Number);return {sourceId:d.id,destinationGroup,destinationIndex,verified:true};};
  const sourceFile=fs.statSync(source.filename,{bigint:true});
  const destinationFile=fs.statSync(destination.filename,{bigint:true});
  const shared=sourceFile.ino!==0n&&sourceFile.dev===destinationFile.dev&&sourceFile.ino===destinationFile.ino;
  if(shared||fs.realpathSync.native(source.filename)===fs.realpathSync.native(destination.filename))
    return {evidence,mappings:dependencies.map(d=>map(d,d.id))};
  if(destination.header.legacy)throw Error('Import sprites needs an SFF v2 destination. Your AIR and SFF are unchanged.');
  if(dependencies.length>512)throw Error('Transfer at most 512 distinct sprites at a time.');
  const rows=dependencies.map(d=>({physicalIndex:d.physicalIndices[0],group:d.group,number:d.number}));
  const selection=require('./sff_browser').transferSelectionItems(source,rows);
  const session=require('./sff_quick_transfer').standaloneReview(evidence.source,evidence.destination,selection);
  const reference=require('./sff_assembly_workspace').assemblyReference(destination.filename,source.filename);
  const seed=require('./sff_transfer_assembly_adapter').createSffTransferAssemblySeed({reference,session,sourceArchive:source,destinationArchive:destination});
  const analysis=analyzeSffTransferConflicts({seed,sourceArchive:source,destinationArchive:destination});
  const resolution=planSffTransferResolution({analysis,decisions:dependencyDecisions(analysis,destination),destinationArchive:destination});
  if(!resolution.readyForApply)throw Error('Referenced sprite placement or palette could not be resolved.');
  const byIndex=new Map(resolution.items.map(item=>[item.sourcePhysicalIndex,item.destinationIdentity]));
  return {evidence,mappings:dependencies.map(d=>map(d,byIndex.get(d.physicalIndices[0]))),source,destination,seed,analysis,resolution};
}

async function writeSprites(plan,current,onAdopted){
  if(!plan.resolution)return;
  const {source,destination,seed,analysis,resolution}=plan;
  const clean=()=>require('./sff_viewer').quickTransferDestinationClean(destination.filename);
  if(!clean())throw Error('Finish pending edits in the destination sprite viewer before importing sprites.');
  const packageRoot=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-air-sprites-'));
  const prepared=await require('./sff_transfer_apply').prepareSffTransferBuild({packageRoot,seed,analysis,resolution,sourceArchive:source,destinationArchive:destination});
  const result=await require('./sff_commands').executeGeneratedBuild(prepared.generated,{
    confirmAdoption:()=>{current();return clean();},onAdopted:({candidateHash})=>onAdopted(candidateHash)
  });
  if(result.cancelled)throw Error('The sprite import was cancelled before the AIR edit.');
  const final=readSff(destination.filename);
  if(hash(final.buffer)!==result.candidateHash.toLowerCase())throw Error('Destination SFF changed after verification.');
  const rows=require('./sff_view_organization').snapshot(final).rows;
  require('./sff_assembly_workspace').resolveAppliedPhysicalMappings({resolution,validated:seed,specification:prepared.generated.specification,finalRows:rows});
  for(const item of resolution.items){
    if(item.paletteAction==='not-applicable')continue;
    const sprite=final.sprites.find(s=>s.group+','+s.number===item.destinationIdentity);
    if(!sprite||JSON.stringify(paletteRgba(final,sprite.paletteIndex))!==JSON.stringify(paletteRgba(source,item.sourcePaletteIndex)))
      throw Error('Palette verification failed for sprite '+item.destinationIdentity);
  }
  plan.evidence={...plan.evidence,destination:{...plan.evidence.destination,fingerprint:result.candidateHash.toUpperCase()}};
  return final;
}

function restoreDestination(plan,candidateHash){
  transactionalWrite(fs,plan.destination.filename,plan.destination.buffer,{expectedHash:candidateHash.toLowerCase(),allowExisting:true,label:'restore-incomplete-air-sprite-import',backup:false,journal:false});
}
module.exports={planImport,writeSprites,restoreDestination,dependencyDecisions};
