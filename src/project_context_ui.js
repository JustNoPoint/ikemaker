'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const registryModel = require('./project_registry');
const contextModel = require('./project_context_model');
const metadataRegistry = require('./metadata_registry');
const characterContext = require('./character_context');
const { transactionalWrite } = require('./mutation_safety');

const REGISTRY = path.join('.ikemen', 'project-registry.json');

function uriFromTab(tab) {
  const input = tab && tab.input;
  return input && (input.uri || input.modified || input.notebookUri) || null;
}
function fileUri(uri) { return uri && uri.scheme === 'file' ? uri : null; }
function activeUri() {
  const editor = vscode.window.activeTextEditor;
  if (editor && fileUri(editor.document.uri)) return editor.document.uri;
  const group = vscode.window.tabGroups && vscode.window.tabGroups.activeTabGroup, tab = group && group.activeTab;
  const uri = fileUri(uriFromTab(tab)); if (uri) return uri;
  // A restored visual workspace can be the active group before VS Code reports
  // any activeTextEditor. Use the active source tab in another group so the
  // persistent project context can initialize immediately after reload.
  for (const candidate of vscode.window.tabGroups?.all || []) {
    const active = fileUri(uriFromTab(candidate.activeTab)); if (active) return active;
  }
  for (const visible of vscode.window.visibleTextEditors || []) {
    const source = fileUri(visible?.document?.uri); if (source) return source;
  }
  return null;
}
function workspaceRoot(uri) {
  const folder = uri && vscode.workspace.getWorkspaceFolder(uri);
  return folder ? folder.uri.fsPath : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
}
function contextRoot(uri) {
  const workspace = workspaceRoot(uri);
  return uri?.fsPath ? characterContext.gameRoot(uri.fsPath) || workspace : workspace;
}
function registryPath(root) { return metadataRegistry.find(root) || path.join(root, REGISTRY); }
function readRegistry(root) {
  const filename = registryPath(root);
  if (!fs.existsSync(filename)) return { filename, exists: false, migrationNeeded: false, sourceSchema: 0, ...registryModel.validate(registryModel.createDefault()) };
  try { const raw = JSON.parse(fs.readFileSync(filename, 'utf8')), sourceSchema = Number(raw.schemaVersion) || 1, validated = registryModel.validate(raw); Object.defineProperty(validated.registry, '__root', { value: path.dirname(path.dirname(filename)), enumerable: false }); return { filename, exists: true, migrationNeeded: sourceSchema < registryModel.CURRENT_SCHEMA, sourceSchema, ...validated }; }
  catch (error) { return { filename, exists: true, registry: registryModel.createDefault(), issues: [{ level: 'error', code: 'invalid-json', message: error.message }] }; }
}
function writeRegistry(filename, registry, label, expectedHash) {
  const options = { label, journalRoot: path.dirname(path.dirname(filename)), expectedHash: expectedHash || undefined };
  return transactionalWrite(fs, filename, `${JSON.stringify(registry, null, 2)}\n`, options);
}
function safeId(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, ''); }
function relativeRoot(registryFilename, projectRoot) {
  const registryRoot = path.dirname(path.dirname(registryFilename));
  return path.relative(registryRoot, projectRoot).replace(/\\/g, '/') || '.';
}
async function createProjectProfile() {
  const seed = activeUri(), suggestedRoot = contextRoot(seed) || workspaceRoot(seed);
  const picked = await vscode.window.showOpenDialog({
    title: 'Choose the root folder for the new game profile',
    defaultUri: suggestedRoot ? vscode.Uri.file(suggestedRoot) : undefined,
    canSelectFiles: false, canSelectFolders: true, canSelectMany: false,
    openLabel: 'Use as Project Root'
  });
  if (!picked?.[0]) return;
  const projectRoot = picked[0].fsPath;
  const detectedRegistry = metadataRegistry.find(projectRoot);
  const ownRegistry = path.join(projectRoot, REGISTRY);
  let filename = detectedRegistry || ownRegistry;
  if (detectedRegistry && path.resolve(detectedRegistry).toLowerCase() !== path.resolve(ownRegistry).toLowerCase()) {
    const location = await vscode.window.showQuickPick([
      { label: 'Add to the detected project registry (Recommended)', description: detectedRegistry, filename: detectedRegistry },
      { label: 'Create an independent registry in this folder', description: ownRegistry, filename: ownRegistry }
    ], { title: 'Where should this project profile be registered?', placeHolder: 'Existing shared registries are preserved unless you explicitly create an independent boundary.' });
    if (!location) return; filename = location.filename;
  }
  const name = await vscode.window.showInputBox({ title: 'New game profile', prompt: 'Public display name for this game.', placeHolder: 'My IKEMEN Game', validateInput: (value) => String(value || '').trim() ? undefined : 'Enter a game name.' });
  if (!name?.trim()) return;
  const id = await vscode.window.showInputBox({ title: 'Stable project ID', value: safeId(name), prompt: 'Used in metadata and automation. It can be renamed visually later.', validateInput: (value) => /^[a-z0-9][a-z0-9_.-]*$/i.test(String(value || '')) ? undefined : 'Use letters, numbers, dots, underscores, or hyphens.' });
  if (!id?.trim()) return;
  const distribution = await vscode.window.showQuickPick([
    { label: 'Hobby / non-commercial', value: 'hobby' },
    { label: 'Commercial', value: 'commercial' },
    { label: 'Undecided / private prototype', value: 'undecided' }
  ], { title: 'Distribution intent', placeHolder: 'This controls guidance and provenance safeguards, not ordinary authoring features.' });
  if (!distribution) return;
  const basis = await vscode.window.showQuickPick([
    { label: 'Fully original', value: 'original' },
    { label: 'Licensed material', value: 'licensed' },
    { label: 'Fan project / reference recreation', value: 'fan-project' },
    { label: 'Mixed or undecided', value: 'mixed' }
  ], { title: 'Content basis' });
  if (!basis) return;
  const research = await vscode.window.showQuickPick([
    { label: 'No source-game/emulation research', value: false },
    { label: 'Enable source-reference research tools', value: true, description: 'Only appropriate when the project and material permit it.' }
  ], { title: 'Optional source-reference research' });
  if (!research) return;
  let registry;
  if (fs.existsSync(filename)) {
    try { registry = JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, '')); }
    catch (error) { return vscode.window.showErrorMessage(`The project registry is invalid JSON: ${error.message}`); }
  } else {
    registry = { schemaVersion: registryModel.CURRENT_SCHEMA, registryVersion: 1, name: `${name.trim()} Registry`, projects: [{ id: 'universal', name: 'Universal Template', roots: ['chars/template'], distributionIntent: 'undecided', contentBasis: 'mixed', sourceResearch: false }], characters: [], aliases: {}, assets: {}, requirements: {}, sffBuildProfiles: {}, appearances: {}, palettes: {}, sounds: {}, attacks: {}, workflow: {}, validation: { enabledLevels: registryModel.VALIDATION_LEVELS, disabledConventionRules: [] } };
  }
  const normalized = registryModel.normalize(registry);
  const stableId = id.trim().toLowerCase();
  if (normalized.projects.some((item) => item.id === stableId)) return vscode.window.showWarningMessage(`Project ID “${stableId}” already exists in ${filename}.`);
  normalized.projects.push(registryModel.normalizeProject({ id: stableId, name: name.trim(), roots: [relativeRoot(filename, projectRoot)], workflowProfile: '', sourceAuthority: '', completionModel: '', distributionIntent: distribution.value, contentBasis: basis.value, sourceResearch: research.value }));
  normalized.registryVersion = (Number(normalized.registryVersion) || 1) + 1;
  const prior = fs.existsSync(filename) ? fs.readFileSync(filename) : null;
  writeRegistry(filename, normalized, 'create-game-project-profile', prior ? require('./mutation_safety').hash(prior) : '');
  await vscode.commands.executeCommand('ikemen.projectManager.open', vscode.Uri.file(projectRoot));
  return vscode.window.showInformationMessage(`Created game profile “${name.trim()}”. Work projects and teams can now be assigned in Project & Team Manager.`);
}
function icon(ownership) { return ({ universal: '$(globe)', game: '$(game)', character: '$(person)', 'tooling-generated': '$(tools)' })[ownership] || '$(question)'; }

