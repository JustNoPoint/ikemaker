'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const safety = require('./engine_update_model');
// Raw writes in this module are reachable only after the UI's explicit,
// operation-scoped migration approval. They are journaled outside the game.
const WRITE_AUTHORITY = 'explicit-engine-migration-approval';

const CONFIG_MAPPINGS = [
  { fromSection: 'Default', fromKey: 'LegacyGameDistanceSpec', toSection: 'Legacy', toKey: 'GameDistanceSpec' },
  { fromSection: 'Default', fromKey: 'LegacyFallYVelYAccel', toSection: 'Legacy', toKey: 'FallYVelYAccel' },
  { fromSection: 'Rollback', fromKey: 'LogsEnabled', toSection: 'Rollback', toKey: 'StateLogsEnabled' }
];

function clean(value) { return String(value == null ? '' : value).trim(); }
function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function sha256Bytes(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function sha256File(filename) { const hash = crypto.createHash('sha256'), fd = fs.openSync(filename, 'r'), buffer = Buffer.alloc(1024 * 1024); try { let read; while ((read = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, read)); } finally { fs.closeSync(fd); } return hash.digest('hex'); }
function retainedBuildId(repository, commit, artifactSha256, platform = 'windows-x64') {
  const repositoryKey = sha256Bytes(clean(repository).toLowerCase()).slice(0, 16);
  return `ikemen-go-retained-${repositoryKey}-${clean(commit).toLowerCase()}-${clean(platform).toLowerCase()}-${clean(artifactSha256).toLowerCase()}`;
}
function requestBuffer(url, options = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects.'));
    const request = https.get(url, { headers: { 'User-Agent': 'JustNoPoint-IKEMaker', Accept: options.accept || 'application/vnd.github+json' } }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) { response.resume(); return resolve(requestBuffer(new URL(response.headers.location, url).toString(), options, redirects + 1)); }
      if (response.statusCode < 200 || response.statusCode >= 300) { response.resume(); return reject(new Error(`HTTP ${response.statusCode} from ${url}`)); }
      const chunks = [], limit = Number(options.maxBytes) || 1024 * 1024 * 1024; let total = 0;
      response.on('data', (chunk) => { total += chunk.length; if (total > limit) request.destroy(new Error('Download exceeded the safety size limit.')); else chunks.push(chunk); });
      response.on('end', () => resolve(Buffer.concat(chunks)));
    });
    request.setTimeout(options.timeoutMs || 30000, () => request.destroy(new Error('Request timed out.'))); request.on('error', reject);
  });
}
async function fetchJson(url) { return JSON.parse((await requestBuffer(url, { maxBytes: 20 * 1024 * 1024 })).toString('utf8')); }

function chooseWindowsAsset(release) {
  const candidates = (release?.assets || []).filter((asset) => /windows/i.test(asset.name || '') && !/(?:arm|32|x86)/i.test(asset.name || '') && /\.zip$/i.test(asset.name || ''));
  if (candidates.length !== 1) throw new Error(`Expected one Windows x64 Nightly ZIP, found ${candidates.length}.`);
  return candidates[0];
}
async function resolveExactRelease(tag = 'nightly', fetcher = fetchJson) {
  const release = await fetcher(`https://api.github.com/repos/ikemen-engine/Ikemen-GO/releases/tags/${encodeURIComponent(tag)}`);
  const commit = await fetcher(`https://api.github.com/repos/ikemen-engine/Ikemen-GO/commits/${encodeURIComponent(release.tag_name)}`);
  const asset = chooseWindowsAsset(release), publishedDigest = /^sha256:([a-f0-9]{64})$/i.exec(clean(asset.digest));
  return {
    id: `ikemen-go-${tag === 'nightly' ? 'nightly' : clean(tag).replace(/^v/, '')}-${clean(commit.sha).slice(0, 12)}-windows-x64`, engine: 'IKEMEN GO', channel: tag === 'nightly' ? 'nightly' : 'stable', version: tag === 'nightly' ? 'nightly' : clean(tag).replace(/^v/, ''),
    commit: clean(commit.sha).toLowerCase(), platform: 'windows-x64', releaseId: Number(release.id), releaseTag: clean(release.tag_name), releaseUrl: clean(release.html_url),
    assetId: Number(asset.id), artifactName: clean(asset.name), artifactUrl: clean(asset.browser_download_url), artifactSize: Number(asset.size) || 0,
    publishedArtifactSha256: publishedDigest ? publishedDigest[1].toLowerCase() : null, publishedAt: clean(release.published_at || release.updated_at) || null,
    provenance: { repository: 'ikemen-engine/Ikemen-GO', releaseId: Number(release.id), tag: clean(release.tag_name), assetId: Number(asset.id), commitApiUrl: clean(commit.html_url) }
  };
}
async function resolveExactNightly(fetcher = fetchJson) { return resolveExactRelease('nightly', fetcher); }
function sameCandidate(reviewed, fresh) {
  return ['id', 'commit', 'releaseId', 'releaseTag', 'assetId', 'artifactName', 'artifactUrl'].every((key) => clean(reviewed?.[key]).toLowerCase() === clean(fresh?.[key]).toLowerCase());
}

