'use strict';

const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { parseDef, sections, value } = require('./def_model');
const { gameRoot, characterDefs } = require('./character_context');
const { chooseFileOrFolder, chooseFromFolder } = require('./open_target_picker');

function isCharacterDef(filename) {
  try { const document = parseDef(fs.readFileSync(filename, 'utf8'), filename), files = sections(document, 'Files')[0]; return Boolean(files && (value(files, 'sprite') || value(files, 'anim') || value(files, 'cns') || value(files, 'st'))); } catch (_) { return false; }
}
function nearestCharacterDef(filename) {
  if (!filename) return '';
  if (/\.def$/i.test(filename) && isCharacterDef(filename)) return path.resolve(filename);
  const folder = fs.existsSync(filename) && fs.statSync(filename).isDirectory() ? filename : path.dirname(filename);
  if (!fs.existsSync(folder)) return '';
  const defs = fs.readdirSync(folder).filter((name) => /\.def$/i.test(name)).map((name) => path.join(folder, name)).filter(isCharacterDef);
  return defs.length === 1 ? path.resolve(defs[0]) : '';
}
function openFilePaths(seed) {
  const output = [];
  if (seed?.fsPath) output.push(seed.fsPath);
  const active = vscode.window.activeTextEditor?.document.fileName; if (active) output.push(active);
  for (const document of vscode.workspace.textDocuments || []) if (document.uri?.scheme === 'file' || document.fileName) output.push(document.fileName || document.uri.fsPath);
  for (const group of vscode.window.tabGroups?.all || []) for (const tab of group.tabs || []) { const uri = tab.input?.uri || tab.input?.modified || tab.input?.original; if (uri?.fsPath) output.push(uri.fsPath); }
  return [...new Set(output.filter(Boolean).map((item) => path.resolve(item)))];
}
function rankCurrentCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    const aTemplate = path.basename(path.dirname(a)).toLowerCase() === 'template' ? 1 : 0;
    const bTemplate = path.basename(path.dirname(b)).toLowerCase() === 'template' ? 1 : 0;
    return aTemplate - bTemplate;
  });
}
function characterCandidates(seed) {
  const openFiles = openFilePaths(seed), current = [], detected = [], seen = new Set(), add = (list, filename) => { const resolved = path.resolve(filename || ''); if (!filename || seen.has(resolved.toLowerCase()) || !isCharacterDef(resolved)) return; seen.add(resolved.toLowerCase()); list.push(resolved); };
  for (const filename of openFiles) add(current, nearestCharacterDef(filename));
  const roots = new Set();
  for (const start of [...openFiles, ...(vscode.workspace.workspaceFolders || []).map((folder) => folder.uri.fsPath)]) { const root = gameRoot(start); if (root) roots.add(root); }
  for (const root of roots) for (const filename of characterDefs(root)) add(detected, filename);
  const sort = (a, b) => path.basename(path.dirname(a)).localeCompare(path.basename(path.dirname(b)), undefined, { numeric: true });
  // A shared folder can contain a valid template DEF and often remains open beside
  // the real character.  Keep the open-file discovery order, but never let that
  // template become the default "currently open character" while a concrete
  // character is also open.  This is especially important when focus is inside a
  // custom SFF/AIR webview, because VS Code then has no activeTextEditor to rank.
  current.splice(0, current.length, ...rankCurrentCandidates(current));
  detected.sort(sort);
  return { current, detected };
}
function item(filename, current = false) { const name = path.basename(path.dirname(filename)); return { label: current ? `$(play) Use currently open character — ${name}` : name, description: filename, filename, current, alwaysShow: current }; }
async function browseCharacterDef(seed, title = 'Choose a character DEF', mode = '') {
  const start = seed?.fsPath || vscode.window.activeTextEditor?.document.fileName || (vscode.workspace.workspaceFolders || [])[0]?.uri.fsPath || '', root = gameRoot(start);
  const defaultUri = root ? vscode.Uri.file(path.join(root, 'chars')) : undefined;
  const options = { title, defaultUri, filters: { 'IKEMEN character definition': ['def'] }, extensions: ['def'], predicate: isCharacterDef, maxDepth: 4, invalidMessage: 'That file is not a main character DEF. Choose a DEF whose [Files] section assigns the character’s sprite, animation, constants, or states.', emptyMessage: 'No main character DEF was found in that folder or its child folders.' };
  if (mode === 'folder') {
    const picked = await vscode.window.showOpenDialog({ title: 'Choose a character or game folder', defaultUri, canSelectMany: false, canSelectFiles: false, canSelectFolders: true });
    return picked?.[0] ? chooseFromFolder(picked[0].fsPath, options) : '';
  }
  if (mode === 'file') {
    const picked = await vscode.window.showOpenDialog({ title: 'Choose a character DEF', defaultUri, canSelectMany: false, canSelectFiles: true, canSelectFolders: false, filters: options.filters });
    const filename = picked?.[0]?.fsPath || '';
    if (filename && !isCharacterDef(filename)) { await vscode.window.showWarningMessage(options.invalidMessage); return ''; }
    return filename;
  }
  return chooseFileOrFolder(options);
}
async function chooseCharacterDef(seed, options = {}) {
  if (options.acceptExplicitSeed !== false && seed?.fsPath && /\.def$/i.test(seed.fsPath) && isCharacterDef(seed.fsPath)) return seed.fsPath;
  const candidates = characterCandidates(seed), items = [
    { label: '$(folder-opened) Browse character or game folder…', description: 'Search this folder and its character folders for a main DEF.', browse: 'folder', alwaysShow: true },
    { label: '$(file) Browse for character DEF…', description: 'Choose one main character DEF directly.', browse: 'file', alwaysShow: true },
    ...candidates.current.map((filename) => item(filename, true)),
    ...candidates.detected.map((filename) => item(filename, false))
  ];
  const picked = await vscode.window.showQuickPick(items, { title: options.title || 'Choose Character', placeHolder: candidates.current.length ? 'Use the currently open character, select another detected character, or browse.' : 'Select a detected character or browse for its main DEF.', matchOnDescription: true });
  return picked?.browse ? browseCharacterDef(seed, options.title, picked.browse) : picked?.filename || '';
}

module.exports = { isCharacterDef, nearestCharacterDef, openFilePaths, rankCurrentCandidates, characterCandidates, browseCharacterDef, chooseCharacterDef };
