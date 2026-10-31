'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const load = Module._load;
Module._load = function patched(request, parent, main) { if (request === 'vscode') return {}; return load.call(this, request, parent, main); };
const { LAYERED_PSD_LIMITS, assertLayeredPsdExportBytes, enforceLayeredPsdExportLimit, writeLayeredPsdTemporaryArtifact, cleanupLayeredPsdTemporaryExport, layeredPsdPlan, generateLayerCode, manifestText, layeredPsdHtml, validLayeredPsdMessage } = require('../src/layered_psd_workspace');
const { reviewedStack } = require('../src/visual_layer_stack_model');
Module._load = load;

const records = [
  { index: 0, width: 640, height: 360, x: 0, y: 0, name: 'Composite' },
  { index: 1, width: 200, height: 80, x: 10, y: 20, name: 'Foreground', visible: true, opacity: 0.5, compose: 'over' },
  { index: 2, width: 640, height: 360, x: 0, y: 0, name: 'Hidden guide', visible: false, compose: 'over' },
  { index: 3, width: 640, height: 360, x: 0, y: 0, name: 'Background', visible: true, compose: 'over' }
];

assert.throws(() => layeredPsdPlan(records, { target: 'stage' }), /choose whether page 1 is the top or bottom/i);
assert.throws(()=>layeredPsdPlan([{index:0,width:1,height:1},...Array.from({length:LAYERED_PSD_LIMITS.layers+1},(_,index)=>({index:index+1,width:1,height:1,name:`Layer ${index+1}`}))],{target:'stage',stackDirection:'top-first'}),/at most 128 authored layers/);
assert.throws(()=>layeredPsdPlan([{index:0,width:5000,height:4000},{index:1,width:5000,height:4000,name:'Huge'}],{target:'stage',stackDirection:'top-first'}),/16,000,000-pixel limit/);
assert.throws(()=>layeredPsdPlan([{index:0,width:4000,height:4000},...Array.from({length:5},(_,index)=>({index:index+1,width:4000,height:4000,name:`Layer ${index+1}`}))],{target:'stage',stackDirection:'top-first'}),/64,000,000 aggregate layer-pixel limit/);
assert.strictEqual(assertLayeredPsdExportBytes([{filename:'a'},{filename:'b'}], filename=>({size:filename==='a'?LAYERED_PSD_LIMITS.exportedBytes-1:1})),LAYERED_PSD_LIMITS.exportedBytes,'the exact exported-byte ceiling is accepted');
assert.throws(()=>assertLayeredPsdExportBytes([{filename:'a'},{filename:'b'}],filename=>({size:filename==='a'?LAYERED_PSD_LIMITS.exportedBytes:1})),/64 MiB limit.*Flatten, crop, or split/i,'one byte beyond the exported-byte ceiling is rejected with repair guidance');
const removed=[];assert.strictEqual(enforceLayeredPsdExportLimit([{filename:'exact'}],'D:/temporary-export',{statSync:()=>({size:LAYERED_PSD_LIMITS.exportedBytes}),rmSync:(...args)=>removed.push(args)}),LAYERED_PSD_LIMITS.exportedBytes);assert.deepStrictEqual(removed,[],'an accepted exact-limit export is retained');
assert.throws(()=>enforceLayeredPsdExportLimit([{filename:'too-large'}],'D:/temporary-export',{statSync:()=>({size:LAYERED_PSD_LIMITS.exportedBytes+1}),rmSync:(...args)=>removed.push(args)}),/64 MiB limit.*Flatten, crop, or split/i);assert.deepStrictEqual(removed,[['D:/temporary-export',{recursive:true,force:true}]],'an over-limit export is removed recursively before actionable guidance escapes');
fs.mkdirSync(path.join(os.tmpdir(),'ikemaker-layered-psd'),{recursive:true});
const temporarySession=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-layered-psd','authority-'));
try {
  const artifact=path.join(temporarySession,'review.txt');
  writeLayeredPsdTemporaryArtifact(temporarySession,artifact,'initial','fixture');
  assert.strictEqual(fs.readFileSync(artifact,'utf8'),'initial','temporary artifact is installed through mutation safety');
  writeLayeredPsdTemporaryArtifact(temporarySession,artifact,'reviewed','fixture-review');
  assert.strictEqual(fs.readFileSync(artifact,'utf8'),'reviewed','reviewed temporary artifact replacement is transactional');
  assert.throws(()=>writeLayeredPsdTemporaryArtifact(temporarySession,path.join(temporarySession,'..','escaped.txt'),'unsafe','escape'),/escape its reviewed temporary export directory/i);
  assert.throws(()=>writeLayeredPsdTemporaryArtifact(path.join(os.tmpdir(),'unapproved-layered-psd'),path.join(os.tmpdir(),'unapproved-layered-psd','artifact.txt'),'unsafe','root'),/only be written inside a unique IKEMaker OS-temporary export directory/i);
  const cleanupCalls=[];
  assert.strictEqual(cleanupLayeredPsdTemporaryExport(temporarySession,{rmSync:(...args)=>cleanupCalls.push(args)}),true);
  assert.deepStrictEqual(cleanupCalls,[[temporarySession,{recursive:true,force:true}]],'completed exports are removed as one bounded temporary session');
  assert.throws(()=>cleanupLayeredPsdTemporaryExport(os.tmpdir(),{rmSync(){throw Error('must not run')}}),/Only a completed IKEMaker layered-PSD temporary export/i);
} finally { fs.rmSync(temporarySession,{recursive:true,force:true}); }
const stage = layeredPsdPlan(records, { target: 'stage', stackDirection: 'top-first', group: 30, startIndex: 100, targetCanvas: [320, 240] });
assert.deepStrictEqual(stage.layers.map(layer => layer.sprite), [[30, 100], [30, 101], [30, 102]], 'sprite identities stay tied to PSD pages');
assert.deepStrictEqual(stage.drawStack.map(layer => layer.name), ['Background', 'Foreground'], 'hidden layers remain in the plan but are excluded from emitted draw order');
assert.strictEqual(stage.layers[0].opacity, 0.5);
assert.ok(stage.warnings.some(message => /differs from target coordinates/.test(message)));
const stageCode = generateLayerCode(stage, { origin: [-320, -340], layerNo: 0 });
assert.ok(stageCode.indexOf('Background') < stageCode.indexOf('Foreground'), 'stage blocks emit bottom-to-top');
assert.match(stageCode, /start = -320,-340/);
assert.match(stageCode, /spriteno = 30,102/);
const movedStageCode = generateLayerCode({ ...stage, drawStack: stage.drawStack.map(layer => ({ ...layer, deltaX: 5, deltaY: -3 })) }, { origin: [-320, -340], layerNo: 0 });
assert.match(movedStageCode, /start = -315,-343/, 'reviewed layer deltas affect generated target placement');
const reviewedStage=reviewedStack([...stage.layers].sort((a,b)=>a.renderOrder-b.renderOrder),[
  {id:'psd-layer-1',x:3,y:4,visible:true},
  {id:'psd-layer-3',x:-2,y:5,visible:true},
  {id:'psd-layer-2',x:0,y:0,visible:false}
]);
assert.deepStrictEqual(reviewedStage.drawStack.map(layer=>layer.sprite),[[30,100],[30,102]],'reorder and visibility never renumber sprite identities');
const reviewedStageCode=generateLayerCode({...stage,layers:reviewedStage.layers,drawStack:reviewedStage.drawStack},{origin:[10,20]});
assert.ok(reviewedStageCode.indexOf('spriteno = 30,100')<reviewedStageCode.indexOf('spriteno = 30,102'));
assert.match(reviewedStageCode,/start = 13,24/);
assert.match(reviewedStageCode,/start = 8,25/);