function runPowerShell(script, args = [], options = {}) {
  const env = { ...process.env }, rendered = String(script).replace(/\$args\[(\d+)\]/g, (_, index) => `$env:IKEMAKER_ARG${index}`);
  args.forEach((value, index) => { env[`IKEMAKER_ARG${index}`] = String(value); });
  const wrapped = `$ErrorActionPreference='Stop'; Set-StrictMode -Version 2; ${rendered}`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', wrapped], { encoding: 'utf8', windowsHide: true, maxBuffer: options.maxBuffer || 64 * 1024 * 1024, env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(clean(result.stderr || result.stdout) || 'PowerShell helper failed.');
  return result.stdout;
}
function powershellJson(script, args = []) {
  const output = runPowerShell(script, args).trim();
  if (!output) throw new Error('PowerShell helper returned no structured result.');
  try { return JSON.parse(output); } catch (error) { throw new Error(`PowerShell helper returned invalid JSON: ${error.message}`); }
}
function inspectZip(zipPath) {
  const script = `Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead($args[0]); try { [pscustomobject]@{items=@($z.Entries | ForEach-Object { $mode=(($_.ExternalAttributes -shr 16) -band 0xF000); [pscustomobject]@{path=$_.FullName;length=$_.Length;type=$(if($mode -eq 0xA000){'symlink'}elseif($_.FullName.EndsWith('/')){'directory'}else{'file'});attributes=$_.ExternalAttributes} })} | ConvertTo-Json -Depth 5 -Compress } finally {$z.Dispose()}`;
  const value = powershellJson(script, [zipPath]), entries = Array.isArray(value.items) ? value.items : value.items ? [value.items] : [];
  if (!entries.length) throw new Error(`ZIP inspection returned no entries: ${zipPath}`);
  return entries;
}
function commonArchiveRoot(entries) {
  const roots = [...new Set(entries.map((item) => safety.normalizeArchivePath(item.path).split('/')[0]).filter(Boolean))];
  return roots.length === 1 && entries.some((item) => safety.normalizeArchivePath(item.path).includes('/')) ? roots[0] : '';
}
function extractZip(zipPath, destination) {
  fs.mkdirSync(destination, { recursive: true });
  const script = `Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force; $bad=Get-ChildItem -LiteralPath $args[1] -Force -Recurse | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }; if($bad){ throw 'Archive extraction produced a reparse point.' }`;
  runPowerShell(script, [zipPath, destination], { maxBuffer: 8 * 1024 * 1024 });
}
async function downloadCandidate(reviewed, stagingRoot, fetcher = requestBuffer, resolver = resolveExactNightly) {
  const fresh = await resolver(); if (!sameCandidate(reviewed, fresh)) throw new Error('The Nightly moved after review. Review the new exact candidate before downloading.');
  fs.mkdirSync(stagingRoot, { recursive: true });
  const zipPath = path.join(stagingRoot, reviewed.artifactName), bytes = await fetcher(reviewed.artifactUrl, { accept: 'application/octet-stream', maxBytes: Math.max(reviewed.artifactSize * 2, 1024 * 1024 * 1024) });
  fs.writeFileSync(zipPath, bytes, { flag: 'wx' });
  const artifactSha256 = sha256File(zipPath);
  if (reviewed.publishedArtifactSha256 && artifactSha256 !== reviewed.publishedArtifactSha256) throw new Error('Downloaded Nightly hash does not match the digest published with the release asset.');
  return { ...reviewed, artifactSha256, artifactIdentityStatus: reviewed.publishedArtifactSha256 ? 'verified' : 'user-asserted', zipPath };
}

