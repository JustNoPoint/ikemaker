'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {WorkflowDrafts}=require('../src/workflow_drafts');
const {hash}=require('../src/mutation_safety');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'workflow-drafts-'));
 let stored={},fail=false;
 const storage={get:()=>stored,async update(key,value){if(fail)throw Error('Storage unavailable');stored=JSON.parse(JSON.stringify(value));}};
 try{
  const one=path.join(root,'project','progress.json'),two=path.join(root,'project','tickets.json');
  let drafts=new WorkflowDrafts(storage);
  await drafts.stage(one,{status:'working'},'');await drafts.stage(two,{tickets:[1]},'');
  assert(!fs.existsSync(path.dirname(one)),'Editing drafts must not create a project folder');
  drafts=new WorkflowDrafts(storage);assert.deepStrictEqual(drafts.read(one,null),{status:'working'},'Draft survives restart');
  const read=drafts.read(one,null);read.status='bad';assert.strictEqual(drafts.read(one,null).status,'working');
  await drafts.save([one,two]);assert.deepStrictEqual(JSON.parse(fs.readFileSync(one)),{status:'working'});assert(!drafts.has(one));
  assert(!fs.existsSync(path.join(root,'project','.ikemen-tools')),'Saving must not create backups or a journal');
  const before=fs.readFileSync(one);await drafts.stage(one,{status:'done'},hash(before));
  fs.writeFileSync(one,'{"status":"external"}');await assert.rejects(drafts.save([one]),/changed outside/);assert(drafts.has(one));assert.strictEqual(JSON.parse(fs.readFileSync(one)).status,'external');
  await drafts.discard([one]);assert(!drafts.has(one));assert.strictEqual(JSON.parse(fs.readFileSync(one)).status,'external');
  const absent=path.join(root,'new.json');await drafts.stage(absent,{new:true},'');fs.writeFileSync(absent,'{"external":true}');await assert.rejects(drafts.save([absent]),/changed outside/);await drafts.discard([absent]);
  fail=true;await assert.rejects(drafts.stage(one,{bad:true},''),/Storage/);assert(!drafts.has(one));fail=false;
  await drafts.stage(one,{status:'retry'},hash(fs.readFileSync(one)));fail=true;await assert.rejects(drafts.save([one]),/Storage/);assert(drafts.has(one));fail=false;await drafts.save([one]);assert(!drafts.has(one));
  await drafts.stage(one,{status:'pending'},hash(fs.readFileSync(one)));await drafts.stage(two,{tickets:[2]},hash(fs.readFileSync(two)));fs.writeFileSync(two,'{}');await assert.rejects(drafts.save([one,two]),/changed outside/);assert.strictEqual(JSON.parse(fs.readFileSync(one)).status,'retry','Conflict in second file must not partially save the first');
  console.log('Workflow drafts: no project writes, restart recovery, cloning, explicit save/discard, conflict safety and failed-storage retry passed');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
