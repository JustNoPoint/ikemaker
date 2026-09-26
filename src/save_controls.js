'use strict';
const fs = require('fs');
const path = require('path');
const panels = new Map();
function enabled(seed) {
  const vscode = require('vscode');
  return vscode.workspace.getConfiguration('ikemenZss', seed ? vscode.Uri.file(seed) : undefined).get('autoSave', false);
}
async function publish(panel, seed) {
  const vscode=require('vscode'),resource=seed?vscode.Uri.file(seed):undefined;
  const textAutoSave=vscode.workspace.getConfiguration('files',resource).get('autoSave','off');
  await panel.webview.postMessage({type:'ikemenSavePolicy', enabled:enabled(seed),textAutoSave});
}
let toggling = Promise.resolve();
function toggle(seed) {
  toggling = toggling.catch(() => {}).then(() => applyToggle(seed));
  return toggling;
}
async function applyToggle(seed) {
  const vscode = require('vscode'), resource = seed ? vscode.Uri.file(seed) : undefined;
  const config = vscode.workspace.getConfiguration('ikemenZss', resource), next = !enabled(seed);
  const inspected=config.inspect('autoSave');
  const target=inspected?.workspaceFolderValue!==undefined?vscode.ConfigurationTarget.WorkspaceFolder:inspected?.workspaceValue!==undefined?vscode.ConfigurationTarget.Workspace:vscode.ConfigurationTarget.Global;
  await config.update('autoSave',next,target);
  for (const [panel, source] of panels) await publish(panel, source);
}
async function makeBackup(seed) {
  const vscode = require('vscode');
  let source = seed ? vscode.Uri.file(seed) : vscode.window.activeTextEditor?.document.uri;
  if (!source || source.scheme !== 'file' || !fs.existsSync(source.fsPath) || !fs.statSync(source.fsPath).isFile()) {
    source = (await vscode.window.showOpenDialog({title:'Choose a saved file to back up',canSelectMany:false,canSelectFiles:true,canSelectFolders:false}))?.[0];
  }
  if (!source) return;
  const suffix = new Date().toISOString().replace(/[:.]/g,'-');
  const destination = await vscode.window.showSaveDialog({title:'Make Backup — copy saved file',saveLabel:'Make Backup',defaultUri:vscode.Uri.file(source.fsPath+'.'+suffix+'.bak')});
  if (!destination) return;
  if (path.resolve(destination.fsPath).toLowerCase() === path.resolve(source.fsPath).toLowerCase()) throw new Error('Choose a different filename for the backup.');
  // Never replace an existing backup, even when its filename was selected accidentally.
  fs.copyFileSync(source.fsPath, destination.fsPath, fs.constants.COPYFILE_EXCL);
  await vscode.window.showInformationMessage('Backup created: '+destination.fsPath+' (saved file contents).');
  return destination;
}
async function handle(message, seed, panel) {
  if (message?.type === 'viewerToolbarReady' && panel?.webview) {
    if (!panels.has(panel)) panel.onDidDispose?.(()=>panels.delete(panel));
    panels.set(panel, seed); await publish(panel, seed); return false;
  }
  if (!['ikemenMakeBackup','ikemenToggleAutoSave'].includes(message?.type)) return false;
  try { if (message.type === 'ikemenMakeBackup') await makeBackup(seed); else await toggle(seed); }
  catch(error) { await require('vscode').window.showErrorMessage('Save controls: '+error.message); }
  return true;
}
function register(context) {
  const vscode = require('vscode');
  const guarded = action => async uri => {try {return await action(uri?.fsPath);}catch(error){await vscode.window.showErrorMessage('Save controls: '+error.message);}};
  context.subscriptions.push(vscode.commands.registerCommand('ikemen.makeBackup', guarded(makeBackup)),vscode.commands.registerCommand('ikemen.toggleAutoSave', guarded(toggle)),vscode.workspace.onDidChangeConfiguration(event=>{
    if(event.affectsConfiguration('ikemenZss.autoSave')||event.affectsConfiguration('files.autoSave')) for(const [panel,seed] of panels) publish(panel,seed).catch(()=>{});
  }));
}
module.exports = {enabled,toggle,makeBackup,handle,register};
