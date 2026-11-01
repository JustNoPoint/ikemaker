'use strict';

const assert = require('assert');
const { SLOTS, GROUPS, DIMENSIONS, slotCoordinates, SPECIALIST_ACTION_IDS } = require('../src/viewer_toolbar_contract');
const { adapt } = require('../src/universal_toolbar_adapter');
const { renderUniversalToolbar, universalToolbarStyle } = require('../src/universal_toolbar_webview');
const toolbar = require('../src/viewer_toolbar');
const launch = require('../src/launch_controls');

const representatives = ['code.structure', 'stage.workspace', 'screenpack.workspace', 'sff.viewer', 'companion.comparison'];
const canonical = slotCoordinates();
for (const surface of representatives) {
  const model = surface === 'sff.viewer' ? toolbar.legacyUniversalModel('sff') : adapt(surface, {});
  assert.strictEqual(model.slots.length, SLOTS.length, `${surface} keeps every primary coordinate`);
  assert.deepStrictEqual(model.slots.map(({ id, group, groupIndex, slotIndex }) => ({ id, group, groupIndex, slotIndex })), canonical, `${surface} has canonical coordinates`);
  const html = renderUniversalToolbar(model, { surfaceId: surface });
  assert.strictEqual((html.match(/data-universal-slot=/g) || []).length, SLOTS.length);
  assert.strictEqual((html.match(/role="group"/g) || []).length, 4);
  assert.deepStrictEqual([...html.matchAll(/data-universal-coordinate="([^"]+)"/g)].map(match => match[1]), canonical.map(item => `${item.groupIndex}:${item.slotIndex}`));
  assert(html.includes('disabled aria-disabled="true" aria-description='), 'disabled coordinates stay visible and explain why');
  for (const specialist of SPECIALIST_ACTION_IDS) assert(!html.includes(specialist), `${specialist} is not primary chrome`);
}

assert.strictEqual(SLOTS.length, 29);
assert.strictEqual(GROUPS.length, 4);
assert.deepStrictEqual(DIMENSIONS, { width: 27, height: 27, unit: 'css-px', wrap: 'whole-groups', horizontalScroll: false });
const css = universalToolbarStyle();
assert.match(css, /flex-wrap:wrap/);
assert.match(css, /__group\{[^}]*flex-wrap:nowrap/);
assert.match(css, /overflow-x:hidden/);
assert.doesNotMatch(css, /overflow-x:auto|overflow-x:scroll/);
assert.match(css, /width:27px/);
assert.match(css, /height:27px/);

for (const surface of ['sff', 'air', 'snd']) {
  const html = launch.launchControlsHtml(surface);
  assert.strictEqual((html.match(/data-toolbar-contract="universal-v1"/g) || []).length, 1, `${surface} has one primary strip`);
  assert.strictEqual((html.match(/data-universal-slot=/g) || []).length, SLOTS.length, `${surface} has all primary slots`);
  assert(!html.includes('data-toolbar-customize'), 'primary slot order and visibility are not customizable');
  const primary = html.slice(html.indexOf('data-toolbar-contract="universal-v1"'), html.indexOf('</nav>'));
  for (const specialist of SPECIALIST_ACTION_IDS) assert(!primary.includes(specialist));
  assert(html.indexOf('<div class="viewer-icon-toolbar"') > html.indexOf('</nav>'), 'specialist quick actions stay below primary chrome');
}
const snd = launch.launchControlsHtml('snd');
for (const action of ['snd.element.add','snd.element.delete','snd.element.replace','snd.special.audio-play','snd.special.audio-loop','snd.special.audio-pause','snd.element.stop']) assert(snd.includes(action), `${action} remains in the SND body`);
assert(!snd.includes('data-ikemen-launch='), 'legacy launch duplicates are retired');
assert(!snd.includes('viewer-toolbar-actions'), 'variable legacy asset rows are retired');
assert(toolbar.style().includes('body[data-viewer-surface="air"] .viewer-primary-toolbar>:not(.launch-controls):not(style):not([data-viewer-archive])'), 'the AIR legacy action row is retired behind the canonical strip');
assert(toolbar.style().includes('.viewer-primary-toolbar>:is(button,label,select,input,.badge,.tool,.pane-buttons,.spacer)'), 'SFF and SND legacy controls are retired without removing their archive identity text');
assert(!toolbar.style().includes('}label:has(#zoom)'), 'local canvas/camera zoom is not globally hidden');
assert(!toolbar.style().includes('.viewer-retired-toolbar>'), 'retirement never blanket-hides a specialist toolbar');
assert(toolbar.style().includes('height:27px!important'), 'specialist quick buttons share the same square sizing');

console.log('Final cohesion F1 canonical strip, coordinate parity, wrap, accessibility, and specialist placement tests passed');
