'use strict';
const assert=require('assert');
const {run}=require('../src/trigger_expression_picker');
class Range{constructor(a,b,c,d){if(typeof a==='object'){this.start=a;this.end=b;}else{this.start={line:a,character:b};this.end={line:c,character:d};}}}
class SnippetString{constructor(value){this.value=value;}}
class WorkspaceEdit{constructor(){this.operations=[];}replace(uri,range,value){this.operations.push({uri,range,value});}}
function environment(options={}){
  let text='let value := placeholder;\n',version=1,applied=0,warning='',pick=0;const uri={toString:()=> 'file:/Ryu/normals.zss'};
  const document={uri,fileName:'C:/Ryu/normals.zss',languageId:'zss',get version(){return version;},getText:()=>text,getWordRangeAtPosition:()=>new Range(0,13,0,24)};
  const selection={isEmpty:true,active:{line:0,character:18},start:{line:0,character:18},end:{line:0,character:18}};
  const vscode={Range,SnippetString,WorkspaceEdit,window:{activeTextEditor:{document,selection},showQuickPick:async rows=>{pick+=1;if(options.cancelAt===pick)return undefined;if(pick===1)return rows.find(row=>row.label===(options.trigger||'Atan2'));return rows.find(row=>row.value===(options.argument||'dir'));},showInputBox:async()=>options.cancelInput?undefined:'time + 1',showInformationMessage:async(_message,detail)=>{if(options.changeDuringReview){text+='\n# changed';version++;}return detail?.modal?'Insert':undefined;},showWarningMessage:async message=>{warning=message;}},workspace:{applyEdit:async edit=>{applied++;const operation=edit.operations[0];text=`let value := ${operation.value.value};\n`;version++;return true;}}};
  let capabilityRead=0;const capabilities=()=>({targetBuildId:options.targetChange&&capabilityRead++?'nightly-b':'stable-a',enabledCapabilities:[]});
  return{vscode,capabilities,read:()=>({text,version,applied,warning})};
}
(async()=>{
  const accepted=environment();assert.strictEqual(await run(accepted.vscode,{},accepted.capabilities),true);assert.strictEqual(accepted.read().applied,1);assert.match(accepted.read().text,/Atan2\(\$\{1:/,'the reviewed signature enters the native document as editable snippet placeholders');
  const configured=environment({trigger:'EnvShakeVar',argument:'dir'});assert.strictEqual(await run(configured.vscode,{},configured.capabilities),true);assert.match(configured.read().text,/EnvShakeVar\(dir\)/,'a known alternative fills the one documented argument position');
  const cancelled=environment({trigger:'EnvShakeVar',cancelAt:2});assert.strictEqual(await run(cancelled.vscode,{},cancelled.capabilities),false);assert.strictEqual(cancelled.read().applied,0,'cancelling argument selection is a no-op');
  const stale=environment({changeDuringReview:true});await run(stale.vscode,{},stale.capabilities);assert.strictEqual(stale.read().applied,0);assert.match(stale.read().warning,/source changed/i,'a review-time source change blocks expression insertion');
  const targetChanged=environment({trigger:'EnvShakeVar',argument:'dir',targetChange:true});await run(targetChanged.vscode,{},targetChanged.capabilities);assert.strictEqual(targetChanged.read().applied,0);assert.match(targetChanged.read().warning,/exact project engine target changed/i,'target drift blocks insertion even when the selected value remains available');
  console.log('Trigger/expression picker applies one reviewed native edit and rejects stale source');
})().catch(error=>{console.error(error);process.exitCode=1;});
