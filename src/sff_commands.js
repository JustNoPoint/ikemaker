'use strict';

const vscode = require('vscode');
const { configurationTarget } = require('./configuration_target');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const {
  parseCsv,
  stringifyCsv,
  validateManifest,
  layerFolderNumber,
  inferLayerRole,
  makeLayerRows,
  redundancyCandidates,
  manualLayerRows,
  applyManualLayerDecision
} = require('./sff');
const {
  auditRequirements,
  requirementTemplate,
  markdownReport
} = require('./requirements');
const { readSff, paletteRgba, paletteAct, actRgba, spritePng } = require('./sff_reader');
const { pngPaletteRgba } = require('./palette_library');
const { readAct, colorsForOrder } = require('./act_palette_order');
const { verifyPalettePlan, paletteId, applyPaletteShifts } = require('./palette_plan');
const { detectCapabilities, missingCapabilityMessage } = require('./platform_capabilities');
const { hash, transactionalWrite, optionsFromConfig } = require('./mutation_safety');
const metadataRegistry = require('./metadata_registry');
const projectContext = require('./project_context_model');
const { normalizeProfile: normalizeBuildProfile, auditIndexPolicy, applyIndexPolicy, profileTemplate: buildProfileTemplate } = require('./sff_build_profile');
const { resolveProjectTool } = require('./bundled_tools');
const { chooseFileOrFolder } = require('./open_target_picker');
const { assertBuiltArchive } = require('./sff_build_verify');

const manifestSnapshots = new Map();

function projectRoot(filename) {
  let current = fs.existsSync(filename) && fs.statSync(filename).isDirectory() ? path.resolve(filename) : path.dirname(path.resolve(filename));
  while (true) {
    if (fs.existsSync(path.join(current, 'Ikemen_GO.exe')) || fs.existsSync(path.join(current, 'external', 'script', 'main.lua'))) return current;
    const parent = path.dirname(current); if (parent === current) return path.dirname(path.resolve(filename)); current = parent;
  }
}

function sffMutationOptions(filename, label, overrides = {}) {
  const resource = vscode.Uri.file(filename), config = vscode.workspace.getConfiguration('ikemenZss', resource);
  return optionsFromConfig(vscode, filename, label, { journalRoot: projectRoot(filename), backup: false, ...overrides });
}

function hashFile(filename) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filename);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex').toUpperCase()));
  });
}

async function pickFile(title, extensions) {
  return await chooseFileOrFolder({ title, filters: extensions, extensions: Object.values(extensions || {}).flat(), maxDepth: 4 }) || undefined;
}

