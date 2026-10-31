'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-family-workflow-controller-'));
const target = path.join(root, 'active.sff');
const originalBytes = Buffer.from('active target remains unchanged');
fs.writeFileSync(target, originalBytes);
let pickerCalls=0;
const vscode = { Uri: { file: fsPath => ({ fsPath }) }, workspace: { getWorkspaceFolder: () => ({ uri: { fsPath: root } }), getConfiguration: () => ({ get: (_key, fallback) => fallback }) }, window: {showOpenDialog:async()=>{pickerCalls++;return undefined}}, commands: { executeCommand: async () => {} } };
const originalLoad = Module._load;
Module._load = function (request, parent, main) { if (request === 'vscode') return vscode; return originalLoad.call(this, request, parent, main); };

(async () => {
  try {
    const { configurePaletteWorkspaceService, paletteWorkspaceService } = require('../src/palette_workspace_service');
    configurePaletteWorkspaceService(null);
    const { PaletteWorkspaceController } = require('../src/palette_workspace_controller');
    const expansionPlan = { planHash: 'e'.repeat(64), inventoryHash: 'i'.repeat(64), metadataHash: 'm'.repeat(64), metadataRevision: 2, selections: [
      { physicalIndex: 0, coordinate: { group: 1, number: 1 }, provenance: [{ kind: 'named', groupId: 'family', rangeIndex: 0 }] },
      { physicalIndex: 1, coordinate: { group: 2, number: 1 }, provenance: [{ kind: 'named', groupId: 'family', rangeIndex: 0 }] }
    ] };
    const candidate = { candidateHash: 'c'.repeat(64), topologyPlanHash: 't'.repeat(64), topologyMappingHash: 'p'.repeat(64), expansionPlanHash: expansionPlan.planHash, inventoryHash: expansionPlan.inventoryHash, metadataHash: expansionPlan.metadataHash, metadataRevision: expansionPlan.metadataRevision, slotTopology: [{ destinationIndex: 250, kind: 'new', rgba: [10, 20, 30, 255], label: 'accent' }], activeSffChanged: false, adoption: false };
    const context = { candidate, expansionPlan, registry:{archive:{templateRecords:[]}}, config: { scope: 'both', namedMappingIds: ['family'], explicitRangeMappings: [], aliasDecisions: {}, defaults: {} } };
    const controller = new PaletteWorkspaceController({}), messages = [], state = { filename: target, post: message => messages.push(message), busy: false, manual: new Map() };
    controller.familyContext = () => context;
    controller.familyPreview = (_state, _context, assignment) => require('../src/palette_family_color_assignment').status(assignment);
    paletteWorkspaceService().open(target);

    await controller.handleSff(state, { type: 'workspaceAction', action: 'familyStart', namedMappingIds: ['family'], scope: 'both' });
    let session = paletteWorkspaceService().snapshot(target), hash = session.family.assignment.stateHash;
    assert.strictEqual(session.family.status, 'browsing');
    await controller.handleSff(state, { type: 'workspaceAction', action: 'familyEdit', stateHash: hash, rgba: [40, 50, 60, 255] });
    session = paletteWorkspaceService().snapshot(target);
    assert.deepStrictEqual(require('../src/palette_family_color_assignment').status(session.family.assignment).current.color, [40, 50, 60, 255]);
    await assert.rejects(controller.handleSff(state, { type: 'workspaceAction', action: 'familyApplyNext', stateHash: hash }), /state changed/, 'stale controls fail closed');
    hash = session.family.assignment.stateHash;
    await controller.handleSff(state, { type: 'workspaceAction', action: 'familyApplyNext', stateHash: hash });
    session = paletteWorkspaceService().snapshot(target); hash = session.family.assignment.stateHash;
    await controller.handleSff(state, { type: 'workspaceAction', action: 'familyScope', stateHash: hash, scope: { kind: 'named', id: 'family' } });
    session = paletteWorkspaceService().snapshot(target); hash = session.family.assignment.stateHash;
    await controller.handleSff(state, { type: 'workspaceAction', action: 'familySetBase', stateHash: hash, rgba: [70, 80, 90, 255] });
    session = paletteWorkspaceService().snapshot(target); hash = session.family.assignment.stateHash;
    await controller.handleSff(state, { type: 'workspaceAction', action: 'familyEscape', stateHash: hash });
    session = paletteWorkspaceService().snapshot(target);
    assert.strictEqual(session.family.status, 'paused');
    assert.strictEqual(session.family.assignment.browsing, false);
    hash = session.family.assignment.stateHash;
    await controller.handleSff(state, { type: 'workspaceAction', action: 'familyResume', stateHash: hash });
    session = paletteWorkspaceService().snapshot(target); hash = session.family.assignment.stateHash;
    await controller.handleSff(state, { type: 'workspaceAction', action: 'familyFinish', stateHash: hash });
    session = paletteWorkspaceService().snapshot(target);
    assert.strictEqual(session.family.status, 'summary');
    assert.strictEqual(session.family.summary.committed, false);
    assert.strictEqual(session.family.summary.activeSffChanged, false);
    const template=path.join(root,'reviewed-template.png'),templateColors=Array.from({length:256},(_,index)=>[index,index,index,index?255:0]),templateBytes=require('../src/palette_indexed_png').encodeIndexedPng({width:2,height:1},Buffer.from([0,1]),templateColors,{bitDepth:8}),templateHash=require('crypto').createHash('sha256').update(templateBytes).digest('hex'),pending=indexed=>({surface:'palette-template-intake',candidate:{purpose:'replacement-template',filename:template,byteHash:templateHash,byteLength:templateBytes.length,indexed}});fs.writeFileSync(template,templateBytes);paletteWorkspaceService().mutate(target,{context:{origin:pending(false)}});await assert.rejects(controller.handleSff(state,{type:'workspaceAction',action:'familyAttachTemplate'}),/true color/);assert.strictEqual(pickerCalls,0,'a retained true-color intake reports repair instead of reopening a chooser');paletteWorkspaceService().mutate(target,{context:{origin:pending(true)}});fs.writeFileSync(template,Buffer.from(templateBytes).fill(0,40,41));await assert.rejects(controller.handleSff(state,{type:'workspaceAction',action:'familyAttachTemplate'}),/changed before attachment/);assert.strictEqual(pickerCalls,0,'drifted retained evidence fails closed without falling back to another chooser');fs.writeFileSync(template,templateBytes);await controller.handleSff(state,{type:'workspaceAction',action:'familyAttachTemplate'});session=paletteWorkspaceService().snapshot(target);assert.strictEqual(pickerCalls,0,'the exact retained indexed candidate attaches without another chooser');assert.strictEqual(session.family.template.authority.filename,path.resolve(template));assert.strictEqual(session.context.origin.surface,'palette-template-review');assert.strictEqual(session.context.origin.candidate.byteHash,templateHash);
    const png=require('../src/palette_indexed_png').readIndexedPng(templateBytes),recordId=require('../src/palette_family_candidate_writer').templateRecordId(template),zoneDocument={schema:'ikemaker.palette-template-zones',version:1,template:{sourceByteHash:templateHash,indexPlaneHash:png.indexPlaneHash,paletteHash:png.paletteHash,width:2,height:1},zones:[{id:'body',name:'Body',memberIndexes:[1],members:[{index:1,rect:{x:1,y:0,width:1,height:1},mask:[0]}],bounds:{x:1,y:0,width:1,height:1},cellGeometry:{width:1,height:1,gapX:0,gapY:0}}]},record={recordId,filenameHint:path.resolve(template),templateByteHash:templateHash,indexPlaneHash:png.indexPlaneHash,paletteHash:png.paletteHash,familyPlanHash:'f'.repeat(64),fullySynchronized:true,zoneDocument,updatedAt:'2026-10-29T00:00:00.000Z'};controller.domainSnapshot=()=>({readOnly:false,error:'',archive:{primaryTemplateRecordId:recordId,templateRecords:[record]}});let openedPrimary='';controller.openSourceWorkspace=async uri=>{openedPrimary=uri.fsPath;return null};const retainedReceipt={status:'adopted',manifest:{operationId:'retained-adoption'},verification:{verified:true},receiptFile:path.join(root,'retained-receipt.json'),receipt:{receiptHash:'a'.repeat(64)},error:''};paletteWorkspaceService().mutate(target,{family:{...session.family,template:{authority:null,plan:null,decisions:[],placementDraft:null,palettePhysicalIndex:null,error:''},output:retainedReceipt}});await controller.handleSff(state,{type:'workspaceAction',action:'templateEditExisting'});assert.strictEqual(openedPrimary,path.resolve(template),'Edit current resolves the persisted primary template instead of asking the user to choose it again');assert.strictEqual(pickerCalls,0,'Edit current does not reopen a generic template picker');session=paletteWorkspaceService().snapshot(target);assert.strictEqual(session.family.template.authority.filename,path.resolve(template),'reopening restores the persisted primary authority into the active session');assert.deepStrictEqual(session.family.output,retainedReceipt,'opening the adopted primary preserves its exact Undo/recovery receipt');paletteWorkspaceService().mutate(target,{family:{...session.family,template:{authority:null,plan:null,decisions:[],placementDraft:null,palettePhysicalIndex:null,error:''}}});const beforeDerivativePicker=pickerCalls;await controller.handleSff(state,{type:'workspaceAction',action:'templateReviewDerivative'});assert.strictEqual(pickerCalls,beforeDerivativePicker+1,'Import recolored proceeds to its submission picker after restoring the persisted primary');assert.strictEqual(paletteWorkspaceService().snapshot(target).family.template.authority.filename,path.resolve(template));assert.deepStrictEqual(paletteWorkspaceService().snapshot(target).family.output,retainedReceipt,'recolor navigation preserves the prior adoption receipt');fs.writeFileSync(template,Buffer.from(templateBytes).fill(0,40,41));paletteWorkspaceService().mutate(target,{family:{...paletteWorkspaceService().snapshot(target).family,template:{authority:null,plan:null,decisions:[],placementDraft:null,palettePhysicalIndex:null,error:''}}});await assert.rejects(controller.handleSff(state,{type:'workspaceAction',action:'templateReviewExpansion'}),/changed outside IKEMaker/,'expanded-copy review fails closed when the persisted primary bytes drift');fs.writeFileSync(template,templateBytes);
    assert(fs.readFileSync(target).equals(originalBytes));
    assert.strictEqual(state.busy, false);
    console.log('Palette-family canonical controller retained actions, stale CAS, Escape, summary, retained template intake, and no-write tests passed');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
