'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { findGameRoot } = require('./ikemen_hub');
const { chooseCharacterDef } = require('./character_picker');
const { buildCharacterDependencyModel } = require('./character_dependency_model');
const metadataRegistry = require('./metadata_registry');
const projectContext = require('./project_context_model');
const projectRegistry = require('./project_registry');
const { characterFolder, rememberCodeFile, forgetCharacter, configureCharacterCodeSync } = require('./character_view_policy');
const { normalized, openContexts, currentContext, contextOwnsFile, disposeContextPanels, beginContextClose } = require('./authoring_context_registry');
const { preferredViewerColumn } = require('./viewer_group');

const KEY = 'ikemenZss.characterWorkbenches.v1';
const WORKBENCH_COLUMNS = new Map();
const SOURCE_EXTENSIONS = new Set(['.def', '.zss', '.cns', '.inp', '.cmd', '.air', '.sff', '.act', '.snd', '.txt', '.md', '.json', '.csv']);
const CATEGORIES = [
  ['Code', new Set(['.def', '.zss', '.cns', '.inp', '.cmd'])], ['Animations', new Set(['.air'])], ['Sprites', new Set(['.sff'])],
  ['Palettes', new Set(['.act'])], ['Sound', new Set(['.snd'])], ['Notes and Data', new Set(['.txt', '.md', '.json', '.csv'])], ['Other', new Set()]
];
const SESSION_OPTIONS = [
  { id: 'essentials', label: 'Character essentials', description: 'DEF, AIR text, connected ZSS/CNS/CMD code, assigned SFF, and assigned SND', picked: true },
  { id: 'connections', label: 'Character connection tree', description: 'See every DEF-assigned asset and cross-file code relationship', picked: true },
  { id: 'health', label: 'Character health and cleanup', description: 'Audit duplicate, shadowed, unknown, malformed, empty, and missing character data' },
  { id: 'animation', label: 'Repair animations or disappearing frames', description: 'AIR visual editor, SFF, AIR text, and AIR/SFF Problems' },
  { id: 'attacks', label: 'Adjust attack properties', description: 'Move Constants editor, constants, and AIR visual preview' },
  { id: 'throws', label: 'Author a throw interaction', description: 'Dual P1/P2 timelines, binds, parts, events, and reviewed throw code' },
  { id: 'sound', label: 'Work on sounds', description: 'Assigned and character-local SND archives' },
  { id: 'code', label: 'Open every connected code file', description: 'All DEF-assigned ZSS, CNS, command, and DEF files' },
  { id: 'workflow', label: 'Workflow and QA', description: 'Production checklist, evidence, testing, and signoff' }
];

function activeFile() { return vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri.scheme === 'file' ? vscode.window.activeTextEditor.document.fileName : null; }
function load(context) { return context.workspaceState.get(KEY, []); }
async function save(context, profiles) { await context.workspaceState.update(KEY, profiles); }

function configuredExtensions(name) { return new Set((vscode.workspace.getConfiguration('ikemenZss').get(name, []) || []).map((item) => `.${String(item).replace(/^\./, '').toLowerCase()}`).filter((item) => item.length > 1)); }
function collectFiles(folder) {
  const files = [];
  const sourceExtensions = new Set([...SOURCE_EXTENSIONS, ...configuredExtensions('additionalSourceExtensions'), ...configuredExtensions('additionalCodeExtensions')]);
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'backup' || entry.name === 'backups') continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (sourceExtensions.has(path.extname(entry.name).toLowerCase())) files.push(full);
    }
  };
  visit(folder);
  return files.sort((a, b) => a.localeCompare(b));
}