async function pickFolder(title) {
  const values = await vscode.window.showOpenDialog({ title, canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
  return values && values[0] ? values[0].fsPath : undefined;
}

function readManifest(filename) {
  const text = fs.readFileSync(filename, 'utf8'); manifestSnapshots.set(path.resolve(filename), hash(text)); return parseCsv(text);
}

function writeManifest(filename, rows, label = 'manifest-edit') {
  const target = path.resolve(filename), content = stringifyCsv(rows), expectedHash = manifestSnapshots.get(target);
  transactionalWrite(fs, target, content, sffMutationOptions(target, label, expectedHash ? { expectedHash } : {}));
  manifestSnapshots.set(target, hash(content));
}

const ALIAS_FILENAME = '.ikemen-sff-aliases.json';
const REQUIREMENTS_FILENAME = '.ikemen-character-requirements.json';

function findAliasRegistry(startPath) {
  let current = path.resolve(startPath || process.cwd());
  if (fs.existsSync(current) && fs.statSync(current).isFile()) current = path.dirname(current);
  while (true) {
    const candidate = path.join(current, ALIAS_FILENAME);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function readAliasRegistry(startPath) {
  const managed = metadataRegistry.resolve(startPath, 'aliases');
  if (managed && !managed.missing && managed.value) return managed.value;
  const filename = findAliasRegistry(startPath);
  if (!filename) return {};
  try {
    const registry = JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, ''));
    if (!registry || typeof registry !== 'object' || Array.isArray(registry)) throw new Error('root must be an object');
    return registry;
  } catch (error) {
    throw new Error(`Alias registry is invalid (${filename}): ${error.message}`);
  }
}

function findRequirementsProfile(startPath) {
  let current = path.resolve(startPath || process.cwd());
  if (fs.existsSync(current) && fs.statSync(current).isFile()) current = path.dirname(current);
  while (true) {
    const candidate = path.join(current, REQUIREMENTS_FILENAME);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function readRequirementsProfile(startPath, selector = {}) {
  const managed = metadataRegistry.resolve(startPath, 'requirements', selector);
  if (managed && !managed.missing && managed.value) return { filename: managed.source, profile: managed.value };
  let filename = findRequirementsProfile(startPath);
  if (!filename) {
    const workspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
    const workspaceProfile = workspace && path.join(workspace.uri.fsPath, REQUIREMENTS_FILENAME);
    if (workspaceProfile && fs.existsSync(workspaceProfile)) filename = workspaceProfile;
  }
  if (!filename) return { filename: null, profile: requirementTemplate() };
  try {
    return { filename, profile: JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, '')) };
  } catch (error) {
    throw new Error(`Requirements profile is invalid (${filename}): ${error.message}`);
  }
}

function projectProfiles(startPath) {
  const filename = metadataRegistry.find(startPath);
  if (!filename) return { loaded: null, projects: [], custom: [], inferred: 'universal' };
  const loaded = metadataRegistry.read(filename);
  const workspaceRoot = loaded.root;
  const inferred = projectContext.contextFor(startPath, workspaceRoot, loaded.registry).project?.id || 'universal';
  const custom = Object.entries(loaded.registry.sffBuildProfiles?.profiles || {}).map(([id, value]) => ({ id, name: value.name || id, value }));
  return { loaded, projects: loaded.registry.projects || [], custom, inferred };
}

async function chooseProjectBuildProfile(startPath, title = 'Choose the project rules for this SFF') {
  const available = projectProfiles(startPath);
  const choices = [{ label: 'Default', description: 'Universal IKEMEN/KFM get-hit layout with no game-specific custom requirements', id: 'default', project: { id: 'universal', name: 'Default' } }, ...available.projects.map((project) => ({
    label: project.name || project.id,
    description: project.id === available.inferred ? 'Detected from current project context' : project.id,
    id: project.id, project
  })), ...available.custom.map((profile) => ({ label: profile.name, description: `Custom profile · ${profile.id}`, id: profile.id, project: { id: profile.id, name: profile.name }, custom: profile }))];
  const resource = vscode.Uri.file(startPath), config = vscode.workspace.getConfiguration('ikemenZss', resource), configured = String(config.get('sffProjectProfile', 'default')).toLowerCase();
  choices.sort((a, b) => Number(b.id === configured) - Number(a.id === configured));
  const picked = choices.length === 1 ? choices[0] : await vscode.window.showQuickPick(choices, { title });
  if (!picked) return null;
  const target = configurationTarget(vscode, resource);
  await config.update('sffProjectProfile', picked.id, target);
  let managed = null;
  if (picked.custom) {
    const reference = picked.custom.value?.$ref, source = reference && available.loaded ? path.resolve(available.loaded.root, reference) : null;
    managed = source && fs.existsSync(source) ? { source, value: JSON.parse(fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, '')) } : null;
  } else if (picked.id !== 'default') managed = metadataRegistry.resolve(startPath, 'sffBuildProfiles', { projectId: picked.project.id });
  else managed = metadataRegistry.resolve(startPath, 'sffBuildProfiles');
  const profile = normalizeBuildProfile(managed && !managed.missing && managed.value ? managed.value : { projectId: picked.project.id, profileName: `${picked.project.name} SFF build rules` });
  return { project: picked.project, profile, source: managed?.source || null, selectionId: picked.id };
}

async function createProjectBuildProfile() {
  const workspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  if (!workspace) return vscode.window.showErrorMessage('Open an IKEMEN project folder first.');
  const found = metadataRegistry.find(workspace.uri.fsPath);
  if (!found) return vscode.window.showErrorMessage('Create the IKEMEN project registry first.');
  const id = await vscode.window.showInputBox({ title: 'Custom SFF profile id', prompt: 'Letters, numbers, dash, and underscore only.', validateInput: (value) => /^[a-z0-9][a-z0-9_-]*$/i.test(value) ? null : 'Enter a portable profile id.' });
  if (!id) return;
  const name = await vscode.window.showInputBox({ title: 'Custom SFF profile name', value: id });
  if (!name) return;
  const loaded = metadataRegistry.read(found), key = id.toLowerCase(), directory = path.join(loaded.root, '.ikemen', 'profiles', 'sff'), filename = path.join(directory, `${key}.json`);
  if (fs.existsSync(filename) || loaded.registry.sffBuildProfiles?.profiles?.[key]) return vscode.window.showErrorMessage(`SFF profile ${key} already exists.`);
  const registry = loaded.registry; registry.sffBuildProfiles = registry.sffBuildProfiles || {}; registry.sffBuildProfiles.profiles = registry.sffBuildProfiles.profiles || {};
  registry.sffBuildProfiles.profiles[key] = { name, $ref: metadataRegistry.relativeReference(found, filename) };
  transactionalWrite(fs, filename, `${JSON.stringify(buildProfileTemplate(key, name), null, 2)}\n`, sffMutationOptions(filename, 'create-custom-sff-profile', { allowExisting: false }));
  transactionalWrite(fs, found, `${JSON.stringify(registry, null, 2)}\n`, sffMutationOptions(found, 'register-custom-sff-profile'));
  await vscode.workspace.getConfiguration('ikemenZss', workspace.uri).update('sffProjectProfile', key, vscode.ConfigurationTarget.WorkspaceFolder);
  await vscode.window.showTextDocument(vscode.Uri.file(filename), { preview: false });
}

async function openProjectBuildProfile() {
  const workspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  if (!workspace) return vscode.window.showErrorMessage('Open an IKEMEN project folder first.');
  const selected = await chooseProjectBuildProfile(workspace.uri.fsPath, 'Choose the project SFF profile to edit');
  if (!selected) return;
  if (selected.source && fs.existsSync(selected.source)) return vscode.window.showTextDocument(vscode.Uri.file(selected.source), { preview: false });
  const found = metadataRegistry.find(workspace.uri.fsPath);
  if (!found) return vscode.window.showErrorMessage('Create the IKEMEN project registry before adding project build profiles.');
  const loaded = metadataRegistry.read(found), directory = path.join(loaded.root, '.ikemen', 'profiles', 'sff');
  const filename = path.join(directory, `${selected.project.id}.json`), profile = buildProfileTemplate(selected.project.id, `${selected.project.name} SFF build rules`);
  const registry = loaded.registry;
  registry.sffBuildProfiles = registry.sffBuildProfiles || {};
  registry.sffBuildProfiles.projects = registry.sffBuildProfiles.projects || {};
  registry.sffBuildProfiles.projects[selected.project.id] = { $ref: metadataRegistry.relativeReference(found, filename) };
  transactionalWrite(fs, filename, `${JSON.stringify(profile, null, 2)}\n`, sffMutationOptions(filename, 'create-sff-project-profile', { allowExisting: false }));
  transactionalWrite(fs, found, `${JSON.stringify(registry, null, 2)}\n`, sffMutationOptions(found, 'register-sff-project-profile'));
  await vscode.window.showTextDocument(vscode.Uri.file(filename), { preview: false });
}

async function openMakerText(kind) {
  const label = kind === 'snd' ? 'SndMaker' : 'SprMaker2';
  const filename = await chooseFileOrFolder({ title: `Open editable ${label} build text`, filters: { [`${label} text`]: ['txt', 'def', 'list'] }, extensions: ['txt', 'def', 'list'], allowAllFiles: true, includeAdditionalSourceExtensions: true, maxDepth: 4 });
  if (!filename) return;
  await vscode.window.showTextDocument(vscode.Uri.file(filename), { preview: false });
}

async function applyProjectIndexing() {
  try {
    const manifestPath = await pickFile('Choose the SFF manifest to normalize', { 'CSV manifest': ['csv'] });
    if (!manifestPath) return;
    const selected = await chooseProjectBuildProfile(manifestPath);
    if (!selected) return;
    const rows = readManifest(manifestPath), result = applyIndexPolicy(rows, selected.profile);
    if (!result.changes.length) return vscode.window.showInformationMessage(`${selected.project.name}: get-hit indices already satisfy the project build profile.`);
    const examples = result.changes.slice(0, 12).map((item) => `${item.group},${item.from} → ${item.group},${item.to} (${item.sequence})`).join('\n');
    const answer = await vscode.window.showWarningMessage(`Apply ${result.changes.length} project indexing change(s)?`, { modal: true, detail: `${selected.project.name} uses power-of-10 get-hit indices by default. Changed rows return to REVIEW.\n\n${examples}${result.changes.length > 12 ? '\n…' : ''}` }, 'Apply to Manifest');
    if (answer !== 'Apply to Manifest') return;
    writeManifest(manifestPath, result.rows, 'manifest-project-indexing');
    vscode.window.showInformationMessage(`Applied ${result.changes.length} ${selected.project.name} indexing change(s). Review and approve them before building.`);
  } catch (error) {
    vscode.window.showErrorMessage(`Project indexing failed: ${error.message}`);
  }
}

async function openRequirementsProfile() {
  const workspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  if (!workspace) return vscode.window.showErrorMessage('Open a project folder before editing character requirements.');
  const filename = path.join(workspace.uri.fsPath, REQUIREMENTS_FILENAME);
  if (!fs.existsSync(filename)) {
    transactionalWrite(fs, filename, `${JSON.stringify(requirementTemplate(), null, 2)}\n`, sffMutationOptions(filename, 'create-requirements-profile', { allowExisting: false }));
    vscode.window.showInformationMessage(`Created ${REQUIREMENTS_FILENAME}. Add only confirmed requirements.`);
  }
  await vscode.window.showTextDocument(vscode.Uri.file(filename), { preview: false });
}

async function chooseAuditInputs() {
  const manifestPath = await pickFile('Choose the character SFF manifest', { 'CSV manifest': ['csv'] });
  if (!manifestPath) return null;
  const airPath = await pickFile('Choose the character AIR file', { 'AIR animations': ['air'] });
  if (!airPath) return null;
  const selected = await chooseProjectBuildProfile(manifestPath, 'Choose project animation requirements');
  if (!selected) return null;
  const requirements = readRequirementsProfile(manifestPath, { projectId: selected.project.id });
  requirements.profile = {
    ...requirements.profile,
    profileName: requirements.profile.profileName || `${selected.project.name} character requirements`,
    standardSets: [...new Set([...(requirements.profile.standardSets || []), ...(selected.profile.standardSets || [])])],
    requiredAnimations: [...(requirements.profile.requiredAnimations || []), ...(selected.profile.requiredAnimations || [])]
  };
  return { manifestPath, airPath, requirements, project: selected.project, rows: readManifest(manifestPath), airText: fs.readFileSync(airPath, 'utf8') };
}

async function auditCharacterRequirements() {
  try {
    const input = await chooseAuditInputs();
    if (!input) return;
    const audit = auditRequirements(input.rows, input.airText, input.requirements.profile);
    const report = markdownReport(audit, { manifest: input.manifestPath, air: input.airPath });
    const reportPath = path.join(path.dirname(input.manifestPath), 'IKEMEN_character_requirements_audit.md');
    fs.writeFileSync(reportPath, `${report}\n`, 'utf8');
    await vscode.window.showTextDocument(vscode.Uri.file(reportPath), { preview: false });
    const count = audit.missingSprites.length + audit.missingAnimations.length + audit.emptyAnimations.length +
      audit.missingAirSprites.length + audit.unassignedSprites.length + audit.missingAxisCopies.length + audit.missingAxisRoleMappings.length;
    vscode.window.showInformationMessage(`Character requirements audit complete: ${count} review item(s).`);
  } catch (error) {
    vscode.window.showErrorMessage(`Character requirements audit failed: ${error.message}`);
  }
}

async function addCharacterRequirement() {
  const workspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  if (!workspace) return vscode.window.showErrorMessage('Open a project folder first.');
  let { filename, profile } = readRequirementsProfile(workspace.uri.fsPath);
  if (!filename) {
    filename = path.join(workspace.uri.fsPath, REQUIREMENTS_FILENAME);
    profile = requirementTemplate();
  }
  const kind = await vscode.window.showQuickPick([
    { label: 'Required sprite', value: 'sprite' },
    { label: 'Required AIR animation', value: 'animation' }
  ], { title: 'Add character requirement' });
  if (!kind) return;
  const label = await vscode.window.showInputBox({ title: 'Requirement label', prompt: 'Use a clear functional name.' });
  if (!label) return;
  const level = await vscode.window.showQuickPick(['project', 'IKEMEN', 'recommended', 'optional', 'character'], { title: 'Requirement level' });
  if (!level) return;
  if (kind.value === 'sprite') {
    const group = await vscode.window.showInputBox({ title: 'Required sprite group', validateInput: (value) => /^\d+$/.test(value) ? null : 'Enter a non-negative integer.' });
    if (group === undefined) return;
    const index = await vscode.window.showInputBox({ title: 'Required sprite image index', validateInput: (value) => /^\d+$/.test(value) ? null : 'Enter a non-negative integer.' });
    if (index === undefined) return;
    profile.requiredSprites = [...(profile.requiredSprites || []), { group: Number(group), index: Number(index), label, level }];
  } else {
    const action = await vscode.window.showInputBox({ title: 'Required AIR action number', validateInput: (value) => /^-?\d+$/.test(value) ? null : 'Enter an integer.' });
    if (action === undefined) return;
    profile.requiredAnimations = [...(profile.requiredAnimations || []), { action: Number(action), label, level }];
  }
  transactionalWrite(fs, filename, `${JSON.stringify(profile, null, 2)}\n`, sffMutationOptions(filename, 'requirements-profile'));
  vscode.window.showInformationMessage(`Added ${label} to the character requirements profile.`);
}

async function reviewUnassignedSprites() {
  try {
    const manifestPath = await pickFile('Choose an SFF manifest', { 'CSV manifest': ['csv'] });
    if (!manifestPath) return;
    const rows = readManifest(manifestPath);
    const { profile } = readRequirementsProfile(manifestPath);
    const audit = auditRequirements(rows, '', profile);
    if (!audit.unassignedSprites.length) return vscode.window.showInformationMessage('No sprites are in configured temporary/unassigned ranges.');
    const sequences = new Map();
    for (const item of audit.unassignedSprites) {
      const key = item.row.CanonicalSequenceKey || item.row.OriginalRelativePath || item.key;
      if (!sequences.has(key)) sequences.set(key, []);
      sequences.get(key).push(item.row);
    }
    const picked = await vscode.window.showQuickPick([...sequences].map(([label, entries]) => ({
      label, description: `${entries.length} sprite(s) · current group ${entries[0].BaseGroup || entries[0].ComputedGroup}`, entries
    })), { title: 'Move an unassigned sequence to its approved base group' });
    if (!picked) return;
    const value = await vscode.window.showInputBox({ title: `New base group for ${picked.label}`, validateInput: (text) => {
      const group = Number(text);
      return Number.isInteger(group) && group >= 0 && group <= 65535 ? null : 'Enter an integer from 0 through 65535.';
    } });
    if (value === undefined) return;
    const baseGroup = Number(value);
    const selected = new Set(picked.entries);
    const selectedSequence = String(picked.entries[0].CanonicalSequenceKey || '');
    for (const row of rows) {
      const sameSequence = selectedSequence !== '' && row.CanonicalSequenceKey === selectedSequence;
      if (!selected.has(row) && !sameSequence) continue;
      const layer = Number(row.LayerNumber || 0);
      row.BaseGroup = String(baseGroup);
      row.ComputedGroup = String(baseGroup + layer * 10000);
      row.CanonicalOutputFilename = `${String(Number(row.ComputedGroup)).padStart(5, '0')}_${String(Number(row.ImageIndex)).padStart(5, '0')}.png`;
      row.ReviewStatus = 'REVIEW';
      row.ReviewReason = `Moved from temporary allocation to group ${baseGroup}; classification and AIR references require review.`;
    }
    writeManifest(manifestPath, rows, 'manifest-classify-unassigned');
    vscode.window.showInformationMessage(`Moved ${picked.label} to base group ${baseGroup}. Manifest rows are marked REVIEW.`);
  } catch (error) {
    vscode.window.showErrorMessage(`Unassigned-sprite review failed: ${error.message}`);
  }
}

async function createMissingAxisCopies() {
  try {
    const manifestPath = await pickFile('Choose an SFF manifest', { 'CSV manifest': ['csv'] });
    if (!manifestPath) return;
    const rows = readManifest(manifestPath);
    const { profile } = readRequirementsProfile(manifestPath);
    const audit = auditRequirements(rows, '', profile);
    if (!audit.missingAxisCopies.length) return vscode.window.showInformationMessage('No configured axis-reference copies are missing.');
    const picks = await vscode.window.showQuickPick(audit.missingAxisCopies.map((copy) => ({
      label: copy.label || copy.targetKey,
      description: `${copy.sourceGroup},${copy.sourceIndex} → ${copy.targetKey}`,
      copy,
      picked: true
    })), { title: 'Create missing axis-reference manifest rows', canPickMany: true });
    if (!picks || !picks.length) return;
    for (const { copy } of picks) {
      const source = rows.find((row) => Number(row.ComputedGroup) === copy.sourceGroup && Number(row.ImageIndex) === copy.sourceIndex && Number(row.LayerNumber || 0) === 0);
      if (!source) continue;
      const axisX = Number.isFinite(Number(copy.axisX)) ? Number(copy.axisX) : Number(source.AxisX || 0) + Number(copy.offsetX || 0);
      const axisY = Number.isFinite(Number(copy.axisY)) ? Number(copy.axisY) : Number(source.AxisY || 0) + Number(copy.offsetY || 0);
      rows.push({
        ...source,
        CanonicalSequenceKey: `${source.CanonicalSequenceKey || 'Sprite'}_${copy.label || 'AxisCopy'}`,
        BaseGroup: String(copy.targetGroup),
        ComputedGroup: String(copy.targetGroup),
        SourceImageIndex: String(copy.targetIndex),
        ImageIndex: String(copy.targetIndex),
        CanonicalOutputFilename: `${String(copy.targetGroup).padStart(5, '0')}_${String(copy.targetIndex).padStart(5, '0')}.png`,
        AxisX: String(axisX), AxisY: String(axisY), ReviewStatus: 'REVIEW',
        ReviewReason: `Generated ${copy.label || 'axis-reference'} copy from ${copy.sourceGroup},${copy.sourceIndex}; review proposed axis.`
      });
    }
    writeManifest(manifestPath, rows, 'manifest-create-axis-copies');
    vscode.window.showInformationMessage(`Created ${picks.length} proposed axis-reference row(s). Review axes before approval.`);
  } catch (error) {
    vscode.window.showErrorMessage(`Axis-copy generation failed: ${error.message}`);
  }
}

function sourcePath(row, sourceRoot) {
  return row.SourceAbsolutePath || path.join(sourceRoot, row.OriginalRelativePath);
}

function resolveStagedPalettes(plan, paletteArchive) {
  const colors = new Map();
  for (const palette of paletteArchive.palettes) { const shifted = applyPaletteShifts(palette.group, palette.number, plan.shifts); colors.set(paletteId(shifted.group, shifted.number), paletteRgba(paletteArchive, palette.index)); }
  for (const entry of plan.palettes.filter((item) => item.kind !== 'alias')) {
    const data = fs.readFileSync(entry.source);
    colors.set(paletteId(entry.group, entry.number), /\.png$/i.test(entry.source) ? colorsForOrder(pngPaletteRgba(data), entry.tableOrder) : readAct(data, entry.tableOrder));
  }
  const resolve = (entry, seen = new Set()) => {
    const id = paletteId(entry.group, entry.number);
    if (colors.has(id)) return colors.get(id);
    if (seen.has(id)) throw new Error(`Circular staged palette alias involving ${id}.`);
    seen.add(id);
    const targetId = paletteId(entry.targetGroup, entry.targetNumber), targetEntry = plan.palettes.find((item) => paletteId(item.group, item.number) === targetId);
    const value = colors.get(targetId) || (targetEntry ? resolve(targetEntry, seen) : null);
    if (!value) throw new Error(`Staged palette alias ${id} points to missing palette ${targetId}.`);
    colors.set(id, value); return value;
  };
  return plan.palettes.map((entry) => ({ ...entry, colors: resolve(entry) }));
}

function expectedPaletteContract(paletteArchive, stagedPalettes = [], paletteShifts = [], sharedPalette = null, readColors = paletteRgba) {
  const expected = [];
  if (sharedPalette) expected.push({ group: sharedPalette.group, number: sharedPalette.number, colors: sharedPalette.colors });
  if (!paletteArchive) return expected;
  for (const palette of paletteArchive.palettes) { const shifted = applyPaletteShifts(palette.group, palette.number, paletteShifts), linked = palette.dataSize === 0 ? paletteArchive.palettes[palette.link] : null, aliasOf = linked ? applyPaletteShifts(linked.group, linked.number, paletteShifts) : null; expected.push({ group: shifted.group, number: shifted.number, colors: readColors(paletteArchive, palette.index), aliasOf }); }
  for (const palette of stagedPalettes) expected.push({ group: palette.group, number: palette.number, colors: palette.colors, aliasOf: palette.kind === 'alias' ? { group: palette.targetGroup, number: palette.targetNumber } : null });
  return expected;
}

async function createBuildPackage({ sourceRoot, manifestPath, outputDirectory, outputSff, paletteSourceSff, sharedPalettePath, sharedPaletteId = '0,0', buildProfile, autocrop = false, autocropIdentities = null, includeStagedPalettes = true }) {
  const cropSet = Array.isArray(autocropIdentities) ? new Set(autocropIdentities.map(String)) : null;
  const rows = readManifest(manifestPath);
  const aliasRegistry = readAliasRegistry(manifestPath);
  const profile = normalizeBuildProfile(buildProfile || {});
  const indexAudit = auditIndexPolicy(rows, profile);
  if (indexAudit.issues.length) {
    const detail = indexAudit.issues.slice(0, 20).map((item) => `${item.group},${item.actual ?? 'unresolved'} must be ${item.group},${item.expected} (${item.sequence})`).join('\n');
    throw new Error(`Manifest violates ${profile.profileName}:\n${detail}${indexAudit.issues.length > 20 ? `\n…and ${indexAudit.issues.length - 20} more. Run “Apply Project Get-Hit Indexing” first.` : '\nRun “Apply Project Get-Hit Indexing” first.'}`);
  }
  const issues = validateManifest(rows, { requireApproved: true, aliasRegistry });
  if (issues.length) throw new Error(`Manifest validation failed:\n${issues.slice(0, 20).join('\n')}${issues.length > 20 ? `\n…and ${issues.length - 20} more` : ''}`);

  fs.mkdirSync(outputDirectory, { recursive: true });
  const inputDirectory = path.join(outputDirectory, 'input');
  fs.mkdirSync(inputDirectory, { recursive: true });
  for (const name of fs.readdirSync(inputDirectory)) if (/\.png$/i.test(name)) fs.unlinkSync(path.join(inputDirectory, name));

  const mapping = [];
  const sorted = [...rows].sort((a, b) => Number(a.ComputedGroup) - Number(b.ComputedGroup) || Number(a.ImageIndex) - Number(b.ImageIndex));
  for (const row of sorted) {
    if (cropSet && paletteSourceSff && !cropSet.has(`${Number(row.ComputedGroup)},${Number(row.ImageIndex)}`)) continue;
    const source = sourcePath(row, sourceRoot);
    if (!fs.existsSync(source)) throw new Error(`Source sprite is missing: ${source}`);
    const hash = await hashFile(source);
    if (hash !== row.SourceSHA256) throw new Error(`Source changed after approval: ${source}`);
    const group = Number(row.ComputedGroup);
    const index = Number(row.ImageIndex);
    const buildFile = `g${String(group).padStart(5, '0')}_i${String(index).padStart(5, '0')}.png`;
    fs.copyFileSync(source, path.join(inputDirectory, buildFile));
    mapping.push({ group, index, buildFile, source, axisX: Number(row.AxisX), axisY: Number(row.AxisY), layer: Number(row.LayerNumber || 0), palette: null });
  }

  let paletteArchive = null, stagedPalettes = [], paletteShifts = [], sharedPalette = null;
  if (sharedPalettePath) {
    if (paletteSourceSff) throw new Error('Choose either an existing SFF palette table or one shared provisional palette, not both.');
    if (!fs.existsSync(sharedPalettePath)) throw new Error(`Shared palette source is missing: ${sharedPalettePath}`);
    const match = /^(\d+)\s*,\s*(\d+)$/.exec(String(sharedPaletteId));
    if (!match) throw new Error('Shared palette ID must use group,index form, such as 0,0.');
    const source = fs.readFileSync(sharedPalettePath);
    const colors = /\.act$/i.test(sharedPalettePath) ? actRgba(source) : /\.png$/i.test(sharedPalettePath) ? pngPaletteRgba(source) : null;
    if (!Array.isArray(colors) || colors.length !== 256) throw new Error('The shared provisional palette must be a 256-color ACT or indexed PNG.');
    sharedPalette = { group: Number(match[1]), number: Number(match[2]), colors, source: sharedPalettePath };
    for (const entry of mapping) entry.palette = `${sharedPalette.group},${sharedPalette.number}`;
  }
  if (paletteSourceSff) {
    paletteArchive = readSff(paletteSourceSff);
    const palettePlan = includeStagedPalettes ? verifyPalettePlan(paletteSourceSff, paletteArchive.palettes.map((palette) => `${palette.group},${palette.number}`)) : { palettes: [], shifts: [] };
    paletteShifts = palettePlan.shifts;
    const occupied = new Set(paletteArchive.palettes.map((palette) => { const shifted = applyPaletteShifts(palette.group, palette.number, palettePlan.shifts); return `${shifted.group},${shifted.number}`; }));
    for (const entry of palettePlan.palettes) { const id = paletteId(entry.group, entry.number); if (occupied.has(id)) throw new Error(`Staged palette ID ${id} now conflicts with the source SFF. Remove or restage it.`); occupied.add(id); }
    stagedPalettes = resolveStagedPalettes(palettePlan, paletteArchive);
    const sourceSprites = new Map(paletteArchive.sprites.map((sprite) => [`${sprite.group},${sprite.number}`, sprite]));
    for (const entry of mapping) {
      const sourceSprite = sourceSprites.get(`${entry.group},${entry.index}`), palette = sourceSprite && paletteArchive.palettes[sourceSprite.paletteIndex];
      if (palette) { const shifted = applyPaletteShifts(palette.group, palette.number, palettePlan.shifts); entry.palette = `${shifted.group},${shifted.number}`; }
    }
    // A partial crop must retain current sprites outside its scope, including
    // sprites absent from the source manifest and earlier archive-only edits.
    if (cropSet) for (const sprite of paletteArchive.sprites) {
      if (cropSet.has(`${sprite.group},${sprite.number}`)) continue;
      const buildFile = `g${String(sprite.group).padStart(5, '0')}_i${String(sprite.number).padStart(5, '0')}.png`;
      fs.writeFileSync(path.join(inputDirectory, buildFile), spritePng(paletteArchive, sprite, null, true));
      const palette = paletteArchive.palettes[sprite.paletteIndex];
      const shifted = palette ? applyPaletteShifts(palette.group, palette.number, palettePlan.shifts) : null;
      mapping.push({ group: sprite.group, index: sprite.number, buildFile, source: paletteSourceSff, axisX: sprite.axisX, axisY: sprite.axisY, layer: 0, palette: shifted ? `${shifted.group},${shifted.number}` : null, preserved: true });
    }
    for (const protectedSprite of paletteArchive.sprites.filter((sprite) => sprite.group === 59000 && (sprite.number === 0 || sprite.number === 1))) {
      if (mapping.some((entry) => entry.group === protectedSprite.group && entry.index === protectedSprite.number)) continue;
      const buildFile = `g${String(protectedSprite.group).padStart(5, '0')}_i${String(protectedSprite.number).padStart(5, '0')}.png`, palette = paletteArchive.palettes[protectedSprite.paletteIndex];
      fs.writeFileSync(path.join(inputDirectory, buildFile), spritePng(paletteArchive, protectedSprite));
      const shiftedPalette = palette ? applyPaletteShifts(palette.group, palette.number, palettePlan.shifts) : null;
      mapping.push({ group: protectedSprite.group, index: protectedSprite.number, buildFile, source: paletteSourceSff, axisX: protectedSprite.axisX, axisY: protectedSprite.axisY, layer: 0, palette: shiftedPalette ? `${shiftedPalette.group},${shiftedPalette.number}` : null, protected: true });
    }
    mapping.sort((a, b) => a.group - b.group || a.index - b.index);
  }

  const definitionPath = path.join(outputDirectory, 'sprmake2.def');
  const lines = [
    '[Output]', `filename = ${outputSff}`, '', '[Option]', `input.dir = ${inputDirectory}`,
    'sprite.compress.5 = lz5', 'sprite.compress.8 = png8', 'sprite.compress.24 = png24',
    'sprite.compress.32 = png32', 'sprite.decompressonload = 0', `sprite.detectduplicates = ${cropSet ? 0 : 1}`,
    `sprite.autocrop = ${autocrop ? 1 : 0}`, 'pal.detectduplicates = 1', 'pal.discardduplicates = 0',
    'pal.reversepng = 0', ...(paletteArchive || sharedPalette ? ['pal.reverseact = 1'] : []), 'sprite.usepal = -1', 'sprite.removecolors = -1'
  ];
  if (sharedPalette) {
    const actFile = `pal_${sharedPalette.group}_${sharedPalette.number}_shared.act`;
    fs.writeFileSync(path.join(inputDirectory, actFile), paletteAct(sharedPalette.colors));
    lines.push('', '[Pal]', `${sharedPalette.group},${sharedPalette.number}, ${actFile}, 0,255 ; one shared provisional CS table`);
  }
  if (paletteArchive) {
    lines.push('', '[Pal]');
    for (const palette of paletteArchive.palettes) {
      const shifted = applyPaletteShifts(palette.group, palette.number, paletteShifts), actFile = `pal_${shifted.group}_${shifted.number}.act`;
      fs.writeFileSync(path.join(inputDirectory, actFile), paletteAct(paletteRgba(paletteArchive, palette.index)));
      lines.push(`${shifted.group},${shifted.number}, ${actFile}, 0,255${shifted.number!==palette.number||shifted.group!==palette.group?` ; shifted from ${palette.group},${palette.number}`:''}`);
    }
    for (const palette of stagedPalettes.filter((entry) => entry.kind !== 'alias')) {
      const actFile = `pal_${palette.group}_${palette.number}.act`;
      fs.writeFileSync(path.join(inputDirectory, actFile), paletteAct(palette.colors));
      lines.push(`${palette.group},${palette.number}, ${actFile}, 0,255`);
    }
    for (const palette of stagedPalettes.filter((entry) => entry.kind === 'alias')) {
      const actFile = `pal_${palette.group}_${palette.number}_alias_of_${palette.targetGroup}_${palette.targetNumber}.act`;
      fs.writeFileSync(path.join(inputDirectory, actFile), paletteAct(palette.colors));
      lines.push(`${palette.group},${palette.number}, ${actFile}, 0,255 ; linked alias of ${palette.targetGroup},${palette.targetNumber}`);
    }
  }
  let activePalette = null, activeAutocrop = Boolean(autocrop);
  for (const entry of mapping) {
    const wanted = entry.palette || '-1';
    const wantedAutocrop = cropSet ? cropSet.has(`${entry.group},${entry.index}`) : Boolean(autocrop);
    if (wanted !== activePalette || wantedAutocrop !== activeAutocrop) {
      lines.push('', '[Option]', `sprite.usepal = ${wanted}`, `sprite.autocrop = ${wantedAutocrop ? 1 : 0}`, '', '[Sprite]');
      activePalette = wanted; activeAutocrop = wantedAutocrop;
    }
    lines.push(`${entry.group},${entry.index}, ${entry.buildFile}, ${entry.axisX},${entry.axisY}`);
  }
  fs.writeFileSync(definitionPath, `${lines.join('\r\n')}\r\n`, 'utf8');

  const sprmake = resolveProjectTool(vscode.workspace.getConfiguration('ikemenZss').get('sprMake2Path', 'sprmake2.exe'), sourceRoot, 'sprmake2.exe');
  const batchPath = path.join(outputDirectory, 'build.cmd');
  fs.writeFileSync(batchPath, `@echo off\r\n"${sprmake}" "${definitionPath}"\r\nexit /b %errorlevel%\r\n`, 'ascii');
  fs.writeFileSync(path.join(outputDirectory, 'production_mapping.csv'), stringifyCsv(mapping.map((entry) => ({
    Group: entry.group, Index: entry.index, Layer: entry.layer, Palette: entry.palette || 'Own PNG palette', Protected: entry.protected ? 'YES' : '', File: entry.buildFile, Source: entry.source, AxisX: entry.axisX, AxisY: entry.axisY
  }))), 'utf8');
  fs.writeFileSync(path.join(outputDirectory, 'validation_report.txt'), [
    'SFF BUILD PACKAGE READY', `Project profile: ${profile.profileName}`, `Project id: ${profile.projectId}`, `Get-hit indexing: ${profile.getHitIndexing.enabled ? `source frame × ${profile.getHitIndexing.step}` : 'disabled by project profile'}`, `Sprites: ${mapping.length}`, `Groups: ${new Set(mapping.map((entry) => entry.group)).size}`,
    `Layer sprites: ${mapping.filter((entry) => entry.layer > 0).length}`, `Embedded palettes preserved: ${paletteArchive ? paletteArchive.palettes.length : 0}`, `Shared provisional palette: ${sharedPalette ? `${sharedPalette.group},${sharedPalette.number}` : 'none'}`, `New palettes staged: ${stagedPalettes.filter((entry) => entry.kind !== 'alias').length}`, `Linked palette aliases staged: ${stagedPalettes.filter((entry) => entry.kind === 'alias').length}`, `Palette insert/shift operations: ${paletteShifts.length}`, `Protected template sprites preserved: ${mapping.filter((entry) => entry.protected).length}`, `Palette source: ${paletteSourceSff || sharedPalettePath || 'None — PNG palettes are used'}`, 'Duplicate palette handling: preserve IDs and link identical data', `Autocrop: ${cropSet ? `${cropSet.size} selected identity/identities` : (autocrop ? 'enabled for release output' : 'disabled for development')}`, 'Manifest validation errors: 0'
  ].join('\r\n'), 'utf8');
  fs.writeFileSync(path.join(outputDirectory, 'sff-build-profile.json'), `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
  const expectedPalettes = expectedPaletteContract(paletteArchive, stagedPalettes, paletteShifts, sharedPalette);
  return { definitionPath, batchPath, sprmake, mapping, profile, expectedPalettes };
}

async function generateBuildFiles(request = {}) {
  const manifestPath = await pickFile('Choose an approved SFF manifest', { 'CSV manifest': ['csv'] });
  if (!manifestPath) return;
  const selectedProfile = await chooseProjectBuildProfile(manifestPath);
  if (!selectedProfile) return;
  const sourceRoot = await pickFolder('Choose the base sprite source folder');
  if (!sourceRoot) return;
  const outputDirectory = await pickFolder('Choose a folder for the SprMaker2 build package');
  if (!outputDirectory) return;
  const forcedPaletteSource = request && typeof request === 'object' && request.paletteSourceSff ? path.resolve(request.paletteSourceSff) : '';
  const paletteMode = forcedPaletteSource ? { preserve: true } : await vscode.window.showQuickPick([
    { label: 'Preserve palettes from an existing SFF', description: 'Recommended when rebuilding an established character; also retains protected 59000 templates.', preserve: true },
    { label: 'Use the source PNG palettes', description: 'Original behavior for a brand-new SFF with no established palette table.', preserve: false }
  ], { title: 'How should the SFF palette table be built?' });
  if (!paletteMode) return;
  const paletteSourceSff = forcedPaletteSource || (paletteMode.preserve ? await pickFile('Choose the SFF whose palette table and assignments should be preserved', { 'SFF archive': ['sff'] }) : undefined);
  if (paletteMode.preserve && !paletteSourceSff) return;
  const defaultName = vscode.workspace.getConfiguration('ikemenZss').get('sffDefaultFilename', 'Character.sff');
  const outputUri = await vscode.window.showSaveDialog({ title: 'Choose the SFF output filename', defaultUri: vscode.Uri.file(path.join(outputDirectory, defaultName)), filters: { 'SFF archive': ['sff'] } });
  if (!outputUri) return;
  try {
    const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Generating SprMaker2 build files' }, () => createBuildPackage({ sourceRoot, manifestPath, outputDirectory, outputSff: outputUri.fsPath, paletteSourceSff, buildProfile: selectedProfile.profile }));
    const action = await vscode.window.showInformationMessage(`SprMaker2 package created for ${result.mapping.length} sprites using ${result.profile.profileName}.`, 'Open sprmake2.def', 'Open build.cmd');
    if (action === 'Open sprmake2.def') await vscode.window.showTextDocument(vscode.Uri.file(result.definitionPath), { preview: false });
    if (action === 'Open build.cmd') await vscode.window.showTextDocument(vscode.Uri.file(result.batchPath), { preview: false });
    return { ...result, outputSff: outputUri.fsPath, outputDirectory };
  } catch (error) {
    vscode.window.showErrorMessage(`SFF package generation failed: ${error.message}`);
  }
}

async function buildApprovedManifest(request = {}) {
  const capabilities = detectCapabilities({ uiKind: vscode.env.uiKind === vscode.UIKind.Web ? 'web' : 'desktop', platform: process.platform, environment: process.env });
  if (!capabilities.nativeBuilders) return vscode.window.showInformationMessage(missingCapabilityMessage('SprMaker2 build execution', capabilities));
  const generated = await generateBuildFiles(request);
  if (!generated) return;
  if (!fs.existsSync(generated.sprmake)) return vscode.window.showErrorMessage(`SprMaker2 was not found: ${generated.sprmake}`);
  const choice = await vscode.window.showWarningMessage('Run SprMaker2 now?', { modal: true, detail: 'The approved manifest has passed validation. Source images will not be modified.' }, 'Build SFF');
  if (choice !== 'Build SFF') return;
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Building SFF with SprMaker2' }, () => new Promise((resolve, reject) => {
    const child = spawn(generated.sprmake, [generated.definitionPath], { cwd: generated.outputDirectory, windowsHide: true });
    let output = '';
    child.stdout.on('data', (data) => { output += data; });
    child.stderr.on('data', (data) => { output += data; });
    child.on('error', reject);
    child.on('close', (code) => {
      fs.writeFileSync(path.join(generated.outputDirectory, 'sprmake2.log'), output, 'utf8');
      if (code !== 0 || !fs.existsSync(generated.outputSff)) reject(new Error(`SprMaker2 failed with exit code ${code}.`));
      else {
        try { assertBuiltArchive(generated.outputSff, generated.mapping, generated.expectedPalettes); resolve(); }
        catch (error) { reject(error); }
      }
    });
  })).then(() => vscode.window.showInformationMessage(`SFF created: ${generated.outputSff}`), (error) => vscode.window.showErrorMessage(error.message));
}

async function cropSffArchive(uri, request = {}) {
  let filename = uri?.fsPath || uri?.path;
  if (!filename || !fs.existsSync(filename)) filename = await pickFile('Choose the SFF to crop', { 'SFF archive': ['sff'] });
  if (!filename) return;
  const capabilities = detectCapabilities({ uiKind: vscode.env.uiKind === vscode.UIKind.Web ? 'web' : 'desktop', platform: process.platform, environment: process.env });
  if (!capabilities.nativeBuilders) return vscode.window.showInformationMessage(missingCapabilityMessage('SFF archive crop', capabilities));
  const archive = readSff(filename), current = archive.sprites[Number.isInteger(Number(request.selectedIndex)) ? Number(request.selectedIndex) : 0];
  if (!current) return vscode.window.showWarningMessage('The selected SFF contains no sprites to crop.');
  const scope = await vscode.window.showQuickPick([
    { label: `Current sprite (${current.group},${current.number})`, mode: 'current' },
    { label: `Current group (${current.group})`, mode: 'group' },
    { label: `All sprites (${archive.sprites.length})`, mode: 'all' }
  ], { title: 'Crop transparent borders in which SFF sprites?' });
  if (!scope) return;
  const identities = archive.sprites
    .filter((sprite) => scope.mode === 'all' || (scope.mode === 'group' ? sprite.group === current.group : sprite.index === current.index))
    .map((sprite) => `${sprite.group},${sprite.number}`);
  const manifestPath = await pickFile('Choose the authoritative SprMaker2 source manifest', { 'CSV manifest': ['csv'] }); if (!manifestPath) return;
  const selectedProfile = await chooseProjectBuildProfile(manifestPath); if (!selectedProfile) return;
  const sourceRoot = await pickFolder('Choose the uncropped source sprite folder'); if (!sourceRoot) return;
  const approved = new Set(readManifest(manifestPath).map((row) => `${Number(row.ComputedGroup ?? row.Group ?? row.BaseGroup)},${Number(row.ImageIndex ?? row.Index)}`));
  const missing = identities.filter((identity) => !approved.has(identity));
  if (missing.length) return vscode.window.showErrorMessage(`Crop is blocked: ${missing.length} selected sprite(s) are absent from the authoritative manifest. No file was changed.`);
  const answer = await vscode.window.showWarningMessage(`Crop ${identities.length} sprite(s) and rebuild ${path.basename(filename)}?`, { modal: true, detail: 'SprMaker2 will crop only this scope, adjust its axes, preserve the current embedded palette table, and rebuild from reviewed uncropped sources. The current SFF is replaced only after the new archive succeeds.' }, 'Crop and Rebuild');
  if (answer !== 'Crop and Rebuild') return;
  const outputDirectory = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ikemen-sff-crop-')), outputSff = path.join(outputDirectory, path.basename(filename));
  try {
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Cropping ${identities.length} SFF sprite(s)` }, async () => {
      const plan = await createBuildPackage({ sourceRoot, manifestPath, outputDirectory, outputSff, paletteSourceSff: filename, buildProfile: selectedProfile.profile, autocropIdentities: identities, includeStagedPalettes: false });
      await new Promise((resolve, reject) => {
        const child = spawn(plan.sprmake, [plan.definitionPath], { cwd: outputDirectory, windowsHide: true }); let output = '';
        child.stdout.on('data', (data) => { output += data; }); child.stderr.on('data', (data) => { output += data; }); child.on('error', reject);
        child.on('close', (code) => {
          if (code !== 0 || !fs.existsSync(outputSff)) return reject(new Error(`SprMaker2 crop failed with exit code ${code}. ${output.slice(-2000)}`));
          try { assertBuiltArchive(outputSff, plan.mapping); resolve(); }
          catch (error) { reject(error); }
        });
      });
    });
    const result = transactionalWrite(fs, filename, fs.readFileSync(outputSff), sffMutationOptions(filename, `sff-autocrop-${scope.mode}`, { expectedHash: hash(archive.buffer) }));
    vscode.window.showInformationMessage(`Cropped ${identities.length} sprite(s) and rebuilt ${path.basename(filename)}.${result.backup ? ` Backup: ${path.basename(result.backup)}` : ''} Reopen the viewer to refresh dimensions.`);
  } catch (error) { vscode.window.showErrorMessage(`SFF crop failed; the existing archive was not changed: ${error.message}`); }
}

