'use strict';

const path = require('path');
const { hash } = require('./mutation_safety');

const ELIGIBLE_CATEGORIES = Object.freeze(['maps', 'variables', 'controllers', 'triggers', 'constants']);
const MAX_VISIBLE_ROUTES = 128;
const canonical = value => path.resolve(String(value || '')).toLowerCase();

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function capabilityFingerprint(capabilities = {}) {
  const enabled = [...new Set((capabilities.enabledCapabilities || []).map(value => String(value).toLowerCase()))].sort();
  const target = capabilities.target && typeof capabilities.target === 'object' ? capabilities.target : {};
  return hash(JSON.stringify(stable({ enabled, nightlyStringsEnabled: capabilities.nightlyStringsEnabled === true, target })));
}

function siteFilename(site, catalog) {
  return path.resolve(site?.filename || catalog?.files?.[site?.fileIndex] || '.');
}

function normalizedSite(site, catalog) {
  return {
    filename: canonical(siteFilename(site, catalog)), line: Number(site?.line), start: Number.isInteger(site?.start) ? site.start : null,
    role: String(site?.role || ''), access: String(site?.access || ''), assigned: site?.assigned === true,
    ownerKind: String(site?.ownerKind || ''), ownerName: String(site?.ownerName || ''), runtimeOwner: String(site?.runtimeOwner || ''),
    valueKind: String(site?.valueKind || ''), visibilityCapabilityId: String(site?.metadata?.visibilityCapabilityId || '').toLowerCase(),
    catalogMatch: site?.catalogMatch === true
  };
}

function entryIdentity(entry, catalog) {
  return hash(JSON.stringify(stable({
    id: String(entry?.id || ''), category: String(entry?.category || ''), name: String(entry?.name || ''),
    status: String(entry?.status || ''), assigned: entry?.assigned === true,
    declarations: Number(entry?.declarations || 0), references: Number(entry?.references || 0), reads: Number(entry?.reads || 0), writes: Number(entry?.writes || 0),
    runtimeOwners: [...new Set((entry?.runtimeOwners || []).map(String))].sort(),
    sites: (entry?.sites || []).map(site => normalizedSite(site, catalog))
  })));
}

function catalogFingerprint(catalog) {
  if (!catalog || catalog.resolved === false || (catalog.failures || []).length) return '';
  const sources = Object.values(catalog.sources || {}).map(source => ({ filename: canonical(source.filename), hash: String(source.hash || ''), bytes: Number(source.bytes || 0) })).sort((a, b) => a.filename.localeCompare(b.filename));
  const entries = (catalog.entries || []).filter(entry => ELIGIBLE_CATEGORIES.includes(entry.category)).map(entry => ({ id: String(entry.id || ''), identity: entryIdentity(entry, catalog) }));
  return hash(JSON.stringify(stable({ ownerIdentity: canonical(catalog.ownerIdentity || '.'), sources, entries })));
}

function buildProjectSymbolSnapshot(catalog, context = {}) {
  const fingerprint = catalogFingerprint(catalog);
  if (!fingerprint) return null;
  const entries = Object.create(null);
  for (const entry of catalog.entries || []) {
    if (!ELIGIBLE_CATEGORIES.includes(entry.category)) continue;
    const id = String(entry.id || '');
    if (!id || Object.prototype.hasOwnProperty.call(entries, id)) return null;
    entries[id] = freeze({ id, category: entry.category, name: String(entry.name || ''), identity: entryIdentity(entry, catalog), sites: freeze((entry.sites || []).map(site => freeze(normalizedSite(site, catalog)))) });
  }
  return freeze({ complete: true, fingerprint, capabilityFingerprint: capabilityFingerprint(context.capabilities), entries });
}

function componentIdentity(component) {
  return hash(JSON.stringify({ kind: component?.kind, defPath: canonical(component?.reference?.defPath), filename: canonical(component?.filename), startLine: component?.startLine, endLine: component?.endLine, sourceHash: component?.sourceHash, rangeHash: component?.rangeHash, stableId: component?.stableId, signature: component?.signature }));
}

function visibleForCapability(site, capabilities = {}) {
  const required = String(site.visibilityCapabilityId || '').toLowerCase();
  if (!required) return true;
  const channel = String(capabilities?.target?.channel || '').toLowerCase();
  const enabled = new Set((capabilities.enabledCapabilities || []).map(value => String(value).toLowerCase()));
  return channel === 'nightly' && enabled.has(required);
}
function selectedSiteIdentity(sites){return hash(JSON.stringify(stable(sites.map(site=>({filename:site.filename,line:site.line,start:site.start,role:site.role,access:site.access,ownerKind:site.ownerKind,ownerName:site.ownerName,runtimeOwner:site.runtimeOwner})))));}