function assignmentRole(profile, filename) {
  const target = path.resolve(filename).toLowerCase();
  for (const [key, files] of Object.entries(profile?.assignments || {})) if ((files || []).some((item) => path.resolve(item).toLowerCase() === target)) return key.toLowerCase();
  return '';
}
function categoryFor(filename, profile) {
  const role = assignmentRole(profile, filename);
  if (role === 'sprite') return 'Sprites';
  if (role === 'anim') return 'Animations';
  if (role === 'sound' || role === 'snd') return 'Sound';
  if (/^pal\d*$/.test(role)) return 'Palettes';
  if (role === 'cmd' || role === 'command' || role === 'cns' || role === 'constants' || role === 'common' || /^st\d*$/.test(role)) return 'Code';
  const ext = path.extname(filename).toLowerCase();
  if (configuredExtensions('additionalCodeExtensions').has(ext)) return 'Code';
  return (CATEGORIES.find(([, extensions]) => extensions.has(ext)) || ['Other'])[0];
}
function projectIdentity(defPath) {
  const gameRoot = findGameRoot(defPath) || path.dirname(defPath);
  let registry = projectRegistry.createDefault(), registryPath = '';
  try { registryPath = metadataRegistry.find(defPath) || ''; if (registryPath) registry = metadataRegistry.read(registryPath).registry; } catch (_) {}
  const detected = projectContext.contextFor(defPath, gameRoot, registry);
  return { gameRoot, projectId: detected.project?.id || 'universal', projectName: detected.project?.name || 'Universal Template', registryPath };
}
function profileFromDef(defPath) {
  const folder = path.dirname(defPath), name = path.basename(folder), dependency = buildCharacterDependencyModel(defPath), assignments = {};
  for (const edge of dependency.edges.filter((item) => item.type === 'assignment' && item.from === dependency.root)) {
    const match = /^\[Files\]\s+(.+)$/i.exec(edge.label); if (!match) continue;
    const key = match[1].toLowerCase(); if (!assignments[key]) assignments[key] = []; assignments[key].push(edge.to);
  }
  return { id: folder.toLowerCase(), name, folder, defPath, ...projectIdentity(defPath), files: collectFiles(folder), connectedFiles: dependency.nodes.filter((node) => node.exists).map((node) => node.filename), assignments, addedFiles: [] };
}

class Item extends vscode.TreeItem {
  constructor(label, collapsible, data = {}) { super(label, collapsible); Object.assign(this, data); }
}

class Provider {
  constructor(context) { this.context = context; this.change = new vscode.EventEmitter(); this.onDidChangeTreeData = this.change.event; }
  refresh() { this.change.fire(); }
  getTreeItem(item) { return item; }
  getChildren(item) {
    const profiles = load(this.context);
    if (!item) return profiles.length ? profiles.map((profile) => { const identity = profile.projectName ? profile : projectIdentity(profile.defPath); const node = new Item(profile.name, vscode.TreeItemCollapsibleState.Collapsed, { profile, contextValue: 'ikemenWorkbench' }); node.description = `${identity.projectName} · ${new Set([...(profile.files || []), ...(profile.addedFiles || [])]).size} files`; node.tooltip = `Game profile: ${identity.projectName} (${identity.projectId})\nGame root: ${identity.gameRoot || 'Not detected'}\nCharacter DEF: ${profile.defPath}`; node.iconPath = new vscode.ThemeIcon('window'); return node; }) : [new Item('Create from a character DEF…', vscode.TreeItemCollapsibleState.None, { command: { command: 'ikemen.workbench.create', title: 'Create Character Workbench' }, iconPath: new vscode.ThemeIcon('add') })];
    if (item.profile && !item.category) { const workflow = new Item('Production Workflow', vscode.TreeItemCollapsibleState.None, { profile: item.profile, contextValue: 'ikemenWorkbenchWorkflow', command: { command: 'ikemen.productionWorkflow.open', title: 'Open Production Workflow', arguments: [vscode.Uri.file(item.profile.defPath)] } }); workflow.description = 'next tasks and team progress'; workflow.iconPath = new vscode.ThemeIcon('checklist'); const health = new Item('Character Health & Cleanup', vscode.TreeItemCollapsibleState.None, { profile: item.profile, contextValue: 'ikemenWorkbenchHealth', command: { command: 'ikemen.characterHealth.open', title: 'Open Character Health & Cleanup', arguments: [vscode.Uri.file(item.profile.defPath)] } }); health.description = 'audit first, repair with preview'; health.iconPath = new vscode.ThemeIcon('shield'); const connections = new Item('Character Connection Tree', vscode.TreeItemCollapsibleState.None, { profile: item.profile, contextValue: 'ikemenWorkbenchConnections', command: { command: 'ikemen.characterDependencies.open', title: 'Open Character Connection Tree', arguments: [vscode.Uri.file(item.profile.defPath)] } }); connections.description = 'files, functions, and states'; connections.iconPath = new vscode.ThemeIcon('type-hierarchy'); return [workflow, health, connections, ...CATEGORIES.map(([category]) => { const count = allFiles(item.profile).filter((file) => categoryFor(file, item.profile) === category).length; if (!count) return null; const node = new Item(category, vscode.TreeItemCollapsibleState.Collapsed, { profile: item.profile, category, contextValue: 'ikemenWorkbenchCategory' }); node.description = String(count); node.iconPath = new vscode.ThemeIcon({ Code: 'code', Animations: 'play', Sprites: 'symbol-color', Palettes: 'symbol-color', Sound: 'unmute', 'Notes and Data': 'note' }[category]); return node; }).filter(Boolean)]; }
    if (item.profile && item.category) return allFiles(item.profile).filter((file) => categoryFor(file, item.profile) === item.category).map((file) => { const node = new Item(path.relative(item.profile.folder, file), vscode.TreeItemCollapsibleState.None, { profile: item.profile, file, contextValue: 'ikemenWorkbenchFile', command: { command: 'ikemen.workbench.openFile', title: 'Open Workbench File', arguments: [item.profile, file] } }); node.tooltip = file; node.resourceUri = vscode.Uri.file(file); return node; });
    return [];
  }
}

