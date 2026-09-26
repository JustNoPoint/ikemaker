'use strict';

const https = require('https');
const crypto = require('crypto');
const path = require('path');
const knowledgeModel = require('./engine_knowledge_model');
const engineModel = require('./engine_registry_model');
const engineUpdateModel = require('./engine_update_model');
const BUILT_IN_ENGINE_CATALOG = require('../data/engine-capability-catalog.json');

const SNAPSHOT_KEY = 'ikemenZss.upstreamSnapshot.v1';
const REPORT_KEY = 'ikemenZss.upstreamReport.v1';
const CATALOG_KEY = 'ikemenZss.controllerCatalog.v1';
const ENGINE_CATALOG_KEY = 'ikemenZss.engineCapabilityCatalog.v1';
const ENGINE_DECISIONS_KEY = 'ikemenZss.engineUpdateDecisions.v1';
const SCTRL_URL = 'https://potsmugen.github.io/ikemen-merged-docs/sctrl';

const SOURCES = [
  // Retain the historical storage id so existing snapshots migrate without
  // resetting their comparison baseline; the monitored source is now latest.
  { id: 'release', name: 'Latest IKEMEN Release', kind: 'json', url: 'https://api.github.com/repos/ikemen-engine/Ikemen-GO/releases/latest', docs: 'https://github.com/ikemen-engine/Ikemen-GO/releases/latest' },
  { id: 'wiki', name: 'Official Ikemen GO Wiki', kind: 'html', url: 'https://github.com/ikemen-engine/Ikemen-GO/wiki', docs: 'https://github.com/ikemen-engine/Ikemen-GO/wiki' },
  { id: 'sctrl', name: 'Merged State Controllers', kind: 'features', url: SCTRL_URL, docs: SCTRL_URL },
  { id: 'triggers', name: 'Merged Triggers', kind: 'features', url: 'https://potsmugen.github.io/ikemen-merged-docs/triggers', docs: 'https://potsmugen.github.io/ikemen-merged-docs/triggers' },
  { id: 'redirections', name: 'Merged Redirections', kind: 'features', url: 'https://potsmugen.github.io/ikemen-merged-docs/redirections', docs: 'https://potsmugen.github.io/ikemen-merged-docs/redirections' }
];

const BUILD_SOURCES = {
  releases: 'https://api.github.com/repos/ikemen-engine/Ikemen-GO/releases?per_page=20',
  develop: 'https://api.github.com/repos/ikemen-engine/Ikemen-GO/commits/develop'
};

function fetchText(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects.'));
    const request = https.get(url, {
      headers: { 'User-Agent': 'JustNoPoint-IKEMEN-ZSS-Tools', Accept: 'application/vnd.github+json, text/html;q=0.9, */*;q=0.8' }
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        return resolve(fetchText(new URL(response.headers.location, url).toString(), redirects + 1));
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        return reject(new Error(`HTTP ${response.statusCode} from ${url}`));
      }
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    request.setTimeout(15000, () => request.destroy(new Error('Request timed out.')));
    request.on('error', reject);
  });
}

function digest(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function decodeHtml(value) {
  return String(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:nbsp|#160);/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/\s+/g, ' ').trim();
}

function extractFeatures(html) {
  const values = new Set();
  const pattern = /<a\s+href="#([^"]+)">([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const label = decodeHtml(match[2]);
    if (/\((?:new|changed|old)\)$/i.test(label)) values.add(label);
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

function splitControllerNames(label) {
  return label
    .replace(/\s*\((?:new|changed|old)\)\s*$/i, '')
    .split(/\s*,\s*|\s+\/\s+|\s+and\s+/i)
    .map((name) => name.replace(/\s*(?:\[[^\]]+\]|\([^\)]+\))\s*/g, '').trim())
    .filter((name) => /^[A-Za-z][A-Za-z0-9]+$/.test(name));
}