function parseRetainedArtifact(manifestPath, zipPath, reviewedBindings = []) {
  const manifestFile = path.resolve(clean(manifestPath)), selectedZip = path.resolve(clean(zipPath));
  if (!manifestFile || !selectedZip) throw new Error('Choose both a retained-artifact manifest and its ZIP.');
  const manifestDir = path.dirname(manifestFile), raw = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  if (Number(raw.schemaVersion) !== 1) throw new Error('Unsupported retained-artifact manifest schema.');
  if (clean(raw.engine).toLowerCase() !== 'ikemen go') throw new Error('The retained artifact is not identified as IKEMEN GO.');
  const repository = clean(raw.repository);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('The manifest must identify its source repository as owner/name.');
  if (clean(raw.platform).toLowerCase() !== 'windows-x64') throw new Error('Only Windows x64 IKEMEN packages can replace this Windows engine.');
  const commit = clean(raw.commit).toLowerCase(), artifactSha256 = clean(raw.artifactSha256 || raw.innerArtifactSha256).toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('The manifest must contain a full 40-character commit hash.');
  if (!/^[a-f0-9]{64}$/.test(artifactSha256)) throw new Error('The manifest must contain the exact ZIP SHA-256.');
  for (const [name, value] of [['releaseArtifactSha256', raw.releaseArtifactSha256], ['localArtifactSha256', raw.localArtifactSha256], ['innerArtifactSha256', raw.innerArtifactSha256]]) {
    if (clean(value) && clean(value).toLowerCase() !== artifactSha256) throw new Error(`The manifest contains a conflicting ${name} claim.`);
  }
  const workflowHeadSha = clean(raw.workflowHeadSha || raw.recoveredFrom?.workflowHeadSha).toLowerCase();
  if (workflowHeadSha && workflowHeadSha !== commit) throw new Error('The manifest workflow head does not match its commit.');
  const localArtifact = clean(raw.localArtifact || raw.artifactName);
  if (!localArtifact || path.isAbsolute(localArtifact) || localArtifact.includes('/') || localArtifact.includes('\\') || localArtifact === '.' || localArtifact === '..') throw new Error('The retained ZIP must be a simple filename beside its manifest.');
  const expectedZip = path.resolve(manifestDir, localArtifact);
  if (expectedZip.toLowerCase() !== selectedZip.toLowerCase()) throw new Error('The selected ZIP does not match the manifest sibling artifact.');
  const relative = path.relative(manifestDir, expectedZip);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('The retained ZIP escapes its manifest folder.');
  const stat = fs.statSync(selectedZip);
  if (!stat.isFile()) throw new Error('The selected retained artifact is not a regular file.');
  if (raw.artifactSize != null && Number(raw.artifactSize) !== stat.size) throw new Error('The retained ZIP size does not match its manifest.');
  const actualSha256 = sha256File(selectedZip);
  if (actualSha256 !== artifactSha256) throw new Error('The retained ZIP hash does not match its manifest.');
  const binding = reviewedBindings.find((item) => clean(item.commit).toLowerCase() === commit && clean(item.artifactSha256).toLowerCase() === artifactSha256 && clean(item.repository).toLowerCase() === repository.toLowerCase() && clean(item.platform).toLowerCase() === 'windows-x64');
  return {
    manifestFile, zipPath: selectedZip, frozenSize: stat.size, artifactSha256, reviewedBinding: binding || null,
    candidate: {
      id: retainedBuildId(repository, commit, artifactSha256), manifestIdClaim: clean(raw.id), engine: 'IKEMEN GO', channel: repository.toLowerCase() === 'ikemen-engine/ikemen-go' ? (clean(raw.channel) || 'nightly') : 'custom', version: clean(raw.version) || 'nightly', artifactSha256,
      commit, platform: 'windows-x64', releaseId: Number(raw.releaseId) || 0, releaseTag: clean(raw.releaseTag) || 'retained', releaseUrl: clean(raw.releaseUrl || raw.workflowUrl),
      assetId: Number(raw.releaseAssetId || raw.assetId) || 0, workflowRunId: Number(raw.workflowRunId) || 0, workflowArtifactId: Number(raw.workflowArtifactId) || 0,
      artifactName: localArtifact, artifactSize: stat.size, publishedArtifactSha256: binding ? artifactSha256 : null,
      publishedAt: clean(raw.publishedAt || raw.recoveredAt) || null,
      provenance: { repository, branch: clean(raw.branch), releaseId: Number(raw.releaseId) || 0, tag: clean(raw.releaseTag) || 'retained', assetId: Number(raw.releaseAssetId || raw.assetId) || 0, workflowRunId: Number(raw.workflowRunId) || 0, workflowArtifactId: Number(raw.workflowArtifactId) || 0 }
    }
  };
}

function stageRetainedArtifact(review, stagingRoot) {
  if (fs.statSync(review.zipPath).size !== review.frozenSize || sha256File(review.zipPath) !== review.artifactSha256) throw new Error('The selected retained ZIP changed after review.');
  fs.mkdirSync(stagingRoot, { recursive: true });
  const zipPath = path.join(stagingRoot, review.candidate.artifactName);
  fs.copyFileSync(review.zipPath, zipPath, fs.constants.COPYFILE_EXCL);
  if (fs.statSync(zipPath).size !== review.frozenSize || sha256File(zipPath) !== review.artifactSha256) throw new Error('The staged retained ZIP failed its independent hash check.');
  return { ...review.candidate, zipPath, artifactSha256: review.artifactSha256, artifactIdentityStatus: review.reviewedBinding ? 'verified' : 'user-asserted', retainedArtifact: true };
}
async function acquireCandidate(candidate, stagingRoot, retainedReview = null) {
  return retainedReview ? stageRetainedArtifact(retainedReview, stagingRoot) : downloadCandidate(candidate, stagingRoot);
}

function classifyLocalFiles(root, baselineRoot, candidateRoot, accepted) {
  const install = [], preserve = [], conflicts = [], noops = [];
  for (const item of accepted.filter((entry) => entry.type === 'file')) {
    const relativeParts = item.relative.split('/'), live = path.join(root, ...relativeParts), baseline = path.join(baselineRoot, ...relativeParts), candidate = path.join(candidateRoot, ...relativeParts);
    if (!fs.existsSync(candidate)) throw new Error(`Candidate file is missing after extraction: ${item.relative}`);
    const candidateHash = sha256File(candidate);
    if (!fs.existsSync(live)) { install.push({ ...item, liveHash: null, candidateHash }); continue; }
    const liveHash = sha256File(live);
    if (liveHash === candidateHash) { noops.push({ ...item, liveHash, candidateHash }); continue; }
    if (!fs.existsSync(baseline)) { conflicts.push({ ...item, liveHash, candidateHash, baselineHash: null, reason: 'The candidate collides with a local file that has no verified baseline identity.' }); continue; }
    const baselineHash = sha256File(baseline);
    if (liveHash === baselineHash) install.push({ ...item, liveHash, baselineHash, candidateHash });
    else if (candidateHash === baselineHash) preserve.push({ ...item, liveHash, baselineHash, candidateHash, reason: 'Local customization retained because upstream did not change this file.' });
    else conflicts.push({ ...item, liveHash, baselineHash, candidateHash, reason: 'Both the local project and Nightly changed this file.' });
  }
  return { install, preserve, conflicts, noops };
}

