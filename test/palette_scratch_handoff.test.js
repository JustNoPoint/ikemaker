'use strict';

const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const crypto=require('crypto');
const { batchPalettePreflight, readPalettePlan, palettePlanLocation }=require('../src/palette_plan');
const { stageReviewedScratchPlan, reviewAndStageScratchPlan }=require('../src/palette_scratch_handoff');

(async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-scratch-handoff-')),character=path.join(root,'chars','Test');fs.mkdirSync(character,{recursive:true});fs.writeFileSync(path.join(root,'Ikemen_GO.exe'),'');
  const sff=path.join(character,'Test.sff'),source=path.join(character,'scratch.act');fs.writeFileSync(sff,Buffer.from('active archive bytes must not change'));fs.writeFileSync(source,Buffer.alloc(768,17));
  const before=crypto.createHash('sha256').update(fs.readFileSync(sff)).digest('hex'),preflight=batchPalettePreflight(sff,{group:1,mode:'append',incoming:[{source,name:'Scratch palette',tableOrder:'index'}],occupiedIds:[],existingColors:[]}),result=stageReviewedScratchPlan(sff,preflight),after=crypto.createHash('sha256').update(fs.readFileSync(sff)).digest('hex');
  assert.strictEqual(result.activeSffUnchanged,true);
  assert.strictEqual(result.activeSffHash,before);
  assert.strictEqual(after,before,'reviewed scratch handoff must not modify active SFF bytes');
  assert.strictEqual(readPalettePlan(sff).palettes.length,1,'handoff stages exactly one reviewed palette-plan entry');

  const cancelSff=path.join(character,'Cancel.sff'),cancelSource=path.join(character,'.ikemen-tools','palette-scratch-sources','cancel.act');fs.writeFileSync(cancelSff,Buffer.from('cancel archive'));
  const cancelled=await reviewAndStageScratchPlan({sffFilename:cancelSff,request:{group:1,mode:'append',occupiedIds:[],existingColors:[]},sourceFilename:cancelSource,sourceBytes:Buffer.alloc(768,23),name:'Cancelled',confirm:async()=>false});
  assert.strictEqual(cancelled,null);
  assert.strictEqual(fs.existsSync(cancelSource),false,'cancel leaves no durable palette source');
  assert.strictEqual(fs.existsSync(palettePlanLocation(cancelSff)),false,'cancel leaves no palette plan');

  const failSff=path.join(character,'Fail.sff'),failSource=path.join(character,'.ikemen-tools','palette-scratch-sources','fail.act');fs.writeFileSync(failSff,Buffer.from('failure archive'));
  await assert.rejects(()=>reviewAndStageScratchPlan({sffFilename:failSff,request:{group:1,mode:'append',occupiedIds:[],existingColors:[]},sourceFilename:failSource,sourceBytes:Buffer.alloc(768,29),name:'Failure',confirm:async()=>true},{stage:()=>{const plan=palettePlanLocation(failSff);fs.mkdirSync(path.dirname(plan),{recursive:true});fs.writeFileSync(plan,'partially staged plan');throw new Error('injected staging failure')}}),/injected staging failure/);
  assert.strictEqual(fs.existsSync(failSource),false,'failed staging removes the newly created durable source');
  assert.strictEqual(fs.existsSync(palettePlanLocation(failSff)),false,'failed staging leaves no palette plan');
  assert.strictEqual(fs.readFileSync(failSff,'utf8'),'failure archive','failed staging leaves active SFF bytes unchanged');

  fs.rmSync(root,{recursive:true,force:true});
  console.log('Palette scratch handoff cancellation, failure cleanup, reviewed staging, and active-SFF safety tests passed');
})().catch(error=>{console.error(error);process.exitCode=1});
