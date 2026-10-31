'use strict';

const assert=require('assert');
const crypto=require('crypto');
const fs=require('fs');
const os=require('os');
const path=require('path');
const Module=require('module');
const {createSffBuildSpecificationV2}=require('../src/sff_build_specification_v2');
const {createSffV20Raw8Bytes}=require('../src/sff_v20_raw8_writer');
const {readSff,paletteRgba}=require('../src/sff_reader');

const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const baseColors=()=>Array.from({length:256},(_,index)=>[index,255-index,(index*3)&255,index===0?0:255]);
function sourceBytes(){const pixels=Buffer.from([0,1,1,0]),logical={sourceRoot:'embedded',sprites:[{entryId:'sprite:0',group:0,number:0,width:2,height:2,axisX:0,axisY:0,pixels:{kind:'indexed8',decodedHash:sha(pixels)},paletteEntryId:'palette:0',source:{kind:'complete-image',relativePath:'sprite.raw',byteHash:sha(pixels),decodedHash:sha(pixels)}}],palettes:[{entryId:'palette:0',group:1,number:1,colors:baseColors(),source:{relativePath:'palette.rgba',byteHash:'a'.repeat(64)}}]},spec=createSffBuildSpecificationV2({planId:'palette-overwrite-handler',selection:{targetId:'sff-v2.0',backendId:'ikemaker-builtin-sff-v2.0'},archive:{identity:'handler.sff'},logical,encodingIntent:{compression:{default:'raw8'},crop:{default:'none'},storage:{},paletteMode:'embedded',backendOptions:{'ikemaker-builtin-sff-v2.0':{}}},capabilityRequest:{requiredFeatures:['transparency.index0-binary']}});return createSffV20Raw8Bytes(spec,{decodedPixelsByEntryId:{'sprite:0':pixels}});}

let warningChoice='Overwrite Palette',lastWarning=null,warningCount=0;
const originalLoad=Module._load,vscode={Uri:{file:fsPath=>({fsPath})},workspace:{getConfiguration:()=>({get:(_key,fallback)=>fallback}),getWorkspaceFolder:()=>null},window:{showWarningMessage:async(...args)=>{warningCount+=1;lastWarning=args;return warningChoice},showInformationMessage:async()=>undefined},commands:{executeCommand:async()=>undefined}};
Module._load=function(request,parent,main){if(request==='vscode')return vscode;return originalLoad.call(this,request,parent,main)};