async function importLayerFolder() {
  const manifestPath = await pickFile('Choose the approved base manifest', { 'CSV manifest': ['csv'] });
  if (!manifestPath) return;
  const layerFolder = await pickFolder('Choose the layer sprite folder');
  if (!layerFolder) return;
  const inferred = layerFolderNumber(path.basename(layerFolder));
  const choices = [1, 2, 3, 4].map((number) => ({ label: `Layer ${number}`, number, description: inferred === number ? 'Detected from folder name' : '' }));
  const selected = await vscode.window.showQuickPick(choices, { title: 'Import selected folder as which layer?' });
  if (!selected) return;
  const inferredRole = inferLayerRole(path.basename(layerFolder));
  const roles = [
    { label: 'Cosmetic overlay', description: 'Beard, mask, or costume part; normally in front of its owner', role: 'Cosmetic', syncLayer: '1', owner: 'P1' },
    { label: 'Interaction part — front', description: 'Separate animation piece intended in front of its synchronization owner', role: 'PartFront', syncLayer: '1', owner: 'Review' },
    { label: 'Interaction part — back', description: 'Separate animation piece intended behind its synchronization owner', role: 'PartBack', syncLayer: '-1', owner: 'Review' },
    { label: 'Mixed / review manually', description: 'Do not suggest runtime order', role: 'Review', syncLayer: '', owner: 'Review' }
  ];
  const role = await vscode.window.showQuickPick(roles.map((item) => ({ ...item, description: (item.role === inferredRole.role ? 'Detected from folder name · ' : '') + item.description })), { title: 'What kind of separate sprite part is this?' });
  if (!role) return;
  const baseRows = readManifest(manifestPath);
  const files = [];
  for (const name of fs.readdirSync(layerFolder).filter((entry) => /\.png$/i.test(entry)).sort()) {
    const fullPath = path.join(layerFolder, name);
    files.push({ name, fullPath, hash: await hashFile(fullPath) });
  }
  const result = makeLayerRows(baseRows, files, selected.number, readAliasRegistry(manifestPath), role);
  if (result.unmatched.length) {
    const report = path.join(path.dirname(manifestPath), `Layer${selected.number}_unmatched.txt`);
    fs.writeFileSync(report, result.unmatched.join('\r\n'), 'utf8');
    return vscode.window.showErrorMessage(`${result.unmatched.length} layer frame(s) did not have a unique base match. Nothing was imported. See ${report}`);
  }
  const automatic = role.role === 'Cosmetic';
  const confirm = await vscode.window.showInformationMessage(
    `Matched ${result.created.length} Layer ${selected.number} frame(s) as ${role.role}. ${result.created.filter((row) => row.RedundancyStatus === 'CANDIDATE_EXACT').length} are byte-identical redundancy candidates.`,
    { modal: true, detail: automatic ? 'Cosmetic rows will be approved for storage intake. Runtime ordering remains a coder responsibility.' : 'Interaction and mixed parts will remain blocked in REVIEW until a coder confirms owner-relative draw order.' }, 'Create Layer Manifest'
  );
  if (confirm !== 'Create Layer Manifest') return;
  for (const row of result.created) { row.ReviewStatus = automatic ? 'APPROVED' : 'REVIEW'; row.ReviewReason = automatic ? `Approved cosmetic storage intake for Layer ${selected.number}; runtime ordering remains coder-owned.` : `Manual coder review required for ${role.role}; throws and participant-relative parts are never auto-approved.`; }
  const saveUri = await vscode.window.showSaveDialog({ title: 'Save manifest with layer entries', defaultUri: vscode.Uri.file(path.join(path.dirname(manifestPath), `${path.basename(manifestPath, '.csv')}_Layer${selected.number}.csv`)), filters: { 'CSV manifest': ['csv'] } });
  if (!saveUri) return;
  writeManifest(saveUri.fsPath, [...baseRows, ...result.created]);
  vscode.window.showInformationMessage(`Layer manifest created with ${result.created.length} new entries.`);
}

