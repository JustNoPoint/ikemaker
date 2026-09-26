'use strict';

const assert = require('assert');
const { parseSizeboxLine, readCharacterScale, scaleSizebox, formatScaledLine } = require('../src/sizebox');

const parsed = parseSizeboxLine('stand.sizebox = -17, -81, 20, 0');
assert.deepStrictEqual(readCharacterScale('[Size]\nxscale = 0.9875\nyscale = 1.185'), [0.9875, 1.185]);
assert.deepStrictEqual(scaleSizebox(parsed.source, [1.185, 1.185], [0.9875, 1.185]), [-20.4, -81, 24, 0]);
const generated = formatScaledLine(parsed, [-20.4, -81, 24, 0], [1.185, 1.185]);
const regenerated = parseSizeboxLine(generated);
assert.deepStrictEqual(regenerated.source, [-17, -81, 20, 0]);
assert.deepStrictEqual(regenerated.referenceScale, [1.185, 1.185]);

console.log('sizebox tests passed');
