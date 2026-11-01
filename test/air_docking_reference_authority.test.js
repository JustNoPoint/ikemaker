'use strict';

const assert = require('assert');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {};
  if (request === './air_viewer' && /air_docking_workspace\.js$/.test(parent?.filename || '')) return { parseAir: () => [], inferCharacterFiles: () => null };
  return originalLoad.call(this, request, parent, isMain);
};
const { openReferenceRoute, failClosedRecord, buildModel, sourceHandoffDetails } = require('../src/air_docking_workspace');
Module._load = originalLoad;
const { sessions, key } = require('../src/air_browser_sessions');
const { buildAirActionUsageSnapshot } = require('../src/air_action_usage_authority');
const { hash } = require('../src/mutation_safety');

const defPath = 'C:/chars/Hero/Hero.def', airPath = 'C:/chars/Hero/Hero.air', sourcePath = 'C:/chars/Hero/main.zss';
const defText = '[Files]\nanim = Hero.air\nst = main.zss\n', airText = '[Begin Action 200]\n0,0,0,0,1\n', sourceText = '[StateDef 200; anim: 200]\n';
function context(generation) { return { defPath, defText, defDirty: false, airPath, airText, assignedSources: [sourcePath], sources: [{ available: true, dirty: false, filename: sourcePath, syntax: 'zss', text: sourceText, sourceHash: hash(sourceText) }], inventoryComplete: true, generation }; }
function snapshot(generation, route) { return buildAirActionUsageSnapshot({ ...context(generation), token: () => route }); }
function document(fileName, text) { return { fileName, isClosed: false, getText: () => text, positionAt: offset => { const before=text.slice(0,offset).split(/\r?\n/);return{line:before.length-1,character:before.at(-1).length}; } }; }
class Range { constructor(startLine, startColumn, endLine, endColumn) { Object.assign(this, { startLine, startColumn, endLine, endColumn }); } }

