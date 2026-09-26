'use strict';
const assert=require('assert'),Module=require('module');
const fs=require('fs'),path=require('path'),vm=require('vm');
const spriteSource=fs.readFileSync(path.join(__dirname,'../src/sff_viewer.js'),'utf8');
const capture=spriteSource.slice(spriteSource.indexOf('globalThis.ikemenComparisonCapture='),spriteSource.indexOf('globalThis.ikemenSpriteLayout={'));
const context={selected:{group:1,number:2},image:null,canvas:{toDataURL:()=> 'current rendered canvas'}};
vm.runInNewContext(capture,context);assert.strictEqual(context.ikemenComparisonCapture(),undefined,'pending sprite load cannot capture stale canvas');
context.image={};assert.strictEqual(context.ikemenComparisonCapture().media,'current rendered canvas');assert.strictEqual(context.ikemenComparisonCapture().number,2);
(async()=>{
 const comparison=require('../src/viewer_comparison');let choice='pin',receive,dispose,disposed=false;
 const panel={webview:{onDidReceiveMessage:fn=>receive=fn},onDidDispose:fn=>dispose=fn,reveal(){},dispose(){disposed=true;dispose();}};
 const original=Module._load;Module._load=function(request,parent,main){
   if(parent?.filename.endsWith('viewer_comparison.js')){
     if(request==='vscode')return{workspace:{textDocuments:[{fileName:path.resolve('live.air'),isDirty:true,getText:()=> '[Begin Action 210]\n0,0,5,-2,3'}]},ViewColumn:{Beside:2},window:{showQuickPick:async items=>items.find(item=>item.action===choice),showInformationMessage(){},createWebviewPanel:()=>panel}};
     if(request==='./viewer_navigation')return{archiveContext:()=>({ownerDef:'char.def',record:{sff:'shared.sff'}})};
     if(request==='./sff_reader')return{readSff:()=>({sprites:[{group:0,number:0,width:24,height:32},{group:1,number:2,width:50,height:60}]}),spriteDataUri:()=> 'data:image/png;base64,AA=='};
     if(request==='./snd_reader')return{readSnd:()=>({entries:[{group:3,index:4}]}),soundDataUri:()=> 'data:audio/wav;base64,AA=='};
   }
   return original.call(this,request,parent,main);
 };
 try{
   assert.throws(()=>comparison.snapshot('x.sff','sff',{group:9,number:9}),/no longer exists/);
   assert.throws(()=>comparison.snapshot('x.snd','snd',{}),/Select/);
   const preview={group:9,number:9,media:'data:image/png;base64,AQID'};
   const live=comparison.snapshot('x.sff','sff',{group:9,number:9},preview);assert.strictEqual(live.media,preview.media);assert.match(live.detail,/viewer preview/);
   assert.throws(()=>comparison.snapshot('x.sff','sff',{group:1,number:2},preview),/does not match/);
   assert.throws(()=>comparison.snapshot('x.sff','sff',{group:9,number:9},{...preview,media:'https://example.com/image.png'}),/unavailable/);
   await assert.rejects(comparison.openComparison('x.sff','sff',{group:0,number:0},{requirePreview:true}),/finish loading/);
   const sound=comparison.snapshot('x.snd','snd',{group:3,number:4});assert.match(sound.media,/^data:audio/);
   const animation=await comparison.animationSnapshot('live.air',{group:210});assert.strictEqual(animation.animation.frames[0].x,5);assert.match(animation.detail,/Unsaved AIR text/);assert.match(animation.detail,/shared.sff/);
   await comparison.openComparison('first.sff','sff',{group:0,number:0});choice='compare';
   assert.strictEqual(await comparison.openComparison('second.sff','sff',{group:1,number:2}),panel);
   assert.match(panel.webview.html,/Primary · SFF 1,2/);assert.match(panel.webview.html,/Reference · SFF 0,0/);
   await receive({type:'swap'});assert.match(panel.webview.html,/Reference · SFF 1,2/);
   choice='pin';await comparison.openComparison('replacement.sff','sff',{group:0,number:0});assert.match(panel.webview.html,/Reference · SFF 0,0/);assert.match(panel.webview.html,/replacement.sff/);
   const html=comparison.html({...sound,filename:'<unsafe>'},sound,'abc');assert(!html.includes('<unsafe>'));assert.match(html,/&lt;unsafe&gt;/);assert.doesNotThrow(()=>new Function(html.match(/<script nonce="abc">([\s\S]*)<\/script>/)[1]));assert.match(html,/other.pause/);
   const players=[0,1].map(()=>({paused:true,currentTime:0,pause(){this.paused=true;},play(){this.paused=false;this.onplay();}})),swap={};let posted;
   vm.runInNewContext(html.match(/<script nonce="abc">([\s\S]*)<\/script>/)[1],{acquireVsCodeApi:()=>({setState(){},postMessage:m=>posted=m}),document:{getElementById:()=>swap,querySelectorAll:()=>players}});
   players[0].play();assert.equal(players[0].paused,false);assert.equal(players[1].paused,true);
   players[0].currentTime=2.5;players[1].play();assert.equal(players[0].paused,true);assert.equal(players[1].paused,false);assert.equal(players[0].currentTime,2.5,'switching sides pauses without resetting the comparison position');
   players[0].play();assert.equal(players[1].paused,true);assert.equal(players[0].paused,false);
   swap.onclick();assert.equal(posted.type,'swap','keyboard/click activation uses the swap request');
   choice='clear';await comparison.openComparison('second.sff','sff',{});assert(disposed);
 }finally{Module._load=original;}
 console.log('Comparison saved selections, cross-file reference, swap, clear, stale items and safe HTML passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
