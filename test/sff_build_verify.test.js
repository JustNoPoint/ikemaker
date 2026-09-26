'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const reader = require('../src/sff_reader');

const original = reader.readSff;
const modulePath = require.resolve('../src/sff_build_verify');
try {
  reader.readSff = () => ({ sprites: [
    { group: 120, number: 0 }, { group: 120, number: 1 },
    { group: 5000, number: 0 }, { group: 5000, number: 10 }
  ] });
  delete require.cache[modulePath];
  let verify = require('../src/sff_build_verify');
  const expected = [{ group: 120, index: 0 }, { group: 120, index: 1 }, { group: 5000, index: 0 }, { group: 5000, index: 10 }];
  assert.strictEqual(verify.verifyBuiltArchive('built.sff', expected).ok, true);
  assert.throws(() => verify.assertBuiltArchive('built.sff', [...expected.slice(0, 3), { group: 5000, index: 1 }]), /missing identities: 5000,1/);
  assert.throws(() => verify.assertBuiltArchive('built.sff', expected.slice(0, 3)), /unexpected identities: 5000,10/);
} finally {
  reader.readSff = original;
  delete require.cache[modulePath];
}

console.log('Compiled SFF manifest verification tests passed');