async function reviewRedundantLayers() {
  const manifestPath = await pickFile('Choose a layer manifest', { 'CSV manifest': ['csv'] });
  if (!manifestPath) return;
  let rows = readManifest(manifestPath);
  const candidates = redundancyCandidates(rows);
  if (!candidates.length) return vscode.window.showInformationMessage('No active redundant-layer warnings were found.');
  const picks = await vscode.window.showQuickPick(candidates.map((row) => ({
    label: row.OriginalRelativePath, description: `${row.ComputedGroup},${row.ImageIndex} · ${row.RedundancyStatus || 'exact match'}`, row, picked: true
  })), { title: 'Review redundant layer frames', canPickMany: true, placeHolder: 'Select the reviewed warnings to act on' });
  if (!picks || !picks.length) return;
  const action = await vscode.window.showQuickPick([
    { label: 'Keep and dismiss warning', mode: 'dismiss' },
    { label: 'Clear from build manifest', mode: 'clear' },
    { label: 'Move sources to backup and clear', mode: 'backup' }
  ], { title: `Action for ${picks.length} selected layer frame(s)` });
  if (!action) return;
  const selectedRows = new Set(picks.map((pick) => pick.row));
  let backupFolder;
  if (action.mode === 'backup') {
    backupFolder = await pickFolder('Choose a recoverable backup folder for the selected source PNGs');
    if (!backupFolder) return;
  }
  if (action.mode === 'dismiss') {
    const baseHashes = new Map(
      rows
        .filter((row) => Number(row.Layer || 0) === 0)
        .map((row) => [`${row.BaseGroup}\0${row.ImageIndex}`, row.SourceSHA256 || ''])
    );
    for (const row of selectedRows) {
      const baseHash = baseHashes.get(`${row.BaseGroup}\0${row.ImageIndex}`) || row.BaseSourceSHA256 || '';
      row.RedundancyStatus = 'DISMISSED';
      row.BaseSourceSHA256 = baseHash;
      row.RedundancyBaseHash = baseHash;
      row.RedundancyLayerHash = row.SourceSHA256;
    }
  } else {
    rows = rows.filter((row) => !selectedRows.has(row));
  }
  const moved = [];
  try {
    if (action.mode === 'backup') {
      const moves = [...selectedRows].map((row) => ({ source: row.SourceAbsolutePath, destination: path.join(backupFolder, path.basename(row.SourceAbsolutePath || '')) }));
      const destinations = new Set();
      for (const move of moves) {
        if (!move.source || !fs.existsSync(move.source)) throw new Error(`Layer source not found: ${move.source}`);
        const key = path.resolve(move.destination).toLowerCase();
        if (destinations.has(key) || fs.existsSync(move.destination)) throw new Error(`Backup destination already exists or is duplicated: ${move.destination}`);
        destinations.add(key);
      }
      for (const move of moves) { fs.renameSync(move.source, move.destination); moved.push(move); }
    }
    writeManifest(manifestPath, rows, 'manifest-layer-review');
  } catch (error) {
    for (const move of moved.reverse()) { try { if (fs.existsSync(move.destination) && !fs.existsSync(move.source)) fs.renameSync(move.destination, move.source); } catch (_) {} }
    throw error;
  }
  vscode.window.showInformationMessage(`Updated ${picks.length} layer decision(s).`);
}

