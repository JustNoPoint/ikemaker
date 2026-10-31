'use strict';

const assert = require('assert');
const { decodeStrictJsonArtifact } = require('../src/sff_strict_json_artifact');

assert.deepStrictEqual(decodeStrictJsonArtifact(Buffer.from('{"a":1,"b":[true,null]}'), 'Fixture').parsed, { a: 1, b: [true, null] });
assert.throws(() => decodeStrictJsonArtifact(Buffer.from('{"a":1,"a":2}'), 'Fixture'), /Duplicate JSON object key a/);
assert.throws(() => decodeStrictJsonArtifact(Buffer.from([0xc3, 0x28]), 'Fixture'), /not strict JSON/);
assert.throws(() => decodeStrictJsonArtifact(Buffer.from('{"a":1} trailing'), 'Fixture'), /Unexpected JSON content/);
assert.throws(() => decodeStrictJsonArtifact(Buffer.from('{"__proto__":{"approved":true}}'), 'Fixture'), /__proto__/);
assert.throws(() => decodeStrictJsonArtifact(Buffer.from('{"a":1e9999}'), 'Fixture'), /finite JSON numbers/);
assert.throws(() => decodeStrictJsonArtifact(null, 'Fixture'), /exact bytes are required/);
console.log('Strict SFF JSON artifacts reject invalid UTF-8, duplicate or prototype keys, non-finite numbers, trailing content, and missing exact bytes');
