'use strict';

const crypto = require('crypto');

const TARGET_SCHEMA = 1;
const CATALOG_SCHEMA = 1;
const INSTALLED_SCHEMA = 1;
const VERIFY = ['unknown', 'observed', 'limited', 'verified', 'failed', 'conflicting'];
const CHANNELS = ['stable', 'patch', 'nightly', 'custom'];
const CHANGE_KINDS = ['introduced', 'changed', 'fixed', 'deprecated', 'removed', 'backported'];
const STABLE_BUILD_ID = 'ikemen-go-1.0.0-windows-x64';
const STABLE_TARGET = Object.freeze({
  schemaVersion: TARGET_SCHEMA,
  buildId: STABLE_BUILD_ID,
  engine: 'IKEMEN GO', channel: 'stable', version: '1.0.0',
  commit: '81c6da71d689625e20db79586815b695da00dd6d',
  platform: 'windows-x64', customFork: null
});

function clean(value) { return String(value == null ? '' : value).trim(); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function validSha(value) { const text = clean(value).toLowerCase(); return /^[a-f0-9]{64}$/.test(text) ? text : null; }
function verification(raw = {}) {
  const result = {};
  for (const key of ['source', 'artifact', 'parser', 'runtime', 'rollback', 'project']) {
    const value = clean(raw[key]).toLowerCase(); result[key] = VERIFY.includes(value) ? value : 'unknown';
  }
  return result;
}
function normalizeSource(raw = {}) {
  return { sourceId: clean(raw.sourceId), url: clean(raw.url), revision: clean(raw.revision), observedAt: clean(raw.observedAt) || null, futureAutomaticUpgradeAuthorized: raw.futureAutomaticUpgradeAuthorized === true };
}
function normalizeProvenance(raw = {}) {
  return { repository: clean(raw.repository), branch: clean(raw.branch), releaseId: Number(raw.releaseId) || null, tag: clean(raw.tag), assetId: Number(raw.assetId) || null, workflowRunId: Number(raw.workflowRunId) || null, workflowArtifactId: Number(raw.workflowArtifactId) || null };
}
function normalizeBuild(raw = {}) {
  const channel = clean(raw.channel).toLowerCase();
  return {
    id: clean(raw.id).toLowerCase(), engine: clean(raw.engine) || 'IKEMEN GO',
    channel: CHANNELS.includes(channel) ? channel : 'custom', version: clean(raw.version),
    commit: clean(raw.commit).toLowerCase(), platform: clean(raw.platform) || 'unknown',
    publishedAt: clean(raw.publishedAt) || null, artifactSha256: validSha(raw.artifactSha256),
    executableSha256: validSha(raw.executableSha256), monitorOnly: Boolean(raw.monitorOnly),
    releaseId: Number(raw.releaseId) || null, releaseTag: clean(raw.releaseTag),
    assetId: Number(raw.assetId) || null, artifactName: clean(raw.artifactName), artifactUrl: clean(raw.artifactUrl),
    artifactSize: Math.max(0, Number(raw.artifactSize) || 0), publishedArtifactSha256: validSha(raw.publishedArtifactSha256),
    source: normalizeSource(raw.source), provenance: normalizeProvenance(raw.provenance), verification: verification(raw.verification),
    baseBuildId: clean(raw.baseBuildId).toLowerCase(), patches: Array.isArray(raw.patches) ? raw.patches.map(clean).filter(Boolean) : []
  };
}
function normalizeTarget(raw) {
  if (!raw || typeof raw !== 'object' || !clean(raw.buildId)) return clone(STABLE_TARGET);
  const channel = clean(raw.channel).toLowerCase();
  const target = {
    schemaVersion: TARGET_SCHEMA, buildId: clean(raw.buildId).toLowerCase(),
    engine: clean(raw.engine) || 'IKEMEN GO', channel: CHANNELS.includes(channel) ? channel : 'custom',
    version: clean(raw.version), commit: clean(raw.commit).toLowerCase(),
    platform: clean(raw.platform) || 'unknown', customFork: null,
    installationId: clean(raw.installationId), executableSha256: validSha(raw.executableSha256),
    artifactSha256: validSha(raw.artifactSha256), identityStatus: clean(raw.identityStatus).toLowerCase() || 'unbound'
  };
  if (target.channel === 'custom') target.customFork = {
    baseBuildId: clean(raw.customFork?.baseBuildId).toLowerCase(),
    patches: Array.isArray(raw.customFork?.patches) ? raw.customFork.patches.map(clean).filter(Boolean) : []
  };
  return target;
}
function targetFromBuild(build, installed) {
  const value = normalizeBuild(build);
  return normalizeTarget({ buildId: value.id, engine: value.engine, channel: value.channel, version: value.version, commit: value.commit, platform: value.platform,
    customFork: value.channel === 'custom' ? { baseBuildId: value.baseBuildId, patches: value.patches } : null,
    installationId: installed?.id, executableSha256: installed?.executableSha256, artifactSha256: installed?.artifactSha256,
    identityStatus: installed?.identityStatus || 'unbound' });
}
function normalizeEvidence(raw = {}) {
  return {
    sourceId: clean(raw.sourceId), url: clean(raw.url), revision: clean(raw.revision),
    observedAt: clean(raw.observedAt) || null, domain: clean(raw.domain) || 'source',
    status: VERIFY.includes(clean(raw.status).toLowerCase()) ? clean(raw.status).toLowerCase() : 'observed',
    note: clean(raw.note),
    buildIds: [...new Set((raw.buildIds || []).map((value) => clean(value).toLowerCase()).filter(Boolean))],
    fallbackBuildIds: [...new Set((raw.fallbackBuildIds || []).map((value) => clean(value).toLowerCase()).filter(Boolean))],
    projectIds: [...new Set((raw.projectIds || []).map((value) => clean(value).toLowerCase()).filter(Boolean))]
  };
}
function normalizeCapability(raw = {}) {
  const kind = clean(raw.changeKind).toLowerCase();
  return {
    id: clean(raw.id).toLowerCase(), name: clean(raw.name || raw.id),
    changeKind: CHANGE_KINDS.includes(kind) ? kind : 'introduced',
    buildIds: [...new Set((raw.buildIds || []).map((v) => clean(v).toLowerCase()).filter(Boolean))],
    removedBuildIds: [...new Set((raw.removedBuildIds || []).map((v) => clean(v).toLowerCase()).filter(Boolean))],
    fallbackBuildIds: [...new Set((raw.fallbackBuildIds || []).map((v) => clean(v).toLowerCase()).filter(Boolean))],
    affectedConsumers: [...new Set((raw.affectedConsumers || []).map(clean).filter(Boolean))],
    migration: clean(raw.migration), evidence: (raw.evidence || []).map(normalizeEvidence),
    ikemakerSupport: clean(raw.ikemakerSupport).toLowerCase() || 'discovered'
  };
}
function normalizeCatalog(raw = {}) {
  return {
    schemaVersion: CATALOG_SCHEMA, catalogRevision: Math.max(1, Number(raw.catalogRevision) || 1),
    generatedAt: clean(raw.generatedAt) || new Date(0).toISOString(),
    sources: Array.isArray(raw.sources) ? raw.sources.map((item) => ({ id: clean(item.id), kind: clean(item.kind), url: clean(item.url), trust: clean(item.trust) || 'unclassified' })).filter((item) => item.id) : [],
    builds: Array.isArray(raw.builds) ? raw.builds.map(normalizeBuild).filter((item) => item.id) : [],
    capabilities: Array.isArray(raw.capabilities) ? raw.capabilities.map(normalizeCapability).filter((item) => item.id) : [],
    conflicts: Array.isArray(raw.conflicts) ? clone(raw.conflicts) : [],
    consumerCoverage: raw.consumerCoverage && typeof raw.consumerCoverage === 'object' && !Array.isArray(raw.consumerCoverage) ? clone(raw.consumerCoverage) : {}
  };
}
function validateCatalog(raw = {}) {
  const issues = [], catalog = normalizeCatalog(raw);
  if (Number(raw.schemaVersion || CATALOG_SCHEMA) > CATALOG_SCHEMA) issues.push({ level: 'error', code: 'future-schema', message: 'The engine catalog uses a newer schema.' });
  const ids = new Set();
  for (const build of catalog.builds) {
    if (ids.has(build.id)) issues.push({ level: 'error', code: 'duplicate-build', message: `Duplicate engine build: ${build.id}` });
    ids.add(build.id);
    if (build.channel === 'nightly' && !build.commit) issues.push({ level: 'error', code: 'floating-nightly', message: `${build.id} is a nightly without an exact commit.` });
    if (build.channel !== 'nightly' && build.monitorOnly) issues.push({ level: 'warning', code: 'monitor-channel', message: `${build.id} is marked monitor-only outside the nightly channel.` });
  }
  for (const capability of catalog.capabilities) for (const buildId of [...capability.buildIds, ...capability.removedBuildIds, ...capability.fallbackBuildIds]) if (!ids.has(buildId)) issues.push({ level: 'warning', code: 'unknown-capability-build', message: `${capability.id} refers to unknown build ${buildId}.` });
  return { catalog, issues, valid: !issues.some((item) => item.level === 'error') };
}
function capabilityStatus(catalogRaw, targetRaw, capabilityId, projectId = '') {
  const catalog = normalizeCatalog(catalogRaw), target = normalizeTarget(targetRaw);
  const capability = catalog.capabilities.find((item) => item.id === clean(capabilityId).toLowerCase());
  if (!capability) return { status: 'unknown', reason: 'No capability evidence is recorded.' };
  if (catalog.conflicts.some((item) => item.capabilityId === capability.id && item.status !== 'resolved')) return { status: 'conflicting', capability };
  if (capability.removedBuildIds.includes(target.buildId)) return { status: 'removed', capability };
  if (capability.buildIds.includes(target.buildId)) {
    const relevant = capability.evidence.filter((item) => item.buildIds.includes(target.buildId) && (!item.projectIds.length || item.projectIds.includes(clean(projectId).toLowerCase())));
    const conflicting = relevant.some((item) => item.status === 'conflicting');
    const verified = relevant.some((item) => ['parser', 'runtime', 'project'].includes(item.domain) && item.status === 'verified');
    const verifiedStatus = capability.changeKind === 'changed' ? 'changed' : capability.changeKind === 'deprecated' ? 'deprecated' : 'supported';
    return { status: conflicting ? 'conflicting' : verified ? verifiedStatus : 'unverified', capability };
  }
  if (capability.fallbackBuildIds.includes(target.buildId)) {
    const relevant = capability.evidence.filter((item) => item.fallbackBuildIds.includes(target.buildId) && (!item.projectIds.length || item.projectIds.includes(clean(projectId).toLowerCase())));
    const conflicting = relevant.some((item) => item.status === 'conflicting');
    const verifiedFallback = relevant.some((item) => item.status === 'verified' && ['runtime', 'project'].includes(item.domain));
    return { status: conflicting ? 'conflicting' : verifiedFallback ? 'fallback' : 'unverified', capability };
  }
  return { status: 'unsupported', capability };
}
function normalizeInstalledRegistry(raw = {}) {
  return { schemaVersion: INSTALLED_SCHEMA, revision: Math.max(1, Number(raw.revision) || 1), builds: (raw.builds || []).map((item) => ({
    id: clean(item.id) || `${clean(item.buildId).toLowerCase()}:${validSha(item.executableSha256) || 'unverified'}`,
    buildId: clean(item.buildId).toLowerCase(), executable: clean(item.executable), root: clean(item.root),
    executableSha256: validSha(item.executableSha256), artifactSha256: validSha(item.artifactSha256),
    registeredAt: clean(item.registeredAt) || null, verifiedAt: clean(item.verifiedAt) || null,
    identityStatus: ['verified', 'user-asserted'].includes(clean(item.identityStatus).toLowerCase()) ? clean(item.identityStatus).toLowerCase() : 'user-asserted'
  })).filter((item) => item.buildId && item.executable) };
}
function registerInstalled(raw, input) {
  const registry = normalizeInstalledRegistry(raw), value = normalizeInstalledRegistry({ builds: [input] }).builds[0];
  if (!value || !value.executableSha256) throw new Error('An installed engine requires an executable path and verified SHA-256.');
  registry.builds = registry.builds.filter((item) => item.id !== value.id); registry.builds.push(value); registry.revision += 1; return registry;
}
function adoptionReview(project, targetRaw, catalogRaw, installedRaw, options = {}) {
  const target = normalizeTarget(targetRaw), catalog = normalizeCatalog(catalogRaw), installed = normalizeInstalledRegistry(installedRaw);
  const build = catalog.builds.find((item) => item.id === target.buildId), candidates = installed.builds.filter((item) => item.buildId === target.buildId);
  const local = candidates.find((item) => target.installationId && item.id === target.installationId)
    || candidates.find((item) => target.executableSha256 && item.executableSha256 === target.executableSha256)
    || (candidates.length === 1 ? candidates[0] : null);
  const blockers = [];
  if (!build) blockers.push('The target build is not in the validated knowledge catalog.');
  if (build?.monitorOnly && (!build.commit || !local)) blockers.push('A monitor-only moving/candidate build cannot be adopted. Register an exact verified artifact first.');
  if (!local && target.buildId !== STABLE_BUILD_ID) blockers.push('The exact target build is not registered as installed.');
  if (local && local.identityStatus === 'verified' && build?.executableSha256 && local.executableSha256 !== build.executableSha256) blockers.push('The installed executable hash does not match the authenticated catalog identity.');
  if (local && local.identityStatus !== 'verified' && !options.allowUserAsserted) blockers.push('The local executable is user-asserted, not authenticated against trusted artifact evidence.');
  if (local && target.executableSha256 && target.executableSha256 !== local.executableSha256) blockers.push('The project target artifact pin does not match the registered executable.');
  const pinnedTarget = local ? normalizeTarget({ ...target, installationId: local.id, executableSha256: local.executableSha256, artifactSha256: local.artifactSha256, identityStatus: local.identityStatus }) : target;
  return { projectId: clean(project?.id).toLowerCase(), oldTarget: normalizeTarget(project?.engineTarget), newTarget: pinnedTarget, build, installed: local || null, blockers };
}
function adoptProject(project, review, details = {}) {
  if (!review || review.blockers?.length) throw new Error(`Engine adoption is blocked: ${(review?.blockers || ['review missing']).join(' ')}`);
  const next = clone(project), when = clean(details.adoptedAt) || new Date().toISOString();
  next.engineTarget = normalizeTarget(review.newTarget);
  next.engineAdoptionHistory = Array.isArray(next.engineAdoptionHistory) ? next.engineAdoptionHistory : [];
  next.engineAdoptionHistory.push({ adoptedAt: when, previousTarget: normalizeTarget(review.oldTarget), newTarget: normalizeTarget(review.newTarget), catalogRevision: Number(details.catalogRevision) || 0, migrationRecord: clean(details.migrationRecord), verificationSummary: clean(details.verificationSummary) });
  return next;
}
function catalogDigest(catalog) { return crypto.createHash('sha256').update(JSON.stringify(normalizeCatalog(catalog))).digest('hex'); }

module.exports = { TARGET_SCHEMA, CATALOG_SCHEMA, INSTALLED_SCHEMA, STABLE_BUILD_ID, STABLE_TARGET, normalizeBuild, normalizeTarget, targetFromBuild, normalizeCapability, normalizeCatalog, validateCatalog, capabilityStatus, normalizeInstalledRegistry, registerInstalled, adoptionReview, adoptProject, catalogDigest };