function allFiles(profile) { return [...new Set([...(profile.connectedFiles || []), ...(profile.files || []), ...(profile.addedFiles || [])])].filter(fs.existsSync); }
function assigned(profile, key) { return (profile.assignments?.[key] || []).filter(fs.existsSync); }
function targetColumn() { return vscode.window.activeTextEditor && vscode.window.activeTextEditor.viewColumn || vscode.window.tabGroups?.activeTabGroup?.viewColumn || vscode.ViewColumn.One; }
function sharedWorkbenchColumn() { return [...WORKBENCH_COLUMNS.values()].find((column) => Number.isInteger(column) && column > 0) || 0; }
function viewerColumnFor(sourceColumn) {
  const remembered = preferredViewerColumn(0, sourceColumn);
  if (remembered) return remembered;
  const empty = (vscode.window.tabGroups?.all || []).find((group) => group.viewColumn !== sourceColumn && !(group.tabs || []).length);
  return empty?.viewColumn || vscode.ViewColumn.Beside;
}

async function openFile(profile, filename, column) {
  column = column || WORKBENCH_COLUMNS.get(profile.id) || targetColumn();
  const ext = path.extname(filename).toLowerCase();
  // Source files belong to the character's code group. Asset workspaces belong
  // to the shared visual group (or a new group beside source when none exists).
  const viewerColumn = viewerColumnFor(column);
  if (ext === '.sff') return vscode.commands.executeCommand('sff.openViewer', vscode.Uri.file(filename), viewerColumn);
  if (ext === '.snd') return vscode.commands.executeCommand('snd.openViewer', vscode.Uri.file(filename), viewerColumn);
  if (ext === '.act') return vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(filename));
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filename));
  rememberCodeFile(filename, column);
  return vscode.window.showTextDocument(document, { viewColumn: column, preview: false, preserveFocus: false });
}

function coreFiles(profile) {
  const files = allFiles(profile), selected = [];
  const add = (file) => { if (file && !selected.includes(file)) selected.push(file); };
  add(profile.defPath);
  for (const key of ['sprite', 'anim', 'cmd', 'cns']) for (const file of assigned(profile, key)) add(file);
  files.filter((file) => categoryFor(file, profile) === 'Code').slice(0, 8).forEach(add);
  return selected;
}