async function reviewLayerParts() {
  const manifestPath = await pickFile('Choose a manifest containing interaction parts', { 'CSV manifest': ['csv'] });
  if (!manifestPath) return;
  const rows = readManifest(manifestPath), candidates = manualLayerRows(rows);
  if (!candidates.length) return vscode.window.showInformationMessage('No unresolved interaction-part rows were found.');
  const picks = await vscode.window.showQuickPick(candidates.map((row) => ({
    label: row.OriginalRelativePath,
    description: `${row.LayerRole || 'Review'} · bank ${row.LayerNumber} · ${row.ComputedGroup},${row.ImageIndex}`,
    detail: 'Artist alignment is preserved. Select only parts whose participant-relative order you have visually reviewed.',
    row
  })), { title: 'Select manually reviewed interaction parts', canPickMany: true, placeHolder: 'Nothing is approved merely by appearing in this list' });
  if (!picks || !picks.length) return;
  const decision = await vscode.window.showQuickPick([
    { label: 'P1 · Front', description: 'Synchronize in front of P1', owner: 'P1', syncLayer: 1 },
    { label: 'P1 · Back', description: 'Synchronize behind P1', owner: 'P1', syncLayer: -1 },
    { label: 'P2 · Front', description: 'Synchronize in front of P2', owner: 'P2', syncLayer: 1 },
    { label: 'P2 · Back', description: 'Synchronize behind P2', owner: 'P2', syncLayer: -1 },
    { label: 'Helper · Front', description: 'Synchronize in front of the reviewed helper owner', owner: 'Helper', syncLayer: 1 },
    { label: 'Helper · Back', description: 'Synchronize behind the reviewed helper owner', owner: 'Helper', syncLayer: -1 },
    { label: 'Projectile · Front', description: 'Synchronize in front of the reviewed projectile owner', owner: 'Projectile', syncLayer: 1 },
    { label: 'Projectile · Back', description: 'Synchronize behind the reviewed projectile owner', owner: 'Projectile', syncLayer: -1 }
  ], { title: 'Record the human-reviewed owner and order' });
  if (!decision) return;
  const confirmation = await vscode.window.showWarningMessage(`Approve ${picks.length} interaction part(s) as ${decision.label}?`, { modal: true, detail: 'This records a human decision; it does not generate throw code or attempt to infer ordering.' }, 'Record Review');
  if (confirmation !== 'Record Review') return;
  const identities = picks.map(({ row }) => `${row.ComputedGroup},${row.ImageIndex}`), result = applyManualLayerDecision(rows, identities, decision);
  writeManifest(manifestPath, result.rows, 'manifest-part-review');
  vscode.window.showInformationMessage(`Recorded ${result.updated} human-reviewed interaction-part decision(s). Backup: ${backup}`);
}