(async()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-palette-overwrite-handler-')),filename=path.join(root,'handler.sff'),before=sourceBytes();try{
  fs.writeFileSync(filename,before);
  const {configurePaletteWorkspaceService}=require('../src/palette_workspace_service'),{PaletteWorkspaceController}=require('../src/palette_workspace_controller'),service=configurePaletteWorkspaceService(null),archive=readSff(filename),palette=archive.palettes[0],sprite=archive.sprites[0];
  service.open(filename);service.select(filename,{palette:{physicalIndex:palette.index,group:palette.group,number:palette.number},sprite:{physicalIndex:sprite.index,group:sprite.group,number:sprite.number}});
  const controller=new PaletteWorkspaceController({}),messages=[],state={filename,busy:false,post:message=>messages.push(message)},colors=paletteRgba(archive,palette.index).map(color=>color.slice()),indexMap=Array.from({length:256},(_,index)=>index);colors[1]=[17,34,51,colors[1][3]];
  warningChoice='Stage New Palette';const beforeStage=fs.readFileSync(filename);await controller.handleSff(state,{type:'paletteStageBankBNew',name:'Alternate blue',group:1,number:2,colors,indexMap});const staged=require('../src/palette_plan').readPalettePlan(filename),stagedRow=staged.palettes.find(item=>item.group===1&&item.number===2);assert(stagedRow&&stagedRow.kind==='source','actual Save B as New handler stages the exact requested group,index');assert.deepStrictEqual(fs.readFileSync(filename),beforeStage,'Save B as New leaves the active SFF byte-identical until reviewed build/adoption');assert.deepStrictEqual(require('../src/palette_library').pngPaletteRgba(fs.readFileSync(stagedRow.source))[1].slice(0,3),[17,34,51],'the retained indexed PNG source preserves exact Bank B colors');const stagedCount=staged.palettes.length,sourceCount=fs.readdirSync(path.dirname(stagedRow.source)).length;warningChoice=undefined;await controller.handleSff(state,{type:'paletteStageBankBNew',name:'Cancelled new palette',group:1,number:3,colors,indexMap});assert.strictEqual(require('../src/palette_plan').readPalettePlan(filename).palettes.length,stagedCount,'cancelling Save B as New does not change the reviewed plan');assert.strictEqual(fs.readdirSync(path.dirname(stagedRow.source)).length,sourceCount,'cancelling Save B as New creates no retained source file');
  warningChoice='Overwrite Palette';
  await controller.handleSff(state,{type:'paletteOverwriteBankB',physicalIndex:0,group:1,number:1,colors,indexMap});
  assert(lastWarning&&String(lastWarning[1]?.detail||'').includes(path.resolve(filename)),'actual overwrite confirmation names the exact target path');
  assert.deepStrictEqual(paletteRgba(readSff(filename),0)[1].slice(0,3),[17,34,51],'actual approved handler writes the reviewed Bank B RGB values');
  assert.strictEqual(controller.archiveHistoryModel(filename).undo,true,'actual approved handler publishes an in-session archive Undo owner');
  assert(messages.some(message=>message.type==='paletteArchiveHistory'&&message.model.undo),'actual handler publishes universal Palette history state');
  await controller.handleSff(state,{type:'paletteArchiveUndo'});assert.deepStrictEqual(fs.readFileSync(filename),before,'actual handler Undo restores exact original SFF bytes');
  await controller.handleSff(state,{type:'paletteArchiveRedo'});const after=fs.readFileSync(filename);assert.notDeepStrictEqual(after,before);assert.deepStrictEqual(paletteRgba(readSff(filename),0)[1].slice(0,3),[17,34,51]);
  const count=controller.archiveHistory(filename).undo.length,warningsBeforeNoop=warningCount;await controller.handleSff(state,{type:'paletteOverwriteBankB',physicalIndex:0,group:1,number:1,colors,indexMap});assert.strictEqual(controller.archiveHistory(filename).undo.length,count,'an exact no-op overwrite creates no phantom history entry');assert.strictEqual(warningCount,warningsBeforeNoop,'an exact no-op skips destructive overwrite confirmation entirely');
  const changed=colors.map(color=>color.slice());changed[2]=[9,8,7,changed[2][3]];warningChoice=undefined;const unchanged=fs.readFileSync(filename);await controller.handleSff(state,{type:'paletteOverwriteBankB',physicalIndex:0,group:1,number:1,colors:changed,indexMap});assert.deepStrictEqual(fs.readFileSync(filename),unchanged,'cancelling the actual overwrite handler leaves the SFF unchanged');
  const unrelated=path.join(root,'unrelated.sff');controller.recordArchiveHistory(unrelated,Buffer.from([0]),Buffer.from([1]),'unrelated history');let disposeCallback=null;const disposable=controller.bindArchiveHistoryDisposal({onDidDispose(callback){disposeCallback=callback;return{dispose(){}}}},filename);assert(disposeCallback,'the real panel-disposal binder registers a callback');disposeCallback();assert.strictEqual(controller.archiveHistoryModel(filename).undo,false,'invoking the registered panel callback clears this exact transient history');assert.strictEqual(controller.archiveHistoryModel(unrelated).undo,true,'disposing one Palette panel preserves unrelated archive history');disposable.dispose();
  console.log('Actual Palette Bank B overwrite, no-op, cancel, Undo/Redo publication, and registered panel-disposal tests passed');
}finally{Module._load=originalLoad;fs.rmSync(root,{recursive:true,force:true})}})().catch(error=>{console.error(error);process.exitCode=1});