async function openWorkbench(profile, allCode = false) {
  const previousColumn = sharedWorkbenchColumn(), column = previousColumn || targetColumn();
  WORKBENCH_COLUMNS.set(profile.id, column);
  const files = allCode ? allFiles(profile).filter((file) => categoryFor(file, profile) === 'Code' || path.extname(file).toLowerCase() === '.air') : coreFiles(profile);
  if (!files.length) return vscode.window.showWarningMessage(`${profile.name} has no available workbench files.`);
  for (const file of files) await openFile(profile, file, column);
  const sprite = allFiles(profile).find((file) => path.extname(file).toLowerCase() === '.sff');
  if (sprite) await openFile(profile, sprite, column);
  vscode.window.showInformationMessage(`${profile.name} workbench opened with ${files.length + (sprite && !files.includes(sprite) ? 1 : 0)} core tab(s). Use the IKEMEN sidebar for the rest.`);
}

async function chooseSessionOptions(profile) {
  const remembered = new Set(profile.lastSession || []), hasRemembered = remembered.size > 0;
  const picked = await vscode.window.showQuickPick(SESSION_OPTIONS.map((item) => ({
    label: item.label, description: item.description, id: item.id,
    picked: hasRemembered ? remembered.has(item.id) : Boolean(item.picked)
  })), {
    title: `${profile.name} — Choose what to work on`,
    placeHolder: 'Select one or more focused workspaces. Your choices are remembered for this character.',
    canPickMany: true,
    matchOnDescription: true
  });
  return picked && picked.map((item) => item.id);
}

async function openCharacterSession(profile, context, provider) {
  const choices = await chooseSessionOptions(profile); if (!choices?.length) return;
  const selected = new Set(choices), previousColumn = sharedWorkbenchColumn(), column = previousColumn || targetColumn(), opened = new Set(); WORKBENCH_COLUMNS.set(profile.id, column);
  const open = async (filename) => { if (!filename || opened.has(filename.toLowerCase()) || !fs.existsSync(filename)) return; opened.add(filename.toLowerCase()); await openFile(profile, filename, column); };
  const constants = assigned(profile, 'cns')[0], air = assigned(profile, 'anim')[0], sprite = assigned(profile, 'sprite')[0], sounds = assigned(profile, 'sound');
  if (selected.has('essentials')) {
    await open(profile.defPath); await open(constants); await open(air);
    for (const file of (profile.connectedFiles || []).filter((filename) => categoryFor(filename, profile) === 'Code')) await open(file);
    await open(sprite); for (const sound of sounds) await open(sound);
  }
  if (selected.has('animation')) {
    await open(sprite); await open(air);
    if (air) await vscode.commands.executeCommand('air.openAnimationPreview', vscode.Uri.file(air));
    await vscode.commands.executeCommand('workbench.actions.view.problems');
  }
  if (selected.has('attacks')) {
    await open(constants);
    await vscode.commands.executeCommand('ikemen.moveLab.open', vscode.Uri.file(profile.defPath), { preset: true, reference: { defPath: profile.defPath, mode: 'attack' } });
  }
  if (selected.has('throws')) {
    await open(air); await open(sprite);
    await vscode.commands.executeCommand('ikemen.throwCreator.open', vscode.Uri.file(profile.defPath));
  }
  if (selected.has('sound')) {
    const localSounds = allFiles(profile).filter((file) => path.extname(file).toLowerCase() === '.snd');
    for (const sound of [...sounds, ...localSounds]) await open(sound);
  }
  if (selected.has('code')) {
    for (const file of (profile.connectedFiles || []).filter((filename) => categoryFor(filename, profile) === 'Code')) await open(file);
  }
  if (selected.has('connections')) await vscode.commands.executeCommand('ikemen.characterDependencies.open', vscode.Uri.file(profile.defPath));
  if (selected.has('health')) await vscode.commands.executeCommand('ikemen.characterHealth.open', vscode.Uri.file(profile.defPath));
  if (selected.has('workflow')) await vscode.commands.executeCommand('ikemen.productionWorkflow.open', vscode.Uri.file(profile.defPath));
  const profiles = load(context).map((entry) => entry.id === profile.id ? { ...entry, lastSession: choices } : entry); await save(context, profiles); provider.refresh();
  vscode.window.showInformationMessage(`${profile.name} session opened: ${choices.map((id) => SESSION_OPTIONS.find((item) => item.id === id)?.label).filter(Boolean).join(', ')}.`);
}

