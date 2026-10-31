'use strict';
const assert = require('assert');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return { env: { uiKind: 1 }, UIKind: { Web: 2 }, Uri: { file: fsPath => ({ fsPath }) }, workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) } };
  return originalLoad.call(this, request, parent, isMain);
};
const { resolveArchiveSprite, viewerHtml } = require('../src/sff_viewer');
Module._load = originalLoad;

const first = { index: 100, group: 0, number: 0 };
const second = { index: 205, group: 7, number: 3 };
const duplicate = { index: 319, group: 7, number: 3 };
const archive = { sprites: [first, second, duplicate] };
assert.strictEqual(resolveArchiveSprite(archive, { index: 205, group: 7, number: 3 }), second, 'a selected sprite must resolve by archive identity, not array offset');
assert.strictEqual(resolveArchiveSprite(archive, { index: 319, group: 7, number: 3 }), duplicate, 'duplicate group/index identities retain their exact physical occurrence');
assert.strictEqual(resolveArchiveSprite(archive, { index: 1, group: 7, number: 3 }), second, 'group/index identity must recover from a stale positional index');
assert.notStrictEqual(resolveArchiveSprite(archive, { index: 205, group: 7, number: 3 }), first, 'the next selection must not return the initial sprite image');

const htmlArchive = {
  filename: 'fixture.sff', header: { version: [2, 1, 0, 0] }, palettes: [],
  sprites: [
    { ...first, width: 1, height: 1, axisX: 0, axisY: 0, dataSize: 1, link: 0, format: 0, colorDepth: 32, paletteIndex: 0 },
    { ...second, width: 1, height: 1, axisX: 0, axisY: 0, dataSize: 1, link: 0, format: 0, colorDepth: 32, paletteIndex: 0 },
  ],
};
const html = viewerHtml({}, htmlArchive, new Map(), [], { sprites: {} });
assert(html.includes("group:sprite.group,number:sprite.number"), 'generated image requests must carry stable sprite identity');
assert(html.includes('baseRequestId:++currentSpriteRequest'), 'each base-image selection must receive a new request identity');
assert(html.includes('m.baseRequestId!==currentSpriteRequest||m.group!==selected.group||m.number!==selected.number'), 'the canvas must accept only the current sprite response by request and stable identity');
assert(html.includes("physicalIndex:item.index")&&html.includes("type:'sffSelection',selected:physical(s)"), 'selection handoffs retain physical sprite identity');
assert(html.includes("Number.isInteger(ref.physicalIndex)?matches.find"), 'incoming navigation restores an exact duplicate occurrence when available');
assert(html.includes("matches.length>1)error.textContent"), 'ambiguous semantic navigation never silently chooses the first duplicate');
assert(html.includes("const selectionChanged=!selected||selected.index!==s.index"), 'same-sprite refreshes must distinguish refresh from actual navigation');
assert(html.includes("if(selectionChanged){image=null;onionImage=null;}"), 'only an actual sprite transition may clear the visible base and onion images');
assert(html.includes("if(selectionChanged||Number.isFinite(restoredZoom)&&restoredZoom>0)setZoom"), 'idle same-sprite refreshes must not recenter or resize the canvas');
assert(!html.includes("if(restored&&selected?.index!==restored.index)selectSprite(restored);"), 'a retained Palette Workspace session must not navigate an untouched SFF viewer');
assert(html.includes("m.type==='image'&&selected&&(m.layerSlot||(m.onionFor!==null&&m.onionFor!==undefined))"), 'the legacy image route must be limited to overlays and never accept an unguarded base-sprite reply');
console.log('SFF sprite navigation resolves and requests a distinct base image');
