'use strict';

function configurationTarget(vscode, resource) {
  if (resource && vscode.workspace.getWorkspaceFolder(resource)) return vscode.ConfigurationTarget.WorkspaceFolder;
  if (Array.isArray(vscode.workspace.workspaceFolders) && vscode.workspace.workspaceFolders.length) return vscode.ConfigurationTarget.Workspace;
  return vscode.ConfigurationTarget.Global;
}

module.exports = { configurationTarget };
