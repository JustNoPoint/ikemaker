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

function register(vscode, context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('ikemen.switchToIkeMiner', () => switchToIkeMiner(vscode))
  );
}

module.exports = { switchToIkeMiner, register };
