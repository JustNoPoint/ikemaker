'use strict';

const path = require('path');
const crypto = require('crypto');
const { deepFreeze } = require('./viewer_toolbar_contract');

const EXACT_IDENTITIES = Object.freeze(['exact-document', 'selected-block', 'manifest']);
const ACCESS = Object.freeze(['external-editor', 'read-only', 'read-write']);

function unavailable(reason, request = {}) {
  return deepFreeze({ available: false, reason: String(reason || 'Exact source is unavailable.'), contextId: String(request.contextId || ''), selectionRevision: Number(request.selectionRevision || 0) });
}

function normalizeRoute(value, request = {}) {
  if (!value || value.available === false) return unavailable(value?.reason, request);
  const filename = path.resolve(String(value.filename || ''));
  const identity = String(value.identity || '');
  if (!path.isAbsolute(filename) || !value.filename) throw new Error('Exact-source route requires an absolute filename.');
  if (!EXACT_IDENTITIES.includes(identity)) throw new Error(`Unsupported exact-source identity: ${identity}`);
  if (!ACCESS.includes(value.access)) throw new Error(`Unsupported exact-source access: ${value.access}`);
  if (!value.mutationOwner) throw new Error('Exact-source route requires a mutation owner.');
  const selectionRevision = Number(value.selectionRevision ?? request.selectionRevision ?? 0);
  if (request.selectionRevision !== undefined && selectionRevision !== Number(request.selectionRevision)) return unavailable('The selected item changed before its source could be opened.', request);
  if (request.fingerprint && value.fingerprint !== request.fingerprint) return unavailable('The source changed before it could be opened.', request);
  const route = {
    available: true,
    filename,
    identity,
    line: Number.isInteger(value.line) && value.line >= 0 ? value.line : undefined,
    range: value.range ? deepFreeze({ start: Number(value.range.start), end: Number(value.range.end) }) : undefined,
    fingerprint: String(value.fingerprint || ''),
    version: String(value.version || ''),
    label: String(value.label || path.basename(filename)),
    access: value.access,
    mutationOwner: String(value.mutationOwner),
    contextId: String(value.contextId || request.contextId || ''),
    selectionRevision
  };
  if (route.range && (!Number.isInteger(route.range.start) || !Number.isInteger(route.range.end) || route.range.start < 0 || route.range.end < route.range.start)) throw new Error('Exact-source range requires nonnegative integer bounds with end >= start.');
  if (identity === 'selected-block' && !route.range && route.line === undefined) throw new Error('Selected-block route requires a line or range.');
  return deepFreeze(route);
}

class ExactSourceRegistry {
  constructor(options = {}) {
    this.resolvers = new Map();
    this.capabilities = options.capabilities || require('./viewer_source_capability').CAPABILITIES;
    this.surfaces = new Map((options.surfaces || require('./viewer_surface_registry').SURFACES).map((surface) => [surface.id, surface]));
  }
  register(definition) {
    const id = String(definition?.id || '').trim(), capabilityId = String(definition?.capabilityId || '').trim(), surfaceId = String(definition?.surfaceId || '').trim();
    if (!id || !capabilityId || !surfaceId || typeof definition.resolve !== 'function') throw new Error('Exact-source resolver requires id, capabilityId, surfaceId, and resolve.');
    const capability = this.capabilities[capabilityId], surface = this.surfaces.get(surfaceId);
    if (!capability) throw new Error(`Unknown exact-source capability: ${capabilityId}`);
    if (capability.status !== 'implemented') throw new Error(`Exact-source capability ${capabilityId} is not implemented.`);
    if (!EXACT_IDENTITIES.includes(capability.identity)) throw new Error('Connected Resources cannot register as an exact-source resolver.');
    if (!capability.resolverId || capability.resolverId !== id) throw new Error(`Exact-source resolver ${id} does not match capability resolverId.`);
    if (!surface || surface.sourceCapabilityId !== capabilityId) throw new Error(`Surface ${surfaceId} does not declare exact-source capability ${capabilityId}.`);
    if (this.resolvers.has(id) || [...this.resolvers.values()].some((item) => item.surfaceId === surfaceId && item.capabilityId === capabilityId)) throw new Error(`Duplicate exact-source resolver: ${id}`);
    const record = deepFreeze({ id, capabilityId, surfaceId, identity: capability.identity, resolve: definition.resolve });
    this.resolvers.set(id, record);
    return () => this.resolvers.delete(id);
  }
  list() { return deepFreeze([...this.resolvers.values()].map(({ resolve, ...item }) => item).sort((a, b) => a.id.localeCompare(b.id))); }
  async resolve(id, request = {}) {
    const resolver = this.resolvers.get(String(id));
    if (!resolver) return unavailable('No exact-source adapter is registered for this viewer.', request);
    try {
      const route = normalizeRoute(await resolver.resolve(deepFreeze({ ...request })), request);
      if (route.available && route.identity !== resolver.identity) return unavailable('The resolved source identity does not match the registered capability.', request);
      return route;
    }
    catch (error) { return unavailable(error.message, request); }
  }
  async open(id, request, opener) {
    const route = await this.resolve(id, request);
    if (!route.available) return route;
    if (typeof opener !== 'function') throw new Error('Exact-source opening requires an injected navigation function.');
    await opener(route);
    return route;
  }
}

function connectedResources(contextId, files) {
  return deepFreeze({ kind: 'connected-resources', contextId: String(contextId || ''), files: [...new Set((files || []).filter(Boolean).map((file) => path.resolve(file)))].sort(), exactSource: false });
}

function fingerprint(text) { return crypto.createHash('sha256').update(String(text)).digest('hex'); }

module.exports = { EXACT_IDENTITIES, ACCESS, ExactSourceRegistry, normalizeRoute, unavailable, connectedResources, fingerprint };
