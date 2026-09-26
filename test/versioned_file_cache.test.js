'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os');const {createCache}=require('../src/versioned_file_cache');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'versioned-cache-')),file=path.join(folder,'actions.air');
try{
 fs.writeFileSync(file,Array.from({length:5000},(_,i)=>'[Begin Action '+i+']\n0,0,0,0,1').join('\n'));
 const cache=createCache({maxEntries:2,maxBytes:100000});let parses=0;
 const load=filename=>{parses++;return [...require('../src/requirements').parseAirInventory(fs.readFileSync(filename,'utf8')).keys()];};
 const start=performance.now();assert.equal(cache.get(file,'air-v1',load).length,5000);const cold=performance.now()-start;
 const warmStart=performance.now();for(let i=0;i<100;i++)assert.equal(cache.get(file,'air-v1',load).length,5000);const warm=performance.now()-warmStart;assert.equal(parses,1,'warm refreshes must not reparse unchanged files');
 const value=cache.get(file,'air-v1',load);value.pop();assert.equal(cache.get(file,'air-v1',load).length,5000,'callers cannot mutate cached data');
 fs.writeFileSync(file,'[Begin Action 6000]\n0,0,0,0,1');assert.deepEqual(cache.get(file,'air-v1',load),[6000]);assert.equal(parses,2);
 cache.get(file,'air-v2',load);assert.equal(parses,3,'parser revisions invalidate results');
 const other=path.join(folder,'other.air');fs.writeFileSync(other,'[Begin Action 1]');cache.get(other,'air-v1',load);assert.equal(cache.stats().entries,2);
 assert.throws(()=>cache.get(file,'race',filename=>{fs.appendFileSync(filename,'\n; changed');return[];}),/changed while/);
 fs.unlinkSync(file);assert.throws(()=>cache.get(file,'air-v2',load),/ENOENT/);
 const tiny=createCache({maxBytes:2});tiny.get(other,'large',()=>[1,2,3]);assert.equal(tiny.stats().entries,0);
 console.log('Versioned cache invalidation, revision, race, deletion, mutation isolation and size/entry bounds passed');
 console.log('Synthetic 5,000-action AIR: cold '+cold.toFixed(1)+' ms; 100 warm lookups '+warm.toFixed(1)+' ms; one parser call before invalidation.');
}finally{fs.rmSync(folder,{recursive:true,force:true});}