const ui = layeredPsdPlan(records, { target: 'ui', stackDirection: 'top-first', group: 40, startIndex: 0, targetName: 'Title Info' });
const uiCode = generateLayerCode(ui, { origin: [-320, 0], firstBlock: 4 });
assert.match(uiCode, /\[TitleBG 4\]/);
assert.match(uiCode, /start = -320,0/);

const story = layeredPsdPlan(records, { target: 'story', stackDirection: 'bottom-first', group: 50, startIndex: 5 });
const storyCode = generateLayerCode(story, { firstLayer: 7 });
assert.match(storyCode, /layer7\.spr = 50,5/);
assert.match(storyCode, /layer8\.spr = 50,7/);
const movedStoryCode = generateLayerCode({ ...story, drawStack: story.drawStack.map(layer => ({ ...layer, deltaX: -2, deltaY: 4 })) }, { firstLayer: 7, origin: [10, 20] });
assert.match(movedStoryCode, /layer7\.offset = 8,24/);

const unsafe = layeredPsdPlan(records.map(record => record.index === 1 ? { ...record, compose: 'multiply' } : record), { target: 'stage', stackDirection: 'top-first' });
assert.strictEqual(unsafe.canKeepLayers, false);
assert.ok(unsafe.warnings.some(message => /multiply/.test(message)));

const manifest = manifestText(stage, stage.layers.map(layer => ({ sourceOrdinal: layer.pageIndex, filename: `layer-${layer.pageIndex}.png` })));
assert.match(manifest, /Foreground/);
assert.match(manifest, /30,100,0,0,2/);
assert.match(manifestText({ ...stage, layers: [{ ...stage.layers[0], name: 'A,"B"' }] }, [{ sourceOrdinal: 1, filename: 'a,b.png' }], 'HASH'), /"A,""B"""/);

