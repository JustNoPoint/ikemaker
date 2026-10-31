'use strict';

const assert=require('assert');
const path=require('path');
const {digest}=require('../src/character_scale_review_model');
const {applyReviewedWorkspaceEditBatch}=require('../src/reviewed_workspace_edit_batch');

function document(filename,text){return{fileName:filename,uri:{fsPath:filename},version:1,isDirty:false,isClosed:false,getText(){return text;},positionAt(offset){return{offset};},offsetAt(position){return position.offset;},set(value){text=value;this.version+=1;this.isDirty=true;}};}
class WorkspaceEdit{constructor(){this.items=[];}replace(uri,range,replacement){this.items.push({uri,range,replacement});}}
class Range{constructor(start,end){this.start=start;this.end=end;}}
(async()=>{
  const a=document(path.resolve('a.cns'),'pos = 10, 20\nscale = 1, 1\n'),b=document(path.resolve('b.zss'),'pos: 2, 3;\n'),docs=new Map([[a.fileName,a],[b.fileName,b]]),calls=[];
  const vscode={Range,WorkspaceEdit,workspace:{openTextDocument:async filename=>docs.get(path.resolve(filename)),applyEdit:async edit=>{calls.push(edit);for(const item of edit.items){const doc=[...docs.values()].find(value=>value.uri===item.uri),before=doc.getText(),start=item.range.start.offset,end=item.range.end.offset;doc.set(before.slice(0,start)+item.replacement+before.slice(end));}return true;}}};
  const source=(doc,patches)=>({sourcePath:doc.fileName,sourceHash:digest(doc.getText()),open:true,dirty:false,version:1,patches});
  const batch={schema:'ikemaker.reviewed-workspace-edit-batch',version:1,sources:[source(a,[{start:6,end:12,before:'10, 20',replacement:'20, 10'}]),source(b,[{start:5,end:9,before:'2, 3',replacement:'4, 1.5'}])]};
  const result=await applyReviewedWorkspaceEditBatch(vscode,batch);assert.strictEqual(calls.length,1);assert.strictEqual(result.patches,2);assert.strictEqual(result.saved,false);assert.match(a.getText(),/20, 10/);assert.match(b.getText(),/4, 1\.5/);
  const stale=document(path.resolve('stale.cns'),'pos = 1, 2\n'),staleVscode={...vscode,workspace:{...vscode.workspace,openTextDocument:async()=>stale,applyEdit:async()=>{throw new Error('must not apply');}}};
  await assert.rejects(()=>applyReviewedWorkspaceEditBatch(staleVscode,{schema:'ikemaker.reviewed-workspace-edit-batch',version:1,sources:[{sourcePath:stale.fileName,sourceHash:digest('different'),open:true,dirty:false,version:1,patches:[{start:6,end:10,before:'1, 2',replacement:'2, 4'}]}]}),/changed after review/);
  const authority=document(path.resolve('fighter.def'),'[Files]\ncns = constants.cns\n'),target=document(path.resolve('target.cns'),'pos = 1, 2\n'),authorityDocs=new Map([[authority.fileName,authority],[target.fileName,target]]),authorityCalls=[];
  const authorityVscode={Range,WorkspaceEdit,workspace:{openTextDocument:async filename=>authorityDocs.get(path.resolve(filename)),applyEdit:async edit=>{authorityCalls.push(edit);return true;}}};
  await assert.rejects(()=>applyReviewedWorkspaceEditBatch(authorityVscode,{schema:'ikemaker.reviewed-workspace-edit-batch',version:1,authorities:[{sourcePath:authority.fileName,sourceHash:digest(authority.getText()),open:true,dirty:false,version:1}],sources:[{sourcePath:target.fileName,sourceHash:digest(target.getText()),open:true,dirty:false,version:1,patches:[{start:6,end:10,before:'1, 2',replacement:'2, 4'}]}]},{verifyAuthority:()=>false}),/ownership or assignment/);
  assert.strictEqual(authorityCalls.length,0,'authority failure blocks the one edit before applyEdit');
  console.log('Reviewed scale edit batch is atomic, stale-safe, unsaved, and one WorkspaceEdit');
})().catch(error=>{console.error(error);process.exitCode=1;});
