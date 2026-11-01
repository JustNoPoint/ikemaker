'use strict';
const assert=require('assert'),Module=require('module'),vm=require('vm');
const originalLoad=Module._load;
Module._load=function(request,parent,isMain){if(request==='vscode')return{};return originalLoad.call(this,request,parent,isMain)};
const {page,sffBrowserControlAvailability}=require('../src/sff_browser');
Module._load=originalLoad;

const indexed={archiveIndex:0,id:'0,0',group:0,number:0,width:16,height:24,axisX:0,axisY:0,paletteIndex:0,link:null,format:'raw',colorDepth:8,flags:['favorite'],note:'',customName:'',references:[]};
const trueColor={archiveIndex:1,id:'0,1',group:0,number:1,width:16,height:24,axisX:0,axisY:0,paletteIndex:0,link:null,format:'png',colorDepth:32,flags:[],note:'',customName:'',references:[]};
const palette={index:0,group:1,number:1,colorCount:256,dataSize:1024,link:null,role:'master',spriteCount:1,colors:Array.from({length:256},(_,index)=>[index,index,index,255]),temporary:false,lifecycle:null};
const base={totalSprites:2,visibleGroups:1,visibleSprites:2,markedCount:1,flaggedCount:1,viewMode:'combined',paletteCount:1,selected:indexed};
let state=sffBrowserControlAvailability(base);
assert.strictEqual(state.markGroups.disabled,false);
assert.strictEqual(state.clearMarks.disabled,false);
assert.strictEqual(state.nextFlag.disabled,false);
assert.strictEqual(state.thumbSize.disabled,false);
assert.strictEqual(state.currentPalette.disabled,false);
assert.strictEqual(state.markedPalette.disabled,false);
assert.strictEqual(state.groupNarrow.disabled,false);
assert.strictEqual(state.groupWide.disabled,false);

state=sffBrowserControlAvailability({...base,visibleGroups:0,visibleSprites:0,markedCount:0,flaggedCount:0,viewMode:'list',paletteCount:0,selected:null});
assert.deepStrictEqual({disabled:state.markGroups.disabled,reason:state.markGroups.reason},{disabled:true,reason:'No groups match the current group filter.'});
assert.match(state.clearMarks.reason,/No sprites are marked/);
assert.match(state.markSprites.reason,/No sprites match/);
assert.match(state.nextFlag.reason,/No sprite has a review flag/);
assert.match(state.thumbSize.reason,/Choose Thumbnails or Combined/);
assert.match(state.currentPalette.reason,/Select a sprite first/);

state=sffBrowserControlAvailability({...base,groupWidth:20});
assert.strictEqual(state.groupNarrow.disabled,true);
assert.strictEqual(state.spriteWide.disabled,true);
assert.match(state.groupNarrow.reason,/minimum width/);
state=sffBrowserControlAvailability({...base,groupWidth:55});
assert.strictEqual(state.groupWide.disabled,true);
assert.strictEqual(state.spriteNarrow.disabled,true);
assert.match(state.spriteNarrow.reason,/minimum width/);
state=sffBrowserControlAvailability({...base,paletteCount:0,animationCount:1,stagedPaletteCount:0});
assert.strictEqual(state.paletteBrowse.disabled,true);
assert.strictEqual(state.paletteAnimation.disabled,true);
assert.strictEqual(state.finishPaletteBuild.disabled,true);
state=sffBrowserControlAvailability({...base,animationCount:0,stagedPaletteCount:1});
assert.match(state.paletteAnimation.reason,/No neighboring AIR animations/);
assert.strictEqual(state.finishPaletteBuild.disabled,false);

state=sffBrowserControlAvailability({...base,selected:trueColor});
assert.strictEqual(state.currentPalette.disabled,true);
assert.match(state.currentPalette.reason,/indexed sprite/);
state=sffBrowserControlAvailability({...base,markedCount:0});
assert.strictEqual(state.markedPalette.disabled,true);
assert.match(state.markedPalette.reason,/Mark one or more sprites/);

const html=page({filename:'Ryu.sff',title:'Ryu.sff',sprites:[indexed,trueColor],palettes:[palette],animations:[],history:{available:false},retainedState:{}});
for(const marker of ['role="tablist" aria-label="SFF Browser sections"','role="tab">Groups + Sprites','aria-label="Filter sprite groups"','aria-label="Filter sprites"','aria-label="Functional category"','aria-label="Custom name or comment"','aria-label="Review status"','aria-label="Sprite thumbnail size"','role="status" aria-live="polite"'])assert(html.includes(marker),`missing SFF Browser accessibility marker ${marker}`);
for(const marker of ['aria-label="SFF sprite groups"','aria-label="SFF sprites"','aria-label="Selected sprite details"','aria-label="Selected SFF Browser workspace"','@media(max-width:720px)','auditBrowserWorkspaceControls()','refreshPaneWidths','transferCopy.setAttribute(\'aria-description\''])assert(html.includes(marker),`missing SFF Browser closeout marker ${marker}`);
assert(!html.includes('aria-label="Group order"'),'the dead one-option Group order control is removed');
for(const marker of ["root.setAttribute('role','listbox')","b.setAttribute('role','option')","b.setAttribute('aria-current'","b.setAttribute('aria-selected'","event.key==='Home'","event.key==='End'","event.key==='ArrowRight'","rerenderControl(renderSprites,'spriteFilter')","beginBrowserItemFocus('sprite',key,event.currentTarget)","restoreBrowserItemFocus(focusTicket)"])assert(html.includes(marker),`missing SFF Browser generated behavior ${marker}`);
assert(html.includes("browserTabs.filter(item=>!item.hidden)"),'tab keyboard navigation excludes hidden Transfer-only tabs');
assert(html.includes("selectVisibleButton.textContent='Select All Visible'")&&html.includes("deleteMarkedButton.textContent='Delete Marked…'")&&html.includes("deleteGroupButton.textContent='Delete Group…'")&&html.includes("renameGroupButton.textContent='Renumber Group…'"),'the sprite list exposes visible-range selection, marked-batch deletion, whole-group deletion, and numeric group reassignment');
assert(html.includes("event.key.toLowerCase()==='a'")&&html.includes("if(event.key==='Delete'"),'Ctrl+A and Delete operate on the focused or visible SFF sprite batch');
assert(html.includes("['groupsSprites','details','combined'].includes(b.dataset.tab)?'browserBody':'workspaceMode'"),'each tab names its own primary or specialist panel rather than inheriting the currently selected target');

