'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');
const original = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return { window: {}, workspace: {}, commands: {}, ViewColumn: {}, Position: class {}, Range: class {}, WorkspaceEdit: class {} };
  return original.call(this, request, parent, main);
};
const workspace = require('../src/move_constants_workspace');
const paletteWorkspace = require('../src/palette_import_workspace');
Module._load = original;

const shared = workspace.contactProfile(new Map([['jnp_sf6_cfg_normal_light_ground_velocity_x', { name: 'JNP_SF6_cfg_normal_light_ground_velocity_x', value: -4.8, filename: 'options.zss', line: 10 }]]), { values: { attackStrength: 1 } });
assert.deepStrictEqual(shared.map(item => [item.label, item.value, item.sharedLabel]), [['Ground hit velocity X', -4.8, 'light normal profile']]);
const assets={defPath:'C:/Game/Hero/Hero.def',constants:'C:/Game/Hero/constants.zss'},routeModel={timingSources:{constants:'hash'},moves:[{id:'normal.slp',prefix:'normal.sLP',timeline:{actionNumber:200,frames:[{},{}]}}]},route=workspace.constantsReference(routeModel.moves[0],assets,routeModel,{frameIndex:1});
assert.strictEqual(workspace.validConstantsReference(route,assets,routeModel),routeModel.moves[0]); assert.strictEqual(workspace.validConstantsReference({...route,sourceHash:'stale'},assets,routeModel),null); assert.strictEqual(workspace.validConstantsReference({...route,frameIndex:2},assets,routeModel),null);
const duplicateProblem={id:'lint-1',source:'IKEMEN lint',level:'warning',title:'Shared warning',detail:'normals.zss:8',filename:'C:/Game/Hero/normals.zss',line:7};
const overview=workspace.overviewFor({defPath:assets.defPath,constants:'C:/missing.cns',air:'C:/missing.air',code:[]},[{id:'normal.slp',prefix:'normal.sLP',problems:[duplicateProblem]},{id:'normal.smp',prefix:'normal.sMP',problems:[duplicateProblem]}],[{filename:duplicateProblem.filename,line:7,severity:1,message:'Shared warning',source:'IKEMEN lint'}],[],new Map([[path.resolve(duplicateProblem.filename).toLowerCase(),'source-hash']]));
assert.strictEqual(overview.problems.length,1,'all-character problems are deduplicated by exact source identity');
assert.strictEqual(overview.problems[0].members.length,3,'shared diagnostics retain both move memberships plus the all-character source membership');
assert.deepStrictEqual(overview.problems[0].members.filter(item=>item.sourceId).map(item=>item.sourceId),['normal.slp','normal.smp']);
assert.strictEqual(overview.problems[0].members[0].sourceHash,'source-hash');
const problemRef={id:overview.problems[0].id,memberKey:overview.problems[0].members[1].key,...overview.problems[0].members[1]};
assert.strictEqual(workspace.validOverviewProblem(problemRef,{overview}).member,overview.problems[0].members[1]);
assert.strictEqual(workspace.validOverviewProblem({...problemRef,sourceHash:'stale'},{overview}),null);
const timingOverview=workspace.overviewFor({defPath:assets.defPath,constants:'C:/Game/Hero/constants.zss',air:'C:/Game/Hero/Anim.air',code:[]},[
  {id:'normal.slp',prefix:'normal.sLP',timeline:{actionNumber:200},problems:[{id:'timing-a',source:'AIR timing',level:'error',title:'First active element is outside the AIR action',field:'firstActiveElement',frameIndex:0}]},
  {id:'normal.smp',prefix:'normal.sMP',timeline:{actionNumber:210},problems:[{id:'timing-b',source:'AIR timing',level:'error',title:'First active element is outside the AIR action',field:'firstActiveElement',frameIndex:1}]}
],[],[],new Map([[path.resolve('C:/Game/Hero/constants.zss').toLowerCase(),'constants-hash'],[path.resolve('C:/Game/Hero/Anim.air').toLowerCase(),'air-hash']]));
assert.strictEqual(timingOverview.problems.length,2,'distinct move/action/frame timing findings do not collapse');
assert(timingOverview.problems.every(item=>item.members[0].target==='field'&&item.members[0].filename.endsWith('constants.zss')),'field findings navigate to constants before AIR');

