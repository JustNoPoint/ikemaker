'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const Module = require('module');
const { SLOTS, slotCoordinates, SPECIALIST_ACTION_IDS } = require('../src/viewer_toolbar_contract');

const originalLoad = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return {
    env: { uiKind: 1 }, UIKind: { Web: 2 },
    Uri: { file: fsPath => ({ fsPath, scheme: 'file', toString: () => `file:///${String(fsPath).replace(/\\/g, '/')}` }) },
    workspace: { textDocuments: [], getConfiguration: () => ({ get: (_key, fallback) => fallback }) }
  };
  return originalLoad.call(this, request, parent, main);
};

const code = require('../src/code_structure_workspace');
const stage = require('../src/stage_workspace');
const screenpack = require('../src/screenpack_workspace');
const sff = require('../src/sff_viewer');
const comparison = require('../src/viewer_comparison');
Module._load = originalLoad;

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'toolbar-f1-renderers-'));
try {
  const stageFile = path.join(root, 'stage.def');
  fs.writeFileSync(stageFile, '[Info]\nname=F1\n[Camera]\nstartx=0\n[StageInfo]\nzoffset=200\n[BGDef]\n[BG Sky]\ntype=normal\nspriteno=0,0\nstart=0,0\n');
  const systemFile = path.join(root, 'system.def');
  fs.writeFileSync(systemFile, '[Info]\nname=F1\nlocalcoord=320,240\n[Files]\n[Title Info]\nmenu.pos=160,120\nmenu.item.font=0,0,0\n');
  const source = '[StateDef 0]\nnull{}\n';
  const document = { languageId: 'zss', fileName: path.join(root, 'main.zss'), uri: { toString: () => 'file:///main.zss' }, getText: () => source };

  const pages = [
    { name: 'code', html: code.html(code.clientModel(document)), local: ['id="filePrevious"', 'id="fileSlider"', 'id="fileNext"'] },
    { name: 'stage', html: stage.stageHtml(stage.stagePayload(stageFile)), local: ['id="cameraZoom"', 'id="fit"', 'id="compare"'] },
    { name: 'screenpack', html: screenpack.uiHtml(screenpack.uiPayload(systemFile)), local: ['id="screenpackScreenScroll"', 'id="screenpackElementScroll"'] },
    { name: 'asset', html: sff.viewerHtml({}, { filename: path.join(root, 'F1.sff'), header: { version: [2, 1, 0, 0] }, sprites: [], palettes: [] }, new Map(), [], { sprites: {} }), local: ['class="title">F1.sff', 'class="pane-buttons"', '>Save SFF<', '>Save As…<', 'id="previous"', 'id="next"', 'id="fit"', 'id="actual"', 'id="panLeft"', 'id="resetView"', 'id="axisToggle"'] },
    { name: 'companion', html: comparison.html({ kind: 'snd', identity: 'SND 1,0', filename: 'a.snd', detail: 'a', media: 'data:audio/wav;base64,AA==' }, { kind: 'snd', identity: 'SND 2,0', filename: 'b.snd', detail: 'b', media: 'data:audio/wav;base64,AA==' }, 'f1'), local: ['id="swap"', 'comparison-content'] }
  ];
  const canonicalCoordinates = slotCoordinates().map(item => `${item.groupIndex}:${item.slotIndex}`);
  for (const page of pages) {
    assert.strictEqual((page.html.match(/data-toolbar-contract="universal-v1"/g) || []).length, 1, `${page.name} production renderer owns one primary strip`);
    assert.strictEqual((page.html.match(/data-universal-slot=/g) || []).length, SLOTS.length, `${page.name} production renderer preserves all primary coordinates`);
    assert.strictEqual((page.html.match(/ikemaker-universal-toolbar__group"/g) || []).length, 4, `${page.name} production renderer preserves four whole groups`);
    assert.deepStrictEqual([...page.html.matchAll(/data-universal-coordinate="([^"]+)"/g)].map(match => match[1]), canonicalCoordinates, `${page.name} production coordinates match`);
    assert.strictEqual((page.html.match(/acquireVsCodeApi\(\)/g) || []).length, 1, `${page.name} production renderer owns one VS Code bridge`);
    const primary = page.html.slice(page.html.indexOf('data-toolbar-contract="universal-v1"'), page.html.indexOf('</nav>'));
    for (const specialist of SPECIALIST_ACTION_IDS) assert(!primary.includes(specialist), `${page.name} keeps ${specialist} outside primary chrome`);
    for (const marker of page.local) assert(page.html.includes(marker), `${page.name} retains local control ${marker}`);
  }

  const assetStyle = require('../src/viewer_toolbar').style();
  for (const preserved of ['.title', '#saveSff', '#saveSffAs', '#previous', '#next', '#fit', '#actual', '#panLeft', '#resetView', '#axisToggle']) {
    assert(!new RegExp(`${preserved.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^}]*display:none`).test(assetStyle), `${preserved} is not retired by cohesion CSS`);
  }
  assert(assetStyle.includes('.legacy-viewer-action-row{display:none!important}'), 'the duplicate SFF preview action row is retired as one unit');
  const toolbar = require('../src/viewer_toolbar');
  assert(toolbar.clientScript().includes("document.getElementById('saveSff')?.parentElement?.classList.add('legacy-viewer-action-row')"), 'the SFF legacy row is identified without hiding specialist body rows');
  const sffViewElements = new Set(toolbar.menuDefinitions('sff').find(group => group.label === 'View').items.map(item => item.element).filter(Boolean));
  for (const id of ['previous','next','fit','actual','resetView','panLeft','panUp','panDown','panRight','axisToggle','axisLayerToggle','proofBackground','proofColor']) assert(sffViewElements.has(id), `${id} remains available from the SFF View dropdown after retiring the duplicate row`);

  const companionPage = pages.find(page => page.name === 'companion').html;
  const binding = companionPage.match(/\(function\(\)\{'use strict';const root=document\.querySelector\('\.ikemaker-universal-toolbar'\);[\s\S]*?\}\)\(\);/);
  assert(binding, 'production companion embeds the shared universal binding');
  const listeners = [], posts = [], toolbarRoot = { dataset: {}, contains: () => true, addEventListener: (type, listener) => listeners.push({ type, listener }) };
  const button = { disabled: false, dataset: { universalSlot: 'help' } };
  const context = { document: { querySelector: selector => selector === '.ikemaker-universal-toolbar' ? toolbarRoot : null, addEventListener: () => {} }, vscode: { postMessage: message => posts.push(message) } };
  vm.runInNewContext(binding[0], context);
  vm.runInNewContext(binding[0], context);
  assert.strictEqual(listeners.length, 3, 're-evaluating production binding is idempotent across click, keyboard, and context-menu handlers');
  listeners.find(item=>item.type==='click').listener({ target: { closest: selector => selector === '[data-universal-slot]' ? button : null } });
  assert.strictEqual(posts.length, 1, 'one production click emits exactly one post');
  assert.strictEqual(posts[0].type, 'ikemaker.universal-toolbar.invoke');
  assert.strictEqual(posts[0].slotId, 'help');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log('F1 production code, stage, screenpack, asset, and companion renderers preserve canonical chrome and local controls');
