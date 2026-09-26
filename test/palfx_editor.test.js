'use strict';

const assert = require('assert');
const vm = require('vm');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) { if (request === 'vscode') return {}; return originalLoad.call(this, request, parent, isMain); };
const { editorHtml, BUILT_INS } = require('../src/palfx_editor');
Module._load = originalLoad;

assert(BUILT_INS.Default);
const html = editorHtml({}, {}), scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
assert.strictEqual(scripts.length, 1);
assert.doesNotThrow(() => new vm.Script(scripts[0][1]));
for (const id of ['basic', 'composer', 'fxProfile', 'selectionCategory', 'parentColorId', 'visibleByDefault', 'selectionOrder', 'layers', 'cloneLayer', 'removeLayer', 'previewImage', 'fxCanvas', 'trans', 'alphaSrc', 'alphaDst', 'palfxSliders', 'copyComposer', 'insertComposer', 'copyModify', 'copyFxJson']) assert(html.includes(`id="${id}"`), `missing ${id}`);
assert(html.includes('One base plus four overlay clones'));
assert(html.includes('Character Options placement'));
assert(html.includes('Character Colors'));
assert(html.includes('Color Variants'));
assert(html.includes('FX Colors'));
assert(html.includes('IKEMEN is the final visual authority'));
assert(html.includes("type:'saveFxProfile'"));
assert(html.includes("type:'copyFxJson'"));
assert(html.includes("type:'palfxDraft'"));
assert(html.includes("type:'palfxDiscardDraft'"));
assert(html.includes('ikemenCanKeepDraft'));
assert(html.includes('ikemenNavigationSelection'));

console.log('PalFX and true-color FX editor tests passed');
