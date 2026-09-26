'use strict';

const assert = require('assert');
const vm = require('vm');
const { TASK_RECIPES, workflowFor, workflowHtml, advancedActionBarHtml, taskRecipesHtml, workflowClientScript } = require('../src/guided_workflows');

const snd = workflowFor('snd', { entries: 12, profile: { filename: 'profile.json', definition: { role: 'voice', prefix: 'EN', buildManifestPath: 'voice-build.json' }, validation: { errors: [], warnings: ['review'] } } });
assert.strictEqual(snd[0].status, 'complete');
assert.strictEqual(snd[2].detail, 'voice uses prefix EN.');
assert.strictEqual(snd[3].status, 'review');
assert.strictEqual(snd[4].status, 'review');

const air = workflowFor('air', { hasSff: false, actions: 1, collisions: 0, hasRuntime: false, hasSources: false });
assert.strictEqual(air[0].status, 'current');
assert.strictEqual(air[2].status, 'current');

const stage = workflowFor('stage', { localCoord: [320, 240], hasSff: true, backgrounds: 2, issues: [{ severity: 'error' }] });
assert.strictEqual(stage[4].status, 'current');

const html = workflowHtml(snd);
assert(html.includes('[Done] Load and preview the SND archive'));
assert(html.includes('[Review] Review the manifest and rebuild with SndMaker'));
assert(html.includes('data-workflow-action="control:openProfile"'));
assert(!html.includes('<script'));
assert.doesNotThrow(() => new vm.Script(workflowClientScript()));
assert.strictEqual(advancedActionBarHtml('snd', { mode: 'learning' }), '');
const advanced = advancedActionBarHtml('snd', { mode: 'advanced' });
assert(advanced.includes('Advanced shortcuts'));
assert(advanced.includes('data-workflow-action="control:exportMarked"'));
assert(advanced.includes('data-workflow-action="control:rebuild"'));
assert.throws(() => advancedActionBarHtml('unknown', { mode: 'advanced' }), /Unknown Advanced action workspace/);
assert.strictEqual(TASK_RECIPES.stage.length, 4);
assert.ok(taskRecipesHtml('stage', { mode: 'learning' }).includes('details class="task-recipes" open'));
assert.ok(taskRecipesHtml('stage', { mode: 'advanced' }).includes('details class="task-recipes"'));
assert.ok(!taskRecipesHtml('stage', { mode: 'advanced' }).includes('task-recipes" open'));
assert.ok(taskRecipesHtml('screenpack', { mode: 'learning' }).includes('Keep Lua presentation-side'));
for (const workspace of ['sff', 'air', 'snd', 'commands']) {
  assert.strictEqual(TASK_RECIPES[workspace].length, 4);
  assert.ok(taskRecipesHtml(workspace, { mode: 'learning' }).includes('details class="task-recipes" open'));
  assert.ok(!taskRecipesHtml(workspace, { mode: 'advanced' }).includes('task-recipes" open'));
}
assert.ok(taskRecipesHtml('sff', { mode: 'learning' }).includes('Protect and assign palettes'));
assert.ok(taskRecipesHtml('air', { mode: 'learning' }).includes('Bridge runtime geometry deliberately'));
assert.ok(taskRecipesHtml('snd', { mode: 'learning' }).includes('Validate the split-archive contract'));
assert.ok(taskRecipesHtml('commands', { mode: 'learning' }).includes('Build the sequence step by step'));
assert.throws(() => workflowFor('unknown'), /Unknown guided workflow/);

console.log('Guided workflow tests passed');
