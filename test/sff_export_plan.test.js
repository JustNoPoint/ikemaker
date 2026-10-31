'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { planSpritePngExports, executeSpritePngExport } = require('../src/sff_export_plan');

const archive = { sprites: [
  { group: 0, number: 0 },
  { group: 3, number: 7 },
  { group: 3, number: 7 },
  { group: 3, number: 8 }
] };
const plan = planSpritePngExports(archive, [3, 2, 1, 2]);
assert.deepStrictEqual(plan.map(item => item.filename), ['g00003_i00008.png', 'g00003_i00007_p00002.png', 'g00003_i00007_p00001.png']);
assert.deepStrictEqual(plan.map(item => item.index), [3, 2, 1], 'reviewed physical order is retained and duplicate requested indices collapse');
assert.strictEqual(plan[1].repeatedIdentity, true);
assert.strictEqual(plan[0].repeatedIdentity, false);
assert.throws(() => planSpritePngExports(archive, [99]), /missing physical index/);
assert.throws(() => planSpritePngExports(archive, []), /at least one sprite/);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-sff-export-plan-'));
try {
  const blocked = path.join(root, 'blocked'); fs.mkdirSync(blocked);
  const collision = path.join(blocked, 'g00003_i00007_p00002.png'); fs.writeFileSync(collision, 'existing');
  assert.throws(() => executeSpritePngExport(fs, archive, [1, 2], blocked, { renderSprite: (_archive, sprite) => Buffer.from(`sprite-${sprite.group}-${sprite.number}`) }), /already exists|replace/i);
  assert.strictEqual(fs.readFileSync(collision, 'utf8'), 'existing');
  assert.strictEqual(fs.existsSync(path.join(blocked, 'g00003_i00007_p00001.png')), false, 'a collision must prevent every write in the batch');
  const output = path.join(root, 'output'), result = executeSpritePngExport(fs, archive, [1, 2], output, { label: 'test-sff-export', renderSprite: (_archive, sprite) => Buffer.from(`sprite-${sprite.group}-${sprite.number}`) });
  assert.strictEqual(result.files.length, 2);
  assert(result.files.every(filename => fs.existsSync(filename)));
} finally { fs.rmSync(root, { recursive: true, force: true }); }

console.log('SFF PNG export preserves repeated physical identities and commits collision-safe batches atomically');
