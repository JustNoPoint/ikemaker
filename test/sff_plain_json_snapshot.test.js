'use strict';

const assert = require('assert');
const { snapshotPlainJson } = require('../src/sff_plain_json_snapshot');

const input = { b: [1, { c: true }], a: 'x' }, copy = snapshotPlainJson(input, 'fixture');
assert.deepStrictEqual(copy, { a: 'x', b: [1, { c: true }] }); input.b[1].c = false; assert.strictEqual(copy.b[1].c, true);
assert.throws(() => snapshotPlainJson(new Proxy({}, {}), 'fixture'), /non-proxy/);
assert.throws(() => snapshotPlainJson({ nested: new Proxy({}, {}) }, 'fixture'), /non-proxy/);
const accessor = {}; Object.defineProperty(accessor, 'a', { enumerable: true, get() { return 1; } }); assert.throws(() => snapshotPlainJson(accessor, 'fixture'), /accessor/);
const sparse = []; sparse.length = 2; sparse[1] = true; assert.throws(() => snapshotPlainJson(sparse, 'fixture'), /dense/);
assert.throws(() => snapshotPlainJson({ value: undefined }, 'fixture'), /JSON data/);
console.log('Shared SFF JSON snapshots detach plain data and reject proxies, accessors, sparse arrays, exotic values and mutation');