function buildControllerCatalog(html, currentCatalog) {
  const rank = { old: 1, changed: 2, new: 3 };
  const discovered = new Map();
  const pattern = /<a\s+href="#([^"]+)">([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const label = decodeHtml(match[2]);
    const statusMatch = label.match(/\((new|changed|old)\)$/i);
    if (!statusMatch) continue;
    const status = statusMatch[1].toLowerCase();
    for (const name of splitControllerNames(label)) {
      const key = name.toLowerCase();
      const existing = discovered.get(key);
      if (!existing || rank[status] > rank[existing.status]) {
        discovered.set(key, { name, status, url: `${SCTRL_URL}#${match[1]}` });
      }
    }
  }
  if (discovered.size < 100) throw new Error(`Controller extraction returned only ${discovered.size} entries; registry update refused.`);

  const current = new Map(currentCatalog.map((item) => [item.name.toLowerCase(), item]));
  const catalog = [...discovered.values()].map((found) => {
    const old = current.get(found.name.toLowerCase());
    return old
      ? { ...old, name: found.name, status: found.status, url: found.url }
      : { name: found.name, status: found.status, description: 'New controller discovered in the merged Ikemen documentation. Review the linked documentation before use.', params: [], url: found.url };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const oldNames = new Set(currentCatalog.map((item) => item.name.toLowerCase()));
  const newNames = new Set(catalog.map((item) => item.name.toLowerCase()));
  return {
    catalog,
    added: catalog.filter((item) => !oldNames.has(item.name.toLowerCase())).map((item) => item.name),
    removed: currentCatalog.filter((item) => !newNames.has(item.name.toLowerCase())).map((item) => item.name),
    changed: catalog.filter((item) => {
      const old = current.get(item.name.toLowerCase());
      return old && (old.status !== item.status || old.url !== item.url);
    }).map((item) => item.name)
  };
}

function difference(left = [], right = []) {
  const set = new Set(right.map((value) => value.toLowerCase()));
  return left.filter((value) => !set.has(value.toLowerCase()));
}

function compareSnapshots(previous, current) {
  return SOURCES.map((source) => {
    const before = previous && previous.sources ? previous.sources[source.id] : null;
    const after = current.sources[source.id];
    if (!after || after.error) return { source, status: 'error', error: after ? after.error : 'No response.' };
    if (!before || before.error) return { source, status: 'baseline', added: [], removed: [] };
    if (before.marker === after.marker) return { source, status: 'unchanged', added: [], removed: [] };
    return { source, status: 'changed', added: difference(after.features, before.features), removed: difference(before.features, after.features) };
  });
}

function due(previous, intervalDays, now = Date.now()) {
  return !previous || !previous.checkedAt || now - Date.parse(previous.checkedAt) >= intervalDays * 86400000;
}

async function discoverBuilds(fetcher, checkedAt) {
  const observations = [], sources = {};
  try {
    const releaseText = await fetcher(BUILD_SOURCES.releases), releases = JSON.parse(releaseText);
    sources['github-releases'] = { marker: digest(releaseText), features: [], docs: 'https://github.com/ikemen-engine/Ikemen-GO/releases' };
    for (const release of Array.isArray(releases) ? releases : []) {
      if (!release.tag_name) continue;
      let commit = '';
      try { commit = JSON.parse(await fetcher(`https://api.github.com/repos/ikemen-engine/Ikemen-GO/commits/${encodeURIComponent(release.tag_name)}`)).sha || ''; } catch (_) {}
      const nightly = /^nightly$/i.test(release.tag_name), assets = Array.isArray(release.assets) ? release.assets : [];
      const windows = assets.filter((asset) => /windows/i.test(asset.name || '') && !/(?:arm|32|x86)/i.test(asset.name || '') && /\.zip$/i.test(asset.name || ''));
      const asset = windows.length === 1 ? windows[0] : null, publishedDigest = /^sha256:([a-f0-9]{64})$/i.exec(String(asset?.digest || ''));
      observations.push({ channel: nightly ? 'nightly' : /^v?\d+\.\d+\.\d+$/.test(release.tag_name) ? 'stable' : 'patch', version: nightly ? 'nightly' : release.tag_name.replace(/^v/, ''), tag: release.tag_name, commit,
        platform: asset ? 'windows-x64' : 'unknown', publishedAt: release.published_at, releaseId: release.id, releaseTag: release.tag_name,
        assetId: asset?.id, artifactName: asset?.name, artifactUrl: asset?.browser_download_url, artifactSize: asset?.size,
        publishedArtifactSha256: publishedDigest?.[1] || null,
        monitorOnly: nightly || !commit || !asset, sourceId: 'github-releases', url: release.html_url, revision: release.tag_name, observedAt: checkedAt });
    }
  } catch (error) { sources['github-releases'] = { error: error.message, features: [], docs: 'https://github.com/ikemen-engine/Ikemen-GO/releases' }; }
  try {
    const developText = await fetcher(BUILD_SOURCES.develop), data = JSON.parse(developText);
    sources['github-develop'] = { marker: data.sha || digest(developText), features: [], docs: 'https://github.com/ikemen-engine/Ikemen-GO/commits/develop' };
    if (data.sha) observations.push({ channel: 'nightly', version: 'nightly', commit: data.sha, platform: 'unknown', publishedAt: data.commit?.committer?.date || data.commit?.author?.date || null,
      monitorOnly: true, sourceId: 'github-develop', url: data.html_url, revision: data.sha, observedAt: checkedAt });
  } catch (error) { sources['github-develop'] = { error: error.message, features: [], docs: 'https://github.com/ikemen-engine/Ikemen-GO/commits/develop' }; }
  return { observations, sources };
}

async function discoverCustomCatalogs(fetcher, checkedAt, urls = []) {
  const sources = {}, observations = [], capabilities = [];
  for (let index = 0; index < urls.length; index += 1) {
    const url = String(urls[index] || '').trim(), id = `custom-catalog-${index + 1}`;
    if (!/^https:\/\//i.test(url)) { sources[id] = { error: 'Only HTTPS custom knowledge sources are accepted.', features: [], docs: url }; continue; }
    try {
      const text = await fetcher(url), parsed = JSON.parse(text), checked = engineModel.validateCatalog(parsed);
      if (!checked.valid) throw new Error(checked.issues.map((item) => item.message).join(' '));
      sources[id] = { marker: digest(text), features: [], docs: url };
      for (const build of checked.catalog.builds) observations.push({ ...build, sourceId: id, url, revision: build.source?.revision || digest(text), observedAt: checkedAt,
        artifactSha256: null, executableSha256: null, monitorOnly: true });
      for (const item of checked.catalog.capabilities) capabilities.push({ ...item, ikemakerSupport: 'discovered', evidence: [{ sourceId: id, url, revision: digest(text), observedAt: checkedAt, domain: 'source', status: 'observed', note: 'Claim imported from a configured declarative catalog; local verification was not inherited.' }] });
    } catch (error) { sources[id] = { error: error.message, features: [], docs: url }; }
  }
  return { sources, observations, capabilities };
}

async function buildSnapshot(fetcher = fetchText, customSources = []) {
  const checkedAt = new Date().toISOString();
  const pairs = await Promise.all(SOURCES.map(async (source) => {
    try {
      const text = await fetcher(source.url);
      let marker = digest(text);
      const features = source.kind === 'features' ? extractFeatures(text) : [];
      if (source.kind === 'json') {
        const data = JSON.parse(text);
        marker = [data.id, data.published_at, data.updated_at, data.target_commitish].filter(Boolean).join('|') || marker;
      }
      return [source.id, { marker, features, docs: source.docs, text: source.id === 'sctrl' ? text : undefined }];
    } catch (error) {
      return [source.id, { error: error.message, features: [] }];
    }
  }));
  const discovered = await discoverBuilds(fetcher, checkedAt);
  const custom = await discoverCustomCatalogs(fetcher, checkedAt, customSources);
  return { checkedAt, sources: { ...Object.fromEntries(pairs), ...discovered.sources, ...custom.sources }, buildObservations: [...discovered.observations, ...custom.observations], customCapabilities: custom.capabilities };
}

function candidateToken(label) {
  const clean = label.replace(/\s*\((?:new|changed|old)\)\s*$/i, '');
  const match = clean.match(/[A-Za-z_][A-Za-z0-9_.]*/);
  return match && match[0].length > 2 ? match[0] : null;
}

function parseDefSourcePaths(text) {
  const values = [];
  let inFiles = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/;.*/, '').trim();
    const section = /^\[([^\]]+)\]$/.exec(line);
    if (section) {
      inFiles = section[1].trim().toLowerCase() === 'files';
      continue;
    }
    if (!inFiles || !line.includes('=')) continue;
    const value = line.slice(line.indexOf('=') + 1).trim().replace(/^"|"$/g, '');
    if (!value || !/\.(?:zss|cns|st|jnp|cmd|def)$/i.test(value)) continue;
    values.push(value);
  }
  return [...new Set(values.map((value) => value.replace(/\\/g, '/')))];
}

