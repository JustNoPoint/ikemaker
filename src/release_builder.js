'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { runtimeCopyAllowed, nestedGame } = require('./runtime_copy_policy');
const { transactionalWriteSet } = require('./mutation_safety');
const { createBuildPackage } = require('./sff_commands');
const { normalizeProfile: normalizeSffProfile } = require('./sff_build_profile');
const { detectCapabilities, missingCapabilityMessage } = require('./platform_capabilities');

const PROFILE_RELATIVE = '.ikemen/release/JNP-release-profile.json';
const SNAPSHOT_RELATIVE = '.ikemen/release/defaults/JNP';
const INSTALLED_UPDATE_MANIFEST = 'IKEMEN-UPDATE-MANIFEST.json';

function slash(value) { return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+|\/+$/g, ''); }
function hash(content) { return crypto.createHash('sha256').update(content).digest('hex'); }
function inside(root, candidate) { const relative = path.relative(path.resolve(root), path.resolve(candidate)); return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)); }
function exists(filename) { try { return fs.existsSync(filename); } catch (_) { return false; } }
function safeRelative(value) { const clean = slash(value); if (!clean || clean === '.' || clean.startsWith('../') || path.isAbsolute(clean)) throw new Error(`Unsafe project-relative path: ${value}`); return clean; }

function updateTemplate(prior = null) {
  return {
    enabled: prior?.enabled === true,
    productId: prior?.productId || 'hdbz',
    displayName: prior?.displayName || 'Hyper Dragon Ball Z',
    version: prior?.version || '0.0.0',
    channel: prior?.channel || 'stable',
    manifestUrl: prior?.manifestUrl || 'https://example.invalid/hdbz/update-manifest.json',
    mirrors: prior?.mirrors || [],
    createFullZip: prior?.createFullZip !== false,
    maximumAssetBytes: Number(prior?.maximumAssetBytes) || 2147483648,
    previousManifest: prior?.previousManifest || '',
    preserve: prior?.preserve || ['save/**', 'screenshots/**', 'recordings/**', 'replays/**'],
    note: 'Disabled by default. Configure and review before public distribution. Unknown files are preserved; only exact previously managed paths may become removals.'
  };
}

function findGameRoot(start) {
  let current = path.resolve(start || '.');
  if (exists(current) && fs.statSync(current).isFile()) current = path.dirname(current);
  while (true) {
    if (exists(path.join(current, 'Ikemen_GO.exe')) || (exists(path.join(current, 'save', 'config.ini')) && exists(path.join(current, 'data')))) return current;
    const parent = path.dirname(current); if (parent === current) return '';
    current = parent;
  }
}

function matcher(pattern) {
  if (pattern === '**' || pattern === '**/*') return /^.*$/i;
  const source = slash(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*');
  return new RegExp(`^${source}(?:/.*)?$`, 'i');
}
function matches(relative, patterns) { const value = slash(relative); return (patterns || []).some((pattern) => matcher(pattern).test(value)); }

function walkFiles(root, options = {}) {
  const output = [], excluded = options.exclude || [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name), relative = slash(path.relative(root, full));
      if (!runtimeCopyAllowed(relative) || matches(relative, excluded) || (entry.isDirectory() && nestedGame(fs, full, relative))) continue;
      if (entry.isDirectory()) visit(full); else if (entry.isFile()) output.push(relative);
    }
  }
  if (exists(root)) visit(root);
  return output.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

function discoverSffs(root, excludes = []) { return walkFiles(root, { exclude: excludes }).filter((item) => /\.sff$/i.test(item)); }

