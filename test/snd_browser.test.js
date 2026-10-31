'use strict';

const assert = require('assert');
const Module = require('module');
const vm = require('vm');
const original = Module._load;
Module._load = function(request, parent, main) {
  if (request === 'vscode') return {};
  return original.call(this, request, parent, main);
};
const browser = require('../src/snd_browser');
Module._load = original;

const html = browser.page({
  filename: 'C:/chars/Test/Test.snd', title: 'Test.snd', entries: [
    { archiveIndex: 0, group: 0, index: 0, identity: '0,0', name: 'Jump', category: 'Movement and Common Effects', namedBuckets: ['Role · movement', 'Name · Jump'], durationSeconds: 0.25, valid: true },
    { archiveIndex: 1, group: 10000, index: 1, identity: '10000,1', name: 'Win voice', category: 'Voice · Presentation', namedBuckets: ['Name · Win voice'], durationSeconds: 1.2, valid: true }
  ]
});

assert(html.includes('SND Lists / Waveforms'));
assert(html.includes('id="status" class="status" role="status" aria-live="polite"')&&html.includes('aria-label="Sound results"'),'changing results and availability guidance are exposed through named/status regions');
assert(html.includes('>List<') && html.includes('>Thumbnails<') && html.includes('>Combined<'));
assert(html.includes('Find group,index, name, or category'));
for (const label of ['Search SND sounds', 'Filter sounds by numeric group', 'Filter sounds by functional category', 'Filter sounds by profile name or role']) assert(html.includes(`aria-label="${label}"`), `${label} has a stable accessible name`);
assert(html.includes('All numeric groups') && html.includes('All functional categories'));
assert(html.includes('All profile names / roles') && html.includes('Role · movement') && html.includes('Name · Jump'));
assert(html.includes("type:'peaks'") && html.includes("type:'select'"));
assert(html.includes('Add / Drop WAVs')&&html.includes("type:'forwardDesktopDrop'"),'the floating SND browser forwards WAV drops to the authoritative Viewer/SndMaker intake');
assert(html.includes('IntersectionObserver') && html.includes("slice(0,8)"),'waveforms are requested only near the viewport and in bounded batches');
assert(html.includes('companionBrowserViewport'));
for (const [index, script] of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].entries()) assert.doesNotThrow(() => new vm.Script(script[1], { filename: `snd-browser-client-${index}.js` }));
const ordinaryScript=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)][0][1],historyMatch=ordinaryScript.match(/function syncHistory\(\)\{[^\n]+\}/);assert(historyMatch,'actual history availability transition must be extractable from production client');const browserUndo={disabled:false,title:''},browserRedo={disabled:false,title:''},historyStatus={textContent:''},historyContext={model:{transfer:null},history:{available:false,undo:false,redo:false,reason:'Open the exact SND Viewer.'},browserUndo,browserRedo,historyStatus};vm.createContext(historyContext);vm.runInContext(historyMatch[0]+';syncHistory()',historyContext);assert.strictEqual(browserUndo.disabled,true);assert.strictEqual(browserRedo.disabled,true);assert.match(historyStatus.textContent,/Open the exact SND Viewer/);historyContext.history={available:true,undo:true,redo:false,reason:''};vm.runInContext('syncHistory()',historyContext);assert.strictEqual(browserUndo.disabled,false);assert.strictEqual(browserRedo.disabled,true);assert.match(historyStatus.textContent,/Undo available/);

let reads = 0;
const fakeArchive = { buffer: { length: 4_000_000, readInt16LE() { reads += 1; return 1024; } } };
const values = browser.waveformPreviewPeaks(fakeArchive, { dataOffset: 0, wav: { valid: true, format: 1, bitsPerSample: 16, dataOffset: 0, blockAlign: 2, channels: 1, dataSize: 4_000_000 } }, 72, 4096);
assert.strictEqual(values.length, 72);
assert(reads <= 4096 + 72, `bounded waveform preview read ${reads} frames`);
const transferHtml=browser.page({filename:'C:/chars/Test/source.snd',title:'source.snd',transfer:{sessionId:'session',role:'source',generation:4,sourceHandleId:'source-h'},entries:[{archiveIndex:0,group:1,index:2,identity:'1,2',name:'',category:'Effect',namedBuckets:[],durationSeconds:.1,valid:true}]});
assert(transferHtml.includes('SND Transfer · source')&&transferHtml.includes('Copy Selected')&&transferHtml.includes("type:'transferSelection'"),'pinned SND browser exposes exact transfer selection');
assert(transferHtml.includes('id="copySelected" aria-describedby="status" disabled'), 'Copy Selected starts disabled and points assistive technology to its visible reason');
assert(transferHtml.includes("type:'transferCopy',marked:[...marked],selected,anchor"), 'Copy sends the exact current physical selection instead of trusting stale host state');
const transferScript=[...transferHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)][0][1],copyStart=transferScript.indexOf('const needsCopySelection='),copySuffix="+' to the pinned destination.'}",copyEnd=transferScript.indexOf(copySuffix,copyStart)+copySuffix.length;
assert(copyStart>=0&&copyEnd>copyStart+copySuffix.length,'actual Copy Selected availability transition is extractable from production render');
const copySelected={disabled:false,title:''},status={textContent:''},copyContext={copySelected,status,marked:new Set(),list:[{}],model:{entries:[{}],transfer:{role:'source'}}};vm.createContext(copyContext);vm.runInContext('(()=>{'+transferScript.slice(copyStart,copyEnd)+'})()',copyContext);assert.strictEqual(copySelected.disabled,true);assert.match(status.textContent,/Select one or more sounds/);copyContext.marked.add(0);vm.runInContext('(()=>{'+transferScript.slice(copyStart,copyEnd)+'})()',copyContext);assert.strictEqual(copySelected.disabled,false);assert.match(copySelected.title,/Copy 1 selected sound/);
assert(transferHtml.includes('application/x-ikemaker-snd-transfer')&&transferHtml.includes("type:'transferDrop'")&&transferHtml.includes("kind:'between-sounds'"),'SND browser drag/drop carries session-bound exact physical authority and a destination boundary');
assert(transferHtml.includes("if(!model.transfer){const desktopDrop"),'pinned Transfer browser suppresses ordinary source mutation intake at runtime');
const destinationHtml=browser.page({filename:'C:/chars/Test/destination.snd',title:'destination.snd',transfer:{sessionId:'session',role:'destination',generation:4,sourceHandleId:'source-h'},entries:[]});
assert(!destinationHtml.includes('id="copySelected"'),'the destination browser does not render the source-only Copy affordance');
for(const [index,script] of [...transferHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].entries())assert.doesNotThrow(()=>new vm.Script(script[1],{filename:`snd-transfer-browser-client-${index}.js`}));
console.log('SND browser list, waveform, search, filtering, and minimum-width tests passed');
