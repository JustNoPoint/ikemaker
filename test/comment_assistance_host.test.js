'use strict';
const assert=require('assert');
const {run}=require('../src/comment_assistance');
class Position{constructor(line,character){this.line=line;this.character=character;}}
class Range{constructor(startLine,startCharacter,endLine,endCharacter){this.start={line:startLine,character:startCharacter};this.end={line:endLine,character:endCharacter};}}
class WorkspaceEdit{constructor(){this.operations=[];}insert(uri,position,text){this.operations.push({kind:'insert',uri,position,text});}replace(uri,range,text){this.operations.push({kind:'replace',uri,range,text});}}
function environment(options={}){
  let text=options.text||'[Function Commit(value)]\nlet result := value;\n',version=1,applied=0,warning='',information='';
  const uri={toString:()=> 'file:/Ryu/normals.zss'},document={uri,fileName:'C:/Ryu/normals.zss',languageId:'zss',get version(){return version;},getText:()=>text};
  const line=Number.isInteger(options.line)?options.line:1,selection={isEmpty:true,active:{line,character:0},start:{line,character:0}};
  const vscode={Position,Range,WorkspaceEdit,window:{activeTextEditor:{document,selection},showQuickPick:async choices=>options.pickId?choices.find(item=>item.id===options.pickId):choices[0],showInputBox:async()=> options.input||'Commits the reviewed value.',showInformationMessage:async(message,detail)=>{information=message;if(options.changeDuringReview){text+='\n# changed';version++;}return detail?.modal?'Insert Comment':undefined;},showWarningMessage:async message=>{warning=message;}},workspace:{getConfiguration:()=>({get:()=>options.mode||'manual'}),applyEdit:async edit=>{applied++;const operation=edit.operations[0],lines=text.split('\n');if(operation.kind==='insert')lines.splice(operation.position.line,0,...operation.text.replace(/\n$/,'').split('\n'));else lines.splice(operation.range.start.line,operation.range.end.line-operation.range.start.line,...operation.text.replace(/\n$/,'').split('\n'));text=lines.join('\n');version++;return true;}}};
  return{vscode,read:()=>({text,version,applied,warning,information})};
}
(async()=>{
  const accepted=environment();assert.strictEqual(await run(accepted.vscode),true);const result=accepted.read();assert.strictEqual(result.applied,1);assert(result.text.startsWith('# Function Commit(value): Commits the reviewed value.\n# @param value — TODO: describe value.\n[Function'));
  const stale=environment({changeDuringReview:true});await run(stale.vscode);assert.strictEqual(stale.read().applied,0);assert.match(stale.read().warning,/source changed/i,'a review-time source change blocks the edit');
  const signature=environment({pickId:'update-parameters',line:3,text:'# Commit purpose.\n# @param old — old.\n[Function Commit(value)]\nlet x := value;\n'});assert.strictEqual(await run(signature.vscode),true);assert(signature.read().text.includes('# @param value — TODO: describe value.')&&!signature.read().text.includes('@param old'),'signature reconciliation is one reviewed replacement edit');
  const disabled=environment({mode:'off'});await run(disabled.vscode);assert.strictEqual(disabled.read().applied,0);assert.match(disabled.read().information,/disabled for this workspace/i,'the workspace setting suppresses the complete comment authoring route');
  console.log('Comment assistance applies one reviewed native edit and rejects stale source');
})().catch(error=>{console.error(error);process.exitCode=1;});
