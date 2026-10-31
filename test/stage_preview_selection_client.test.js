'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return {};
  return originalLoad.call(this, request, parent, main);
};
const { stageHtml, stagePayload, stagePreviewSelectionAvailability } = require('../src/stage_workspace');
Module._load = originalLoad;

function functionSource(text, name) {
  const start = text.indexOf(`function ${name}(`);
  assert(start >= 0, `${name} should exist in the generated client`);
  const open = text.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let index = open; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
    if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return text.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-stage-preview-selection-'));
try {
  const filename = path.join(directory, 'stage.def');
  fs.writeFileSync(filename, '[Info]\nname=Preview Selection\n[StageInfo]\nlocalcoord=320,240\nzoffset=220\n[BGDef]\n[BG Current]\ntype=normal\nstart=0,0\n[BG Secondary]\ntype=normal\nstart=10,10\n');
  const html = stageHtml(stagePayload(filename));
  const controls = Object.fromEntries(['startX', 'startY', 'patch', 'copy', 'apply', 'discard', 'applySelected'].map(id => [id, { id, disabled: false, title: '', value: '' }]));
  const posts = [];
  const context = {
    document: { getElementById: id => controls[id] },
    model: { backgrounds: [{ line: 5, name: 'Current', start: [0, 0] }, { line: 8, name: 'Secondary', start: [10, 10] }] },
    selected: 0,
    selectedSet: new Set([0, 1]),
    previewStarts: [[0, 0], [12, 10]],
    stagePreviewSelectionState: stagePreviewSelectionAvailability,
    post(type, fields) { posts.push({ type, ...fields }); },
    round(value) { return Math.round(value * 1000) / 1000; },
    render() {},
    console
  };
  vm.createContext(context);
  const dispatchStart = html.indexOf("document.getElementById('discard').onclick=");
  const dispatchEnd = html.indexOf(';updateCompareAvailability();', dispatchStart);
  assert(dispatchStart >= 0 && dispatchEnd > dispatchStart, 'generated preview dispatch handlers should be extractable');
  vm.runInContext([
    functionSource(html, 'syncPreviewAvailability'),
    functionSource(html, 'savePreviewDraft'),
    'function inspect(){syncPreviewAvailability()}',
    html.slice(dispatchStart, dispatchEnd)
  ].join('\n'), context);

  context.syncPreviewAvailability();
  assert.strictEqual(controls.apply.disabled, true, 'single Apply stays disabled when only a secondary selected BG changed');
  assert.strictEqual(controls.discard.disabled, false, 'Discard reflects the changed selected set');
  assert.strictEqual(controls.applySelected.disabled, false, 'Apply Selected reflects the changed selected set');
  controls.applySelected.onclick();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(posts.at(-1))), {
    type: 'applyStarts',
    entries: [
      { line: 5, name: 'Current', value: '0, 0' },
      { line: 8, name: 'Secondary', value: '12, 10' }
    ]
  });

  posts.length = 0;
  controls.discard.onclick();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(context.previewStarts)), [[0, 0], [10, 10]], 'Discard restores every selected preview position');
  assert.strictEqual(posts.at(-1).type, 'previewDraft', 'Discard persists the restored selected-set draft state');
  assert.strictEqual(controls.apply.disabled, true);
  assert.strictEqual(controls.discard.disabled, true);
  assert.strictEqual(controls.applySelected.disabled, true, 'all-clean restoration disables every dirty action');

  context.previewStarts = [[3, 0], [10, 10]];
  context.syncPreviewAvailability();
  assert.strictEqual(controls.apply.disabled, false, 'changing the current BG enables single Apply');
  controls.apply.onclick();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(posts.at(-1))), { type: 'applyStart', sectionLine: 5, value: '3, 0', name: 'Current' }, 'single Apply dispatches only the current BG');

  console.log('Stage generated mixed-selection availability and dispatch scopes passed');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
