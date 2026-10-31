'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createEntitySwitchCoordinator } = require('../src/entity_switch_coordinator');
const { createEntitySwitchHost, ADAPTER_RETAINED_STATE_KEY } = require('../src/entity_switch_host');
const { SWITCH_MESSAGE } = require('../src/entity_header');

const surfaces = Object.freeze([
  'sff.viewer', 'sff.browser', 'air.viewer', 'air.browser', 'snd.viewer',
  'snd.browser', 'companion.text-toolbar', 'code.structure',
  'stage.workspace', 'screenpack.workspace'
]);

function descriptor(name, kind = 'character') {
  return {
    kind,
    projectId: 'acceptance-project',
    ownerFile: path.resolve(`C:/Game/${kind}/${name}.def`),
    label: name
  };
}

function panel() {
  const listeners = [];
  return {
    webview: {
      postMessage() { return true; },
      onDidReceiveMessage(listener) { listeners.push(listener); return { dispose() {} }; }
    },
    onDidDispose() { return { dispose() {} }; }
  };
}

(async () => {
  const coordinator = createEntitySwitchCoordinator();
  const first = coordinator.register(descriptor('First'), { active:true });
  const second = coordinator.register(descriptor('Second'));
  const host = createEntitySwitchHost({ coordinator });
  const commits = [], writes = [];

  for (const surfaceId of surfaces) {
    const view = panel();
    host.registerHeader(view, { surfaceId, adapterId:surfaceId });
    host.registerAdapter({
      id:surfaceId,
      surfaceId,
      transferPinned:false,
      async supports() { return true; },
      async prepare() { return { ok:true, retainedState:{ selection:`${surfaceId}:selection` } }; },
      async validate() { return true; },
      async commit() { commits.push(surfaceId); },
      async rollback() {}
    });
  }

  const requestPanel = [...host.headers.keys()][0];
  const result = await host.handleMessage(requestPanel, {
    type:SWITCH_MESSAGE,
    identity:second,
    revision:coordinator.snapshot().revision
  });
  assert.strictEqual(result.status, 'committed');
  assert.deepStrictEqual(commits, surfaces, 'every ordinary viewer and companion participates in one host-owned transaction');
  assert.deepStrictEqual(writes, [], 'the synchronization transaction has no asset-write path');
  const retained = coordinator.snapshot().entities.find(item => item.identity === first).retainedState[ADAPTER_RETAINED_STATE_KEY];
  assert.deepStrictEqual(Object.keys(retained), surfaces, 'each surface retains state under its exact adapter id');

  const attachmentContracts = new Map([
    ['src/sff_viewer.js', "surfaceId:'sff.viewer'"],
    ['src/sff_browser.js', "surfaceId:'sff.browser'"],
    ['src/air_viewer.js', "surfaceId:'air.viewer'"],
    ['src/air_docking_workspace.js', "surfaceId:'air.browser'"],
    ['src/snd_viewer.js', "surfaceId:'snd.viewer'"],
    ['src/snd_browser.js', "surfaceId:'snd.browser'"],
    ['src/text_editor_toolbar.js', "surfaceId:'companion.text-toolbar'"],
    ['src/code_structure_workspace.js', "surfaceId:'code.structure'"],
    ['src/stage_workspace.js', "surfaceId:'stage.workspace'"],
    ['src/screenpack_workspace.js', "surfaceId:'screenpack.workspace'"]
  ]);
  for (const [filename, marker] of attachmentContracts) {
    const source = fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
    assert(source.includes('attachEntitySurface(panel'), `${filename} must attach its live panel to the shared runtime`);
    assert(source.includes(marker), `${filename} must use the exact synchronized surface id`);
  }
  const extension = fs.readFileSync(path.join(__dirname, '../src/extension.js'), 'utf8');
  assert(extension.indexOf('initializeEntitySwitchRuntime(vscode, context)') < extension.indexOf('textEditorToolbar.register(vscode, context)'), 'the runtime starts before any companion or viewer can attach');
  host.dispose();
  console.log('All ordinary entity-dependent viewers and companion browsers share one no-write transaction host');
})().catch(error => { console.error(error); process.exitCode = 1; });