async function collectDefSourceUris(vscode, defUri) {
  const uris = [defUri];
  let text;
  try { text = Buffer.from(await vscode.workspace.fs.readFile(defUri)).toString('utf8'); } catch (_) { return uris; }
  for (const relative of parseDefSourcePaths(text)) {
    const uri = vscode.Uri.file(path.resolve(path.dirname(defUri.fsPath), relative));
    try {
      await vscode.workspace.fs.stat(uri);
      uris.push(uri);
    } catch (_) {
      // Missing optional files remain visible to IKEMEN itself; skip them here.
    }
  }
  return uris;
}

async function findWorkspaceUsages(vscode, removed, maxFiles, scopeDef) {
  if (!removed.length || !vscode.workspace.workspaceFolders) return [];
  const uris = scopeDef
    ? await collectDefSourceUris(vscode, scopeDef)
    : await vscode.workspace.findFiles('**/*.{zss,cns,st,jnp,cmd,def}', '**/{.git,node_modules}/**', maxFiles);
  const found = [];
  for (const uri of uris) {
    let text;
    try { text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8'); } catch (_) { continue; }
    for (const label of removed) {
      const token = candidateToken(label);
      if (!token) continue;
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escaped}\\b`, 'i').test(text)) found.push({ label, uri });
    }
  }
  return found;
}

function makeReport(snapshot, changes, registryDiff, usages, scopeLabel) {
  const lines = ['IKEMEN GO RELEASE / DOCUMENTATION UPDATE REPORT', `Checked: ${snapshot.checkedAt}`, ''];
  if (scopeLabel) lines.push(`Migration scan scope: ${scopeLabel} and its [Files] entries`, '');
  for (const change of changes) {
    lines.push(change.source.name.toUpperCase(), `Status: ${change.status}`);
    if (change.error) lines.push(`Error: ${change.error}`);
    if (change.status === 'changed') {
      lines.push(`Added feature headings: ${change.added.length}`, ...change.added.slice(0, 100).map((name) => `  + ${name}`));
      lines.push(`Removed/renamed headings: ${change.removed.length}`, ...change.removed.slice(0, 100).map((name) => `  - ${name}`));
      if (!change.added.length && !change.removed.length) lines.push('Content changed without a feature-heading change; review the linked source.');
    }
    lines.push(`Documentation: ${change.source.docs}`, '');
  }
  if (registryDiff) {
    lines.push('STATE CONTROLLER EXPLORER UPDATE PREVIEW',
      `Controllers after update: ${registryDiff.catalog.length}`,
      `Added: ${registryDiff.added.length}${registryDiff.added.length ? ` - ${registryDiff.added.join(', ')}` : ''}`,
      `Removed: ${registryDiff.removed.length}${registryDiff.removed.length ? ` - ${registryDiff.removed.join(', ')}` : ''}`,
      `Reclassified or relinked: ${registryDiff.changed.length}${registryDiff.changed.length ? ` - ${registryDiff.changed.join(', ')}` : ''}`,
      'Existing parameter templates are preserved. New controllers are inserted safely with no active parameters.', '');
  }
  if (usages.length) {
    lines.push('WORKSPACE MIGRATION CANDIDATES', ...usages.map((item) => `- ${item.label}: ${item.uri.fsPath}`),
      '', 'Suggested action: review the linked docs, then adapt each use with preview and gameplay testing.', '');
  } else lines.push('No workspace uses of removed/renamed candidates were found.', '');
  lines.push('No project source code is changed automatically.');
  return lines.join('\n');
}

function activeProject(vscode) {
  try {
    const projectContext = require('./project_context_ui'), contextModel = require('./project_context_model');
    const uri = projectContext.activeUri(), root = projectContext.contextRoot(uri) || projectContext.workspaceRoot(uri); if (!root) return null;
    const loaded = projectContext.readRegistry(root), inferred = uri?.fsPath ? contextModel.contextFor(uri.fsPath, root, loaded.registry) : null;
    const project = inferred?.project || loaded.registry.projects.find((item) => item.id !== 'universal') || loaded.registry.projects[0];
    return project ? { root, loaded, project } : null;
  } catch (_) { return null; }
}
function newestNightly(catalog) {
  return engineModel.normalizeCatalog(catalog).builds.filter((item) => item.channel === 'nightly' && item.commit && item.assetId && item.artifactUrl)
    .sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0))[0] || null;
}
async function offerProjectEngineDecision(vscode, context, catalog, changes, usages, report) {
  const active = activeProject(vscode), candidate = newestNightly(catalog); if (!active || !candidate || active.project.engineTarget?.commit === candidate.commit) return report;
  const fingerprint = digest(JSON.stringify(active.project)), decisions = context.globalState.get(ENGINE_DECISIONS_KEY, {});
  if (!engineUpdateModel.shouldPrompt(decisions, active.project, candidate, { projectFingerprint: fingerprint })) return report;
  const sourceErrors = changes.filter((item) => item.status === 'error').map((item) => `${item.source.name}: ${item.error}`), removed = changes.flatMap((item) => item.removed || []);
  const risk = engineUpdateModel.riskAssessment({ candidate, sourceErrors, removed, workspaceMatches: usages, projectMaturity: 'early',
    semanticChanges: ['Nightly may intentionally change compatibility and runtime defaults.'], configMigrations: ['Known 1.0 → Nightly INI key migrations'],
    onlineChanges: ['Online/rollback changes require matched-peer verification.'], runtimeSurface: ['Collision, corner-push, renderer, stage, motif, Lua, or compiler deltas require focused tests.'] });
  const appended = `${report}\n\nPROJECT ENGINE DECISION\nProject: ${active.project.name}\nCurrent: ${active.project.engineTarget.version} · ${active.project.engineTarget.channel} · ${(active.project.engineTarget.commit || 'unknown').slice(0, 12)}\nCandidate: Nightly · ${candidate.commit.slice(0, 12)}\nRisk: ${risk.summary}\nReasons:\n${risk.reasons.map((item) => `- ${item.reason}`).join('\n') || '- No scored change evidence.'}\nEvidence gaps:\n${risk.unknowns.map((item) => `- ${item}`).join('\n') || '- None identified.'}\n\nNo engine or project content was changed by this check.`;
  const action = await vscode.window.showWarningMessage(`A newer exact IKEMEN Nightly is available for ${active.project.name}. ${risk.summary}`, { modal: true, detail: `Current ${(active.project.engineTarget.commit || 'unknown').slice(0, 12)} → candidate ${candidate.commit.slice(0, 12)}\n\nStay records this decision only for this project and immutable candidate. Remind waits seven days. Review performs no writes until a separate migration approval.` }, 'Stay on current build', 'Review migration', 'Remind in 7 days', 'View Report');
  if (action === 'Stay on current build') await context.globalState.update(ENGINE_DECISIONS_KEY, engineUpdateModel.recordDecision(decisions, active.project, candidate, 'stay', { projectFingerprint: fingerprint }));
  if (action === 'Remind in 7 days') await context.globalState.update(ENGINE_DECISIONS_KEY, engineUpdateModel.recordDecision(decisions, active.project, candidate, 'remind', { projectFingerprint: fingerprint, remindAfter: new Date(Date.now() + 7 * 86400000).toISOString() }));
  if (action === 'Review migration') await vscode.commands.executeCommand('ikemen.engineMigration.review', { root: active.root, projectId: active.project.id, candidate, risk });
  if (action === 'View Report') return { report: appended, show: true };
  return { report: appended, show: false };
}

function createUpdateMonitor(vscode, context, builtInCatalog, applyCatalog) {
  const output = vscode.window.createOutputChannel('IKEMEN Upstream Updates');

  async function showLastReport() {
    output.clear(); output.appendLine(context.globalState.get(REPORT_KEY, 'No update report has been generated yet.')); output.show(true);
  }

  async function check({ manual = false, scopeDef } = {}) {
    const config = vscode.workspace.getConfiguration('ikemenZss.updates');
    if (!manual && !config.get('enabled', true)) return;
    const previous = context.globalState.get(SNAPSHOT_KEY);
    if (!manual && !due(previous, Math.max(1, config.get('intervalDays', 7)))) return;
    try {
      return await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Checking IKEMEN releases and documentation', cancellable: false }, async () => {
        const customSources = vscode.workspace.getConfiguration('ikemenZss.engine').get('customKnowledgeSources', []);
        const attempted = await buildSnapshot(fetchText, customSources);
        const snapshot = knowledgeModel.mergeSnapshot(previous, attempted);
        const changes = compareSnapshots(previous, snapshot);
        const currentCatalog = context.globalState.get(CATALOG_KEY, builtInCatalog);
        let registryDiff;
        if (snapshot.sources.sctrl && snapshot.sources.sctrl.text) registryDiff = buildControllerCatalog(snapshot.sources.sctrl.text, currentCatalog);
        const removed = [...changes.flatMap((item) => item.removed || []), ...(registryDiff ? registryDiff.removed : [])];
        const usages = await findWorkspaceUsages(vscode, removed, config.get('maxWorkspaceFiles', 1000), scopeDef);
        const scopeLabel = scopeDef ? vscode.workspace.asRelativePath(scopeDef, false) : '';
        const currentEngineCatalog = context.globalState.get(ENGINE_CATALOG_KEY, BUILT_IN_ENGINE_CATALOG);
        const engineRefresh = knowledgeModel.refreshCatalog(currentEngineCatalog, snapshot);
        let report = `${makeReport(snapshot, changes, registryDiff, usages, scopeLabel)}\n\nENGINE KNOWLEDGE CATALOG\nCatalog revision: ${engineRefresh.catalog.catalogRevision}\nExact/candidate builds known: ${engineRefresh.catalog.builds.length}\nCapabilities observed: ${engineRefresh.catalog.capabilities.length}\nRefresh promoted: ${engineRefresh.promoted ? 'yes' : 'no'}\nMetadata changed: ${engineRefresh.changed ? 'yes' : 'no'}\nValidation issues: ${engineRefresh.issues.length}`;
        const storedSnapshot = JSON.parse(JSON.stringify(snapshot));
        if (storedSnapshot.sources.sctrl) delete storedSnapshot.sources.sctrl.text;
        await context.globalState.update(SNAPSHOT_KEY, storedSnapshot);
        if (engineRefresh.promoted) await context.globalState.update(ENGINE_CATALOG_KEY, engineRefresh.catalog);
        await context.globalState.update(REPORT_KEY, report);
        output.clear(); output.appendLine(report);

        const decision = await offerProjectEngineDecision(vscode, context, engineRefresh.catalog, changes, usages, report);
        if (decision?.report && decision.report !== report) { report = decision.report; await context.globalState.update(REPORT_KEY, report); output.clear(); output.appendLine(report); }
        if (decision?.show) output.show(true);

        const changed = changes.some((item) => item.status === 'changed');
        const hasRegistryDiff = registryDiff && (registryDiff.added.length || registryDiff.removed.length || registryDiff.changed.length);
        const actions = ['View Report'];
        const offlineActions = vscode.workspace.getConfiguration('ikemenZss.docs').get('offlineUpdatesEnabled', true);
        if (offlineActions) actions.push('Open Offline Library');
        if (offlineActions && (manual || changed || hasRegistryDiff)) actions.push('Update Offline Library');
        if (hasRegistryDiff) actions.unshift('Update Controller Explorer');
        if (changed || usages.length) actions.push('Audit Workspace');
        const message = !previous ? 'IKEMEN update baseline established.'
          : changed || hasRegistryDiff ? `IKEMEN changes found; ${usages.length} workspace migration candidate(s).`
            : 'No IKEMEN feature or controller-registry changes found.';
        const action = await vscode.window.showInformationMessage(message, ...actions);
        if (action === 'View Report') output.show(true);
        if (action === 'Open Offline Library') await vscode.commands.executeCommand('ikemen.docs.openOffline');
        if (action === 'Update Offline Library') await vscode.commands.executeCommand('ikemen.docs.updateOffline');
        if (action === 'Audit Workspace') await vscode.commands.executeCommand('zss.audit.workspace');
        if (action === 'Update Controller Explorer' && registryDiff) {
          await context.globalState.update(CATALOG_KEY, registryDiff.catalog);
          applyCatalog(registryDiff.catalog);
          vscode.window.showInformationMessage(`ZSS State Controllers updated to ${registryDiff.catalog.length} entries.`);
        }
        return { snapshot, changes, registryDiff, engineRefresh, usages, report };
      });
    } catch (error) {
      output.appendLine(`Update check failed: ${error.message}`);
      const action = await vscode.window.showWarningMessage(`IKEMEN update check failed: ${error.message}`, 'Show Details');
      if (action === 'Show Details') output.show(true);
    }
  }

  function schedule() {
    const timer = setTimeout(() => check({ manual: false }), 2000);
    context.subscriptions.push({ dispose: () => clearTimeout(timer) });
  }

  return { check, showLastReport, schedule, output };
}

module.exports = {
  SOURCES, BUILD_SOURCES, fetchText, extractFeatures, buildControllerCatalog, compareSnapshots,
  discoverBuilds, discoverCustomCatalogs, buildSnapshot, due, makeReport, parseDefSourcePaths, createUpdateMonitor,
  ENGINE_CATALOG_KEY, ENGINE_DECISIONS_KEY, BUILT_IN_ENGINE_CATALOG, activeProject, newestNightly, offerProjectEngineDecision
};
