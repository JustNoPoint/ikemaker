'use strict';

const assert = require('assert');
const { resolvePaletteWorkspaceRoute, applyPaletteWorkspaceRoute } = require('../src/palette_workspace_route');

const archive = {
  sprites: [
    { index: 0, group: 0, number: 0, paletteIndex: 1 },
    { index: 1, group: 0, number: 0, paletteIndex: 0 }
  ],
  palettes: [
    { index: 0, group: 1, number: 1 },
    { index: 1, group: 1, number: 2 }
  ]
};

const options = {
  section: 'live-edit',
  origin: { surface: 'sff-browser' },
  returnContext: { kind: 'sff', browserState: { tab: 'palettes' } },
  selection: {
    sprite: { physicalIndex: 0, group: 0, number: 0 },
    palette: { physicalIndex: 1, group: 1, number: 2 }
  }
};
const route = resolvePaletteWorkspaceRoute(archive, options);
assert.deepStrictEqual(route.selection, options.selection, 'exact physical sprite and palette selection is retained even when semantic sprite IDs are duplicated');
assert.deepStrictEqual(route.context, { section: options.section, origin: options.origin, returnContext: options.returnContext });
assert.strictEqual(route.selectionRejected, false);

const derived = resolvePaletteWorkspaceRoute(archive, { selection: { sprite: { physicalIndex: 0, group: 0, number: 0 } } });
assert.deepStrictEqual(derived.selection.palette, { physicalIndex: 1, group: 1, number: 2 }, 'a sprite-only launch derives its exact owning palette');
assert.strictEqual(resolvePaletteWorkspaceRoute(archive, { selection: { sprite: { physicalIndex: 0, group: 9, number: 9 } } }).selectionRejected, true, 'stale or forged physical selection fails closed');

let patch = null;
const service = { mutate(filename, value) { patch = { filename, value }; return value; }, snapshot() { throw new Error('mutation expected'); } };
applyPaletteWorkspaceRoute(service, 'Ryu.sff', archive, options);
assert.deepStrictEqual(patch, { filename: 'Ryu.sff', value: { context: route.context, selection: route.selection } }, 'reopening the canonical panel refreshes section, origin, return context, and selection together');

console.log('Palette Workspace canonical route preserves exact context and rejects stale physical selections');
