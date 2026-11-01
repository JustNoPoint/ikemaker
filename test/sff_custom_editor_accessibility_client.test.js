'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {
    env: { uiKind: 1 }, UIKind: { Web: 2 },
    Uri: { file: fsPath => ({ fsPath }) },
    workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) }
  };
  return originalLoad.call(this, request, parent, isMain);
};
const { viewerHtml } = require('../src/sff_viewer');
Module._load = originalLoad;

const sprites = [
  { index: 0, group: 0, number: 0, width: 8, height: 8, axisX: 0, axisY: 0, dataSize: 1, link: 0, format: 2, colorDepth: 8, paletteIndex: 0 },
  { index: 1, group: 0, number: 1, width: 8, height: 8, axisX: 1, axisY: 2, dataSize: 1, link: 0, format: 2, colorDepth: 8, paletteIndex: 0 }
];
const html = viewerHtml({}, { filename: 'Custom.sff', header: { version: [2, 1, 0, 0] }, sprites, palettes: [] }, new Map(), [], { sprites: {} });
const client = html.match(/<script nonce="[^"]+">([\s\S]*)<\/script>/)[1];

for (const contract of [
  'id="groupSearch" aria-label="Filter sprite groups"',
  'id="spriteSearch" aria-label="Filter sprites by group or index"',
  'id="thumbnailSize" aria-label="Sprite thumbnail size"',
  'id="selectionStatus" class="muted" role="status" aria-live="polite"',
  'id="groups" role="listbox" aria-label="SFF sprite groups" aria-multiselectable="true"',
  'id="sprites" role="listbox" aria-label="SFF sprites" aria-multiselectable="true"',
  'id="error" class="error" role="status" aria-live="assertive"',
  '<label for="customSpriteName"><b>Custom sprite name</b></label>',
  'id="reviewStatus" class="muted" role="status" aria-live="polite"',
  'function moveSelection(amount){if(!selected)return;const list=visibleSpriteList()'
]) assert(html.includes(contract), `missing custom SFF editor accessibility contract: ${contract}`);

class ClassList {
  constructor(...values) { this.values = new Set(values); }
  contains(value) { return this.values.has(value); }
}
class Element {
  constructor(id = '', classes = []) { this.id = id; this.children = []; this.attrs = {}; this.dataset = {}; this.className = classes.join(' '); this.classList = new ClassList(...classes); this.value = ''; this.title = ''; this.disabled = false; }
  append(child) { this.children.push(child); child.parentElement = this; }
  querySelector(selector) { return selector === '.empty' ? this.children.find(item => item.classList?.contains('empty')) || null : null; }
  querySelectorAll(selector) {
    if (selector === 'button.group') return this.children.filter(item => item.tag === 'button' && item.classList.contains('group'));
    if (selector === 'button.sprite') return this.children.filter(item => item.tag === 'button' && item.classList.contains('sprite'));
    return [];
  }
  setAttribute(name, value) { this.attrs[name] = String(value); }
}
const groupsEl = new Element('groups'), spritesEl = new Element('sprites');
const controls = Object.fromEntries([
  'groupSearch','spriteSearch','reviewFilter','previous','next','fit','customSpriteName','axisXInput','axisYInput','axisLeft','axisRight','axisUp','axisDown','reviewFavorite','reviewApproved','reviewAxis','reviewClassification','reviewLayer','reviewArchive','reviewNote','saveReview','clearReview','pinCurrent',
  'activeMoveTargetChip','axisSaveStatus','paletteInfo','paletteStatus','paletteAudit','masterStatus','moveTargetStatus','layerStatus','spriteReferenceStatus','animationStatus','paletteWorkflowStatus','viewOrganizationStatus','userPaletteStatus','previewPaletteStatus','stagedPaletteStatus','axisValues','onionReadout','zoomValue','zoom','details','refs'
].map(id => [id, new Element(id)]));
controls.groupSearch.value = 'missing'; controls.spriteSearch.value = 'missing'; controls.reviewFilter.value = 'all';
const document = { getElementById: id => controls[id] || null, createElement: tag => { const element = new Element(); element.tag = tag; return element; } };
let selected = null;
const model = { sprites };
const makeButton = (classes) => { const button = new Element('', classes); button.tag = 'button'; return button; };
const sandbox = {
  model, document, groupsEl, spritesEl,
  get selected() { return selected; }, set selected(value) { selected = value; },
  spriteList: () => sprites,
  visibleSpriteList: () => controls.spriteSearch.value ? [] : sprites,
  renderGroups() {
    groupsEl.children = [];
    if (!controls.groupSearch.value) groupsEl.append(makeButton(['group', selected ? 'selected' : '', 'marked'].filter(Boolean)));
  },
  renderSprites() {
    spritesEl.children = [];
    if (!controls.spriteSearch.value) for (const sprite of sprites) spritesEl.append(makeButton(['sprite', selected?.index === sprite.index ? 'selected' : '', selected?.index === sprite.index ? 'marked' : ''].filter(Boolean)));
  },
  selectSprite(sprite) { selected = sprite; },
};
vm.createContext(sandbox);
const start = client.indexOf('(()=>{\n    const sffEditorAccessibilityReason=');
const end = client.indexOf('\n  })();', start);
assert(start >= 0 && end > start, 'generated custom SFF editor accessibility client is discoverable');
vm.runInContext(client.slice(start, end + '\n  })();'.length), sandbox);

