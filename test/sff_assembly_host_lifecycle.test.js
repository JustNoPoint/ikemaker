'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
async function settle() { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); }

const panels = [], errors = [], writes = [], archives = new Map(), closeSupport = new Map();
let folderGate = null, folderCalls = 0, transferFolderGate = null, transferFolderCalls = 0, decisionGate = null, decisionCalls = 0, stageGate = null, discarded = 0;
function makePanel() { const messages = [], disposers = []; const panel = { webview: { cspSource: 'test', html: '', onDidReceiveMessage(fn) { panel.receive = fn; }, postMessage(message) { messages.push(message); return true; } }, messages, onDidDispose(fn) { disposers.push(fn); }, reveal() {}, dispose() { for (const fn of disposers) fn(); } }; panels.push(panel); return panel; }
const vscode = {
  ViewColumn: { Active: 1 }, Uri: { file: fsPath => ({ fsPath }) }, workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) },
  commands: { registerCommand: () => ({}), executeCommand: async () => true },
  window: {
    createWebviewPanel: makePanel,
    async showOpenDialog(options) { if (/assembled SFF package/.test(options.title)) { folderCalls++; return folderGate.promise; } if (/reviewed SFF Transfer package/.test(options.title)) { transferFolderCalls++; return transferFolderGate.promise; } return undefined; },
    async showErrorMessage(message) { errors.push(String(message)); }, async showWarningMessage() {}, async showInformationMessage() {}, async showTextDocument() {}
  }
};
class Drafts {
  constructor() {}
  read() { return null; }
  async stage() { if (stageGate) await stageGate.promise; }
  async discard() { discarded++; }
  async flush() {}
}
const original = Module._load;
Module._load = function(request, parent, main) {
  const assembly = /sff_assembly_workspace/.test(parent?.filename || '');
  if (!assembly) return original.call(this, request, parent, main);
  if (request === 'vscode') return vscode;
  if (request === './sff_reader') return { readSff: filename => archives.get(path.resolve(filename)), friendlyVersion: () => '2.1', spritePng: () => Buffer.from('png') };
  if (request === './viewer_group') return { preferredViewerColumn: () => 1, trackViewerPanel: value => value };
  if (request === './viewer_close') return { support(panel, support) { closeSupport.set(panel, support); } };
  if (request === './viewer_sessions') return { register() {} };
  if (request === './webview_policy') return { protect: value => value };
  if (request === './launch_controls') return { launchControlsHtml: () => '', launchControlsClientScript: () => '', handleLaunchMessage: async () => undefined };
  if (request === './mutation_safety') return { transactionalWriteSet(_fs, entries) { writes.push(entries); }, transactionalWrite() {}, beginExternalMutation() { return { rollback() {}, complete() {} }; } };
  if (request === './form_drafts') return { FormDrafts: Drafts };
  if (request === './sff_transfer_assembly_adapter') return { validateSffTransferAssemblySeed: ({ seed }) => seed };
  if (request === './sff_transfer_conflict_model') return { analyzeSffTransferConflicts: () => ({ unresolved: { placement: false, identity: 0, links: 0, palettes: 0 } }) };
  if (request === './sff_transfer_resolution_model') return { planSffTransferResolution: () => ({ readyForApply: true, items: [] }) };
  if (request === './sff_transfer_decision_ui') return { collectSffTransferDecisions: async () => { decisionCalls++; return decisionGate.promise; } };
  if (request === './sff_transfer_apply') return { prepareSffTransferBuild: async () => { throw new Error('not expected'); } };
  if (request === './sff_commands') return { createBuildPackage: async () => { throw new Error('stale package must not reach build preparation'); } };
  return original.call(this, request, parent, main);
};
const workspace = require('../src/sff_assembly_workspace');
Module._load = original;
workspace.registerSffAssembly({ workspaceState: {}, subscriptions: [] });

