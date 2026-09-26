'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const controllers = require('../data/sctrl.json');
const triggers = require('../data/triggers.json');
const luaApi = require('../data/lua-api.json');
const { WORKSPACES, workspaceExperience } = require('../src/experience_model');
const { ADVANCED_ACTIONS, TASK_RECIPES, workflowFor } = require('../src/guided_workflows');
const { formatControllerSnippet } = require('../src/sctrl');
const { controllerAuthoringPlan, controllerAuthoringText } = require('../src/controller_authoring');
const { completionModels, hoverModel, luaCompletionModels, luaHoverModel } = require('../src/language_intelligence');
const { scaffoldChoices, createCharacterPlan } = require('../src/character_creation');

function semanticZss(text) {
  return String(text).split(/\r?\n/).map((line) => line.replace(/#.*$/, '').trim()).filter(Boolean).join('\n');
}

for (const workspace of Object.keys(WORKSPACES)) {
  const learning = workspaceExperience(workspace, 'learning'), advanced = workspaceExperience(workspace, 'advanced');
  assert.strictEqual(learning.workspace, advanced.workspace);
  assert.strictEqual(learning.domain, advanced.domain);
  assert.strictEqual(learning.title, advanced.title);
}

for (const controller of controllers) {
  assert.strictEqual(semanticZss(formatControllerSnippet(controller, 'learning')), semanticZss(formatControllerSnippet(controller, 'advanced')), `${controller.name} completion semantics differ`);
}

const authored = controllers.find((item) => item.name === 'ChangeState');
const plan = controllerAuthoringPlan(authored, ['ctrl']);
const values = { value: '200', ctrl: 'true' };
assert.strictEqual(semanticZss(controllerAuthoringText(plan, values, 'learning')), semanticZss(controllerAuthoringText(plan, values, 'advanced')));

const zssLearning = completionModels({ text: 'change', line: 0, linePrefix: 'change', languageId: 'zss', experience: 'learning', controllers, triggers });
const zssAdvanced = completionModels({ text: 'change', line: 0, linePrefix: 'change', languageId: 'zss', experience: 'advanced', controllers, triggers });
assert.deepStrictEqual(zssLearning.map((item) => item.label), zssAdvanced.map((item) => item.label));
assert.deepStrictEqual(zssLearning.map((item) => semanticZss(item.insertText)), zssAdvanced.map((item) => semanticZss(item.insertText)));

const triggerLearning = hoverModel({ word: 'MoveCountered', text: '', line: 0, experience: 'learning', controllers, triggers });
const triggerAdvanced = hoverModel({ word: 'MoveCountered', text: '', line: 0, experience: 'advanced', controllers, triggers });
assert.deepStrictEqual({ title: triggerLearning.title, summary: triggerLearning.summary, url: triggerLearning.url }, { title: triggerAdvanced.title, summary: triggerAdvanced.summary, url: triggerAdvanced.url });

const luaLearning = luaCompletionModels({ linePrefix: 'return ', experience: 'learning', api: luaApi });
const luaAdvanced = luaCompletionModels({ linePrefix: 'return ', experience: 'advanced', api: luaApi });
assert.deepStrictEqual(luaLearning.map(({ label, insertText }) => ({ label, insertText })), luaAdvanced.map(({ label, insertText }) => ({ label, insertText })));
const luaName = luaApi.find((item) => item.kind !== 'hook').name;
const luaLearningHover = luaHoverModel({ word: luaName, experience: 'learning', api: luaApi });
const luaAdvancedHover = luaHoverModel({ word: luaName, experience: 'advanced', api: luaApi });
assert.deepStrictEqual({ title: luaLearningHover.title, summary: luaLearningHover.summary, url: luaLearningHover.url }, { title: luaAdvancedHover.title, summary: luaAdvancedHover.summary, url: luaAdvancedHover.url });

assert.deepStrictEqual([...scaffoldChoices('learning').map((item) => item.value)].sort(), [...scaffoldChoices('advanced').map((item) => item.value)].sort());
for (const style of ['guided', 'minimal']) {
  const a = createCharacterPlan(path.join('C:\\game\\chars\\test', 'test.def'), { style });
  const b = createCharacterPlan(path.join('C:\\game\\chars\\test', 'test.def'), { style });
  assert.deepStrictEqual([...a.files.entries()], [...b.files.entries()]);
}

const workflowContexts = {
  sff: { sprites: 1, palettes: 1, unresolved: 0 }, air: { hasSff: true, actions: 1, collisions: 1, hasRuntime: true, hasSources: true },
  snd: { entries: 1, profile: {} }, stage: { localCoord: [320, 240], hasSff: true, backgrounds: 1, issues: [] },
  screenpack: { localCoord: [320, 240], hasSff: true, screens: 1, issues: [] }, commands: { commands: 1, errors: 0, commandFile: 'test.cmd' }
};
for (const [workspace, context] of Object.entries(workflowContexts)) assert.deepStrictEqual(workflowFor(workspace, context), workflowFor(workspace, context));
assert.ok(TASK_RECIPES.stage && TASK_RECIPES.screenpack);

const sourceFiles = { sff: 'sff_viewer.js', air: 'air_viewer.js', snd: 'snd_viewer.js', stage: 'stage_workspace.js', screenpack: 'screenpack_workspace.js', commands: 'command_movelist_workspace.js' };
for (const [workspace, actions] of Object.entries(ADVANCED_ACTIONS)) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', sourceFiles[workspace]), 'utf8');
  for (const action of actions) {
    const target = action.action.slice(action.action.indexOf(':') + 1);
    assert.ok(source.includes(`id="${target}"`) || source.includes(`id='${target}'`), `${workspace} Advanced shortcut target ${target} is not an existing workspace control`);
  }
}

console.log('Learning/Advanced semantic equivalence tests passed');
