'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os');const {discover}=require('../src/async_discovery');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'async-discovery-'));
(async()=>{
 for(const dir of ['chars','chars/deep','chars/deep/too-deep','.hidden'])fs.mkdirSync(path.join(root,dir),{recursive:true});
 for(const file of ['one.def','ignored.txt','chars/two.def','chars/stage.zip','chars/deep/three.def','chars/deep/too-deep/four.def','.hidden/secret.def'])fs.writeFileSync(path.join(root,file),'[Info]\nname=Test');
 let heartbeat=false;setImmediate(()=>heartbeat=true);
 const result=await discover(root,{maxDepth:1,accept:async file=>{if(path.basename(file)==='two.def')throw Error('unreadable');return true;}});
 assert(heartbeat,'directory scanning yields to the event loop');assert.deepEqual(result.files.map(file=>path.basename(file)),['one.def']);assert.equal(result.errors.length,1);
 const stages=await discover(root,{extensions:['.zip']});assert.deepEqual(stages.files.map(file=>path.basename(file)),['stage.zip']);
 const token={isCancellationRequested:false};const cancelled=await discover(root,{token,onProgress:folders=>{if(folders===2)token.isCancellationRequested=true;}});assert(cancelled.cancelled);assert.deepEqual(cancelled.files,[],'cancel does not expose partial choices');
 const missing=await discover(path.join(root,'missing'));assert.equal(missing.errors.length,1);assert.deepEqual(missing.files,[]);
 console.log('Async discovery yields to other work, respects depth/hidden folders/extensions, reports read failures, and cancels without partial choices');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>fs.rmSync(root,{recursive:true,force:true}));
