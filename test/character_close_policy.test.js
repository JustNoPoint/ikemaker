'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'character_workbenches.js'), 'utf8');
const closeStart = source.indexOf('async function closeAuthoringContext');
const closeEnd = source.indexOf('\nfunction registerCharacterWorkbenches', closeStart);
const close = source.slice(closeStart, closeEnd);
assert(close.includes('beginContextClose(selected)'), 'character close must guard the context from automatic reopen');
assert(close.indexOf('disposeContextPanels(selected)') > close.indexOf('vscode.window.tabGroups.close'), 'visual panels must survive native close cancellation');
assert(close.includes('for (let pass = 0; pass < 4; pass += 1)'), 'close must drain tabs recreated by delayed VS Code events');
assert(close.includes('finally { finishClose(); }'), 'the close guard must always be released');

const air = fs.readFileSync(path.join(__dirname, '..', 'src', 'air_viewer.js'), 'utf8');
assert(air.includes('options.automatic && isClosingFile(airPath)'), 'automatic AIR opening must honor the close guard');
assert(air.includes('if (isClosingFile(session.airPath)) return;'), 'AIR source synchronization must honor the close guard');

console.log('Atomic character-close policy tests passed');

const vm = require('vm');
(async () => {
  let disposed=0, forgotten=0, attempts=0, released=0;
  const sandbox={require:name=>name==='./authoring_context_registry'?{matchingPanels:()=>[]}:{prepare:async()=>true},characterContext:()=>({key:'test',type:'character',label:'Test'}),beginContextClose:()=>()=>released++,disposeContextPanels:()=>++disposed,tabFilename:()=> 'file.air',contextOwnsFile:()=>true,forgetCharacter:()=>forgotten++,WORKBENCH_COLUMNS:new Map(),normalized:x=>x,vscode:{window:{tabGroups:{all:[{tabs:[{}]}],close:async()=>{attempts++;return false;}},showInformationMessage(){throw new Error('Cancelled close must not report success');}}},Promise};
  vm.createContext(sandbox);vm.runInContext(close+';this.run=closeAuthoringContext',sandbox);
  await sandbox.run({},'character',{folder:'test'});
  assert.equal(attempts,1);assert.equal(disposed,0);assert.equal(forgotten,0);assert.equal(released,1);
  let reported;attempts=0;sandbox.vscode.window.showInformationMessage=message=>{reported=message;};sandbox.vscode.window.tabGroups.close=async()=>{attempts++;if(attempts===3)sandbox.vscode.window.tabGroups.all=[];return true;};await sandbox.run({},'character',{folder:'test'});assert.equal(attempts,3);assert(reported.includes('1 tab(s)'),'a delayed tab snapshot must not count the same closed tab repeatedly');assert.equal(disposed,1);assert.equal(forgotten,1);assert.equal(released,2);
  console.log('Cancelled character close preserves panels and context without repeated prompts');
})().catch(error=>{console.error(error);process.exitCode=1;});
