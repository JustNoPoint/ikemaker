'use strict';

const assert = require('assert');
const { readIndexedPng8 } = require('../src/sff_png8_source');
const { normalizeSprMake2IndexedPng } = require('../src/sff_sprmake2_png_adapter');
const { noncanonicalIndexedPng } = require('../tools/generate_sff_runtime_certification_fixtures');

const binary = noncanonicalIndexedPng({ partialTransparency: false }), binaryBefore = readIndexedPng8(binary.bytes);
const normalized = normalizeSprMake2IndexedPng(binary.bytes, binary.source.relativePath), binaryAfter = readIndexedPng8(normalized.bytes);
assert.strictEqual(normalized.compatible, true);
assert.strictEqual(normalized.normalized, true);
assert.deepStrictEqual(binaryAfter.indices, binaryBefore.indices, 'canonicalization preserves every reviewed palette index');
assert.deepStrictEqual(binaryAfter.colors, binaryBefore.colors, 'canonicalization preserves the complete binary-alpha palette');
assert.strictEqual(normalized.decodedHash, binaryBefore.decodedHash);

const partial = noncanonicalIndexedPng(), partialBefore = readIndexedPng8(partial.bytes), rejected = normalizeSprMake2IndexedPng(partial.bytes, partial.source.relativePath);
assert.strictEqual(rejected.compatible, false, 'SprMake2 partial-alpha loss is reported instead of silently flattened');
assert.strictEqual(rejected.normalized, false);
assert.strictEqual(rejected.bytes, partial.bytes, 'unsupported bytes remain exact for package-only and built-in comparison workflows');
assert(rejected.partialAlphaIndexes.length > 0);
assert(rejected.partialAlphaIndexes.every(index => ![0, 255].includes(partialBefore.colors[index][3])));
assert.match(rejected.reason, /SprMake2 cannot preserve/);

console.log('SprMake2 PNG8 adapter canonicalizes supported containers losslessly and blocks partial-alpha loss');
