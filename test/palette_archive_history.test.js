'use strict';

const assert=require('assert');
const crypto=require('crypto');
const fs=require('fs');
const os=require('os');
const path=require('path');
const Module=require('module');
const {createSffBuildSpecificationV2}=require('../src/sff_build_specification_v2');
const {createSffV20Raw8Bytes}=require('../src/sff_v20_raw8_writer');
const {parseSffBuffer}=require('../src/sff_reader');
const {bufferWithPaletteReplacement}=require('../src/palette_editor');

const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const colors=seed=>Array.from({length:256},(_,index)=>[(index+seed)&255,(255-index)&255,(index*3)&255,index===0?0:255]);
function sourceBytes(){const pixels=Buffer.from([0,1,1,0]),logical={sourceRoot:'embedded',sprites:[{entryId:'sprite:0',group:0,number:0,width:2,height:2,axisX:0,axisY:0,pixels:{kind:'indexed8',decodedHash:sha(pixels)},paletteEntryId:'palette:0',source:{kind:'complete-image',relativePath:'sprite.raw',byteHash:sha(pixels),decodedHash:sha(pixels)}}],palettes:[{entryId:'palette:0',group:1,number:1,colors:colors(0),source:{relativePath:'palette.rgba',byteHash:'a'.repeat(64)}}]},spec=createSffBuildSpecificationV2({planId:'palette-history-source',selection:{targetId:'sff-v2.0',backendId:'ikemaker-builtin-sff-v2.0'},archive:{identity:'active.sff'},logical,encodingIntent:{compression:{default:'raw8'},crop:{default:'none'},storage:{},paletteMode:'embedded',backendOptions:{'ikemaker-builtin-sff-v2.0':{}}},capabilityRequest:{requiredFeatures:['transparency.index0-binary']}});return createSffV20Raw8Bytes(spec,{decodedPixelsByEntryId:{'sprite:0':pixels}});}

const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-palette-archive-history-')),filename=path.join(root,'active.sff'),before=sourceBytes(),archive=parseSffBuffer(Buffer.from(before),filename),replacement=colors(17),after=bufferWithPaletteReplacement(archive,0,replacement).buffer;
fs.writeFileSync(filename,after);
const originalLoad=Module._load,vscode={Uri:{file:fsPath=>({fsPath})},workspace:{getConfiguration:()=>({get:(_key,fallback)=>fallback}),getWorkspaceFolder:()=>null},window:{showWarningMessage:async()=>undefined,showInformationMessage:async()=>undefined}};
Module._load=function(request,parent,main){if(request==='vscode')return vscode;return originalLoad.call(this,request,parent,main)};

try{
  const {configurePaletteWorkspaceService}=require('../src/palette_workspace_service'),{PaletteWorkspaceController}=require('../src/palette_workspace_controller');
  configurePaletteWorkspaceService(null).open(filename);
  const controller=new PaletteWorkspaceController({}),messages=[],state={filename,post:message=>messages.push(message)};
  const retained=controller.recordArchiveHistory(filename,before,after,'Bank B overwrite of palette 1,1');
  assert(!Object.prototype.hasOwnProperty.call(retained,'before')&&!Object.prototype.hasOwnProperty.call(retained,'after'),'history never retains full SFF buffers');
  assert(retained.retainedBytes<=2048,'one palette overwrite retains only its bounded changed byte span');
  assert.strictEqual(controller.archiveHistoryModel(filename).undo,true);
  controller.applyArchiveHistory(state,'undo');
  assert.deepStrictEqual(fs.readFileSync(filename),before,'Palette Undo restores the exact prior SFF bytes');
  assert.strictEqual(controller.archiveHistoryModel(filename).redo,true);
  controller.applyArchiveHistory(state,'redo');
  assert.deepStrictEqual(fs.readFileSync(filename),after,'Palette Redo restores the exact verified overwrite bytes');
  assert(messages.some(message=>message.type==='paletteArchiveHistory'&&message.model.undo),'published history state keeps the universal Palette Undo owner current');
  controller.applyArchiveHistory(state,'undo');
  const branch=bufferWithPaletteReplacement(parseSffBuffer(Buffer.from(before),filename),0,colors(33)).buffer;
  fs.writeFileSync(filename,branch);controller.recordArchiveHistory(filename,before,branch,'new overwrite branch');
  assert.strictEqual(controller.archiveHistoryModel(filename).redo,false,'a newly approved archive write invalidates the old Redo branch');
  fs.appendFileSync(filename,Buffer.from([0]));
  assert.throws(()=>controller.applyArchiveHistory(state,'undo'),/changed outside this Palette Workshop/,'external SFF drift blocks in-session Palette Undo before writing');
  assert.deepStrictEqual(controller.archiveHistory(filename).undo.at(-1).afterSpan,controller.createArchiveHistoryEntry(before,branch,'comparison').afterSpan,'failed drifted Undo leaves its exact changed span retained');
  assert.strictEqual(new PaletteWorkspaceController({}).archiveHistoryModel(filename).undo,false,'archive Undo is intentionally in-session and does not survive a new controller/restart');
  const largeBefore=Buffer.alloc(2*1024*1024),largeAfter=Buffer.from(largeBefore);largeAfter[1024]=1;const sparse=controller.createArchiveHistoryEntry(largeBefore,largeAfter,'large sparse archive');assert.strictEqual(sparse.retainedBytes,2,'large archives retain only exact changed spans instead of duplicate full files');
  const overBefore=Buffer.alloc(70000),overAfter=Buffer.alloc(70000,1);assert.throws(()=>controller.createArchiveHistoryEntry(overBefore,overAfter,'oversized delta'),/Undo byte limit/,'an unbounded delta is rejected before a write can promise Undo');
  const bounded=new PaletteWorkspaceController({});for(let index=0;index<25;index+=1){const left=Buffer.from([index,0]),right=Buffer.from([index,1]);bounded.recordArchiveHistory(filename,left,right,'bounded '+index)}assert.strictEqual(bounded.archiveHistory(filename).undo.length,PaletteWorkspaceController.ARCHIVE_HISTORY_MAX_ENTRIES,'history entry count remains bounded');assert(bounded.archiveHistoryBytes(bounded.archiveHistory(filename))<=PaletteWorkspaceController.ARCHIVE_HISTORY_MAX_BYTES,'history retained bytes remain bounded');
  const byteBounded=new PaletteWorkspaceController({});for(let index=0;index<10;index+=1)byteBounded.recordArchiveHistory(filename,Buffer.alloc(60000,index),Buffer.alloc(60000,index+1),'byte bounded '+index);assert(byteBounded.archiveHistory(filename).undo.length<10,'oldest history entries are evicted when retained spans cross the total byte cap');assert(byteBounded.archiveHistoryBytes(byteBounded.archiveHistory(filename))<=PaletteWorkspaceController.ARCHIVE_HISTORY_MAX_BYTES,'total retained span bytes never exceed the configured cap');
  console.log('Palette archive overwrite Undo/Redo exact-byte, branch invalidation, publish, and drift tests passed');
}finally{Module._load=originalLoad;fs.rmSync(root,{recursive:true,force:true})}