(async () => {
  const commands = { executeCommand: async (command, options) => command === 'ikemen.textToolbar.resumeFromVisualViewer' ? { attached: true, selectedFile: options.selectedFile, airReturnRendered: true } : undefined };
  const route = 'a'.repeat(48), built = snapshot(7, route), sourceDocument = document(sourcePath, sourceText), airDocument = document(airPath, airText);
  const record = { panel: { active: true }, data: { airPath }, referenceContext: context(7), referenceAuthorities: new Map(built.authorities), consumedReferences: new Set() };
  let shown = 0;
  const services = { Range, commands, referenceContext: (_airPath, currentAirText, generation) => ({ ...context(generation), airText: currentAirText }), workspace: { textDocuments: [airDocument, sourceDocument], openTextDocument: async () => sourceDocument }, window: { showTextDocument: async doc => { shown += 1; return { document: doc, viewColumn: 1 }; } } };
  await openReferenceRoute(record, route, services);
  assert.strictEqual(shown, 1, 'a current one-use route opens its exact source once');
  await assert.rejects(openReferenceRoute(record, route, services), /invalid or was already used/, 'exact routes are one-use');

  const collisionText='; filler\n'.repeat(899)+'[StateDef 200; anim: 200]\nOverrideClsn { rect: 0,0,10,10; }\n',collisionSource=document(sourcePath,collisionText),collisionContext={...context(10),sources:[{available:true,dirty:false,filename:sourcePath,syntax:'zss',text:collisionText,sourceHash:hash(collisionText)}],collisionCapabilities:{indexed:false,status:'unsupported',fingerprint:'stable'}},collisionBuilt=buildAirActionUsageSnapshot({...collisionContext,collisionToken:()=> 'd'.repeat(48)}),collisionRecord={panel:{active:true},data:{airPath},referenceContext:collisionContext,referenceAuthorities:new Map(collisionBuilt.collisionAuthorities),consumedReferences:new Set()};let collisionEditor=null;
  sessions.set(key(airPath),collisionRecord);
  await openReferenceRoute(collisionRecord,'d'.repeat(48),{Range,commands,referenceContext:(_airPath,currentAirText,generation)=>({...collisionContext,generation,airText:currentAirText}),workspace:{textDocuments:[airDocument,collisionSource],openTextDocument:async()=>collisionSource},window:{showTextDocument:async doc=>(collisionEditor={document:doc,viewColumn:1})}});
  assert(collisionEditor.selection&&typeof collisionEditor.selection.startLine==='object','collision navigation selects the exact controller range only after final revalidation');
  assert(sourceHandoffDetails(sourcePath).line>=899,'the deep collision reference route anchors its escape controls at the revealed controller range');
  await assert.rejects(openReferenceRoute(collisionRecord,'d'.repeat(48),{}),/already used/,'collision source routes are one-use');
  const queryText='[StateDef 200; anim: 200]\nlet edge=ClsnVar(Clsn1,0,Back);\n',querySource=document(sourcePath,queryText),queryContext={...context(11),sources:[{available:true,dirty:false,filename:sourcePath,syntax:'zss',text:queryText,sourceHash:hash(queryText)}],collisionCapabilities:{indexed:false,dummyGroup:false,status:'unsupported',fingerprint:'stable-query'}},queryBuilt=buildAirActionUsageSnapshot({...queryContext,collisionToken:()=> 'f'.repeat(48)}),queryAuthority=queryBuilt.collisionAuthorities.get('f'.repeat(48)),queryRecord={panel:{active:true},data:{airPath},referenceContext:queryContext,referenceAuthorities:new Map(queryBuilt.collisionAuthorities),consumedReferences:new Set()};let queryEditor=null;
  assert.strictEqual(queryAuthority.schema,'ikemaker.collision-query-source-route','query navigation uses an honestly named exact-call route');
  await openReferenceRoute(queryRecord,'f'.repeat(48),{Range,commands,referenceContext:(_airPath,currentAirText,generation)=>({...queryContext,generation,airText:currentAirText}),workspace:{textDocuments:[airDocument,querySource],openTextDocument:async()=>querySource},window:{showTextDocument:async doc=>(queryEditor={document:doc,viewColumn:1})}});
  assert.strictEqual(queryText.slice(queryAuthority.callStart,queryAuthority.callEnd),'ClsnVar(Clsn1,0,Back)');assert(queryEditor.selection&&typeof queryEditor.selection.startLine==='object','query navigation selects the exact balanced call span after revalidation');
  const sourceRaceBuilt=buildAirActionUsageSnapshot({...collisionContext,collisionToken:()=> 'e'.repeat(48)}),sourceRaceRecord={panel:{active:true},data:{airPath},referenceContext:collisionContext,referenceAuthorities:new Map(sourceRaceBuilt.collisionAuthorities),consumedReferences:new Set()};let currentCollisionText=collisionText,currentCapability='stable';const sourceRaceServices={Range,commands,referenceContext:(_airPath,currentAirText,generation)=>{const text=currentCollisionText;return{...collisionContext,generation,airText:currentAirText,sources:[{...collisionContext.sources[0],text,sourceHash:hash(text)}],collisionCapabilities:{indexed:false,status:'unsupported',fingerprint:currentCapability}}},workspace:{textDocuments:[airDocument,collisionSource],openTextDocument:async()=>collisionSource},window:{showTextDocument:async doc=>{currentCollisionText=collisionText+'# changed';currentCapability='changed-capability';return{document:{...doc,getText:()=>currentCollisionText},viewColumn:1};}}};await assert.rejects(openReferenceRoute(sourceRaceRecord,'e'.repeat(48),sourceRaceServices),/source, capability, or AIR snapshot changed/,'source/capability mutation during reveal fails before retaining an exact collision selection');

  const raceRoute = 'b'.repeat(48), raced = snapshot(8, raceRoute), raceRecord = { panel: { active: true }, data: { airPath }, referenceContext: context(8), referenceAuthorities: new Map(raced.authorities), consumedReferences: new Set() };
  const raceServices = { ...services, workspace: { textDocuments: [airDocument, sourceDocument], openTextDocument: async () => { raceRecord.referenceContext = context(9); raceRecord.referenceAuthorities = new Map(); return sourceDocument; } } };
  await assert.rejects(openReferenceRoute(raceRecord, raceRoute, raceServices), /snapshot changed/, 'an AIR/reference generation change during openTextDocument rejects stale navigation before reveal');

  const panel = { active: true, webview: { html: '', postMessage: async () => true } }, staleRecord = { panel, data: buildModel(airPath, airText), referenceContext: context(3), referenceAuthorities: new Map([['c'.repeat(48), {}]]), consumedReferences: new Set() };
  failClosedRecord(staleRecord, 'AIR source was deleted or renamed.');
  assert.strictEqual(staleRecord.referenceAuthorities.size, 0);
  assert.strictEqual(staleRecord.data.references.available, false);
  assert(panel.webview.html.includes('AIR source was deleted or renamed.'), 'AIR delete/rename refresh failures replace live rows with an unavailable projection');
  console.log('AIR References route races and delete/rename failures fail closed');
  sessions.clear();
})().catch(error => { console.error(error); process.exitCode = 1; });
