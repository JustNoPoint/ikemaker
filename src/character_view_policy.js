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
  if (isClosingFile(entry.filename)) return;
  if (entry.verifiedOwner) {
    if (typeof entry.onActivate === 'function') await entry.onActivate(entry);
    return;
  }
  if (synchronizing || !entry.characterKey) return;
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

// Recover the navigation identity of an independently opened character asset.
function assignedCharacterDef(folder,filename){
  if(!folder)return '';
  try{
    const matches=fs.readdirSync(folder).filter(name=>/\.def$/i.test(name)).map(name=>path.join(folder,name)).filter(def=>{
      const assigned=require('./related_work').resolveAssigned(def);
      return [assigned.sff,assigned.air,assigned.snd,...assigned.code].some(file=>file&&path.relative(file,filename)==='');
    });
    return matches.length===1?matches[0]:'';
  }catch{return '';}
}

function panelEntry(panel) {
  return [...registeredPanels].find(entry => entry.panel === panel);
}

function verifiedOwner(value) {
  if (!value || typeof value.ownerDef !== 'string' || !path.isAbsolute(value.ownerDef) ||
      !Number.isSafeInteger(value.player) || value.player < 1 ||
      typeof value.assetPath !== 'string' || typeof value.ownerPath !== 'string') return null;
  return { ...value, ownerDef: path.resolve(value.ownerDef) };
}

function ownerSet(values, verified) {
  const owners = values.map(ownerDefValue).filter(Boolean);
  if (verified && values.some(value => typeof value === 'string' && path.isAbsolute(value) &&
      path.relative(value, verified.ownerDef) === '')) owners.push(verified.ownerDef);
  return new Set(owners);
}

function verifiedOwnerPresentation(panel) {
  const entry = panelEntry(panel), verified = entry?.verifiedOwner;
  if (!verified) return null;
  const otherCount = [...entry.ownerDefs].filter(owner => path.relative(owner, verified.ownerDef) !== '').length;
  const others = otherCount ? ` (+${otherCount} other ${otherCount === 1 ? 'owner' : 'owners'})` : '';
  return {
    title: `${path.basename(entry.filename)} · ${path.basename(verified.ownerDef)} (P${verified.player}, verified)${others}`,
    header: `Asset: ${verified.assetPath} · Verified owner: ${verified.ownerPath} · Player ${verified.player}${others}`
  };
}

function publishVerifiedOwner(panel, notify = true) {
  const entry = panelEntry(panel);
  if (!entry) return null;
  const presentation = verifiedOwnerPresentation(panel);
  if (presentation) {
    if (panel.title !== entry.verifiedTitle) entry.ordinaryTitle = panel.title;
    panel.title = entry.verifiedTitle = presentation.title;
  } else if (entry.verifiedTitle) {
    if (panel.title === entry.verifiedTitle) panel.title = entry.ordinaryTitle;
    entry.verifiedTitle = undefined;
  }
  if (notify) panel.webview?.postMessage?.({ type: 'verifiedOwnerNavigation', header: presentation?.header || '' });
  return presentation;
}

function registerOwnerContext(entry, owner, allowUnkeyed = false) {
  if (!owner && !entry.characterKey && !(allowUnkeyed && entry.characterFolder)) return;
  const root = owner ? path.dirname(owner) : entry.characterFolder;
  registerAuthoringPanel(entry.panel, {
    type: 'character', key: owner || assignedCharacterDef(root, entry.filename) || root,
    label: owner ? path.basename(root) : characterLabel(entry.filename), root,
    ownerDef: owner, files: [entry.filename]
  });
}

function setVerifiedOwnerNavigation(panel, value) {
  const entry = panelEntry(panel);
  if (!entry) return false;
  const next = verifiedOwner(value), previous = entry.verifiedOwner;
  if (!next && !previous) return false;
  if (next) entry.ownerDefs.add(next.ownerDef);
  entry.verifiedOwner = next;
  registerOwnerContext(entry, next?.ownerDef || [...entry.ownerDefs][0] || '');
  publishVerifiedOwner(panel);
  return true;
}

