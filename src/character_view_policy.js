'use strict';

const path = require('path');
const fs = require('fs');
const { registerAuthoringPanel, isClosingFile, contextOwnsFile } = require('./authoring_context_registry');
const registeredPanels = new Set();
const rememberedCode = new Map();
let synchronizing = false;
let configuredVscode = null;

function characterFolder(filename) {
  let current = path.dirname(path.resolve(filename || '.'));
  while (true) {
    const parent = path.dirname(current);
    if (path.basename(parent).toLowerCase() === 'chars') return current;
    if (parent === current) return '';
    current = parent;
  }
}

function characterLabel(filename) { return path.basename(characterFolder(filename) || path.dirname(path.resolve(filename || '.'))); }
function characterKey(filename) {
  const folder = characterFolder(filename);
  if (!folder || /^(?:template|common|shared)$/i.test(path.basename(folder))) return '';
  return folder.toLowerCase();
}

function reusableViewColumn(sessions, fallback) {
  for (const session of sessions || []) {
    const column = session && (session.viewColumn || session.panel && session.panel.viewColumn);
    if (Number.isInteger(column) && column > 0) return column;
  }
  return fallback;
}

function sourceColumnFor(viewerColumn, beside) {
  return Number.isInteger(viewerColumn) && viewerColumn > 1 ? viewerColumn - 1 : beside;
}

function matchingPeer(entries, active, foreign) {
  return [...entries].find((entry) => entry !== active && entry !== foreign
    && entry.characterKey === active.characterKey
    && entry.kind === foreign.kind
    && entry.panel && foreign.panel
    && entry.panel.viewColumn === foreign.panel.viewColumn);
}

function rememberCodeFile(filename, column) {
  const key = characterKey(filename);
  if (!key || !Number.isInteger(column) || column < 1) return false;
  if (!rememberedCode.has(key)) rememberedCode.set(key, new Map());
  rememberedCode.get(key).set(column, path.resolve(filename));
  return true;
}
function forgetCharacter(filename) { const key = characterKey(filename) || String(filename || '').toLowerCase(); return rememberedCode.delete(key); }

function defaultCharacterSource(folder) {
  if (!folder) return '';
  try {
    const defs = fs.readdirSync(folder).filter((name) => /\.def$/i.test(name)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return defs.length ? path.join(folder, defs[0]) : '';
  } catch (_) { return ''; }
}

async function synchronizeCodeEditors(active) {
  const vscode = configuredVscode;
  if (!vscode || !active.characterKey) return;
  const saved = rememberedCode.get(active.characterKey) || new Map();
  const fallback = defaultCharacterSource(active.characterFolder);
  for (const editor of vscode.window.visibleTextEditors || []) {
    const filename = editor.document && editor.document.fileName;
    const foreignKey = characterKey(filename);
    if (!foreignKey || foreignKey === active.characterKey || editor.viewColumn === active.panel?.viewColumn) continue;
    const target = saved.get(editor.viewColumn) || fallback;
    if (!target || !fs.existsSync(target)) continue;
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(target));
    await vscode.window.showTextDocument(document, { viewColumn: editor.viewColumn, preview: false, preserveFocus: true });
  }
}

async function activateCharacter(entry) {
  if (synchronizing || !entry.characterKey || isClosingFile(entry.filename)) return;
  synchronizing = true;
  try {
    for (const foreign of [...registeredPanels].filter((item) => item !== entry && item.panel && item.panel.visible && item.characterKey && item.characterKey !== entry.characterKey)) {
      const replacement = matchingPeer(registeredPanels, entry, foreign);
      if (replacement) replacement.panel.reveal(replacement.panel.viewColumn, true);
    }
    await synchronizeCodeEditors(entry);
    if (typeof entry.onActivate === 'function') await entry.onActivate(entry);
  } finally { synchronizing = false; }
}

function ownerDefValue(value) { return typeof value === 'string' && path.isAbsolute(value) && path.extname(value).toLowerCase() === '.def' ? path.resolve(value) : ''; }

function registerCharacterPanel(panel, filename, kind, onActivate, options = {}) {
  const folder = characterFolder(filename);
  const ownerDefs = new Set((options.ownerDefs || [options.ownerDef]).map(ownerDefValue).filter(Boolean));
  const entry = { panel, filename: path.resolve(filename), kind, characterFolder: folder, characterKey: characterKey(filename), onActivate, onOwnersChanged: typeof options.onOwnersChanged === 'function' ? options.onOwnersChanged : null, ownerDefs, standalone: options.standalone === true && !ownerDefs.size, restoredUnowned: options.restoredUnowned === true && !ownerDefs.size };
  registeredPanels.add(entry);
  const exactOwner=[...ownerDefs][0]||'';
  if (entry.characterKey || exactOwner) { const root=exactOwner?path.dirname(exactOwner):folder;registerAuthoringPanel(panel, { type: 'character', key: root, label: exactOwner?path.basename(root):characterLabel(filename), root, ownerDef:exactOwner, files: [filename] }); }
  panel.onDidChangeViewState((event) => { if (event.webviewPanel.active) activateCharacter(entry); });
  panel.onDidDispose(() => registeredPanels.delete(entry));
  return entry;
}

