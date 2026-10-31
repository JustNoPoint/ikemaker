'use strict';
const assert=require('assert');
const {run}=require('../src/trigger_argument_editor');

class Range{constructor(start,end){this.start=start;this.end=end;}}
class WorkspaceEdit{constructor(){this.operations=[];}replace(uri,range,value){this.operations.push({uri,range,value});}}
function environment(options={}){
  let text='changeState{\n  value: 0;\n  trigger: EnvShakeVar(ampl) > 0;\n}\n',version=1,applied=0,warning='',info='',favorite='';const uri={toString:()=> 'file:/Ryu/normals.zss'};
  const positionAt=offset=>{const before=text.slice(0,offset),lines=before.split('\n');return{line:lines.length-1,character:lines.at(-1).length};};
  const offsetAt=position=>text.split('\n').slice(0,position.line).reduce((sum,line)=>sum+line.length+1,0)+position.character;
  const document={uri,fileName:'C:/Ryu/normals.zss',languageId:'zss',get version(){return version;},getText:()=>text,positionAt,offsetAt};
  const selection={active:positionAt(text.indexOf('ampl')+2)};const editor={document,selection};let pick=0;
  const vscode={Range,WorkspaceEdit,window:{activeTextEditor:editor,showQuickPick:async rows=>{pick+=1;if(options.cancelAt===pick)return undefined;if(pick===1)return options.favorite?rows.find(row=>row.kind==='favorite'):rows.find(row=>row.kind==='slot');return options.expression?rows.find(row=>row.kind==='expression'):rows.find(row=>row.value==='dir');},showInputBox:async()=>options.cancelInput?undefined:'time + 1',showInformationMessage:async(message,detail)=>{info=message;if(options.changeDuringReview&&detail?.modal){text=text.replace('ampl','freq');version+=1;}return detail?.modal?(options.cancelReview?undefined:'Apply'):undefined;},showWarningMessage:async message=>{warning=message;}},workspace:{applyEdit:async edit=>{const operation=edit.operations[0],start=offsetAt(operation.range.start),end=offsetAt(operation.range.end);text=text.slice(0,start)+operation.value+text.slice(end);version+=1;applied+=1;return true;}}};
  const preferences={favorites:()=>[],toggleFavorite:async id=>{favorite=id;},recordRecent:async()=>{}};let capabilityRead=0;
  const capabilities=()=>({targetBuildId:options.targetChange&&capabilityRead++?'nightly-b':'stable-a',enabledCapabilities:[]});
  return{vscode,preferences,capabilities,read:()=>({text,version,applied,warning,info,favorite})};
}

(async()=>{
  const known=environment();assert.strictEqual(await run(known.vscode,known.preferences,known.capabilities),true);assert.match(known.read().text,/EnvShakeVar\(dir\)/);assert.strictEqual(known.read().applied,1,'one native edit is applied and remains unsaved');
  const custom=environment({expression:true});assert.strictEqual(await run(custom.vscode,custom.preferences,custom.capabilities),true);assert.match(custom.read().text,/EnvShakeVar\(time \+ 1\)/,'manual expressions remain available');
  for(const cancelAt of [1,2]){const cancelled=environment({cancelAt});assert.strictEqual(await run(cancelled.vscode,cancelled.preferences,cancelled.capabilities),false);assert.strictEqual(cancelled.read().applied,0);}
  const cancelInput=environment({expression:true,cancelInput:true});assert.strictEqual(await run(cancelInput.vscode,cancelInput.preferences,cancelInput.capabilities),false);assert.strictEqual(cancelInput.read().applied,0);
  const cancelReview=environment({cancelReview:true});assert.strictEqual(await run(cancelReview.vscode,cancelReview.preferences,cancelReview.capabilities),false);assert.strictEqual(cancelReview.read().applied,0);
  const stale=environment({changeDuringReview:true});assert.strictEqual(await run(stale.vscode,stale.preferences,stale.capabilities),undefined);assert.strictEqual(stale.read().applied,0);assert.match(stale.read().warning,/source, trigger call, or active editor changed/i);
  const targetChanged=environment({targetChange:true});assert.strictEqual(await run(targetChanged.vscode,targetChanged.preferences,targetChanged.capabilities),undefined);assert.strictEqual(targetChanged.read().applied,0);assert.match(targetChanged.read().warning,/exact project engine target changed/i,'an exact target change blocks even when dir remains supported');
  const saved=environment({favorite:true});assert.strictEqual(await run(saved.vscode,saved.preferences,saved.capabilities),false);assert(saved.read().favorite,'common trigger saving reuses the trigger Favorite identity');assert.match(saved.read().info,/saved to common trigger Favorites/);
  console.log('Trigger Arguments edits exact calls, preserves manual expressions, cancels safely, blocks stale source, and reuses common-trigger Favorites');
})().catch(error=>{console.error(error);process.exitCode=1;});