function registerCharacterPanel(panel, filename, kind, onActivate, options = {}) {
  const folder = characterFolder(filename);
  const verified = verifiedOwner(options.verifiedOwnerNavigation);
  const ownerDefs = ownerSet(options.ownerDefs || [options.ownerDef], verified);
  const entry = { panel, filename: path.resolve(filename), kind, characterFolder: folder, characterKey: characterKey(filename), onActivate, onOwnersChanged: typeof options.onOwnersChanged === 'function' ? options.onOwnersChanged : null, ownerDefs, standalone: options.standalone === true && !ownerDefs.size, restoredUnowned: options.restoredUnowned === true && !ownerDefs.size };
  registeredPanels.add(entry);
  entry.verifiedOwner = verified && ownerDefs.has(verified.ownerDef) ? verified : null;
  registerOwnerContext(entry, entry.verifiedOwner?.ownerDef || [...ownerDefs][0] || '');
  if (entry.verifiedOwner) publishVerifiedOwner(panel, false);
  panel.onDidChangeViewState((event) => { if (event.webviewPanel.active) activateCharacter(entry); });
  panel.onDidDispose(() => registeredPanels.delete(entry));
  return entry;
}

function addCharacterPanelOwner(panel, ownerDef) {
  const exact=ownerDefValue(ownerDef),entry=[...registeredPanels].find(item=>item.panel===panel);if(!entry||!exact)return false;
  entry.ownerDefs.add(exact);entry.standalone=false;entry.restoredUnowned=false;
  registerOwnerContext(entry, entry.verifiedOwner?.ownerDef || exact);
  if (entry.verifiedOwner) publishVerifiedOwner(panel);
  entry.onOwnersChanged?.([...entry.ownerDefs]);
  return true;
}

function characterPanelOwners(panel) { const entry=[...registeredPanels].find(item=>item.panel===panel);return entry?[...entry.ownerDefs]:[]; }

function rebindCharacterPanel(panel, filename, ownerDefs = []) {
  const entry=[...registeredPanels].find(item=>item.panel===panel);
  if(!entry)return false;
  const exactFilename=path.resolve(filename), previousVerified=entry.verifiedOwner;
  const sameFile = path.relative(entry.filename, exactFilename) === '';
  const exactOwners = ownerSet(ownerDefs, sameFile ? previousVerified : null);
  entry.verifiedOwner = sameFile && previousVerified && exactOwners.has(previousVerified.ownerDef) ? previousVerified : null;
  entry.filename=exactFilename;entry.characterFolder=characterFolder(exactFilename);entry.characterKey=characterKey(exactFilename);
  entry.ownerDefs=exactOwners;entry.standalone=!exactOwners.size;entry.restoredUnowned=false;
  registerOwnerContext(entry, entry.verifiedOwner?.ownerDef || [...exactOwners][0] || '', true);
  if (previousVerified) publishVerifiedOwner(panel);
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
function releaseCharacterPanelOwner(context) { const owner=ownerDefValue(context?.ownerDef);if(!owner)return 0;let released=0;for(const entry of registeredPanels)if(entry.ownerDefs.delete(owner)){released++;if(entry.verifiedOwner?.ownerDef===owner)setVerifiedOwnerNavigation(entry.panel,null);else if(entry.verifiedOwner)publishVerifiedOwner(entry.panel);entry.onOwnersChanged?.([...entry.ownerDefs]);}return released; }

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

module.exports = { characterFolder, characterLabel, characterKey, reusableViewColumn, sourceColumnFor, matchingPeer, rememberCodeFile, forgetCharacter, registerCharacterPanel, addCharacterPanelOwner, characterPanelOwners, rebindCharacterPanel, matchingCharacterPanels, sharedCharacterPanels, restoredUnownedCharacterPanels, releaseCharacterPanelOwner, hasCharacterPanel, configureCharacterCodeSync, setVerifiedOwnerNavigation, verifiedOwnerPresentation };
