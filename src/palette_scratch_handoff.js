'use strict';

const fs=require('fs');
const os=require('os');
const path=require('path');
const crypto=require('crypto');
const { batchPalettePreflight, stagePaletteBatch, palettePlanLocation }=require('./palette_plan');
const { hash, transactionalWrite }=require('./mutation_safety');

function sha(bytes){return crypto.createHash('sha256').update(bytes).digest('hex')}
function stageReviewedScratchPlan(sffFilename,preflight){const before=fs.readFileSync(sffFilename),beforeHash=sha(before),result=stagePaletteBatch(sffFilename,preflight),after=fs.readFileSync(sffFilename),afterHash=sha(after);if(afterHash!==beforeHash)throw new Error('The active SFF changed while staging the scratch-palette plan. Stop and restore the archive before continuing.');return{...result,activeSffUnchanged:true,activeSffHash:beforeHash}}

function reviewedShape(preflight){return JSON.stringify({mode:preflight.mode,group:preflight.group,start:preflight.start,amount:preflight.amount,assigned:preflight.assigned.map(item=>({group:item.group,number:item.number,name:item.name,tableOrder:item.tableOrder,colorSignature:item.colorSignature})),shifted:preflight.shifted,duplicates:preflight.duplicates,planSnapshot:preflight.planSnapshot,sourceSffSHA256:preflight.sourceSffSHA256});}

async function reviewAndStageScratchPlan(input,services={}){
  const io=services.fs||fs,preflight=services.preflight||batchPalettePreflight,stage=services.stage||stageReviewedScratchPlan,write=services.write||transactionalWrite,tmpRoot=services.tmpRoot||os.tmpdir(),confirm=services.confirm||input.confirm,planFile=(services.planLocation||palettePlanLocation)(input.sffFilename);
  if(typeof confirm!=='function')throw new Error('Scratch palette handoff requires an explicit confirmation callback.');
  const tempDir=io.mkdtempSync(path.join(tmpRoot,'ikemaker-palette-review-')),tempSource=path.join(tempDir,'review.act'),bytes=Buffer.from(input.sourceBytes),finalSource=path.resolve(input.sourceFilename);let createdFinal=false;
  try{
    io.writeFileSync(tempSource,bytes);
    const review=preflight(input.sffFilename,{...input.request,incoming:[{source:tempSource,name:input.name,tableOrder:input.tableOrder||'index'}]});
    if(!await confirm(review))return null;
    io.mkdirSync(path.dirname(finalSource),{recursive:true});
    if(io.existsSync(finalSource)){const existing=io.readFileSync(finalSource);if(!existing.equals(bytes))throw new Error('The retained scratch-palette source path is occupied by different bytes. Review the handoff again.');}
    else{write(io,finalSource,bytes,{label:'palette-scratch-handoff-source',expectedHash:hash(Buffer.alloc(0)),allowExisting:false,journal:true});createdFinal=true;}
    const approved=preflight(input.sffFilename,{...input.request,incoming:[{source:finalSource,name:input.name,tableOrder:input.tableOrder||'index'}]});
    if(reviewedShape(review)!==reviewedShape(approved))throw new Error('The palette placement changed after confirmation. Review the handoff again.');
    const planBefore=io.existsSync(planFile)?io.readFileSync(planFile):null;
    try{return stage(input.sffFilename,approved);}
    catch(error){if(planBefore){const current=io.existsSync(planFile)?io.readFileSync(planFile):Buffer.alloc(0);write(io,planFile,planBefore,{label:'palette-scratch-handoff-rollback',expectedHash:hash(current),allowExisting:true,journal:true});}else if(io.existsSync(planFile)){const current=io.readFileSync(planFile),again=io.readFileSync(planFile);if(hash(current)!==hash(again))throw new Error(`${error.message}\nThe palette plan changed while rollback was attempted; it was retained for manual review.`);io.rmSync(planFile,{force:true});}throw error;}
  }catch(error){if(createdFinal){try{io.rmSync(finalSource,{force:true});const parent=path.dirname(finalSource);if(io.existsSync(parent)&&io.readdirSync(parent).length===0)io.rmdirSync(parent);}catch(_){/* Preserve the primary failure. */}}throw error;}
  finally{try{io.rmSync(tempDir,{recursive:true,force:true});}catch(_){/* Temporary review cleanup is best effort. */}}
}

module.exports={stageReviewedScratchPlan,reviewAndStageScratchPlan,reviewedShape};
