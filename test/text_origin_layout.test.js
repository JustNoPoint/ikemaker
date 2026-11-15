'use strict';
const assert=require('node:assert/strict'),path=require('path');
const {splitOriginLayout,prepareOriginTextLayout,finishOriginTextLayout}=require('../src/text_origin_layout');
const {leafPaths}=require('../src/text_dropdown_layout');
const target=path.resolve('C:/owned/Exact.air');
const nativeTab=()=>({input:{uri:{fsPath:target}},isDirty:true});
async function run(column,cancelAfterSplit=false,floating=false){
 let current=true;
 const diff={input:{original:{fsPath:'C:/old'},modified:{fsPath:'C:/new'}},isDirty:true},sff={input:{viewType:'ikemenSffViewer'}},stage={input:{viewType:'ikemenStageViewer'}};
 const groups=[{viewColumn:1,tabs:[sff]},{viewColumn:2,tabs:[stage]},{viewColumn:3,tabs:[diff]}],origin=groups[column-1];origin.tabs.push(nativeTab());
 const originalGroups=[...groups];
 const otherGroups=groups.filter(group=>group!==origin),otherTabs=otherGroups.map(group=>[...group.tabs]);
 const doc={fileName:target,isDirty:true,isClosed:false,save(){throw Error('must not save');}},calls=[],state={groups,layout:{orientation:0,groups:[{size:400},{size:500},{size:600}]}};
 if(floating)state.layout.groups.pop();
 const headerTab={input:{viewType:'ikemenTextCompanion'}},panel={reveal(c){const destination=state.groups.find(group=>group.viewColumn===c);if(!destination.tabs.includes(headerTab))destination.tabs.push(headerTab);}};
 const api={Uri:{file:fsPath=>({fsPath})},workspace:{textDocuments:[doc],openTextDocument(){throw Error('reuse dirty exact buffer');}},commands:{async executeCommand(id,arg){calls.push(id);if(id==='vscode.getEditorLayout')return state.layout;if(id==='workbench.action.newGroupBelow'){state.groups.splice(column,0,{viewColumn:column+1,tabs:[]});state.groups.forEach((group,index)=>group.viewColumn=index+1);if(cancelAfterSplit)current=false;return;}if(id==='vscode.setEditorLayout'){state.layout=arg;return;}throw Error('Unexpected command '+id);}},window:{tabGroups:{get all(){return state.groups;},async close(tabs){if(!Array.isArray(tabs)){assert.equal(tabs.tabs.length,0);state.groups=state.groups.filter(group=>group!==tabs);state.groups.forEach((group,index)=>group.viewColumn=index+1);return true;}for(const tab of tabs){assert.equal(tab.input.uri.fsPath,target);for(const group of state.groups)group.tabs=group.tabs.filter(item=>item!==tab);}return true;}},async showTextDocument(document,options){assert.equal(document,doc);const group=state.groups.find(item=>item.viewColumn===options.viewColumn);if(!group.tabs.some(tab=>tab.input?.uri?.fsPath===target))group.tabs.push(nativeTab());return{document,viewColumn:group.viewColumn};}}};
 if(cancelAfterSplit){await assert.rejects(prepareOriginTextLayout(api,origin,target,()=>current),/did not open below/);assert.equal(state.groups.length,3);assert.deepEqual(state.groups,originalGroups);assert(!calls.includes('vscode.setEditorLayout'));return;}
 const prepared=await prepareOriginTextLayout(api,origin,target);
 assert.equal(prepared.headerColumn,column);assert.equal(prepared.nativeColumn,column+1);
 await finishOriginTextLayout(api,panel,prepared,target);
 assert.equal(state.groups.length,4);assert.equal(leafPaths(state.layout).length,floating?(column===3?2:3):4);
 assert(prepared.headerGroup.tabs.includes(headerTab));assert(prepared.nativeGroup.tabs.some(tab=>tab.input?.uri?.fsPath===target));
 for(let index=0;index<otherGroups.length;index++){assert(state.groups.includes(otherGroups[index]));assert.deepEqual(otherGroups[index].tabs,otherTabs[index]);}
 assert(state.groups.some(group=>group.tabs.includes(diff)));assert.equal(diff.isDirty,true);assert.equal(doc.isDirty,true);
 assert(!calls.includes('workbench.action.joinAllGroups'));if(floating&&column===3){assert(!calls.includes('vscode.setEditorLayout'));return;}assert.equal(state.layout.groups[column-1].groups[0].size,.28);assert.equal(state.layout.groups[column-1].groups[1].size,.72);
}
(async()=>{
 for(const column of [1,2,3])await run(column);
 await run(2,true);
 await run(1,false,true);
 await run(3,false,true);
 const vertical={orientation:1,groups:[{size:400},{size:600}]},split=splitOriginLayout(vertical,2);assert.equal(split.layout.orientation,1);assert.equal(split.layout.groups[0].size,400);assert(Math.abs(split.layout.groups[1].size-168)<1e-9);assert.equal(split.layout.groups[2].size,432);assert.equal(vertical.groups.length,2);
 const group={viewColumn:1,tabs:[]},api={window:{tabGroups:{all:[group]}},commands:{async executeCommand(id){assert.equal(id,'vscode.getEditorLayout');group.tabs.push({});return{orientation:0,groups:[{size:1}]};}}};
 await assert.rejects(prepareOriginTextLayout(api,group,target),/tabs changed/);
 const fs=require('fs'),source=fs.readFileSync(require.resolve('../src/text_editor_toolbar'),'utf8');assert(source.includes('preserveUnrelatedTabs:true'));assert(source.includes('scopedLayout:Boolean(scopedLayout)'));assert(source.includes('exactColumn:scopedLayout?.nativeColumn'));
 console.log('Origin-only text header splits left/middle/right regions, retains dirty/diff/Stage/SFF groups, exact dirty AIR and dynamic columns; race refuses before layout write.');
})().catch(error=>{console.error(error);process.exitCode=1;});
