'use strict';
const assert = require('assert');
const { actionFor, safeActions, registerUnusedLetCodeActions } = require('../src/unused_let_code_actions');
const { analyzeUnusedLets } = require('../src/unused_let_analysis');
const issue = text => analyzeUnusedLets(text).issues[0];

assert.deepStrictEqual(actionFor(issue('let unused = 1;')), { title: 'Remove unused local', replacement: '', statementStart: 0, statementEnd: 15, expectedText: 'let unused = 1;' });
assert.deepStrictEqual(actionFor(issue('let result = call Effect(1);')), { title: 'Replace unused result with call', replacement: 'call Effect(1);', statementStart: 0, statementEnd: 28, expectedText: 'let result = call Effect(1);' });
assert.strictEqual(actionFor(issue('let result = 1 + call Effect();')), null, 'uncertain effectful expressions receive no automatic edit');
assert.deepStrictEqual(safeActions('let one = 1;\nlet result = call Effect();\nlet uncertain = 1 + call Effect();').map(action=>action.title), ['Remove unused local','Replace unused result with call'], 'batch cleanup includes only proven-safe actions');

(async()=>{
  const commands={}, edits=[];let provider, applied=0, warnings=0, information=0, replacement, modalChoice;
  const uri={toString:()=> 'file:///test.zss'}, document={uri,version:4,text:'let unused = 1;',getText(){return this.text;},positionAt(offset){return{line:this.text.slice(0,offset).split('\n').length-1,character:offset}}};
  class WorkspaceEdit{replace(_uri,range,value){replacement=value;edits.push({range,value});}}
  const vscode={
    Uri:{parse:()=>uri},Range:class Range{constructor(start,end){this.start=start;this.end=end;}},WorkspaceEdit,
    CodeAction:class CodeAction{constructor(title,kind){this.title=title;this.kind=kind;}},CodeActionKind:{QuickFix:'quickfix'},
    commands:{registerCommand(name,callback){commands[name]=callback;return{};}},languages:{registerCodeActionsProvider(_selector,value){provider=value;return{};}},
    workspace:{openTextDocument:async()=>document,applyEdit:async()=>{applied++;return true;}},window:{showWarningMessage(_message,options){warnings++;return options?.modal?modalChoice:undefined;},showInformationMessage(){information++;},showErrorMessage(){throw Error('unexpected apply failure');}}
  };
  registerUnusedLetCodeActions(vscode,{subscriptions:[]});
  const request={uri:uri.toString(),version:3,statementStart:0,statementEnd:15,expectedText:'let unused = 1;',replacement:''};
  await commands['zss.fixUnusedLet'](request);assert.strictEqual(applied,0);assert.strictEqual(warnings,1,'stale document versions are rejected');
  request.version=4;request.expectedText='let changed = 1;';await commands['zss.fixUnusedLet'](request);assert.strictEqual(applied,0);assert.strictEqual(warnings,2,'changed source bytes are rejected');
  request.expectedText='let unused = 1;';await commands['zss.fixUnusedLet'](request);assert.strictEqual(applied,1);assert.strictEqual(replacement,'','exact-source pure removal uses a normal workspace edit');
  const diagnostic={code:'unused-let',range:{start:{line:0}}},actions=provider.provideCodeActions(document,{start:{line:0},end:{line:0}},{diagnostics:[diagnostic]});
  assert.strictEqual(actions[0].title,'Remove unused local');assert.strictEqual(actions[0].command.arguments[0].version,4);
  document.text='let one = 1;\nlet result = call Effect();';edits.length=0;modalChoice=undefined;
  const batchActions=provider.provideCodeActions(document,{start:{line:0},end:{line:1}},{diagnostics:[diagnostic]});
  assert(batchActions.some(action=>action.title==='Review 2 safe unused-local fixes in this file…'),'multiple safe fixes expose one reviewed batch action');
  await commands['zss.reviewFixAllUnusedLets']({uri:uri.toString(),version:4});assert.strictEqual(applied,1,'cancelling batch preview makes no edit');
  modalChoice='Apply Safe Fixes';await commands['zss.reviewFixAllUnusedLets']({uri:uri.toString(),version:4});assert.strictEqual(applied,2);assert.strictEqual(edits.length,2,'reviewed batch applies exactly the safe edits');
  document.text='let used = 1;\ncall Read($used);';await commands['zss.reviewFixAllUnusedLets']({uri:uri.toString(),version:4});assert.strictEqual(information,1,'empty reviewed batch reports that no fixes remain');
  console.log('Unused ZSS let quick fixes remove pure declarations, preserve direct calls, skip uncertain effects, and reject stale edits');
})().catch(error=>{console.error(error);process.exitCode=1;});
