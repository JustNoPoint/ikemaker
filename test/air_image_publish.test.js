'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const source=fs.readFileSync(path.join(__dirname,'../src/air_viewer.js'),'utf8');
(async()=>{
const loaded=[],paint=[];let draws=0;
const box={requestId:1,images:new Map(),imageCache:new Map(),Image:class{constructor(){loaded.push(this);}decode(){return Promise.resolve();}},requestAnimationFrame:f=>paint.push(f),draw:()=>draws++};
const a=source.indexOf('function acceptFrameImages('),b=source.indexOf('function renderStripImages(',a);vm.runInNewContext(source.slice(a,b),box);
const item=(key,slot=0)=>({slot,cacheKey:key,dataUri:key});
box.acceptFrameImages({requestId:1,items:[item('old')]});
box.requestId=2;box.acceptFrameImages({requestId:2,items:[item('new')]});
await loaded[1].onload();assert.equal(box.images.get(0).cacheKey,'new');assert.equal(draws,0,'publish draws on the next display frame');
await loaded[0].onload();assert.equal(box.images.get(0).cacheKey,'new','late older load cannot replace current image');paint.shift()();assert.equal(draws,1);
box.requestId=3;box.acceptFrameImages({requestId:3,items:[item('new')]});assert.equal(loaded.length,2,'reuse decoded cache');box.requestId=4;paint.shift()();assert.equal(draws,1,'obsolete scheduled paint is skipped');
box.acceptFrameImages({requestId:4,items:[item('bad'),item('new',1)]});loaded[2].onerror();paint.shift()();assert.equal(box.images.size,1);assert.equal(box.images.get(1).cacheKey,'new');
box.requestId=5;box.acceptFrameImages({requestId:5,items:[]});paint.shift()();assert.equal(box.images.size,0);assert.equal(draws,3);
console.log('AIR image publication: deferred paint, stale-load isolation, cache and failed-image completion passed');

})().catch(error=>{console.error(error);process.exitCode=1;});
