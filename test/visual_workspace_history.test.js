'use strict';

const assert=require('assert');
const historyApi=require('../src/visual_workspace_history');

(async()=>{
  const history=new historyApi.VisualWorkspaceHistory({maxEntries:3});
  assert.deepStrictEqual(history.state(),{canUndo:false,canRedo:false,busy:false,undoLabel:'',redoLabel:''});
  assert(historyApi.controlsHtml(history.state()).includes('id="visualWorkspaceUndo"'));
  assert.doesNotThrow(()=>new Function(historyApi.controlsClientScript()),'shared generated history client script compiles');
  assert.strictEqual(historyApi.validMessage({type:historyApi.MESSAGE_TYPE,generation:2,action:'undo'},2),true);
  assert.strictEqual(historyApi.validMessage({type:historyApi.MESSAGE_TYPE,generation:2,action:'undo',source:'forged'},2),false,'history messages reject client-authored source data');

  history.record('one','two','first edit');
  let current='two',writes=[];
  const operations={read:async()=>current,isActive:()=>true,write:async(next,label)=>{writes.push({next,label});current=next;}};
  await history.apply('undo',operations);assert.strictEqual(current,'one');assert.deepStrictEqual(history.state(),{canUndo:false,canRedo:true,busy:false,undoLabel:'',redoLabel:'first edit'});
  await history.apply('redo',operations);assert.strictEqual(current,'two');assert.strictEqual(history.state().canUndo,true);
  const failedState=history.state();await assert.rejects(()=>history.apply('undo',{...operations,write:async()=>{throw new Error('writer failed')}}),/writer failed/);assert.deepStrictEqual(history.state(),failedState,'a failed owning writer does not move the committed history cursor');assert.strictEqual(current,'two');
  await history.apply('undo',operations);history.record('one','three','replacement edit');assert.strictEqual(history.state().canRedo,false,'a new committed write clears redo');
  current='external';const before=writes.length;await assert.rejects(()=>history.apply('undo',operations),/source changed/);assert.strictEqual(writes.length,before,'hash mismatch is rejected before writing');
  current='three';await assert.rejects(()=>history.apply('undo',{...operations,isActive:()=>false}),/no longer owns/);
  assert.throws(()=>history.prepare('x','y',''),/bounded mutation label/);
  assert.throws(()=>history.prepare('x'.repeat(historyApi.MAX_SNAPSHOT_CHARS+1),'y','large'),/too large/);
  console.log('Shared visual workspace committed Undo/Redo model, bounds, authority, and generated client tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