function addCharacterPanelOwner(panel, ownerDef) {
  const exact=ownerDefValue(ownerDef),entry=[...registeredPanels].find(item=>item.panel===panel);if(!entry||!exact)return false;
  entry.ownerDefs.add(exact);entry.standalone=false;entry.restoredUnowned=false;
  const root=path.dirname(exact);registerAuthoringPanel(panel,{type:'character',key:root,label:path.basename(root),root,ownerDef:exact,files:[entry.filename]});
  entry.onOwnersChanged?.([...entry.ownerDefs]);
  return true;
}

function characterPanelOwners(panel) { const entry=[...registeredPanels].find(item=>item.panel===panel);return entry?[...entry.ownerDefs]:[]; }

function rebindCharacterPanel(panel, filename, ownerDefs = []) {
  const entry=[...registeredPanels].find(item=>item.panel===panel);
  if(!entry)return false;
  const exactFilename=path.resolve(filename),exactOwners=new Set((ownerDefs||[]).map(ownerDefValue).filter(Boolean));
  entry.filename=exactFilename;entry.characterFolder=characterFolder(exactFilename);entry.characterKey=characterKey(exactFilename);
  entry.ownerDefs=exactOwners;entry.standalone=!exactOwners.size;entry.restoredUnowned=false;
  const exactOwner=[...exactOwners][0]||'',root=exactOwner?path.dirname(exactOwner):entry.characterFolder;
  if(root)registerAuthoringPanel(panel,{type:'character',key:exactOwner||root,label:path.basename(root),root,ownerDef:exactOwner,files:[exactFilename]});
  entry.onOwnersChanged?.([...exactOwners]);
  return true;
}

// Asset viewers retain their exact source filename even when the historical
// character-key heuristic intentionally leaves template/common/shared folders
// unbound. Character Workbench close uses this bounded file-containment query
// to adopt those panels without claiming unrelated project tools.
function matchingCharacterPanels(context) {
  if (!context || context.type !== 'character') return [];
  const owner=ownerDefValue(context.ownerDef);
  return [...registeredPanels].filter((entry) => {
    if(!entry.panel)return false;
    if(entry.ownerDefs.size)return Boolean(owner&&entry.ownerDefs.has(owner)&&entry.ownerDefs.size===1);
    if(entry.standalone||entry.restoredUnowned)return false;
    return contextOwnsFile(context, entry.filename);
  });
}

function sharedCharacterPanels(context) { const owner=ownerDefValue(context?.ownerDef);return owner?[...registeredPanels].filter(entry=>entry.panel&&entry.ownerDefs.has(owner)&&entry.ownerDefs.size>1):[]; }
function restoredUnownedCharacterPanels() { return [...registeredPanels].filter(entry=>entry.panel&&entry.restoredUnowned); }
function releaseCharacterPanelOwner(context) { const owner=ownerDefValue(context?.ownerDef);if(!owner)return 0;let released=0;for(const entry of registeredPanels)if(entry.ownerDefs.delete(owner)){released++;entry.onOwnersChanged?.([...entry.ownerDefs]);}return released; }

function hasCharacterPanel(panel) {
  return [...registeredPanels].some((entry) => entry.panel === panel);
}

function configureCharacterCodeSync(vscode) {
  if (configuredVscode) return { dispose() {} };
  configuredVscode = vscode;
  return vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (!editor || editor.document?.uri?.scheme !== 'file') return;
    const filename = editor.document.fileName, folder = characterFolder(filename);
    if (!folder) return;
    rememberCodeFile(filename, editor.viewColumn);
    activateCharacter({ panel: { viewColumn: editor.viewColumn }, filename, kind: 'code', characterFolder: folder, characterKey: characterKey(filename) }).catch(() => {});
  });
}

module.exports = { characterFolder, characterLabel, characterKey, reusableViewColumn, sourceColumnFor, matchingPeer, rememberCodeFile, forgetCharacter, registerCharacterPanel, addCharacterPanelOwner, characterPanelOwners, rebindCharacterPanel, matchingCharacterPanels, sharedCharacterPanels, restoredUnownedCharacterPanels, releaseCharacterPanelOwner, hasCharacterPanel, configureCharacterCodeSync };
