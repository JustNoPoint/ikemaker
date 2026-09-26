'use strict';

const engine = require('./engine_registry_model');

function clean(value) { return String(value == null ? '' : value).trim(); }
function slug(value) { return clean(value).toLowerCase().replace(/\s*\((?:new|changed|old)\)\s*$/i, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function evidenceId(item) { return [item.sourceId, item.revision, item.url, item.domain, item.status, item.note].join('|'); }
function mergeUnique(left, right, key) { const map = new Map(); for (const item of [...left, ...right]) map.set(key(item), item); return [...map.values()]; }
function meaningful(catalog) { const value = JSON.parse(JSON.stringify(catalog)); delete value.generatedAt; delete value.catalogRevision; return JSON.stringify(value); }
function addConflict(catalog, capabilityId, existing, incoming, reason) {
  const id = `${capabilityId}|${reason}|${incoming.evidence?.[0]?.sourceId || 'unknown'}|${incoming.evidence?.[0]?.revision || ''}`;
  if (!(catalog.conflicts || []).some((item) => item.id === id)) catalog.conflicts.push({ id, capabilityId, reason, existing: { changeKind: existing.changeKind, buildIds: existing.buildIds, removedBuildIds: existing.removedBuildIds }, incoming: { changeKind: incoming.changeKind, buildIds: incoming.buildIds, removedBuildIds: incoming.removedBuildIds }, status: 'unresolved' });
}
function addBuildConflict(catalog, existing, incoming, reason) {
  const identity = incoming.commit || incoming.executableSha256 || incoming.artifactSha256 || 'unknown';
  const id = `build|${existing.id}|${identity}|${reason}`;
  if (!(catalog.conflicts || []).some((item) => item.id === id)) catalog.conflicts.push({ id, buildId: existing.id, reason, existing: { commit: existing.commit, executableSha256: existing.executableSha256, artifactSha256: existing.artifactSha256 }, incoming: { commit: incoming.commit, executableSha256: incoming.executableSha256, artifactSha256: incoming.artifactSha256 }, status: 'unresolved' });
}

function buildFromObservation(raw = {}) {
  const channel = clean(raw.channel).toLowerCase();
  const commit = clean(raw.commit).toLowerCase();
  const version = clean(raw.version || raw.tag || (channel === 'nightly' ? 'nightly' : ''));
  const short = commit ? commit.slice(0, 12) : slug(version || 'unresolved');
  const moving = channel === 'nightly' || channel === 'develop' || version.toLowerCase() === 'nightly';
  const identity = moving && commit ? short : (slug(version) || short);
  return engine.normalizeBuild({
    id: clean(raw.id) || `ikemen-go-${channel || 'custom'}-${identity}-${clean(raw.platform) || 'unknown'}`,
    engine: 'IKEMEN GO', channel, version, commit, platform: clean(raw.platform) || 'unknown',
    publishedAt: raw.publishedAt || null, artifactSha256: raw.artifactSha256 || null,
    executableSha256: raw.executableSha256 || null,
    releaseId: raw.releaseId, releaseTag: raw.releaseTag, assetId: raw.assetId,
    artifactName: raw.artifactName, artifactUrl: raw.artifactUrl, artifactSize: raw.artifactSize,
    publishedArtifactSha256: raw.publishedArtifactSha256,
    monitorOnly: Boolean(raw.monitorOnly) || channel === 'nightly' || !commit,
    source: { sourceId: raw.sourceId, url: raw.url, revision: raw.revision || raw.tag || commit, observedAt: raw.observedAt },
    verification: { source: commit ? 'observed' : 'unknown', artifact: 'unknown', parser: 'unknown', runtime: 'unknown', rollback: 'unknown', project: 'unknown' }
  });
}

function featureCapabilities(snapshot) {
  const items = [];
  for (const [sourceId, source] of Object.entries(snapshot.sources || {})) {
    if (!source || source.error) continue;
    for (const label of source.features || []) {
      const id = slug(label); if (!id) continue;
      const status = /\(changed\)$/i.test(label) ? 'changed' : /\(old\)$/i.test(label) ? 'deprecated' : 'introduced';
      items.push(engine.normalizeCapability({ id, name: label.replace(/\s*\((?:new|changed|old)\)\s*$/i, ''), changeKind: status,
        buildIds: [], ikemakerSupport: 'discovered', evidence: [{ sourceId, url: source.docs || '', revision: source.marker || '', observedAt: snapshot.checkedAt, domain: 'source', status: 'observed', note: 'Documentation heading discovered automatically; exact build support remains unverified.' }] }));
    }
  }
  return items;
}

function refreshCatalog(previousRaw, snapshot) {
  const previous = engine.normalizeCatalog(previousRaw), next = engine.normalizeCatalog(previous);
  next.generatedAt = snapshot.checkedAt || new Date().toISOString();
  for (const observation of snapshot.buildObservations || []) {
    const build = buildFromObservation(observation); if (!build.id) continue;
    const existing = next.builds.find((item) => item.id === build.id);
    if (!existing) next.builds.push(build);
    else {
      const identityConflict = (existing.commit && build.commit && existing.commit !== build.commit)
        || (existing.executableSha256 && build.executableSha256 && existing.executableSha256 !== build.executableSha256)
        || (existing.artifactSha256 && build.artifactSha256 && existing.artifactSha256 !== build.artifactSha256);
      if (identityConflict) {
        addBuildConflict(next, existing, build, 'A build identifier was reused for a different immutable artifact identity.');
        const suffix = (build.commit || build.executableSha256 || build.artifactSha256 || 'conflict').slice(0, 12);
        let id = `${build.id}-${suffix}`, index = 2;
        while (next.builds.some((item) => item.id === id)) id = `${build.id}-${suffix}-${index++}`;
        next.builds.push({ ...build, id });
        continue;
      }
      // Discovery may fill unknown identity fields, but must never downgrade
      // locally verified evidence or replace known hashes with absent values.
      existing.version = existing.version || build.version; existing.commit = existing.commit || build.commit;
      existing.executableSha256 = existing.executableSha256 || build.executableSha256;
      existing.releaseId = existing.releaseId || build.releaseId; existing.releaseTag = existing.releaseTag || build.releaseTag;
      existing.assetId = existing.assetId || build.assetId; existing.artifactName = existing.artifactName || build.artifactName;
      existing.artifactUrl = existing.artifactUrl || build.artifactUrl; existing.artifactSize = existing.artifactSize || build.artifactSize;
      existing.publishedArtifactSha256 = existing.publishedArtifactSha256 || build.publishedArtifactSha256;
      existing.artifactSha256 = existing.artifactSha256 || build.artifactSha256;
      existing.publishedAt = existing.publishedAt || build.publishedAt; existing.source = existing.source?.url ? existing.source : build.source;
      existing.monitorOnly = existing.monitorOnly && build.monitorOnly;
    }
  }
  for (const candidate of featureCapabilities(snapshot)) {
    const existing = next.capabilities.find((item) => item.id === candidate.id);
    if (!existing) next.capabilities.push(candidate);
    else {
      if (existing.changeKind !== candidate.changeKind) addConflict(next, candidate.id, existing, candidate, 'Sources classify the same capability differently.');
      existing.evidence = mergeUnique(existing.evidence, candidate.evidence, evidenceId);
    }
  }
  for (const raw of snapshot.customCapabilities || []) {
    const candidate = engine.normalizeCapability(raw), existing = next.capabilities.find((item) => item.id === candidate.id);
    if (!existing) next.capabilities.push(candidate);
    else {
      if (existing.changeKind !== candidate.changeKind) addConflict(next, candidate.id, existing, candidate, 'Configured source conflicts with the retained capability classification.');
      existing.buildIds = [...new Set([...existing.buildIds, ...candidate.buildIds])];
      existing.removedBuildIds = [...new Set([...existing.removedBuildIds, ...candidate.removedBuildIds])];
      existing.fallbackBuildIds = [...new Set([...existing.fallbackBuildIds, ...candidate.fallbackBuildIds])];
      existing.evidence = mergeUnique(existing.evidence, candidate.evidence, evidenceId);
      if (existing.buildIds.some((id) => existing.removedBuildIds.includes(id))) addConflict(next, candidate.id, existing, candidate, 'The same exact build is claimed as both supported and removed.');
    }
  }
  const checked = engine.validateCatalog(next);
  if (!checked.valid) return { catalog: previous, promoted: false, issues: checked.issues, changed: false };
  const changed = meaningful(previous) !== meaningful(checked.catalog);
  checked.catalog.catalogRevision = changed ? previous.catalogRevision + 1 : previous.catalogRevision;
  return { catalog: checked.catalog, promoted: true, issues: checked.issues, changed };
}

function mergeSnapshot(previous, current) {
  const result = { checkedAt: current.checkedAt, sources: {}, buildObservations: current.buildObservations || [], customCapabilities: current.customCapabilities || [] };
  const ids = new Set([...Object.keys(previous?.sources || {}), ...Object.keys(current?.sources || {})]);
  for (const id of ids) {
    const fresh = current?.sources?.[id];
    if (fresh && !fresh.error) result.sources[id] = fresh;
    else if (previous?.sources?.[id] && !previous.sources[id].error) result.sources[id] = { ...previous.sources[id], lastError: fresh?.error || 'Source unavailable', lastAttemptAt: current.checkedAt };
    else result.sources[id] = fresh || { error: 'Source unavailable', features: [] };
  }
  return result;
}

module.exports = { slug, buildFromObservation, featureCapabilities, refreshCatalog, mergeSnapshot };
