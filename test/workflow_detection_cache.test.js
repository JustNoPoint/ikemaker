'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os'),Module=require('module');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'workflow-cache-')),original=Module._load;let sffReads=0,airReads=0;
const character={defPath:path.join(folder,'hero.def'),sff:path.join(folder,'hero.sff'),air:path.join(folder,'hero.air'),cmd:'',constants:'',code:[path.join(folder,'moves.zss')]};
fs.writeFileSync(character.defPath,'');fs.writeFileSync(character.sff,'1');fs.writeFileSync(character.air,'[Begin Action 0]\n0,0,0,0,1');fs.writeFileSync(character.code[0],'[StateDef 200]');
Module._load=function(name,parent,main){if(name==='vscode')return{};if(parent?.filename.endsWith('production_workflow_workspace.js')){if(name==='./sff_reader')return{readSff:file=>{sffReads++;return{header:{version:'1'},sprites:Array(Number(fs.readFileSync(file,'utf8'))),palettes:[]};},friendlyVersion:version=>version};if(name==='./requirements'){const actual=original.call(this,name,parent,main);return{...actual,parseAirInventory:text=>{airReads++;return actual.parseAirInventory(text);}};}}return original.call(this,name,parent,main);};
try{
 const {detections}=require('../src/production_workflow_workspace');
 const first=detections(character);for(let i=0;i<10;i++)assert.deepEqual(detections(character),first);assert.equal(sffReads,1);assert.equal(airReads,1);
 fs.writeFileSync(character.sff,'25');fs.appendFileSync(character.air,'\n[Begin Action 5000]\n0,0,0,0,1');fs.writeFileSync(character.code[0],'');
 const changed=detections(character);assert(changed['sff-readable'].detail.includes('25 sprites'));assert.equal(changed['gethit-actions'].state,'detected');assert.equal(changed['slp-code'].state,'missing');assert.equal(sffReads,2);assert.equal(airReads,2);
 fs.unlinkSync(character.sff);assert.equal(detections(character)['sff-readable'].state,'missing');
 console.log('Actual Workflow detection reuses unchanged summaries and invalidates SFF, AIR and code results after edits or deletion');
}finally{Module._load=original;fs.rmSync(folder,{recursive:true,force:true});}