async function chooseDef() {
  return chooseCharacterDef(undefined, { title: 'Create Character Workbench' });
}

function tabFilename(tab) {
  const input = tab && tab.input;
  return (input?.uri || input?.modified || input?.original)?.fsPath || '';
}

function characterContext(profile) {
  const folder = path.resolve(profile.folder || path.dirname(profile.defPath));
  return { type: 'character', key: normalized(folder), label: profile.name || path.basename(folder), root: folder, files: allFiles(profile) };
}

async function chooseCloseContext(context, requestedType = '') {
  const active = activeFile(), activeFolder = active && characterFolder(active);
  if ((!requestedType || requestedType === 'character') && activeFolder) {
    const profile = load(context).find((item) => normalized(item.folder) === normalized(activeFolder));
    return profile ? characterContext(profile) : { type: 'character', key: normalized(activeFolder), label: path.basename(activeFolder), root: activeFolder, files: [active] };
  }
  const current = currentContext();
  if (current && (!requestedType || current.type === requestedType)) return current;
  const choices = [];
  if (!requestedType || requestedType === 'character') for (const profile of load(context)) choices.push({ label: `$(person) ${profile.name}`, description: 'Character', context: characterContext(profile) });
  for (const entry of openContexts()) if ((!requestedType || entry.type === requestedType) && !choices.some((item) => item.context.type === entry.type && item.context.key === entry.key)) choices.push({ label: `$(${entry.type === 'stage' ? 'layers' : 'window'}) ${entry.label}`, description: entry.type, context: entry });
  if (!choices.length) return null;
  const picked = choices.length === 1 ? choices[0] : await vscode.window.showQuickPick(choices, { title: requestedType ? `Close ${requestedType}` : 'Close Current Authoring Context', placeHolder: 'Choose the character, stage, screenpack, or workspace to close' });
  return picked && picked.context;
}

async function closeAuthoringContext(context, requestedType = '', provided = null) {
  const profile = provided && (provided.profile || provided);
  const selected = profile && (profile.folder || profile.defPath) ? characterContext(profile) : await chooseCloseContext(context, requestedType);
  if (!selected) return vscode.window.showInformationMessage(`No open ${requestedType || 'authoring'} context was found.`);
  const visualPanels=require('./authoring_context_registry').matchingPanels(selected).map(entry=>entry.panel);
  if(!await require('./viewer_close').prepare(visualPanels,vscode))return;
  const finishClose = beginContextClose(selected);
  const closedTabs = new Set();let panels = 0;
  try {
    // Keep visual drafts alive until native document closure succeeds.
    // The close guard prevents automatic source/viewer reopening meanwhile.
    for (let pass = 0; pass < 4; pass += 1) {
      const tabs = [];
      for (const group of vscode.window.tabGroups?.all || []) for (const tab of group.tabs || []) {
        const filename = tabFilename(tab); if (filename && contextOwnsFile(selected, filename)) tabs.push(tab);
      }
      if (!tabs.length) break;
      if (!await vscode.window.tabGroups.close(tabs, true)) return;
      for(const tab of tabs)closedTabs.add(tab);
      await Promise.resolve();
    }
    const remaining = (vscode.window.tabGroups?.all || []).some(group => (group.tabs || []).some(tab => { const file = tabFilename(tab); return file && contextOwnsFile(selected, file); }));
    if (remaining) return vscode.window.showWarningMessage('Some tabs remain open. The character session was kept.');
    panels = disposeContextPanels(selected);
    if (selected.type === 'character') {
      forgetCharacter(selected.key);
      for (const [id] of WORKBENCH_COLUMNS) if (normalized(id) === selected.key) WORKBENCH_COLUMNS.delete(id);
    }
  } finally { finishClose(); }
  return vscode.window.showInformationMessage(`Closed ${selected.label}: ${closedTabs.size} tab(s)${panels ? ` and ${panels} visual workspace(s)` : ''}.`);
}

