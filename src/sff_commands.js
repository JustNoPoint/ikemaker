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
const { parseSffBuffer, readSff, paletteRgba, paletteAct, actRgba, spritePng } = require('./sff_reader');
const { pngPaletteRgba } = require('./palette_library');
const { readAct, colorsForOrder, normalizeOrder } = require('./act_palette_order');
const { verifyPalettePlan, paletteId, applyPaletteShifts } = require('./palette_plan');
const { detectCapabilities, missingCapabilityMessage } = require('./platform_capabilities');
const { hash, transactionalWrite, transactionalWriteSet, optionsFromConfig } = require('./mutation_safety');
const metadataRegistry = require('./metadata_registry');
const projectContext = require('./project_context_model');
const { normalizeProfile: normalizeBuildProfile, auditIndexPolicy, applyIndexPolicy, profileTemplate: buildProfileTemplate } = require('./sff_build_profile');
const { resolveProjectTool } = require('./bundled_tools');
const { chooseFileOrFolder } = require('./open_target_picker');
const { assertBuiltArchive } = require('./sff_build_verify');
const {
  SEPARATE, SHARE, storagePolicy, copyApprovedSnapshot, candidatePath, captureTarget, adoptCandidate, adoptCandidateWithArtifacts,
  withTargetLease, createPrivateRun, cleanupPrivateRun, loadCandidateBytes, verifyLoadedCandidate, preserveTargetBackup
} = require('./sff_build_safety');
const { mergeLifecycleRegistry, lifecycleRegistrySnapshot, archiveTemporaryPaletteCleanupReview } = require('./sff_placeholder_lifecycle');
const { canonicalize, createSffBuildSpecification } = require('./sff_build_specification');
const { assertSffV21Mixed } = require('./sff_v21_mixed_strict_validator');
const { readIndexedPng8 } = require('./sff_png8_source');
const { decodePng } = require('./palette_index_organizer_model');
const { normalizeSprMake2IndexedPng } = require('./sff_sprmake2_png_adapter');
const { compareSffBackends, SffCandidateComparisonError } = require('./sff_backend_comparison');
const { createBuiltInCompareCandidate, createBuiltInPreReleaseCandidate, createBuiltInReviewedPhysicalTransferCandidate, BUILTIN_SFF_V21_PNG8_BACKEND, BUILTIN_SFF_V21_PNG8_PRERELEASE_BACKEND, BUILTIN_SFF_REVIEWED_PHYSICAL_TRANSFER_BACKEND } = require('./sff_builtin_backend');
const sffBatchScope = require('./sff_batch_scope');
const { AssetWorkSets } = require('./asset_work_sets');
const { alphaMaskFromPng } = require('./image_alpha_mask');
const { anchorSuggestion, referenceSuggestion, consensusSuggestion } = require('./sff_auto_axis_model');

const manifestSnapshots = new Map();
let assetWorkSets;

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

async function chooseSffBatchScope(archive, request = {}, title = 'Choose SFF sprite scope', options = {}) {
  const scopeSnapshot = sffBatchScope.snapshot(archive, archive.filename);
  const marked = Array.isArray(request.selectedIndices) ? request.selectedIndices : [];
  const visible = Array.isArray(request.visibleIndices) ? request.visibleIndices : [];
  while (true) {
    const workSets = assetWorkSets?.read('sff-sprite', archive.filename) || [];
    const currentWorkSets = workSets.filter(item => item.fingerprint === scopeSnapshot.fingerprint);
    const staleWorkSets = workSets.length - currentWorkSets.length;
    const choices = [
      { label: `Current sprite (${archive.sprites[Number(request.selectedIndex)]?.group ?? '?'},${archive.sprites[Number(request.selectedIndex)]?.number ?? '?'})`, mode: 'current' },
      ...(marked.length ? [{ label: `Marked sprites (${marked.length})`, description: 'The current green-marked selection.', mode: 'marked' }] : []),
      ...(visible.length ? [{ label: `Visible / filtered sprites (${visible.length})`, description: 'Exactly the sprite rows visible when this action was opened.', mode: 'visible' }] : []),
      { label: `Current group (${request.group})`, mode: 'group' },
      { label: 'Numeric archive range…', description: 'Choose inclusive physical positions after reviewing the bounds.', mode: 'range' },
      ...(currentWorkSets.length ? [{ label: `Saved work set… (${currentWorkSets.length})`, description: staleWorkSets ? `${staleWorkSets} older set(s) are blocked until recreated.` : 'Reusable named selection for this exact SFF version.', mode: 'work-set' }] : []),
      ...(marked.length || visible.length ? [{ label: '$(save) Save selection as work set…', description: 'Saved for this project and this exact archive version.', mode: 'save-work-set' }] : []),
      { label: `All sprites (${archive.sprites.length})`, mode: 'all' }
    ];
    const picked = await vscode.window.showQuickPick(choices, { title, placeHolder: 'Scope is resolved and rechecked by the host before the verified rebuild.' });
    if (!picked) return null;
    if (picked.mode === 'save-work-set') {
      const source = await vscode.window.showQuickPick([
        ...(marked.length ? [{ label: `Marked sprites (${marked.length})`, indices: marked }] : []),
        ...(visible.length ? [{ label: `Visible / filtered sprites (${visible.length})`, indices: visible }] : [])
      ], { title: 'Save which selection as a work set?' });
      if (!source) continue;
      const name = await vscode.window.showInputBox({ title: 'Name this SFF work set', prompt: 'Use a short purpose such as Hit sparks or Portraits.', validateInput: value => String(value).trim() ? undefined : 'Enter a name.' });
      if (name === undefined) continue;
      const item = sffBatchScope.createWorkSet(scopeSnapshot, name, source.indices, options);
      await assetWorkSets.upsert('sff-sprite', archive.filename, item);
      vscode.window.showInformationMessage(`Saved SFF work set “${item.name}” for this exact archive version.`);
      continue;
    }
    const scopeRequest = { mode: picked.mode, fingerprint: scopeSnapshot.fingerprint, currentIndex: Number(request.selectedIndex), markedIndices: marked, visibleIndices: visible, group: Number(request.group) };
    if (picked.mode === 'range') {
      const value = await vscode.window.showInputBox({ title: 'Inclusive archive position range', prompt: `Enter first-last within 0-${archive.sprites.length - 1}.`, value: `${Number(request.selectedIndex) || 0}-${Number(request.selectedIndex) || 0}`, validateInput: value => /^\s*\d+\s*-\s*\d+\s*$/.test(value) ? undefined : 'Use first-last, for example 20-35.' });
      if (value === undefined) continue;
      const match = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(value); scopeRequest.first = Number(match[1]); scopeRequest.last = Number(match[2]);
    }
    if (picked.mode === 'work-set') {
      const item = await vscode.window.showQuickPick(currentWorkSets.map(value => ({ label: value.name, description: `${value.entryIds.length} sprite(s)`, id: value.id })), { title: 'Choose a saved SFF work set' });
      if (!item) continue; scopeRequest.workSetId = item.id;
    }
    try { return sffBatchScope.resolveScope(scopeSnapshot, scopeRequest, workSets, options); }
    catch (error) { await vscode.window.showErrorMessage(`SFF scope is not safe to apply: ${error.message}`); }
  }
}

function manifestIdentity(row) { return `${Number(row.ComputedGroup ?? row.Group ?? row.BaseGroup)},${Number(row.ImageIndex ?? row.Index)}`; }

