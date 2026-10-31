'use strict';

const assert=require('assert'),Module=require('module'),path=require('path');
const realParseAir=require('../src/air_preview_model').parseAir,original=Module._load;
Module._load=function(request,parent,main){
  if(request==='vscode')return{};
  if(request==='./air_viewer'&&/air_docking_workspace\.js$/.test(parent?.filename||''))return{parseAir:realParseAir,inferCharacterFiles:()=>({}),collisionRuntimeOptions:()=>({}),collisionRuntimeDraftEntries:()=>[]};
  return original.call(this,request,parent,main);
};
const {requestAirDocumentHistory}=require('../src/air_docking_workspace');Module._load=original;

(async()=>{
  const filename=path.resolve('C:/chars/Test/Test.air'),otherName=path.resolve('C:/chars/Other/Other.zss'),document={fileName:filename,isClosed:false},other={fileName:otherName,isClosed:false},record={disposed:false,unavailable:false,airSourceAvailable:true,bindingGeneration:7,data:{airPath:filename},panel:{viewColumn:2}},shown=[],commands=[];
  const workspace={textDocuments:[document,other],openTextDocument:async()=>{throw new Error('the already-open exact document should be reused');}},window={visibleTextEditors:[{document:other,viewColumn:1},{document,viewColumn:3}],showTextDocument:async(doc,options)=>{shown.push({doc,options});return{document:doc,viewColumn:options.viewColumn};}},commandService={executeCommand:async command=>{commands.push(command);}};
  const undo=await requestAirDocumentHistory(record,'undo',{workspace,window,commands:commandService});
  const redo=await requestAirDocumentHistory(record,'redo',{workspace,window,commands:commandService});
  assert(undo.ok&&redo.ok);assert.deepStrictEqual(commands,['undo','redo'],'history commands run only after the exact AIR editor is focused');
  assert.strictEqual(shown.length,2);for(const item of shown){assert.strictEqual(item.doc,document);assert.strictEqual(item.options.viewColumn,3);assert.strictEqual(item.options.preserveFocus,false);}
  const wrongWindow={...window,showTextDocument:async()=>({document:other,viewColumn:1})},before=commands.length,wrong=await requestAirDocumentHistory(record,'undo',{workspace,window:wrongWindow,commands:commandService});
  assert.strictEqual(wrong.ok,false);assert.match(wrong.message,/could not be focused/i);assert.strictEqual(commands.length,before,'a mismatched focused editor cannot receive AIR history');
  const originalGeneration=record.bindingGeneration,originalData=record.data,retargetWindow={...window,showTextDocument:async()=>{record.bindingGeneration++;record.data={airPath:otherName};return{document,viewColumn:3};}},retargeted=await requestAirDocumentHistory(record,'undo',{workspace,window:retargetWindow,commands:commandService});
  assert.strictEqual(retargeted.ok,false);assert.match(retargeted.message,/retargeted/i);assert.strictEqual(commands.length,before,'a retarget during source focus cannot mutate the formerly exact AIR document');record.bindingGeneration=originalGeneration;record.data=originalData;
  record.airSourceAvailable=false;const unavailable=await requestAirDocumentHistory(record,'redo',{workspace,window,commands:commandService});assert.strictEqual(unavailable.ok,false);assert.match(unavailable.message,/unavailable/i);assert.strictEqual(commands.length,before,'an unavailable AIR browser cannot dispatch late history');
  console.log('AIR browser Undo/Redo focuses and verifies the exact AIR source before dispatching editor history');
})().catch(error=>{console.error(error);process.exitCode=1;});