const archive = (filename, group) => ({ filename, version: [2,1,0,0], palettes: [], sprites: [{ index: 0, group, number: 0, axisX: 1, axisY: 2, width: 2, height: 2, paletteIndex: 0 }] });
const operation = { selection: { indices: [0] }, targetGroup: 0, mode: 'append', preserveDestinationAxis: true, label: 'append: 1 sprite(s) → 0' };
const draft = { operations: [operation], selected: [0], mode: 'append', preserveDestinationAxis: true };
const waitFor = async (panel, predicate) => { for (let i=0;i<20;i++) { const found=panel.messages.find(predicate); if(found)return found; await settle(); } throw new Error('Timed out waiting for Assembly message'); };

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-assembly-host-'));
  try {
    // A pending draft followed by Discard cannot resume into a discard after panel disposal.
    const baseA=path.join(root,'base-a.sff'),sourceA=path.join(root,'source-a.sff');fs.writeFileSync(baseA,'base-a');fs.writeFileSync(sourceA,'source-a');archives.set(path.resolve(baseA),archive(baseA,0));archives.set(path.resolve(sourceA),archive(sourceA,10));
    const referenceA=workspace.assemblyReference(baseA,sourceA),panelA=await workspace.openSffAssembly(vscode.Uri.file(baseA),{preset:true,reference:referenceA});stageGate=deferred();panelA.receive({type:'assemblyDraft',identity:referenceA.identity,revision:1,draft});await settle();panelA.receive({type:'discardAssemblyDraft',identity:referenceA.identity});await settle();panelA.dispose();stageGate.resolve();await settle();await settle();assert.strictEqual(discarded,0,'a queued discard cannot mutate draft state after disposal');assert(!panelA.messages.some(message=>message.type==='assemblyDraftStored'||message.type==='assemblyDraftDiscarded'),'disposed sessions publish no late draft acknowledgement');stageGate=null;

    // One build owns the action; a changed Source during its folder picker prevents all writes.
    const baseB=path.join(root,'base-b.sff'),sourceB=path.join(root,'source-b.sff');fs.writeFileSync(baseB,'base-b');fs.writeFileSync(sourceB,'source-b');archives.set(path.resolve(baseB),archive(baseB,0));archives.set(path.resolve(sourceB),archive(sourceB,10));
    const referenceB=workspace.assemblyReference(baseB,sourceB),panelB=await workspace.openSffAssembly(vscode.Uri.file(baseB),{preset:true,reference:referenceB});panelB.receive({type:'assemblyDraft',identity:referenceB.identity,revision:1,draft});await waitFor(panelB,message=>message.type==='assemblyDraftStored'&&message.revision===1);folderGate=deferred();panelB.receive({type:'build',identity:referenceB.identity,revision:1,operations:[operation]});await settle();panelB.receive({type:'build',identity:referenceB.identity,revision:1,operations:[operation]});await settle();assert.strictEqual(folderCalls,1,'overlapping package actions are rejected instead of queued');fs.writeFileSync(sourceB,'source-b-changed');folderGate.resolve([{fsPath:root}]);await settle();await settle();assert.strictEqual(writes.length,0,'source drift while the picker is open prevents every package write');assert(errors.some(message=>/sources or the assembly plan changed/.test(message)),'stale package rejection is visible');panelB.dispose();

    // One Transfer decision review owns the action and disposal revokes its held result.
    const baseC=path.join(root,'base-c.sff'),sourceC=path.join(root,'source-c.sff');fs.writeFileSync(baseC,'base-c');fs.writeFileSync(sourceC,'source-c');archives.set(path.resolve(baseC),archive(baseC,0));archives.set(path.resolve(sourceC),archive(sourceC,10));
    const referenceC=workspace.assemblyReference(baseC,sourceC),transferIdentity='f'.repeat(64),transferSeed={authority:{requestIdentity:transferIdentity},sourceSelection:{physicalIndices:[0],items:[]},destinationBoundary:null};decisionGate=deferred();const panelC=await workspace.openSffAssembly(vscode.Uri.file(baseC),{preset:true,reference:referenceC,transferSeed});panelC.receive({type:'resolveAssemblyTransfer',transferIdentity});await settle();panelC.receive({type:'resolveAssemblyTransfer',transferIdentity});await settle();assert.strictEqual(decisionCalls,1,'overlapping Transfer reviews are rejected instead of queued');panelC.dispose();decisionGate.resolve({identityActions:{},linkActions:{},paletteActions:{}});await settle();await settle();assert(!panelC.messages.some(message=>message.type==='assemblyTransferResolution'),'disposed Transfer review cannot publish or adopt a late resolution');

    // Apply is independently single-flight and a disposed folder-picker result cannot prepare a candidate.
    const baseD=path.join(root,'base-d.sff'),sourceD=path.join(root,'source-d.sff');fs.writeFileSync(baseD,'base-d');fs.writeFileSync(sourceD,'source-d');archives.set(path.resolve(baseD),archive(baseD,0));archives.set(path.resolve(sourceD),archive(sourceD,10));
    const referenceD=workspace.assemblyReference(baseD,sourceD),applyIdentity='e'.repeat(64),applySeed={authority:{requestIdentity:applyIdentity},sourceSelection:{physicalIndices:[0],items:[]},destinationBoundary:null};decisionGate=deferred();decisionGate.resolve({identityActions:{},linkActions:{},paletteActions:{}});const panelD=await workspace.openSffAssembly(vscode.Uri.file(baseD),{preset:true,reference:referenceD,transferSeed:applySeed});panelD.receive({type:'resolveAssemblyTransfer',transferIdentity:applyIdentity});await waitFor(panelD,message=>message.type==='assemblyTransferResolution');transferFolderGate=deferred();panelD.receive({type:'applyAssemblyTransfer',transferIdentity:applyIdentity});await settle();panelD.receive({type:'applyAssemblyTransfer',transferIdentity:applyIdentity});await settle();assert.strictEqual(transferFolderCalls,1,'overlapping Transfer Apply actions are rejected instead of queued');panelD.dispose();transferFolderGate.resolve([{fsPath:root}]);await settle();await settle();assert(!panelD.messages.some(message=>message.type==='assemblyTransferApplied'),'disposed Transfer Apply cannot prepare or publish a late candidate result');
    console.log('SFF Assembly host serializes draft/package/Transfer actions and rejects stale or disposed await results');
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
})().catch(error=>{console.error(error);process.exitCode=1;});