function configuredMotif(root) {
  const config = path.join(root, 'save', 'config.ini');
  if (!exists(config)) return '';
  const match = /^\s*Motif\s*=\s*([^;\r\n]+)/im.exec(fs.readFileSync(config, 'utf8'));
  if (!match) return '';
  try {
    const relative = safeRelative(match[1].trim().replace(/^["']|["']$/g, ''));
    return exists(path.join(root, relative)) ? relative : '';
  } catch (_) { return ''; }
}

function discoverScreenpacks(root, excludes = []) {
  const found = new Set();
  const active = configuredMotif(root); if (active) found.add(slash(active));
  for (const relative of walkFiles(root, { exclude: excludes }).filter((item) => /\.def$/i.test(item))) {
    const text = fs.readFileSync(path.join(root, relative), 'utf8');
    if ((/^\s*\[Title Info\]\s*$/im.test(text) && /^\s*\[Select Info\]\s*$/im.test(text)) || /footer\.version\./i.test(text)) found.add(slash(relative));
  }
  return [...found].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

function nextDecimalVersion(value) {
  const match = /^\s*(\d+)(?:\.(\d))?\s*$/.exec(String(value || ''));
  if (!match) return '0.1';
  const tenths = Number(match[1]) * 10 + Number(match[2] || 0) + 1;
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
}

function versioningTemplate(root, prior = null, excludes = []) {
  const discovered = discoverScreenpacks(root, excludes), retained = prior?.screenpacks || [];
  return {
    enabled: prior?.enabled !== false,
    current: String(prior?.current || '0.0'),
    labelTemplate: prior?.labelTemplate || 'Version {version}',
    screenpacks: [...new Set([...retained, ...discovered].map(slash))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })),
    note: 'Finish Product suggests the next tenth, permits a manual name or number, and writes footer.version.text only in the finished copy.'
  };
}

function setDefValue(text, sectionName, key, value) {
  const newline = /\r\n/.test(text) ? '\r\n' : '\n', lines = String(text).split(/\r?\n/), section = sectionName.toLowerCase();
  let start = -1, end = lines.length;
  for (let index = 0; index < lines.length; index++) {
    const match = /^\s*\[([^\]]+)\]\s*(?:;.*)?$/.exec(lines[index]);
    if (!match) continue;
    if (start >= 0) { end = index; break; }
    if (match[1].trim().toLowerCase() === section) start = index;
  }
  if (start < 0) {
    if (lines.length && lines[lines.length - 1] !== '') lines.push('');
    lines.push(`[${sectionName}]`, `${key} = ${value}`);
  } else {
    const expression = new RegExp(`^(\\s*)${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`, 'i');
    let replaced = false;
    for (let index = start + 1; index < end; index++) if (expression.test(lines[index])) { const indent = expression.exec(lines[index])[1]; lines[index] = `${indent}${key} = ${value}`; replaced = true; break; }
    if (!replaced) lines.splice(end, 0, `${key} = ${value}`);
  }
  return lines.join(newline);
}

async function applyScreenpackVersion(staging, versioning, displayText) {
  if (!versioning?.enabled) return [];
  const changed = [];
  for (const relative of versioning.screenpacks || []) {
    const target = path.join(staging, safeRelative(relative));
    if (!inside(staging, target) || !exists(target)) throw new Error(`Version-display screenpack is missing from the finished copy: ${relative}`);
    const before = await fs.promises.readFile(target, 'utf8'), after = setDefValue(before, 'Title Info', 'footer.version.text', displayText);
    await fs.promises.writeFile(target, after, 'utf8'); changed.push(relative);
  }
  return changed;
}

function discoverRuntimePaletteFiles(root) {
  const found = new Set();
  const chars = path.join(root, 'chars'); if (!exists(chars)) return [];
  for (const relative of walkFiles(chars).filter((item) => /\.def$/i.test(item))) {
    const filename = path.join(chars, relative), directory = path.dirname(filename), text = fs.readFileSync(filename, 'utf8');
    for (const match of text.matchAll(/^\s*pal\d+\s*=\s*([^;\r\n]+)/gim)) {
      const raw = match[1].trim(); if (!/(?:custom|user|color.?edit)/i.test(raw)) continue;
      const target = path.resolve(directory, raw); if (inside(root, target) && exists(target)) found.add(slash(path.relative(root, target)));
    }
  }
  return [...found].sort();
}

function profileTemplate(root, prior = null) {
  const copyExcludes = [...new Set([...(prior?.copy?.exclude || [
    '.git/**', '.codex*/**', '.ikemen/release/**', '.ikemen/tests/**', '.ikemen/test-sessions/**', '.ikemen-tools/backups/**', 'chars/.ikemaker-stage-rig/**',
    'external/mods/IKEMaker_test_session.lua',
    'save/logs/**', 'save/replays/**', 'save/palettes/**', '**/*.bak', '**/*.tmp'
  ]), 'chars/.ikemaker-stage-rig/**', '.ikemen/tests/**', '.ikemen/test-sessions/**', 'external/mods/IKEMaker_test_session.lua'])];
  const known = new Map((prior?.sff || []).map((entry) => [slash(entry.path).toLowerCase(), entry]));
  const sff = discoverSffs(root, copyExcludes).map((relative) => known.get(relative.toLowerCase()) || {
    path: relative,
    strategy: 'unresolved',
    note: 'Choose manifest-build or verified-cropped. Release creation is blocked while unresolved.'
  });
  return {
    schemaVersion: 1,
    reviewed: prior?.reviewed === true,
    profileName: prior?.profileName || 'Public Release',
    sourceRoot: root,
    snapshot: {
      capturedAt: prior?.snapshot?.capturedAt || null,
      root: SNAPSHOT_RELATIVE,
      sources: prior?.snapshot?.sources || ['save'],
      exclude: prior?.snapshot?.exclude || ['save/logs/**', 'save/replays/**', 'save/palettes/**'],
      runtimeResetFiles: prior?.snapshot?.runtimeResetFiles || discoverRuntimePaletteFiles(root),
      files: prior?.snapshot?.files || []
    },
    copy: {
      include: prior?.copy?.include || ['**/*'],
      exclude: copyExcludes
    },
    cleanup: prior?.cleanup || ['save/palettes', 'save/logs', 'save/replays'],
    versioning: versioningTemplate(root, prior?.versioning, copyExcludes),
    updater: updateTemplate(prior?.updater),
    sff,
    notes: prior?.notes || [
      'Set every keyboard, controller, menu, player-option, sound, and visual default before recapturing this snapshot.',
      'Add any persistent option file outside save/ to snapshot.sources or snapshot.runtimeResetFiles.',
      'manifest-build rebuilds from reviewed source data with SprMaker2 autocrop enabled.',
      'verified-cropped is a human signoff for an archive already cropped without extraction. Generic SFF extraction is prohibited because it can lose palette structure.'
    ]
  };
}

function profilePath(root) { return path.join(root, ...PROFILE_RELATIVE.split('/')); }
function readProfile(root) { const filename = profilePath(root); return exists(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : null; }

function snapshotSourceFiles(root, profile) {
  const files = new Set();
  for (const value of [...(profile.snapshot.sources || []), ...(profile.snapshot.runtimeResetFiles || [])]) {
    const relative = safeRelative(value), full = path.join(root, relative);
    if (!inside(root, full) || !exists(full)) continue;
    if (fs.statSync(full).isDirectory()) for (const child of walkFiles(full)) files.add(slash(path.join(relative, child)));
    else files.add(relative);
  }
  return [...files].filter((item) => !matches(item, profile.snapshot.exclude || [])).sort();
}

function capturePlan(root, rawProfile) {
  const profile = profileTemplate(root, rawProfile), capturedAt = new Date().toISOString(), files = snapshotSourceFiles(root, profile), writes = [];
  profile.snapshot.capturedAt = capturedAt;
  profile.snapshot.files = files.map((relative) => {
    const content = fs.readFileSync(path.join(root, relative)), snapshot = slash(path.join(profile.snapshot.root, relative));
    writes.push([path.join(root, snapshot), content]); return { path: relative, snapshot, sha256: hash(content), bytes: content.length };
  });
  writes.push([profilePath(root), `${JSON.stringify(profile, null, 2)}\n`]);
  return { profile, writes };
}

function auditProfile(root, rawProfile) {
  const profile = profileTemplate(root, rawProfile), issues = [], warnings = [];
  if (!profile.reviewed) issues.push('Release profile has not been reviewed. Confirm copy scope and every SFF rule, then set reviewed to true.');
  if (!profile.snapshot.capturedAt || !(profile.snapshot.files || []).length) issues.push('No release-default snapshot has been captured.');
  for (const file of profile.snapshot.files || []) {
    const snapshot = path.join(root, safeRelative(file.snapshot));
    if (!exists(snapshot)) issues.push(`Default snapshot is missing: ${file.snapshot}`);
    else if (hash(fs.readFileSync(snapshot)) !== file.sha256) issues.push(`Default snapshot changed after capture: ${file.snapshot}`);
  }
  const actual = new Set(discoverSffs(root, profile.copy.exclude || []).map((item) => item.toLowerCase())), declared = new Map((profile.sff || []).map((item) => [slash(item.path).toLowerCase(), item]));
  for (const relative of actual) if (!declared.has(relative)) issues.push(`SFF has no release rule: ${relative}`);
  for (const [relative, entry] of declared) {
    if (!actual.has(relative)) warnings.push(`Release SFF rule no longer resolves: ${entry.path}`);
    if (!['manifest-build', 'verified-cropped'].includes(entry.strategy)) issues.push(`SFF strategy is unresolved: ${entry.path}`);
    if (entry.strategy === 'manifest-build') {
      for (const field of ['manifest', 'sourceRoot']) if (!entry[field]) issues.push(`${entry.path}: manifest-build requires ${field}.`);
      if (entry.manifest && !exists(path.resolve(root, entry.manifest))) issues.push(`${entry.path}: manifest is missing: ${entry.manifest}`);
      if (entry.sourceRoot && !exists(path.resolve(root, entry.sourceRoot))) issues.push(`${entry.path}: sourceRoot is missing: ${entry.sourceRoot}`);
    }
  }
  if ((profile.copy.include || []).length !== 1 || profile.copy.include[0] !== '**/*') warnings.push('A restricted copy.include list is active; review it before release.');
  if (profile.versioning.enabled) {
    if (!(profile.versioning.screenpacks || []).length) issues.push('Version display is enabled but no screenpack system DEF is registered.');
    for (const relative of profile.versioning.screenpacks || []) {
      const target = path.join(root, safeRelative(relative));
      if (!inside(root, target) || !exists(target)) issues.push(`Version-display screenpack is missing: ${relative}`);
    }
    if (!String(profile.versioning.labelTemplate || '').includes('{version}')) warnings.push('Version labelTemplate does not contain {version}; the chosen version will not appear automatically.');
  }
  if (profile.updater.enabled) {
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(profile.updater.productId)) issues.push('Updater productId must contain only letters, numbers, dots, underscores, or hyphens.');
    if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(profile.updater.version)) issues.push('Updater version must use a three-part version such as 1.2.0.');
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(profile.updater.channel)) issues.push('Updater channel must be a simple name such as stable or testing.');
    if (!/^https:\/\//i.test(profile.updater.manifestUrl)) issues.push('Updater manifestUrl must be a reviewed HTTPS address.');
    if (/example\.invalid/i.test(profile.updater.manifestUrl)) issues.push('Updater manifestUrl still contains the disabled example address.');
    if (profile.updater.previousManifest && !exists(path.resolve(root, profile.updater.previousManifest))) issues.push(`Previous updater manifest is missing: ${profile.updater.previousManifest}`);
    if (profile.updater.createFullZip && process.platform !== 'win32') issues.push('Full ZIP release packaging is currently verified only on Windows. Disable createFullZip or build on Windows.');
  }
  return { profile, issues, warnings, sffCount: actual.size, manifestBuilds: [...declared.values()].filter((item) => item.strategy === 'manifest-build').length, verifiedCropped: [...declared.values()].filter((item) => item.strategy === 'verified-cropped').length };
}