function classifyObsoleteFiles(root, baselineRoot, candidateRoot, baselineAccepted, candidateAccepted) {
  const candidatePaths = new Set(candidateAccepted.filter((item) => item.type === 'file').map((item) => item.relative.toLowerCase()));
  const safeRemove = [], preserve = [], missing = [];
  for (const item of baselineAccepted.filter((entry) => entry.type === 'file' && !candidatePaths.has(entry.relative.toLowerCase()))) {
    const parts = item.relative.split('/'), live = path.join(root, ...parts), baseline = path.join(baselineRoot, ...parts), candidate = path.join(candidateRoot, ...parts);
    if (fs.existsSync(candidate)) continue;
    if (!fs.existsSync(live)) { missing.push(item); continue; }
    if (!fs.existsSync(baseline)) throw new Error(`Verified baseline file is missing after extraction: ${item.relative}`);
    const liveHash = sha256File(live), baselineHash = sha256File(baseline);
    if (liveHash === baselineHash) safeRemove.push({ ...item, liveHash, baselineHash, reason: 'Present in stable 1.0 but absent from the exact Nightly.' });
    else preserve.push({ ...item, liveHash, baselineHash, reason: 'Obsolete upstream path retained because the local copy was modified.' });
  }
  return { safeRemove, preserve, missing };
}

