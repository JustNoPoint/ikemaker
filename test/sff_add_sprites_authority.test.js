'use strict';

const assert = require('assert');
const Module = require('module');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return { Uri: { file: fsPath => ({ fsPath, toString: () => `file:///${String(fsPath).replace(/\\/g, '/')}` }) }, ViewColumn: { Active: 1 }, window: {}, workspace: { workspaceFolders: [] }, commands: {} };
  return originalLoad.call(this, request, parent, isMain);
};
const workspace = require('../src/sff_add_sprites_workspace');
Module._load = originalLoad;
const { encodeIndexedPng } = require('../src/palette_indexed_png');
const { createSffBuildSpecification } = require('../src/sff_build_specification');
const { createSffV21Png8Bytes } = require('../src/sff_v21_png8_writer');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const colors = Array.from({ length: 256 }, (_, index) => [index, index, index, index ? 255 : 0]);
function targetBytes(png, pixels) {
  const spec = createSffBuildSpecification({ planId:'embedded-add-sprites-authority', sourceRoot:'input', target:{archiveIdentity:'active.sff',archiveFingerprint:null,sffVersion:'2.1'}, requirements:['sff-v2.1','preserve-authored-physical-order','immutable-source-snapshots','candidate-before-adoption','sprite-png8','embedded-palettes'], sprites:[{entryId:'sprite:0',group:200,number:3,axisX:17,axisY:-9,colorDepth:8,format:'png8',compression:'png8',paletteId:'palette:0',duplicatePolicy:'preserve-separate',crop:{mode:'none',axisDeltaX:0,axisDeltaY:0},source:{relativePath:'sprite.png',byteHash:sha(png),decodedHash:sha(pixels),width:2,height:2}}], palettes:[{entryId:'palette:0',group:1,number:1,colors,tableOrder:'sff',duplicatePolicy:'preserve-separate',source:{relativePath:'sprite.png',byteHash:sha(png),decodedHash:sha(pixels),width:2,height:2}}], decisions:[], options:{shared:{fullRebuild:true},backends:{}} });
  return createSffV21Png8Bytes(spec,{sources:new Map([['sprite.png',png]])});
}

const authority = workspace.createStageAuthority();
authority.consume();
assert.strictEqual(authority.consumed, true);
assert.throws(() => authority.consume(), /already used/, 'replay is rejected after the authority is consumed');
assert.throws(() => { const failed = workspace.createStageAuthority(); failed.consume(); throw new Error('later validation failed'); }, /later validation failed/);

function stat(size) { return { size, mtimeMs: 1, dev: 2, ino: 3, isFile: () => true }; }
let statCall = 0;
const growthIo = {
  openSync: () => 1,
  fstatSync: () => stat(++statCall === 1 ? 32 : 33),
  readSync: (_fd, target, offset, length) => { if (!offset) { target.fill(0, 0, Math.min(32, length)); return Math.min(32, length); } return 0; },
  closeSync() {}
};
assert.throws(() => workspace.boundedPngSource('growing.png', 100, growthIo), /changed while it was being admitted/, 'growth between bounded read checks is rejected');

const huge = Buffer.alloc(33); Buffer.from('89504e470d0a1a0a', 'hex').copy(huge); huge.write('IHDR', 12, 'ascii'); huge.writeUInt32BE(0xffffffff, 16); huge.writeUInt32BE(0xffffffff, 20);
let hugeOffset = 0;
const hugeIo = {
  openSync: () => 1,
  fstatSync: () => stat(huge.length),
  readSync: (_fd, target, offset, length) => { if (hugeOffset >= huge.length) return 0; const count = Math.min(length, huge.length - hugeOffset); huge.copy(target, offset, hugeOffset, hugeOffset + count); hugeOffset += count; return count; },
  closeSync() {}
};
assert.throws(() => workspace.boundedPngSource('huge.png', 100, hugeIo), /decoded-pixel limit/, 'huge IHDR dimensions are rejected before decode');

