'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { setImmediate: yieldBetweenSources } = require('node:timers/promises');
const { parseDef, sections, unquote, value } = require('./def_model');
const { configValue, resolveCharacterStateFiles, resolveEngineCommonStates } = require('./state_transfer_catalog');
const { relativePath, readMappedText, checkedRange, openVerifiedText } = require('./ikemeter_findings');
const { MAX_SOURCE_BYTES, inspectWatchStates, retainCandidate, scanWatchSource, watchIdentity } = require('./ikemeter_watch_source');
const { stateTrace } = require('./ikemeter_watch_state_trace');

const MAX_ASSIGNMENTS = 32;
const MAX_COMMON_ASSIGNMENTS = 16;
const MAX_DEF_BYTES = 256 * 1024;
const MAX_TOTAL_SOURCE_BYTES = 4 * MAX_SOURCE_BYTES;
const MAX_SITES_PER_GROUP = 40;
const MAX_SKIP_DETAILS = 6;
const CODE_ENTRY = /^(?:st\d*|stcommon|cmd)$/i;

function projectMapping(folder) {
  if (folder?.uri?.scheme !== 'file' || !path.isAbsolute(folder.uri.fsPath)) throw new Error('Choose an open local project folder.');
  const workspacePath = path.resolve(folder.uri.fsPath);
  return { workspacePath, root: fs.realpathSync.native(workspacePath) };
}

function projectResource(root, filename) {
  return relativePath(path.relative(root, filename).split(path.sep).join('/'));
}

function comparisonPath(filename) {
  return process.platform === 'win32' ? filename.toLowerCase() : filename;
}

function inventoryIdentity(sources) {
  return JSON.stringify(sources.map(source => [comparisonPath(source.resource), source.role, source.language]));
}

function localCommonSources(vscode, mapping, owner, admitPath) {
  const { root } = mapping, dependencies = [], notes = [], limitations = [];
  function load(filename) {
    if (!admitPath(filename) || !fs.existsSync(filename)) return null;
    const resource = projectResource(root, filename);
    try {
      const snapshot = readMappedText(vscode, mapping, resource, MAX_DEF_BYTES);
      dependencies.push([resource, snapshot.sha256]);
      return snapshot;
    } catch (error) {
      limitations.push(`${resource} · ${error.message}`);
      return null;
    }
  }
  function linkedFile(assigned, directories) {
    for (const directory of assigned ? directories : []) {
      const filename = path.resolve(directory, assigned);
      if (admitPath(filename) && fs.existsSync(filename)) return load(filename);
    }
    return null;
  }
  const defaults = load(path.join(root, 'resources', 'defaultConfig.ini'));
  const user = load(path.join(root, 'save', 'config.ini'));
  const defaultText = defaults?.content || '', userText = user?.content || '';
  const motifName = configValue(defaultText, defaults?.filename, userText, user?.filename, 'config', 'motif');
  const motif = linkedFile(motifName, [root, path.join(root, 'data')]);
  const fightName = motif ? unquote(value(sections(parseDef(motif.content, motif.filename), 'files')[0], 'fight', '')) : '';
  const fight = linkedFile(fightName, [motif ? path.dirname(motif.filename) : root, root, path.join(root, 'data')]);
  const searchDirectories = [owner.filename, motif?.filename, fight?.filename].filter(Boolean).map(filename => path.dirname(filename));
  searchDirectories.push(root, path.join(root, 'data'));
  const common = resolveEngineCommonStates(defaults?.filename, defaultText, user?.filename, userText,
    searchDirectories, new Map(), 'states', { admitPath, assignmentLimit: MAX_COMMON_ASSIGNMENTS });
  if (common.files.length) notes.push('Common.States sources come from the selected project’s current local configuration.');
  else notes.push('No local Common.States assignment was resolved. The search includes global controllers and stcommon assigned by the selected DEF.');
  return { ...common, dependencies, limitations: [...limitations, ...common.limitations], notes };
}

