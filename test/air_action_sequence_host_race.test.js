'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),Module=require('module');
const original=Module._load;Module._load=function(request,parent,main){if(request==='vscode')return{};return original.call(this,request,parent,main)};
const {prepareAirActionSequenceSources}=require('../src/air_viewer');Module._load=original;
const {sourceFingerprint}=require('../src/air_batch_scope');
(async()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-air-host-race-'));try{const air=path.join(root,'a.air'),sff=path.join(root,'a.sff'),before='[Begin Action 0]\n0,0,0,0,1\n';fs.writeFileSync(air,before);fs.writeFileSync(sff,'not-reached');let selected=0;
await assert.rejects(prepareAirActionSequenceSources({fs,airPath:air,sffPath:sff,action:0,sourceFingerprint:sourceFingerprint(before),currentAction:()=>selected,chooseDestination:async()=>{fs.writeFileSync(air,'[Begin Action 0]\n0,1,0,0,9\n');return root}}),/AIR changed after the export was requested/);
fs.writeFileSync(air,before);selected=0;await assert.rejects(prepareAirActionSequenceSources({fs,airPath:air,sffPath:sff,action:0,sourceFingerprint:sourceFingerprint(before),currentAction:()=>selected,chooseDestination:async()=>{selected=1;return root}}),/selected AIR Action changed/);
}finally{fs.rmSync(root,{recursive:true,force:true})}console.log('AIR Action export rejects source and selection races across the folder picker')})().catch(error=>{console.error(error);process.exitCode=1});