function shouldCopy(relative, profile) {
  const value = slash(relative); if (!value) return true;
  if (!runtimeCopyAllowed(value)) return false;
  if (matches(value, profile.copy.exclude || [])) return false;
  return !(profile.copy.include || []).length || matches(value, profile.copy.include);
}

async function copyProject(root, staging, profile) {
  await fs.promises.cp(root, staging, { recursive: true, force: false, errorOnExist: true, filter: (source) => {
    const relative = slash(path.relative(root, source)); return relative === '' || (shouldCopy(relative, profile) && !nestedGame(fs, source, relative));
  } });
}

async function restoreDefaults(root, staging, profile) {
  for (const entry of profile.snapshot.files || []) {
    const source = path.join(root, safeRelative(entry.snapshot)), target = path.join(staging, safeRelative(entry.path));
    await fs.promises.mkdir(path.dirname(target), { recursive: true }); await fs.promises.copyFile(source, target);
  }
  for (const relative of profile.cleanup || []) {
    const target = path.join(staging, safeRelative(relative)); if (!inside(staging, target)) throw new Error(`Cleanup escaped the public-copy staging directory: ${relative}`);
    await fs.promises.rm(target, { recursive: true, force: true });
  }
}

function run(executable, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, windowsHide: true }), output = [];
    child.stdout.on('data', (value) => output.push(value)); child.stderr.on('data', (value) => output.push(value));
    child.on('error', reject); child.on('close', (code) => code === 0 ? resolve(Buffer.concat(output).toString('utf8')) : reject(new Error(`${path.basename(executable)} failed with exit code ${code}.\n${Buffer.concat(output).toString('utf8').slice(-4000)}`)));
  });
}

