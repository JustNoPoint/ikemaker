'use strict';

const assert=require('assert');
const Module=require('module');
const vm=require('vm');
const original=Module._load;
Module._load=function(request,parent,main){if(request==='vscode')return{window:{},workspace:{},commands:{},ViewColumn:{},Position:class{},Range:class{},WorkspaceEdit:class{}};return original.call(this,request,parent,main)};
const workspace=require('../src/move_constants_workspace');
Module._load=original;

const empty=workspace.moveConstantsControlAvailability({});
assert.strictEqual(empty.play.enabled,false);
assert.match(empty.play.reason,/No AIR frames/);
assert.strictEqual(empty.airWorkspace.enabled,false);
assert.match(empty.airWorkspace.reason,/No AIR file/);
assert.strictEqual(empty.moveOverview.enabled,false);
assert.match(empty.moveOverview.reason,/Select a constants-backed move/);
assert.strictEqual(empty.openAir.enabled,false);
assert.strictEqual(empty['mode:normal'].enabled,false);
assert.strictEqual(empty.moveQuickPrevious.enabled,false);
assert.match(empty.moveQuickPrevious.reason,/No constants-backed moves/);
assert.strictEqual(empty.refresh.enabled,true);
assert.strictEqual(empty.launch.enabled,false,'the removed duplicate live-preview control remains honestly classified');

const first=workspace.moveConstantsControlAvailability({hasMove:true,frameCount:3,moveCount:3,moveIndex:0,reactionCount:2,hasAir:true,hasConstants:true,hasSpark:true});
assert.strictEqual(first.play.enabled,true);
assert.strictEqual(first.previous.enabled,true,'AIR element navigation intentionally wraps');
assert.strictEqual(first.moveQuickPrevious.enabled,false);
assert.match(first.moveQuickPrevious.reason,/first/);
assert.strictEqual(first.moveQuickNext.enabled,true);
assert.strictEqual(first.reactionAction.enabled,true);
assert.strictEqual(first.findSpark.enabled,true);

const last=workspace.moveConstantsControlAvailability({hasMove:true,frameCount:1,moveCount:3,moveIndex:2,reactionCount:0,hasAir:true,hasConstants:true});
assert.strictEqual(last.previous.enabled,false);
assert.match(last.previous.reason,/only one element/);
assert.strictEqual(last.moveQuickNext.enabled,false);
assert.match(last.moveQuickNext.reason,/last/);
assert.strictEqual(last.reactionAction.enabled,false);
assert.match(last.reactionAction.reason,/get-hit AIR action/);
assert.strictEqual(last.findSpark.enabled,false);
assert.match(last.findSpark.reason,/no authored hit spark/);

const oneMove=workspace.moveConstantsControlAvailability({hasMove:true,moveCount:1,moveIndex:0});
assert.strictEqual(oneMove.moveStateScroll.enabled,false);
assert.match(oneMove.moveStateScroll.reason,/Only one/);

const page=workspace.html({character:'Ryu',files:{defPath:'C:/Ryu/Ryu.def',air:'C:/Ryu/Ryu.air',constants:'C:/Ryu/constants.zss'},fileStatus:[],moves:[{id:'normal.slp',prefix:'normal.sLP',values:{moveID:200},fields:[],timeline:{actionNumber:200,frames:[]},images:{},reactionPreviews:[],contactProfile:[],problems:[],codeSections:[]}],overview:{problems:[],constantProfiles:[],controllers:[],behaviors:[],specialists:[]},behaviorComponents:[],specialistComponents:[],directComponents:[],formDrafts:{},codeDrafts:{}});
assert.match(page,/id="moveList"[^>]*role="listbox"/);
assert.match(page,/id="timeline"[^>]*role="listbox"/);
assert.match(page,/id="canvas"[^>]*tabindex="0"[^>]*role="application"/);
assert.match(page,/id="status"[^>]*role="status"[^>]*aria-live="polite"/);
assert.match(page,/role="option" aria-selected/);
assert.match(page,/ArrowDown/);
assert.match(page,/aria-description/);
assert.match(page,/@media\(max-width:650px\)/);
assert.doesNotThrow(()=>new Function(page.match(/<script>([\s\S]*)<\/script>/)[1]));

const document={activeElement:null};
function row(id,selected=false){const attributes={'aria-selected':String(selected)};return{id,dataset:{move:id},hidden:false,tabIndex:-1,clicked:false,getAttribute(name){return attributes[name]??null},setAttribute(name,value){attributes[name]=String(value)},focus(){document.activeElement=this},click(){this.clicked=true}}}
const firstRow=row('normal.slp'),selectedRow=row('normal.shp',true),list={dataset:{},tabIndex:-1,rows:[firstRow,selectedRow],listeners:{},querySelectorAll(selector){return selector==='[data-move]'?this.rows:[]},addEventListener(type,listener){this.listeners[type]=listener}};
const search={id:'moveSearch',focus(){document.activeElement=this}};document.activeElement=search;
const retainedMove={id:'normal.shp'},clientContext={document,move:retainedMove,$:id=>id==='moveList'?list:null};
vm.runInNewContext(workspace.moveConstantsAccessibilityClientScript(),clientContext);
clientContext.syncMoveConstantsMoveListAccessibility();
assert.strictEqual(selectedRow.tabIndex,0,'visible logical selection owns the move-list tab stop');
assert.strictEqual(firstRow.tabIndex,-1);
assert.strictEqual(document.activeElement,search,'initial accessibility sync does not steal focus from search');

list.rows=[firstRow];
clientContext.syncMoveConstantsMoveListAccessibility();
assert.strictEqual(clientContext.move,retainedMove,'the filter projection does not replace logical move state');
assert.strictEqual(firstRow.tabIndex,0,'first visible match is the fallback tab stop when the retained selection is filtered out');
assert.strictEqual(document.activeElement,search,'filtering does not steal focus from search');
let prevented=false;list.listeners.keydown({key:'Home',preventDefault(){prevented=true}});
assert(prevented);assert.strictEqual(document.activeElement,firstRow,'keyboard navigation reaches the fallback row');
list.listeners.keydown({key:'Enter',preventDefault(){}});
assert.strictEqual(firstRow.clicked,true,'keyboard activation invokes the visible fallback move');

document.activeElement=search;list.rows=[];clientContext.syncMoveConstantsMoveListAccessibility();
assert.strictEqual(list.tabIndex,0,'an empty result leaves the named listbox reachable');
assert.strictEqual(document.activeElement,search,'empty results do not steal search focus');

list.rows=[firstRow,selectedRow];clientContext.syncMoveConstantsMoveListAccessibility();
assert.strictEqual(selectedRow.tabIndex,0,'the retained selected move recovers its tab stop when visible again');
assert.strictEqual(firstRow.tabIndex,-1);assert.strictEqual(document.activeElement,search,'selection recovery does not steal search focus');

console.log('Move Constants availability, reasons, keyboard semantics, and narrow source contract tests passed');
