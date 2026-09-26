'use strict';
const assert=require('assert'),vm=require('vm');const {clientScript}=require('../src/hitdef_drafts');
const events={},messages={},sent=[],elements={apply:{},new:{},groups:{before:element=>elements[element.id]=element}};
let state={zoom:3},row;
function fields(value='30'){const check={checked:true},input={value};row={dataset:{option:'damage'},querySelector:type=>type.includes('checkbox')?check:input};return row;}
fields();
const context={model:{file:'C:/A.cns',currentIndex:0,sourceHash:'base'},vscode:{getState:()=>state,setState:value=>state=value,postMessage:message=>sent.push(message)},parameters:()=>[{name:'damage',enabled:row.querySelector('checkbox').checked,value:row.querySelector('text').value}],document:{addEventListener:(type,fn)=>events[type]=fn,querySelectorAll:()=>[row],getElementById:id=>elements[id],createElement:()=>({setAttribute(){},append(button){this.button=button;}})},window:{addEventListener:(type,fn)=>messages[type]=fn},render:()=>{fields();context.ikemenRestoreHitdefDraft();}};
vm.createContext(context);vm.runInContext(clientScript(),context);
const edit=value=>{row.querySelector('text').value=value;events.input({target:{closest:()=>row}});};
context.ikemenRestoreHitdefDraft();edit('40');assert(context.ikemenCanKeepDraft());assert.equal(sent.at(-1).draft.fields[0].value,'40');assert.equal(state.zoom,3);
fields();context.ikemenRestoreHitdefDraft();assert.equal(row.querySelector('text').value,'40','rerender retains draft');
context.model={file:'C:/B.cns',currentIndex:0,sourceHash:'other'};fields('10');context.ikemenRestoreHitdefDraft();assert.equal(row.querySelector('text').value,'10');edit('20');
context.model={file:'C:/A.cns',currentIndex:0,sourceHash:'changed'};fields();context.ikemenRestoreHitdefDraft();assert.equal(row.querySelector('text').value,'40');assert(elements.apply.disabled);edit('45');assert.equal(sent.at(-1).draft.base,'base','editing a conflicting draft must not bless it with a new source hash');assert(elements.new.disabled);
elements.hitdefDraftStatus.button.onclick();assert.equal(row.querySelector('text').value,'30');assert(!elements.apply.disabled);assert.equal(sent.at(-1).type,'hitdefDiscardDraft');
edit('50');const submitted=JSON.parse(JSON.stringify(sent.at(-1).draft));edit('60');messages.message({data:{type:'hitdefDraftApplied',key:'c:/a.cns#0',draft:submitted}});fields();context.ikemenRestoreHitdefDraft();assert.equal(row.querySelector('text').value,'60','later input survives acknowledgement');
const latest=JSON.parse(JSON.stringify(sent.at(-1).draft));messages.message({data:{type:'hitdefDraftApplied',key:'c:/a.cns#0',draft:latest}});assert(context.ikemenCanLeaveAsset());assert(!context.ikemenCanKeepDraft());assert(state.hitdefDrafts['c:/b.cns#0']);
console.log('HitDef drafts survive rerender and context switches, block stale-source Apply, discard explicitly, and retain typing after an older Apply');
