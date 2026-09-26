'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const vscode = require('vscode');
const migration = require('./engine_migration');
const updateModel = require('./engine_update_model');
const engineModel = require('./engine_registry_model');
const registryModel = require('./project_registry');
const management = require('./project_management_model');
const projectContext = require('./project_context_ui');
const contextModel = require('./project_context_model');
const characterContext = require('./character_context');
const engineRuntime = require('./engine_runtime');
const mutationSafety = require('./mutation_safety');
const { ENGINE_CATALOG_KEY, BUILT_IN_ENGINE_CATALOG } = require('./updater');
// The only raw writes here create notified OS-temp staging after the user has
// approved this one migration. Durable writes are delegated to reviewed paths.
const WRITE_AUTHORITY = 'explicit-engine-migration-approval';
const BACKUP_ROOTS_KEY = 'ikemenZss.engineMigrationBackupRoots.v1';

function fingerprint(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function selectedContext(payload = {}) {
  const uri = projectContext.activeUri(), contextRoot = payload.root || projectContext.contextRoot(uri) || projectContext.workspaceRoot(uri);
  if (!contextRoot) return null;
  const root = characterContext.gameRoot(contextRoot) || contextRoot;
  const loaded = projectContext.readRegistry(root);
  let project = loaded.registry.projects.find((item) => item.id === payload.projectId);
  if (!project && uri?.fsPath) project = contextModel.contextFor(uri.fsPath, root, loaded.registry).project;
  return { root, loaded, registryHash: loaded.exists ? mutationSafety.hash(fs.readFileSync(loaded.filename)) : null, project: project || loaded.registry.projects.find((item) => item.id !== 'universal') || loaded.registry.projects[0] };
}
function affectedProjects(registry, registryFile, engineRoot, currentTarget) {
  void registryFile; void engineRoot; void currentTarget;
  // Every non-universal game profile in this authoritative game registry uses
  // the in-place runtime being replaced. Authored roots describe content, not a
  // separate executable; stale/different pins must therefore move or block too.
  return registry.projects.filter((project) => project.id !== 'universal');
}
async function chooseBackupRoot(root) {
  const suggested = path.join(path.dirname(root), 'IKEMaker Engine Backups');
  const picked = await vscode.window.showOpenDialog({ title: 'Choose the folder that will hold the full 1.0 engine backup and recovery journal', defaultUri: vscode.Uri.file(suggested), canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel: 'Use Backup Folder' });
  return picked?.[0]?.fsPath || '';
}
function candidateTarget(build, installed) { return engineModel.targetFromBuild(build, installed); }
function detailText(project, current, candidate, risk, affected) {
  return [`Project: ${project.name}`, `Current: ${current.version} · ${current.channel} · ${(current.commit || 'unknown').slice(0, 12)}`, `Candidate: ${candidate.channel || 'custom'} · ${candidate.commit.slice(0, 12)} · release ${candidate.releaseId || 'not declared'} · asset ${candidate.assetId || candidate.workflowArtifactId || 'local'}`, `Risk: ${risk.summary}`, `Shared-root projects affected: ${affected.length || 1}`,
    '', 'Approval covers this one migration only:', '• temporary download/extraction in the OS temporary folder', '• full engine-distribution + active config/registry backup outside the game', '• an external write-ahead journal and migration lock', '• format-aware config additions/renames with unknown keys preserved', '• replacement only of allowlisted engine-owned files', '• exact local hashes, project target update, and rollback if any step fails', '', 'Characters, stages, sounds, saves (except config), motifs, palettes, and unrelated files are excluded from replacement.'].join('\n');
}
function retainedDetail(review) {
  const basis = review.reviewedBinding
    ? `Reviewed binding: exact commit and ZIP SHA-256 match IKEMaker's bundled review record.`
    : `Review status: NOT independently reviewed by this IKEMaker build. The manifest's own verification labels are ignored.`;
  return [`Retained exact IKEMEN build · ${(review.candidate.commit || '').slice(0, 12)}`, `ZIP SHA-256: ${review.artifactSha256}`, `File: ${review.zipPath}`, basis,
    '', 'This is a pinned local artifact, not the newest Nightly. The rolling Nightly may now be different.', 'Runtime, gameplay, online, and rollback behavior remain unknown until tested. Future automatic upgrades are not enabled.'].join('\n');
}

function registerEngineMigration(context) {
  async function checkInterrupted() {
    for (const backupRoot of context.globalState.get(BACKUP_ROOTS_KEY, [])) {
      for (const pending of migration.pendingMigrations(backupRoot)) {
        const journalFile = path.join(backupRoot, '.migration-state', `${pending.migrationId}.json`);
        const action = await vscode.window.showWarningMessage(`An interrupted IKEMEN engine migration was detected (${pending.state}). The live engine will not be changed automatically.`, { modal: true, detail: `Engine: ${pending.root}\nJournal: ${journalFile}\nBackup: ${pending.backup || 'not completed'}\n\nRecovery hash-checks every installed file and stops rather than erasing later user changes.` }, 'Recover previous engine', 'Open recovery folder');
        if (action === 'Open recovery folder') await vscode.env.openExternal(vscode.Uri.file(path.dirname(journalFile)));
        if (action === 'Recover previous engine') {
          try {
            migration.recoverPendingMigration(journalFile);
            if (pending.oldInstalledRegistry) await context.globalState.update(engineRuntime.INSTALLED_ENGINE_KEY, pending.oldInstalledRegistry);
            if (pending.oldCatalog) await context.globalState.update(ENGINE_CATALOG_KEY, pending.oldCatalog);
            vscode.window.showInformationMessage('The interrupted engine migration was restored from its verified backup.');
          } catch (error) { vscode.window.showErrorMessage(`Automatic recovery stopped safely: ${error.message}`); }
        }
      }
    }
  }
  async function reviewAndInstall(payload = {}) {
    const selected = selectedContext(payload); if (!selected?.project) return vscode.window.showWarningMessage('Open or select a game project before reviewing an engine migration.');
    if (!selected.loaded.exists) return vscode.window.showWarningMessage('Create and save a game project profile before migrating its engine. Opening or reviewing a project never creates metadata automatically.');
    const retainedReview = payload.retainedReview || null;
    const current = engineModel.normalizeTarget(selected.project.engineTarget), candidate = retainedReview?.candidate || payload.candidate || await migration.resolveExactNightly();
    if (!retainedReview) {
      const fresh = await migration.resolveExactNightly();
      if (!migration.sameCandidate(candidate, fresh)) return vscode.window.showWarningMessage(`The Nightly moved to ${fresh.commit.slice(0, 12)}. No files were written. Run the review again for the new exact build.`);
    }
    if (candidate.commit === current.commit) return vscode.window.showInformationMessage(`${selected.project.name} already targets this exact Nightly commit.`);
    const affected = affectedProjects(selected.loaded.registry, selected.loaded.filename, selected.root, current);
    const risk = payload.risk || updateModel.riskAssessment({ candidate, sharedProjects: affected.length, projectMaturity: 'early', semanticChanges: ['Nightly default/behavior delta'], configMigrations: migration.CONFIG_MAPPINGS, onlineChanges: ['Rollback/network changes require matched-peer testing.'], runtimeSurface: ['Collision/corner-push/runtime changes require focused gameplay testing.'] });
    if (retainedReview && !retainedReview.reviewedBinding) {
      const override = await vscode.window.showWarningMessage('This retained IKEMEN build has no matching independent review record.', { modal: true, detail: `${retainedDetail(retainedReview)}\n\nYou may install any exact version, but this override does not bypass archive validation, protected-content rules, full backup, journaling, rollback, or live-change checks.`, }, 'I understand — continue with unreviewed build');
      if (override !== 'I understand — continue with unreviewed build') return;
    }
    const approved = await vscode.window.showWarningMessage(retainedReview ? 'Review retained exact IKEMEN build migration' : 'Review exact IKEMEN Nightly migration', { modal: true, detail: `${retainedReview ? `${retainedDetail(retainedReview)}\n\n` : ''}${detailText(selected.project, current, candidate, risk, affected)}` }, 'Approve this backup and migration');
    if (approved !== 'Approve this backup and migration') return;
    const backupRoot = await chooseBackupRoot(selected.root); if (!backupRoot) return;
    const knownBackupRoots = [...new Set([...context.globalState.get(BACKUP_ROOTS_KEY, []), backupRoot])]; await context.globalState.update(BACKUP_ROOTS_KEY, knownBackupRoots);
    if (affected.length > 1) {
      const shared = await vscode.window.showWarningMessage(`This engine root is shared by ${affected.length} project profiles: ${affected.map((item) => item.name).join(', ')}. They must move together or use a side-by-side engine.`, { modal: true }, 'Move all listed profiles', 'Cancel');
      if (shared !== 'Move all listed profiles') return;
    }
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-engine-migration-'));
    vscode.window.showInformationMessage('IKEMaker is creating notified temporary staging data. The game remains unchanged until validation and backup complete.');
    let applied = null;
    try {
      const downloaded = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: retainedReview ? 'Copying and re-verifying retained exact IKEMEN build' : 'Downloading and verifying exact IKEMEN Nightly', cancellable: false }, () => migration.acquireCandidate(candidate, staging, retainedReview));
      const existingCatalog = engineModel.normalizeCatalog(context.globalState.get(ENGINE_CATALOG_KEY, BUILT_IN_ENGINE_CATALOG));
      const existingIdentity = existingCatalog.builds.find((item) => item.id === downloaded.id);
      if (existingIdentity) {
        const incomingRepository = String(downloaded.provenance?.repository || '').toLowerCase(), existingRepository = String(existingIdentity.provenance?.repository || '').toLowerCase();
        if (existingIdentity.commit !== downloaded.commit || existingIdentity.artifactSha256 !== downloaded.artifactSha256 || existingRepository !== incomingRepository) throw new Error('The exact build ID already belongs to different immutable engine bytes or provenance. Existing catalog evidence was left unchanged.');
      }
      const entries = migration.inspectZip(downloaded.zipPath), stripRoot = migration.commonArchiveRoot(entries), checked = updateModel.validateArchiveEntries(entries, { stripRoot });
      if (!checked.valid) throw new Error(`Archive validation failed:\n${checked.issues.slice(0, 10).join('\n')}`);
      const extracted = path.join(staging, 'extracted'); migration.extractZip(downloaded.zipPath, extracted); const stagedRoot = stripRoot ? path.join(extracted, stripRoot) : extracted;
      if (current.channel !== 'stable' || current.version !== '1.0.0') throw new Error('Safe in-place replacement currently requires the authenticated 1.0.0 baseline. Install other Nightly-to-Nightly moves side-by-side until their original package is retained.');
      const baselineCandidate = await migration.resolveExactRelease('v1.0.0'), baselineDownload = await migration.downloadCandidate(baselineCandidate, path.join(staging, 'baseline-package'), migration.requestBuffer, () => migration.resolveExactRelease('v1.0.0'));
      const baselineEntries = migration.inspectZip(baselineDownload.zipPath), baselineStrip = migration.commonArchiveRoot(baselineEntries), baselineChecked = updateModel.validateArchiveEntries(baselineEntries, { stripRoot: baselineStrip });
      if (!baselineChecked.valid) throw new Error(`Stable baseline archive validation failed:\n${baselineChecked.issues.slice(0, 10).join('\n')}`);
      const baselineExtracted = path.join(staging, 'baseline-extracted'); migration.extractZip(baselineDownload.zipPath, baselineExtracted); const baselineRoot = baselineStrip ? path.join(baselineExtracted, baselineStrip) : baselineExtracted;
      const classified = migration.classifyLocalFiles(selected.root, baselineRoot, stagedRoot, checked.accepted), obsolete = migration.classifyObsoleteFiles(selected.root, baselineRoot, stagedRoot, baselineChecked.accepted, checked.accepted), preservedOverrides = [...classified.preserve, ...obsolete.preserve];
      checked.accepted = [...classified.install];
      if (classified.conflicts.length) {
        const conflictNames = classified.conflicts.map((item) => item.relative).join('\n');
        const resolution = await vscode.window.showWarningMessage(`${classified.conflicts.length} engine file(s) changed both locally and in the selected build.`, { modal: true, detail: `${conflictNames}\n\nPreserve records a custom build target and keeps these project overrides. Use selected build replaces them only after the complete 1.0 backup is made. Cancel changes nothing.` }, 'Preserve local overrides', 'Use selected build versions');
        if (!resolution) return;
        if (resolution === 'Preserve local overrides') preservedOverrides.push(...classified.conflicts); else checked.accepted.push(...classified.conflicts);
      }
      const oldConfig = path.join(selected.root, 'save', 'config.ini'), newConfig = path.join(stagedRoot, 'save', 'config.ini');
      let configPlan = { supported: true, changes: [], additions: [], conflicts: [] };
      if (fs.existsSync(oldConfig) && fs.existsSync(newConfig)) configPlan = updateModel.configMigrationPlan(fs.readFileSync(oldConfig, 'utf8'), fs.readFileSync(newConfig, 'utf8'), migration.CONFIG_MAPPINGS);
      if (!configPlan.supported) throw new Error(`Configuration migration has ${configPlan.conflicts.length} unresolved conflict(s). No engine files were changed.`);
      if (fs.existsSync(oldConfig) && fs.existsSync(newConfig)) {
        const merged = migration.applyConfigMappings(fs.readFileSync(oldConfig, 'utf8'), configPlan); fs.writeFileSync(newConfig, merged);
        checked.accepted.push({ path: `${stripRoot ? `${stripRoot}/` : ''}save/config.ini`, relative: 'save/config.ini', type: 'file', length: Buffer.byteLength(merged), liveHash: migration.sha256File(oldConfig), candidateHash: migration.sha256File(newConfig) });
      }
      const finalReview = await vscode.window.showWarningMessage(`Validated ${checked.accepted.length} engine/config file(s). ${obsolete.safeRemove.length} unmodified obsolete engine file(s) will be removed after backup. ${checked.protectedEntries.length} protected content file(s) will not be installed. ${preservedOverrides.length} local override(s) will be preserved and recorded. Config plan: ${configPlan.changes.length} rename(s), ${configPlan.additions.length} new default(s), ${configPlan.conflicts.length} conflict(s).`, { modal: true, detail: `Selected build artifact SHA-256: ${downloaded.artifactSha256}\nStable baseline SHA-256: ${baselineDownload.artifactSha256}\nBackup: ${backupRoot}\nProject registry: ${selected.loaded.filename}\nObsolete files to remove: ${obsolete.safeRemove.map((item) => item.relative).join(', ') || 'none'}\nPreserved overrides: ${preservedOverrides.map((item) => item.relative).join(', ') || 'none'}\n\nThis is the final approval before the live engine folder is changed.` }, 'Apply validated migration');
      if (finalReview !== 'Apply validated migration') return;
      if (!fs.existsSync(selected.loaded.filename) || mutationSafety.hash(fs.readFileSync(selected.loaded.filename)) !== selected.registryHash) throw new Error('The project registry changed after review. No engine file was changed; reopen the migration review.');
      const oldInstalledRegistry = context.globalState.get(engineRuntime.INSTALLED_ENGINE_KEY, {}), oldCatalog = context.globalState.get(ENGINE_CATALOG_KEY, BUILT_IN_ENGINE_CATALOG);
      applied = migration.executeMigration({ root: selected.root, stagedRoot, accepted: checked.accepted, removals: obsolete.safeRemove, backupRoot, candidate: downloaded, registryFile: selected.loaded.filename, oldTarget: current, oldInstalledRegistry, oldCatalog });
      const executable = path.join(selected.root, 'Ikemen_GO.exe'), executableSha256 = migration.sha256File(executable), identityStatus = downloaded.artifactIdentityStatus || (downloaded.publishedArtifactSha256 ? 'verified' : 'user-asserted');
      const patchRecords = preservedOverrides.map((item) => ({ relative: item.relative, liveHash: item.liveHash || null, candidateHash: item.candidateHash || null })).sort((a, b) => a.relative.localeCompare(b.relative));
      const patchNames = patchRecords.map((item) => item.relative), customSuffix = patchRecords.length ? crypto.createHash('sha256').update(JSON.stringify(patchRecords)).digest('hex') : '';
      const officialRepository = String(downloaded.provenance?.repository || '').toLowerCase() === 'ikemen-engine/ikemen-go', customBuild = !officialRepository || Boolean(customSuffix);
      const build = engineModel.normalizeBuild({ ...downloaded, id: customSuffix ? `${downloaded.id}-custom-${customSuffix}` : downloaded.id, channel: customBuild ? 'custom' : 'nightly', baseBuildId: customSuffix ? downloaded.id : '', patches: patchNames,
        executableSha256, monitorOnly: false, verification: { source: identityStatus === 'verified' ? 'verified' : 'user-asserted', artifact: identityStatus === 'verified' ? 'verified' : 'limited', parser: 'unknown', runtime: 'unknown', rollback: 'unknown', project: 'unknown' }, source: { sourceId: !officialRepository ? 'unsupported-custom-fork' : downloaded.retainedArtifact ? 'retained-local-artifact' : 'github-nightly-release', url: downloaded.releaseUrl, revision: downloaded.commit, observedAt: new Date().toISOString(), futureAutomaticUpgradeAuthorized: false } });
      let installedRegistry = engineModel.registerInstalled(oldInstalledRegistry, { buildId: engineModel.STABLE_BUILD_ID, executable: path.join(applied.backup, 'Ikemen_GO.exe'), root: applied.backup, executableSha256: migration.sha256File(path.join(applied.backup, 'Ikemen_GO.exe')), artifactSha256: baselineDownload.artifactSha256, identityStatus: 'verified', registeredAt: new Date().toISOString(), verifiedAt: new Date().toISOString() });
      installedRegistry = engineModel.registerInstalled(installedRegistry, { buildId: build.id, executable, root: selected.root, executableSha256, artifactSha256: downloaded.artifactSha256, identityStatus, registeredAt: new Date().toISOString(), verifiedAt: identityStatus === 'verified' ? new Date().toISOString() : null });
      const local = installedRegistry.builds.find((item) => item.buildId === build.id && item.executableSha256 === executableSha256);
      const catalog = engineModel.normalizeCatalog(context.globalState.get(ENGINE_CATALOG_KEY, BUILT_IN_ENGINE_CATALOG)); catalog.builds = catalog.builds.filter((item) => item.id !== build.id); catalog.builds.push(build); catalog.catalogRevision += 1; catalog.generatedAt = new Date().toISOString();
      let nextRegistry = selected.loaded.registry;
      for (const project of affected.length ? affected : [selected.project]) {
        let review = engineModel.adoptionReview(project, candidateTarget(build, local), catalog, installedRegistry, { allowUserAsserted: identityStatus !== 'verified' }); if (review.blockers.length) throw new Error(review.blockers.join(' '));
        const adopted = engineModel.adoptProject(project, review, { catalogRevision: catalog.catalogRevision, migrationRecord: applied.journalFile, verificationSummary: 'Exact artifact and executable hashes recorded; runtime/gameplay/rollback remain unverified until project testing.' });
        nextRegistry = management.updateGame(nextRegistry, project.id, adopted);
      }
      const serializedRegistry = `${JSON.stringify(nextRegistry, null, 2)}\n`;
      migration.prepareRegistryWrite(applied, serializedRegistry);
      projectContext.writeRegistry(selected.loaded.filename, nextRegistry, 'adopt-installed-nightly', selected.registryHash);
      migration.recordRegistryWrite(applied);
      await context.globalState.update(engineRuntime.INSTALLED_ENGINE_KEY, installedRegistry); await context.globalState.update(ENGINE_CATALOG_KEY, catalog);
      migration.finalizeMigration(applied, { newTarget: candidateTarget(build, local) });
      return vscode.window.showInformationMessage(`Installed and pinned ${officialRepository ? 'exact IKEMEN build' : 'unsupported custom IKEMEN build'} ${build.commit.slice(0, 12)}. The 1.0 backup is at ${applied.backup}. Runtime, gameplay, and online compatibility still require testing.`);
    } catch (error) {
      if (applied) { try { migration.markRegistryFailure(applied, error); migration.rollbackMigration(applied); if (applied.journal.oldInstalledRegistry) await context.globalState.update(engineRuntime.INSTALLED_ENGINE_KEY, applied.journal.oldInstalledRegistry); if (applied.journal.oldCatalog) await context.globalState.update(ENGINE_CATALOG_KEY, applied.journal.oldCatalog); } catch (rollbackError) { return vscode.window.showErrorMessage(`Migration failed: ${error.message}. Automatic rollback stopped: ${rollbackError.message}. Use the external journal and backup; no conflicting file was erased.`); } }
      return vscode.window.showErrorMessage(`IKEMEN build migration stopped safely: ${error.message}${applied ? ' The engine files were rolled back.' : ' The live engine folder was not changed.'}`);
    } finally { try { fs.rmSync(staging, { recursive: true, force: true }); } catch (_) {} }
  }
  async function installRetained(payload = {}) {
    try {
      const manifestPick = await vscode.window.showOpenDialog({ title: 'Choose retained IKEMEN artifact manifest', canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { 'IKEMaker artifact manifest': ['json'] }, openLabel: 'Choose Manifest' });
      if (!manifestPick?.[0]) return;
      const zipPick = await vscode.window.showOpenDialog({ title: 'Choose the exact retained IKEMEN ZIP named by the manifest', defaultUri: vscode.Uri.file(path.dirname(manifestPick[0].fsPath)), canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { 'IKEMEN ZIP package': ['zip'] }, openLabel: 'Choose ZIP' });
      if (!zipPick?.[0]) return;
      const bindingFile = path.join(__dirname, '..', 'data', 'reviewed-engine-artifacts.json');
      const bindings = JSON.parse(fs.readFileSync(bindingFile, 'utf8')).artifacts || [];
      const retainedReview = migration.parseRetainedArtifact(manifestPick[0].fsPath, zipPick[0].fsPath, bindings);
      return reviewAndInstall({ ...payload, retainedReview });
    } catch (error) { return vscode.window.showErrorMessage(`Retained IKEMEN build was not accepted: ${error.message} No project or engine files were changed.`); }
  }
  context.subscriptions.push(vscode.commands.registerCommand('ikemen.engineMigration.review', reviewAndInstall));
  context.subscriptions.push(vscode.commands.registerCommand('ikemen.engineMigration.installRetained', installRetained));
  setTimeout(() => checkInterrupted().catch((error) => vscode.window.showErrorMessage(`IKEMaker could not check interrupted engine migrations: ${error.message}`)), 3500);
}

module.exports = { WRITE_AUTHORITY, BACKUP_ROOTS_KEY, fingerprint, affectedProjects, detailText, retainedDetail, registerEngineMigration };
