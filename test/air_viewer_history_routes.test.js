'use strict';

const assert=require('assert'),Module=require('module'),path=require('path'),original=Module._load;
Module._load=function(request,parent,main){if(request==='vscode')return{};return original.call(this,request,parent,main);};
const {requestAirViewerHistory}=require('../src/air_viewer');Module._load=original;

(async()=>{
  const filename=path.resolve('C:/chars/Test/Test.air'),otherName=path.resolve('C:/chars/Other/Other.air'),document={fileName:filename,isClosed:false,getText:()=>''},other={fileName:otherName,isClosed:false,getText:()=>''},session={airPath:filename,bindingGeneration:4,disposed:false,unavailable:false,sourceMutationBusy:false,sourceSaveBusy:false},commands=[],workspace={textDocuments:[document],openTextDocument:async()=>document},window={showTextDocument:async doc=>({document:doc}),activeTextEditor:{document}},commandService={executeCommand:async command=>commands.push(command)};
  const undo=await requestAirViewerHistory(session,'undo',{workspace,window,commands:commandService});const redo=await requestAirViewerHistory(session,'redo',{workspace,window,commands:commandService});assert(undo.ok&&redo.ok);assert.deepStrictEqual(commands,['undo','redo']);
  const before=commands.length,wrong=await requestAirViewerHistory(session,'undo',{workspace,window:{showTextDocument:async()=>({document:other}),activeTextEditor:{document:other}},commands:commandService});assert.strictEqual(wrong.ok,false);assert.strictEqual(commands.length,before,'a mismatched active editor cannot receive AIR Viewer history');
  const generation=session.bindingGeneration,airPath=session.airPath,retarget=await requestAirViewerHistory(session,'redo',{workspace,window:{showTextDocument:async()=>{session.bindingGeneration++;session.airPath=otherName;return{document};},activeTextEditor:{document}},commands:commandService});assert.strictEqual(retarget.ok,false);assert.match(retarget.reason,/retargeted/i);assert.strictEqual(commands.length,before,'a retarget during focus cannot mutate the formerly exact AIR source');session.bindingGeneration=generation;session.airPath=airPath;
  session.sourceMutationBusy=true;const busy=await requestAirViewerHistory(session,'undo',{workspace,window,commands:commandService});assert.strictEqual(busy.ok,false);assert.match(busy.reason,/busy/i);assert.strictEqual(commands.length,before);session.sourceMutationBusy=false;
  console.log('AIR Viewer Undo/Redo verifies the exact current AIR editor and rejects busy, mismatched, and retargeted routes');
})().catch(error=>{console.error(error);process.exitCode=1;});