function registerProjectContext(context) {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 95);
  status.command = 'ikemen.context.show'; status.name = 'IKEMEN Project Context';
  let current = null;
  const update = () => {
    const uri = activeUri(), root = contextRoot(uri);
    // Webview editors (AIR/SFF/SND and the other visual workspaces) do not have
    // a normal file URI. Keep showing the last valid context while one has
    // focus instead of making the project identity disappear.
    if (!uri || !root) { if (current) status.show(); else status.hide(); return; }
    const loaded = readRegistry(root), inferred = contextModel.contextFor(uri.fsPath, root, loaded.registry);
    current = { uri, root, loaded, context: inferred };
    status.text = `${icon(inferred.ownership)} ${inferred.project.name} › ${inferred.character?.name || 'Shared'} › ${inferred.assetType}`;
    status.tooltip = `${contextModel.label(inferred)}\nGame profile: ${inferred.project.name} (${inferred.project.id})\nEngine target: ${inferred.engineTarget.version} · ${inferred.engineTarget.channel}${inferred.engineTarget.commit ? ` · ${inferred.engineTarget.commit.slice(0, 12)}` : ''}\nGame root: ${root}\nOwnership: ${inferred.ownership}\nRegistry: ${loaded.exists ? loaded.filename : 'built-in defaults (click to create)'}`;
    status.backgroundColor = loaded.issues.some((item) => item.level === 'error') ? new vscode.ThemeColor('statusBarItem.errorBackground') : undefined;
    status.show();
  };
  const show = async () => {
    update(); if (!current) return vscode.window.showInformationMessage('Open a workspace file to inspect its IKEMEN project context.');
    const c = current.context, choice = await vscode.window.showQuickPick([
      { label: `${icon(c.ownership)} ${c.project.name}`, description: `Project · ${c.project.sourceAuthority || 'No source authority recorded'}` },
      { label: `$(person) ${c.character?.name || 'Shared project file'}`, description: c.character ? `Character · ${c.character.source}` : 'No character owner inferred' },
      { label: `$(shield) ${c.ownership}`, description: 'Ownership layer' },
      { label: `$(versions) ${c.engineTarget.version} · ${c.engineTarget.channel}`, description: c.engineTarget.commit ? `Engine target · ${c.engineTarget.commit.slice(0, 12)}` : 'Engine target identity requires review', action: 'engines' },
      { label: '$(json) Open authoritative project registry', action: 'open' },
      { label: '$(sync) Validate and migrate project registry', action: 'migrate' },
      { label: '$(references) Index existing metadata sources', action: 'index' }
    ], { title: contextModel.label(c), placeHolder: c.relativePath });
    if (choice?.action === 'open') return vscode.commands.executeCommand('ikemen.context.openRegistry');
    if (choice?.action === 'migrate') return vscode.commands.executeCommand('ikemen.context.migrateRegistry');
    if (choice?.action === 'index') return vscode.commands.executeCommand('ikemen.context.indexMetadata');
    if (choice?.action === 'engines') return vscode.commands.executeCommand('ikemen.engineRegistry.open', current.uri);
  };
  const open = async () => {
    const uri = activeUri(), root = contextRoot(uri); if (!root) return vscode.window.showWarningMessage('Open a folder before creating a project registry.');
    const loaded = readRegistry(root);
    if (!loaded.exists) { const approved = await vscode.window.showInformationMessage(`No project registry exists. Create ${loaded.filename}?`, { modal: true, detail: 'This writes project metadata only after this approval. Cancel leaves the workspace unchanged.' }, 'Create Project Registry'); if (approved !== 'Create Project Registry') return; writeRegistry(loaded.filename, registryModel.createStarter(), 'create-project-registry'); }
    return vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(loaded.filename)), { preview: false });
  };
  const migrate = async () => {
    const uri = activeUri(), root = contextRoot(uri); if (!root) return vscode.window.showWarningMessage('Open a folder before migrating a project registry.');
    const loaded = readRegistry(root); if (loaded.issues.some((item) => item.code === 'invalid-json')) return vscode.window.showErrorMessage(`Project registry is invalid JSON: ${loaded.issues[0].message}`);
    if (loaded.exists && !loaded.migrationNeeded) { update(); return vscode.window.showInformationMessage(`Project registry already uses schema ${registryModel.CURRENT_SCHEMA}. ${loaded.issues.length ? `${loaded.issues.length} review item(s) remain.` : 'No registry issues found.'}`); }
    if (loaded.exists) { const answer = await vscode.window.showWarningMessage(`Migrate project metadata from schema ${loaded.sourceSchema} to ${registryModel.CURRENT_SCHEMA}? A recovery backup and mutation record will be created.`, { modal: true }, 'Preview accepted — migrate'); if (answer !== 'Preview accepted — migrate') return; }
    const before = loaded.exists ? fs.readFileSync(loaded.filename) : null;
    writeRegistry(loaded.filename, loaded.registry, loaded.exists ? 'migrate-project-registry' : 'create-project-registry', before ? require('./mutation_safety').hash(before) : '');
    update(); return vscode.window.showInformationMessage(`Project registry is valid at schema ${registryModel.CURRENT_SCHEMA}. ${loaded.issues.length ? `${loaded.issues.length} review item(s) remain.` : 'No registry issues found.'}`);
  };
  const indexMetadata = async () => {
    const uri = activeUri(), root = contextRoot(uri); if (!root) return vscode.window.showWarningMessage('Open a folder before indexing metadata.');
    const loaded = readRegistry(root), names = Object.values(metadataRegistry.LEGACY_NAMES), found = await vscode.workspace.findFiles(`**/{${names.join(',')}}`, '**/{.git,node_modules,.ikemen-tools/backups}/**', 250);
    const result = metadataRegistry.indexLegacySources(loaded.filename, loaded.registry, found.map((item) => item.fsPath));
    if (!result.indexed.length && !result.conflicts.length) return vscode.window.showInformationMessage('No unindexed legacy metadata sources were found.');
    const detail = [...result.indexed.map((item) => `${item.domain}: ${path.relative(root, item.file)}`), ...result.conflicts.map((item) => `${item.domain}: REVIEW — ${item.reason}`)].join('\n');
    if (!result.indexed.length) return vscode.window.showWarningMessage(`Metadata candidates require manual classification.\n${detail}`);
    const answer = await vscode.window.showWarningMessage(`Index ${result.indexed.length} existing metadata source(s) in the authoritative registry?`, { modal: true, detail: `${detail}\n\nThe source files remain in place; the registry records their ownership. A backup and recovery entry are created.` }, 'Index Sources');
    if (answer !== 'Index Sources') return;
    const before = loaded.exists ? fs.readFileSync(loaded.filename) : null;
    writeRegistry(loaded.filename, result.registry, 'index-authoritative-metadata', before ? require('./mutation_safety').hash(before) : ''); update();
    await vscode.commands.executeCommand('ikemen.context.openRegistry');
    return vscode.window.showInformationMessage(`Indexed ${result.indexed.length} metadata source(s). ${result.conflicts.length} conflict(s) remain for review.`);
  };
  context.subscriptions.push(status,
    vscode.commands.registerCommand('ikemen.context.show', show),
    vscode.commands.registerCommand('ikemen.projectProfile.create', createProjectProfile),
    vscode.commands.registerCommand('ikemen.context.openRegistry', open),
    vscode.commands.registerCommand('ikemen.context.migrateRegistry', migrate),
    vscode.commands.registerCommand('ikemen.context.indexMetadata', indexMetadata),
    vscode.window.onDidChangeActiveTextEditor(update),
    vscode.window.tabGroups?.onDidChangeTabs ? vscode.window.tabGroups.onDidChangeTabs(update) : { dispose() {} },
    vscode.workspace.onDidSaveTextDocument((document) => { if (document.fileName.endsWith(REGISTRY)) update(); })
  );
  update();
}

module.exports = { registerProjectContext, activeUri, workspaceRoot, contextRoot, registryPath, readRegistry, writeRegistry, safeId, relativeRoot, createProjectProfile };