function registerCharacterWorkbenches(context) {
  const provider = new Provider(context);
  context.subscriptions.push(configureCharacterCodeSync(vscode));
  const registerDef = async (value) => {
    const defPath = value && value.fsPath ? value.fsPath : value;
    if (!defPath || !fs.existsSync(defPath)) return;
    const previous = load(context).find((item) => item.id === path.dirname(defPath).toLowerCase()), profile = { ...profileFromDef(defPath), addedFiles: previous?.addedFiles || [], lastSession: previous?.lastSession || [] }, profiles = load(context).filter((item) => item.id !== profile.id);
    profiles.push(profile); await save(context, profiles); provider.refresh(); await openCharacterSession(profile, context, provider);
  };
  const chooseAndOpen = async (title = 'Open Character') => { const defPath = await chooseCharacterDef(undefined, { title }); if (defPath) await registerDef(defPath); };
  context.subscriptions.push(
    vscode.window.createTreeView('ikemen.characterWorkbenches', { treeDataProvider: provider, showCollapseAll: true }),
    vscode.commands.registerCommand('ikemen.character.open', () => chooseAndOpen('Open Character')),
    vscode.commands.registerCommand('ikemen.character.close', (item) => closeAuthoringContext(context, 'character', item)),
    vscode.commands.registerCommand('ikemen.stage.close', () => closeAuthoringContext(context, 'stage')),
    vscode.commands.registerCommand('ikemen.context.closeCurrent', () => closeAuthoringContext(context)),
    vscode.commands.registerCommand('ikemen.workbench.create', () => chooseAndOpen('Create Character Workbench')),
    vscode.commands.registerCommand('ikemen.workbench.registerDef', registerDef),
    vscode.commands.registerCommand('ikemen.workbench.open', (item) => openCharacterSession(item.profile || item, context, provider)),
    vscode.commands.registerCommand('ikemen.workbench.openAllCode', (item) => openWorkbench(item.profile || item, true)),
    vscode.commands.registerCommand('ikemen.workbench.openFile', (profile, file) => openFile(profile, file)),
    vscode.commands.registerCommand('ikemen.workbench.refresh', async (item) => { const wanted = item && (item.profile || item); const profiles = load(context).map((profile) => { if (wanted && profile.id !== wanted.id) return profile; const refreshed = profileFromDef(profile.defPath); return { ...refreshed, addedFiles: profile.addedFiles || [], lastSession: profile.lastSession || [] }; }); await save(context, profiles); provider.refresh(); }),
    vscode.commands.registerCommand('ikemen.workbench.addCurrentFile', async (item) => { const profile = item.profile || item, file = activeFile(); if (!file) return; const profiles = load(context).map((entry) => entry.id === profile.id ? { ...entry, addedFiles: [...new Set([...(entry.addedFiles || []), file])] } : entry); await save(context, profiles); provider.refresh(); }),
    vscode.commands.registerCommand('ikemen.workbench.remove', async (item) => { const profile = item.profile || item, answer = await vscode.window.showWarningMessage(`Remove the saved “${profile.name}” workbench? No project files will be deleted.`, { modal: true }, 'Remove Workbench'); if (answer !== 'Remove Workbench') return; await save(context, load(context).filter((entry) => entry.id !== profile.id)); provider.refresh(); })
  );
}

module.exports = { registerCharacterWorkbenches, collectFiles, projectIdentity, profileFromDef, coreFiles, SESSION_OPTIONS };