function resolveOwnerInventory(vscode, mapping, ownerResource, ownerHash, includeCommon = false) {
  if (!/\.def$/i.test(ownerResource)) throw new Error('Choose a local character DEF.');
  const owner = readMappedText(vscode, mapping, ownerResource, MAX_DEF_BYTES);
  if (ownerHash !== undefined && owner.sha256 !== ownerHash) throw new Error('The selected DEF changed. Search its candidates again.');
  const files = sections(parseDef(owner.content, owner.filename), 'files');
  if (files.length !== 1) throw new Error('The candidate DEF needs one unambiguous [Files] section.');
  const assignments = files[0].entries.filter(entry => CODE_ENTRY.test(entry.normalized));
  if (new Set(assignments.map(entry => entry.normalized)).size !== assignments.length) {
    throw new Error('The candidate DEF repeats a code assignment. Resolve the ambiguity before searching.');
  }
  const admitPath = filename => {
    try { projectResource(mapping.root, filename); return true; }
    catch { return false; }
  };
  const inventory = resolveCharacterStateFiles(owner.filename, owner.content,
    { root: mapping.root, assignmentLimit: MAX_ASSIGNMENTS, admitPath });
  const common = includeCommon ? localCommonSources(vscode, mapping, owner, admitPath) : null;
  const sourceFiles = new Map();
  for (const item of [...inventory.files, ...(common?.files || [])]) {
    const resource = projectResource(mapping.root, item.filename), key = comparisonPath(resource), previous = sourceFiles.get(key);
    if (previous && item.role !== 'stcommon' && !item.role.startsWith('config:')) continue;
    sourceFiles.set(key, { resource, role: item.role, language: /\.zss$/i.test(item.filename) ? 'zss' : 'cns' });
  }
  return { owner, sources: [...sourceFiles.values()], missing: [...inventory.limitations, ...(common?.limitations || [])],
    commonDependencies: common?.dependencies || [], scopeNotes: common?.notes || [],
    omittedAssignments: (inventory.omittedAssignments || 0) + (common?.omittedAssignments || 0) };
}

function rangeFromWatchSite(site) {
  return { start: { line: site.line - 1, character: site.column - 1 }, end: { line: site.endLine - 1, character: site.endColumn - 1 } };
}

function positionBefore(a, b) {
  return a.line < b.line || a.line === b.line && a.character < b.character;
}

function overlaps(a, b) {
  return positionBefore(a.start, b.end) && positionBefore(b.start, a.end);
}

