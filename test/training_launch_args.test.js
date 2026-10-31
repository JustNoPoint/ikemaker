'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const model = require('../src/training_launch_args');

const args = model.buildTrainingArgs('-time', '-1', '-p1', 'chars/Ryu/Ryu.def');
assert.deepStrictEqual(args.slice(0, 2), ['-training', '1']);
assert(!args.includes('-loadmotif'));
assert.throws(() => model.assertSafeTrainingArgs(['-loadmotif', '1', '-training', '1']), /crashes in menu\.lua/);

for (const filename of ['ikemen_hub.js', 'quick_launch_presets.js', 'test_session_workspace.js']) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', filename), 'utf8');
  assert(!/-loadmotif[^\n]*-training|-training[^\n]*-loadmotif/.test(source), `${filename} restored the crashing Training/-loadmotif combination`);
}

console.log('training launch argument safety tests passed');
