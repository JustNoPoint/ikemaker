'use strict';

const vscode = require('vscode');
const organizer = require('./palette_workspace_organizer');

function openPaletteIndexOrganizer(uri, options = {}) {
  return vscode.commands.executeCommand('ikemen.palette.openWorkspace', uri, { ...options, section: 'organize', compatibilityAlias: 'ikemen.paletteOrganizer.open' });
}
function registerPaletteIndexOrganizer(context) {
  context.subscriptions.push(vscode.commands.registerCommand('ikemen.paletteOrganizer.open', openPaletteIndexOrganizer));
}

module.exports = { registerPaletteIndexOrganizer, openPaletteIndexOrganizer, ...organizer };