assert.strictEqual(groupsEl.children[0].attrs.role, 'status');
assert.match(groupsEl.children[0].textContent, /No sprite groups match/);
assert.strictEqual(spritesEl.children[0].attrs.role, 'status');
assert.match(spritesEl.children[0].textContent, /No sprites match/);
assert.strictEqual(controls.fit.disabled, true);
assert.match(controls.fit.title, /Select a sprite/);
assert.strictEqual(controls.previous.disabled, true);
assert.match(controls.previous.title, /Select a sprite/);

// A retained exact selection can be outside the current projection; navigation
// must explain the filter boundary instead of pretending it is the first/last row.
sandbox.selected = sprites[0]; sandbox.renderSprites();
assert.strictEqual(controls.previous.disabled, true);
assert.strictEqual(controls.next.disabled, true);
assert.match(controls.previous.title, /hidden by the current filters/);
assert.match(controls.next.title, /hidden by the current filters/);

controls.groupSearch.value = ''; controls.spriteSearch.value = ''; sandbox.selected = sprites[0]; sandbox.renderGroups(); sandbox.renderSprites();
const groupOption = groupsEl.children[0], firstSprite = spritesEl.children[0], secondSprite = spritesEl.children[1];
assert.strictEqual(groupOption.attrs.role, 'option');
assert.strictEqual(groupOption.attrs['aria-current'], 'true');
assert.strictEqual(groupOption.attrs['aria-selected'], 'true');
assert.strictEqual(firstSprite.attrs.role, 'option');
assert.strictEqual(firstSprite.attrs['aria-current'], 'true');
assert.strictEqual(firstSprite.attrs['aria-selected'], 'true');
assert.strictEqual(secondSprite.attrs['aria-current'], 'false');
assert.strictEqual(controls.fit.disabled, false);
assert.strictEqual(controls.previous.disabled, true);
assert.match(controls.previous.title, /Already at the first visible sprite/);
assert.strictEqual(controls.next.disabled, false);
assert.strictEqual(controls.axisSaveStatus.attrs.role, 'status');
assert.strictEqual(controls.axisSaveStatus.attrs['aria-live'], 'polite');
assert.strictEqual(controls.paletteStatus.attrs.role, 'status');
assert.strictEqual(controls.animationStatus.attrs['aria-live'], 'polite');
assert.strictEqual(controls.zoom.attrs['aria-label'], 'Sprite preview zoom');
assert.strictEqual(controls.zoom.attrs['aria-describedby'], 'zoomValue');
assert.strictEqual(controls.details.attrs['aria-label'], 'Selected sprite details');
assert.strictEqual(controls.refs.attrs['aria-label'], 'AIR references using the selected sprite');

sandbox.selectSprite(sprites[1]);
assert.strictEqual(controls.previous.disabled, false);
assert.strictEqual(controls.next.disabled, true);
assert.match(controls.next.title, /Already at the last visible sprite/);

console.log('Custom SFF editor filters, live semantics, list states, empty guidance, and selection gates passed');
