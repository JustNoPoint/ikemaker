'use strict';

const assert = require('assert');
const placement = require('../src/toolbar_open_disposition');

(async () => {
  const calls=[];
  const vscode={commands:{async executeCommand(command){calls.push(command);}}};
  assert.deepStrictEqual(placement.VALUES,['beside','window','close-tab','close-window']);
  assert.strictEqual(placement.valid('tab'),false,'ordinary tab focus is not a right-click disposition');
  await placement.apply(vscode,'beside');
  await placement.apply(vscode,'window');
  await placement.apply(vscode,'close-tab');
  await placement.apply(vscode,'close-window');
  assert.deepStrictEqual(calls,[
    'workbench.action.moveEditorToRightGroup',
    'workbench.action.moveEditorToNewWindow',
    'workbench.action.closeActiveEditor',
    'workbench.action.closeWindow'
  ]);
  console.log('Toolbar alternate placement and close command mapping passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