const page = workspace.html({ character: 'Ryu', files: {}, moves: [{ id: 'normal.slp', prefix: 'normal.slp', values: { moveID: 200, firstActiveElement: 2, idleElement: 3, damage: 30, groundHitTime: 10, guardHitTime: 7, sparkX: 0, sparkY: -50 }, fields: [{ suffix: 'damage', category: 'Damage', label: 'Damage', type: 'integer', value: 30, present: true }], timeline: { actionNumber: 200, state: 'ready', frames: [{ group: 200, index: 0, time: 2, clsnActive: false }] }, images: {}, reactionImage: null, contactProfile: [{ label: 'Ground hit velocity X', name: 'JNP_SF6_cfg_normal_light_ground_velocity_x', value: -4.8, filename: 'options.zss', line: 10, sourceHash: 'abc', sharedLabel: 'light normal profile' }], reactions: { normal: {}, counter: {}, punish: {} } }] });
assert.match(page, /<b>Move Lab<\/b>/); assert.match(page, /Constants integration/); assert.match(page, /Moves \/ Overview/); assert.doesNotThrow(() => new Function(page.match(/<script>([\s\S]*)<\/script>/)[1]));
assert.match(page, /id="overviewDrawer"/); assert.match(page, /All character files/); assert.match(page, /Direct code · open exact HitDef/);
assert.match(page, /overviewProfile/); assert.match(page, /overviewAttack/); assert.match(page, /overviewProblem/); assert.match(page, /focusBeforeRefresh/);
assert.match(page, /Opponent reaction preview/);
assert.match(page, /Drag the darkened P2 directly in the AIR canvas/);
assert.match(page, /spark2X\/spark2Y/);
assert.match(page, /Filter attacks/); assert.match(page, /Edit AIR \/ CLSN/); assert.match(page, /Clsn1/); assert.match(page, />Play</);
assert.match(page, /Advanced tools/); assert.match(page, /Connected code/); assert.match(page, /Problems/); assert.match(page, /Saved sources/);
assert.match(page, /SOURCE CHANGED/); assert.match(page, /Rebase onto current source/); assert.match(page, /Discard orphaned draft/);
assert.match(page, /codeDraftStore\.actionState/); assert.match(page, /syncCodeActions/); assert.match(page, /selectedFrame/); assert.match(page, /codeSectionFailed/);
assert.match(page, /Copy category/); assert.match(page, /Copy checked/); assert.match(page, /data-copy-one/); assert.match(page, /copyFields/);
assert.match(page, /Import from AIR/); assert.match(page, /frameTimingMenu/); assert.match(page, /Right-click to assign hit-pause animation timing/);
assert.match(page, /id="viewZoom"/); assert.match(page, /canvas\.onwheel/); assert.match(page, /spark\?'spark':overOpponent\(e\)\?'opponent':'pan'/); assert.match(page, /overSpark/); assert.match(page, /data-quick/); assert.match(page, /Shared classic HitDef values/); assert.match(page, /fitView/);
assert.match(page, /opponentWorldX/); assert.match(page, /moveView\.screenPoint/); assert.match(page, /data-profile-value/); assert.match(page, /data-profile-apply/); assert.match(page, /applyProfile/); assert.match(page, /World X/);
assert.match(page, /SOURCE CHANGED — open Source/); assert.match(page, /Use current/); assert.match(page, /draftRevision/); assert.match(page, /profileFailed/); assert.match(page, /shared HitDef draft/);
assert.match(page, /moveLabSelect/); assert.match(page, /model\.openReference/); assert.match(page, /moveOverview/);
const palette = paletteWorkspace.html({ items: [], summary: { title: 'No sprites selected', detail: 'Choose PNG files.', safeToStage: false } });
assert.match(palette, /never quantizes/); assert.doesNotThrow(() => new Function(palette.match(/<script>([\s\S]*)<\/script>/)[1]));
console.log('move constants and palette workspace tests passed');
