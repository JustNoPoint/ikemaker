'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { transactionalWrite, optionsFromConfig } = require('./mutation_safety');

const LUA_EXTENSION_ID = 'sumneko.lua';
const {luaDefinitionsContent,targetLabel}=require('./lua_target_catalog');

function activeWorkspaceFolder() {
  const uri = vscode.window.activeTextEditor?.document?.uri;
  return (uri && vscode.workspace.getWorkspaceFolder(uri)) || vscode.workspace.workspaceFolders?.[0] || null;
}

function targetFor(folder) {
  return path.join(folder.uri.fsPath, '.ikemen-tools', 'luals', 'ikemen-1.0.lua');
}

async function installDefinitions(context,getCapabilities=()=>({})) {
  const folder = activeWorkspaceFolder();
  if (!folder || folder.uri.scheme !== 'file') return vscode.window.showWarningMessage('Open the IKEMEN project folder before installing its Lua definitions.');
  const source = vscode.Uri.joinPath(context.extensionUri, 'data', 'luals', 'ikemen-1.0.lua').fsPath;
  const capabilities=getCapabilities(vscode.window.activeTextEditor?.document?.uri || folder.uri);
  const label=targetLabel(capabilities);
  const target = targetFor(folder);
  const exists = fs.existsSync(target);
  const answer = await vscode.window.showWarningMessage(
    `${exists ? 'Refresh' : 'Install'} IKEMEN Lua definitions for ${folder.name} · target ${label}?`,
    { modal: true, detail: `Writes only ${target}. Installs active offline 1.0 baseline definitions. Exact Nightly additions are included only as inert reference comments: LuaLS workspace globals cannot safely follow each file’s build. Bundled IKEMaker assistance provides exact-build Nightly completion, hover and signatures. The file is LuaLS metadata and is never loaded by IKEMEN.` },
    exists ? 'Refresh Definitions' : 'Install Definitions'
  );
  if (!answer) return;
  const current=getCapabilities(vscode.window.activeTextEditor?.document?.uri || folder.uri);
  if(require('./capability_fingerprint').capabilityFingerprint(current)!==require('./capability_fingerprint').capabilityFingerprint(capabilities))return vscode.window.showWarningMessage('The project engine target changed. Refresh definitions again for the current target.');
  const content = luaDefinitionsContent(fs.readFileSync(source, 'utf8'),capabilities);
  transactionalWrite(fs, target, content, optionsFromConfig(vscode, target, 'luals-definitions', { journalRoot: folder.uri.fsPath, backup: true }));
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(target));
  await vscode.window.showTextDocument(document, { preview: true, preserveFocus: true });
  vscode.window.showInformationMessage(`IKEMEN 1.0 baseline definitions are ready for Lua Language Server. Nightly additions use bundled exact-build assistance; persisted LuaLS additions are inert reference comments.`);
}

async function showStatus(context,getCapabilities=()=>({})) {
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
  if (selected && selected.includes('Project Definitions')) return installDefinitions(context,getCapabilities);
}

function registerLuaSupport(context,getCapabilities=()=>({})) {
  context.subscriptions.push(
    vscode.commands.registerCommand('ikemen.luaSupport.status', () => showStatus(context,getCapabilities)),
    vscode.commands.registerCommand('ikemen.luaSupport.installDefinitions', () => installDefinitions(context,getCapabilities))
  );
}

module.exports = { registerLuaSupport, LUA_EXTENSION_ID, targetFor };
