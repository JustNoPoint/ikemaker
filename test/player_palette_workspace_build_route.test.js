'use strict';

const assert = require('assert');
const fs = require('fs');
const Module = require('module');

const registrations = new Map();
let pickedRoute = null, received = null, pickerError = null, beginError = null, coordinatorResult = null, retainedAttempt = { status: 'idle', planRetained: true };
const buildStates = [];
const selectedPalettes=[];let interaction={};
const vscode = {
  ProgressLocation: { Notification: 1 }, Uri: { file: fsPath => ({ fsPath }) },
  commands: { registerCommand: (id, handler) => { registrations.set(id, handler); return { dispose() {} }; }, executeCommand: async () => undefined },
  window: {
    showQuickPick: async () => { if (pickerError) throw pickerError; return pickedRoute; },
    withProgress: async (_options, operation) => operation(),
    showInformationMessage: () => undefined, showWarningMessage: async () => undefined, showErrorMessage: () => undefined
  }
};
const originalLoad = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return vscode;
  if (request === './palette_workshop_build_coordinator') return { runPaletteWorkshopBuild: async (input, options) => { received = { input, options }; if(coordinatorResult instanceof Error)throw coordinatorResult;return coordinatorResult||{ schema: 'ikemaker.palette-workshop-build-result', version: 1, status: input.backend === 'builtin-test' ? 'validated-test-candidate' : 'validated-not-adopted', adopted: false, planRetained: true, candidatePath: 'candidate.sff' }; } };
  if (request === './palette_workspace_service') return { paletteWorkspaceService: () => ({ beginBuildAttempt: filename => { buildStates.push(['begin',filename]); if(beginError)throw beginError; retainedAttempt={status:'choosing',planRetained:true}; }, updateBuildAttempt: (_filename, patch) => { retainedAttempt={...retainedAttempt,...patch};buildStates.push(['update',patch.status,patch.backend]); }, recordBuildResult: (_filename, result) => { retainedAttempt={...retainedAttempt,...result};buildStates.push(['result',result.status]); }, select:(_filename,value)=>selectedPalettes.push(value.palette),snapshot: () => ({buildAttempt:retainedAttempt,interaction}),mutate:(_filename,patch)=>{interaction=patch.interaction;return{interaction}} }) };
  if (request === './palette_plan') return { readPalettePlan: () => ({palettes:[{kind:'source',group:1,number:2,name:'New blue',stagedAt:'2026-10-29T01:00:00.000Z'}]}) };
  if (request === './sff_reader') return { readSff: () => ({palettes:[{index:0,group:1,number:1},{index:1,group:1,number:2}]}) };
  if (request === './sff_commands') return { createBuildPackage: async () => ({}) };
  if (request === './sff_build_safety') return { captureTarget: () => ({}), candidatePath: () => '', SEPARATE: 'preserve-separate', SHARE: 'share-identical' };
  if (request === './sff_build_profile') return { DEFAULT_PROFILE: {} };
  if (request === './palette_workshop_browser') return { register: () => undefined };
  return originalLoad.call(this, request, parent, main);
};
const workspace = require('../src/player_palette_workspace');