async function cropManifestSffs(root, staging, profile) {
  const builds = profile.sff.filter((entry) => entry.strategy === 'manifest-build'), reports = [];
  for (let index = 0; index < builds.length; index++) {
    const entry = builds[index], outputSff = path.join(staging, safeRelative(entry.path)), outputDirectory = path.join(staging, '.release-build', String(index + 1).padStart(3, '0'));
    await fs.promises.mkdir(path.dirname(outputSff), { recursive: true });
    const generated = await createBuildPackage({
      sourceRoot: path.resolve(root, entry.sourceRoot), manifestPath: path.resolve(root, entry.manifest), outputDirectory, outputSff,
      paletteSourceSff: entry.paletteSourceSff ? path.resolve(root, entry.paletteSourceSff) : '', buildProfile: normalizeSffProfile(entry.buildProfile || {}), autocrop: true
    });
    const log = await run(generated.sprmake, [generated.definitionPath], outputDirectory);
    if (!exists(outputSff)) throw new Error(`SprMaker2 did not produce ${entry.path}.`);
    await fs.promises.writeFile(path.join(outputDirectory, 'release-sprmake2.log'), log, 'utf8'); reports.push({ path: entry.path, strategy: entry.strategy, bytes: fs.statSync(outputSff).size });
  }
  return reports;
}