async function suggestSffAxes(uri, request = {}) {
  let filename = uri?.fsPath || uri?.path;
  if (!filename || !fs.existsSync(filename)) filename = await pickFile('Choose the SFF to analyze for axis suggestions', { 'SFF archive': ['sff'] });
  if (!filename) return;
  const archive = readSff(filename);
  if (!archive.sprites.length) return vscode.window.showWarningMessage('The selected SFF contains no sprites to analyze.');
  if (!Number.isInteger(Number(request.selectedIndex))) request.selectedIndex = 0;
  if (!Number.isInteger(Number(request.group))) request.group = archive.sprites[Number(request.selectedIndex)]?.group;
  let scope;
  try { scope = await chooseSffBatchScope(archive, request, 'Suggest axes for which sprites?'); }
  catch (error) { return vscode.window.showErrorMessage(`Axis suggestions could not start: ${error.message}`); }
  if (!scope) return;
  const mode = await vscode.window.showQuickPick([
    { label: 'Alpha bounds · bottom contact', description: 'Estimate the origin from visible nontransparent pixels. Best for consistently cropped standing sprites.', mode: 'anchor' },
    { label: 'One trusted reference sprite', description: 'Register each silhouette to one sprite whose current axis is trusted.', mode: 'reference' },
    { label: 'Multiple trusted references', description: 'Use a weighted-median consensus so one poor pose cannot drag the result.', mode: 'consensus' }
  ], { title: 'Automatic axis method' });
  if (!mode) return;
  let anchor = 'bottom-center', maxOffset = 16, references = [];
  if (mode.mode === 'anchor') {
    const picked = await vscode.window.showQuickPick([
      { label: 'Bottom contact center', value: 'bottom-center' }, { label: 'Visible bounds center', value: 'bounds-center' },
      { label: 'Top center', value: 'top-center' }, { label: 'Left center', value: 'left-center' }, { label: 'Right center', value: 'right-center' }
    ], { title: 'Choose the alpha-bounds anchor' });
    if (!picked) return; anchor = picked.value;
  } else {
    const picked = await vscode.window.showQuickPick(archive.sprites.map(sprite => ({ label: `${sprite.group},${sprite.number}`, description: `axis ${sprite.axisX},${sprite.axisY} · ${sprite.width}×${sprite.height} · archive ${sprite.index}`, index: sprite.index })), { title: mode.mode === 'consensus' ? 'Choose trusted reference sprites' : 'Choose one trusted reference sprite', canPickMany: mode.mode === 'consensus', matchOnDescription: true });
    const values = Array.isArray(picked) ? picked : picked ? [picked] : [];
    if (!values.length) return;
    if (mode.mode === 'reference' && values.length > 1) values.splice(1);
    const offsetText = await vscode.window.showInputBox({ title: 'Maximum reference-search offset', prompt: 'The matcher will not search farther than this many pixels from its alpha-anchor estimate (0–64).', value: '16', validateInput: value => /^\d+$/.test(value) && Number(value) <= 64 ? undefined : 'Enter a whole number from 0 to 64.' });
    if (offsetText === undefined) return; maxOffset = Number(offsetText);
    references = values.map(item => { const sprite = archive.sprites[item.index], png = spritePng(archive, sprite); return { ...sprite, image: alphaMaskFromPng(png), imageHash: sha256(png) }; });
  }
  const deltaText = await vscode.window.showInputBox({ title: 'Maximum accepted axis change', prompt: 'Suggestions farther than this many pixels from the current axis are blocked rather than clamped (1–1024).', value: '128', validateInput: value => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 1024 ? undefined : 'Enter a whole number from 1 to 1024.' });
  if (deltaText === undefined) return; const maximumDelta = Number(deltaText);
  const results = [], failures = [];
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Analyzing ${scope.resolvedCount} sprite axis candidate(s)` }, async progress => {
    for (const identity of scope.identities) {
      const sprite = archive.sprites.find(item => `${item.group},${item.number}` === identity);
      try {
        const png = spritePng(archive, sprite), image = alphaMaskFromPng(png);
        const suggestion = mode.mode === 'anchor' ? anchorSuggestion(image, anchor) : mode.mode === 'reference' ? referenceSuggestion(image, references[0].image, references[0], { anchor, maxOffset }) : consensusSuggestion(image, references, { anchor, maxOffset });
        const dx = suggestion.axisX - sprite.axisX, dy = suggestion.axisY - sprite.axisY;
        results.push({ identity, spriteIndex: sprite.index, currentAxisX: sprite.axisX, currentAxisY: sprite.axisY, proposedAxisX: suggestion.axisX, proposedAxisY: suggestion.axisY, deltaX: dx, deltaY: dy, blocked: Math.abs(dx) > maximumDelta || Math.abs(dy) > maximumDelta, sourceImageHash: sha256(png), ...suggestion });
      } catch (error) { failures.push({ identity, error: error.message }); }
      progress.report({ increment: 100 / scope.resolvedCount });
    }
  });
  if (!results.length) return vscode.window.showErrorMessage(`No axis suggestions could be produced.${failures[0] ? ` First problem: ${failures[0].identity}: ${failures[0].error}` : ''}`);
  const blocked = results.filter(item => item.blocked), selectable = results.filter(item => !item.blocked);
  if (!selectable.length) return vscode.window.showWarningMessage(`All ${blocked.length} suggestion(s) exceeded the reviewed maximum axis change of ${maximumDelta}px. Nothing was staged.`);
  const picked = await vscode.window.showQuickPick(selectable.map(item => ({
    label: `${item.identity} · ${item.currentAxisX},${item.currentAxisY} → ${item.proposedAxisX},${item.proposedAxisY}`,
    description: `${item.confidenceLabel.toUpperCase()} ${Math.round(item.confidence * 100)}% · delta ${item.deltaX >= 0 ? '+' : ''}${item.deltaX}, ${item.deltaY >= 0 ? '+' : ''}${item.deltaY} · ${item.method}`,
    detail: item.evidence?.runnerUpMargin === undefined ? 'Alpha-bound suggestion; review visually before approval.' : `silhouette score ${Number(item.evidence.bestScore).toFixed(3)} · alternative margin ${Number(item.evidence.runnerUpMargin).toFixed(3)}`,
    item, picked: item.confidenceLabel === 'high'
  })), { title: `Review axis suggestions · ${selectable.length} available${blocked.length ? ` · ${blocked.length} over limit` : ''}${failures.length ? ` · ${failures.length} skipped` : ''}`, placeHolder: 'Check only proposals you want staged for manifest review.', canPickMany: true, matchOnDescription: true, matchOnDetail: true });
  if (!picked?.length) return;
  const manifestPath = await pickFile('Choose the authoritative SprMaker2 source manifest to stage accepted axes', { 'CSV manifest': ['csv'] });
  if (!manifestPath) return;
  const rows = readManifest(manifestPath), byIdentity = new Map();
  rows.forEach((row, index) => { const id = manifestIdentity(row); if (!byIdentity.has(id)) byIdentity.set(id, []); byIdentity.get(id).push(index); });
  const selected = picked.map(value => value.item), invalid = selected.filter(item => (byIdentity.get(item.identity) || []).length !== 1);
  if (invalid.length) return vscode.window.showErrorMessage(`Axis staging is blocked: ${invalid.length} selected identity/identities are missing or duplicated in the authoritative manifest. First: ${invalid[0].identity}`);
  const currentArchive = readSff(filename);
  if (sffBatchScope.archiveFingerprint(currentArchive) !== scope.sourceFingerprint) return vscode.window.showErrorMessage('The SFF changed after analysis. Reopen Auto Axis; no manifest was changed.');
  for (const item of selected) {
    const row = rows[byIdentity.get(item.identity)[0]];
    row.AxisX = String(item.proposedAxisX); row.AxisY = String(item.proposedAxisY); row.ReviewStatus = 'REVIEW';
    row.ReviewReason = `Auto Axis ${item.method}; ${item.confidenceLabel} ${Math.round(item.confidence * 100)}%; source ${item.sourceImageHash.slice(0, 12)}; previous axis ${item.currentAxisX},${item.currentAxisY}. Visual approval required before build.`;
  }
  const proposal = { schema: 'ikemaker.sff-axis-suggestions', version: 1, algorithmVersion: 1, createdAt: new Date().toISOString(), archive: path.basename(filename), archiveFingerprint: scope.sourceFingerprint, scope: { mode: scope.mode, identities: scope.identities, resolutionHash: scope.resolutionHash }, method: mode.mode, anchor, maxOffset, maximumDelta, references: references.map(item => ({ identity: `${item.group},${item.number}`, axisX: item.axisX, axisY: item.axisY, imageHash: item.imageHash })), accepted: selected, rejectedOrUnselected: results.filter(item => !selected.includes(item)).map(item => item.identity), failures };
  const proposalHash = sha256(Buffer.from(JSON.stringify(canonicalize(proposal)), 'utf8')), proposalPath = path.join(path.dirname(manifestPath), `.ikemaker-axis-suggestions.${proposalHash.slice(0, 16)}.json`), proposalText = `${JSON.stringify(proposal, null, 2)}\n`;
  if (fs.existsSync(proposalPath) && fs.readFileSync(proposalPath, 'utf8') !== proposalText) return vscode.window.showErrorMessage('Axis suggestion evidence hash collision; nothing was changed.');
  const manifestContent = stringifyCsv(rows), writes = [[manifestPath, manifestContent]];
  if (!fs.existsSync(proposalPath)) writes.push([proposalPath, proposalText]);
  transactionalWriteSet(fs, writes, sffMutationOptions(manifestPath, 'stage-sff-auto-axis-suggestions', { expectedHashes: { [path.resolve(manifestPath)]: manifestSnapshots.get(path.resolve(manifestPath)) }, aggregateJournal: true }));
  manifestSnapshots.set(path.resolve(manifestPath), hash(manifestContent));
  const action = await vscode.window.showInformationMessage(`Staged ${selected.length} axis suggestion(s) for review. The SFF was not changed.`, 'Open Manifest', 'Generate Reviewed Build Files');
  if (action === 'Open Manifest') await vscode.window.showTextDocument(vscode.Uri.file(manifestPath));
  if (action === 'Generate Reviewed Build Files') await vscode.commands.executeCommand('sff.generateBuildFiles', vscode.Uri.file(manifestPath));
  return { manifestPath, proposalPath, proposal, selected };
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

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function portableRelative(root, filename) {
  return path.relative(path.resolve(root), path.resolve(filename)).split(path.sep).join('/');
}

function pngSnapshotInfo(buffer, filename) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 33 || buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || buffer.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error(`Build snapshot is not a valid PNG: ${filename}`);
  }
  const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20), bitDepth = buffer[24], colorType = buffer[25];
  if (!width || !height) throw new Error(`Build snapshot has invalid dimensions: ${filename}`);
  const colorDepth = colorType === 3 ? 8 : colorType === 2 ? 24 : [4, 6].includes(colorType) ? 32 : bitDepth;
  const indexed = colorType === 3 ? readIndexedPng8(buffer) : null, decoded = colorType === 2 || colorType === 6 ? decodePng(buffer, { maximumDimension: 65535, maximumPixels: 100000000 }) : null;
  let decodedHash = indexed?.decodedHash || null;
  if (decoded && colorType === 2) { const rgb = Buffer.alloc(width * height * 3); for (let i = 0, j = 0; i < decoded.rgba.length; i += 4) { rgb[j++] = decoded.rgba[i]; rgb[j++] = decoded.rgba[i + 1]; rgb[j++] = decoded.rgba[i + 2]; } decodedHash = sha256(rgb); }
  if (decoded && colorType === 6) decodedHash = sha256(decoded.rgba);
  return { width, height, bitDepth, colorType, colorDepth, format: `png${colorDepth}`, compression: `png${colorDepth}`, decodedHash, colors: indexed?.colors || null };
}

function immutableJsonArtifact(outputDirectory, prefix, semanticHash, value) {
  const filename = path.join(outputDirectory, `${prefix}.${semanticHash}.json`), content = `${JSON.stringify(value, null, 2)}\n`;
  if (fs.existsSync(filename)) {
    if (fs.readFileSync(filename, 'utf8') !== content) throw new Error(`Reviewed artifact hash collision: ${filename}`);
  } else fs.writeFileSync(filename, content, { encoding: 'utf8', flag: 'wx' });
  return { path: filename, byteHash: sha256(Buffer.from(content, 'utf8')) };
}

function immutableSffCandidateArtifact(outputDirectory, targetFilename, backendLabel, bytes) {
  if (!Buffer.isBuffer(bytes)) throw new Error('Comparison candidate evidence requires exact SFF bytes.');
  const target = path.basename(String(targetFilename || 'candidate.sff'), path.extname(String(targetFilename || 'candidate.sff'))).replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'candidate';
  const byteHash = sha256(bytes).toLowerCase(), filename = path.join(outputDirectory, `${target}.${backendLabel}.${byteHash.slice(0, 16)}.sff`);
  if (fs.existsSync(filename)) {
    const existing = fs.readFileSync(filename);
    if (!existing.equals(bytes)) throw new Error(`Compared SFF candidate evidence collision: ${filename}`);
  } else fs.writeFileSync(filename, bytes, { flag: 'wx', mode: 0o600 });
  return Object.freeze({ path: filename, identity: path.basename(filename), byteHash, byteLength: bytes.length });
}

function semanticReceiptHash(receipt) {
  const copy = { ...receipt };
  delete copy.receiptHash;
  return sha256(Buffer.from(JSON.stringify(canonicalize(copy)), 'utf8'));
}

function writeSffExecutionReceipt(generated, evidence) {
  if (!generated?.outputDirectory || !generated?.receiptHash || !generated?.specificationHash) throw new Error('Execution receipt requires the reviewed package receipt and specification.');
  const record = {
    schema: 'ikemaker.sff-build-execution-receipt', version: 1, createdAt: new Date().toISOString(),
    packageReceiptHash: generated.receiptHash, specificationHash: generated.specificationHash,
    backend: evidence?.backend || { id: 'sprmake2', executable: path.basename(generated.sprmake || 'sprmake2') },
    candidate: { byteHash: String(evidence?.candidateHash || '').toLowerCase(), byteLength: Number(evidence?.candidateByteLength || 0) },
    validation: evidence?.validation || null, comparison: evidence?.comparison || null, impact: evidence?.impact || null,
    outcome: String(evidence?.outcome || 'unknown'),
    adoption: evidence?.adoption ? {
      targetIdentity: path.basename(evidence.adoption.filename || generated.outputSff), finalTargetHash: String(evidence.finalTargetHash || '').toLowerCase(),
      backupIdentity: evidence.durableBackup?.path ? path.basename(evidence.durableBackup.path) : evidence.adoption.backup ? path.basename(evidence.adoption.backup) : null,
      backupHash: String(evidence.durableBackup?.hash || '').toLowerCase() || null,
      recoveryRetention: evidence.durableBackup?.retention || null,
      recoveryJournalIdentity: evidence.adoption.journal ? path.basename(evidence.adoption.journal) : null
    } : null
  };
  if (!/^[a-f0-9]{64}$/.test(record.candidate.byteHash)) throw new Error('Execution receipt requires the exact validated candidate hash.');
  const receiptHash = sha256(Buffer.from(JSON.stringify(canonicalize(record)), 'utf8'));
  const artifact = immutableJsonArtifact(generated.outputDirectory, 'sff-build-execution-receipt', receiptHash, { ...record, receiptHash });
  return Object.freeze({ record: Object.freeze({ ...record, receiptHash }), path: artifact.path, byteHash: artifact.byteHash });
}

function verifyCandidateArchive(filename, generated, validators = {}, options = {}) {
  const candidateByteHash = fs.existsSync(filename) ? sha256(fs.readFileSync(filename)) : null;
  const specificationHash = String(generated?.specificationHash || generated?.specification?.specificationHash || '').toLowerCase();
  const friendly = (validators.friendly || assertBuiltArchive)(filename, generated.mapping, generated.expectedPalettes, { sffVersion: '2.1' });
  const specification = generated.specification;
  const strictEligible = Boolean(specification)
    && specification.sprites.length > 0
    && specification.sprites.every((sprite) => (sprite.format === 'png8' && sprite.compression === 'png8' && sprite.colorDepth === 8 && sprite.paletteId) || (sprite.format === 'png24' && sprite.compression === 'png24' && sprite.colorDepth === 24 && !sprite.paletteId) || (sprite.format === 'png32' && sprite.compression === 'png32' && sprite.colorDepth === 32 && !sprite.paletteId))
    && specification.palettes.every((palette) => Array.isArray(palette.colors) && palette.colors.length === 256);
  if (!strictEligible) return {
    candidateByteHash, specificationHash,
    friendly,
    strict: { status: 'not-applicable', reason: 'This SprMake2 plan is outside the independently certified SFF v2.1 PNG8/PNG24/PNG32 profile.' }
  };
  const compatibilityProfile = options.compatibilityProfile || 'sprmake2-v2.1';
  const strict = (validators.strict || assertSffV21Mixed)(filename, specification, { compatibilityProfile });
  return { candidateByteHash, specificationHash, friendly, strict: { status: 'passed', profile: strict.profile, compatibilityProfile: strict.compatibilityProfile || compatibilityProfile, evidence: strict.evidence, candidateByteHash, specificationHash } };
}

function candidateImpactSummary(activeBytes, candidateBytes) {
  if (!Buffer.isBuffer(candidateBytes)) throw new Error('Candidate comparison requires the validated SFF bytes.');
  const candidate = parseSffBuffer(candidateBytes, 'validated-candidate.sff');
  const active = Buffer.isBuffer(activeBytes) && activeBytes.length ? parseSffBuffer(activeBytes, 'active-target.sff') : { buffer: Buffer.alloc(0), sprites: [], palettes: [] };
  const groupByIdentity = rows => {
    const grouped = new Map();
    for (const row of rows) { const key = `${row.group},${row.number}`; if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(row); }
    return grouped;
  };
  const renderedPngHash = (archive, sprite) => { try { return sha256(spritePng(archive, sprite)); } catch (_) { return null; } };
  const activeSprites = groupByIdentity(active.sprites), candidateSprites = groupByIdentity(candidate.sprites), identities = new Set([...activeSprites.keys(), ...candidateSprites.keys()]);
  const added = [], removed = [], changed = [], unchanged = [];
  for (const identity of identities) {
    const before = activeSprites.get(identity) || [], after = candidateSprites.get(identity) || [], common = Math.min(before.length, after.length);
    for (let index = 0; index < common; index += 1) {
      const left = before[index], right = after[index], fieldsChanged = [];
      for (const field of ['width', 'height', 'axisX', 'axisY', 'colorDepth', 'format', 'paletteIndex']) if (left[field] !== right[field]) fieldsChanged.push(field);
      const beforePng = renderedPngHash(active, left), afterPng = renderedPngHash(candidate, right);
      if (!beforePng || !afterPng) fieldsChanged.push('rendered-png-unverified');
      else if (beforePng !== afterPng) fieldsChanged.push('rendered-png-bytes');
      const record = { identity, occurrence: index + 1, fieldsChanged };
      (fieldsChanged.length ? changed : unchanged).push(record);
    }
    for (let index = common; index < after.length; index += 1) added.push({ identity, occurrence: index + 1 });
    for (let index = common; index < before.length; index += 1) removed.push({ identity, occurrence: index + 1 });
  }
  const paletteSignature = (archive, palette) => { try { return sha256(Buffer.from(JSON.stringify(paletteRgba(archive, palette.index)), 'utf8')); } catch (_) { return null; } };
  const activePalettes = groupByIdentity(active.palettes), candidatePalettes = groupByIdentity(candidate.palettes), paletteIdentities = new Set([...activePalettes.keys(), ...candidatePalettes.keys()]);
  let paletteAdded = 0, paletteRemoved = 0, paletteChanged = 0, paletteUnchanged = 0;
  for (const identity of paletteIdentities) {
    const before = activePalettes.get(identity) || [], after = candidatePalettes.get(identity) || [], common = Math.min(before.length, after.length);
    paletteAdded += Math.max(0, after.length - before.length); paletteRemoved += Math.max(0, before.length - after.length);
    for (let index = 0; index < common; index += 1) {
      const left = paletteSignature(active, before[index]), right = paletteSignature(candidate, after[index]);
      if (left && right && left === right) paletteUnchanged += 1; else paletteChanged += 1;
    }
  }
  return Object.freeze({
    active: Object.freeze({ byteLength: active.buffer.length, spriteCount: active.sprites.length, paletteCount: active.palettes.length }),
    candidate: Object.freeze({ byteLength: candidate.buffer.length, spriteCount: candidate.sprites.length, paletteCount: candidate.palettes.length }),
    sprites: Object.freeze({ addedCount: added.length, removedCount: removed.length, changedCount: changed.length, unchangedCount: unchanged.length, added: Object.freeze(added), removed: Object.freeze(removed), changed: Object.freeze(changed) }),
    palettes: Object.freeze({ addedCount: paletteAdded, removedCount: paletteRemoved, changedCount: paletteChanged, unchangedCount: paletteUnchanged })
  });
}

function validateExistingSprMake2Output(generated, filename, validators = {}) {
  if (!generated?.outputDirectory || !generated?.specification) throw new Error('Validation requires a complete reviewed SFF build package.');
  const candidate = path.resolve(String(filename || ''));
  if (!/\.sff$/i.test(candidate)) throw new Error('Choose an existing .sff output to validate.');
  const loaded = loadCandidateBytes(fs, candidate);
  const verified = verifyLoadedCandidate(fs, loaded, sealedPath => verifyCandidateArchive(sealedPath, generated, validators), { directory: generated.outputDirectory });
  const report = {
    kind: 'ikemaker-existing-sprmake2-output-validation', version: 1, createdAt: new Date().toISOString(),
    specificationHash: generated.specification.specificationHash || generated.specificationHash || null,
    candidate: { identity: path.basename(candidate), byteHash: verified.hash, byteLength: verified.bytes.length },
    validation: verified.verification, adoption: { allowed: false, performed: false }
  };
  const semanticHash = sha256(Buffer.from(JSON.stringify(canonicalize(report)), 'utf8'));
  const artifact = immutableJsonArtifact(generated.outputDirectory, 'sff-existing-output-validation', semanticHash, report);
  return Object.freeze({ report: Object.freeze(report), reportPath: artifact.path });
}

function expectedPaletteContract(paletteArchive, stagedPalettes = [], paletteShifts = [], sharedPalette = null, readColors = paletteRgba, options = {}) {
  const expectAliases = options.expectAliases !== false;
  const deletedOriginalIds = new Set(options.deletedOriginalIds || []);
  const expected = [];
  if (sharedPalette) expected.push({ group: sharedPalette.group, number: sharedPalette.number, colors: sharedPalette.colors });
  if (!paletteArchive) return expected;
  for (const palette of paletteArchive.palettes) { if (deletedOriginalIds.has(`${palette.group},${palette.number}`)) continue; const shifted = applyPaletteShifts(palette.group, palette.number, paletteShifts), linked = expectAliases && palette.dataSize === 0 ? paletteArchive.palettes[palette.link] : null, aliasOf = linked ? applyPaletteShifts(linked.group, linked.number, paletteShifts) : null; expected.push({ group: shifted.group, number: shifted.number, colors: readColors(paletteArchive, palette.index), aliasOf }); }
  for (const palette of stagedPalettes) expected.push({ group: palette.group, number: palette.number, colors: palette.colors, aliasOf: expectAliases && palette.kind === 'alias' ? { group: palette.targetGroup, number: palette.targetNumber } : null });
  return expected;
}

function spriteSharingKey(entry) {
  const image = entry?.image || {}, decoded = String(image.decodedHash || '').toLowerCase();
  if (!decoded) return `encoded:${String(entry?.sourceByteHash || '').toLowerCase()}`;
  return JSON.stringify({ decoded, width: Number(image.width), height: Number(image.height), colorDepth: Number(image.colorDepth), format: String(image.format || ''), compression: String(image.compression || ''), palette: String(entry?.palette || '') });
}

function temporaryPaletteCleanupContract(review) {
  if (!review) return null;
  const item = value => ({
    lifecycleId: String(value?.lifecycleId || ''), paletteId: String(value?.paletteId || '').replace(/\s+/g, ''),
    paletteIndex: Number(value?.paletteIndex), ownerIdentities: [...(value?.ownerIdentities || [])].map(String).sort(),
    action: String(value?.action || ''), reasons: [...(value?.reasons || [])].map(String).sort()
  });
  return canonicalize({
    sourceSffHash: String(review.sourceSffHash || '').toLowerCase(), lifecycleRegistryHash: String(review.lifecycleRegistryHash || '').toLowerCase(),
    referenceAuditHash: String(review.referenceAuditHash || '').toLowerCase(),
    removedSpriteIdentities: [...(review.removedSpriteIdentities || [])].map(value => String(value).replace(/\s+/g, '')).sort(),
    eligible: [...(review.eligible || [])].map(item).sort((left, right) => left.lifecycleId.localeCompare(right.lifecycleId)),
    blocked: [...(review.blocked || [])].map(item).sort((left, right) => left.lifecycleId.localeCompare(right.lifecycleId))
  });
}

function verifyTemporaryPaletteCleanupReview(sffPath, archive, removedSpriteIdentities, reviewed) {
  if (!reviewed) return null;
  const current = archiveTemporaryPaletteCleanupReview(sffPath, archive, removedSpriteIdentities);
  const currentContract = temporaryPaletteCleanupContract(current), reviewedContract = temporaryPaletteCleanupContract(reviewed);
  if (JSON.stringify(currentContract) !== JSON.stringify(reviewedContract)) {
    const changed = ['sourceSffHash', 'lifecycleRegistryHash', 'referenceAuditHash', 'removedSpriteIdentities', 'eligible', 'blocked'].filter(key => JSON.stringify(currentContract?.[key]) !== JSON.stringify(reviewedContract?.[key]));
    throw new Error(`Temporary palette cleanup evidence changed after review (${changed.join(', ') || 'sealed contract'}). Reopen SFF Creator and review the deletion again; no palette was removed.`);
  }
  return current;
}

function normalizeReviewedPhysicalSpritePlan(value, rows, archive, insertionPhysicalIndex) {
  if (value == null) return null;
  const exact = (candidate, keys, label) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || Object.getPrototypeOf(candidate) !== Object.prototype) throw new Error(`${label} must be a plain object.`);
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(candidate))) if (descriptor.enumerable && !Object.prototype.hasOwnProperty.call(descriptor, 'value')) throw new Error(`${label}.${key} cannot be an accessor.`);
    if (Object.keys(candidate).sort().join('|') !== [...keys].sort().join('|')) throw new Error(`${label} has missing or unsupported fields.`);
  };
  exact(value, ['schema', 'version', 'destinationFingerprint', 'insertionPhysicalIndex', 'rows'], 'Reviewed physical sprite plan');
  if (value.schema !== 'ikemaker.reviewed-physical-sprite-plan' || value.version !== 1) throw new Error('Reviewed physical sprite plan schema or version is unsupported.');
  const fingerprint = String(value.destinationFingerprint || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(fingerprint) || fingerprint !== sha256(archive.buffer).toLowerCase()) throw new Error('Reviewed physical sprite plan does not match the exact Destination SFF.');
  if (value.insertionPhysicalIndex !== insertionPhysicalIndex) throw new Error('Reviewed physical sprite plan insertion boundary does not match the build request.');
  if (!Array.isArray(value.rows) || value.rows.length !== rows.length || value.rows.length > 20000) throw new Error('Reviewed physical sprite plan must bind every incoming manifest row exactly once.');
  const ordinals = new Set(), sourceIds = new Set(), replacements = new Set();
  const normalized = value.rows.map((entry, planIndex) => {
    exact(entry, ['manifestOrdinal', 'sourceIdentity', 'action', 'destinationPhysicalIndex', 'linkTargetManifestOrdinal'], `Reviewed physical sprite row ${planIndex + 1}`);
    const ordinal = entry.manifestOrdinal;
    if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= rows.length || ordinals.has(ordinal)) throw new Error('Reviewed physical sprite plan contains a missing or duplicate manifest ordinal.');
    const sourceIdentity = String(entry.sourceIdentity || ''), manifestIdentity = String(rows[ordinal].SourceIdentity || '');
    if (!sourceIdentity || sourceIdentity !== manifestIdentity || sourceIds.has(sourceIdentity)) throw new Error('Reviewed physical sprite plan source identity is missing, duplicated, or no longer matches the manifest.');
    if (!['insert', 'replace'].includes(entry.action)) throw new Error(`Reviewed physical sprite row ${sourceIdentity} has an unsupported action.`);
    let destinationPhysicalIndex = null;
    if (entry.action === 'replace') {
      destinationPhysicalIndex = entry.destinationPhysicalIndex;
      const sprite = archive.sprites[destinationPhysicalIndex], group = Number(rows[ordinal].ComputedGroup), number = Number(rows[ordinal].ImageIndex);
      if (!Number.isSafeInteger(destinationPhysicalIndex) || destinationPhysicalIndex < 0 || !sprite || sprite.group !== group || sprite.number !== number || replacements.has(destinationPhysicalIndex)) throw new Error(`Reviewed replacement ${sourceIdentity} no longer identifies one exact matching Destination occurrence.`);
      replacements.add(destinationPhysicalIndex);
    } else if (entry.destinationPhysicalIndex !== null) throw new Error(`Reviewed insertion ${sourceIdentity} cannot claim a Destination occurrence.`);
    const linkTargetManifestOrdinal = entry.linkTargetManifestOrdinal;
    if (linkTargetManifestOrdinal !== null && (!Number.isSafeInteger(linkTargetManifestOrdinal) || linkTargetManifestOrdinal < 0 || linkTargetManifestOrdinal >= rows.length || linkTargetManifestOrdinal === ordinal)) throw new Error(`Reviewed link target for ${sourceIdentity} is invalid.`);
    ordinals.add(ordinal); sourceIds.add(sourceIdentity);
    return Object.freeze({ manifestOrdinal: ordinal, sourceIdentity, action: entry.action, destinationPhysicalIndex, linkTargetManifestOrdinal });
  }).sort((a, b) => a.manifestOrdinal - b.manifestOrdinal);
  return Object.freeze({ schema: value.schema, version: 1, destinationFingerprint: fingerprint, insertionPhysicalIndex, rows: Object.freeze(normalized) });
}

async function createBuildPackage({ sourceRoot, manifestPath, outputDirectory, outputSff, candidateOutputSff, targetSnapshot, paletteSourceSff, sharedPalettePath, sharedPaletteId = '0,0', sharedPaletteOrder = 'index', temporaryPaletteLifecycle = null, imagePaletteIntake = null, portablePaletteIntake = null, deletedSpriteIdentities = null, reviewedTemporaryPaletteCleanup = null, buildProfile, duplicateHandling, autocrop = false, autocropIdentities = null, cropModesByIdentity = null, manifestScopeIdentities = null, includeStagedPalettes = true, batchScope = null, preserveArchiveSprites = false, addedSpritePaletteId = null, reviewEvidence = null, reviewedInsertionPhysicalIndex = null, reviewedPhysicalSpritePlan = null }) {
  if (reviewedPhysicalSpritePlan && (!paletteSourceSff || !preserveArchiveSprites)) throw new Error('A reviewed physical sprite plan requires an exact preserved Destination SFF.');
  const cropSet = Array.isArray(autocropIdentities) ? new Set(autocropIdentities.map(String)) : null;
  const reviewedCropModes = new Map(Object.entries(cropModesByIdentity || {}).map(([identity, value]) => [String(identity), String(value)]));
  for (const [identity, value] of reviewedCropModes) if (!['none', 'autocrop', 'before-axis', 'after-axis'].includes(value)) throw new Error(`Unsupported reviewed crop mode ${value} for ${identity}.`);
  const manifestScopeSet = Array.isArray(manifestScopeIdentities) ? new Set(manifestScopeIdentities.map(String)) : null;
  const reviewedSpriteDeletions = new Set((Array.isArray(deletedSpriteIdentities) ? deletedSpriteIdentities : []).map(value => String(value).replace(/\s+/g, '')));
  for (const identity of reviewedSpriteDeletions) {
    const match = /^(\d+),(\d+)$/.exec(identity);
    if (!match || Number(match[1]) > 65535 || Number(match[2]) > 65535) throw new Error(`Deleted sprite identity ${identity || '(blank)'} must use group,index within 0–65535.`);
    if (identity === '59000,0' || identity === '59000,1') throw new Error(`Protected template sprite ${identity} cannot be deleted through a batch plan.`);
  }
  if (reviewedSpriteDeletions.size && !paletteSourceSff) throw new Error('Reviewed sprite deletion requires an existing source SFF to preserve and rebuild.');
  if (reviewedSpriteDeletions.size && !preserveArchiveSprites) throw new Error('Reviewed sprite deletion requires preserveArchiveSprites so every non-deleted physical entry remains in the rebuild.');
  const manifestFilename = path.resolve(manifestPath), manifestContent = fs.readFileSync(manifestFilename, 'utf8'), manifestHash = sha256(Buffer.from(manifestContent, 'utf8'));
  let reviewedEvidence = null;
  if (reviewEvidence) {
    const identity = String(reviewEvidence.identity || '');
    if (!identity || path.basename(identity) !== identity) throw new Error('Review evidence must name one package-root file.');
    const filename = path.resolve(sourceRoot, identity), relation = path.relative(path.resolve(sourceRoot), filename);
    if (!relation || path.isAbsolute(relation) || relation.split(path.sep).includes('..') || !fs.existsSync(filename)) throw new Error(`Review evidence is missing or outside the build package: ${identity || '(blank)'}.`);
    const observed = sha256(fs.readFileSync(filename)), expected = String(reviewEvidence.byteHash || '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(expected) || observed !== expected) throw new Error(`Review evidence changed after approval: ${identity}.`);
    reviewedEvidence = { identity, byteHash: observed };
  }
  manifestSnapshots.set(manifestFilename, hash(manifestContent));
  const rows = parseCsv(manifestContent);
  const aliasRegistry = readAliasRegistry(manifestPath);
  const profile = normalizeBuildProfile(buildProfile || {});
  const policies = storagePolicy(duplicateHandling, profile.duplicateHandling);
  if (cropSet) policies.sprites = SEPARATE;
  const indexAudit = auditIndexPolicy(rows, profile);
  if (indexAudit.issues.length) {
    const detail = indexAudit.issues.slice(0, 20).map((item) => `${item.group},${item.actual ?? 'unresolved'} must be ${item.group},${item.expected} (${item.sequence})`).join('\n');
    throw new Error(`Manifest violates ${profile.profileName}:\n${detail}${indexAudit.issues.length > 20 ? `\n…and ${indexAudit.issues.length - 20} more. Run “Apply Project Get-Hit Indexing” first.` : '\nRun “Apply Project Get-Hit Indexing” first.'}`);
  }
  // Transfer rows carry reviewed physical identities; generated PNG names do not identify move families.
  const issues = validateManifest(rows, { requireApproved: true, aliasRegistry, validateHyperNaming: !reviewedPhysicalSpritePlan });
  if (issues.length) throw new Error(`Manifest validation failed:\n${issues.slice(0, 20).join('\n')}${issues.length > 20 ? `\n…and ${issues.length - 20} more` : ''}`);

  fs.mkdirSync(outputDirectory, { recursive: true });
  const inputDirectory = path.join(outputDirectory, 'input'), approvedInputDirectory = path.join(outputDirectory, 'approved-input');
  fs.mkdirSync(inputDirectory, { recursive: true });

  const mapping = [];
  for (let manifestOrdinal = 0; manifestOrdinal < rows.length; manifestOrdinal += 1) {
    const row = rows[manifestOrdinal];
    if (manifestScopeSet && paletteSourceSff && !manifestScopeSet.has(`${Number(row.ComputedGroup)},${Number(row.ImageIndex)}`)) continue;
    const source = sourcePath(row, sourceRoot);
    if (!fs.existsSync(source)) throw new Error(`Source sprite is missing: ${source}`);
    const group = Number(row.ComputedGroup);
    const index = Number(row.ImageIndex);
    const requestedDuplicatePolicy = String(row.DuplicatePolicy || '').trim().toLowerCase();
    if (requestedDuplicatePolicy && requestedDuplicatePolicy !== 'batch' && requestedDuplicatePolicy !== SEPARATE && requestedDuplicatePolicy !== SHARE) throw new Error(`Sprite ${group},${index} has unsupported duplicate policy ${row.DuplicatePolicy}. Choose batch, ${SEPARATE}, or ${SHARE}.`);
    const duplicatePolicy = requestedDuplicatePolicy && requestedDuplicatePolicy !== 'batch' ? requestedDuplicatePolicy : policies.sprites;
    const paletteGroupText = String(row.PaletteGroup ?? '').trim(), paletteIndexText = String(row.PaletteIndex ?? '').trim();
    if (Boolean(paletteGroupText) !== Boolean(paletteIndexText)) throw new Error(`Sprite ${group},${index} must provide both PaletteGroup and PaletteIndex or leave both blank.`);
    const paletteGroup = paletteGroupText ? Number(paletteGroupText) : null, paletteIndex = paletteIndexText ? Number(paletteIndexText) : null;
    if (paletteGroupText && (!Number.isSafeInteger(paletteGroup) || !Number.isSafeInteger(paletteIndex) || paletteGroup < 0 || paletteGroup > 65535 || paletteIndex < 0 || paletteIndex > 65535)) throw new Error(`Sprite ${group},${index} stored palette must use group,index within 0–65535.`);
    const buildFile = `g${String(group).padStart(5, '0')}_i${String(index).padStart(5, '0')}.png`;
    const snapshotPath = path.join(inputDirectory, buildFile), approvedSourceByteHash = (await copyApprovedSnapshot(fs, source, snapshotPath, row.SourceSHA256)).toLowerCase();
    let snapshot = fs.readFileSync(snapshotPath), normalization = null, approvedSnapshotPath = null;
    const basic = pngSnapshotInfo(snapshot, snapshotPath);
    if (basic.colorType === 3) {
      normalization = normalizeSprMake2IndexedPng(snapshot, path.basename(source));
      if (normalization.compatible && normalization.normalized) {
        fs.mkdirSync(approvedInputDirectory, { recursive: true }); approvedSnapshotPath = path.join(approvedInputDirectory, buildFile);
        if (fs.existsSync(approvedSnapshotPath)) {
          if (sha256(fs.readFileSync(approvedSnapshotPath)).toLowerCase() !== approvedSourceByteHash) throw new Error(`The immutable approved PNG snapshot changed: ${approvedSnapshotPath}`);
        } else transactionalWrite(fs, approvedSnapshotPath, snapshot, { allowExisting: false, backup: false, journal: false, label: 'retain-approved-png8-source' });
        transactionalWrite(fs, snapshotPath, normalization.bytes, { expectedHash: approvedSourceByteHash, backup: false, journal: false, label: 'normalize-reviewed-png8-for-sprmake2' });
        snapshot = normalization.bytes;
      }
    }
    const sourceByteHash = sha256(snapshot).toLowerCase(), image = pngSnapshotInfo(snapshot, snapshotPath);
    mapping.push({
      group, index, buildFile, source, axisX: Number(row.AxisX), axisY: Number(row.AxisY), layer: Number(row.LayerNumber || 0), palette: paletteGroupText ? `${paletteGroup},${paletteIndex}` : null, duplicatePolicy,
      snapshotPath, approvedSnapshotPath, sourceByteHash, image, incomingManifestOrdinal: manifestOrdinal, incomingSourceIdentity: String(row.SourceIdentity || ''),
      provenance: {
        kind: 'approved-manifest-source', manifest: path.basename(manifestFilename), manifestByteHash: manifestHash,
        ...(row.GuidedGifAir ? { guidedGifAir: require('./sff_guided_gif_air_provenance').parseGuidedGifAir(row.GuidedGifAir) } : {}),
        originalSource: String(row.OriginalRelativePath || path.basename(source)).replace(/\\/g, '/'),
        sourceArchive: path.basename(String(row.SourceArchive || '')), sourceIdentity: String(row.SourceIdentity || ''),
        approvedByteHash: String(row.SourceSHA256 || '').trim().toLowerCase(),
        sprMake2Normalization: normalization?.normalized ? { kind: 'lossless-indexed-png8-canonicalization', originalSnapshotRelativePath: portableRelative(outputDirectory, approvedSnapshotPath), originalByteHash: approvedSourceByteHash, outputByteHash: sourceByteHash, decodedIndexHash: normalization.decodedHash, paletteRgbaHash: normalization.paletteHash } : normalization && !normalization.compatible ? { kind: 'unsupported-partial-alpha', originalByteHash: approvedSourceByteHash, partialAlphaIndexes: normalization.partialAlphaIndexes, reason: normalization.reason } : null,
        preparation: row.PreparationKind ? { kind: String(row.PreparationKind), sourceByteHash: String(row.PreparationSourceSHA256 || '').trim().toLowerCase(), bounds: String(row.PreparationBounds || ''), outputByteHash: String(row.PreparationOutputSHA256 || '').trim().toLowerCase(), axisDeltaX: Number(row.PreparationAxisDeltaX || 0), axisDeltaY: Number(row.PreparationAxisDeltaY || 0), originalAxis: String(row.PreparationOriginalAxis || '') } : null,
        placeholder: /^(?:yes|true|1)$/i.test(String(row.Placeholder || '').trim()) ? { tagged: true, ownerId: String(row.PlaceholderOwnerId || '').trim(), note: String(row.PlaceholderNote || '').slice(0, 500) } : null
      }
    });
  }
  const incomingMapping = mapping.slice();

  let paletteArchive = null, stagedPalettes = [], paletteShifts = [], paletteDeletions = [], sharedPalette = null, physicalSpritePlan = null;
  const portablePalettes = [], portablePaletteIds = new Set();
  for (const [ordinal, item] of (Array.isArray(portablePaletteIntake) ? portablePaletteIntake : []).entries()) {
    const group = Number(item?.group), number = Number(item?.number), id = `${group},${number}`;
    if (!Number.isSafeInteger(group) || !Number.isSafeInteger(number) || group < 0 || group > 65535 || number < 0 || number > 65535) throw new Error(`Portable palette ${ordinal + 1} must use group,index within 0–65535.`);
    if (portablePaletteIds.has(id)) throw new Error(`Portable palette ${id} is declared more than once.`);
    const sourcePath = path.resolve(String(item?.path || ''));
    if (!/\.act$/i.test(sourcePath) || !fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) throw new Error(`Portable palette ${id} source is missing or is not an ACT file.`);
    const bytes = fs.readFileSync(sourcePath), observedHash = sha256(bytes).toUpperCase(), expectedHash = String(item?.byteHash || '').toUpperCase();
    if (!/^[A-F0-9]{64}$/.test(expectedHash) || observedHash !== expectedHash) throw new Error(`Portable palette ${id} changed after recipe review.`);
    const tableOrder = normalizeOrder(item?.tableOrder), colors = readAct(bytes, tableOrder);
    portablePaletteIds.add(id); portablePalettes.push({ kind: 'portable-recipe-palette', group, number, colors, source: sourcePath, sourceByteHash: observedHash.toLowerCase(), sourceTableOrder: tableOrder, provenance: item?.provenance || null });
  }
  if (imagePaletteIntake && sharedPalettePath) throw new Error('Choose either per-image palette intake or one shared/temporary palette, not both.');
  if (portablePalettes.length && sharedPalettePath) throw new Error('A portable multi-palette recipe cannot also use one shared/temporary palette.');
  if (sharedPalettePath) {
    if (!fs.existsSync(sharedPalettePath)) throw new Error(`Shared palette source is missing: ${sharedPalettePath}`);
    const match = /^(\d+)\s*,\s*(\d+)$/.exec(String(sharedPaletteId));
    if (!match) throw new Error('Shared palette ID must use group,index form, such as 0,0.');
    const source = fs.readFileSync(sharedPalettePath), sourceOrder = normalizeOrder(sharedPaletteOrder);
    const colors = /\.act$/i.test(sharedPalettePath) ? readAct(source, sourceOrder) : /\.png$/i.test(sharedPalettePath) ? colorsForOrder(pngPaletteRgba(source), sourceOrder) : null;
    if (!Array.isArray(colors) || colors.length !== 256) throw new Error('The shared provisional palette must be a 256-color ACT or indexed PNG.');
    sharedPalette = { group: Number(match[1]), number: Number(match[2]), colors, source: sharedPalettePath, sourceOrder };
    if (temporaryPaletteLifecycle) {
      const lifecycleId = String(temporaryPaletteLifecycle.lifecycleId || '').trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '');
      if (!lifecycleId) throw new Error('A temporary palette requires a stable lifecycle name.');
      if (String(temporaryPaletteLifecycle.paletteId || sharedPaletteId).replace(/\s+/g, '') !== `${sharedPalette.group},${sharedPalette.number}`) throw new Error('The temporary palette lifecycle ID does not match the reviewed palette group,index.');
      if (mapping.some(entry => !entry.provenance.placeholder?.tagged)) throw new Error('A temporary palette may only be assigned when every incoming sprite is explicitly marked as a placeholder.');
      if (mapping.some(entry => !entry.provenance.placeholder.ownerId)) throw new Error('Every temporary palette placeholder requires a stable owner ID. Reopen the batch in SFF Creator and review it again.');
      sharedPalette.lifecycle = { lifecycleId, paletteId: `${sharedPalette.group},${sharedPalette.number}`, note: String(temporaryPaletteLifecycle.note || '').slice(0, 500) };
      for (const entry of mapping) entry.provenance.placeholder.lifecycleId = lifecycleId;
    }
    for (const entry of mapping) entry.palette = `${sharedPalette.group},${sharedPalette.number}`;
  }
  const rebasedTruecolorOwners = new Map();
  if (paletteSourceSff) {
    paletteArchive = readSff(paletteSourceSff);
    if (reviewedInsertionPhysicalIndex !== null && (!Number.isSafeInteger(reviewedInsertionPhysicalIndex) || reviewedInsertionPhysicalIndex < 0 || reviewedInsertionPhysicalIndex > paletteArchive.sprites.length)) throw new Error(`Reviewed physical insertion ${reviewedInsertionPhysicalIndex} is outside the Destination SFF physical table.`);
    physicalSpritePlan = normalizeReviewedPhysicalSpritePlan(reviewedPhysicalSpritePlan, rows, paletteArchive, reviewedInsertionPhysicalIndex);
    const palettePlan = includeStagedPalettes ? verifyPalettePlan(paletteSourceSff, paletteArchive.palettes.map((palette) => `${palette.group},${palette.number}`)) : { palettes: [], shifts: [], deletions: [] };
    paletteShifts = palettePlan.shifts;
    paletteDeletions = palettePlan.deletions || [];
    if (reviewedTemporaryPaletteCleanup) {
      if (path.resolve(paletteSourceSff) !== path.resolve(outputSff)) throw new Error('Temporary palette cleanup is only available when rebuilding the reviewed target SFF in place.');
      const cleanup = verifyTemporaryPaletteCleanupReview(paletteSourceSff, paletteArchive, [...reviewedSpriteDeletions], reviewedTemporaryPaletteCleanup);
      for (const eligible of cleanup.eligible) {
        const [sourceGroup, sourceNumber] = eligible.paletteId.split(',').map(Number), effective = applyPaletteShifts(sourceGroup, sourceNumber, paletteShifts);
        const existing = paletteDeletions.find(entry => Number(entry.sourceGroup) === sourceGroup && Number(entry.sourceNumber) === sourceNumber);
        if (existing) {
          if (existing.lifecycleId && existing.lifecycleId !== eligible.lifecycleId) throw new Error(`Temporary palette ${eligible.paletteId} has conflicting lifecycle deletion evidence.`);
          existing.lifecycleId = eligible.lifecycleId; existing.note = existing.note || eligible.note || 'Delete with last placeholder owners';
        } else paletteDeletions.push({ sourceGroup, sourceNumber, group: effective.group, number: effective.number, paletteIndex: eligible.paletteIndex, lifecycleId: eligible.lifecycleId, note: eligible.note || 'Delete with last placeholder owners' });
      }
    }
    const deletedOriginal = new Set(paletteDeletions.map((entry) => `${entry.sourceGroup},${entry.sourceNumber}`));
    const deletedEffective = new Set(paletteDeletions.map((entry) => `${entry.group},${entry.number}`));
    const occupied = new Set(paletteArchive.palettes.filter((palette) => !deletedOriginal.has(`${palette.group},${palette.number}`)).map((palette) => { const shifted = applyPaletteShifts(palette.group, palette.number, palettePlan.shifts); return `${shifted.group},${shifted.number}`; }));
    for (const entry of palettePlan.palettes) { const id = paletteId(entry.group, entry.number); if (occupied.has(id)) throw new Error(`Staged palette ID ${id} now conflicts with the source SFF. Remove or restage it.`); occupied.add(id); }
    stagedPalettes = resolveStagedPalettes(palettePlan, paletteArchive);
    for (const palette of portablePalettes) {
      const id = `${palette.group},${palette.number}`;
      if (occupied.has(id)) throw new Error(`Portable recipe palette ${id} conflicts with an existing or staged palette in the target SFF.`);
      occupied.add(id); stagedPalettes.push(palette);
    }
    if (imagePaletteIntake) {
      const group = Number(imagePaletteIntake.group);
      const tableOrder = normalizeOrder(imagePaletteIntake.tableOrder);
      if (!Number.isSafeInteger(group) || group < 0 || group > 65535) throw new Error('Image-palette intake group must be an integer from 0 through 65535.');
      const groupNumbers = [...occupied].map(id => id.split(',').map(Number)).filter(([entryGroup]) => entryGroup === group).map(([, number]) => number);
      const start = groupNumbers.length ? Math.max(...groupNumbers) + 1 : 0;
      const unassignedIncoming = incomingMapping.filter(entry => !entry.palette);
      if (unassignedIncoming.length && (start > 65535 || start + unassignedIncoming.length - 1 > 65535)) throw new Error(`Image-palette intake cannot append ${unassignedIncoming.length} palette(s) to group ${group}; the 0–65535 range is exhausted.`);
      for (let index = 0; index < unassignedIncoming.length; index += 1) {
        const entry = unassignedIncoming[index], number = start + index, id = `${group},${number}`;
        if (!Array.isArray(entry.image.colors) || entry.image.colors.length !== 256) throw new Error(`Sprite ${entry.group},${entry.index} cannot supply an image palette; its reviewed source is not indexed PNG8 with 256 colors.`);
        if (occupied.has(id)) throw new Error(`Image-palette intake allocation ${id} conflicts with an existing or staged palette.`);
        occupied.add(id); entry.palette = id;
        stagedPalettes.push({
          kind: 'image-palette', group, number, colors: colorsForOrder(entry.image.colors, tableOrder), source: entry.source,
          sourceByteHash: entry.sourceByteHash, sourceTableOrder: tableOrder, sourceSpriteIdentity: `${entry.group},${entry.index}`
        });
      }
    }
    for (const palette of paletteArchive.palettes) if (palette.dataSize === 0 && Number.isInteger(palette.link)) {
      const target = paletteArchive.palettes[palette.link];
      if (target && deletedOriginal.has(`${target.group},${target.number}`) && !deletedOriginal.has(`${palette.group},${palette.number}`)) throw new Error(`Palette ${palette.group},${palette.number} still links to palette ${target.group},${target.number}, which is staged for deletion.`);
    }
    const sourceSprites = new Map(paletteArchive.sprites.map((sprite) => [`${sprite.group},${sprite.number}`, sprite]));
    const archiveIdentityCounts = new Map();
    for (const sprite of paletteArchive.sprites) {
      const identity = `${sprite.group},${sprite.number}`;
      archiveIdentityCounts.set(identity, (archiveIdentityCounts.get(identity) || 0) + 1);
    }
    const stagedIdentityKeys = new Set(mapping.map((entry) => `${entry.group},${entry.index}`));
    for (const identity of reviewedSpriteDeletions) {
      const count = archiveIdentityCounts.get(identity) || 0;
      if (count !== 1) throw new Error(`Reviewed sprite deletion ${identity} requires exactly one matching physical archive entry; found ${count}.`);
      if (stagedIdentityKeys.has(identity)) throw new Error(`Sprite ${identity} cannot be deleted and replaced in the same reviewed build.`);
    }
    if (reviewedSpriteDeletions.size >= paletteArchive.sprites.length) throw new Error('A reviewed deletion plan must leave at least one sprite in the SFF.');
    const duplicateArchiveIdentity = physicalSpritePlan ? null : [...archiveIdentityCounts].find(([, count]) => count > 1);
    if (preserveArchiveSprites && duplicateArchiveIdentity) throw new Error(`The target SFF contains ${duplicateArchiveIdentity[1]} physical sprites with identity ${duplicateArchiveIdentity[0]}. SprMake2 requires unique group/index pairs, so a preservation build cannot proceed until that archive ambiguity is reviewed.`);
    const ambiguousReplacement = physicalSpritePlan ? null : [...stagedIdentityKeys].find(identity => (archiveIdentityCounts.get(identity) || 0) > 1);
    if (ambiguousReplacement) throw new Error(`The target SFF contains ${archiveIdentityCounts.get(ambiguousReplacement)} physical sprites with identity ${ambiguousReplacement}. Replacing that identity is ambiguous; choose a new identity or resolve the duplicate entries first.`);
    const requestedPalette = addedSpritePaletteId == null ? null : String(addedSpritePaletteId).replace(/\s+/g, '');
    if (requestedPalette && !/^\d+,\d+$/.test(requestedPalette)) throw new Error('The palette for added sprites must use group,index form, such as 1,1.');
    const shiftedPaletteCounts = new Map();
    for (const palette of paletteArchive.palettes) { if (deletedOriginal.has(`${palette.group},${palette.number}`)) continue; const shifted = applyPaletteShifts(palette.group, palette.number, palettePlan.shifts), id = `${shifted.group},${shifted.number}`; shiftedPaletteCounts.set(id, (shiftedPaletteCounts.get(id) || 0) + 1); }
    const shiftedPaletteIds = new Set(shiftedPaletteCounts.keys());
    const sharedPaletteKey = sharedPalette ? `${sharedPalette.group},${sharedPalette.number}` : '';
    if (sharedPaletteKey && occupied.has(sharedPaletteKey)) throw new Error(`Temporary/shared palette ${sharedPaletteKey} conflicts with an existing or staged palette ID.`);
    if (requestedPalette && !shiftedPaletteIds.has(requestedPalette) && requestedPalette !== sharedPaletteKey) throw new Error(`The selected target palette ${requestedPalette} does not exist after the reviewed palette plan.`);
    if (requestedPalette && shiftedPaletteCounts.get(requestedPalette) > 1) throw new Error(`The selected target palette ${requestedPalette} occurs more than once physically after the reviewed palette plan and is ambiguous.`);
    for (const entry of mapping) {
      const sourceSprite = sourceSprites.get(`${entry.group},${entry.index}`), palette = sourceSprite && paletteArchive.palettes[sourceSprite.paletteIndex];
      if (!entry.palette) {
        if (requestedPalette) entry.palette = requestedPalette;
        else if (palette) { const shifted = applyPaletteShifts(palette.group, palette.number, palettePlan.shifts); entry.palette = `${shifted.group},${shifted.number}`; }
      }
    }
    // A partial crop must retain current sprites outside its scope, including
    // sprites absent from the source manifest and earlier archive-only edits.
    if (manifestScopeSet || preserveArchiveSprites) for (const sprite of paletteArchive.sprites) {
      if (reviewedSpriteDeletions.has(`${sprite.group},${sprite.number}`)) continue;
      if (manifestScopeSet?.has(`${sprite.group},${sprite.number}`)) continue;
      if (preserveArchiveSprites && (physicalSpritePlan ? physicalSpritePlan.rows.some(row => row.action === 'replace' && row.destinationPhysicalIndex === sprite.index) : stagedIdentityKeys.has(`${sprite.group},${sprite.number}`))) continue;
      const buildFile = `g${String(sprite.group).padStart(5, '0')}_i${String(sprite.number).padStart(5, '0')}_p${String(sprite.index).padStart(6, '0')}.png`;
      const snapshotPath = path.join(inputDirectory, buildFile), snapshot = spritePng(paletteArchive, sprite, null, true);
      fs.writeFileSync(snapshotPath, snapshot);
      const palette = paletteArchive.palettes[sprite.paletteIndex];
      const shifted = palette ? applyPaletteShifts(palette.group, palette.number, palettePlan.shifts) : null;
      mapping.push({
        group: sprite.group, index: sprite.number, buildFile, source: paletteSourceSff, axisX: sprite.axisX, axisY: sprite.axisY, layer: 0,
        palette: shifted ? `${shifted.group},${shifted.number}` : null, duplicatePolicy: sprite.dataSize === 0 ? SHARE : SEPARATE, preserved: true, sourcePhysicalIndex: sprite.index,
        preservedLinkPhysicalIndex: sprite.dataSize === 0 ? sprite.link : null, snapshotPath,
        sourceByteHash: sha256(snapshot), image: pngSnapshotInfo(snapshot, snapshotPath),
        provenance: { kind: 'preserved-archive-sprite', sourceArchive: path.basename(paletteSourceSff), sourceArchiveByteHash: sha256(paletteArchive.buffer), sourceIdentity: `${sprite.group},${sprite.number}`, sourcePhysicalIndex: sprite.index }
      });
    }
    for (const protectedSprite of paletteArchive.sprites.filter((sprite) => sprite.group === 59000 && (sprite.number === 0 || sprite.number === 1))) {
      if (mapping.some((entry) => entry.group === protectedSprite.group && entry.index === protectedSprite.number)) continue;
      const buildFile = `g${String(protectedSprite.group).padStart(5, '0')}_i${String(protectedSprite.number).padStart(5, '0')}.png`, palette = paletteArchive.palettes[protectedSprite.paletteIndex];
      const snapshotPath = path.join(inputDirectory, buildFile), snapshot = spritePng(paletteArchive, protectedSprite);
      fs.writeFileSync(snapshotPath, snapshot);
      const shiftedPalette = palette ? applyPaletteShifts(palette.group, palette.number, palettePlan.shifts) : null;
      mapping.push({
        group: protectedSprite.group, index: protectedSprite.number, buildFile, source: paletteSourceSff, axisX: protectedSprite.axisX, axisY: protectedSprite.axisY, layer: 0,
        palette: shiftedPalette ? `${shiftedPalette.group},${shiftedPalette.number}` : null, duplicatePolicy: protectedSprite.dataSize === 0 ? SHARE : SEPARATE, protected: true, sourcePhysicalIndex: protectedSprite.index,
        preservedLinkPhysicalIndex: protectedSprite.dataSize === 0 ? protectedSprite.link : null, snapshotPath,
        sourceByteHash: sha256(snapshot), image: pngSnapshotInfo(snapshot, snapshotPath),
        provenance: { kind: 'protected-archive-sprite', sourceArchive: path.basename(paletteSourceSff), sourceArchiveByteHash: sha256(paletteArchive.buffer), sourceIdentity: `${protectedSprite.group},${protectedSprite.number}`, sourcePhysicalIndex: protectedSprite.index }
      });
    }
    if ((cropSet || preserveArchiveSprites) && physicalSpritePlan) {
      const incomingByOrdinal = new Map(mapping.filter(entry => Number.isInteger(entry.incomingManifestOrdinal)).map(entry => [entry.incomingManifestOrdinal, entry]));
      const replacementByPhysical = new Map(physicalSpritePlan.rows.filter(row => row.action === 'replace').map(row => [row.destinationPhysicalIndex, incomingByOrdinal.get(row.manifestOrdinal)]));
      const insertable = physicalSpritePlan.rows.filter(row => row.action === 'insert').map(row => incomingByOrdinal.get(row.manifestOrdinal)), preservedByPhysicalIndex = new Map(mapping.filter(entry => Number.isInteger(entry.sourcePhysicalIndex)).map(entry => [entry.sourcePhysicalIndex, entry]));
      if ([...replacementByPhysical.values(), ...insertable].some(entry => !entry)) throw new Error('Reviewed physical sprite plan no longer resolves every incoming manifest row.');
      const consumed = new Set(), ordered = [];
      for (const sprite of paletteArchive.sprites) {
        if (sprite.index === reviewedInsertionPhysicalIndex) for (const entry of insertable) { ordered.push(entry); consumed.add(entry); }
        const replacement = replacementByPhysical.get(sprite.index), preserved = preservedByPhysicalIndex.get(sprite.index);
        if (replacement) { ordered.push(replacement); consumed.add(replacement); }
        else if (preserved) { ordered.push(preserved); consumed.add(preserved); }
        else throw new Error(`Reviewed physical sprite plan lost Destination physical sprite ${sprite.index}.`);
      }
      if (reviewedInsertionPhysicalIndex === paletteArchive.sprites.length) for (const entry of insertable) { if (!consumed.has(entry)) { ordered.push(entry); consumed.add(entry); } }
      if (mapping.some(entry => !consumed.has(entry))) throw new Error('Reviewed physical sprite plan left an incoming or preserved sprite unplaced.');
      mapping.splice(0, mapping.length, ...ordered);
    } else if (cropSet || preserveArchiveSprites) {
      const stagedByIdentity = new Map(mapping.filter(entry => !Number.isInteger(entry.sourcePhysicalIndex)).map(entry => [`${entry.group},${entry.index}`, entry]));
      const preservedByPhysicalIndex = new Map(mapping.filter(entry => Number.isInteger(entry.sourcePhysicalIndex)).map(entry => [entry.sourcePhysicalIndex, entry]));
      const consumed = new Set(), ordered = [], insertable = reviewedInsertionPhysicalIndex === null ? [] : mapping.filter(entry => !Number.isInteger(entry.sourcePhysicalIndex) && !paletteArchive.sprites.some(sprite => sprite.group === entry.group && sprite.number === entry.index));
      for (const sprite of paletteArchive.sprites) {
        if (sprite.index === reviewedInsertionPhysicalIndex) for (const entry of insertable) if (!consumed.has(entry)) { ordered.push(entry); consumed.add(entry); }
        const key = `${sprite.group},${sprite.number}`, replacement = stagedByIdentity.get(key), preserved = preservedByPhysicalIndex.get(sprite.index);
        if (replacement && !consumed.has(replacement)) { ordered.push(replacement); consumed.add(replacement); }
        else if (preserved) { ordered.push(preserved); consumed.add(preserved); }
      }
      if (reviewedInsertionPhysicalIndex === paletteArchive.sprites.length) for (const entry of insertable) if (!consumed.has(entry)) { ordered.push(entry); consumed.add(entry); }
      ordered.push(...mapping.filter(entry => !consumed.has(entry)));
      mapping.splice(0, mapping.length, ...ordered);
    }
    // A linked sprite follows its physical owner at runtime. When a reviewed
    // truecolor replacement changes that owner, its preserved snapshot must
    // follow the same new pixels before the candidate is sealed.
    if (preserveArchiveSprites) for (const original of paletteArchive.sprites) {
      if (original.dataSize !== 0) continue;
      const owner = paletteArchive.sprites[original.link];
      const matches = sprite => mapping.filter(entry => entry.group === sprite.group && entry.index === sprite.number);
      if (!owner || matches(owner).length !== 1 || matches(original).length !== 1) continue;
      const ownerEntry = matches(owner)[0], linkedEntry = matches(original)[0];
      if (!Number.isInteger(linkedEntry.sourcePhysicalIndex) || ownerEntry.sourcePhysicalIndex === owner.index && !rebasedTruecolorOwners.has(owner.index)) continue;
      if (![24, 32].includes(Number(ownerEntry.image.colorDepth))) continue;
      if (Number(ownerEntry.image.colorDepth) !== Number(linkedEntry.image.colorDepth) || ownerEntry.image.width !== linkedEntry.image.width || ownerEntry.image.height !== linkedEntry.image.height) throw new Error(`Linked truecolor sprite ${original.group},${original.number} no longer matches its reviewed physical owner. No candidate was built.`);
      fs.copyFileSync(ownerEntry.snapshotPath, linkedEntry.snapshotPath);
      linkedEntry.sourceByteHash = ownerEntry.sourceByteHash;
      linkedEntry.image = { ...ownerEntry.image };
      linkedEntry.duplicatePolicy = SHARE;
      linkedEntry.provenance = { ...linkedEntry.provenance, kind: 'preserved-archive-link-rebased', reviewedOwnerPhysicalIndex: owner.index, reviewedOwnerIdentity: `${owner.group},${owner.number}` };
      rebasedTruecolorOwners.set(owner.index, ownerEntry);
      rebasedTruecolorOwners.set(original.index, linkedEntry);
    }
    const deletedUse = mapping.find((entry) => entry.palette && deletedEffective.has(entry.palette));
    if (deletedUse) throw new Error(`Palette ${deletedUse.palette} is staged for deletion but sprite ${deletedUse.group},${deletedUse.index} still uses it.`);
  } else stagedPalettes.push(...portablePalettes);

  const availableStoredPaletteIds = new Set(stagedPalettes.map(palette => `${palette.group},${palette.number}`));
  if (paletteArchive) for (const palette of paletteArchive.palettes) {
    if (paletteDeletions.some(entry => Number(entry.sourceGroup) === palette.group && Number(entry.sourceNumber) === palette.number)) continue;
    const shifted = applyPaletteShifts(palette.group, palette.number, paletteShifts); availableStoredPaletteIds.add(`${shifted.group},${shifted.number}`);
  }
  if (sharedPalette) availableStoredPaletteIds.add(`${sharedPalette.group},${sharedPalette.number}`);
  const missingStoredPalette = mapping.find(entry => entry.palette && !availableStoredPaletteIds.has(entry.palette));
  if (missingStoredPalette) throw new Error(`Sprite ${missingStoredPalette.group},${missingStoredPalette.index} references stored palette ${missingStoredPalette.palette}, but that palette is not present in the reviewed build plan.`);

  // Legacy tool-autocrop must become an exact final source before sealing the
  // specification. Do not ask the external builder to change reviewed geometry.
  for (const entry of mapping) {
    const identity = `${entry.group},${entry.index}`, requestedMode = reviewedCropModes.get(identity) || (cropSet ? (cropSet.has(identity) ? 'autocrop' : 'none') : (autocrop ? 'autocrop' : 'none'));
    if (requestedMode !== 'autocrop' && !(requestedMode === 'after-axis' && entry.provenance.preparation?.kind !== 'after-axis-crop')) continue;
    const original = fs.readFileSync(entry.snapshotPath), originalHash = sha256(original).toLowerCase();
    if (originalHash !== String(entry.sourceByteHash).toLowerCase()) throw new Error(`Crop source changed before its geometry was sealed: ${identity}.`);
    const sealed = require('./sff_sealed_autocrop').sealAutocropSource(original, entry.axisX, entry.axisY), retained = path.join(outputDirectory, 'crop-input', entry.buildFile);
    fs.mkdirSync(path.dirname(retained), { recursive: true });
    if (fs.existsSync(retained)) { if (sha256(fs.readFileSync(retained)).toLowerCase() !== originalHash) throw new Error(`The retained uncropped snapshot changed: ${identity}.`); }
    else transactionalWrite(fs, retained, original, { allowExisting: false, backup: false, journal: false, label: 'retain-uncropped-source' });
    transactionalWrite(fs, entry.snapshotPath, sealed.buffer, { expectedHash: originalHash, backup: false, journal: false, label: 'seal-reviewed-crop-source' });
    entry.axisX = sealed.axisX; entry.axisY = sealed.axisY; entry.sourceByteHash = sha256(sealed.buffer).toLowerCase(); entry.image = pngSnapshotInfo(sealed.buffer, entry.snapshotPath);
    entry.provenance = { ...entry.provenance, preparation: { ...sealed.preparation, requestedMode, originalSnapshotRelativePath: portableRelative(outputDirectory, retained), priorPreparation: entry.provenance.preparation || null } };
    reviewedCropModes.set(identity, 'none');
  }

  const buildOutputSff = path.resolve(candidateOutputSff || outputSff);
  const paletteSpecifications = [];
  const writePaletteSnapshot = ({ group, number, filename, colors, tableOrder, linkTargetEntryId = null, provenance }) => {
    const snapshotPath = path.join(inputDirectory, filename), snapshot = paletteAct(colors);
    fs.writeFileSync(snapshotPath, snapshot);
    paletteSpecifications.push({
      entryId: `palette:${group},${number}`, group, number, tableOrder: 'sff', linkTargetEntryId,
      duplicatePolicy: policies.palettes, colors, source: {
        relativePath: portableRelative(outputDirectory, snapshotPath), byteHash: sha256(snapshot), width: 256, height: 1, provenance
      }
    });
  };
  const portablePaletteFiles = [];
  if (!paletteArchive) for (const palette of portablePalettes) {
    const actFile = `pal_${palette.group}_${palette.number}_portable.act`;
    writePaletteSnapshot({ group: palette.group, number: palette.number, filename: actFile, colors: palette.colors, tableOrder: 'sprmake2-reverseact', provenance: { kind: 'portable-sprmake2-recipe-palette', originalSource: path.basename(palette.source), originalByteHash: palette.sourceByteHash, sourceTableOrder: palette.sourceTableOrder, importedProvenance: palette.provenance } });
    portablePaletteFiles.push({ palette, actFile });
  }
  if (!paletteArchive && !sharedPalette) {
    const firstPaletteByHash = new Map();
    for (const entry of mapping) {
      if (entry.palette) { entry.specificationPalette = `palette:${entry.palette}`; continue; }
      if (!Array.isArray(entry.image.colors) || entry.image.colors.length !== 256) continue;
      // With sprite.usepal = -1 SprMake2 assigns an indexed PNG's own palette
      // the same group/number identity as that sprite. Preserve that backend
      // behavior in the shared specification so comparison and verification
      // describe the archive SprMake2 actually emits.
      const group = entry.group, number = entry.index, entryId = `palette:${group},${number}`, colors = entry.image.colors;
      const colorHash = sha256(Buffer.from(colors.flat())), first = policies.palettes === SHARE ? firstPaletteByHash.get(colorHash) : null;
      if (portablePaletteIds.has(`${group},${number}`)) throw new Error(`Sprite ${group},${number}'s own image palette collides with portable stored palette ${group},${number}. Assign the sprite to that stored palette explicitly or change one identity.`);
      paletteSpecifications.push({
        entryId, group, number, tableOrder: 'sff', linkTargetEntryId: first || null,
        duplicatePolicy: policies.palettes, colors, source: {
          relativePath: portableRelative(outputDirectory, entry.snapshotPath), byteHash: entry.sourceByteHash, decodedHash: colorHash,
          width: 256, height: 1, provenance: { kind: 'indexed-png-image-palette', sourceSpriteIdentity: `${entry.group},${entry.index}`, sourcePngByteHash: entry.sourceByteHash, paletteRgbaHash: colorHash }
        }
      });
      entry.specificationPalette = entryId;
      if (!firstPaletteByHash.has(colorHash)) firstPaletteByHash.set(colorHash, entryId);
    }
  }
  const spriteDuplicatePolicies = new Set(mapping.map((entry) => entry.duplicatePolicy || policies.sprites));
  const mixedSpriteDuplicatePolicies = spriteDuplicatePolicies.size > 1;
  const sprMake2Available = !mixedSpriteDuplicatePolicies;
  const sprMake2UnavailableReason = mixedSpriteDuplicatePolicies
    ? 'The reviewed plan mixes per-sprite identical-data policies, but SprMake2 exposes only one build-wide sprite.detectduplicates switch.'
    : '';
  if (!sprMake2Available) {
    const staleRunnable = ['sprmake2.def', 'build.cmd'].filter(name => fs.existsSync(path.join(outputDirectory, name)));
    if (staleRunnable.length) throw new Error(`The mixed-policy package folder contains stale runnable SprMake2 artifact(s): ${staleRunnable.join(', ')}. Choose a clean package folder; nothing was executed or adopted.`);
  }
  const definitionPath = path.join(outputDirectory, sprMake2Available ? 'sprmake2.def' : 'sprmake2-unavailable-preview.txt');
  const lines = [
    ...(sprMake2Available ? [] : ['; REVIEW PREVIEW ONLY — NOT AN EXECUTABLE SPRMAKE2 DEFINITION', `; ${sprMake2UnavailableReason}`, '; The immutable backend-neutral specification is authoritative for this package.', '']),
    '[Output]', `filename = ${buildOutputSff}`, '', '[Option]', `input.dir = ${inputDirectory}`,
    'sprite.compress.5 = lz5', 'sprite.compress.8 = png8', 'sprite.compress.24 = png24',
    'sprite.compress.32 = png32', 'sprite.decompressonload = 0', `sprite.detectduplicates = ${policies.sprites === SHARE ? 1 : 0}`,
    'sprite.autocrop = 0', `pal.detectduplicates = ${policies.palettes === SHARE ? 1 : 0}`, 'pal.discardduplicates = 0',
    'pal.reversepng = 0', ...(paletteArchive || sharedPalette || portablePalettes.length ? ['pal.reverseact = 1'] : []), 'sprite.usepal = -1', 'sprite.removecolors = -1'
  ];
  if (sharedPalette && !paletteArchive) {
    const actFile = `pal_${sharedPalette.group}_${sharedPalette.number}_shared.act`;
    writePaletteSnapshot({ group: sharedPalette.group, number: sharedPalette.number, filename: actFile, colors: sharedPalette.colors, tableOrder: 'sprmake2-reverseact', provenance: { kind: 'shared-provisional-palette', originalSource: path.basename(sharedPalette.source), originalByteHash: sha256(fs.readFileSync(sharedPalette.source)), sourceTableOrder: sharedPalette.sourceOrder } });
    lines.push('', '[Pal]', `${sharedPalette.group},${sharedPalette.number}, ${actFile}, 0,255 ; one shared provisional CS table`);
  }
  if (!paletteArchive && portablePalettes.length) {
    lines.push('', '[Pal]');
    for (const { palette, actFile } of portablePaletteFiles) {
      lines.push(`${palette.group},${palette.number}, ${actFile}, 0,255 ; imported portable recipe palette`);
    }
  }
  if (paletteArchive) {
    lines.push('', '[Pal]');
    const deletedOriginal = new Set(paletteDeletions.map((entry) => `${entry.sourceGroup},${entry.sourceNumber}`));
    for (const palette of paletteArchive.palettes) {
      if (deletedOriginal.has(`${palette.group},${palette.number}`)) continue;
      const shifted = applyPaletteShifts(palette.group, palette.number, paletteShifts), actFile = `pal_${shifted.group}_${shifted.number}.act`;
      const linked = policies.palettes === SHARE && palette.dataSize === 0 ? paletteArchive.palettes[palette.link] : null;
      const linkedShifted = linked ? applyPaletteShifts(linked.group, linked.number, paletteShifts) : null;
      writePaletteSnapshot({ group: shifted.group, number: shifted.number, filename: actFile, colors: paletteRgba(paletteArchive, palette.index), tableOrder: 'sprmake2-reverseact', linkTargetEntryId: linkedShifted ? `palette:${linkedShifted.group},${linkedShifted.number}` : null, provenance: { kind: 'preserved-archive-palette', sourceArchive: path.basename(paletteSourceSff), sourceArchiveByteHash: sha256(paletteArchive.buffer), sourcePaletteIdentity: `${palette.group},${palette.number}`, sourcePhysicalIndex: palette.index } });
      lines.push(`${shifted.group},${shifted.number}, ${actFile}, 0,255${shifted.number!==palette.number||shifted.group!==palette.group?` ; shifted from ${palette.group},${palette.number}`:''}`);
    }
    for (const palette of stagedPalettes.filter((entry) => entry.kind !== 'alias')) {
      const actFile = `pal_${palette.group}_${palette.number}.act`;
      writePaletteSnapshot({ group: palette.group, number: palette.number, filename: actFile, colors: palette.colors, tableOrder: 'sprmake2-reverseact', provenance: { kind: palette.kind === 'image-palette' ? 'staged-image-palette' : palette.kind === 'portable-recipe-palette' ? 'portable-sprmake2-recipe-palette' : 'staged-palette', originalSource: palette.source ? path.basename(palette.source) : null, originalByteHash: palette.sourceByteHash || (palette.source && fs.existsSync(palette.source) ? sha256(fs.readFileSync(palette.source)) : null), sourceTableOrder: palette.sourceTableOrder || null, importedProvenance: palette.provenance || null, sourceSpriteIdentity: palette.sourceSpriteIdentity || null } });
      lines.push(`${palette.group},${palette.number}, ${actFile}, 0,255`);
    }
    for (const palette of stagedPalettes.filter((entry) => entry.kind === 'alias')) {
      const actFile = `pal_${palette.group}_${palette.number}_alias_of_${palette.targetGroup}_${palette.targetNumber}.act`;
      writePaletteSnapshot({ group: palette.group, number: palette.number, filename: actFile, colors: palette.colors, tableOrder: 'sprmake2-reverseact', linkTargetEntryId: policies.palettes === SHARE ? `palette:${palette.targetGroup},${palette.targetNumber}` : null, provenance: { kind: 'staged-palette-alias', targetPaletteIdentity: `${palette.targetGroup},${palette.targetNumber}` } });
      lines.push(`${palette.group},${palette.number}, ${actFile}, 0,255 ; linked alias of ${palette.targetGroup},${palette.targetNumber}`);
    }
    if (sharedPalette) {
      const actFile = `pal_${sharedPalette.group}_${sharedPalette.number}_shared.act`;
      writePaletteSnapshot({ group: sharedPalette.group, number: sharedPalette.number, filename: actFile, colors: sharedPalette.colors, tableOrder: 'sprmake2-reverseact', provenance: { kind: sharedPalette.lifecycle ? 'temporary-placeholder-palette' : 'shared-provisional-palette', originalSource: path.basename(sharedPalette.source), originalByteHash: sha256(fs.readFileSync(sharedPalette.source)), sourceTableOrder: sharedPalette.sourceOrder, lifecycle: sharedPalette.lifecycle || null } });
      lines.push(`${sharedPalette.group},${sharedPalette.number}, ${actFile}, 0,255 ; ${sharedPalette.lifecycle ? `temporary placeholder palette ${sharedPalette.lifecycle.lifecycleId}` : 'shared provisional palette'}`);
    }
  }
  let activePalette = null, activeAutocrop = false;
  for (const entry of mapping) {
    const wanted = entry.palette || '-1';
    const cropMode = reviewedCropModes.get(`${entry.group},${entry.index}`), preparedAfterAxis = cropMode === 'after-axis' && entry.provenance.preparation?.kind === 'after-axis-crop', wantedAutocrop = cropMode ? (cropMode === 'autocrop' || (cropMode === 'after-axis' && !preparedAfterAxis)) : cropSet ? cropSet.has(`${entry.group},${entry.index}`) : Boolean(autocrop);
    if (wanted !== activePalette || wantedAutocrop !== activeAutocrop) {
      lines.push('', '[Option]', `sprite.usepal = ${wanted}`, `sprite.autocrop = ${wantedAutocrop ? 1 : 0}`, '', '[Sprite]');
      activePalette = wanted; activeAutocrop = wantedAutocrop;
    }
    lines.push(`${entry.group},${entry.index}, ${entry.buildFile}, ${entry.axisX},${entry.axisY}`);
  }
  fs.writeFileSync(definitionPath, `${lines.join('\r\n')}\r\n`, 'utf8');

  const sprmake = resolveProjectTool(vscode.workspace.getConfiguration('ikemenZss').get('sprMake2Path', 'sprmake2.exe'), sourceRoot, 'sprmake2.exe');
  const batchPath = path.join(outputDirectory, sprMake2Available ? 'build.cmd' : 'sprmake2-unavailable.txt');
  fs.writeFileSync(batchPath, sprMake2Available
    ? `@echo off\r\nif exist "${buildOutputSff}" del /q "${buildOutputSff}"\r\n"${sprmake}" "${definitionPath}"\r\nexit /b %errorlevel%\r\n`
    : `SPRMAKE2 ADAPTER UNAVAILABLE\r\n\r\n${sprMake2UnavailableReason}\r\nCreate Package Only retained every reviewed per-sprite choice in the immutable SFF specification.\r\nNo executable build script was generated.\r\n`, sprMake2Available ? 'ascii' : 'utf8');
  const mappingPath = path.join(outputDirectory, 'production_mapping.csv');
  fs.writeFileSync(mappingPath, stringifyCsv(mapping.map((entry, physicalOrder) => ({
    PhysicalOrder: physicalOrder, Group: entry.group, Index: entry.index, Layer: entry.layer, Palette: entry.palette || 'Own PNG palette', DuplicatePolicy: entry.duplicatePolicy || policies.sprites, Protected: entry.protected ? 'YES' : '', File: entry.buildFile, Source: entry.source, AxisX: entry.axisX, AxisY: entry.axisY
  }))), 'utf8');
  const validationReportPath = path.join(outputDirectory, 'validation_report.txt');
  fs.writeFileSync(validationReportPath, [
    'SFF BUILD PACKAGE READY', `Project profile: ${profile.profileName}`, `Project id: ${profile.projectId}`, `Get-hit indexing: ${profile.getHitIndexing.enabled ? `source frame × ${profile.getHitIndexing.step}` : 'disabled by project profile'}`, `Sprites: ${mapping.length}`, `Groups: ${new Set(mapping.map((entry) => entry.group)).size}`,
    `Layer sprites: ${mapping.filter((entry) => entry.layer > 0).length}`, 'Physical sprite order: approved manifest order (partial rebuilds retain source archive order)', `Sprites staged for reviewed deletion: ${reviewedSpriteDeletions.size}`, `Embedded palettes preserved: ${paletteArchive ? paletteArchive.palettes.length - paletteDeletions.length : 0}`, `Palettes staged for reviewed deletion: ${paletteDeletions.length}`, `Shared provisional palette: ${sharedPalette ? `${sharedPalette.group},${sharedPalette.number}` : 'none'}`, `New palettes staged: ${stagedPalettes.filter((entry) => entry.kind !== 'alias').length}`, `Linked palette aliases staged: ${stagedPalettes.filter((entry) => entry.kind === 'alias').length}`, `Palette insert/shift operations: ${paletteShifts.length}`, `Protected template sprites preserved: ${mapping.filter((entry) => entry.protected).length}`, `Palette source: ${paletteSourceSff || sharedPalettePath || 'None — PNG palettes are used'}`, `Identical sprite data: ${mixedSpriteDuplicatePolicies ? 'mixed per-sprite choices retained in specification; SprMake2 unavailable' : policies.sprites === SHARE ? 'share/link after explicit review' : 'store separately'}`, `Identical palette data: ${policies.palettes === SHARE ? 'preserve IDs and link after explicit review' : 'store each table separately'}`, `SprMake2 adapter: ${sprMake2Available ? 'available' : `unavailable — ${sprMake2UnavailableReason}`}`, `Build output: ${candidateOutputSff ? `candidate ${buildOutputSff}; adoption target ${path.resolve(outputSff)}` : buildOutputSff}`, `Autocrop: ${cropSet ? `${cropSet.size} selected identity/identities` : (autocrop ? 'enabled for release output' : 'disabled for development')}`, 'Manifest validation errors: 0'
  ].join('\r\n'), 'utf8');
  const profilePath = path.join(outputDirectory, 'sff-build-profile.json');
  fs.writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');

  const observedTarget = captureTarget(fs, outputSff), reviewedTarget = targetSnapshot || observedTarget;
  if (path.resolve(reviewedTarget.filename || '') !== path.resolve(outputSff)) throw new Error('The reviewed target snapshot belongs to a different SFF path.');
  if (Boolean(reviewedTarget.exists) !== observedTarget.exists || String(reviewedTarget.hash || '').toLowerCase() !== observedTarget.hash.toLowerCase()) {
    throw new Error(`The target SFF changed while its build package was being prepared: ${path.resolve(outputSff)}`);
  }
  const sourceEntries = mapping.map((entry, physicalOrder) => {
    const entryId = `sprite:${physicalOrder}:${entry.group},${entry.index}`;
    return {
      entryId, group: entry.group, number: entry.index, axisX: entry.axisX - Number(entry.provenance.preparation?.axisDeltaX || 0), axisY: entry.axisY - Number(entry.provenance.preparation?.axisDeltaY || 0),
      colorDepth: entry.image.colorDepth, format: entry.image.format, compression: entry.image.compression,
      paletteId: entry.specificationPalette || entry.palette, duplicatePolicy: entry.duplicatePolicy || policies.sprites,
      crop: { mode: reviewedCropModes.get(`${entry.group},${entry.index}`) || (cropSet ? (cropSet.has(`${entry.group},${entry.index}`) ? 'autocrop' : 'none') : (autocrop ? 'autocrop' : 'none')), axisDeltaX: Number(entry.provenance.preparation?.axisDeltaX || 0), axisDeltaY: Number(entry.provenance.preparation?.axisDeltaY || 0) },
      source: {
        relativePath: portableRelative(outputDirectory, entry.snapshotPath), byteHash: entry.sourceByteHash, decodedHash: entry.image.decodedHash,
        width: entry.image.width, height: entry.image.height, provenance: entry.provenance
      }
    };
  });
  if (physicalSpritePlan) {
    const byOrdinal = new Map();
    for (let index = 0; index < mapping.length; index += 1) if (Number.isInteger(mapping[index].incomingManifestOrdinal)) byOrdinal.set(mapping[index].incomingManifestOrdinal, { mapping: mapping[index], entry: sourceEntries[index], physicalOrder: index });
    for (const row of physicalSpritePlan.rows) if (row.linkTargetManifestOrdinal !== null) {
      const linked = byOrdinal.get(row.manifestOrdinal), target = byOrdinal.get(row.linkTargetManifestOrdinal);
      if (!linked || !target || target.physicalOrder >= linked.physicalOrder) throw new Error(`Reviewed incoming link ${row.sourceIdentity} must target an earlier incoming physical sprite.`);
      if (spriteSharingKey(linked.mapping) !== spriteSharingKey(target.mapping)) throw new Error(`Reviewed incoming link ${row.sourceIdentity} does not match its exact target pixels, dimensions, format, and palette.`);
      linked.entry.duplicatePolicy = SHARE; linked.entry.linkTargetEntryId = target.entry.entryId;
    }
  }
  const temporaryPalettes = sharedPalette?.lifecycle ? [{ ...sharedPalette.lifecycle, ownerSpriteIds: sourceEntries.filter(entry => entry.source.provenance?.placeholder?.lifecycleId === sharedPalette.lifecycle.lifecycleId).map(entry => entry.entryId), owners: sourceEntries.filter(entry => entry.source.provenance?.placeholder?.lifecycleId === sharedPalette.lifecycle.lifecycleId).map(entry => ({ ownerId: entry.source.provenance.placeholder.ownerId, entryId: entry.entryId, group: entry.group, number: entry.number, decodedIndexHash: entry.source.decodedHash, width: entry.source.width, height: entry.source.height, axisX: entry.axisX, axisY: entry.axisY, paletteId: entry.paletteId, note: entry.source.provenance.placeholder.note || '', provenance: entry.source.provenance })) }] : [];
  const preservedEntryByPhysicalIndex = new Map();
  for (let index = 0; index < mapping.length; index += 1) if (Number.isInteger(mapping[index].sourcePhysicalIndex)) preservedEntryByPhysicalIndex.set(mapping[index].sourcePhysicalIndex, sourceEntries[index].entryId);
  for (const [physicalIndex, entry] of rebasedTruecolorOwners) preservedEntryByPhysicalIndex.set(physicalIndex, sourceEntries[mapping.indexOf(entry)].entryId);
  for (let index = 0; index < mapping.length; index += 1) {
    const linkedPhysicalIndex = mapping[index].preservedLinkPhysicalIndex;
    if (!Number.isInteger(linkedPhysicalIndex)) continue;
    const targetEntryId = preservedEntryByPhysicalIndex.get(linkedPhysicalIndex);
    if (targetEntryId) sourceEntries[index].linkTargetEntryId = targetEntryId;
    else sourceEntries[index].duplicatePolicy = SEPARATE;
  }
  if (sourceEntries.some((entry) => entry.duplicatePolicy === SHARE)) {
    const firstByHash = new Map();
    for (let index = 0; index < sourceEntries.length; index += 1) {
      const entry = sourceEntries[index], sharingKey = spriteSharingKey({ ...mapping[index], palette: mapping[index].specificationPalette || mapping[index].palette });
      const first = firstByHash.get(sharingKey);
      if (entry.duplicatePolicy === SHARE && !entry.linkTargetEntryId && first) entry.linkTargetEntryId = first;
      if (!first) firstByHash.set(sharingKey, entry.entryId);
    }
  }
  const requirementSet = new Set(['sff-v2.1', 'preserve-authored-physical-order', 'immutable-source-snapshots', 'candidate-before-adoption']);
  for (const entry of sourceEntries) requirementSet.add(`sprite-${entry.format}`);
  if (paletteSpecifications.length) requirementSet.add('embedded-palettes');
  if (sourceEntries.some((entry) => entry.duplicatePolicy === SHARE)) requirementSet.add('sprite-data-linking');
  if (policies.palettes === SHARE && paletteSpecifications.length) requirementSet.add('palette-data-linking');
  const planBasis = {
    manifestHash, target: { identity: path.basename(outputSff), fingerprint: observedTarget.exists ? observedTarget.hash.toLowerCase() : null },
    sprites: sourceEntries.map((entry) => [entry.entryId, entry.source.byteHash, entry.duplicatePolicy, entry.linkTargetEntryId || null]), palettes: paletteSpecifications.map((entry) => [entry.entryId, entry.source.byteHash]),
    policies, reviewedPhysicalSpritePlan: physicalSpritePlan, autocrop: Boolean(autocrop), autocropIdentities: cropSet ? [...cropSet] : null, cropModesByIdentity: Object.fromEntries(reviewedCropModes), manifestScopeIdentities: manifestScopeSet ? [...manifestScopeSet] : null, includeStagedPalettes: Boolean(includeStagedPalettes), preserveArchiveSprites: Boolean(preserveArchiveSprites), addedSpritePaletteId: addedSpritePaletteId == null ? null : String(addedSpritePaletteId), imagePaletteIntake: imagePaletteIntake ? { group: Number(imagePaletteIntake.group), tableOrder: normalizeOrder(imagePaletteIntake.tableOrder) } : null, deletedSpriteIdentities: [...reviewedSpriteDeletions], reviewedTemporaryPaletteCleanup: temporaryPaletteCleanupContract(reviewedTemporaryPaletteCleanup), temporaryPalettes, reviewEvidence: reviewedEvidence,
    batchScope: batchScope ? { mode: batchScope.mode, sourceFingerprint: batchScope.sourceFingerprint, identities: [...batchScope.identities], resolvedCount: batchScope.resolvedCount, resolutionHash: batchScope.resolutionHash } : null
  };
  const planId = `sff-plan-${sha256(Buffer.from(JSON.stringify(canonicalize(planBasis)), 'utf8'))}`;
  const specification = createSffBuildSpecification({
    planId, sourceRoot: 'input',
    target: { archiveIdentity: path.basename(outputSff), archiveFingerprint: observedTarget.exists ? observedTarget.hash : null, sffVersion: '2.1' },
    sprites: sourceEntries, palettes: paletteSpecifications, requirements: [...requirementSet],
    decisions: [
      { decisionId: 'sprite-duplicate-policy', kind: 'duplicate-policy', choice: mixedSpriteDuplicatePolicies ? 'mixed-per-sprite' : policies.sprites },
      { decisionId: 'palette-duplicate-policy', kind: 'duplicate-policy', choice: policies.palettes }
    ],
    options: {
      shared: {
        ...(profile.png8Optimization !== 'none' ? { png8Optimization: profile.png8Optimization } : {}),
        physicalOrder: 'authored', manifest: { identity: path.basename(manifestFilename), byteHash: manifestHash },
        paletteSource: paletteSourceSff ? { identity: path.basename(paletteSourceSff), byteHash: sha256(paletteArchive.buffer) } : sharedPalettePath ? { identity: path.basename(sharedPalettePath), byteHash: sha256(fs.readFileSync(sharedPalettePath)), tableOrder: sharedPalette.sourceOrder } : null,
        candidateOutput: path.basename(buildOutputSff), adoptionTarget: path.basename(outputSff), autocrop: Boolean(autocrop),
        autocropIdentities: cropSet ? [...cropSet] : null, cropModesByIdentity: Object.fromEntries(reviewedCropModes), manifestScopeIdentities: manifestScopeSet ? [...manifestScopeSet] : null, includeStagedPalettes: Boolean(includeStagedPalettes), duplicateHandling: policies, spriteDuplicatePolicies: sourceEntries.map((entry) => ({ entryId: entry.entryId, policy: entry.duplicatePolicy })),
        preserveArchiveSprites: Boolean(preserveArchiveSprites), reviewedPhysicalSpritePlan: physicalSpritePlan, addedSpritePaletteId: addedSpritePaletteId == null ? null : String(addedSpritePaletteId), imagePaletteIntake: imagePaletteIntake ? { group: Number(imagePaletteIntake.group), tableOrder: normalizeOrder(imagePaletteIntake.tableOrder) } : null, deletedSpriteIdentities: [...reviewedSpriteDeletions], reviewedTemporaryPaletteCleanup: temporaryPaletteCleanupContract(reviewedTemporaryPaletteCleanup), temporaryPalettes,
        batchScope: batchScope ? { mode: batchScope.mode, sourceFingerprint: batchScope.sourceFingerprint, identities: [...batchScope.identities], resolvedCount: batchScope.resolvedCount, resolutionHash: batchScope.resolutionHash } : null,
        reviewEvidence: reviewedEvidence
      },
      backends: {
        sprmake2: sprMake2Available ? {
          available: true, executable: path.basename(sprmake), definition: portableRelative(outputDirectory, definitionPath), inputDirectory: portableRelative(outputDirectory, inputDirectory),
          spriteCompression: { 5: 'lz5', 8: 'png8', 24: 'png24', 32: 'png32' }, detectDuplicateSprites: policies.sprites === SHARE,
          detectDuplicatePalettes: policies.palettes === SHARE, discardDuplicatePalettes: false, reversePng: false,
          reverseAct: Boolean(paletteArchive || sharedPalette || portablePalettes.length), removeColors: -1
        } : { available: false, reason: sprMake2UnavailableReason }
      }
    }
  });
  const specificationArtifact = immutableJsonArtifact(outputDirectory, 'reviewed-sff-build-specification', specification.specificationHash, specification);
  const adapterArtifacts = [definitionPath, batchPath, mappingPath, validationReportPath, profilePath].map((filename) => ({
    relativePath: portableRelative(outputDirectory, filename), byteHash: sha256(fs.readFileSync(filename))
  }));
  const receipt = {
    schema: 'ikemaker.sff-build-package-receipt', version: 1, planId, reviewStatus: 'reviewed-approved-manifest',
    specification: { relativePath: portableRelative(outputDirectory, specificationArtifact.path), specificationHash: specification.specificationHash, byteHash: specificationArtifact.byteHash },
    target: specification.target, manifest: { identity: manifestFilename, byteHash: manifestHash },
    backend: { id: sprMake2Available ? 'sprmake2' : 'backend-neutral-review', artifacts: adapterArtifacts },
    batchScope: batchScope ? { mode: batchScope.mode, sourceFingerprint: batchScope.sourceFingerprint, identities: [...batchScope.identities], resolvedCount: batchScope.resolvedCount, resolutionHash: batchScope.resolutionHash } : null,
    temporaryPalettes, reviewedTemporaryPaletteCleanup: temporaryPaletteCleanupContract(reviewedTemporaryPaletteCleanup), reviewEvidence: reviewedEvidence,
    sourceSnapshots: [...sourceEntries, ...paletteSpecifications].map((entry) => ({ entryId: entry.entryId, relativePath: entry.source.relativePath, byteHash: entry.source.byteHash })),
    approvedSourceSnapshots: sourceEntries.filter(entry => entry.source.provenance?.sprMake2Normalization?.originalSnapshotRelativePath).map(entry => ({ entryId: entry.entryId, relativePath: entry.source.provenance.sprMake2Normalization.originalSnapshotRelativePath, byteHash: entry.source.provenance.sprMake2Normalization.originalByteHash }))
  };
  receipt.receiptHash = semanticReceiptHash(receipt);
  const receiptArtifact = immutableJsonArtifact(outputDirectory, 'reviewed-sff-build-receipt', receipt.receiptHash, receipt);
  const removedTemporaryLifecycleIds = paletteDeletions.map((entry) => String(entry.lifecycleId || '')).filter(Boolean);
  const placeholderLifecycleRegistry = temporaryPalettes.length || removedTemporaryLifecycleIds.length ? { snapshot: lifecycleRegistrySnapshot(outputSff), records: temporaryPalettes, removeLifecycleIds: removedTemporaryLifecycleIds } : null;
  const expectedPalettes = paletteArchive || sharedPalette
    ? expectedPaletteContract(paletteArchive, stagedPalettes, paletteShifts, sharedPalette, paletteRgba, { expectAliases: policies.palettes === SHARE, deletedOriginalIds: paletteDeletions.map((entry) => `${entry.sourceGroup},${entry.sourceNumber}`) })
    : paletteSpecifications.map(entry => ({ group: entry.group, number: entry.number, colors: entry.colors, aliasOf: entry.linkTargetEntryId ? (() => { const target = paletteSpecifications.find(item => item.entryId === entry.linkTargetEntryId); return target ? { group: target.group, number: target.number } : null; })() : null }));
  return {
    definitionPath, batchPath, sprmake, sprMake2Available, sprMake2UnavailableReason, mapping, profile, policies, expectedPalettes, outputSff: path.resolve(outputSff), buildOutputSff,
    outputDirectory: path.resolve(outputDirectory), candidateOutputSff: buildOutputSff, targetSnapshot: reviewedTarget,
    specification, specificationPath: specificationArtifact.path, specificationHash: specification.specificationHash,
    receipt, receiptPath: receiptArtifact.path, receiptHash: receipt.receiptHash, receiptArtifactHash: receiptArtifact.byteHash, placeholderLifecycleRegistry,
    reviewedTemporaryPaletteCleanup: temporaryPaletteCleanupContract(reviewedTemporaryPaletteCleanup)
  };
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
  const requestedPolicy = request && typeof request === 'object' ? request.duplicateHandling : null;
  const spritePolicy = requestedPolicy?.sprites ? { value: requestedPolicy.sprites } : await vscode.window.showQuickPick([
    { label: 'Keep identical sprites independent', description: 'Safest: preserve each authored physical entry and its own image data.', value: SEPARATE },
    { label: 'Share identical sprite data', description: 'Smaller SFF: allow SprMaker2 to link identical image data while retaining sprite IDs.', value: SHARE }
  ], { title: 'How should identical sprite images be stored?' });
  if (!spritePolicy) return;
  const palettePolicy = requestedPolicy?.palettes ? { value: requestedPolicy.palettes } : await vscode.window.showQuickPick([
    { label: 'Keep identical palettes independent', description: 'Store each declared palette table separately.', value: SEPARATE },
    { label: 'Link identical palette data', description: 'Preserve palette IDs but allow identical tables to share data.', value: SHARE }
  ], { title: 'How should identical palette tables be stored?' });
  if (!palettePolicy) return;
  try {
    const targetSnapshot = captureTarget(fs, outputUri.fsPath), candidateOutputSff = candidatePath(outputDirectory, outputUri.fsPath);
    const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Generating SprMaker2 build files' }, () => createBuildPackage({ sourceRoot, manifestPath, outputDirectory, outputSff: outputUri.fsPath, candidateOutputSff, targetSnapshot, paletteSourceSff, buildProfile: selectedProfile.profile, duplicateHandling: { sprites: spritePolicy.value, palettes: palettePolicy.value } }));
    const action = await vscode.window.showInformationMessage(`SprMaker2 package created for ${result.mapping.length} sprites using ${result.profile.profileName}.`, 'Open sprmake2.def', 'Open build.cmd');
    if (action === 'Open sprmake2.def') await vscode.window.showTextDocument(vscode.Uri.file(result.definitionPath), { preview: false });
    if (action === 'Open build.cmd') await vscode.window.showTextDocument(vscode.Uri.file(result.batchPath), { preview: false });
    return { ...result, outputSff: outputUri.fsPath, candidateOutputSff, targetSnapshot, outputDirectory };
  } catch (error) {
    vscode.window.showErrorMessage(`SFF package generation failed: ${error.message}`);
  }
}

