'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const Module=require('module');
const originalLoad=Module._load;
Module._load=function(request,parent,main){if(request==='vscode')return{Uri:{file:fsPath=>({fsPath})},ViewColumn:{One:1,Beside:2},ConfigurationTarget:{WorkspaceFolder:1},commands:{executeCommand:async()=>false},workspace:{getConfiguration:()=>({get:(_key,fallback)=>fallback,update:async()=>{}})},window:{tabGroups:{activeTabGroup:{viewColumn:1}},showOpenDialog:async()=>undefined,showSaveDialog:async()=>undefined,showInputBox:async()=>undefined,showWarningMessage:async()=>undefined,showInformationMessage:async()=>undefined}};return originalLoad.call(this,request,parent,main)};
const {templateDecorationHistoryPush,templateDecorationHistoryStep}=require('../src/palette_workspace_controller');

const view=fs.readFileSync(path.join(__dirname,'..','src','palette_workspace_view.js'),'utf8');
const controller=fs.readFileSync(path.join(__dirname,'..','src','palette_workspace_controller.js'),'utf8');

assert.match(view,/Each single click adds a connected segment/,'the canvas explains connected separator drawing');
assert.match(view,/Double-click to finish the chain/,'the canvas explains the terminal gesture');
assert.match(view,/Click in the gutter or canvas to start/,'the separator tool exposes an outside-canvas drawing gutter');
assert.match(view,/including the fresh 10-pixel save margin, without enlarging the canvas/,'the edge-reaching behavior is explained in the tool');
assert.match(view,/extendStart:segments\.length===0&&start\.outside===true/,'an outside chain start is retained for final edge extension');
assert.match(view,/extendEnd:end\.outside===true/,'an outside chain finish is retained for final edge extension');
assert.match(view,/svg\.ondblclick=[\s\S]{0,160}finish\(\)/,'double-click finishes the retained chain');
assert.match(view,/svg\.oncontextmenu=[\s\S]{0,220}setArmed\(false\)/,'right-click cancels the unfinished chain');
assert.match(view,/event\.key==='Escape'[\s\S]{0,180}setArmed\(false\)/,'Escape cancels the unfinished chain');
assert.match(view,/post\('templateBorderLinesAdd',[\s\S]{0,180}lines:payload/,'the complete chain is sent as one atomic request');
assert.match(view,/id='undoTemplateBorders'/,'separator controls expose Undo');
assert.match(view,/id='redoTemplateBorders'/,'separator controls expose Redo');
assert.match(view,/key==='y'\|\|key==='z'&&event\.shiftKey/,'Ctrl+Y and Ctrl+Shift+Z both redo');
assert.match(view,/key==='z'&&!event\.shiftKey/,'Ctrl+Z undoes separator history');
assert.match(controller,/action==='templateBorderLinesAdd'/,'the host owns the connected-chain route');
assert.match(controller,/requested\.map[\s\S]{0,1000}line\.x1===line\.x2&&line\.y1===line\.y2/,'every segment is bounded and zero-length segments fail closed');
assert.match(controller,/before=session\.organizer\?\.templateDecorations\?\.lines\|\|\[\],lines=\[\.\.\.before,\.\.\.additions\]/,'all connected segments enter one retained mutation');

const first={x1:0,y1:0,x2:4,y2:0,thickness:1,groupId:'body'},second={x1:4,y1:0,x2:4,y2:5,thickness:1,groupId:'body'};
let session={organizer:{templateDecorationHistory:templateDecorationHistoryPush({organizer:{}},[],[first,second],'Draw separator chain (2 segments)')}};
let step=templateDecorationHistoryStep(session,'undo');
assert.deepStrictEqual(step.lines,[],'one Undo removes the entire connected chain');
session={organizer:{templateDecorationHistory:step.history}};step=templateDecorationHistoryStep(session,'redo');
assert.deepStrictEqual(step.lines,[first,second],'one Redo restores the entire connected chain');
assert.throws(()=>templateDecorationHistoryStep({organizer:{}},'undo'),/No separator change/,'empty history fails without changing the canvas');

Module._load=originalLoad;

console.log('Palette template separator tool retains connected turns until double-click and saves one bounded chain');
