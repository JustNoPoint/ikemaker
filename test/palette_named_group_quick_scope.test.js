'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function(request, parent, main) {
  if (request === 'vscode') return { Uri: { file: fsPath => ({ fsPath }) }, workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) }, window: {} };
  return originalLoad.call(this, request, parent, main);
};

try {
  const host = require('../src/palette_workspace_controller');
  const interaction = require('../src/palette_workshop_interaction_model');
  const colors = Array.from({ length: 256 }, (_, index) => [index, index, index, index ? 255 : 0]);
  const palette = { index: 4, group: 1, number: 1 };
  const exact = { authorityHash: 'a'.repeat(64), zonesTrusted: true, colors, zones: [{ id: 'skin', name: 'Skin shades', memberIndexes: [7, 8, 9] }] };
  const session = { family: { template: { palettePhysicalIndex: 4, authority: { retained: true } } } };
  let verifyCalls = 0;
  const context = host.exactNamedGroupContext(session, palette, colors, () => { verifyCalls += 1; return exact; });
  assert.strictEqual(verifyCalls, 1, 'trusted template authority is freshly revalidated');
  assert.deepStrictEqual(Object.keys(context.groups[0]).sort(), ['authorityHash', 'count', 'id', 'membershipHash', 'name'], 'the browser projection contains identity and count but no indexes');
  assert.strictEqual(context.groups[0].count, 3);
  assert(!Object.prototype.hasOwnProperty.call(context.groups[0], 'indexes'));

  const scopePalette = { physicalIndex: palette.index, group: palette.group, number: palette.number };
  const selected = interaction.selectNamedGroup(interaction.normalizeInteraction(), context.groups[0], scopePalette, { namedGroupAuthorities: context.authorities });
  assert.strictEqual(selected.scope, 'group');
  assert.deepStrictEqual(Object.keys(selected.namedGroupRef).sort(), ['authorityHash', 'id', 'membershipHash'], 'only the group reference persists');
  assert.throws(() => interaction.resolveNamedGroup(selected, { ...scopePalette, physicalIndex: 5 }, { namedGroupAuthorities: context.authorities }), /exact source palette/);
  assert.throws(() => interaction.resolveNamedGroup({ ...selected, namedGroupRef: { ...selected.namedGroupRef, membershipHash: 'b'.repeat(64) } }, scopePalette, { namedGroupAuthorities: context.authorities }), /membership changed/);
  assert.deepStrictEqual(host.exactNamedGroupContext(session, { ...palette, index: 5 }, colors, () => exact).groups, [], 'another physical palette never inherits the first trusted group');
  const changed = colors.map(color => color.slice()); changed[7] = [1, 2, 3, 255];
  assert.throws(() => host.exactNamedGroupContext(session, palette, changed, () => exact), /palette evidence changed/);
  assert.throws(() => host.exactNamedGroupContext(session, palette, colors, () => ({ ...exact, zones: [{ id: 'bad', name: 'Bad', memberIndexes: [7, 7] }] })), /duplicate/);

  const fallback = host.namedScopeFallback(selected, 'membership changed');
  assert.strictEqual(fallback.scope, 'index');
  assert.strictEqual(fallback.namedGroupRef, null);
  assert.match(fallback.status, /reset to Current index/);

  const controllerSource = fs.readFileSync(path.join(__dirname, '../src/palette_workspace_controller.js'), 'utf8');
  const viewSource = fs.readFileSync(path.join(__dirname, '../src/palette_workspace_view.js'), 'utf8');
  assert.match(controllerSource, /interactionContext\(state,applicable=true\).*service\.assertApplicable\(state\.filename\)/s, 'every scoped host operation begins at the exact target stale gate');
  assert.match(controllerSource, /exactNamedGroupContext\(session,palette,embeddedColors\)/, 'scope operations rebuild template and palette authority instead of trusting browser membership');
  assert.match(controllerSource, /candidateReadOnly:Boolean\(session\.candidate\?\.stale\)/, 'the external candidate read-only gate remains visible');
  assert.match(controllerSource, /scopeFallbackNotice/, 'reload or drift produces an explicit fallback projection');
  assert.doesNotMatch(controllerSource.slice(controllerSource.indexOf("if (action === 'interactionScope')"), controllerSource.indexOf("if (action === 'interactionFocus')")), /message\.(?:indexes|memberIndexes)/, 'the scope route never consumes browser-supplied membership');
  assert.match(viewSource, /groupRef:\{id:group\.id,authorityHash:group\.authorityHash,membershipHash:group\.membershipHash\}/, 'the client submits only opaque group identity evidence');
  assert.match(viewSource, /aria-live','assertive'/, 'scope drift is announced assertively');
  assert.match(viewSource, /@media\(max-width:650px\)\{\.live-layout\{grid-template-columns:1fr\}\.tool-grid\{grid-template-columns:1fr\}/, 'the quick editor collapses to one column without horizontal overflow');
  assert.doesNotMatch(controllerSource.slice(controllerSource.indexOf('interactionContext(state,applicable=true)'), controllerSource.indexOf('postLive(state')), /(?:writeFileSync|transactionalWrite|clipboard)/, 'authority projection is read-only and never touches files or system clipboard');

  console.log('Palette Workshop named-group quick scope keeps host authority, stale fallback, opaque payloads, narrow access, and zero writes');
} finally {
  Module._load = originalLoad;
}