function stagePrivateSprMakeRun(generated, run) {
  if (generated?.sprMake2Available === false) throw new Error(`${generated.sprMake2UnavailableReason || 'SprMake2 is unavailable for this reviewed package'} Nothing was executed or adopted.`);
  const inputDirectory = path.join(run.directory, 'input');
  fs.mkdirSync(inputDirectory, { recursive: true });
  const packageInputs = path.join(generated.outputDirectory, 'input');
  for (const entry of fs.readdirSync(packageInputs, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    fs.copyFileSync(path.join(packageInputs, entry.name), path.join(inputDirectory, entry.name), fs.constants.COPYFILE_EXCL);
  }
  const definitionPath = path.join(run.directory, 'sprmake2.def');
  const definition = fs.readFileSync(generated.definitionPath, 'utf8')
    .replace(/^filename\s*=.*$/mi, `filename = ${run.candidate}`)
    .replace(/^input\.dir\s*=.*$/mi, `input.dir = ${inputDirectory}`);
  const transport = require('./sff_sprmake2_preservation_transport').preparePreservationTransport(generated.specification, run.directory, definition);
  fs.writeFileSync(definitionPath, transport.definition, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { ...generated, outputDirectory: run.directory, definitionPath, candidateOutputSff: run.candidate, privateRun: run, preservationTransport: transport.contract };
}

function runSprMake(generated, options = {}) {
  if (generated?.sprMake2Available === false) return Promise.reject(new Error(`${generated.sprMake2UnavailableReason || 'SprMake2 is unavailable for this reviewed package'} Nothing was executed or adopted.`));
  return new Promise((resolve, reject) => {
    const child = spawn(generated.sprmake, [generated.definitionPath], { cwd: generated.outputDirectory, windowsHide: true });
    const maxOutputBytes = Number.isSafeInteger(options.maxOutputBytes) && options.maxOutputBytes > 0 ? options.maxOutputBytes : 1024 * 1024;
    const timeoutMs = Number.isSafeInteger(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 120000;
    let output = Buffer.alloc(0), settled = false, timer;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); if (options.signal) options.signal.removeEventListener('abort', abort); error ? reject(error) : resolve(value); };
    const stop = reason => { try { child.kill(); } catch (_) { /* process may already have exited */ } finish(new Error(reason)); };
    const append = data => { const chunk = Buffer.from(data); if (output.length + chunk.length > maxOutputBytes) return stop(`SprMaker2 output exceeded the bounded ${maxOutputBytes}-byte process log limit.`); output = Buffer.concat([output, chunk]); };
    const abort = () => stop('SprMaker2 execution was cancelled.');
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.on('error', error => finish(error));
    timer = setTimeout(() => stop(`SprMaker2 execution exceeded the bounded ${timeoutMs}ms timeout.`), timeoutMs);
    if (options.signal) { if (options.signal.aborted) return abort(); options.signal.addEventListener('abort', abort, { once: true }); }
    child.on('close', (code) => {
      if (settled) return;
      const text = output.toString('utf8');
      if (code !== 0) finish(new Error(`SprMaker2 failed with exit code ${code}. ${text.slice(-2000)}`));
      else if (!fs.existsSync(generated.candidateOutputSff)) finish(new Error(`SprMaker2 reported success but produced no private candidate. Review the generated manifest for unsupported or repeated identities and inspect this output: ${text.slice(-2000) || '(no output)'}`));
      else {
        try {
          require('./sff_sprmake2_preservation_transport').finalizePreservationCandidate(generated.candidateOutputSff, generated.preservationTransport, generated.specification);
          finish(null, text);
        } catch (error) { finish(error); }
      }
    });
  });
}

function sprMake2Compatibility(specification) {
  const occurrences = new Map();
  for (const sprite of specification?.sprites || []) {
    const identity = `${Number(sprite.group)},${Number(sprite.number)}`;
    if (!occurrences.has(identity)) occurrences.set(identity, []);
    occurrences.get(identity).push(sprite.entryId || `physical #${occurrences.get(identity).length}`);
  }
  const repeatedSpriteIdentities = [...occurrences.entries()].filter(([, entries]) => entries.length > 1).map(([identity, entryIds]) => Object.freeze({ identity, entryIds: Object.freeze(entryIds) }));
  const partialAlphaPalettes = (specification?.palettes || []).map(palette => ({
    entryId: palette.entryId, identity: `${palette.group},${palette.number}`,
    indexes: (palette.colors || []).map((color, index) => color?.[3] !== 0 && color?.[3] !== 255 ? index : -1).filter(index => index >= 0)
  })).filter(item => item.indexes.length);
  const spriteDuplicatePolicies = [...new Set((specification?.sprites || []).map(sprite => String(sprite.duplicatePolicy || SEPARATE)))];
  const mixedSpriteDuplicatePolicies = spriteDuplicatePolicies.length > 1;
  const reasons = [
    ...(mixedSpriteDuplicatePolicies ? ['per-sprite identical-data choices require more than SprMake2’s one build-wide sprite.detectduplicates switch'] : []),
    ...repeatedSpriteIdentities.map(item => `sprite identity ${item.identity} occurs ${item.entryIds.length} times`),
    ...partialAlphaPalettes.map(item => `palette ${item.identity} contains ${item.indexes.length} partially transparent color entr${item.indexes.length === 1 ? 'y' : 'ies'} that SprMake2 cannot preserve`)
  ];
  return Object.freeze({ available: reasons.length === 0, reasons: Object.freeze(reasons), mixedSpriteDuplicatePolicies, spriteDuplicatePolicies: Object.freeze(spriteDuplicatePolicies), repeatedSpriteIdentities: Object.freeze(repeatedSpriteIdentities), partialAlphaPalettes: Object.freeze(partialAlphaPalettes.map(item => Object.freeze({ ...item, indexes: Object.freeze(item.indexes) }))) });
}

function reviewedPhysicalBuiltInEligible(generated) {
  return Boolean(generated?.specification?.options?.shared?.reviewedPhysicalSpritePlan && generated?.receipt?.reviewEvidence && generated?.specification && builtInComparisonAvailability(generated).available);
}

async function executeReviewedPhysicalBuiltInBuild(generated, options = {}) {
  if (!reviewedPhysicalBuiltInEligible(generated)) throw new Error('Built-in adoption is available only for an exact reviewed physical SFF Transfer plan inside the sealed writer profile.');
  if (typeof options.confirmAdoption !== 'function') throw new Error('Reviewed built-in SFF adoption requires an explicit post-validation confirmation callback.');
  return withTargetLease(generated.outputSff, async () => {
    const current = captureTarget(fs, generated.outputSff);
    if (!sameTargetSnapshot(current, generated.targetSnapshot)) throw new Error('The target SFF changed after this physical Transfer was reviewed. Nothing was replaced.');
    const run = createPrivateRun(fs, generated.outputSff); let transactionRecovery = null;
    try {
      const candidate = createBuiltInReviewedPhysicalTransferCandidate(generated.specification, { executionRoot: generated.outputDirectory });
      fs.writeFileSync(run.candidate, candidate.bytes, { flag: 'wx', mode: 0o600 });
      const loaded = loadCandidateBytes(fs, run.candidate), verified = verifyLoadedCandidate(fs, loaded, sealedPath => verifyCandidateArchive(sealedPath, generated, { friendly: () => ({ status: 'not-applicable', reason: 'Exact physical Transfer is verified by the independent strict specification validator.' }) }, { compatibilityProfile: 'canonical' }), { directory: run.directory });
      const currentTarget = captureTarget(fs, generated.outputSff);
      if (!sameTargetSnapshot(currentTarget, generated.targetSnapshot)) throw new Error('The target SFF changed while the built-in private candidate was validated. Nothing was replaced.');
      const activeBytes = currentTarget.exists ? fs.readFileSync(generated.outputSff) : Buffer.alloc(0), impact = candidateImpactSummary(activeBytes, verified.bytes), backend = { ...BUILTIN_SFF_REVIEWED_PHYSICAL_TRANSFER_BACKEND, writer: BUILTIN_SFF_V21_PNG8_BACKEND.id };
      if (await options.confirmAdoption({ impact, validation: verified.verification, candidateHash: verified.hash, backend }) !== true) {
        const receipt = writeSffExecutionReceipt(generated, { backend, candidateHash: verified.hash, candidateByteLength: verified.bytes.length, validation: verified.verification, impact, outcome: 'validated-built-in-transfer-adoption-cancelled', adoption: null });
        return { cancelled: true, backend, validation: verified.verification, impact, adoption: null, executionReceiptPath: receipt.path };
      }
      const durableBackup = currentTarget.exists ? (transactionRecovery = require('./sff_transaction_recovery').createTransactionRecovery(currentTarget)) : null;
      const adoption = adoptCandidate(fs, verified, generated.targetSnapshot, sffMutationOptions(generated.outputSff, 'adopt-reviewed-built-in-sff-transfer'));
      if (typeof options.onAdopted === 'function') options.onAdopted({ adoption, durableBackup, candidateHash: verified.hash, backend });
      const finalTarget = captureTarget(fs, generated.outputSff), receipt = writeSffExecutionReceipt(generated, { backend, candidateHash: verified.hash, candidateByteLength: verified.bytes.length, validation: verified.verification, impact, outcome: 'validated-built-in-transfer-adopted', adoption, durableBackup, finalTargetHash: finalTarget.hash });
      const recoveryCleanup = require('./sff_transaction_recovery').completeTransactionRecovery(durableBackup,{targetFilename:generated.outputSff,expectedTargetHash:verified.hash,receiptPath:receipt.path,receiptHash:receipt.byteHash});
      if(!recoveryCleanup.verified)throw Error('The SFF was written, but final verification changed. Recovery retained at '+recoveryCleanup.path);
      return { cancelled: false, backend, validation: verified.verification, impact, adoption, durableBackup, recoveryCleanup, executionReceiptPath: receipt.path };
    } catch(error) { if(transactionRecovery && fs.existsSync(transactionRecovery.directory)) error.message += ' The target may already have changed; inspect it. Temporary transaction recovery retained at '+transactionRecovery.directory+'.'; throw error; } finally { cleanupPrivateRun(fs, run); }
  });
}

async function executeGeneratedBuild(generated, options = {}) {
  if (!generated?.outputSff || !generated?.outputDirectory || !generated?.definitionPath || !generated?.targetSnapshot) throw new Error('The reviewed SFF package is incomplete and cannot be executed safely.');
  const compatibility = sprMake2Compatibility(generated.specification);
  if ((generated.sprMake2Available === false || !compatibility.available) && reviewedPhysicalBuiltInEligible(generated)) return executeReviewedPhysicalBuiltInBuild(generated, options);
  if (generated.sprMake2Available === false) throw new Error(`${generated.sprMake2UnavailableReason || 'SprMake2 is unavailable for this reviewed package'} Nothing was executed or adopted.`);
  if (!compatibility.available) throw new Error(`SprMaker2 cannot safely build this reviewed physical table: ${compatibility.reasons.join('; ')}. Keep the package for the built-in writer path; nothing was executed or adopted.`);
  if (!fs.existsSync(generated.sprmake)) throw new Error(`SprMaker2 was not found: ${generated.sprmake}`);
  return withTargetLease(generated.outputSff, async () => {
    const current = captureTarget(fs, generated.outputSff);
    if (!sameTargetSnapshot(current, generated.targetSnapshot)) throw new Error('The target SFF changed after this package was reviewed. Create a fresh reviewed package; nothing was replaced.');
    if (generated.reviewedTemporaryPaletteCleanup) verifyTemporaryPaletteCleanupReview(generated.outputSff, readSff(generated.outputSff), generated.specification?.options?.shared?.deletedSpriteIdentities || [], generated.reviewedTemporaryPaletteCleanup);
    const run = createPrivateRun(fs, generated.outputSff); let transactionRecovery = null;
    try {
      const execution = stagePrivateSprMakeRun(generated, run), output = await runSprMake(execution);
      fs.writeFileSync(path.join(generated.outputDirectory, 'sprmake2.log'), output, 'utf8');
      const loaded = loadCandidateBytes(fs, execution.candidateOutputSff);
      const verified = verifyLoadedCandidate(fs, loaded, (sealedPath) => verifyCandidateArchive(sealedPath, generated), { directory: run.directory });
      const currentTarget = captureTarget(fs, generated.outputSff);
      if (!sameTargetSnapshot(currentTarget, generated.targetSnapshot)) throw new Error('The target SFF changed while the private candidate was being built. Nothing was replaced.');
      if (generated.reviewedTemporaryPaletteCleanup) verifyTemporaryPaletteCleanupReview(generated.outputSff, readSff(generated.outputSff), generated.specification?.options?.shared?.deletedSpriteIdentities || [], generated.reviewedTemporaryPaletteCleanup);
      const activeBytes = currentTarget.exists ? fs.readFileSync(generated.outputSff) : Buffer.alloc(0), impact = candidateImpactSummary(activeBytes, verified.bytes);
      if (typeof options.confirmAdoption === 'function' && await options.confirmAdoption({ impact, validation: verified.verification, candidateHash: verified.hash }) !== true) {
        const executionReceipt = writeSffExecutionReceipt(generated, { candidateHash: verified.hash, candidateByteLength: verified.bytes.length, validation: verified.verification, impact, outcome: 'validated-adoption-cancelled', adoption: null });
        return { cancelled: true, output, validation: verified.verification, impact, adoption: null, executionReceiptPath: executionReceipt.path };
      }
      const durableBackup = currentTarget.exists ? (transactionRecovery = require('./sff_transaction_recovery').createTransactionRecovery(currentTarget)) : null;
      let adoption;
      if (generated.placeholderLifecycleRegistry) {
        const registry = mergeLifecycleRegistry(generated.outputSff, generated.placeholderLifecycleRegistry.records, { sourceSffHash: verified.hash, specificationHash: generated.specificationHash, removeLifecycleIds: generated.placeholderLifecycleRegistry.removeLifecycleIds });
        adoption = adoptCandidateWithArtifacts(fs, verified, generated.targetSnapshot, [{ snapshot: generated.placeholderLifecycleRegistry.snapshot, content: `${JSON.stringify(registry, null, 2)}\n` }], sffMutationOptions(generated.outputSff, 'adopt-verified-sff-candidate-with-placeholder-lifecycle'));
      } else adoption = adoptCandidate(fs, verified, generated.targetSnapshot, sffMutationOptions(generated.outputSff, 'adopt-verified-sff-candidate'));
      if (typeof options.onAdopted === 'function') options.onAdopted({ adoption, durableBackup, candidateHash: verified.hash });
      const finalTarget = captureTarget(fs, generated.outputSff), executionReceipt = writeSffExecutionReceipt(generated, { candidateHash: verified.hash, candidateByteLength: verified.bytes.length, validation: verified.verification, impact, outcome: 'validated-and-adopted', adoption: Array.isArray(adoption) ? adoption[0] : adoption, durableBackup, finalTargetHash: finalTarget.hash });
      const recoveryCleanup = require('./sff_transaction_recovery').completeTransactionRecovery(durableBackup,{targetFilename:generated.outputSff,expectedTargetHash:verified.hash,receiptPath:executionReceipt.path,receiptHash:executionReceipt.byteHash});
      if(!recoveryCleanup.verified)throw Error('The SFF was written, but final verification changed. Recovery retained at '+recoveryCleanup.path);
      return { cancelled: false, candidateHash: verified.hash, output, validation: verified.verification, impact, adoption, durableBackup, recoveryCleanup, executionReceiptPath: executionReceipt.path };
    } catch(error) { if(transactionRecovery && fs.existsSync(transactionRecovery.directory)) error.message += ' The target may already have changed; inspect it. Temporary transaction recovery retained at '+transactionRecovery.directory+'.'; throw error; } finally { cleanupPrivateRun(fs, run); }
  });
}

async function executeComparedSprMake2Build(generated, options = {}) {
  if (!generated?.outputSff || !generated?.outputDirectory || !generated?.definitionPath || !generated?.targetSnapshot || !generated?.specification) throw new Error('The reviewed SFF package is incomplete and cannot run the dual-writer comparison workflow.');
  const builtInAvailability = builtInComparisonAvailability(generated);
  if (!builtInAvailability.available) throw new Error(`The reviewed package is outside the in-house PNG8 profile: ${builtInAvailability.reasons.join('; ')}. Use the preserved SprMake2 route; nothing was executed or adopted.`);
  if (generated.sprMake2Available === false) throw new Error(`${generated.sprMake2UnavailableReason || 'SprMake2 is unavailable for this reviewed package'} The required comparison could not run, so the active SFF was not updated.`);
  const sprMake2Availability = sprMake2Compatibility(generated.specification);
  if (!sprMake2Availability.available) throw new Error(`SprMaker2 cannot represent this reviewed physical table for the required comparison: ${sprMake2Availability.reasons.join('; ')}. Nothing was executed or adopted.`);
  if (!fs.existsSync(generated.sprmake)) throw new Error(`SprMaker2 was not found: ${generated.sprmake}`);
  if (typeof options.confirmAdoption !== 'function') throw new Error('The compared SprMake2 update requires an explicit post-comparison confirmation callback.');
  return withTargetLease(generated.outputSff, async () => {
    const current = captureTarget(fs, generated.outputSff);
    if (!sameTargetSnapshot(current, generated.targetSnapshot)) throw new Error('The target SFF changed after this package was reviewed. Create a fresh reviewed package; nothing was replaced.');
    if (generated.reviewedTemporaryPaletteCleanup) verifyTemporaryPaletteCleanupReview(generated.outputSff, readSff(generated.outputSff), generated.specification?.options?.shared?.deletedSpriteIdentities || [], generated.reviewedTemporaryPaletteCleanup);
    const run = createPrivateRun(fs, generated.outputSff); let transactionRecovery = null;
    let comparisonArtifact = null;
    try {
      const execution = stagePrivateSprMakeRun(generated, run);

      // Deliberately build the in-house candidate first, before SprMake2 is
      // launched, so pre-release use continuously exercises the new writer.
      const builtInCandidate = createBuiltInPreReleaseCandidate(generated.specification, { executionRoot: execution.outputDirectory });
      const builtInPath = path.join(run.directory, 'candidate-ikemaker-builtin.sff');
      fs.writeFileSync(builtInPath, builtInCandidate.bytes, { flag: 'wx', mode: 0o600 });
      const builtInLoaded = loadCandidateBytes(fs, builtInPath);
      const builtInVerified = verifyLoadedCandidate(fs, builtInLoaded, sealedPath => verifyCandidateArchive(sealedPath, generated, {}, { compatibilityProfile: 'canonical' }), { directory: run.directory });

      const sprMake2Output = await runSprMake(execution);
      fs.writeFileSync(path.join(generated.outputDirectory, 'sprmake2.log'), sprMake2Output, 'utf8');
      const sprMake2Loaded = loadCandidateBytes(fs, execution.candidateOutputSff);
      const sprMake2Verified = verifyLoadedCandidate(fs, sprMake2Loaded, sealedPath => verifyCandidateArchive(sealedPath, generated), { directory: run.directory });

      // SprMake2 remains the authoritative active archive. Retain only the new
      // writer's exact validated result under a backend-labelled filename so it
      // can be tested beside the normal target without creating a redundant
      // SprMake2 sidecar.
      const builtInArtifact = immutableSffCandidateArtifact(generated.outputDirectory, generated.outputSff, 'IKEMaker', builtInVerified.bytes);

      let comparison;
      try {
        comparison = compareSffBackends({
          specification: generated.specification,
          sprMake2CandidateBytes: sprMake2Verified.bytes,
          builtInCandidateBytes: builtInVerified.bytes,
          builtInBackendId: BUILTIN_SFF_V21_PNG8_PRERELEASE_BACKEND.id
        });
      } catch (error) {
        if (error instanceof SffCandidateComparisonError && error.report) {
          const rejected = { ...error.report, createdAt: new Date().toISOString(), buildOrder: [BUILTIN_SFF_V21_PNG8_PRERELEASE_BACKEND.id, 'sprmake2'], builtInTestArtifact: { identity: builtInArtifact.identity, byteHash: builtInArtifact.byteHash, byteLength: builtInArtifact.byteLength }, sprMake2LogTail: String(sprMake2Output || '').slice(-4000) };
          const rejectedHash = sha256(Buffer.from(JSON.stringify(canonicalize(rejected)), 'utf8'));
          comparisonArtifact = immutableJsonArtifact(generated.outputDirectory, 'sff-backend-comparison-rejected', rejectedHash, rejected);
          throw new Error(`${error.message} Report: ${comparisonArtifact.path}`);
        }
        throw error;
      }
      if (comparison.candidates.builtIn.byteHash !== builtInVerified.hash.toLowerCase() || comparison.candidates.sprMake2.byteHash !== sprMake2Verified.hash.toLowerCase()) throw new Error('The compared SFF candidate hashes no longer match the independently verified bytes. Nothing was adopted.');
      const reportContent = { ...comparison, createdAt: new Date().toISOString(), buildOrder: [BUILTIN_SFF_V21_PNG8_PRERELEASE_BACKEND.id, 'sprmake2'], builtInTestArtifact: { identity: builtInArtifact.identity, byteHash: builtInArtifact.byteHash, byteLength: builtInArtifact.byteLength }, sprMake2Target: path.basename(generated.outputSff), builtInValidation: builtInVerified.verification, sprMake2Validation: sprMake2Verified.verification, sprMake2LogTail: String(sprMake2Output || '').slice(-4000) };
      const reportHash = sha256(Buffer.from(JSON.stringify(canonicalize(reportContent)), 'utf8'));
      comparisonArtifact = immutableJsonArtifact(generated.outputDirectory, 'sff-backend-comparison', reportHash, reportContent);

      const currentTarget = captureTarget(fs, generated.outputSff);
      if (!sameTargetSnapshot(currentTarget, generated.targetSnapshot)) throw new Error('The target SFF changed while the two private candidates were being built. Nothing was replaced.');
      if (generated.reviewedTemporaryPaletteCleanup) verifyTemporaryPaletteCleanupReview(generated.outputSff, readSff(generated.outputSff), generated.specification?.options?.shared?.deletedSpriteIdentities || [], generated.reviewedTemporaryPaletteCleanup);
      const activeBytes = currentTarget.exists ? fs.readFileSync(generated.outputSff) : Buffer.alloc(0), impact = candidateImpactSummary(activeBytes, sprMake2Verified.bytes);
      const comparisonEvidence = { status: comparison.status, semanticEquivalent: comparison.semanticEquivalent, byteEquivalent: comparison.byteEquivalent, reportIdentity: path.basename(comparisonArtifact.path), reportByteHash: comparisonArtifact.byteHash, sprMake2CandidateHash: sprMake2Verified.hash.toLowerCase(), builtInCandidateHash: builtInVerified.hash.toLowerCase(), builtInTestIdentity: builtInArtifact.identity, sprMake2TargetIdentity: path.basename(generated.outputSff), buildOrder: reportContent.buildOrder };
      if (await options.confirmAdoption({ impact, validation: sprMake2Verified.verification, comparison, comparisonReportPath: comparisonArtifact.path, builtInTestPath: builtInArtifact.path, sprMake2TargetPath: generated.outputSff, candidateHash: sprMake2Verified.hash }) !== true) {
        const executionReceipt = writeSffExecutionReceipt(generated, { backend: { id: 'sprmake2', comparisonRequired: true, builtInTestIdentity: builtInArtifact.identity }, candidateHash: sprMake2Verified.hash, candidateByteLength: sprMake2Verified.bytes.length, validation: sprMake2Verified.verification, comparison: comparisonEvidence, impact, outcome: 'dual-validated-sprmake2-update-cancelled', adoption: null });
        return { cancelled: true, backend: { id: 'sprmake2' }, comparison, comparisonReportPath: comparisonArtifact.path, builtInTestPath: builtInArtifact.path, sprMake2TargetPath: generated.outputSff, validation: sprMake2Verified.verification, impact, adoption: null, executionReceiptPath: executionReceipt.path };
      }
      const durableBackup = currentTarget.exists ? (transactionRecovery = require('./sff_transaction_recovery').createTransactionRecovery(currentTarget)) : null;
      let adoption;
      if (generated.placeholderLifecycleRegistry) {
        const registry = mergeLifecycleRegistry(generated.outputSff, generated.placeholderLifecycleRegistry.records, { sourceSffHash: sprMake2Verified.hash, specificationHash: generated.specificationHash, removeLifecycleIds: generated.placeholderLifecycleRegistry.removeLifecycleIds });
        adoption = adoptCandidateWithArtifacts(fs, sprMake2Verified, generated.targetSnapshot, [{ snapshot: generated.placeholderLifecycleRegistry.snapshot, content: `${JSON.stringify(registry, null, 2)}\n` }], sffMutationOptions(generated.outputSff, 'adopt-compared-sprmake2-sff-with-placeholder-lifecycle'));
      } else adoption = adoptCandidate(fs, sprMake2Verified, generated.targetSnapshot, sffMutationOptions(generated.outputSff, 'adopt-compared-sprmake2-sff'));
      const finalTarget = captureTarget(fs, generated.outputSff), executionReceipt = writeSffExecutionReceipt(generated, { backend: { id: 'sprmake2', comparisonRequired: true, builtInTestIdentity: builtInArtifact.identity }, candidateHash: sprMake2Verified.hash, candidateByteLength: sprMake2Verified.bytes.length, validation: sprMake2Verified.verification, comparison: comparisonEvidence, impact, outcome: 'dual-validated-sprmake2-adopted', adoption: Array.isArray(adoption) ? adoption[0] : adoption, durableBackup, finalTargetHash: finalTarget.hash });
      const recoveryCleanup = require('./sff_transaction_recovery').completeTransactionRecovery(durableBackup,{targetFilename:generated.outputSff,expectedTargetHash:sprMake2Verified.hash,receiptPath:executionReceipt.path,receiptHash:executionReceipt.byteHash});
      if(!recoveryCleanup.verified)throw Error('The SFF was written, but final verification changed. Recovery retained at '+recoveryCleanup.path);
      return { cancelled: false, backend: { id: 'sprmake2' }, comparison, comparisonReportPath: comparisonArtifact.path, builtInTestPath: builtInArtifact.path, sprMake2TargetPath: generated.outputSff, validation: sprMake2Verified.verification, impact, adoption, durableBackup, recoveryCleanup, executionReceiptPath: executionReceipt.path };
    } catch(error) { if(transactionRecovery && fs.existsSync(transactionRecovery.directory)) error.message += ' The target may already have changed; inspect it. Temporary transaction recovery retained at '+transactionRecovery.directory+'.'; throw error; } finally { cleanupPrivateRun(fs, run); }
  });
}

async function buildApprovedManifest(request = {}) {
  const capabilities = detectCapabilities({ uiKind: vscode.env.uiKind === vscode.UIKind.Web ? 'web' : 'desktop', platform: process.platform, environment: process.env });
  if (!capabilities.nativeBuilders) return vscode.window.showInformationMessage(missingCapabilityMessage('SprMaker2 build execution', capabilities));
  const generated = await generateBuildFiles(request);
  if (!generated) return;
  if (!fs.existsSync(generated.sprmake)) return vscode.window.showErrorMessage(`SprMaker2 was not found: ${generated.sprmake}`);
  const choice = await vscode.window.showWarningMessage('Run SprMaker2 now?', { modal: true, detail: 'The approved manifest has passed validation. Source images will not be modified.' }, 'Build SFF');
  if (choice !== 'Build SFF') return;
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Building SFF with SprMaker2' }, () => executeGeneratedBuild(generated))
    .then(() => vscode.window.showInformationMessage(`SFF created: ${generated.outputSff}`), (error) => vscode.window.showErrorMessage(error.message));
}

function sameTargetSnapshot(left, right) {
  return path.resolve(left?.filename || '') === path.resolve(right?.filename || '')
    && Boolean(left?.exists) === Boolean(right?.exists)
    && String(left?.hash || '').toLowerCase() === String(right?.hash || '').toLowerCase();
}

function builtInComparisonAvailability(generated) {
  const specification = generated?.specification, reasons = [];
  if (!specification) reasons.push('the reviewed specification is missing');
  else {
    const unsupported = specification.sprites.filter(sprite => !((sprite.format === 'png8' && sprite.compression === 'png8' && sprite.colorDepth === 8 && sprite.paletteId) || (sprite.format === 'png24' && sprite.compression === 'png24' && sprite.colorDepth === 24 && !sprite.paletteId) || (sprite.format === 'png32' && sprite.compression === 'png32' && sprite.colorDepth === 32 && !sprite.paletteId)));
    if (unsupported.length) reasons.push(`${unsupported.length} sprite(s) are outside sealed PNG8, PNG24, or PNG32 input`);
    const cropped = specification.sprites.filter(sprite => !['none', 'before-axis', 'after-axis'].includes(sprite.crop?.mode));
    if (cropped.length) reasons.push(`${cropped.length} sprite(s) use a crop mode outside the first built-in profile`);
    const unpreparedAfterAxis = specification.sprites.filter(sprite => sprite.crop?.mode === 'after-axis' && sprite.source?.provenance?.preparation?.kind !== 'after-axis-crop');
    if (unpreparedAfterAxis.length) reasons.push(`${unpreparedAfterAxis.length} after-axis sprite(s) lack a sealed final crop snapshot`);
    if (specification.sprites.some(sprite => sprite.colorDepth === 8) && !specification.palettes.length) reasons.push('indexed sprites have no explicit 256-color palette');
  }
  return Object.freeze({ available: reasons.length === 0, reasons: Object.freeze(reasons) });
}

async function compareGeneratedBuild(generated, options = {}) {
  const capabilities = detectCapabilities({ uiKind: vscode.env.uiKind === vscode.UIKind.Web ? 'web' : 'desktop', platform: process.platform, environment: process.env });
  if (!capabilities.nativeBuilders) return vscode.window.showInformationMessage(missingCapabilityMessage('SFF backend comparison', capabilities));
  if (!fs.existsSync(generated.sprmake)) return vscode.window.showErrorMessage(`SprMaker2 was not found: ${generated.sprmake}`);
  const sprMake2Availability = sprMake2Compatibility(generated.specification);
  if (!sprMake2Availability.available) return vscode.window.showWarningMessage(`SprMaker2 cannot safely build this reviewed physical table: ${sprMake2Availability.reasons.join('; ')}. Compare Both was not started and neither backend was adopted.`);
  const availability = builtInComparisonAvailability(generated);
  if (!availability.available) {
    return vscode.window.showWarningMessage(`This reviewed package is outside the first built-in comparison profile: ${availability.reasons.join('; ')}. The unchanged SprMaker2 package remains available.`);
  }
  if (options.confirm !== false) {
    const choice = await vscode.window.showWarningMessage('Compare SprMaker2 with IKEMaker Built-in?', { modal: true, detail: 'Both backends will build isolated candidates from the same reviewed snapshots. Both candidates are strictly validated and then discarded. The active SFF cannot be adopted by this action.' }, 'Compare Both');
    if (choice !== 'Compare Both') return;
  }

  let reportPath = '';
  try {
    const report = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Comparing isolated SprMaker2 and IKEMaker SFF candidates' }, () =>
      withTargetLease(generated.outputSff, async () => {
        if (!sameTargetSnapshot(captureTarget(fs, generated.outputSff), generated.targetSnapshot)) throw new Error('The active SFF changed after the comparison specification was reviewed. Generate a fresh comparison package.');
        const run = createPrivateRun(fs, generated.outputSff);
        try {
          const execution = stagePrivateSprMakeRun(generated, run);
          const output = await runSprMake(execution);
          const sprMake2 = loadCandidateBytes(fs, execution.candidateOutputSff);
          const result = compareSffBackends({
            specification: generated.specification,
            sprMake2CandidateBytes: sprMake2.bytes,
            builtInOptions: { executionRoot: execution.outputDirectory }
          });
          if (!sameTargetSnapshot(captureTarget(fs, generated.outputSff), generated.targetSnapshot)) throw new Error('The active SFF changed during comparison. The comparison report was not accepted.');
          const reportContent = { ...result, createdAt: new Date().toISOString(), sprMake2LogTail: String(output || '').slice(-4000) };
          const reportHash = sha256(Buffer.from(JSON.stringify(canonicalize(reportContent)), 'utf8'));
          reportPath = immutableJsonArtifact(generated.outputDirectory, 'sff-backend-comparison', reportHash, reportContent).path;
          return result;
        } finally {
          cleanupPrivateRun(fs, run);
        }
      })
    );
    const action = await vscode.window.showInformationMessage(
      `SFF backends are semantically equivalent.${report.byteEquivalent ? ' Candidate bytes are also identical.' : ' Candidate bytes differ, which is allowed.'} Neither candidate was adopted.`,
      'Open comparison report'
    );
    if (action === 'Open comparison report' && reportPath) {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(reportPath));
      await vscode.window.showTextDocument(document, { preview: false });
    }
    return { report, reportPath };
  } catch (error) {
    if (error instanceof SffCandidateComparisonError && error.report) {
      const reportHash = sha256(Buffer.from(JSON.stringify(canonicalize(error.report)), 'utf8'));
      reportPath = immutableJsonArtifact(generated.outputDirectory, 'sff-backend-comparison-rejected', reportHash, error.report).path;
    }
    return vscode.window.showErrorMessage(`${error.message}${reportPath ? ` Report: ${reportPath}` : ''}`);
  }
}

