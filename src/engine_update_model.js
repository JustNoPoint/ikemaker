'use strict';

const path = require('path');

const DECISION_SCHEMA = 1;
const MANAGED_ROOT_FILES = new Set([
  'ikemen_go.exe', 'ikemen_go.command', 'ikemen_go', 'license.txt', 'licenses.txt', 'readme.md',
  'changelog.md', 'libgcc_s_seh-1.dll', 'libstdc++-6.dll', 'libwinpthread-1.dll'
]);
const MANAGED_DIRECTORIES = new Set(['data', 'external', 'font', 'lib']);
const PROTECTED_DIRECTORIES = new Set(['chars', 'stages', 'sound', 'save', 'video']);

function clean(value) { return String(value == null ? '' : value).trim(); }
function validSha(value) { return /^[a-f0-9]{64}$/i.test(clean(value)); }
function candidateKey(projectId, currentBuildId, candidate) {
  return [clean(projectId).toLowerCase(), clean(currentBuildId).toLowerCase(), clean(candidate?.id).toLowerCase(), clean(candidate?.commit).toLowerCase(), clean(candidate?.artifactSha256).toLowerCase()].join('|');
}
function normalizeDecisions(raw = {}) {
  return { schemaVersion: DECISION_SCHEMA, decisions: Array.isArray(raw.decisions) ? raw.decisions.map((item) => ({
    key: clean(item.key), projectId: clean(item.projectId).toLowerCase(), currentBuildId: clean(item.currentBuildId).toLowerCase(),
    candidateBuildId: clean(item.candidateBuildId).toLowerCase(), candidateCommit: clean(item.candidateCommit).toLowerCase(),
    candidateArtifactSha256: clean(item.candidateArtifactSha256).toLowerCase(), decision: ['stay', 'remind'].includes(item.decision) ? item.decision : 'remind',
    decidedAt: clean(item.decidedAt) || null, remindAfter: clean(item.remindAfter) || null,
    projectFingerprint: clean(item.projectFingerprint)
  })).filter((item) => item.key) : [] };
}
function recordDecision(raw, project, candidate, decision, options = {}) {
  const store = normalizeDecisions(raw), key = candidateKey(project?.id, project?.engineTarget?.buildId, candidate);
  const entry = { key, projectId: clean(project?.id).toLowerCase(), currentBuildId: clean(project?.engineTarget?.buildId).toLowerCase(),
    candidateBuildId: clean(candidate?.id).toLowerCase(), candidateCommit: clean(candidate?.commit).toLowerCase(),
    candidateArtifactSha256: clean(candidate?.artifactSha256).toLowerCase(), decision: decision === 'stay' ? 'stay' : 'remind',
    decidedAt: options.decidedAt || new Date().toISOString(), remindAfter: options.remindAfter || null,
    projectFingerprint: clean(options.projectFingerprint) };
  store.decisions = store.decisions.filter((item) => item.key !== key); store.decisions.push(entry); return store;
}
function shouldPrompt(raw, project, candidate, options = {}) {
  const now = Date.parse(options.now || new Date().toISOString()), fingerprint = clean(options.projectFingerprint);
  const key = candidateKey(project?.id, project?.engineTarget?.buildId, candidate), entry = normalizeDecisions(raw).decisions.find((item) => item.key === key);
  if (!entry) return true;
  if (fingerprint && entry.projectFingerprint && fingerprint !== entry.projectFingerprint) return true;
  if (entry.decision === 'stay') return false;
  return !entry.remindAfter || Date.parse(entry.remindAfter) <= now;
}

function riskAssessment(input = {}) {
  const reasons = [], unknowns = [], categories = {};
  const add = (category, points, reason) => { categories[category] = (categories[category] || 0) + points; reasons.push({ category, points, reason }); };
  const candidate = input.candidate || {};
  if (!candidate.commit) unknowns.push('candidate commit provenance');
  if (!candidate.assetId || !candidate.artifactUrl) unknowns.push('release asset provenance');
  if (!validSha(candidate.artifactSha256)) unknowns.push('downloaded artifact hash');
  if (input.sourceErrors?.length) { add('evidence', 3, 'One or more upstream comparisons failed.'); unknowns.push(...input.sourceErrors); }
  if (input.removed?.length) add('removal', 4, `${input.removed.length} removed or renamed feature candidate(s).`);
  if (input.deprecated?.length) add('deprecation', 2, `${input.deprecated.length} deprecated feature candidate(s).`);
  if (input.semanticChanges?.length) add('semantics', 3, `${input.semanticChanges.length} default or behavior change(s).`);
  if (input.configMigrations?.length) add('configuration', 2, `${input.configMigrations.length} configuration migration(s).`);
  if (input.workspaceMatches?.length) add('workspace', 3, `${input.workspaceMatches.length} inferred workspace match(es) require review.`);
  if (input.onlineChanges?.length) add('online', 2, 'Online or rollback changes need peer interoperability testing.');
  if (input.runtimeSurface?.length) add('runtime', 2, 'Compiler, Lua, collision, rendering, audio, stage, or motif behavior changed.');
  if (input.sharedProjects > 1) add('shared-root', 4, `${input.sharedProjects} projects appear to share the engine root.`);
  const maturity = clean(input.projectMaturity).toLowerCase();
  if (maturity === 'mature' || maturity === 'release') add('project-maturity', 2, 'A mature project has more established behavior to regress.');
  else if (maturity === 'early' || maturity === 'shallow') reasons.push({ category: 'project-maturity', points: -1, reason: 'The project is early, reducing migration cost but not engine uncertainty.' });
  const score = Math.max(0, reasons.reduce((sum, item) => sum + item.points, 0));
  let level = score >= 8 ? 'High' : score >= 4 ? 'Medium' : 'Low';
  if (unknowns.length && level === 'Low') level = 'Unknown';
  return { level, score, reasons, unknowns: [...new Set(unknowns.filter(Boolean))], guidanceOnly: true,
    summary: `${level} migration risk${unknowns.length ? `; ${unknowns.length} evidence gap(s)` : ''}. This is guidance, not a compatibility guarantee.` };
}

