'use strict';

const assert = require('assert');
const build = require('../src/sound_build');

const parsed = build.parse('out.snd\na.wav\n200\n0\nb.wav\n10200\n0\n');
assert.strictEqual(parsed.entries.length, 2);
build.setEntry(parsed, 200, 1, 'c.wav');
assert.strictEqual(parsed.entries[1].index, 1);
assert(build.removeEntry(parsed, 10200, 0));
assert(build.stringify(parsed).includes('c.wav\r\n200\r\n1'));
const remapped = { output: 'out.snd', entries: [{ source: 'a.wav', group: 200, index: 0 }, { source: 'b.wav', group: 100, index: 0 }] };
build.remapEntries(remapped, [{ fromGroup: 200, fromIndex: 0, toGroup: 300, toIndex: 4 }]);
assert.deepStrictEqual(remapped.entries.map((entry) => [entry.group, entry.index]), [[100, 0], [300, 4]]);
assert.throws(() => build.remapEntries(remapped, [{ fromGroup: 300, fromIndex: 4, toGroup: 100, toIndex: 0 }]), /duplicate sound identity/);
assert.throws(() => build.parse('out.snd\na.wav\n200\n'), /source\/group\/index triples/);
console.log('Sound build tests passed');
