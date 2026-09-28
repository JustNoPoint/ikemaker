'use strict';

const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { chooseCharacterDef } = require('./character_picker');
const { routeRosterPalette, characterSff } = require('./roster_palette_flow');
const { parseDef, kind } = require('./def_model');
const { stageModel } = require('./stage_model');
const { screenpackModel } = require('./screenpack_model');

function resolveAssignedAsset(reference, owner) {
  const cleaned = String(reference || '').replace(/[\\/]/g, path.sep);
  if (!cleaned) throw new Error('The selected definition does not assign an SFF file.');
  const candidates = [path.resolve(path.dirname(owner), cleaned)];
  let current = path.dirname(owner);
  while (path.dirname(current) !== current) {
    if (fs.existsSync(path.join(current, 'data')) || fs.existsSync(path.join(current, 'Ikemen_GO.exe'))) {
      candidates.push(path.resolve(current, cleaned), path.resolve(current, 'data', cleaned), path.resolve(current, 'stages', cleaned));
      break;
    }
    current = path.dirname(current);
  }
  const resolved = candidates.find((candidate) => fs.existsSync(candidate));
  if (!resolved) throw new Error(`The assigned SFF was not found: ${candidates[0]}`);
  return resolved;
}

function assignedSff(defPath) {
  const document = parseDef(fs.readFileSync(defPath, 'utf8'), defPath), type = kind(document);
  if (type === 'stage') return resolveAssignedAsset(stageModel(document).sff, defPath);
  if (type === 'screenpack' || type === 'lifebar') return resolveAssignedAsset(screenpackModel(document).sff, defPath);
  return characterSff(defPath);
}

function openSffPaletteWorkspace(sff) {
  return vscode.commands.executeCommand('sff.openViewer', { fsPath: sff }, undefined, { destination: 'palette' });
}

async function openCanonicalPaletteWorkspace(uri) {
  const suppliedPath = uri?.fsPath || uri?.path || '';
  const extension = path.extname(suppliedPath).toLowerCase();
  if (extension === '.sff') return openSffPaletteWorkspace(suppliedPath);
  if (extension === '.act' || extension === '.png') return vscode.commands.executeCommand('ikemen.paletteOrganizer.open', uri);
  if (extension === '.def') return openSffPaletteWorkspace(assignedSff(suppliedPath));
  const target = await vscode.window.showQuickPick([
    { label: 'Character Palette Workspace…', description: 'Choose a character, then manage the palette table of its assigned SFF.', action: 'character' },
    { label: 'Stage, screenpack, fight UI, or exact SFF…', description: 'Choose an identified owner or archive. IKEMaker opens only its assigned SFF.', action: 'visual-owner' },
    { label: 'Standalone ACT / indexed PNG…', description: 'Create, edit, inspect, or export a palette source without guessing a character.', action: 'standalone' }
  ], { title: 'Open Palette Workspace', placeHolder: 'Choose the palette context. IKEMaker will not guess a character for a standalone palette.' });
  if (!target) return;
  if (target.action === 'standalone') return vscode.commands.executeCommand('ikemen.paletteOrganizer.open', uri);
  if (target.action === 'visual-owner') {
    const picked = await vscode.window.showOpenDialog({ title: 'Choose a stage, screenpack, fight UI, or exact SFF', canSelectMany: false, canSelectFiles: true, canSelectFolders: false, filters: { 'IKEMEN definition or SFF': ['def', 'sff'] } });
    if (!picked?.[0]) return;
    return openCanonicalPaletteWorkspace(picked[0]);
  }
  const defPath = await chooseCharacterDef(uri, { title: 'Choose the character whose palettes you want to work with' });
  if (!defPath) return;
  return vscode.commands.executeCommand('sff.openViewer', { fsPath: characterSff(defPath) }, undefined, { destination: 'palette' });
}

async function openPlayerPaletteWorkspace(uri) {
  const choice = await vscode.window.showQuickPick([
    { label: 'Open the character Palette Workspace…', description: 'Preview, add or insert several palettes, replace, edit colors, export, and use libraries in one persistent workspace.', action: 'workspace' },
    { label: 'Add a new palette or replace an existing palette…', description: 'Choose an ACT or indexed PNG, then explicitly choose Add New or Replace Existing before previewing.', action: 'apply' },
    { label: 'Create, edit, or export a palette…', description: 'Open the palette-only index organizer for ACT/PNG/SFF color work and reviewed exports.', action: 'organize' },
    { label: 'Open the current character palette folder', description: 'Browse existing character palette files without opening sprite or code authoring.', action: 'folder' }
  ], { title: 'Player Palette Workshop', placeHolder: 'Palette tools only — no code or general sprite-authoring workspace.' });
  if (!choice) return;
  if (choice.action === 'organize') return vscode.commands.executeCommand('ikemen.palettePlayer.organize', uri);
  if (choice.action === 'folder') return vscode.commands.executeCommand('ikemen.openPaletteFolder');
  const defPath = await chooseCharacterDef(uri, { title: choice.action === 'workspace' ? 'Choose the character whose palettes you want to work with' : 'Choose the character that will receive the new or replacement palette' });
  if (!defPath) return;
  if (choice.action === 'workspace') return vscode.commands.executeCommand('sff.openViewer', { fsPath: characterSff(defPath) }, undefined, { destination: 'palette' });
  const source = await vscode.window.showOpenDialog({ title: 'Choose an ACT or indexed PNG palette', canSelectMany: false, canSelectFiles: true, canSelectFolders: false, filters: { 'ACT or indexed PNG palette': ['act', 'png'] } });
  if (!source?.[0]) return;
  return routeRosterPalette(defPath, source[0].fsPath);
}

function registerPlayerPaletteWorkspace(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('ikemen.palettePlayer.open', openPlayerPaletteWorkspace),
    vscode.commands.registerCommand('ikemen.palette.openWorkspace', openCanonicalPaletteWorkspace),
    vscode.commands.registerCommand('ikemen.palettePlayer.organize', uri => vscode.commands.executeCommand('ikemen.paletteOrganizer.open', uri)),
    vscode.commands.registerCommand('ikemen.palettePlayer.finishStaged', async (uri) => {
      const answer = await vscode.window.showWarningMessage('Finish the staged palette through the reviewed SFF build workflow?', { modal: true, detail: 'Adding a new embedded palette requires rebuilding the character SFF from its approved sprite manifest. IKEMaker will preserve the current SFF palette table, include the staged color, ask for the output location, and request confirmation before SprMaker2 runs. The general SFF editor will not open.' }, 'Continue to Reviewed Build');
      if (answer !== 'Continue to Reviewed Build') return;
      return vscode.commands.executeCommand('sff.buildApprovedManifest', { paletteSourceSff: uri?.fsPath || uri?.path });
    })
  );
}

module.exports = { assignedSff, openCanonicalPaletteWorkspace, openPlayerPaletteWorkspace, registerPlayerPaletteWorkspace };
