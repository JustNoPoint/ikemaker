'use strict';

const assert=require('assert'),Module=require('module'),path=require('path');

(async()=>{
  const original=Module._load;
  Module._load=function(request,parent,main){
    if(request==='vscode')return{window:{},workspace:{getConfiguration:()=>({get:(_key,fallback)=>fallback})},env:{uiKind:1},UIKind:{Web:2},Uri:{file:fsPath=>({fsPath})}};
    return original.call(this,request,parent,main);
  };
  let sff;
  try{sff=require('../src/sff_viewer');}finally{Module._load=original;}

  const first=path.resolve('C:/chars/First/first.sff'),second=path.resolve('C:/chars/Second/second.sff'),panel={dispose(){this.disposed=true;}},occupied={other:true},owner={panel,filename:first,transferPinned:false,disposed:false,unavailable:false,assetHistory:{undo:[{id:'axis-edit'}],redo:[]}};
  const lookup={panelFor:()=>panel,ownerFor:()=>owner},before=sff.sffViewerHistoryState(first,lookup),updates=[];
  await assert.rejects(
    ()=>sff.populateSffPanel(panel,second,{}, {ownerFor:()=>owner,panelFor:()=>occupied,publishOwnerUnavailable:(...args)=>{updates.push(args);return true;}}),
    /another ordinary viewer open/
  );
  assert.strictEqual(owner.filename,first,'an occupied-destination failure leaves the live owner on its original SFF');
  assert.deepStrictEqual(sff.sffViewerHistoryState(first,lookup),before,'the original SFF Undo/Redo availability remains unchanged');
  assert.deepStrictEqual(updates,[],'the failed retarget never publishes an unavailable state for the original SFF');
  console.log('Failed SFF destination adoption preserves the original exact viewer history state');
})().catch(error=>{console.error(error);process.exitCode=1;});