function runningFromRoot(root) {
  if (process.platform !== 'win32') return [];
  const script = `[pscustomobject]@{items=@(Get-CimInstance Win32_Process -Filter "Name='Ikemen_GO.exe'" -ErrorAction Stop | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($args[0],[StringComparison]::OrdinalIgnoreCase) } | Select-Object ProcessId,ExecutablePath)} | ConvertTo-Json -Depth 4 -Compress`;
  const value = powershellJson(script, [path.resolve(root)]); return Array.isArray(value.items) ? value.items : value.items ? [value.items] : [];
}
function walkFiles(root) {
  const out = []; if (!fs.existsSync(root)) return out;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Snapshot refused a link: ${full}`);
    if (entry.isDirectory()) out.push(...walkFiles(full)); else if (entry.isFile()) out.push(full);
  }
  return out;
}
function copyTree(source, destination) { if (!fs.existsSync(source)) return; fs.cpSync(source, destination, { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: false }); }
function snapshotEngine(root, backupRoot, metadata = {}) {
  const target = path.join(backupRoot, `ikemen-${clean(metadata.version || 'engine')}-${clean(metadata.commit || 'unknown').slice(0, 12)}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  if (fs.existsSync(target)) throw new Error(`Backup already exists: ${target}`); fs.mkdirSync(target, { recursive: true });
  const copied = [], exclusions = [];
  for (const name of [...safety.MANAGED_DIRECTORIES]) { const source = path.join(root, name); if (fs.existsSync(source)) { copyTree(source, path.join(target, name)); copied.push(name); } }
  for (const name of fs.readdirSync(root)) {
    const source = path.join(root, name), stat = fs.lstatSync(source), lower = name.toLowerCase();
    if (stat.isFile() && safety.MANAGED_ROOT_FILES.has(lower)) { fs.copyFileSync(source, path.join(target, name), fs.constants.COPYFILE_EXCL); copied.push(name); }
    else if (!copied.includes(name) && !safety.MANAGED_DIRECTORIES.has(lower)) exclusions.push(name);
  }
  const config = path.join(root, 'save', 'config.ini'); if (fs.existsSync(config)) { fs.mkdirSync(path.join(target, 'save'), { recursive: true }); fs.copyFileSync(config, path.join(target, 'save', 'config.ini')); copied.push('save/config.ini'); }
  if (metadata.registryFile && fs.existsSync(metadata.registryFile)) { fs.mkdirSync(path.join(target, '.ikemen'), { recursive: true }); fs.copyFileSync(metadata.registryFile, path.join(target, '.ikemen', 'project-registry.json')); copied.push('.ikemen/project-registry.json'); }
  const files = walkFiles(target).filter((file) => !file.endsWith('backup-manifest.json')).map((file) => ({ relative: path.relative(target, file).replace(/\\/g, '/'), size: fs.statSync(file).size, sha256: sha256File(file) }));
  for (const file of files) {
    const source = file.relative === '.ikemen/project-registry.json' ? metadata.registryFile : path.join(root, ...file.relative.split('/'));
    if (!source || !fs.existsSync(source) || sha256File(source) !== file.sha256) throw new Error(`Backup verification failed before migration: ${file.relative}`);
  }
  const manifest = { schemaVersion: 1, createdAt: new Date().toISOString(), sourceRoot: path.resolve(root), sourceIdentity: metadata.sourceIdentity || null, copied, exclusions, files };
  fs.writeFileSync(path.join(target, 'backup-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' }); return { target, manifest };
}
function acquireLock(journalRoot, migrationId) { fs.mkdirSync(journalRoot, { recursive: true }); const filename = path.join(journalRoot, 'engine-migration.lock'), fd = fs.openSync(filename, 'wx'); fs.writeFileSync(fd, `${JSON.stringify({ migrationId, pid: process.pid, createdAt: new Date().toISOString() }, null, 2)}\n`); return { filename, fd, release() { try { fs.closeSync(fd); } finally { if (fs.existsSync(filename)) fs.unlinkSync(filename); } } }; }
function writeJournal(filename, journal) { const temp = `${filename}.tmp`; fs.writeFileSync(temp, `${JSON.stringify(journal, null, 2)}\n`); fs.renameSync(temp, filename); }
function preflight(root, stagedRoot, accepted, backupRoot) {
  if (!fs.existsSync(path.join(root, 'Ikemen_GO.exe'))) throw new Error('The selected project root does not contain Ikemen_GO.exe.');
  if (runningFromRoot(root).length) throw new Error('IKEMEN GO is running from this engine root. Close it before migration.');
  fs.accessSync(root, fs.constants.R_OK | fs.constants.W_OK); fs.mkdirSync(backupRoot, { recursive: true }); fs.accessSync(backupRoot, fs.constants.R_OK | fs.constants.W_OK);
  const requiredBytes = accepted.reduce((sum, item) => sum + (Number(item.length) || 0), 0) * 2;
  const available = fs.statfsSync(backupRoot).bavail * fs.statfsSync(backupRoot).bsize; if (available < requiredBytes) throw new Error('The backup location does not have enough free space for staging and rollback data.');
  for (const item of accepted) if (!fs.existsSync(path.join(stagedRoot, ...item.relative.split('/')))) throw new Error(`Staged file is missing: ${item.relative}`);
}
function applyConfigMappings(text, plan) {
  let output = String(text);
  for (const change of plan.changes || []) {
    const sectionPattern = new RegExp(`(\\[${escapeRegex(change.fromSection)}\\][\\s\\S]*?)(?=\\r?\\n\\[|$)`, 'i');
    const section = sectionPattern.exec(output); if (!section) continue;
    const keyPattern = new RegExp(`^(\\s*)${escapeRegex(change.fromKey)}\\s*=.*$`, 'im');
    output = output.replace(sectionPattern, (block) => block.replace(keyPattern, `$1${change.toKey} = ${change.oldValue}`));
    if (change.fromSection.toLowerCase() !== change.toSection.toLowerCase()) {
      output = output.replace(sectionPattern, (block) => block.replace(new RegExp(`^\\s*${escapeRegex(change.toKey)}\\s*=.*(?:\\r?\\n)?`, 'im'), ''));
      const destination = new RegExp(`(\\[${escapeRegex(change.toSection)}\\][^\\r\\n]*\\r?\\n)`, 'i');
      output = destination.test(output) ? output.replace(destination, `$1${change.toKey} = ${change.oldValue}\n`) : `${output.trimEnd()}\n\n[${change.toSection}]\n${change.toKey} = ${change.oldValue}\n`;
    }
  }
  for (const addition of plan.additions || []) {
    const destination = new RegExp(`(\\[${escapeRegex(addition.section)}\\][^\\r\\n]*\\r?\\n)`, 'i');
    output = destination.test(output) ? output.replace(destination, `$1${addition.key} = ${addition.value}\n`) : `${output.trimEnd()}\n\n[${addition.section}]\n${addition.key} = ${addition.value}\n`;
  }
  return output;
}

