'use strict';

const assert = require('assert');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {
    env: { uiKind: 1 }, UIKind: { Web: 2 },
    workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) }
  };
  return originalLoad.call(this, request, parent, isMain);
};
const { viewerHtml } = require('../src/sff_viewer');
const { workspaceExperience } = require('../src/experience_model');
Module._load = originalLoad;

const archive = {
  filename: 'Ryu.sff',
  header: { version: [2, 1, 0, 0] },
  sprites: [], palettes: []
};
const learning = viewerHtml({}, archive, new Map(), [], { sprites: {}, experience: workspaceExperience('sff', 'learning') });
const clientScript = learning.match(/<script nonce="[^"]+">([\s\S]*)<\/script>/);
assert(clientScript, 'SFF client script must be present');
assert.doesNotThrow(() => new (require('vm').Script)(clientScript[1], { filename: 'sff-viewer-client.js' }), 'SFF client script must remain syntax-valid');
for (const id of ['markVisibleGroups', 'clearMarks', 'selectionStatus', 'markVisibleSprites', 'proofBackground', 'proofColor', 'exportPreviewPng', 'paletteHtmlColor']) assert(learning.includes(`id="${id}"`)||learning.includes(`id='${id}'`), `missing ${id}`);
assert(learning.includes("type:'exportPreviewPng'"));
assert(learning.includes('SFF · Learning'));
assert(learning.includes('<details open><summary><b>What am I editing?</b>'));
assert(learning.includes('class="guided-workflow"'));
assert(learning.includes('details class="task-recipes" open'));
assert(learning.includes('Protect and assign palettes'));
assert(learning.includes('[Next] Load and identify the sprite archive'));
assert(learning.includes('data-workflow-action="panel:palettePanel"'));
assert(learning.includes("closest('[data-workflow-action]')"));
assert(!learning.includes('Advanced shortcuts'));

const advanced = viewerHtml({}, archive, new Map(), [], { sprites: {}, experience: workspaceExperience('sff', 'advanced') });
assert(advanced.includes('SFF · Advanced'));
assert(!advanced.includes('<details open><summary><b>What am I editing?</b>'));
assert(advanced.includes('class="guided-workflow"'));
assert(advanced.includes('details class="task-recipes"'));
assert(!advanced.includes('details class="task-recipes" open'));
assert(advanced.includes('Advanced shortcuts'));
assert(advanced.includes('id="axisOffset"'));
assert(advanced.includes('data-workflow-action="control:axisOffset"'));
assert(advanced.includes('<details id="paletteFolderHelp"><summary><b>How palette folders work</b>'));
assert(!advanced.includes('<details id="paletteFolderHelp" open'));
assert(advanced.includes('Recommended palette-source layout:'));
assert(advanced.includes('does <b>not</b> need a duplicate PNG'));
assert(advanced.includes('Missing-palette debug messages are not accepted'));
assert(advanced.includes('Insert + Shift Later…'));
assert(advanced.includes("type:'insertPaletteShift'"));
assert(advanced.includes('HTML / Hex'));
assert(advanced.includes('double-click to edit HTML/Hex'));
assert(advanced.includes("swatch.ondblclick"));
assert(advanced.includes("formHelp.id='transformationBankHelp'"));
assert(advanced.includes('Form 4 +40000'));
assert(advanced.includes("preset:presetInput.value"));
assert(advanced.includes('Reference Palette Tray'));
assert(advanced.includes('id="loadReferencePalettes"'));
assert(advanced.includes("type:'exportReferenceBatch'"));

console.log('SFF workspace experience tests passed');
