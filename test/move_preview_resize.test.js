'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const source=fs.readFileSync(path.join(__dirname,'../src/move_constants_workspace.js'),'utf8');
const canvas={width:960,height:540,clientWidth:240,clientHeight:350};let updates=0,saves=0;
const sandbox={$:()=>canvas,opponentWorldX:40,opponentWorldY:-1,viewportWidth:960,viewportHeight:540,renderOpponentControls:()=>updates++,saveState:()=>saves++};
const start=source.indexOf('function resizePreviewCanvas('),end=source.indexOf('function fitView(',start);
vm.runInNewContext(source.slice(start,end),sandbox);
assert.strictEqual(sandbox.resizePreviewCanvas(),true);
assert.deepStrictEqual([canvas.width,canvas.height],[240,350]);
assert.strictEqual(canvas.width/canvas.clientWidth,canvas.height/canvas.clientHeight,'CSS must scale both axes equally');
assert.strictEqual(sandbox.opponentWorldX,40);
assert.strictEqual(sandbox.opponentWorldY,-1);
assert.strictEqual(sandbox.resizePreviewCanvas(),false);assert.strictEqual(saves,1);assert.strictEqual(updates,1);
canvas.clientWidth=800;canvas.clientHeight=600;sandbox.resizePreviewCanvas();
assert.deepStrictEqual([canvas.width,canvas.height],[800,600]);
assert.strictEqual(sandbox.opponentWorldX,40);assert.strictEqual(sandbox.opponentWorldY,-1);
canvas.clientWidth=0;canvas.clientHeight=0;assert.strictEqual(sandbox.resizePreviewCanvas(),false);
assert.deepStrictEqual([canvas.width,canvas.height],[800,600],'hidden views must preserve their last usable size');
// A restored viewport can differ from the canvas HTML defaults without moving P2 twice.
canvas.width=960;canvas.height=540;canvas.clientWidth=800;canvas.clientHeight=600;
assert.strictEqual(sandbox.resizePreviewCanvas(),true);assert.strictEqual(sandbox.opponentWorldX,40);assert.strictEqual(sandbox.opponentWorldY,-1);
// Pointer mapping uses the same rendered canvas dimensions as drawing.
canvas.getBoundingClientRect=()=>({left:20,top:30,width:800,height:600});sandbox.canvas=canvas;
const pointStart=source.indexOf('function canvasPoint('),pointEnd=source.indexOf('function overOpponent(',pointStart);
vm.runInNewContext(source.slice(pointStart,pointEnd),sandbox);
const point=sandbox.canvasPoint({clientX:120,clientY:130});assert.deepStrictEqual([point.x,point.y,point.dx,point.dy],[100,100,1,1]);
console.log('JNP canvas resize preserves proportions, opponent world coordinates and pointer coordinates');