const rerenderSource=/function rerenderControl\([^\n]+/.exec(html)?.[0];
assert(rerenderSource,'generated client must contain rerenderControl');
let focused=0,selection=null;
const oldInput={id:'spriteFilter',selectionStart:3,selectionEnd:5},newInput={focus(){focused++},setSelectionRange(start,end){selection=[start,end]}};
const context={document:{activeElement:oldInput,getElementById:id=>id==='spriteFilter'?newInput:null}};
vm.createContext(context);vm.runInContext(rerenderSource,context);
let rendered=0;context.rerenderControl(()=>{rendered++},'spriteFilter');
assert.strictEqual(rendered,1);
assert.strictEqual(focused,1,'filter rerender restores the exact initiating control');
assert.deepStrictEqual(selection,[3,5],'filter rerender restores the caret range');
context.document.activeElement={id:'outside'};context.rerenderControl(()=>{rendered++},'spriteFilter');
assert.strictEqual(focused,1,'filter rerender never steals focus from another control');

const beginFocusSource=/function beginBrowserItemFocus\([^\n]+/.exec(html)?.[0];
const restoreFocusSource=/function restoreBrowserItemFocus\([^\n]+/.exec(html)?.[0];
assert(beginFocusSource&&restoreFocusSource,'generated client must contain the production item-focus ownership helpers');
function focusHarness(){
  const callbacks=[],targets=new Map(),body={id:'rendered-body'};
  const harness={
    CSS:{escape:value=>value},
    document:{
      activeElement:null,
      querySelector(selector){return targets.get(selector)||null}
    },
    requestAnimationFrame(callback){callbacks.push(callback)}
  };
  vm.createContext(harness);
  vm.runInContext('let browserFocusGeneration=0;'+beginFocusSource+restoreFocusSource,harness);
  return{harness,callbacks,targets,body,target(kind,key){
    const selector='[data-sff-'+kind+'="'+key+'"]',element={focusCount:0,focus(){this.focusCount++;harness.document.activeElement=this}};
    targets.set(selector,element);
    return element;
  }};
}

{
  const run=focusHarness(),opener={id:'sprite-opener'},target=run.target('sprite','7');
  run.harness.document.activeElement=opener;
  const ticket=run.harness.beginBrowserItemFocus('sprite','7',opener);
  run.harness.document.activeElement=run.body;
  run.harness.restoreBrowserItemFocus(ticket);
  assert.strictEqual(run.callbacks.length,1,'owned item focus queues one animation-frame restoration');
  run.callbacks.shift()();
  assert.strictEqual(target.focusCount,1,'unchanged post-render focus restores to the replacement item');
}
{
  const run=focusHarness(),opener={id:'sprite-opener'},target=run.target('sprite','8'),outside={id:'outside'};
  run.harness.document.activeElement=opener;
  const ticket=run.harness.beginBrowserItemFocus('sprite','8',opener);
  run.harness.document.activeElement=run.body;
  run.harness.restoreBrowserItemFocus(ticket);
  run.harness.document.activeElement=outside;
  run.callbacks.shift()();
  assert.strictEqual(target.focusCount,0,'an intervening unrelated focus move is never stolen');
  assert.strictEqual(run.harness.document.activeElement,outside);
}
{
  const run=focusHarness(),firstOpener={id:'first'},secondOpener={id:'second'},firstBody={id:'first-body'},secondBody={id:'second-body'},firstTarget=run.target('sprite','9'),secondTarget=run.target('sprite','10');
  run.harness.document.activeElement=firstOpener;
  const firstTicket=run.harness.beginBrowserItemFocus('sprite','9',firstOpener);
  run.harness.document.activeElement=firstBody;
  run.harness.restoreBrowserItemFocus(firstTicket);
  run.harness.document.activeElement=secondOpener;
  const secondTicket=run.harness.beginBrowserItemFocus('sprite','10',secondOpener);
  run.harness.document.activeElement=secondBody;
  run.harness.restoreBrowserItemFocus(secondTicket);
  run.callbacks.shift()();
  assert.strictEqual(firstTarget.focusCount,0,'a superseded callback cannot restore its stale item');
  run.callbacks.shift()();
  assert.strictEqual(secondTarget.focusCount,1,'the latest owned interaction may restore its item');
}

console.log('SFF Browser actionable states, semantics, owned async focus, and palette gates passed');