function executeMigration(options) {
  const { root, stagedRoot, accepted, backupRoot, candidate, registryFile, oldTarget } = options, removals = options.removals || [], migrationId = `${candidate.commit.slice(0, 12)}-${Date.now()}`;
  const journalRoot = path.join(backupRoot, '.migration-state'), lock = acquireLock(journalRoot, migrationId), journalFile = path.join(journalRoot, `${migrationId}.json`);
  const journal = { schemaVersion: 1, migrationId, state: 'preparing', root: path.resolve(root), candidate, oldTarget, registryFile: registryFile || null,
    registryBeforeSha256: registryFile && fs.existsSync(registryFile) ? sha256File(registryFile) : null,
    oldInstalledRegistry: options.oldInstalledRegistry || null, oldCatalog: options.oldCatalog || null,
    createdAt: new Date().toISOString(), writes: [], removals: [], newlyIntroduced: [], backup: null };
  try {
    writeJournal(journalFile, journal); preflight(root, stagedRoot, accepted, backupRoot);
    const backup = snapshotEngine(root, backupRoot, { version: oldTarget?.version || '1.0.0', commit: oldTarget?.commit || '', sourceIdentity: oldTarget, registryFile }); journal.backup = backup.target; journal.state = 'backed-up'; writeJournal(journalFile, journal);
    for (const item of accepted) {
      const source = path.join(stagedRoot, ...item.relative.split('/')), destination = path.join(root, ...item.relative.split('/')), existed = fs.existsSync(destination);
      const beforeSha256 = existed && fs.statSync(destination).isFile() ? sha256File(destination) : null;
      if (Object.prototype.hasOwnProperty.call(item, 'liveHash') && (item.liveHash || null) !== beforeSha256) throw new Error(`Live engine file changed after review: ${item.relative}`);
      const intendedSha256 = sha256File(source);
      if (item.candidateHash && item.candidateHash !== intendedSha256) throw new Error(`Staged candidate file changed after review: ${item.relative}`);
      const entry = { relative: item.relative, existed, beforeSha256, intendedSha256, installedSha256: null, status: 'planned', rollbackStatus: null };
      journal.writes.push(entry); if (!existed) journal.newlyIntroduced.push(item.relative); journal.state = 'applying'; writeJournal(journalFile, journal);
      entry.status = 'in-progress'; writeJournal(journalFile, journal);
      fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(source, destination);
      options.hooks?.afterDurableMutation?.('write', item.relative, journalFile);
      const installedSha256 = sha256File(destination); if (installedSha256 !== intendedSha256) throw new Error(`Installed file failed post-copy verification: ${item.relative}`);
      entry.installedSha256 = installedSha256; entry.status = 'applied'; writeJournal(journalFile, journal);
    }
    for (const item of removals) {
      const destination = path.join(root, ...item.relative.split('/'));
      if (!fs.existsSync(destination)) continue;
      const beforeSha256 = sha256File(destination);
      if (item.liveHash && beforeSha256 !== item.liveHash) throw new Error(`Obsolete file changed after review: ${item.relative}`);
      const entry = { relative: item.relative, beforeSha256, status: 'planned', rollbackStatus: null };
      journal.removals.push(entry); journal.state = 'applying'; writeJournal(journalFile, journal);
      entry.status = 'in-progress'; writeJournal(journalFile, journal);
      fs.unlinkSync(destination); options.hooks?.afterDurableMutation?.('remove', item.relative, journalFile);
      entry.status = 'applied'; writeJournal(journalFile, journal);
    }
    journal.state = 'files-applied'; journal.executableSha256 = sha256File(path.join(root, 'Ikemen_GO.exe')); writeJournal(journalFile, journal);
    return { journal, journalFile, backup: backup.target, lock };
  } catch (error) {
    journal.state = 'failed'; journal.error = error.message; try { writeJournal(journalFile, journal); } catch (_) {}
    if (journal.backup) {
      try { rollbackMigration({ journal, journalFile, lock, hooks: options.hooks }); }
      catch (rollbackError) { throw new Error(`${error.message} Automatic rollback stopped: ${rollbackError.message}`); }
    } else lock.release();
    throw error;
  }
}
function finalizeMigration(result, details = {}) { result.journal.state = 'complete'; result.journal.completedAt = new Date().toISOString(); result.journal.newTarget = details.newTarget || null; writeJournal(result.journalFile, result.journal); result.lock.release(); return result.journal; }
function prepareRegistryWrite(result, serializedRegistry) { result.journal.registryAfterSha256 = sha256Bytes(serializedRegistry); result.journal.state = 'registry-prepared'; writeJournal(result.journalFile, result.journal); return result.journal.registryAfterSha256; }
function recordRegistryWrite(result) { if (result.journal.registryFile && fs.existsSync(result.journal.registryFile)) { const current = sha256File(result.journal.registryFile); if (result.journal.registryAfterSha256 && current !== result.journal.registryAfterSha256) throw new Error('Project registry bytes do not match the write-ahead identity.'); result.journal.registryAfterSha256 = current; } result.journal.state = 'registry-applied'; writeJournal(result.journalFile, result.journal); return result.journal; }
function markRegistryFailure(result, error) { result.journal.state = 'registry-failed'; result.journal.error = clean(error?.message || error); writeJournal(result.journalFile, result.journal); return result.journal; }
function pendingMigrations(backupRoot) { const root = path.join(backupRoot, '.migration-state'), recoverable = new Set(['backed-up', 'applying', 'files-applied', 'registry-prepared', 'registry-applied', 'registry-failed', 'rolling-back', 'rollback-conflict', 'rollback-backup-invalid']); if (!fs.existsSync(root)) return []; return fs.readdirSync(root).filter((name) => name.endsWith('.json')).map((name) => { try { return JSON.parse(fs.readFileSync(path.join(root, name), 'utf8')); } catch (_) { return null; } }).filter((item) => item && (recoverable.has(item.state) || item.state === 'failed' && item.backup)); }
function verifyRollbackBackup(journal) {
  if (!journal.backup) throw new Error('Rollback backup path is missing from the journal.');
  const manifestFile = path.join(journal.backup, 'backup-manifest.json');
  if (!fs.existsSync(manifestFile)) throw new Error('Rollback backup manifest is missing.');
  let manifest; try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch (error) { throw new Error(`Rollback backup manifest is invalid: ${error.message}`); }
  const recorded = new Map((manifest.files || []).map((item) => [String(item.relative || '').toLowerCase(), String(item.sha256 || '').toLowerCase()]));
  const required = [];
  for (const item of journal.writes || []) if (item.existed) required.push({ relative: item.relative, expected: item.beforeSha256 });
  for (const item of journal.removals || []) required.push({ relative: item.relative, expected: item.beforeSha256 });
  if (journal.registryFile && journal.registryBeforeSha256) required.push({ relative: '.ikemen/project-registry.json', expected: journal.registryBeforeSha256 });
  for (const item of required) {
    const expected = clean(item.expected).toLowerCase(); if (!/^[a-f0-9]{64}$/.test(expected)) throw new Error(`Rollback identity is missing for ${item.relative}.`);
    const manifestHash = recorded.get(item.relative.toLowerCase()); if (manifestHash !== expected) throw new Error(`Rollback manifest identity mismatch: ${item.relative}`);
    const backupFile = path.join(journal.backup, ...item.relative.split('/')); if (!fs.existsSync(backupFile) || !fs.statSync(backupFile).isFile()) throw new Error(`Rollback backup is missing: ${item.relative}`);
    if (sha256File(backupFile) !== expected) throw new Error(`Rollback backup failed integrity verification: ${item.relative}`);
  }
  return true;
}
function retainInterrupted(journal, journalFile, item, source, label = item.relative) {
  if (item.interruptedCopy && fs.existsSync(item.interruptedCopy)) return item.interruptedCopy;
  const retained = path.join(journal.backup, '.interrupted-current', ...String(label).split('/'));
  fs.mkdirSync(path.dirname(retained), { recursive: true });
  const target = fs.existsSync(retained) ? `${retained}.${Date.now()}` : retained;
  fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL); item.interruptedCopy = target; writeJournal(journalFile, journal); return target;
}
function rollbackMigration(result) {
  const journal = result.journal, conflicts = [], interrupted = [];
  try { verifyRollbackBackup(journal); }
  catch (error) { journal.state = 'rollback-backup-invalid'; journal.rollbackError = error.message; writeJournal(result.journalFile, journal); throw error; }
  for (const item of journal.writes || []) {
    if (item.rollbackStatus === 'complete') continue;
    const current = path.join(journal.root, ...item.relative.split('/')), exists = fs.existsSync(current), currentHash = exists && fs.statSync(current).isFile() ? sha256File(current) : null;
    const original = item.existed ? currentHash === item.beforeSha256 : !exists;
    const installed = currentHash && currentHash === (item.intendedSha256 || item.installedSha256);
    if (original || installed) continue;
    if ((item.status === 'in-progress' || item.rollbackStatus === 'in-progress') && exists) interrupted.push({ item, current, currentHash, label: item.relative });
    else conflicts.push({ relative: item.relative, currentSha256: currentHash || 'missing', installedSha256: item.intendedSha256 || item.installedSha256, reason: 'File changed after migration; automatic rollback would erase later work.' });
  }
  for (const item of journal.removals || []) {
    if (item.rollbackStatus === 'complete') continue;
    const current = path.join(journal.root, ...item.relative.split('/'));
    if (fs.existsSync(current) && (!fs.statSync(current).isFile() || sha256File(current) !== item.beforeSha256)) {
      if (item.rollbackStatus === 'in-progress' && fs.statSync(current).isFile()) interrupted.push({ item, current, currentHash: sha256File(current), label: item.relative });
      else conflicts.push({ relative: item.relative, currentSha256: fs.statSync(current).isFile() ? sha256File(current) : 'non-file', installedSha256: null, reason: 'An obsolete file reappeared with different content after migration; automatic rollback would erase later work.' });
    }
  }
  if (journal.registryFile && journal.registryBeforeSha256) {
    const exists = fs.existsSync(journal.registryFile), currentRegistryHash = exists && fs.statSync(journal.registryFile).isFile() ? sha256File(journal.registryFile) : null, known = [journal.registryBeforeSha256, journal.registryAfterSha256].filter(Boolean);
    if (!exists) {
      if (journal.registryRollbackStatus !== 'in-progress') conflicts.push({ relative: journal.registryFile, currentSha256: 'missing', installedSha256: journal.registryAfterSha256, reason: 'Project registry disappeared after migration; automatic rollback cannot attribute the deletion.' });
    } else if (!known.includes(currentRegistryHash)) {
      if (journal.registryRollbackStatus === 'in-progress') interrupted.push({ item: journal, current: journal.registryFile, currentHash: currentRegistryHash, label: '.ikemen/project-registry.interrupted.json' });
      else conflicts.push({ relative: journal.registryFile, currentSha256: currentRegistryHash, installedSha256: journal.registryAfterSha256, reason: 'Project registry changed after migration; automatic rollback would erase later work.' });
    }
  }
  if (conflicts.length) { journal.state = 'rollback-conflict'; journal.rollbackConflicts = conflicts; writeJournal(result.journalFile, journal); throw new Error(`Rollback stopped because ${conflicts.length} installed file(s) changed after migration. Both versions were preserved for manual recovery.`); }
  for (const partial of interrupted) retainInterrupted(journal, result.journalFile, partial.item, partial.current, partial.label);
  for (const item of [...(journal.writes || [])].reverse()) {
    if (item.rollbackStatus === 'complete') continue;
    const destination = path.join(journal.root, ...item.relative.split('/'));
    const currentHash = fs.existsSync(destination) && fs.statSync(destination).isFile() ? sha256File(destination) : null;
    if ((item.existed && currentHash === item.beforeSha256) || (!item.existed && !fs.existsSync(destination))) { item.rollbackStatus = 'complete'; writeJournal(result.journalFile, journal); continue; }
    item.rollbackStatus = 'in-progress'; journal.state = 'rolling-back'; writeJournal(result.journalFile, journal);
    if (!item.existed) { if (fs.existsSync(destination)) fs.unlinkSync(destination); result.hooks?.afterRollbackMutation?.('write', item.relative, result.journalFile); if (fs.existsSync(destination)) throw new Error(`Rollback failed to remove introduced file: ${item.relative}`); item.rollbackStatus = 'complete'; writeJournal(result.journalFile, journal); continue; }
    const backupFile = path.join(journal.backup, ...item.relative.split('/')); if (!fs.existsSync(backupFile)) throw new Error(`Rollback backup is missing: ${item.relative}`);
    fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(backupFile, destination); result.hooks?.afterRollbackMutation?.('write', item.relative, result.journalFile); if (sha256File(destination) !== item.beforeSha256) throw new Error(`Rollback restore verification failed: ${item.relative}`); item.rollbackStatus = 'complete'; writeJournal(result.journalFile, journal);
  }
  for (const item of [...(journal.removals || [])].reverse()) {
    if (item.rollbackStatus === 'complete') continue;
    const destination = path.join(journal.root, ...item.relative.split('/')), backupFile = path.join(journal.backup, ...item.relative.split('/'));
    if (fs.existsSync(destination) && fs.statSync(destination).isFile() && sha256File(destination) === item.beforeSha256) { item.rollbackStatus = 'complete'; writeJournal(result.journalFile, journal); continue; }
    if (!fs.existsSync(backupFile)) throw new Error(`Rollback backup is missing removed file: ${item.relative}`);
    item.rollbackStatus = 'in-progress'; journal.state = 'rolling-back'; writeJournal(result.journalFile, journal);
    fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(backupFile, destination); result.hooks?.afterRollbackMutation?.('remove', item.relative, result.journalFile); if (sha256File(destination) !== item.beforeSha256) throw new Error(`Rollback restore verification failed: ${item.relative}`); item.rollbackStatus = 'complete'; writeJournal(result.journalFile, journal);
  }
  if (journal.registryFile && journal.registryBeforeSha256) {
    const exists = fs.existsSync(journal.registryFile), currentHash = exists && fs.statSync(journal.registryFile).isFile() ? sha256File(journal.registryFile) : null;
    if (currentHash === journal.registryBeforeSha256) { journal.registryRollbackStatus = 'complete'; writeJournal(result.journalFile, journal); }
    else if (currentHash === journal.registryAfterSha256 || journal.registryRollbackStatus === 'in-progress') {
      const backupRegistry = path.join(journal.backup, '.ikemen', 'project-registry.json'); journal.registryRollbackStatus = 'in-progress'; journal.state = 'rolling-back'; writeJournal(result.journalFile, journal); fs.mkdirSync(path.dirname(journal.registryFile), { recursive: true }); fs.copyFileSync(backupRegistry, journal.registryFile); result.hooks?.afterRollbackMutation?.('registry', journal.registryFile, result.journalFile); if (sha256File(journal.registryFile) !== journal.registryBeforeSha256) throw new Error('Rollback project-registry restore verification failed.'); journal.registryRollbackStatus = 'complete'; writeJournal(result.journalFile, journal);
    }
  }
  for (const item of journal.writes || []) { const destination = path.join(journal.root, ...item.relative.split('/')); if (item.existed ? !fs.existsSync(destination) || sha256File(destination) !== item.beforeSha256 : fs.existsSync(destination)) throw new Error(`Rollback final verification failed: ${item.relative}`); }
  for (const item of journal.removals || []) { const destination = path.join(journal.root, ...item.relative.split('/')); if (!fs.existsSync(destination) || sha256File(destination) !== item.beforeSha256) throw new Error(`Rollback final verification failed: ${item.relative}`); }
  if (journal.registryFile && journal.registryBeforeSha256 && (!fs.existsSync(journal.registryFile) || sha256File(journal.registryFile) !== journal.registryBeforeSha256)) throw new Error('Rollback final verification failed: project registry');
  journal.state = 'rolled-back'; journal.rolledBackAt = new Date().toISOString(); writeJournal(result.journalFile, journal); result.lock?.release(); return journal;
}
function recoverPendingMigration(journalFile) {
  const journal = JSON.parse(fs.readFileSync(journalFile, 'utf8')), lockFile = path.join(path.dirname(journalFile), 'engine-migration.lock');
  const result = { journal, journalFile, lock: { release() { if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile); } } }; return rollbackMigration(result);
}

module.exports = { WRITE_AUTHORITY, CONFIG_MAPPINGS, sha256Bytes, sha256File, retainedBuildId, requestBuffer, fetchJson, chooseWindowsAsset, resolveExactRelease, resolveExactNightly, sameCandidate, inspectZip, commonArchiveRoot, extractZip, downloadCandidate, parseRetainedArtifact, stageRetainedArtifact, acquireCandidate, classifyLocalFiles, classifyObsoleteFiles, runningFromRoot, snapshotEngine, preflight, applyConfigMappings, executeMigration, finalizeMigration, prepareRegistryWrite, recordRegistryWrite, markRegistryFailure, pendingMigrations, verifyRollbackBackup, rollbackMigration, recoverPendingMigration };