async function reviewDismissedLayerWarnings() {
  const manifestPath = await pickFile('Choose a layer manifest', { 'CSV manifest': ['csv'] });
  if (!manifestPath) return;
  const rows = readManifest(manifestPath);
  const dismissed = rows.filter((row) => row.RedundancyStatus === 'DISMISSED');
  if (!dismissed.length) return vscode.window.showInformationMessage('No dismissed layer warnings were found.');
  const picks = await vscode.window.showQuickPick(dismissed.map((row) => ({ label: row.OriginalRelativePath, description: `${row.ComputedGroup},${row.ImageIndex}`, row })), { title: 'Reset dismissed layer warnings', canPickMany: true });
  if (!picks || !picks.length) return;
  for (const pick of picks) pick.row.RedundancyStatus = 'CANDIDATE_MANUAL';
  writeManifest(manifestPath, rows, 'manifest-reset-dismissals');
  vscode.window.showInformationMessage(`Reset ${picks.length} dismissed warning(s).`);
}

async function showNamingStandard(context) {
  const uri = vscode.Uri.joinPath(context.extensionUri, 'data', 'sff-standard.md');
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document, { preview: true });
}

async function showArtistHandoffGuide(context) {
  const uri = vscode.Uri.joinPath(context.extensionUri, 'data', 'sff-artist-guide.md');
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document, { preview: true });
}