async function scanWatchScope(vscode, mapping, ownerResource, row, current = () => true) {
  if (!watchIdentity(row) || row.event === 'gap') throw new Error('This observation has no available key or authored ID to search.');
  const traced = Boolean(row.stateContext);
  const { owner, sources, missing, omittedAssignments, scopeNotes, commonDependencies } =
    resolveOwnerInventory(vscode, mapping, ownerResource, undefined, traced);
  const groups = { write: [], spawn: [], read: [], unresolved: [] };
  const reportsByPath = new Map(), scannedSources = [], attempts = new Map();
  const skippedDetails = missing.slice(0, MAX_SKIP_DETAILS).map(detail => detail.slice(0, 220));
  let bytes = 0, skippedFiles = missing.length, omittedSites = 0;
  function skip(source, reason) {
    skippedFiles++;
    if (skippedDetails.length < MAX_SKIP_DETAILS) skippedDetails.push(`${source.resource} · ${reason}`.slice(0, 220));
  }
  for (const source of sources) {
    await yieldBetweenSources();
    if (!current()) return null;
    const allowance = Math.min(MAX_SOURCE_BYTES, MAX_TOTAL_SOURCE_BYTES - bytes);
    if (allowance <= 0) { skip(source, 'Source scan byte limit reached.'); continue; }
    const attempt = { allowance, hash: null };
    if (traced) attempts.set(comparisonPath(source.resource), attempt);
    let snapshot;
    try { snapshot = readMappedText(vscode, mapping, source.resource, allowance); }
    catch (error) { skip(source, error.message); continue; }
    bytes += snapshot.size;
    attempt.hash = snapshot.sha256;
    const input = { text: snapshot.content, filename: source.resource, language: source.language };
    const states = traced ? inspectWatchStates(input) : null;
    scannedSources.push({ ...source, snapshot, input, states });
  }
  const trace = stateTrace(row, scannedSources, scopeNotes);
  for (const source of scannedSources) {
    await yieldBetweenSources();
    if (!current()) return null;
    const scan = scanWatchSource(source.input, row, trace?.forSource(source));
    omittedSites += scan.omitted;
    reportsByPath.set(comparisonPath(source.resource), { sha256: source.snapshot.sha256, scan });
    for (const role of Object.keys(groups)) {
      for (const site of scan[role]) {
        if (retainCandidate(groups[role], { ...site, resource: source.resource, sha256: source.snapshot.sha256 }, MAX_SITES_PER_GROUP)) omittedSites++;
      }
    }
  }
  if (!current()) return null;
  if (trace) for (const sites of [groups.write, groups.spawn]) sites.sort((left, right) => left.rank - right.rank);
  const unmatchedHints = (row.sourceHints || []).filter(hint => {
    const report = reportsByPath.get(comparisonPath(hint.path));
    return report?.sha256 !== hint.sha256 || !report.scan[hint.role].some(site => overlaps(rangeFromWatchSite(site), rangeFromWatchSite(hint)));
  }).length;
  return { mapping, ownerResource, ownerHash: owner.sha256, groups, skippedFiles, skippedDetails, omittedAssignments, omittedSites, unmatchedHints,
    trace: trace?.review, commonDependencies, attempts, inventory: traced ? inventoryIdentity(sources) : null };
}

async function openWatchCandidate(vscode, scope, candidate, current = () => true) {
  if (candidate?.grade !== 'candidate' || !['write', 'spawn', 'read'].includes(candidate.role) ||
      !scope.groups[candidate.role].includes(candidate)) throw new Error('Select a current search candidate.');
  const changed = 'The candidate source or selected character scope changed. Search again before opening it.';
  const verify = () => {
    if (!current()) throw new Error(changed);
    const inventory = resolveOwnerInventory(vscode, scope.mapping, scope.ownerResource, scope.ownerHash, Boolean(scope.trace));
    const assigned = inventory.sources.find(source => comparisonPath(source.resource) === comparisonPath(candidate.resource));
    if (!assigned) throw new Error(changed);
    const snapshot = readMappedText(vscode, scope.mapping, assigned.resource, MAX_SOURCE_BYTES);
    if (candidate.sha256 !== snapshot.sha256) throw new Error(changed);
    if (scope.trace) {
      if (inventoryIdentity(inventory.sources) !== scope.inventory ||
          JSON.stringify(inventory.commonDependencies) !== JSON.stringify(scope.commonDependencies)) throw new Error(changed);
      for (const source of inventory.sources) {
        const key = comparisonPath(source.resource), attempt = scope.attempts.get(key);
        if (!attempt || key === comparisonPath(candidate.resource)) continue;
        let hash = null;
        try { hash = readMappedText(vscode, scope.mapping, source.resource, attempt.allowance).sha256; }
        catch { /* Previously unavailable inputs can remain unavailable. */ }
        if (hash !== attempt.hash) throw new Error(changed);
      }
    }
    return snapshot;
  };
  const snapshot = verify(), range = checkedRange(snapshot.content, rangeFromWatchSite(candidate));
  return openVerifiedText(vscode, { ...snapshot, range }, () => {
    try { return verify().filename === snapshot.filename; }
    catch { return false; }
  }, changed);
}

module.exports = { openWatchCandidate, projectMapping, projectResource, scanWatchScope };
