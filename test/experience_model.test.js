'use strict';

const assert = require('assert');
const { PRESETS, normalizeMode, normalizeProfile, summary, workspaceExperience } = require('../src/experience_model');

assert.strictEqual(normalizeMode('advanced'), 'advanced');
assert.strictEqual(normalizeMode('unknown'), 'learning');
assert.deepStrictEqual(normalizeProfile({ zss: 'advanced' }), {
  zss: 'advanced', lua: 'learning', cns: 'learning', assets: 'learning', stageUi: 'learning'
});
assert.deepStrictEqual(PRESETS.cnsVeteran, {
  zss: 'learning', lua: 'learning', cns: 'advanced', assets: 'advanced', stageUi: 'learning'
});
assert.ok(summary(PRESETS.cnsVeteran).includes('ZSS: Learning'));
assert.ok(summary(PRESETS.cnsVeteran).includes('CNS: Advanced'));
assert.deepStrictEqual(workspaceExperience('air', 'learning'), {
  workspace: 'air', domain: 'assets', label: 'AIR · Learning', title: 'Animation and collision data',
  mode: 'learning',
  guidance: 'Choose an action and frame first. AIR owns animation timing and Clsn boxes; runtime push, guard-distance, and transformed collision belong in character code.',
  guidanceOpen: true, compact: false
});
assert.strictEqual(workspaceExperience('snd', 'advanced').guidanceOpen, false);
assert.strictEqual(workspaceExperience('stage', 'advanced').compact, true);
assert.throws(() => workspaceExperience('unknown', 'learning'), /Unknown IKEMEN workspace/);

console.log('Experience profile tests passed');
