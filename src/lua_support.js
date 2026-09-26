'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { transactionalWrite, optionsFromConfig } = require('./mutation_safety');

const LUA_EXTENSION_ID = 'sumneko.lua';

function activeWorkspaceFolder() {
  const uri = vscode.window.activeTextEditor?.document?.uri;
  return (uri && vscode.workspace.getWorkspaceFolder(uri)) || vscode.workspace.workspaceFolders?.[0] || null;
}

function targetFor(folder) {
  return path.join(folder.uri.fsPath, '.ikemen-tools', 'luals', 'ikemen-1.0.lua');
}

async function installDefinitions(context) {
  const folder = activeWorkspaceFolder();
  if (!folder || folder.uri.scheme !== 'file') return vscode.window.showWarningMessage('Open the IKEMEN project folder before installing its Lua definitions.');
  const source = vscode.Uri.joinPath(context.extensionUri, 'data', 'luals', 'ikemen-1.0.lua').fsPath;
  const target = targetFor(folder);
  const exists = fs.existsSync(target);
  const answer = await vscode.window.showWarningMessage(
    `${exists ? 'Refresh' : 'Install'} IKEMEN 1.0 Lua definitions for ${folder.name}?`,
    { modal: true, detail: `Writes only ${target}. The file is marked as LuaLS metadata and is never loaded by IKEMEN.` },
    exists ? 'Refresh Definitions' : 'Install Definitions'
  );
  if (!answer) return;
  const content = fs.readFileSync(source, 'utf8');
  transactionalWrite(fs, target, content, optionsFromConfig(vscode, target, 'luals-definitions', { journalRoot: folder.uri.fsPath, backup: true }));
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(target));
  await vscode.window.showTextDocument(document, { preview: true, preserveFocus: true });
  vscode.window.showInformationMessage('IKEMEN 1.0 definitions are ready for Lua Language Server analysis.');
}

async function showStatus(context) {
  const extension = vscode.extensions.getExtension(LUA_EXTENSION_ID);
  const folder = activeWorkspaceFolder();
  const target = folder?.uri?.scheme === 'file' ? targetFor(folder) : null;
  const definitions = Boolean(target && fs.existsSync(target));
  const actions = [];
  if (!extension) actions.push('Show Lua Language Server');
  if (folder) actions.push(definitions ? 'Refresh Project Definitions' : 'Install Project Definitions');
  const selected = await vscode.window.showInformationMessage(
    `Lua authoring: Lua Language Server ${extension ? `installed (${extension.packageJSON.version})` : 'not installed'}; IKEMEN project definitions ${definitions ? 'installed' : 'not installed'}.`,
    ...actions
  );
  if (selected === 'Show Lua Language Server') return vscode.commands.executeCommand('workbench.extensions.search', `@id:${LUA_EXTENSION_ID}`);
  if (selected && selected.includes('Project Definitions')) return installDefinitions(context);
}

function registerLuaSupport(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('ikemen.luaSupport.status', () => showStatus(context)),
    vscode.commands.registerCommand('ikemen.luaSupport.installDefinitions', () => installDefinitions(context))
  );
}

module.exports = { registerLuaSupport, LUA_EXTENSION_ID, targetFor };