function normalizeArchivePath(value) { return clean(value).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, ''); }
function validateArchiveEntries(entries = [], options = {}) {
  const issues = [], accepted = [], protectedEntries = [], destinations = new Map(), stripRoot = clean(options.stripRoot);
  for (const raw of entries) {
    const type = clean(raw.type || 'file').toLowerCase(), original = normalizeArchivePath(raw.path || raw.name);
    if (!original) continue;
    if (type === 'directory') continue;
    if (type === 'link' || type === 'symlink' || type === 'junction' || type === 'reparse') { issues.push(`Links and reparse entries are forbidden: ${original}`); continue; }
    if (/^[a-z]:\//i.test(original) || original.startsWith('/') || original.includes('\0')) { issues.push(`Absolute or invalid archive path: ${original}`); continue; }
    const segments = original.split('/');
    if (segments.some((part) => !part || part === '.' || part === '..')) { issues.push(`Traversal or ambiguous archive path: ${original}`); continue; }
    let relative = original;
    if (stripRoot) {
      const prefix = `${stripRoot.replace(/\/$/, '')}/`;
      if (!relative.toLowerCase().startsWith(prefix.toLowerCase())) { issues.push(`Entry is outside the expected archive root ${stripRoot}: ${original}`); continue; }
      relative = relative.slice(prefix.length);
    }
    if (!relative) continue;
    const key = relative.toLowerCase();
    if (destinations.has(key)) { issues.push(`Case-insensitive duplicate destination: ${relative} and ${destinations.get(key)}`); continue; }
    destinations.set(key, relative);
    const top = relative.split('/')[0].toLowerCase();
    if (PROTECTED_DIRECTORIES.has(top)) { protectedEntries.push({ ...raw, path: original, relative, type, reason: 'Protected project/default content is never installed in-place.' }); continue; }
    if (!MANAGED_DIRECTORIES.has(top) && !(relative.split('/').length === 1 && MANAGED_ROOT_FILES.has(relative.toLowerCase()))) {
      issues.push(`Unexpected engine package path is not allowlisted: ${relative}`); continue;
    }
    accepted.push({ ...raw, path: original, relative, type });
  }
  return { valid: issues.length === 0, issues, accepted, protectedEntries };
}

function configMigrationPlan(oldText, newText, mappings = []) {
  const parse = (text) => {
    const sections = new Map(); let section = '';
    for (const raw of String(text || '').split(/\r?\n/)) {
      const heading = /^\s*\[([^\]]+)\]\s*$/.exec(raw); if (heading) { section = heading[1].trim(); if (!sections.has(section)) sections.set(section, new Map()); continue; }
      const pair = /^\s*([^;#][^=]*?)\s*=\s*(.*?)\s*$/.exec(raw); if (pair) { if (!sections.has(section)) sections.set(section, new Map()); sections.get(section).set(pair[1].trim(), pair[2]); }
    }
    return sections;
  };
  const oldIni = parse(oldText), newIni = parse(newText), changes = [], conflicts = [], additions = [];
  for (const rule of mappings) {
    const fromSection = clean(rule.fromSection), fromKey = clean(rule.fromKey), toSection = clean(rule.toSection), toKey = clean(rule.toKey);
    const oldValue = oldIni.get(fromSection)?.get(fromKey); if (oldValue == null) continue;
    const destinationValue = oldIni.get(toSection)?.get(toKey), newDefault = newIni.get(toSection)?.get(toKey);
    if (destinationValue != null && destinationValue !== oldValue) { conflicts.push({ ...rule, oldValue, destinationValue, newDefault }); continue; }
    changes.push({ ...rule, oldValue, newDefault, action: 'rename-preserve-value' });
  }
  const mappedTargets = new Set(changes.map((item) => `${item.toSection.toLowerCase()}|${item.toKey.toLowerCase()}`));
  for (const [section, values] of newIni) for (const [key, value] of values) {
    const present = [...(oldIni.get(section)?.keys() || [])].some((oldKey) => oldKey.toLowerCase() === key.toLowerCase());
    if (!present && !mappedTargets.has(`${section.toLowerCase()}|${key.toLowerCase()}`)) additions.push({ section, key, value, action: 'add-new-default' });
  }
  return { supported: conflicts.length === 0, changes, additions, conflicts, preserveUnknownKeys: true };
}

function rollbackConflicts(journal, currentHashes = {}) {
  const conflicts = [];
  for (const item of journal?.writes || []) {
    const current = clean(currentHashes[item.relative]).toLowerCase(), installed = clean(item.installedSha256).toLowerCase();
    if (current && installed && current !== installed) conflicts.push({ relative: item.relative, currentSha256: current, installedSha256: installed, reason: 'File changed after migration; automatic rollback would erase user work.' });
  }
  return conflicts;
}

module.exports = { DECISION_SCHEMA, MANAGED_ROOT_FILES, MANAGED_DIRECTORIES, PROTECTED_DIRECTORIES, candidateKey, normalizeDecisions, recordDecision, shouldPrompt, riskAssessment, normalizeArchivePath, validateArchiveEntries, configMigrationPlan, rollbackConflicts };
