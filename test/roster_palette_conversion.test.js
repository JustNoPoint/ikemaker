'use strict';
const assert = require('assert');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) { if (request === 'vscode') return {}; return originalLoad.call(this, request, parent, isMain); };
const { paletteSource, playerPaletteConversion, rememberActOrder, replacementFlowMessage, newPaletteFlowMessage } = require('../src/roster_palette_flow');
Module._load = originalLoad;
const nodeFs=require('fs'),crypto=require('crypto'),originalRead=nodeFs.readFileSync,firstAct=Buffer.alloc(768,7),secondAct=Buffer.alloc(768,9);let paletteReads=0;
nodeFs.readFileSync=function(filename,...args){if(String(filename)==='race.act'){paletteReads+=1;return paletteReads===1?firstAct:secondAct;}return originalRead.call(this,filename,...args);};
try{const reviewed=paletteSource('race.act');assert.strictEqual(paletteReads,1,'palette parsing and evidence hashing must share one byte snapshot');assert.strictEqual(reviewed.byteHash,crypto.createHash('sha256').update(firstAct).digest('hex'));}finally{nodeFs.readFileSync=originalRead;}
const colors = Array.from({ length: 256 }, (_, index) => [index, index, index, index === 0 ? 0 : 255]), source = { name: 'test.act', colors };
const flipped = playerPaletteConversion(source, { flipTable: true, preset: 'none' });
assert.deepStrictEqual(flipped.colors[0].slice(0, 3), [255, 255, 255]); assert.strictEqual(flipped.colors[0][3], 0);
assert.deepStrictEqual(flipped.colors[255].slice(0, 3), [0, 0, 0]); assert.strictEqual(flipped.colors[255][3], 255);
const inverted = playerPaletteConversion(source, { preset: 'invert' }); assert.deepStrictEqual(inverted.colors[10].slice(0, 3), [245, 245, 245]);
assert.deepStrictEqual(source.colors[10], [10, 10, 10, 255]);
const replacement={type:'preview',requestId:1,paletteIndex:3,flipTable:false,rememberOrder:true,preset:'none'};assert(replacementFlowMessage(replacement,new Set([3])));assert.strictEqual(replacementFlowMessage({...replacement,extra:true},new Set([3])),null);assert.strictEqual(replacementFlowMessage({...replacement,paletteIndex:4},new Set([3])),null);assert.strictEqual(replacementFlowMessage({...replacement,preset:'forged'},new Set([3])),null);assert(newPaletteFlowMessage({type:'apply',requestId:2,flipTable:true,rememberOrder:false}));assert.strictEqual(newPaletteFlowMessage({type:'apply',requestId:2,flipTable:true,rememberOrder:false,group:99}),null);assert.deepStrictEqual(newPaletteFlowMessage({type:'cancel'}),{type:'cancel'});
console.log('roster palette conversion tests passed');

// Render the actual palette template with an adversarial filename.
const templateSource=require('fs').readFileSync(require('path').join(__dirname,'../src/roster_palette_flow.js'),'utf8'),box={};
require('vm').runInNewContext(templateSource.slice(templateSource.indexOf('function escapeName('),templateSource.indexOf('function paletteSource('))+templateSource.slice(templateSource.indexOf('function rawPage('),templateSource.indexOf('async function openRosterPaletteFlow(')),box);
const hostile='</script><script>alert(1)</script><img src=x onerror=alert(2)>';
const protectedPage=require('../src/webview_policy').protect(box.page({character:hostile,source:{name:hostile},targets:[],after:''}));
assert(!protectedPage.includes(hostile));assert.equal((protectedPage.match(/<script /g)||[]).length,1,'only the application script receives a nonce');assert(protectedPage.includes('&lt;img'));
const rememberedPage=box.page({character:'Ryu',source:{name:'pal.act',kind:'ACT'},targets:[],after:'',defaultFlip:true});
assert(rememberedPage.includes('Replace Existing Palette — Preview'));assert(rememberedPage.includes('Review Replacement…'));assert(rememberedPage.includes('Cancel Without Changes'));
assert(rememberedPage.includes('id="flipTable" type="checkbox" checked'),'remembered reversed order is visible before preview');
assert(rememberedPage.includes('Remember this ACT order'));assert(rememberedPage.includes('ACT has no producer marker'));
const pngPage=box.page({character:'Ryu',source:{name:'pal.png',kind:'Indexed PNG'},targets:[],after:''});
assert(!pngPage.includes('<label hidden><input id="flipTable"'),'indexed PNG retains the pre-existing generic table reversal');
assert(pngPage.includes('Reverse RGB table'));assert(pngPage.includes('<label hidden><input id="rememberOrder"'),'only ACT preference controls stay hidden for indexed PNG');assert(!pngPage.includes('Photoshop method'));
(async()=>{let effective='index',updated,notice='';const config={get:()=>effective,update:async(_key,value)=>{updated=value;}},api={ConfigurationTarget:{Global:1},window:{showInformationMessage:value=>notice=value}};assert.strictEqual(await rememberActOrder(config,'reversed',api),false);assert.strictEqual(updated,'reversed');assert.match(notice,/more specific VS Code setting/);effective='reversed';notice='';assert.strictEqual(await rememberActOrder(config,'reversed',api),true);assert.strictEqual(notice,'');})().catch(error=>{console.error(error);process.exitCode=1;});