async function compareSprMake2WithBuiltIn(request = {}) {
  const generated = await generateBuildFiles({ ...(request && typeof request === 'object' ? request : {}), duplicateHandling: { sprites: SEPARATE, palettes: SEPARATE } });
  if (!generated) return;
  return compareGeneratedBuild(generated);
}

async function cropSffArchive(uri, request = {}) {
  let filename = uri?.fsPath || uri?.path;
  if (!filename || !fs.existsSync(filename)) filename = await pickFile('Choose the SFF to crop', { 'SFF archive': ['sff'] });
  if (!filename) return;
  const capabilities = detectCapabilities({ uiKind: vscode.env.uiKind === vscode.UIKind.Web ? 'web' : 'desktop', platform: process.platform, environment: process.env });
  if (!capabilities.nativeBuilders) return vscode.window.showInformationMessage(missingCapabilityMessage('SFF archive crop', capabilities));
  const archive = readSff(filename), current = archive.sprites[Number.isInteger(Number(request.selectedIndex)) ? Number(request.selectedIndex) : 0];
  if (!current) return vscode.window.showWarningMessage('The selected SFF contains no sprites to crop.');
  const scope = await chooseSffBatchScope(archive, request, 'Crop transparent borders in which SFF sprites?');
  if (!scope) return;
  const identities = scope.identities;
  const manifestPath = await pickFile('Choose the authoritative SprMaker2 source manifest', { 'CSV manifest': ['csv'] }); if (!manifestPath) return;
  const selectedProfile = await chooseProjectBuildProfile(manifestPath); if (!selectedProfile) return;
  const sourceRoot = await pickFolder('Choose the uncropped source sprite folder'); if (!sourceRoot) return;
  const approved = new Set(readManifest(manifestPath).map((row) => `${Number(row.ComputedGroup ?? row.Group ?? row.BaseGroup)},${Number(row.ImageIndex ?? row.Index)}`));
  const missing = identities.filter((identity) => !approved.has(identity));
  if (missing.length) return vscode.window.showErrorMessage(`Crop is blocked: ${missing.length} selected sprite(s) are absent from the authoritative manifest. No file was changed.`);
  const answer = await vscode.window.showWarningMessage(`Crop ${identities.length} sprite(s) and rebuild ${path.basename(filename)}?`, { modal: true, detail: 'SprMaker2 will crop only this scope, adjust its axes, preserve the current embedded palette table, and rebuild from reviewed uncropped sources. The current SFF is replaced only after the new archive succeeds.' }, 'Crop and Rebuild');
  if (answer !== 'Crop and Rebuild') return;
  try {
    const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Cropping ${identities.length} SFF sprite(s)` }, () =>
      withTargetLease(filename, async () => {
        const run = createPrivateRun(fs, filename);
        try {
          const currentArchive = readSff(filename);
          if (sffBatchScope.archiveFingerprint(currentArchive) !== scope.sourceFingerprint) throw new Error('The SFF changed after the batch scope was reviewed. Reopen the action; no file was changed.');
          const targetSnapshot = { filename: path.resolve(filename), exists: true, hash: hash(currentArchive.buffer) };
          const plan = await createBuildPackage({ sourceRoot, manifestPath, outputDirectory: run.directory, outputSff: filename, candidateOutputSff: run.candidate, targetSnapshot, paletteSourceSff: filename, buildProfile: selectedProfile.profile, autocropIdentities: identities, manifestScopeIdentities: identities, includeStagedPalettes: false, batchScope: scope });
          await runSprMake({ ...plan, outputDirectory: run.directory, candidateOutputSff: run.candidate });
          const loaded = loadCandidateBytes(fs, run.candidate);
          const verified = verifyLoadedCandidate(fs, loaded, (sealedPath) =>
            verifyCandidateArchive(sealedPath, plan), { directory: run.directory });
          return adoptCandidate(fs, verified, targetSnapshot, sffMutationOptions(filename, `sff-autocrop-${scope.mode}-${scope.resolutionHash.slice(0, 12)}`));
        } finally {
          cleanupPrivateRun(fs, run);
        }
      })
    );
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
  require('./sff_private_storage').register(context);
  assetWorkSets = new AssetWorkSets(context.workspaceState, vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || process.cwd());
  context.subscriptions.push(
    vscode.commands.registerCommand('sff.generateBuildFiles', generateBuildFiles),
    vscode.commands.registerCommand('sff.buildApprovedManifest', buildApprovedManifest),
    vscode.commands.registerCommand('sff.compareSprMake2WithBuiltIn', compareSprMake2WithBuiltIn),
    vscode.commands.registerCommand('sff.cropArchive', cropSffArchive),
    vscode.commands.registerCommand('sff.suggestAxes', suggestSffAxes),
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

module.exports = { registerSffCommands, createBuildPackage, executeGeneratedBuild, executeReviewedPhysicalBuiltInBuild, reviewedPhysicalBuiltInEligible, executeComparedSprMake2Build, runSprMake, sprMake2Compatibility, normalizeSprMake2IndexedPng, candidateImpactSummary, writeSffExecutionReceipt, cropSffArchive, suggestSffAxes, chooseSffBatchScope, resolveStagedPalettes, expectedPaletteContract, spriteSharingKey, readManifest, writeManifest, projectProfiles, stagePrivateSprMakeRun, verifyCandidateArchive, validateExistingSprMake2Output, builtInComparisonAvailability, compareGeneratedBuild, compareSprMake2WithBuiltIn };