function buildProjectSymbolAuthorities(component, snapshot, context = {}) {
  const unavailable = reason => freeze({ publicLinks: freeze({ available: false, reason, items: freeze([]), total: 0, omitted: 0 }), authorities: new Map() });
  if (!component || !['state', 'function'].includes(component.kind) || !snapshot?.complete) return unavailable('Select one exact StateDef or Function with a complete project-symbol index.');
  if (context.defDirty || canonical(context.defPath) !== canonical(component.reference?.defPath)) return unavailable('The owner DEF is dirty or no longer proves this selected component.');
  if (snapshot.capabilityFingerprint !== capabilityFingerprint(context.capabilities) || hash(String(context.sourceText || '')) !== component.sourceHash) return unavailable('The selected source or engine capability target is no longer exact.');
  const filename = canonical(component.filename), start = Number(component.startLine), end = Number(component.endLine), candidates = [];
  for (const entry of Object.values(snapshot.entries)) {
    const selected = entry.sites.filter(site => site.filename === filename && site.line >= start && site.line <= end && visibleForCapability(site, context.capabilities) && (entry.category !== 'controllers' || site.catalogMatch));
    if (selected.length) candidates.push({ entry, selected });
  }
  candidates.sort((left, right) => ELIGIBLE_CATEGORIES.indexOf(left.entry.category) - ELIGIBLE_CATEGORIES.indexOf(right.entry.category) || left.entry.name.localeCompare(right.entry.name, undefined, { numeric: true, sensitivity: 'base' }));
  const authorities = new Map(), items = [];
  for (const candidate of candidates.slice(0, MAX_VISIBLE_ROUTES)) {
    const route = String(context.token?.({ entryId: candidate.entry.id }) || '');
    if (!/^[0-9a-f]{48}$/.test(route)) continue;
    const runtimeOwners=[...new Set(candidate.selected.map(site=>site.runtimeOwner).filter(Boolean))].sort(),authority = freeze({ schema: 'ikemaker.project-symbol-handoff', version: 1, route, generation: Number(context.generation), defPath: path.resolve(context.defPath), defHash: hash(String(context.defText || '')), componentIdentity: componentIdentity(component), selectedPath: path.resolve(component.filename), selectedHash: component.sourceHash, selectedRangeHash: component.rangeHash, selectedSiteIdentity:selectedSiteIdentity(candidate.selected), selectedRuntimeOwnerIdentity:hash(JSON.stringify(runtimeOwners)), focusRuntimeOwner:runtimeOwners.length===1?runtimeOwners[0]:'', catalogFingerprint: snapshot.fingerprint, capabilityFingerprint: snapshot.capabilityFingerprint, entryId: candidate.entry.id, entryIdentity: candidate.entry.identity, category: candidate.entry.category, name: candidate.entry.name });
    authorities.set(route, authority); items.push(freeze({ id: candidate.entry.id, category: candidate.entry.category, name: candidate.entry.name, route }));
  }
  return freeze({ publicLinks: freeze({ available: true, reason: '', items: freeze(items), total: candidates.length, omitted: Math.max(0, candidates.length - items.length) }), authorities });
}

function validateProjectSymbolAuthority(authority, component, snapshot, context = {}) {
  if (authority?.schema !== 'ikemaker.project-symbol-handoff' || authority.version !== 1 || authority.generation !== Number(context.generation) || componentIdentity(component) !== authority.componentIdentity || snapshot?.fingerprint !== authority.catalogFingerprint || snapshot?.capabilityFingerprint !== authority.capabilityFingerprint) return null;
  const rebuilt = buildProjectSymbolAuthorities(component, snapshot, { ...context, token: item => item.entryId === authority.entryId ? authority.route : '0'.repeat(48) }), candidate = rebuilt.authorities.get(authority.route);
  if (!candidate || Object.keys(candidate).length !== Object.keys(authority).length) return null;
  for (const key of Object.keys(candidate)) if (candidate[key] !== authority[key]) return null;
  return candidate;
}

function validateProjectSymbolTarget(authority, catalog, capabilities = {}, defText = '') {
  if (authority?.defHash !== hash(String(defText || ''))) return null;
  const snapshot = buildProjectSymbolSnapshot(catalog, { capabilities });
  if (!snapshot || snapshot.fingerprint !== authority?.catalogFingerprint || snapshot.capabilityFingerprint !== authority?.capabilityFingerprint) return null;
  const entry = snapshot.entries[authority.entryId];
  return entry && entry.identity === authority.entryIdentity && entry.category === authority.category && entry.name === authority.name ? entry : null;
}

module.exports = { ELIGIBLE_CATEGORIES, MAX_VISIBLE_ROUTES, capabilityFingerprint, entryIdentity, catalogFingerprint, buildProjectSymbolSnapshot, buildProjectSymbolAuthorities, validateProjectSymbolAuthority, validateProjectSymbolTarget };
