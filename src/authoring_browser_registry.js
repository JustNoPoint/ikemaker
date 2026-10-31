'use strict';

const { deepFreeze } = require('./authoring_navigation_model');
const { cloneBounded } = require('./authoring_browser_bounds');

const PROVIDER_IDS = Object.freeze(['code-navigator', 'project-data', 'recipes', 'similar-code', 'controllers', 'problems']);
const PROVIDER_CONTRACTS = deepFreeze(PROVIDER_IDS.map((id) => ({
  id,
  readOnly: true,
  autoOpen: false,
  operations: ['refresh', 'selection-intent', 'open-source-intent']
})));
const MUTATION_NAMES = /^(?:add|apply|change|create|delete|edit|insert|move|mutate|remove|rename|replace|save|set|update|write)/i;

function cloneReadOnly(value, path = 'provider DTO', ancestors = new Set()) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path} contains a non-finite number.`);
    return value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new TypeError(`${path} contains a cycle.`);
    const next = new Set(ancestors).add(value);
    return value.map((child, index) => cloneReadOnly(child, `${path}[${index}]`, next));
  }
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${path} must contain only plain serializable data.`);
  }
  if (ancestors.has(value)) throw new TypeError(`${path} contains a cycle.`);
  const next = new Set(ancestors).add(value), result = {};
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined) continue;
    if (typeof child === 'function' || typeof child === 'symbol' || typeof child === 'bigint') throw new TypeError(`${path}.${key} is not read-only data.`);
    result[key] = cloneReadOnly(child, `${path}.${key}`, next);
  }
  return result;
}

function providerId(value) {
  const id = String(value || '');
  if (!PROVIDER_IDS.includes(id)) throw new Error(`Unknown authoring browser provider: ${id}`);
  return id;
}

function validateImplementations(implementations) {
  for (const id of Object.keys(implementations)) providerId(id);
  for (const [id, implementation] of Object.entries(implementations)) {
    if (!implementation || typeof implementation !== 'object') throw new TypeError(`Provider ${id} must be an object.`);
    for (const [name, member] of Object.entries(implementation)) {
      if (typeof member === 'function' && name !== 'refresh' && name !== 'read') {
        const reason = MUTATION_NAMES.test(name) ? 'mutation methods are forbidden' : 'only refresh/read is part of the provider implementation contract';
        throw new Error(`Provider ${id} ${reason}: ${name}`);
      }
    }
    if (typeof implementation.refresh !== 'function' && typeof implementation.read !== 'function') throw new Error(`Provider ${id} requires a refresh/read function.`);
  }
}

function selectionIntent(id, selection) {
  return deepFreeze({ type: 'selection', providerId: providerId(id), selection: cloneReadOnly(selection, 'selection') });
}

function openSourceIntent(id, source) {
  const dto = cloneReadOnly(source, 'source');
  if (!dto || typeof dto !== 'object' || Array.isArray(dto)) throw new TypeError('Open-source intent requires a source DTO.');
  return deepFreeze({ type: 'open-source', providerId: providerId(id), source: dto });
}

function createBrowserRegistry(implementations = {}) {
  validateImplementations(implementations);
  const readers = new Map(PROVIDER_IDS.map((id) => [id, implementations[id]?.refresh || implementations[id]?.read || null]));

  async function refreshProviders(context = null, requestedIds = PROVIDER_IDS) {
    const safeContext = deepFreeze(cloneBounded(context, 'refresh context'));
    const ids = [...new Set(requestedIds.map(providerId))];
    const settled = await Promise.all(ids.map(async (id) => {
      const reader = readers.get(id);
      if (!reader) throw new Error(`Provider ${id} is unavailable.`);
      return cloneBounded(await reader(safeContext), `${id} DTO`);
    }).map((promise) => promise.then((data) => ({ ok: true, data }), (error) => ({ ok: false, error }))));
    const providers = settled.map((outcome, index) => outcome.ok
      ? { id: ids[index], status: 'ready', data: outcome.data, error: null }
      : { id: ids[index], status: 'failed', data: null, error: { message: String(outcome.error?.message || outcome.error) } });
    return deepFreeze({ autoOpen: false, providers, failures: providers.filter((entry) => entry.status === 'failed').map((entry) => ({ providerId: entry.id, message: entry.error.message })) });
  }
  async function refresh(context = null) { return refreshProviders(context, PROVIDER_IDS); }

  return deepFreeze({
    autoOpen: false,
    contracts: PROVIDER_CONTRACTS,
    refresh,
    refreshProviders,
    selectionIntent,
    openSourceIntent
  });
}

module.exports = {
  PROVIDER_IDS, PROVIDER_CONTRACTS, createBrowserRegistry, createAuthoringBrowserRegistry: createBrowserRegistry,
  selectionIntent, openSourceIntent, cloneReadOnly
};