const rendered = workspace.html({ targetName: 'test.sff', targetVersion: '2.1', palettes: [], writerMode: 'ikemaker', writerLabel: 'IKEMaker' });
for (const name of ['top left', 'top center', 'top right', 'center left', 'center', 'center right', 'bottom left', 'bottom center', 'bottom right']) assert(rendered.includes(`aria-label="${name} anchor"`), `${name} has a unique accessible name`);
assert(rendered.includes("status.setAttribute('role',m.ok?'status':'alert')"), 'validation failures are announced as alerts');
(async () => {
  let release, stageCalls = 0;
  const delayed = new Promise(resolve => { release = resolve; }), transfer = workspace.createStageAuthority();
  const first = workspace.consumeStageAuthority(transfer, async () => { stageCalls += 1; await delayed; return 'staged'; });
  await assert.rejects(() => workspace.consumeStageAuthority(transfer, async () => { stageCalls += 1; }), /already used/, 'a concurrent Advanced replay is rejected before it can enter staging');
  assert.equal(stageCalls, 1, 'concurrent Advanced replay invokes staging exactly once');
  release();
  assert.equal(await first, 'staged');
  const failedTransfer = workspace.createStageAuthority();
  await assert.rejects(() => workspace.consumeStageAuthority(failedTransfer, async () => { throw new Error('staging rejected'); }), /staging rejected/);
  await assert.rejects(() => workspace.consumeStageAuthority(failedTransfer, async () => 'retry'), /already used/, 'a failed Advanced transfer remains consumed and cannot be replayed');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-embedded-add-sprites-'));
  try {
    const pixels=Buffer.from([0,1,2,1]),png=encodeIndexedPng({width:2,height:2},pixels,colors),target=path.join(root,'active.sff');fs.writeFileSync(target,targetBytes(png,pixels));
    assert.deepStrictEqual(workspace.selectedSpriteDefaults(target,0),{group:200,startIndex:4,anchor:'top-left',offsetX:17,offsetY:-9,sourcePhysicalIndex:0},'viewed sprite 200,3 seeds 200,4 and inherits its exact axis');
    const api={window:{},commands:{executeCommand(){throw new Error('no command may run');}},Uri:{file:fsPath=>({fsPath})}},unknown=workspace.createEmbeddedSession(target,api,{selectedPhysicalIndex:0});
    assert.deepStrictEqual(unknown.model.defaults,{group:200,startIndex:4,anchor:'top-left',offsetX:17,offsetY:-9,sourcePhysicalIndex:0},'embedded model carries editable viewer-relative defaults');
    assert.deepStrictEqual(unknown.model.occupiedIndexesByGroup,{'200':[3]},'embedded model carries exact existing group/index occupancy for live destination guidance');
    await assert.rejects(()=>unknown.handle({action:'forged-stage'}),/Unknown Add Sprites action/,'unknown actions are rejected before any retained draft or command can be staged');
    assert.strictEqual(unknown.consumed,false,'rejecting an unknown action does not spend a legitimate reviewed action');
    const cancelled=workspace.createEmbeddedSession(target,api);assert.deepStrictEqual(await cancelled.handle({action:'cancel'}),{type:'close'});assert.strictEqual(cancelled.consumed,true,'Cancel revokes the hidden host authority as well as closing the dialog');
    await assert.rejects(()=>cancelled.handle({action:'stage',sourceIds:[]}),/already used/,'a stale Stage message cannot revive a cancelled popup session');
    const source=path.join(root,'new-sprite.png');fs.writeFileSync(source,png);const commands=[];
    const malformed=path.join(root,'malformed.png');fs.writeFileSync(malformed,Buffer.from('not a PNG'));
    const pickerChoices=[[{fsPath:source}],[{fsPath:malformed}]],transactionCommands=[];
    const transactionApi={window:{showOpenDialog:async()=>pickerChoices.shift()},commands:{executeCommand:async(...args)=>{transactionCommands.push(args);return true}},Uri:{file:fsPath=>({fsPath})}};
    const transactional=workspace.createEmbeddedSession(target,transactionApi),retainedChoice=await transactional.handle({action:'chooseFiles'});
    await assert.rejects(()=>transactional.handle({action:'chooseFiles'}),/not a valid PNG/,'a rejected replacement selection reports its admission failure');
    assert.deepStrictEqual(await transactional.handle({action:'paletteWorkshop',sourceIds:[retainedChoice.sources[0].id],palette:'needs-palette',tilingMethod:'single-palette'}),{type:'close'},'failed replacement admission retains the previously reviewed exact source authority');
    assert.strictEqual(transactionCommands[0][0],'ikemen.palette.openWorkspace','the retained exact source remains usable for its reviewed Needs Palette destination');
    const advancedApi={window:{showOpenDialog:async()=>[{fsPath:source}]},commands:{executeCommand:async(...args)=>{commands.push(args);return true}},Uri:{file:fsPath=>({fsPath})}};
    const creator=require('../src/sff_creator_workspace'),staged=await creator.stageCompactIntake(target,[source],{group:200,startIndex:4,numberingMode:'consecutive',collisionPolicy:'stop',anchor:'top-left',offsetX:17,offsetY:-9,cropMode:'none',paletteChoice:'image',paletteMode:'image',shareIdentical:false,reversed:false,detect:false,preferredWriter:'ikemaker'});
    assert.deepStrictEqual(staged.plan.ready.map(row=>({number:row.number,axisX:row.axisX,axisY:row.axisY})),[{number:4,axisX:17,axisY:-9}],'the real retained Creator plan preserves exact inherited axes and the next destination identity');
    const advanced=workspace.createEmbeddedSession(target,advancedApi,{selectedPhysicalIndex:0}),chosen=await advanced.handle({action:'chooseFiles'});
    assert.strictEqual(chosen.type,'files');assert.strictEqual(chosen.sources.length,1);assert.strictEqual(chosen.sources[0].indexed,true,'the executable handoff admits the exact indexed PNG source');
    const beforeTarget=fs.readFileSync(target),result=await advanced.handle({action:'openAdvanced',sourceIds:[chosen.sources[0].id],group:200,startIndex:4,numberingMode:'consecutive',collisionPolicy:'stop',anchor:'top-left',offsetX:17,offsetY:-9,cropMode:'none',palette:'image',shareIdentical:false,reversed:false,detect:false,tilingMethod:'single-palette'});
    assert.deepStrictEqual(result,{type:'close'},'the reviewed compact intake returns by closing its modal owner after focusing Advanced Creator');
    assert.strictEqual(advanced.consumed,true,'the exact reviewed intake authority is single-use');
    assert.strictEqual(commands.length,1);assert.strictEqual(commands[0][0],'sff.openCreator');assert.strictEqual(path.resolve(commands[0][1].fsPath),path.resolve(target));assert.deepStrictEqual(commands[0][2],{preferredWriter:'ikemaker',refreshDraft:true},'Advanced receives the exact target and retained-draft refresh route');
    assert.deepStrictEqual(fs.readFileSync(target),beforeTarget,'staging and returning to Advanced leaves the active SFF byte-identical');
    await assert.rejects(()=>advanced.handle({action:'openAdvanced',sourceIds:[chosen.sources[0].id]}),/already used/,'the same reviewed intake cannot be replayed after its return route');
    const buildCommands=[],buildApi={window:{showOpenDialog:async()=>[{fsPath:source}]},commands:{executeCommand:async(...args)=>{buildCommands.push(args);return true}},Uri:{file:fsPath=>({fsPath})}};
    let directDraft=null;const buildNow=workspace.createEmbeddedSession(target,buildApi,{selectedPhysicalIndex:0,buildCompactIntakeNow:async draft=>{directDraft=draft;return{targetPath:target,spriteCount:1,byteHash:'test'}}}),buildChoice=await buildNow.handle({action:'chooseFiles'});
    const builtResult=await buildNow.handle({action:'buildNow',sourceIds:[buildChoice.sources[0].id],group:200,startIndex:4,numberingMode:'consecutive',collisionPolicy:'stop',anchor:'top-left',offsetX:17,offsetY:-9,cropMode:'none',palette:'image',shareIdentical:false,reversed:false,detect:false,tilingMethod:'single-palette'});
    assert.strictEqual(builtResult.type,'close');assert.strictEqual(builtResult.built.targetPath,target);assert(directDraft?.sources?.length===1,'Build Now sends the exact staged draft to the direct IKEMaker writer');
    assert.strictEqual(buildCommands[0][0],'sff.openViewer');assert.deepStrictEqual(buildCommands[0][4],{refresh:true},'Build Now refreshes the current SFF viewer instead of opening Advanced Creator');
    assert.deepStrictEqual(fs.readFileSync(target),beforeTarget,'the injected writer boundary owns the direct target mutation');
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
  console.log('Compact Add Sprites authority, bounded admission, accessibility, and single-use transfer tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
