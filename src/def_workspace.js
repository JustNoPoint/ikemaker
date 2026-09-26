'use strict';

const vscode = require('vscode');
const fs = require('fs');
const { parseDef, kind } = require('./def_model');
const { openStageWorkspace } = require('./stage_workspace');
const { openUiWorkspace } = require('./screenpack_workspace');
const { chooseFileOrFolder } = require('./open_target_picker');

async function openVisualWorkspace(uri) {
  let target = uri && uri.fsPath ? uri : null;
  if (!target) {
    const active = vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri;
    if (active && /\.def$/i.test(active.fsPath)) target = active;
  }
  if (!target) {
    const filename = await chooseFileOrFolder({ title: 'Open IKEMEN Stage, Screenpack, or Fight DEF', filters: { 'IKEMEN definition': ['def'] }, extensions: ['def'], predicate: (candidate) => ['stage', 'screenpack', 'lifebar'].includes(kind(parseDef(fs.readFileSync(candidate, 'utf8'), candidate))), maxDepth: 4, invalidMessage: 'That DEF is not a stage, screenpack, or fight/lifebar definition.', emptyMessage: 'No compatible visual DEF files were found in that folder.' });
    target = filename ? vscode.Uri.file(filename) : null;
  }
  if (!target) return;

  try {
    const document = parseDef(fs.readFileSync(target.fsPath, 'utf8'), target.fsPath);
    const type = kind(document);
    if (type === 'stage') return openStageWorkspace(target);
    if (type === 'screenpack' || type === 'lifebar') return openUiWorkspace(target);
    return vscode.window.showWarningMessage('This DEF is not recognized as a stage, screenpack, or fight/lifebar definition. No visual workspace was opened.');
  } catch (error) {
    return vscode.window.showErrorMessage(`Could not inspect this DEF: ${error.message}`);
  }
}

function registerDefWorkspace(context) {
  context.subscriptions.push(vscode.commands.registerCommand('ikemen.def.openVisualWorkspace', openVisualWorkspace));
}

module.exports = { registerDefWorkspace, openVisualWorkspace };