function aliasTemplate() {
  return {
    version: 1,
    aliases: {
      contexts: { st: ['stand', 'standing'], cr: ['crouch', 'crouching'], j: ['jump', 'jumping', 'air', 'aerial'] },
      strengths: { L: ['light', 'weak'], M: ['medium'], H: ['heavy', 'strong'] },
      attackTypes: { P: ['punch'], K: ['kick'] },
      directions: { f: ['forward', 'toward'], b: ['back', 'backward'], df: ['downforward'], db: ['downback'] },
      categories: { Normals: ['normal'], CommandNormals: ['command normal', 'commandnormal'], Throws: ['throw'], System: ['system'] },
      phases: { Startup: ['start'], Rise: ['rising'], Descent: ['falling', 'drop'], Recovery: ['recover'] },
      sequences: { 'st LP': ['standing light punch'], 'cr LP': ['crouching light punch'] },
      families: {
        Fireball: ['hadouken'], DP: ['shoryu', 'shoryuken'], AirborneAdvance: ['tatsu', 'tiger knee'],
        GroundedAdvance: ['donkey kick', 'joudan'], DiveAttack: ['dive kick', 'dive punch']
      }
    }
  };
}

async function openAliasRegistry() {
  const workspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  if (!workspace) return vscode.window.showErrorMessage('Open a project folder before editing SFF aliases.');
  const filename = path.join(workspace.uri.fsPath, ALIAS_FILENAME);
  if (!fs.existsSync(filename)) {
    transactionalWrite(fs, filename, `${JSON.stringify(aliasTemplate(), null, 2)}\n`, sffMutationOptions(filename, 'create-sff-alias-registry', { allowExisting: false }));
    vscode.window.showInformationMessage(`Created ${ALIAS_FILENAME}. Add project aliases here.`);
  }
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filename));
  await vscode.window.showTextDocument(document, { preview: false });
}

