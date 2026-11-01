'use strict';

const assert = require('assert');
const path = require('path');
const { createBrowserRegistry } = require('../src/authoring_browser_registry');
const { createAuthoringBrowserWorkspace, flattenProviderRows } = require('../src/authoring_browser_workspace');

const controllerDto = Object.freeze({ items: Object.freeze([
  Object.freeze({ id: 'changed', label: 'Changed / Expanded (1) *', description: '1 entry', reviewGroup: 'changed', reviewSnapshot: 'a'.repeat(64), markerText: 'New or changed in selected engine build', children: Object.freeze([
    Object.freeze({ id: 'shader-set', label: 'ShaderSet *', description: '12 options · New or changed in selected engine build', reviewController: 'ShaderSet', reviewSnapshot: 'a'.repeat(64), markerText: 'New or changed in selected engine build' })
  ]) })
]) });
const stableDto = Object.freeze({ items: Object.freeze([Object.freeze({ id: 'old', label: 'MUGEN Compatible (1)', children: Object.freeze([Object.freeze({ id: 'vel-set', label: 'VelSet' })]) })]) });

(async () => {
  const intents = [], registry = createBrowserRegistry({ controllers: { read: async () => controllerDto } });
  const workspace = createAuthoringBrowserWorkspace({ registry, onIntent(intent) { intents.push(intent); } });
  await workspace.open({ root: process.cwd() });
  const snapshot = workspace.snapshot(), provider = snapshot.providers.find((entry) => entry.id === 'controllers'), rows = flattenProviderRows('controllers', provider.data), controller = rows.find((row) => row.selection.reviewController), group = rows.find((row) => row.selection.reviewGroup), html = workspace.html();
  assert(controller && group, 'the browser consumes the same explicit marker DTO for controller and parent group');
  assert(html.includes('New or changed in selected engine build') && html.includes('Review Change…') && html.includes('Clear Group Markers…'));
  await workspace.handleMessage({ type: 'review-controller-change', generation: snapshot.generation, providerId: 'controllers', rowId: controller.rowId });
  await workspace.handleMessage({ type: 'clear-controller-change-group', generation: snapshot.generation, providerId: 'controllers', rowId: group.rowId });
  assert.deepStrictEqual(intents, [{ type: 'review-controller-change', controller: 'ShaderSet', groupId: undefined, snapshotId: 'a'.repeat(64) }, { type: 'clear-controller-change-group', controller: undefined, groupId: 'changed', snapshotId: 'a'.repeat(64) }]);

  const twoProjectIntents = [], twoProjectRegistry = createBrowserRegistry({ controllers: { read: async (context) => path.basename(context.root) === 'project-a' ? controllerDto : stableDto } }), twoProject = createAuthoringBrowserWorkspace({ registry: twoProjectRegistry, onIntent(intent, authority) { twoProjectIntents.push({ intent, root: authority.context.root }); } });
  await twoProject.open({ root: path.join(process.cwd(), 'project-a') });
  const projectA = twoProject.snapshot(), projectARow = flattenProviderRows('controllers', projectA.providers.find((entry) => entry.id === 'controllers').data).find((row) => row.selection.reviewController);
  await twoProject.open({ root: path.join(process.cwd(), 'project-b') });
  assert.strictEqual(await twoProject.handleMessage({ type: 'review-controller-change', generation: projectA.generation, providerId: 'controllers', rowId: projectARow.rowId }), false, 'a browser intent captured in project A is rejected after the browser binds project B');
  assert.strictEqual(twoProjectIntents.length, 0);
  assert(!twoProject.html().includes('Review Change…'), 'project B renders from its bound context rather than the active editor or prior project');

  const stableWorkspace = createAuthoringBrowserWorkspace({ registry: createBrowserRegistry({ controllers: { read: async () => stableDto } }) });
  await stableWorkspace.open({ root: process.cwd() });
  const stableHtml = stableWorkspace.html();
  assert(!stableHtml.includes('Review Change…') && !stableHtml.includes('Clear Group Markers…') && !stableHtml.includes('New or changed in selected engine build'), 'stable DTO has no marker markup or acknowledgement actions');
  const commandPalette = require('../package.json').contributes.menus.commandPalette;
  for (const command of ['zssControllers.reviewChange', 'zssControllers.clearChangeGroup']) assert(commandPalette.some((entry) => entry.command === command && entry.when.includes('ikemen.controllerChangesAvailable')), `${command} must be hidden from the Command Palette unless exact Nightly markers exist`);
  console.log('desktop/browser controller change surfaces consume one accessible DTO and stable omits all marker actions');
})().catch((error) => { console.error(error); process.exitCode = 1; });