(async () => {
  const context = { subscriptions: [] }; workspace.registerPlayerPaletteWorkspace(context);
  const handler = registrations.get('ikemen.palettePlayer.finishStaged'); assert(handler);
  const missingTarget = await handler(); assert.strictEqual(missingTarget.status, 'failed'); assert.match(missingTarget.message, /no exact SFF target/);
  pickedRoute = null; received = null;
  const cancelled = await handler({ fsPath: 'C:\\chars\\hero\\hero.sff' });
  assert.strictEqual(cancelled.status, 'cancelled'); assert.strictEqual(cancelled.planRetained, true); assert.strictEqual(received, null);
  assert.deepStrictEqual(buildStates.slice(-2).map(item=>item[0]), ['begin','result'], 'pre-route cancellation is retained in the canonical workspace session');
  retainedAttempt={status:'running',backend:'builtin-test',planRetained:true};beginError=Object.assign(new Error('already running'),{code:'PALETTE_BUILD_BUSY'});const busyCount=buildStates.length;const busy=await handler({fsPath:'C:\\chars\\hero\\hero.sff'});assert.strictEqual(busy.status,'busy');assert.strictEqual(buildStates.length,busyCount+1);assert.strictEqual(buildStates.at(-1)[0],'begin','duplicate refusal must not record over the retained running attempt');assert.strictEqual(retainedAttempt.status,'running');
  retainedAttempt={status:'adopted-cleanup-required',adopted:true,planRetained:true,receiptPath:'receipt.json'};beginError=Object.assign(new Error('cleanup recovery required'),{code:'PALETTE_BUILD_RECOVERY_REQUIRED'});const cleanupCount=buildStates.length;const recovery=await handler({fsPath:'C:\\chars\\hero\\hero.sff'});assert.strictEqual(recovery.status,'adopted-cleanup-required');assert.strictEqual(recovery.receiptPath,'receipt.json');assert.strictEqual(buildStates.length,cleanupCount+1);assert.strictEqual(retainedAttempt.status,'adopted-cleanup-required','direct command refusal preserves cleanup-required state');beginError=null;retainedAttempt={status:'idle',planRetained:true};
  for(const code of ['PALETTE_BUILD_EMPTY','PALETTE_BUILD_TARGET_DRIFT','PALETTE_BUILD_PLAN_DRIFT']){retainedAttempt={status:'cancelled',planRetained:true};beginError=Object.assign(new Error(code),{code});const before=buildStates.length,result=await handler({fsPath:'C:\\chars\\hero\\hero.sff'});assert.strictEqual(result.status,'failed');assert.strictEqual(buildStates.length,before+1);assert.strictEqual(buildStates.at(-1)[0],'begin',`${code} must fail before writer selection without recording over retained state`);assert.strictEqual(retainedAttempt.status,'cancelled')}beginError=null;retainedAttempt={status:'idle',planRetained:true};
  pickerError = new Error('picker failed');
  const failedBeforeRoute = await handler({ fsPath: 'C:\\chars\\hero\\hero.sff' });
  assert.strictEqual(failedBeforeRoute.status, 'failed'); assert.strictEqual(failedBeforeRoute.backend, '');
  assert.deepStrictEqual(buildStates.slice(-2).map(item=>item[0]), ['begin','result'], 'picker failure becomes a retained terminal attempt');
  pickerError = null;
  for (const backend of ['builtin-test', 'sprmake2-adopt']) {
    pickedRoute = { backend }; received = null;
    const result = await handler({ fsPath: 'C:\\chars\\hero\\hero.sff' });
    assert.strictEqual(received.input.backend, backend); assert.strictEqual(received.input.sffPath, 'C:\\chars\\hero\\hero.sff');
    assert.strictEqual(typeof received.options.preparePackage, 'function'); assert.strictEqual(typeof received.options.confirmBuild, 'function');
    assert.strictEqual(result.planRetained, true);
    assert(buildStates.some(item=>item[0]==='update'&&item[1]==='running'&&item[2]===backend));assert.strictEqual(buildStates.at(-1)[1],result.status);
  }
  coordinatorResult={schema:'ikemaker.palette-workshop-build-result',version:1,status:'adopted',adopted:true,planRetained:false};pickedRoute={backend:'sprmake2-adopt'};const adopted=await handler({fsPath:'C:\\chars\\hero\\hero.sff'});assert.strictEqual(adopted.status,'adopted');assert.deepStrictEqual(selectedPalettes.at(-1),{physicalIndex:1,group:1,number:2},'successful build focuses the exact newly staged palette');assert.match(interaction.status,/selected palette 1,2/);coordinatorResult=null;
  const beforeCleanupSelect=selectedPalettes.length;coordinatorResult={schema:'ikemaker.palette-workshop-build-result',version:1,status:'adopted-cleanup-required',adopted:true,planRetained:true,message:'plan cleanup failed'};const cleanupAdopted=await handler({fsPath:'C:\\chars\\hero\\hero.sff'});assert.strictEqual(cleanupAdopted.status,'adopted-cleanup-required');assert.strictEqual(selectedPalettes.length,beforeCleanupSelect+1,'an adopted SFF still focuses its exact new palette when plan cleanup needs recovery');
  const afterReturnedCleanup=selectedPalettes.length,postAdoptionError=new Error('receipt publish failed after adoption');postAdoptionError.paletteWorkshopResult={schema:'ikemaker.palette-workshop-build-result',version:1,status:'adopted-cleanup-required',adopted:true,planRetained:true,message:postAdoptionError.message};coordinatorResult=postAdoptionError;const thrownCleanup=await handler({fsPath:'C:\\chars\\hero\\hero.sff'});assert.strictEqual(thrownCleanup.status,'adopted-cleanup-required');assert.strictEqual(selectedPalettes.length,afterReturnedCleanup+1,'a thrown post-adoption failure also returns focus to the adopted palette');coordinatorResult=null;
  const browserSource = fs.readFileSync(require.resolve('../src/sff_browser'), 'utf8');
  assert.match(browserSource, /paletteBuildState/); assert.match(browserSource, /const result=await vscode\.commands\.executeCommand/);
  console.log('Palette Workshop command host and browser result-route tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { Module._load = originalLoad; });
