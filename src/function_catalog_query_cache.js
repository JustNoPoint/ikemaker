'use strict';

const { performance } = require('perf_hooks');
const { createHash } = require('crypto');

const DEFAULT_LIMIT = 64;
const WARM_BUDGET_MS = 25;

function identity(document) {
  const rendered = document?.uri?.toString?.();
  return String(rendered && rendered !== '[object Object]' ? rendered : document?.fileName || document?.uri?.fsPath || 'document');
}
function revision(document) { return Number.isInteger(document?.version) ? document.version : null; }
function sourceRevision(document) {
  const version = revision(document);
  if (version !== null) return `version:${version}`;
  // VS Code documents are versioned. The content hash keeps tests and other
  // callers without that contract from sharing an unsafe "unversioned" entry.
  return `source:${createHash('sha256').update(String(document?.getText?.() || '')).digest('hex')}`;
}
function unavailable(catalog, reason) { return { ...(catalog || {}), complete: false, entries: [], limitations: [...(catalog?.limitations || []), reason] }; }

class FunctionCatalogQueryCache {
  constructor(builder, validator, options = {}) {
    if (typeof builder !== 'function' || typeof validator !== 'function') throw new TypeError('Function catalog cache requires a builder and validator.');
    this.builder = builder; this.validator = validator;
    this.limit = Math.max(1, Math.min(256, Number(options.limit) || DEFAULT_LIMIT));
    this.warmBudgetMs = Math.max(1, Number(options.warmBudgetMs) || WARM_BUDGET_MS);
    this.generation = 0; this.entries = new Map(); this.hits = 0; this.misses = 0; this.stale = 0; this.warmSamples = 0; this.maxWarmMs = 0; this.warmBudgetExceeded = 0;
  }
  invalidate() { this.generation += 1; this.entries.clear(); }
  stats() { return Object.freeze({ generation:this.generation, entries:this.entries.size, hits:this.hits, misses:this.misses, stale:this.stale, warmSamples:this.warmSamples, maxWarmMs:this.maxWarmMs, warmBudgetMs:this.warmBudgetMs, warmBudgetExceeded:this.warmBudgetExceeded }); }
  async get(document) {
    const generation = this.generation, source = sourceRevision(document), key = `${identity(document)}\0${source}\0${generation}`;
    const cached = this.entries.get(key);
    if (cached) {
      this.hits += 1; const wasSettled = cached.settled, started = performance.now(), value = await cached.promise;
      // A caller that joined an in-flight build is a coalesced cold request,
      // not a warm-cache latency sample.
      if (wasSettled) { const elapsed = performance.now() - started; this.warmSamples += 1; this.maxWarmMs = Math.max(this.maxWarmMs, elapsed); if (elapsed > this.warmBudgetMs) this.warmBudgetExceeded += 1; }
      return value;
    }
    this.misses += 1;
    const entry = { settled:false, promise:null };
    entry.promise = Promise.resolve().then(() => this.builder(document)).then(async catalog => {
      if (generation !== this.generation || sourceRevision(document) !== source) { this.stale += 1; return unavailable(catalog, 'The function catalog request became stale before publication.'); }
      if (!catalog?.complete || !await this.validator(catalog, document)) { this.stale += 1; return unavailable(catalog, 'The function catalog authority changed before publication.'); }
      if (generation !== this.generation || sourceRevision(document) !== source) { this.stale += 1; return unavailable(catalog, 'The function catalog request became stale during validation.'); }
      return catalog;
    }).catch(() => unavailable(null, 'The function catalog could not be built.')).finally(() => { entry.settled = true; });
    this.entries.set(key, entry); while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value);
    return entry.promise;
  }
}

module.exports = { FunctionCatalogQueryCache, DEFAULT_LIMIT, WARM_BUDGET_MS, identity, revision, sourceRevision };
