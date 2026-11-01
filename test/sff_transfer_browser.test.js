'use strict';

const assert=require('assert'),Module=require('module'),path=require('path'),vm=require('vm');

const original=Module._load;
Module._load=function(request,parent,main){if(request==='vscode')return{};return original.call(this,request,parent,main)};
const browser=require('../src/sff_browser');
Module._load=original;

const filename=path.resolve('transfer.sff');
assert.equal(browser.browserSessionKey(filename,{}),browser.browserSessionKey(filename,{transferPinned:false}));
const sourceKey=browser.browserSessionKey(filename,{transferPinned:true,transferSessionId:'session-1',transferRole:'source'});
const destinationKey=browser.browserSessionKey(filename,{transferPinned:true,transferSessionId:'session-1',transferRole:'destination'});
assert.notEqual(sourceKey,destinationKey,'source and destination companion browsers have distinct role authority');
assert.notEqual(sourceKey,browser.browserSessionKey(filename,{transferPinned:true,transferSessionId:'session-2',transferRole:'source'}),'new sessions cannot reuse stale browser authority');

const archive={buffer:Buffer.from('browser-selection'),header:{literalDataOffset:0},palettes:[],sprites:[
  {index:0,group:10,number:20,width:1,height:1,axisX:0,axisY:0,format:0,colorDepth:8,paletteIndex:0,dataOffset:0,dataSize:1},
  {index:1,group:10,number:20,width:1,height:1,axisX:1,axisY:2,format:0,colorDepth:8,paletteIndex:0,dataOffset:1,dataSize:1}
]};
const items=browser.transferSelectionItems(archive,[{physicalIndex:1,group:10,number:20},{physicalIndex:1,group:10,number:20}]);
assert.equal(items.length,1,'exact duplicate selections are collapsed');
assert.equal(items[0].id,'10,20@1');
assert.equal(items[0].physicalIndex,1);
assert.match(items[0].contentFingerprint,/^[A-F0-9]{64}$/);
assert.match(items[0].metadataFingerprint,/^[A-F0-9]{64}$/);
assert.throws(()=>browser.transferSelectionItems(archive,[{physicalIndex:1,group:10,number:20},{physicalIndex:99,group:10,number:20}]),/stale or ambiguous/,'one stale marked occurrence rejects the entire requested batch');
assert.throws(()=>browser.transferSelectionItems(archive,[]),/between 1 and 512/);
for(const allowed of ['browserRetainedState','browserReady','browserPainted','companionBrowserViewport','close','float','return','selection','original','thumbs','transferCopy','transferDrop'])assert.equal(browser.transferBrowserMessageAllowed(allowed),true,`${allowed} remains a bounded companion action`);
for(const rejected of ['documentUndo','documentRedo','control','multiControl','command','forwardDesktopDrop','assignPaletteScope','replacePalette'])assert.equal(browser.transferBrowserMessageAllowed(rejected),false,`${rejected} cannot mutate through a pinned browser`);

const transferPage=browser.page({filename,title:'Transfer',palettes:[],animations:[],sprites:[{archiveIndex:0,id:'10,20',group:10,number:20,width:1,height:1,axisX:0,axisY:0,paletteIndex:0,link:null,format:0,colorDepth:8,flags:[],note:'',customName:'',references:[]}],transfer:{role:'source',sessionId:'session-1',generation:1,sourceHandleId:'source'}});
assert(transferPage.includes("copy.id='transferCopy'"));
assert(transferPage.includes("copy.setAttribute('aria-describedby','status')"));
assert(transferPage.includes('Select one or more sprites to enable Copy Selected.'));
const script=transferPage.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1],start=script.indexOf("const transferCopy=document.getElementById('transferCopy')"),suffix=" to the pinned destination.'}}",end=script.indexOf(suffix,start)+suffix.length;assert(start>=0&&end>start+suffix.length,'actual transfer Copy state transition must be extractable from render');
const copy={disabled:false,title:''},statusEl={textContent:''},context={statusEl,document:{getElementById:id=>id==='transferCopy'?copy:null},model:{transfer:{role:'source'}},marked:new Set()};vm.createContext(context);vm.runInContext('(()=>{'+script.slice(start,end-1)+'})()',context);assert.strictEqual(copy.disabled,true);assert.match(statusEl.textContent,/Select one or more sprites/);context.marked.add('0');vm.runInContext('(()=>{'+script.slice(start,end-1)+'})()',context);assert.strictEqual(copy.disabled,false);assert.match(copy.title,/Copy 1 selected sprite/);

console.log('SFF Transfer browser role authority, exact physical selections and mutation rejection passed');
