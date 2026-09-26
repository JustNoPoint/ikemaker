'use strict';
const assert = require('assert');
const { SignatureCache } = require('../src/signature_cache');
const cache = new SignatureCache(2), first = { size: 10, mtimeMs: 1 }, changed = { size: 11, mtimeMs: 1 };
cache.set('a', first, 'parsed'); assert.strictEqual(cache.get('a', first), 'parsed'); assert.strictEqual(cache.get('a', changed), undefined);
cache.set('a', first, 1); cache.set('b', first, 2); cache.set('c', first, 3); assert.strictEqual(cache.get('a', first), undefined);
console.log('Signature cache tests passed');