function registerSffCommands(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('sff.generateBuildFiles', generateBuildFiles),
    vscode.commands.registerCommand('sff.buildApprovedManifest', buildApprovedManifest),
    vscode.commands.registerCommand('sff.cropArchive', cropSffArchive),
    vscode.commands.registerCommand('sff.importLayerFolder', importLayerFolder),
    vscode.commands.registerCommand('sff.reviewLayerParts', reviewLayerParts),
    vscode.commands.registerCommand('sff.reviewRedundantLayers', reviewRedundantLayers),
    vscode.commands.registerCommand('sff.reviewDismissedLayerWarnings', reviewDismissedLayerWarnings),
    vscode.commands.registerCommand('sff.showNamingStandard', () => showNamingStandard(context)),
    vscode.commands.registerCommand('sff.showArtistHandoffGuide', () => showArtistHandoffGuide(context)),
    vscode.commands.registerCommand('sff.openAliasRegistry', openAliasRegistry),
    vscode.commands.registerCommand('sff.openRequirementsProfile', openRequirementsProfile),
    vscode.commands.registerCommand('sff.addCharacterRequirement', addCharacterRequirement),
    vscode.commands.registerCommand('sff.auditCharacterRequirements', auditCharacterRequirements),
    vscode.commands.registerCommand('sff.reviewUnassignedSprites', reviewUnassignedSprites),
    vscode.commands.registerCommand('sff.createMissingAxisCopies', createMissingAxisCopies),
    vscode.commands.registerCommand('sff.applyProjectIndexing', applyProjectIndexing),
    vscode.commands.registerCommand('sff.openProjectBuildProfile', openProjectBuildProfile),
    vscode.commands.registerCommand('sff.createProjectBuildProfile', createProjectBuildProfile),
    vscode.commands.registerCommand('sff.openSprMakerText', () => openMakerText('sff')),
    vscode.commands.registerCommand('snd.openMakerText', () => openMakerText('snd'))
  );
}

module.exports = { registerSffCommands, createBuildPackage, cropSffArchive, resolveStagedPalettes, expectedPaletteContract, readManifest, writeManifest, projectProfiles };