function fileSha256(filename) {
  return new Promise((resolve, reject) => {
    const digest = crypto.createHash('sha256'), input = fs.createReadStream(filename);
    input.on('data', (chunk) => digest.update(chunk)); input.on('error', reject);
    input.on('end', () => resolve(digest.digest('hex')));
  });
}

async function updateFileEntries(publicRoot, updater) {
  const relativeFiles = walkFiles(publicRoot).filter((relative) => slash(relative).toLowerCase() !== INSTALLED_UPDATE_MANIFEST.toLowerCase());
  const files = [];
  for (const relative of relativeFiles) {
    const filename = path.join(publicRoot, relative), stat = await fs.promises.stat(filename);
    files.push({ path: slash(relative), bytes: stat.size, sha256: await fileSha256(filename), ownership: matches(relative, updater.preserve) ? 'preserve' : 'managed' });
  }
  return files;
}

function previousManagedFiles(root, updater) {
  if (!updater.previousManifest) return new Set();
  const previous = JSON.parse(fs.readFileSync(path.resolve(root, updater.previousManifest), 'utf8'));
  return new Set((previous.files || []).filter((entry) => entry.ownership === 'managed').map((entry) => slash(entry.path).toLowerCase()));
}

async function createUpdaterArtifacts(sourceRoot, publicRoot, destination, profile) {
  const updater = profile.updater, artifactRoot = `${destination}-Release-Artifacts`;
  if (exists(artifactRoot)) throw new Error(`Updater artifact folder already exists: ${artifactRoot}`);
  await fs.promises.mkdir(artifactRoot, { recursive: false });
  const files = await updateFileEntries(publicRoot, updater), current = new Set(files.filter((entry) => entry.ownership === 'managed').map((entry) => entry.path.toLowerCase()));
  const removed = [...previousManagedFiles(sourceRoot, updater)].filter((relative) => !current.has(relative)).sort();
  const installed = {
    schemaVersion: 1, kind: 'IKEMaker installed-content manifest', productId: updater.productId, displayName: updater.displayName,
    version: updater.version, channel: updater.channel, builtAt: new Date().toISOString(), files, removed,
    ownershipPolicy: { unknownFiles: 'preserve', managed: 'replace-or-explicitly-remove', preserve: 'never-overwrite-without-user-reset', preservePatterns: updater.preserve }
  };
  await fs.promises.writeFile(path.join(publicRoot, INSTALLED_UPDATE_MANIFEST), `${JSON.stringify(installed, null, 2)}\n`, 'utf8');
  let packageInfo = null;
  if (updater.createFullZip) {
    const archiveName = `${updater.productId}-${updater.version}-${updater.channel}-full.zip`, archive = path.join(artifactRoot, archiveName);
    const helper = path.join(__dirname, '..', 'bin', 'package-release.ps1'), powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    if (!exists(helper) || !exists(powershell)) throw new Error('The verified Windows ZIP packaging helper is unavailable.');
    await run(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper, '-SourceDirectory', publicRoot, '-OutputArchive', archive], artifactRoot);
    const stat = await fs.promises.stat(archive), digest = await fileSha256(archive);
    if (stat.size >= updater.maximumAssetBytes) throw new Error(`Full package is ${stat.size} bytes and exceeds maximumAssetBytes (${updater.maximumAssetBytes}). Split-package support is required before hosting this build.`);
    packageInfo = { kind: 'full', filename: archiveName, bytes: stat.size, sha256: digest };
  }
  const feed = { ...installed, kind: 'IKEMaker update feed', manifestUrl: updater.manifestUrl, mirrors: updater.mirrors, package: packageInfo };
  await fs.promises.writeFile(path.join(artifactRoot, 'update-manifest.json'), `${JSON.stringify(feed, null, 2)}\n`, 'utf8');
  const sums = [`${await fileSha256(path.join(artifactRoot, 'update-manifest.json'))}  update-manifest.json`];
  if (packageInfo) sums.push(`${packageInfo.sha256}  ${packageInfo.filename}`);
  await fs.promises.writeFile(path.join(artifactRoot, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`, 'utf8');
  await fs.promises.writeFile(path.join(artifactRoot, 'RELEASE-UPLOAD-INSTRUCTIONS.txt'), `Upload update-manifest.json and the referenced package to the configured release host.\nPublish the manifest at:\n${updater.manifestUrl}\n\nDo not alter an archive after its hashes are generated.\n`, 'utf8');
  return { artifactRoot, manifest: path.join(artifactRoot, 'update-manifest.json'), package: packageInfo, files: files.length, removed: removed.length };
}

function rootFromUi() {
  const active = vscode.window.activeTextEditor?.document?.fileName, folders = vscode.workspace.workspaceFolders || [], starts = [active, ...folders.map((item) => item.uri.fsPath)].filter(Boolean);
  for (const start of starts) { const found = findGameRoot(start); if (found) return found; }
  return '';
}

async function chooseRoot() {
  const found = rootFromUi(); if (found) return found;
  const picked = await vscode.window.showOpenDialog({ title: 'Choose the IKEMEN game folder', canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
  if (!picked?.[0]) return ''; const root = findGameRoot(picked[0].fsPath); if (!root) vscode.window.showErrorMessage('That folder does not contain an IKEMEN game root.'); return root;
}

async function captureDefaults() {
  const root = await chooseRoot(); if (!root) return;
  const prior = readProfile(root), profile = profileTemplate(root, prior), answer = await vscode.window.showWarningMessage('Capture the current game settings as the public-release defaults?', { modal: true, detail: `Set keyboard, controller, menu, player-option, sound, and visual settings to their intended public defaults first.\n\nCaptured sources: ${(profile.snapshot.sources || []).join(', ')}\nRuntime reset files: ${(profile.snapshot.runtimeResetFiles || []).join(', ') || 'none detected'}\nPlayer palettes, logs, and replays are excluded.` }, prior ? 'Recapture Defaults' : 'Capture Defaults');
  if (!answer) return;
  const plan = capturePlan(root, prior); transactionalWriteSet(fs, plan.writes, { label: 'capture-release-defaults', journalRoot: root, aggregateJournal: true });
  vscode.window.showInformationMessage(`Captured ${plan.profile.snapshot.files.length} default file(s). The release profile contains ${plan.profile.sff.length} SFF rule(s) for review.`, 'Open Profile').then((choice) => { if (choice === 'Open Profile') vscode.window.showTextDocument(vscode.Uri.file(profilePath(root)), { preview: false }); });
}

async function openProfile() {
  const root = await chooseRoot(); if (!root) return; let profile = readProfile(root);
  if (!profile) {
    profile = profileTemplate(root, null);
    transactionalWriteSet(fs, [[profilePath(root), `${JSON.stringify(profile, null, 2)}\n`]], { label: 'create-release-profile', journalRoot: root, aggregateJournal: true });
  }
  await vscode.window.showTextDocument(vscode.Uri.file(profilePath(root)), { preview: false });
}

function auditText(root, audit) {
  return ['JNP PUBLIC RELEASE AUDIT', `Game: ${root}`, `Profile: ${audit.profile.profileName}`, `SFF archives: ${audit.sffCount}`, `Manifest autocrop builds: ${audit.manifestBuilds}`, `Verified already cropped: ${audit.verifiedCropped}`, '', `BLOCKERS (${audit.issues.length})`, ...(audit.issues.length ? audit.issues.map((item) => `- ${item}`) : ['- None']), '', `WARNINGS (${audit.warnings.length})`, ...(audit.warnings.length ? audit.warnings.map((item) => `- ${item}`) : ['- None'])].join('\n');
}

async function auditRelease() {
  const root = await chooseRoot(); if (!root) return; const profile = readProfile(root);
  if (!profile) return vscode.window.showWarningMessage('Capture release defaults first.');
  const audit = auditProfile(root, profile), document = await vscode.workspace.openTextDocument({ language: 'markdown', content: `# Release audit\n\n\`\`\`text\n${auditText(root, audit)}\n\`\`\`\n` });
  await vscode.window.showTextDocument(document, { preview: false });
}

async function completeProject() {
  const capabilities = detectCapabilities({ uiKind: vscode.env.uiKind === vscode.UIKind.Web ? 'web' : 'desktop', platform: process.platform, environment: process.env });
  if (!capabilities.nativeBuilders) return vscode.window.showInformationMessage(missingCapabilityMessage('Complete Project release building', capabilities));
  const root = await chooseRoot(); if (!root) return; const savedProfile = readProfile(root);
  if (!savedProfile) return vscode.window.showWarningMessage('Capture the JNP release defaults before completing a project.');
  const audit = auditProfile(root, savedProfile), profile = audit.profile;
  if (audit.issues.length) { const choice = await vscode.window.showErrorMessage(`Release is blocked by ${audit.issues.length} unresolved item(s). No copy was created.`, 'Open Audit', 'Open Profile'); if (choice === 'Open Audit') await auditRelease(); if (choice === 'Open Profile') await openProfile(); return; }
  let releaseVersion = profile.versioning?.current || '0.0', releaseDisplayText = '';
  if (profile.versioning?.enabled) {
    releaseVersion = await vscode.window.showInputBox({ title: 'Finished product version', value: nextDecimalVersion(profile.versioning.current), prompt: 'The default advances one tenth. You may enter a different version number or a named release.', validateInput: (value) => String(value || '').trim() ? undefined : 'Enter a version number or release name.' });
    if (releaseVersion === undefined) return; releaseVersion = releaseVersion.trim();
    const suggestedText = String(profile.versioning.labelTemplate || 'Version {version}').replaceAll('{version}', releaseVersion);
    releaseDisplayText = await vscode.window.showInputBox({ title: 'Screenpack version text', value: suggestedText, prompt: 'This exact text will be shown by footer.version.text on registered title screens.', validateInput: (value) => !String(value || '').trim() ? 'Enter the text players should see.' : /[;\r\n]/.test(String(value)) ? 'Semicolons and line breaks cannot be used in a DEF text value.' : undefined });
    if (releaseDisplayText === undefined) return; releaseDisplayText = releaseDisplayText.trim();
  }
  const parentPick = await vscode.window.showOpenDialog({ title: 'Choose the parent folder for the public game copy', canSelectFiles: false, canSelectFolders: true, canSelectMany: false }); if (!parentPick?.[0]) return;
  const suggested = `${path.basename(root)}-Public-${new Date().toISOString().slice(0, 10)}`, name = await vscode.window.showInputBox({ title: 'Public copy folder name', value: suggested, validateInput: (value) => /^[^<>:"/\\|?*]+$/.test(String(value || '').trim()) ? undefined : 'Enter a valid new folder name.' }); if (!name) return;
  const parent = path.resolve(parentPick[0].fsPath), destination = path.join(parent, name.trim()), staging = `${destination}.__building__`;
  if (inside(root, destination) || inside(destination, root)) return vscode.window.showErrorMessage('The public copy must be outside the development game folder.');
  if (exists(destination) || exists(staging)) return vscode.window.showErrorMessage('The destination or its build-staging folder already exists. Choose a new folder name.');
  const answer = await vscode.window.showWarningMessage('Create the complete public project copy now?', { modal: true, detail: `Source remains untouched:\n${root}\n\nPublic copy:\n${destination}\n${profile.versioning?.enabled ? `\nScreenpack display: ${releaseDisplayText}\nTargets: ${profile.versioning.screenpacks.length}` : ''}\n\nDefaults will be restored, user palettes/logs/replays removed, and ${audit.manifestBuilds} project SFF(s) rebuilt with autocrop. ${audit.verifiedCropped} SFF(s) are recorded as already verified cropped.${profile.updater.enabled ? `\n\nUpdater output is enabled for ${profile.updater.displayName} ${profile.updater.version} (${profile.updater.channel}). A separate release-artifact folder will be generated.` : '\n\nUpdater output is disabled in the release profile.'}` }, 'Build Public Copy'); if (answer !== 'Build Public Copy') return;
  let updaterResult = null;
  try {
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Completing public IKEMEN project', cancellable: false }, async (progress) => {
      progress.report({ message: 'Copying the development game…' }); await copyProject(root, staging, profile);
      progress.report({ message: 'Restoring JNP defaults and removing player-created data…' }); await restoreDefaults(root, staging, profile);
      progress.report({ message: 'Building cropped release SFFs…' }); const built = await cropManifestSffs(root, staging, profile);
      await fs.promises.rm(path.join(staging, '.release-build'), { recursive: true, force: true });
      progress.report({ message: 'Applying the finished-product version to registered screenpacks…' });
      const versionedScreenpacks = await applyScreenpackVersion(staging, profile.versioning, releaseDisplayText);
      const manifest = { schemaVersion: 1, kind: 'JNP completed public project', builtAt: new Date().toISOString(), sourceGame: path.basename(root), profile: profile.profileName, releaseVersion, releaseDisplayText, versionedScreenpacks, defaultsCapturedAt: profile.snapshot.capturedAt, sff: profile.sff.map((entry) => ({ path: entry.path, strategy: entry.strategy })), rebuilt: built };
      await fs.promises.writeFile(path.join(staging, 'JNP-PUBLIC-RELEASE.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      if (profile.updater.enabled) {
        progress.report({ message: 'Generating updater manifest, checksums, and full package…' });
        updaterResult = await createUpdaterArtifacts(root, staging, destination, profile);
      }
      await fs.promises.rename(staging, destination);
    });
    if (profile.versioning?.enabled) {
      profile.versioning.current = releaseVersion; profile.versioning.lastDisplayText = releaseDisplayText;
      transactionalWriteSet(fs, [[profilePath(root), `${JSON.stringify(profile, null, 2)}\n`]], { label: 'record-finished-product-version', journalRoot: root, aggregateJournal: true });
    }
    const summary = updaterResult ? `\nUpdater artifacts: ${updaterResult.artifactRoot}` : '';
    const choice = await vscode.window.showInformationMessage(`Public project completed without changing the development copy: ${destination}${summary}`, 'Open Public Copy', ...(updaterResult ? ['Open Update Artifacts'] : []));
    if (choice === 'Open Public Copy') await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(destination));
    if (choice === 'Open Update Artifacts') await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(updaterResult.artifactRoot));
  } catch (error) {
    try { await fs.promises.writeFile(path.join(staging, 'JNP-RELEASE-INCOMPLETE.txt'), `Release failed. The development game was not changed.\n\n${error.stack || error.message}\n`, 'utf8'); } catch (_) {}
    vscode.window.showErrorMessage(`Public release build failed. The development game is untouched. Staging was retained for diagnosis: ${staging}\n${error.message}`);
  }
}

function registerReleaseBuilder(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('ikemen.release.captureDefaults', captureDefaults),
    vscode.commands.registerCommand('ikemen.release.openProfile', openProfile),
    vscode.commands.registerCommand('ikemen.release.audit', auditRelease),
    vscode.commands.registerCommand('ikemen.release.complete', completeProject)
  );
}

module.exports = { PROFILE_RELATIVE, SNAPSHOT_RELATIVE, INSTALLED_UPDATE_MANIFEST, findGameRoot, matcher, matches, discoverSffs, configuredMotif, discoverScreenpacks, nextDecimalVersion, versioningTemplate, setDefValue, applyScreenpackVersion, discoverRuntimePaletteFiles, updateTemplate, profileTemplate, snapshotSourceFiles, capturePlan, auditProfile, shouldCopy, fileSha256, updateFileEntries, previousManagedFiles, createUpdaterArtifacts, registerReleaseBuilder };
