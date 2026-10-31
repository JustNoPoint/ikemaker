'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { SURFACES } = require('../src/viewer_surface_registry');
const { SLOTS, GROUPS, DIMENSIONS } = require('../src/viewer_toolbar_contract');
const { cohesionInventory, actionAudit } = require('../tools/audit_viewer_contracts');
const universal = require('../src/universal_toolbar_webview');
const { adapt } = require('../src/universal_toolbar_adapter');
const toolbar = require('../src/viewer_toolbar');

const ROOT = path.join(__dirname, '..');
const persistent = SURFACES.filter(surface => surface.kind !== 'transient' && !['tree-view', 'navigation'].includes(surface.kind));
const inventory = cohesionInventory();
assert.strictEqual(inventory.length, persistent.length, 'every non-transient persistent registry surface is inventoried');
assert.deepStrictEqual(inventory.map(item => item.surfaceId), persistent.map(item => item.id));
assert.deepStrictEqual(inventory.filter(item => item.status === 'missing'), [], 'no surface claiming shared chrome lacks production evidence');
for (const item of inventory) {
  const surface = persistent.find(candidate => candidate.id === item.surfaceId);
  assert(surface);
  if (surface.toolbarPolicy === 'required') assert.strictEqual(item.status, 'shared', `${surface.id} required toolbar policy must have shared production chrome`);
  if (item.status === 'deferred') {
    assert.strictEqual(surface.toolbarPolicy, 'planned', `${surface.id} may defer chrome only while its migration stays planned`);
    assert(item.chromeReason.length >= 24 && item.chromeReason.length <= 512, `${surface.id} has a bounded explicit protected/deferred reason`);
  }
  if (item.status === 'excluded') assert.strictEqual(surface.toolbarPolicy, 'excluded');
}

assert.strictEqual(SLOTS.length, 29);
assert.strictEqual(GROUPS.length, 4);
assert.deepStrictEqual(DIMENSIONS, { width: 27, height: 27, unit: 'css-px', wrap: 'whole-groups', horizontalScroll: false });
const css = universal.universalToolbarStyle();
assert.match(css, /flex-wrap:wrap/);
assert.match(css, /overflow-x:hidden/);
assert.doesNotMatch(css, /overflow-x:auto/);
const model = adapt('help.workspace');
const rendered = universal.renderUniversalToolbar(model, { surfaceId: 'help.workspace', label: 'IKEMaker universal actions' });
assert.strictEqual((rendered.match(/data-universal-slot=/g) || []).length, SLOTS.length);
assert.strictEqual((rendered.match(/class="ikemaker-universal-toolbar__group"/g) || []).length, 4);
assert.strictEqual((rendered.match(/aria-disabled="true"/g) || []).length, SLOTS.length-2, 'Restart and Updates are the two context-free enabled actions in an otherwise unavailable model');
assert(rendered.includes('title="New — unavailable: New is not available in this viewer yet."'));

const order = ['Project','Edit','View','Palettes','Sprites','Animations','Sounds','Review','Build','Stage','Screenpack','Tools','Help','More'];
for (const surface of ['code', 'stage', 'screenpack', 'sff', 'air', 'snd', 'comparison']) {
  const groups = toolbar.menuDefinitions(surface);
  assert.deepStrictEqual(groups.map(group => group.label), order, `${surface} menu order is canonical`);
  const ids = groups.flatMap(group => group.items).filter(item => !item.separator).map(item => item.id);
  assert.strictEqual(ids.length, new Set(ids).size, `${surface} has no duplicate action identity`);
  for (const item of groups.flatMap(group => group.items).filter(item => !item.separator)) {
    assert(typeof item.tooltip === 'string' && Buffer.byteLength(item.tooltip, 'utf8') <= 1024, `${surface}/${item.id} has a bounded tooltip`);
    assert(typeof item.availability === 'string' && item.availability.length > 0, `${surface}/${item.id} retains availability metadata`);
  }
}

const client = toolbar.clientScript();
assert(client.includes("event.key==='Escape'"), 'Escape closes an open menu before the parent surface');
assert(client.includes("searchDialog.querySelector('[data-toolbar-search-close]').onclick=()=>searchDialog.close()"), 'the child action browser has an explicit local close route');
assert(!client.includes("type:'viewerToolbarCommand'"), 'production clients never emit the restoration-only command alias');
assert(client.includes("type:'viewerToolbarAction',actionId:button.dataset.toolbarActionId"), 'production dropdown dispatch stays opaque and host-owned');
const hostSource = fs.readFileSync(path.join(ROOT, 'src', 'viewer_toolbar.js'), 'utf8');
assert(hostSource.includes('F3 retirement debt'));
assert(hostSource.includes("message?.type !== 'viewerToolbarCommand'"));
assert(!toolbar.style().includes('viewer-retired-toolbar>'), 'specialist body controls are not blanket-hidden');
assert(toolbar.style().includes('body[data-viewer-surface="air"] .viewer-primary-toolbar>:not(.launch-controls):not(style):not([data-viewer-archive])'), 'legacy AIR header siblings remain command owners without rendering a duplicate toolbar');
assert(toolbar.style().includes('.viewer-primary-toolbar>:is(button,label,select,input,.badge,.tool,.pane-buttons,.spacer)'), 'legacy SFF/SND controls remain command owners while archive identity text stays visible');
const actions = actionAudit();
assert.deepStrictEqual(actions.plannedSpecialistPlacementViolations, [], 'no specialist action occupies the fixed primary strip');
assert(actions.bodySpecialistActionIds.includes('snd.special.audio-play'), 'surface-specific playback remains in its body quick-action row');

const browserHost = fs.readFileSync(path.join(ROOT, 'src', 'authoring_workspace.js'), 'utf8');
assert.match(browserHost, /browserPanel\.onDidDispose/);
assert.match(browserHost, /browserPanel\s*=\s*null/);
assert.match(browserHost, /workspace\.close\(\)/);
const browserWorkspace = fs.readFileSync(path.join(ROOT, 'src', 'authoring_browser_workspace.js'), 'utf8');
assert.match(browserWorkspace, /if\s*\(this\.child !== null\) this\.child = null/);
assert.match(browserWorkspace, /else if\s*\(this\.searchOpen \|\| this\.query\)/);
assert.match(browserWorkspace, /event\.key==='Escape'/);
const launch = fs.readFileSync(path.join(ROOT, 'src', 'launch_controls.js'), 'utf8');
const browserRoutes = require('../src/viewer_browser_route');
assert.strictEqual(browserRoutes.forSurface('air').command,'air.browseLists','AIR Viewer Browser opens or focuses the AIR browser without toggling it closed');
assert.strictEqual(browserRoutes.forSurface('sff').command,'sff.browseLists','SFF Viewer Browser opens or focuses the SFF browser without toggling it closed');
assert.strictEqual(browserRoutes.forSurface('palette','C:\\chars\\Ryu\\Ryu.sff').command,'ikemen.palette.openCompanion','SFF-backed Palette Workshop opens its own companion browser');
assert.strictEqual(browserRoutes.forSurface('code').command,'ikemen.authoringBrowser.open','coding surfaces retain the explicit Coding Assistance route');
assert(launch.includes("slot==='viewer-browser'"), 'Viewer Browser remains an explicit surface-routed manual action');
assert(!/setTimeout\([^)]*ikemen\.authoringBrowser\.open/.test(launch), 'shared chrome never auto-opens the browser');

console.log('F3 persistent-surface inventory, canonical chrome, accessibility, local Escape, browser lifecycle, and legacy-alias audit passed');
