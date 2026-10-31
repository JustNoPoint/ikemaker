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
const { normalized, openContexts, currentContext, contextOwnsFile, disposeContextPanels, beginContextClose, isClosingOwner } = require('./authoring_context_registry');

const KEY = 'ikemenZss.characterWorkbenches.v1';
const WORKBENCH_COLUMNS = new Map();
const SESSION_GENERATIONS = new Map();
const SOURCE_EXTENSIONS = new Set(['.def', '.zss', '.cns', '.inp', '.cmd', '.lua', '.air', '.sff', '.act', '.snd', '.txt', '.md', '.json', '.csv']);
const CATEGORIES = [
  ['Code', new Set(['.def', '.zss', '.cns', '.inp', '.cmd', '.lua'])], ['Animations', new Set(['.air'])], ['Sprites', new Set(['.sff'])],
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
  { id: 'code', label: 'Open every connected code file', description: 'All DEF-assigned ZSS, CNS, command, Lua, and DEF files' },
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
function refreshedProfile(profile) {
  if (!profile?.defPath || !fs.existsSync(profile.defPath)) return profile;
  const refreshed = profileFromDef(profile.defPath);
  return { ...refreshed, addedFiles: profile.addedFiles || [], lastSession: profile.lastSession || [] };
}
function targetColumn() { return vscode.window.activeTextEditor && vscode.window.activeTextEditor.viewColumn || vscode.window.tabGroups?.activeTabGroup?.viewColumn || vscode.ViewColumn.One; }
function sharedWorkbenchColumn() { return [...WORKBENCH_COLUMNS.values()].find((column) => Number.isInteger(column) && column > 0) || 0; }
function groupedCodeFiles(profile, candidates) {
  const configured = configuredExtensions('additionalCodeExtensions');
  const supported = new Set(['.zss', '.cns', '.st', '.lua', '.cmd', '.inp', '.jnp', '.dat', '.def', '.air']);
  const result = [], seen = new Set();
  for (const filename of candidates || []) {
    if (!filename || !path.isAbsolute(filename)) continue;
    let canonical;
    try {
      const lexical = path.resolve(filename); canonical = fs.realpathSync.native ? fs.realpathSync.native(lexical) : fs.realpathSync(lexical);
      if (normalized(lexical) !== normalized(canonical) || !fs.statSync(canonical).isFile()) continue;
    } catch (_) { continue; }
    const ext = path.extname(canonical).toLowerCase();
    if (!supported.has(ext) && !(ext === '.txt' && configured.has(ext)) && !configured.has(ext)) continue;
    const identity = normalized(canonical); if (seen.has(identity)) continue;
    seen.add(identity); result.push(canonical);
  }
  return result.slice(0, 512);
}

async function openGroupedCode(profile, candidates, taskId = 'character-essentials') {
  const files = groupedCodeFiles(profile, candidates);
  if (!files.length) return null;
  const root = path.resolve(profile.folder || path.dirname(profile.defPath));
  return require('./authoring_workspace').openCharacterCodingSet({
    origin: 'character-essentials', taskId, sessionId: path.resolve(profile.defPath), files,
    context: { type: 'character', key: root, label: profile.name || path.basename(root), root, files }
  });
}

async function openFile(profile, filename, column, assetColumn = 0) {
  column = column || WORKBENCH_COLUMNS.get(profile.id) || targetColumn();
  const ext = path.extname(filename).toLowerCase();
  // Character startup is deliberately single-group. Users can detach an active
  // viewer afterwards from the universal More menu when a larger display makes
  // a second native window useful.
  const viewerColumn = assetColumn || column;
  if (ext === '.sff') return vscode.commands.executeCommand('sff.openViewer', vscode.Uri.file(filename), viewerColumn, undefined, { ownerDef: profile.defPath });
  if (ext === '.snd') return vscode.commands.executeCommand('snd.openViewer', vscode.Uri.file(filename), viewerColumn, undefined, undefined, { ownerDef: profile.defPath });
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
  profile = refreshedProfile(profile);
  const previousColumn = sharedWorkbenchColumn(), column = previousColumn || targetColumn();
  let assetColumn = column;
  const openInSession = async (filename) => {
    const opened = await openFile(profile, filename, column, assetColumn);
    const resolved = opened?.panel?.viewColumn || opened?.viewColumn;
    if (Number.isInteger(resolved) && resolved > 0) assetColumn = resolved;
    return opened;
  };
  WORKBENCH_COLUMNS.set(profile.id, column);
  const files = allCode ? allFiles(profile).filter((file) => categoryFor(file, profile) === 'Code' || path.extname(file).toLowerCase() === '.air') : coreFiles(profile);
  if (!files.length) return vscode.window.showWarningMessage(`${profile.name} has no available workbench files.`);
  const sourceFiles = files.filter((file) => !['.sff', '.snd', '.act'].includes(path.extname(file).toLowerCase()));
  const grouped = await openGroupedCode(profile, sourceFiles, allCode ? 'character-all-code' : 'character-workbench');
  const groupedColumn = grouped?.assetViewColumn || grouped?.viewColumn;
  if (Number.isInteger(groupedColumn) && groupedColumn > 0) assetColumn = groupedColumn;
  for (const file of files.filter((file) => ['.sff', '.snd', '.act'].includes(path.extname(file).toLowerCase()))) await openInSession(file);
  // The DEF's [Files] sprite assignment is the character's archive authority.
  // Never let a discovered common/FX archive replace it merely because that
  // file happened to sort first in the dependency graph.
  const sprite = assigned(profile, 'sprite')[0];
  if (sprite && !files.includes(sprite)) await openInSession(sprite);
  const air = assigned(profile, 'anim')[0] || files.find((file) => path.extname(file).toLowerCase() === '.air');
  if (allCode && air) await vscode.commands.executeCommand('air.openAnimationPreview', vscode.Uri.file(air), { preserveFocus: true, sourceColumn: column, viewerColumn: assetColumn, ownerDef: profile.defPath });
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
  profile = refreshedProfile(profile);
  const sessionKey=normalized(profile.defPath||profile.folder),generation=SESSION_GENERATIONS.get(sessionKey)||0,cancelled=()=>generation!==(SESSION_GENERATIONS.get(sessionKey)||0)||Boolean(profile.defPath&&typeof isClosingOwner==='function'&&isClosingOwner(profile.defPath));
  const choices = await chooseSessionOptions(profile); if (!choices?.length||cancelled()) return;
  const selected = new Set(choices), previousColumn = sharedWorkbenchColumn(), column = previousColumn || targetColumn(), opened = new Set(); WORKBENCH_COLUMNS.set(profile.id, column);
  let assetColumn = column;
  const open = async (filename) => {
    if (cancelled()||!filename || opened.has(filename.toLowerCase()) || !fs.existsSync(filename)) return;
    opened.add(filename.toLowerCase());
    const result = await openFile(profile, filename, column, assetColumn);
    if(cancelled())return;
    const resolved = result?.panel?.viewColumn || result?.viewColumn;
    if (Number.isInteger(resolved) && resolved > 0) assetColumn = resolved;
    return result;
  };
  const constants = assigned(profile, 'cns')[0], air = assigned(profile, 'anim')[0], sprite = assigned(profile, 'sprite')[0], sounds = assigned(profile, 'sound');
  if (selected.has('essentials')) {
    const sources = [profile.defPath, constants, air, ...(profile.connectedFiles || []).filter((filename) => categoryFor(filename, profile) === 'Code')];
    const grouped = await openGroupedCode(profile, sources, 'character-essentials');
    if(cancelled())return;
    const groupedColumn = grouped?.assetViewColumn || grouped?.viewColumn;
    if (Number.isInteger(groupedColumn) && groupedColumn > 0) assetColumn = groupedColumn;
    for (const file of groupedCodeFiles(profile, sources)) opened.add(normalized(file));
    await open(sprite); for (const sound of sounds) await open(sound);
  }
  if (selected.has('animation')) {
    await open(sprite); await open(air);
    await vscode.commands.executeCommand('workbench.actions.view.problems');
    if(cancelled())return;
  }
  if ((selected.has('essentials') || selected.has('animation')) && air) {
    const result = await vscode.commands.executeCommand('air.openAnimationPreview', vscode.Uri.file(air), { preserveFocus: true, sourceColumn: column, viewerColumn: assetColumn, ownerDef: profile.defPath });
    if(cancelled())return;
    const resolved = result?.panel?.viewColumn || result?.viewColumn;
    if (Number.isInteger(resolved) && resolved > 0) assetColumn = resolved;
  }
  if (selected.has('attacks')) {
    await open(constants);
    await vscode.commands.executeCommand('ikemen.moveLab.open', vscode.Uri.file(profile.defPath), { preset: true, reference: { defPath: profile.defPath, mode: 'attack' } });
    if(cancelled())return;
  }
  if (selected.has('throws')) {
    await open(air); await open(sprite);
    await vscode.commands.executeCommand('ikemen.throwCreator.open', vscode.Uri.file(profile.defPath));
    if(cancelled())return;
  }
  if (selected.has('sound')) {
    const localSounds = allFiles(profile).filter((file) => path.extname(file).toLowerCase() === '.snd');
    for (const sound of [...sounds, ...localSounds]) await open(sound);
    if(cancelled())return;
  }
  if (selected.has('code')) {
    const sources = (profile.connectedFiles || []).filter((filename) => categoryFor(filename, profile) === 'Code');
    const grouped = await openGroupedCode(profile, sources, 'character-all-code');
    if(cancelled())return;
    const groupedColumn = grouped?.assetViewColumn || grouped?.viewColumn;
    if (Number.isInteger(groupedColumn) && groupedColumn > 0) assetColumn = groupedColumn;
    for (const file of groupedCodeFiles(profile, sources)) opened.add(normalized(file));
  }
  if (selected.has('connections')) await vscode.commands.executeCommand('ikemen.characterDependencies.open', vscode.Uri.file(profile.defPath));
  if(cancelled())return;
  if (selected.has('health')) await vscode.commands.executeCommand('ikemen.characterHealth.open', vscode.Uri.file(profile.defPath));
  if(cancelled())return;
  if (selected.has('workflow')) await vscode.commands.executeCommand('ikemen.productionWorkflow.open', vscode.Uri.file(profile.defPath));
  if(cancelled())return;
  const profiles = load(context).map((entry) => entry.id === profile.id ? { ...profile, lastSession: choices } : entry); await save(context, profiles); provider.refresh();
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
  return { type: 'character', key: normalized(folder), label: profile.name || path.basename(folder), root: folder, ownerDef: profile.defPath ? path.resolve(profile.defPath) : '', files: allFiles(profile) };
}

function refreshedCharacterContext(profile) {
  return characterContext(refreshedProfile(profile));
}

async function chooseCloseContext(context, requestedType = '') {
  const profiles = load(context);
  const current = currentContext();
  if (current && (!requestedType || current.type === requestedType)) {
    if (current.type === 'character') {
      const profile = profiles.find((item) => current.ownerDef && normalized(item.defPath) === normalized(current.ownerDef))
        || profiles.find((item) => normalized(item.folder || path.dirname(item.defPath)) === normalized(current.root || current.key));
      if (profile) return refreshedCharacterContext(profile);
    }
    return current;
  }
  const active = activeFile(), activeFolder = active && characterFolder(active);
  if ((!requestedType || requestedType === 'character') && active) {
    const refreshed = profiles.map(refreshedProfile);
    const owners = refreshed.filter((profile) => allFiles(profile).some((filename) => normalized(filename) === normalized(active)));
    if (owners.length === 1) return characterContext(owners[0]);
    if (owners.length > 1) {
      const choices = owners.map((profile) => ({ label: `$(person) ${profile.name}`, description: path.dirname(profile.defPath), context: characterContext(profile) }));
      const picked = await vscode.window.showQuickPick(choices, { title: 'Close Character', placeHolder: 'This shared source belongs to more than one saved character. Choose which character session to close.' });
      return picked && picked.context;
    }
    if (activeFolder) {
      const profile = refreshed.find((item) => normalized(item.folder || path.dirname(item.defPath)) === normalized(activeFolder));
      if (profile) return characterContext(profile);
      return { type: 'character', key: normalized(activeFolder), label: path.basename(activeFolder), root: activeFolder, ownerDef: '', files: [active] };
    }
  }
  const choices = [];
  if (!requestedType || requestedType === 'character') for (const profile of profiles) choices.push({ label: `$(person) ${profile.name}`, description: 'Character', context: refreshedCharacterContext(profile) });
  for (const entry of openContexts()) if ((!requestedType || entry.type === requestedType) && !choices.some((item) => item.context.type === entry.type && item.context.key === entry.key)) choices.push({ label: `$(${entry.type === 'stage' ? 'layers' : 'window'}) ${entry.label}`, description: entry.type, context: entry });
  if (!choices.length) return null;
  const picked = choices.length === 1 ? choices[0] : await vscode.window.showQuickPick(choices, { title: requestedType ? `Close ${requestedType}` : 'Close Current Authoring Context', placeHolder: 'Choose the character, stage, screenpack, or workspace to close' });
  return picked && picked.context;
}

async function closeAuthoringContext(context, requestedType = '', provided = null) {
  const savedProfile = provided && (provided.profile || provided);
  const profile = savedProfile && savedProfile.defPath ? refreshedProfile(savedProfile) : savedProfile;
  const selected = profile && (profile.folder || profile.defPath) ? characterContext(profile) : await chooseCloseContext(context, requestedType);
  if (!selected) return vscode.window.showInformationMessage(`No open ${requestedType || 'authoring'} context was found.`);
  const registry=require('./authoring_context_registry'),characterViews=require('./character_view_policy');
  if(selected.type==='character'&&selected.ownerDef){const key=normalized(selected.ownerDef);SESSION_GENERATIONS.set(key,(SESSION_GENERATIONS.get(key)||0)+1);}
  const finishClose = beginContextClose(selected);
  let legacyDecision='';
  const adoptRestoredLegacy=async()=>{
    if(selected.type!=='character'||!selected.ownerDef)return false;
    // A legacy viewer has no recorded owner. Only offer viewers connected to
    // this character, plus the active ambiguous viewer the user is explicitly
    // looking at. Never claim every restored viewer in the window: an inactive
    // Ken viewer must not be adopted while closing Ryu.
    const restored=characterViews.restoredUnownedCharacterPanels().filter(entry=>contextOwnsFile(selected,entry.filename)||entry.panel?.active);
    if(!restored.length)return false;
    if(!legacyDecision){const action=restored.length===1?`Close with ${selected.label}`:`Close all with ${selected.label}`;const choice=await vscode.window.showWarningMessage(`${restored.length} restored viewer${restored.length===1?' was':'s were'} opened before character-session ownership was recorded. Close ${restored.length===1?'it':'all of them'} with ${selected.label}?`,{modal:true},action,'Keep Open');legacyDecision=choice===action?'close':'keep';}
    if(legacyDecision==='close')for(const entry of restored)characterViews.addCharacterPanelOwner(entry.panel,selected.ownerDef);
    return legacyDecision==='close';
  };
  const refreshRegisteredPanels=()=>{
    const sharedPanels=new Set(characterViews.sharedCharacterPanels(selected).map(entry=>entry.panel));
    const entries=registry.matchingPanels(selected).filter(entry=>!sharedPanels.has(entry.panel));
    selected.files=[...new Set([...(selected.files||[]),...entries.flatMap(entry=>entry.files||[])])];
    return entries;
  };
  const ownedVisualPanels=()=>{
    const sharedPanels=new Set(characterViews.sharedCharacterPanels(selected).map(entry=>entry.panel));
    return [...new Set([
      ...registry.matchingPanels(selected).filter(entry=>!sharedPanels.has(entry.panel)).map(entry=>entry.panel),
      ...characterViews.matchingCharacterPanels(selected).map(entry=>entry.panel)
    ].filter(Boolean))];
  };
  const ownedTabs = () => {
    const result = [];
    for (const group of vscode.window.tabGroups?.all || []) for (const tab of group.tabs || []) {
      const filename = tabFilename(tab); if (filename && contextOwnsFile(selected, filename)) result.push(tab);
    }
    return result;
  };
  const ownedVisibleEditors = () => (vscode.window.visibleTextEditors || []).filter(editor => {
    const filename = editor?.document?.fileName || editor?.document?.uri?.fsPath || '';
    return filename && contextOwnsFile(selected, filename);
  });
  const waitForTopology = async (predicate = () => true, timeoutMs = 900) => {
    const listeners = [], subscribe = (event) => { if (typeof event === 'function') listeners.push(event(() => { stableTurns = 0; check(); })); };
    let timer, pulse, settled = false, resolver, stableTurns = 0;
    const done = new Promise(resolve => { resolver = resolve; });
    const finish = (value) => { if (settled) return; settled = true; if (timer) clearTimeout(timer); if (pulse) clearInterval(pulse); for (const listener of listeners) listener?.dispose?.(); resolver(value); };
    const check = () => { if (predicate()) stableTurns += 1; else stableTurns = 0; if (stableTurns >= 2) finish(true); };
    subscribe(vscode.window.tabGroups?.onDidChangeTabs);
    subscribe(vscode.window.onDidChangeVisibleTextEditors);
    subscribe(vscode.workspace?.onDidCloseTextDocument);
    pulse = setInterval(check, 40);timer = setTimeout(() => finish(predicate()), timeoutMs);check();
    const result = await done; await Promise.resolve(); return result && predicate();
  };
  const blockerNames = (tabs = ownedTabs(), editors = ownedVisibleEditors()) => [...new Set([
    ...tabs.map(tab => tabFilename(tab)).filter(Boolean),
    ...editors.map(editor => editor?.document?.fileName || editor?.document?.uri?.fsPath || '').filter(Boolean)
  ])];
  const reportBlocked = (lead, names = blockerNames()) => {
    const shown = names.slice(0, 8), extra = names.length > shown.length ? ` and ${names.length - shown.length} more` : '';
    const detail = shown.length ? ` Still open: ${shown.join('; ')}${extra}.` : '';
    return vscode.window.showWarningMessage(`${lead}${detail} The character session was kept.`);
  };
  const closedTabs = new Set(),disposedPanels=new Set(),preparedPanels=new Set();let panels = 0;
  try {
    await adoptRestoredLegacy();
    refreshRegisteredPanels();
    const visualPanels=ownedVisualPanels();
    if(!await require('./viewer_close').prepare(visualPanels,vscode))return;
    for(const panel of visualPanels)preparedPanels.add(panel);
    // Keep visual drafts alive until native document closure succeeds.
    // The close guard prevents automatic source/viewer reopening meanwhile.
    for (let pass = 0; pass < 8; pass += 1) {
      const tabs = ownedTabs();
      if (!tabs.length) break;
      if (!await vscode.window.tabGroups.close(tabs, true)) return reportBlocked(`Closing ${selected.label} was cancelled or an editor refused to close.`, tabs.map(tabFilename).filter(Boolean));
      for(const tab of tabs)closedTabs.add(tab);
      if (ownedTabs().length || ownedVisibleEditors().length) await waitForTopology(() => !ownedTabs().length && !ownedVisibleEditors().length);
    }
    // With native tabs hidden, VS Code can retain previously visited text
    // documents in editor history without exposing them in tabGroups.all.
    // Materialize only documents owned by this context, then close the exact
    // resulting tab. Keep this ahead of panel disposal so a cancelled dirty-
    // document prompt leaves the complete character session intact.
    const headerOnly = Boolean(vscode.workspace?.getConfiguration?.('ikemenZss')?.get?.('textToolbar.headerOnlyLayout', false));
    if (headerOnly) {
      const visibleTabs = new Set();
      for (const group of vscode.window.tabGroups?.all || []) for (const tab of group.tabs || []) {
        const filename = tabFilename(tab); if (filename) visibleTabs.add(normalized(filename));
      }
      const hiddenDocuments = (vscode.workspace?.textDocuments || []).filter(document => !document.isClosed && document.uri?.scheme === 'file' && document.fileName && contextOwnsFile(selected, document.fileName) && !visibleTabs.has(normalized(document.fileName)));
      for (const document of hiddenDocuments) {
        const matchingEditor = (vscode.window.visibleTextEditors || []).find(editor => normalized(editor?.document?.fileName || '') === normalized(document.fileName));
        const viewColumn = matchingEditor?.viewColumn || vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn?.One || 1;
        await vscode.window.showTextDocument(document, { viewColumn, preview: false, preserveFocus: false });
        await Promise.resolve();
        let materialized = null;
        for (const group of vscode.window.tabGroups?.all || []) {
          materialized = (group.tabs || []).find(tab => normalized(tabFilename(tab) || '') === normalized(document.fileName));
          if (materialized) break;
        }
        if (!materialized) return reportBlocked(`VS Code could not expose ${document.fileName} for a safe close.`, [document.fileName]);
        if (!await vscode.window.tabGroups.close(materialized, true)) return reportBlocked(`Closing ${selected.label} was cancelled or an editor refused to close.`, [document.fileName]);
        closedTabs.add(materialized);
        if (ownedTabs().length || ownedVisibleEditors().length) await waitForTopology(() => !ownedTabs().length && !ownedVisibleEditors().length);
      }
    }
    // Disposing one restored webview can cause VS Code to materialize the next
    // hidden viewer. Recompute ownership until the complete character context
    // stays empty for a full quiescent interval instead of trusting one snapshot.
    let quietSince=Date.now(),deadline=Date.now()+5000;
    while(Date.now()<deadline){
      let changed=false;
      if(await adoptRestoredLegacy())refreshRegisteredPanels();
      const lateTabs=ownedTabs();
      if(lateTabs.length){if(!await vscode.window.tabGroups.close(lateTabs,true))return reportBlocked(`Closing ${selected.label} was cancelled or an editor refused to close.`,lateTabs.map(tabFilename).filter(Boolean));for(const tab of lateTabs)closedTabs.add(tab);changed=true;}
      const latePanels=ownedVisualPanels().filter(panel=>!disposedPanels.has(panel));
      if(latePanels.length){const unprepared=latePanels.filter(panel=>!preparedPanels.has(panel));if(unprepared.length&&!await require('./viewer_close').prepare(unprepared,vscode))return;for(const panel of unprepared)preparedPanels.add(panel);for(const panel of latePanels){try{panel.dispose();disposedPanels.add(panel);panels++;changed=true;}catch(_) {}}}
      if(ownedTabs().length||ownedVisibleEditors().length)await waitForTopology(()=>!ownedTabs().length&&!ownedVisibleEditors().length);
      const stillOwned=ownedVisualPanels().filter(panel=>registry.hasPanel(panel)||characterViews.hasCharacterPanel(panel));
      if(changed||ownedTabs().length||ownedVisibleEditors().length||stillOwned.length)quietSince=Date.now();
      else if(Date.now()-quietSince>=900)break;
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    const remainingTabs = ownedTabs(), remainingEditors = ownedVisibleEditors(),remainingPanels=ownedVisualPanels().filter(panel=>registry.hasPanel(panel)||characterViews.hasCharacterPanel(panel));
    if (remainingTabs.length || remainingEditors.length) return reportBlocked(`Some ${selected.label} editors did not finish closing.`, blockerNames(remainingTabs, remainingEditors));
    if (remainingPanels.length) return reportBlocked(`Some ${selected.label} visual workspaces did not finish closing.`, remainingPanels.map(panel => panel?.title || 'Unnamed visual workspace'));
    if (selected.type === 'character') {
      characterViews.releaseCharacterPanelOwner(selected);
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

module.exports = { registerCharacterWorkbenches, collectFiles, projectIdentity, profileFromDef, refreshedProfile, coreFiles, groupedCodeFiles, openGroupedCode, openWorkbench, openCharacterSession, SESSION_OPTIONS };
