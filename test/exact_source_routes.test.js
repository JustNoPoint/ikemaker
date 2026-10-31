'use strict';

const assert = require('assert');
const path = require('path');
const { ExactSourceRegistry, normalizeRoute, connectedResources, fingerprint } = require('../src/exact_source_routes');

const file = path.resolve('test/fixtures/example.zss');
const exact = normalizeRoute({ filename: file, identity: 'exact-document', fingerprint: 'a', version: '1', access: 'external-editor', mutationOwner: 'native-text-editor', contextId: 'character:ryu', selectionRevision: 2 });
assert(Object.isFrozen(exact));
assert.strictEqual(exact.filename, file);
assert.strictEqual(normalizeRoute({ ...exact, fingerprint: 'old' }, { fingerprint: 'new', selectionRevision: 2 }).available, false);
assert.strictEqual(normalizeRoute({ ...exact, selectionRevision: 1 }, { selectionRevision: 2 }).available, false);
assert.throws(() => normalizeRoute({ ...exact, identity: 'connected-only' }), /Unsupported/);
assert.throws(() => normalizeRoute({ ...exact, identity: 'selected-block', line: undefined }), /line or range/);
assert.strictEqual(normalizeRoute({ ...exact, identity: 'selected-block', range: { start: 3, end: 8 } }).range.start, 3);
assert.throws(() => normalizeRoute({ ...exact, identity: 'selected-block', range: { start: -1, end: 8 } }), /nonnegative/);
assert.throws(() => normalizeRoute({ ...exact, identity: 'selected-block', range: { start: 8, end: 3 } }), /nonnegative/);
assert.throws(() => normalizeRoute({ ...exact, identity: 'selected-block', range: { start: 1.5, end: 3 } }), /nonnegative/);
assert.strictEqual(normalizeRoute({ ...exact, identity: 'manifest' }).identity, 'manifest');
assert.strictEqual(fingerprint('same'), fingerprint('same'));

(async () => {
  const capabilities = { 'implemented.exact-document': { id: 'implemented.exact-document', status: 'implemented', identity: 'exact-document', resolverId: 'air-source' } };
  const surfaces = [{ id: 'air.viewer', sourceCapabilityId: 'implemented.exact-document' }];
  const registry = new ExactSourceRegistry({ capabilities, surfaces }), opened = [];
  assert.throws(() => new ExactSourceRegistry().register({ id: 'air-source', capabilityId: 'planned.exact-document', surfaceId: 'air.viewer', resolve() {} }), /not implemented/);
  const unregister = registry.register({ id: 'air-source', capabilityId: 'implemented.exact-document', surfaceId: 'air.viewer', resolve: request => ({ ...exact, contextId: request.contextId, selectionRevision: request.selectionRevision }) });
  assert.throws(() => registry.register({ id: 'bad', capabilityId: 'planned.connected-only', surfaceId: 'x', resolve() {} }), /Unknown/);
  assert.throws(() => registry.register({ id: 'air-source', capabilityId: 'implemented.exact-document', surfaceId: 'air.viewer', resolve() {} }), /Duplicate/);
  const route = await registry.open('air-source', { contextId: 'character:ryu', selectionRevision: 2 }, value => opened.push(value));
  assert.strictEqual(route.available, true); assert.strictEqual(opened.length, 1);
  assert.strictEqual((await registry.resolve('missing', {})).available, false);
  assert.deepStrictEqual(registry.list().map(item => item.id), ['air-source']);
  unregister(); assert.deepStrictEqual(registry.list(), []);
  const resources = connectedResources('character:ryu', [file, file, path.resolve('test/fixtures/other.air')]);
  assert.strictEqual(resources.exactSource, false); assert.strictEqual(resources.files.length, 2); assert(Object.isFrozen(resources.files));
  console.log('Exact source routing, staleness, ambiguity, and Connected Resources separation passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
