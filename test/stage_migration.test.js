'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),Module=require('module');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'stage-migration-')),filename=path.join(root,'stage.def');
const source='[Info]\nname=Migration\n[Camera]\nstartx=0\n[StageInfo]\nzoffset=200\n[BGDef]\n[BG Sky]\ntype=normal\nspriteno=0,0\nstart=0,0\n[BG Floor]\ntype=normal\nspriteno=0,1\nstart=0,200\n';
fs.writeFileSync(filename,source);
const original=Module._load;
const vscode={Uri:{file:file=>({fsPath:file,toString:()=>`file://${file}`})},workspace:{textDocuments:[],getConfiguration:()=>({get:(_key,fallback)=>fallback})}};
Module._load=function(request,parent,main){if(request==='vscode')return vscode;return original.call(this,request,parent,main);};
try{
 const api=require('../src/stage_workspace'),payload=api.stagePayload(filename),owner={payload,filename,selected:1,busy:0,document:null};
 const toolbar=api.stageToolbarModel(owner),html=api.stageHtml(payload,toolbar),surface=require('../src/viewer_surface_registry').SURFACES.find(item=>item.id==='stage.workspace'),capability=require('../src/viewer_source_capability').CAPABILITIES[surface.sourceCapabilityId];
 assert.equal(surface.toolbarPolicy,'required');assert.equal(capability.id,'implemented.stage-source');assert.equal(capability.identity,'selected-block');
 assert.equal(toolbar.contractId,'universal-v1');assert(toolbar.slots.find(item=>item.id==='text-source').enabled);assert(!toolbar.slots.find(item=>item.id==='save').enabled);
 assert(html.includes('data-toolbar-contract="universal-v1"'));assert(html.includes('id="stageBackgroundScroll"'));assert(html.includes('Edit selected source'));assert(html.includes("post('previewDraft'"));
 const reference=api.backgroundReference(payload,1);assert.equal(api.findBackground(payload,reference).name,'Floor');assert.equal(api.findBackground(payload,{...reference,signature:'stale'}),null);
 assert(api.validStageMessage({type:'selectionChanged',generation:7,selected:1},7));assert(!api.validStageMessage({type:'selectionChanged',generation:7,selected:1,extra:true},7));assert(!api.validStageMessage({type:'selectionChanged',generation:6,selected:1},7));
 assert(api.validStageMessage({type:'previewDraft',generation:7,selected:0,previewStarts:[[10000000,-10000000]]},7));assert(!api.validStageMessage({type:'previewDraft',generation:7,selected:0,previewStarts:[[10000001,0]]},7));assert(!api.validStageMessage({type:'openStageSprite',generation:7,line:0,name:'x'.repeat(513),group:0,number:0},7));assert(!api.validStageMessage({type:'applyStart',generation:7,sectionLine:0,value:'1'.repeat(129),name:'BG'},7));assert(api.validStageMessage({type:'selectionChanged',generation:7,selected:0},7),'a valid message remains accepted after rejected boundary cases');
 for(const id of ['stageDirectSelect','stageNavCollection'])assert(html.includes(`id="${id}"`));for(const mode of ['tabs','list','cards'])assert(html.includes(`data-stage-nav-mode="${mode}"`));assert(!html.includes('data-ikemen-launch='));assert(!html.includes('viewer-icon-toolbar'));
 console.log('Stage universal toolbar, selected-background authority, compact navigation and durable preview hooks passed');
}finally{Module._load=original;fs.rmSync(root,{recursive:true,force:true});}
