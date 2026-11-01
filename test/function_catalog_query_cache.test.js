'use strict';

const assert = require('assert');
const { FunctionCatalogQueryCache } = require('../src/function_catalog_query_cache');

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const catalog = () => ({ complete: true, owner: 'Ryu.def', entries: [{ filename: 'logic.zss', text: '[Function Test()]' }] });

(async () => {
  let builds = 0;
  const document = { uri: { toString: () => 'file:///Ryu/logic.zss' }, version: 1, getText: () => '[StateDef 1]' };
  const cache = new FunctionCatalogQueryCache(async () => { builds += 1; return catalog(); }, async () => true, { limit: 2, warmBudgetMs: 25 });
  assert.strictEqual((await cache.get(document)).complete, true);
  assert.strictEqual((await cache.get(document)).complete, true);
  assert.strictEqual(builds, 1, 'an exact document revision reuses one validated catalog build');
  const warm = cache.stats();
  assert.strictEqual(warm.hits, 1);
  assert.strictEqual(warm.misses, 1);
  assert.strictEqual(warm.warmSamples, 1, 'only a settled cache hit contributes a warm latency sample');
  assert.strictEqual(warm.warmBudgetExceeded, 0, `the warm catalog query stays inside the ${warm.warmBudgetMs}ms budget`);

  const gate = deferred(); let pendingBuilds = 0;
  const pendingCache = new FunctionCatalogQueryCache(async () => { pendingBuilds += 1; return gate.promise; }, async () => true);
  const first = pendingCache.get(document), joined = pendingCache.get(document);
  gate.resolve(catalog());
  assert.strictEqual((await first).complete, true); assert.strictEqual((await joined).complete, true);
  assert.strictEqual(pendingBuilds, 1, 'concurrent cold queries coalesce into one build');
  assert.strictEqual(pendingCache.stats().warmSamples, 0, 'waiting on an in-flight cold build is not reported as warm-cache latency');

  const staleGate = deferred();
  const staleCache = new FunctionCatalogQueryCache(() => staleGate.promise, async () => true);
  const stale = staleCache.get(document); document.version = 2; staleGate.resolve(catalog());
  assert.strictEqual((await stale).complete, false, 'a source revision change suppresses an older catalog result');

  document.version = 3; const invalidatedGate = deferred();
  const invalidatedCache = new FunctionCatalogQueryCache(() => invalidatedGate.promise, async () => true);
  const invalidated = invalidatedCache.get(document); invalidatedCache.invalidate(); invalidatedGate.resolve(catalog());
  assert.strictEqual((await invalidated).complete, false, 'DEF/dependency invalidation suppresses a pending catalog result');

  let authorityCurrent = true;
  const authorityCache = new FunctionCatalogQueryCache(async () => catalog(), async () => authorityCurrent);
  authorityCurrent = false;
  assert.strictEqual((await authorityCache.get(document)).complete, false, 'a changed ownership/assignment authority fails closed during validation');

  let unversionedSource = 'call One()'; let unversionedBuilds = 0;
  const unversioned = { uri: { toString: () => 'file:///Ryu/unversioned.zss' }, getText: () => unversionedSource };
  const unversionedCache = new FunctionCatalogQueryCache(async () => { unversionedBuilds += 1; return catalog(); }, async () => true);
  await unversionedCache.get(unversioned); unversionedSource = 'call Two()'; await unversionedCache.get(unversioned);
  assert.strictEqual(unversionedBuilds, 2, 'unversioned callers cannot reuse a catalog across different source text');

  const boundedCache = new FunctionCatalogQueryCache(async () => catalog(), async () => true, { limit: 2 });
  for (let index = 0; index < 3; index += 1) await boundedCache.get({ fileName: `C:\\Ryu\\${index}.zss`, uri: {}, version: 1, getText: () => '' });
  assert.strictEqual(boundedCache.stats().entries, 2, 'the warm cache evicts its oldest revision at the configured bound');

  console.log('Function catalog query cache tests passed');
})().catch(error => { console.error(error); process.exit(1); });
