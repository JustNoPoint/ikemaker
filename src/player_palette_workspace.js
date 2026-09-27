'use strict';

const vscode = require('vscode');
const { chooseCharacterDef } = require('./character_picker');
const { routeRosterPalette } = require('./roster_palette_flow');

async function openPlayerPaletteWorkspace(uri) {
  const choice = await vscode.window.showQuickPick([
    { label: 'Add a new palette or replace an existing palette…', description: 'Choose an ACT or indexed PNG, then explicitly choose Add New or Replace Existing before previewing.', action: 'apply' },
    { label: 'Create, edit, or export a palette…', description: 'Open the palette-only index organizer for ACT/PNG/SFF color work and reviewed exports.', action: 'organize' },
    { label: 'Open the current character palette folder', description: 'Browse existing character palette files without opening sprite or code authoring.', action: 'folder' }
  ], { title: 'Player Palette Workshop', placeHolder: 'Palette tools only — no code or general sprite-authoring workspace.' });
  if (!choice) return;
  if (choice.action === 'organize') return vscode.commands.executeCommand('ikemen.palettePlayer.organize', uri);
  if (choice.action === 'folder') return vscode.commands.executeCommand('ikemen.openPaletteFolder');
  const defPath = await chooseCharacterDef(uri, { title: 'Choose the character that will receive the new or replacement palette' });
  if (!defPath) return;
  const source = await vscode.window.showOpenDialog({ title: 'Choose an ACT or indexed PNG palette', canSelectMany: false, canSelectFiles: true, canSelectFolders: false, filters: { 'ACT or indexed PNG palette': ['act', 'png'] } });
  if (!source?.[0]) return;
  return routeRosterPalette(defPath, source[0].fsPath);
}

function registerPlayerPaletteWorkspace(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('ikemen.palettePlayer.open', openPlayerPaletteWorkspace),
    vscode.commands.registerCommand('ikemen.palettePlayer.organize', uri => vscode.commands.executeCommand('ikemen.paletteOrganizer.open', uri)),
    vscode.commands.registerCommand('ikemen.palettePlayer.finishStaged', async (uri) => {
      const answer = await vscode.window.showWarningMessage('Finish the staged palette through the reviewed SFF build workflow?', { modal: true, detail: 'Adding a new embedded palette requires rebuilding the character SFF from its approved sprite manifest. IKEMaker will preserve the current SFF palette table, include the staged color, ask for the output location, and request confirmation before SprMaker2 runs. The general SFF editor will not open.' }, 'Continue to Reviewed Build');
      if (answer !== 'Continue to Reviewed Build') return;
      return vscode.commands.executeCommand('sff.buildApprovedManifest', { paletteSourceSff: uri?.fsPath || uri?.path });
    })
  );
}

module.exports = { openPlayerPaletteWorkspace, registerPlayerPaletteWorkspace };
