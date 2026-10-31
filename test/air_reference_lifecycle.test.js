'use strict';
const assert = require('assert');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return { workspace: { textDocuments: [] }, Uri: { file: fsPath => ({ fsPath }) } };
  if (request === './air_viewer' && /air_docking_workspace\.js$/.test(parent?.filename || '')) return { parseAir: () => [], inferCharacterFiles: () => ({}) };
  return originalLoad.call(this, request, parent, isMain);
};
const viewer = require('../src/air_viewer'), docking = require('../src/air_docking_workspace');
Module._load = originalLoad;

const posted=[],session={airPath:'C:/char/main.air',exactUsageRoutes:new Map([['old',{}]]),exactUsageConsumed:new Set(['old']),panel:{webview:{postMessage:message=>posted.push(message)}}},panels=new Map([['air',session]]);
viewer.refreshAirCapabilityReferences(panels,(_session,text)=>{assert.strictEqual(_session.exactUsageRoutes.size,0,'old main-view routes are cleared before capability resolution');assert.strictEqual(_session.exactUsageConsumed.size,0);return{fingerprint:text}},[{fileName:'C:/char/main.air',isClosed:false,getText:()=> 'nightly'}]);
assert.deepStrictEqual(posted,[{type:'model',model:{fingerprint:'nightly'}}],'capability signal rebuilds the open main-view projection without an AIR/source edit');
const failed=[],failedSession={airPath:'C:/char/main.air',exactUsageRoutes:new Map([['old',{}]]),exactUsageConsumed:new Set(['old']),lastClientModel:{actions:[{number:0}],referenceSummaries:{0:{available:true}}},panel:{webview:{postMessage:message=>failed.push(message)}}};viewer.refreshAirCapabilityReferences(new Map([['air',failedSession]]),()=>{throw new Error('target missing')},[{fileName:'C:/char/main.air',isClosed:false,getText:()=> 'stable'}]);assert.strictEqual(failedSession.exactUsageRoutes.size,0);assert.strictEqual(failed[0].type,'model');assert.strictEqual(failed[0].model.referenceSummaries[0].available,false,'failed capability resolution replaces the rendered summary instead of retaining stale counts');assert.strictEqual(failedSession.exactUsageModel.available,false);

(async()=>{const old=new Map([['old',{}]]),record={referenceAuthorities:old,consumedReferences:new Set(['used']),data:{airPath:'C:/char/main.air',references:{}},panel:{webview:{}}},records=new Map([['air',record]]);let cleared=false;await docking.refreshCapabilityReferences(records,async current=>{cleared=current.referenceAuthorities.size===0&&current.consumedReferences.size===0;current.referenceAuthorities=new Map([['new',{}]]);current.data={...current.data,capability:'nightly'};});assert(cleared,'browser clears old one-use route authority before capability refresh');assert.strictEqual(record.data.capability,'nightly');assert(record.referenceAuthorities.has('new'),'refreshed capability and route authority publish together');console.log('AIR reference owner/capability lifecycle refreshes fail closed');})().catch(error=>{console.error(error);process.exitCode=1});
