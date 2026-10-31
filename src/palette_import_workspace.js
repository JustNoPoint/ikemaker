'use strict';

const vscode = require('vscode');

function openPaletteImportWorkspace(uri) {
  return vscode.commands.executeCommand('ikemen.palette.openWorkspace', uri, { section: 'sources-preflight', compatibilityAlias: 'ikemen.paletteImport.open' });
}
function registerPaletteImportWorkspace(context) {
  context.subscriptions.push(vscode.commands.registerCommand('ikemen.paletteImport.open', openPaletteImportWorkspace));
}

module.exports = { registerPaletteImportWorkspace, openPaletteImportWorkspace };
