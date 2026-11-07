'use strict';

async function switchToIkeMiner(vscode) {
  const installed = vscode.extensions?.getExtension
    ? vscode.extensions.getExtension('justnopoint.ikeminer')
    : true;
  if (!installed) {
    vscode.window.showInformationMessage('IkeMiner is not installed or enabled. IKEMaker stayed open.');
    return false;
  }
  try {
    await vscode.commands.executeCommand('ikeminer.open');
    return true;
  } catch (error) {
    vscode.window.showErrorMessage(`IkeMiner could not open. IKEMaker stayed open. ${error.message || error}`);
    return false;
  }
}

async function switchSuite(vscode, seed) {
  const picked=await vscode.window.showQuickPick([
    {label:'$(dashboard) IKeMeter',description:'Live runtime analysis and debugging',command:'ikemen.openIKeMeter'},
    {label:'$(search) IkeMiner',description:'Capture and reference workspace',command:'ikemen.switchToIkeMiner'}
  ],{title:'Switch Suite',placeHolder:'Choose the companion to open or focus'});
  if(!picked)return false;
  return vscode.commands.executeCommand(picked.command,seed);
}

function register(vscode, context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('ikemen.switchToIkeMiner', () => switchToIkeMiner(vscode)),
    vscode.commands.registerCommand('ikemen.switchSuite', seed => switchSuite(vscode,seed))
  );
  require('./ikemeter_companion').register(vscode,context);
}

module.exports = { switchToIkeMiner, switchSuite, register };