const html = layeredPsdHtml({ ...stage, targetLabel: 'Stage', psdPath: 'D:/art.psd', outputDirectory: 'D:/out', codeConfig: { target: 'stage', origin: [0, 0], layerNo: 0, firstLayer: 0, firstBlock: 0, uiPrefix: 'TitleBG' } });
assert.match(html, /Continue exported layers in SFF intake/);
assert.match(html, /Verify built SFF &amp; review source/);
assert.match(html, /Open owner source/);
assert.match(html, /verifyAdoption/);
assert.match(html, /sort\(\(a,b\)=>a\.renderOrder-b\.renderOrder\)/);
assert.match(html, /id="orderUp"/);
assert.match(html, /id="orderDown"/);
assert.match(html, /id="orderTop"/);
assert.match(html, /id="orderBottom"/);
assert.match(html, /event\.ctrlKey\|\|event\.metaKey/);
assert.match(html, /event\.shiftKey&&anchor/);
assert.match(html, /role="listbox"[^>]*aria-multiselectable="true"/,'layer stack exposes its multi-selection semantics');
assert.match(html, /role="option" aria-selected=/,'generated layer rows expose selection state');
assert.match(html, /ArrowUp.*ArrowDown.*Home.*End/,'layer rows provide bounded keyboard navigation');
assert.match(html, /Select one or more PSD layers first\./,'selection-only controls explain how to enable them');
assert.match(html, /Open SFF intake and complete its reviewed build first\./,'verification explains its enabling route');
assert.match(html, /layeredActionState/,'host action state locks the client during asynchronous work');
assert.match(html, /type="checkbox" aria-label="Show/,'visibility remains an independent row control');
assert.match(html, /baked opacity/);
assert.doesNotMatch(html, /type="range"[^>]*opacity|id="opacity"/i,'authored PSD opacity is evidence, not an unsupported editable value');
new Function(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
const source=fs.readFileSync(path.join(__dirname,'..','src','layered_psd_workspace.js'),'utf8');
assert.match(source,/detect:true,reversed:false/,'layer stack direction must never alter indexed-palette table order');
assert.match(source,/crypto\.randomUUID\(\)/,'each reviewed export session receives an immutable directory');
assert.match(source,/openSffIntake',layers:state\(\)/,'SFF intake receives the complete live reviewed order, visibility, and placement');
assert.match(source,/sealLayeredPsdReview\(plan,allDraw,message\.layers,options\)/,'the extension validates and seals live layer state before opening SFF intake');
assert.match(source,/const intakeLayers = \[\.\.\.review\.layers\]\.sort/,'SFF intake preserves original sequential sprite identities when draw order or visibility changes');
assert.match(source,/sourcePaths:intakeLayers\.map/,'SFF file order must not follow reviewed draw order');
assert.match(source,/message\.type==='reviewChanged'.*pendingAdoption=null/,'every layer edit invalidates prior SFF verification');
assert.match(source,/code: generateLayerCode\(reviewedPlan, options\)/,'sealed adoption code is regenerated from the reviewed live state');
assert.match(source,/verifySffIdentities\(readSff\(adoption\.sffPath\)/,'source adoption requires verification against the built target archive');
assert.match(source,/Append Reviewed Source/,'source writing requires an explicit modal review');
assert.strictEqual(validLayeredPsdMessage({type:'reviewChanged'},stage.layers),true);
assert.strictEqual(validLayeredPsdMessage({type:'openOwner'},stage.layers),true);
assert.strictEqual(validLayeredPsdMessage({type:'openOwner',path:'forged'},stage.layers),false,'the owner return route never accepts a client-authored path');
assert.strictEqual(validLayeredPsdMessage({type:'reviewChanged',forged:true},stage.layers),false,'host rejects surplus client authority');
assert.strictEqual(validLayeredPsdMessage({type:'copyCode',code:'safe'},stage.layers),true);
assert.strictEqual(validLayeredPsdMessage({type:'copyCode',code:'safe',path:'forged'},stage.layers),false);
assert.strictEqual(validLayeredPsdMessage({type:'openSffIntake',layers:stage.layers.map(layer=>({id:layer.id,x:0,y:0,visible:layer.visible}))},stage.layers),true);
assert.strictEqual(validLayeredPsdMessage({type:'openSffIntake',layers:[{id:'forged',x:0,y:0,visible:true}]},stage.layers),false);

console.log('Layered PSD workspace preserves reviewed stack order, visibility, geometry, SFF identities, and target-specific code');
