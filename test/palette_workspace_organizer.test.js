'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const organizer = require('../src/palette_workspace_organizer');
const { paletteSwatchPng } = require('../src/palette_editor');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'palette-workspace-organizer-'));
try {
  const source = path.join(root, 'source.png'), colors = Array.from({ length: 256 }, (_, index) => index ? [255, 0, 0, 255] : [0, 0, 0, 255]); fs.writeFileSync(source, paletteSwatchPng(colors));
  const state = organizer.loadPngPaths([source]); assert(state?.model.safeExact); assert(organizer.stableReference(state)?.fingerprint);
  assert.strictEqual(organizer.loadPngPaths([source], 'wrong'), null, 'changed or mismatched source evidence is rejected');
  const semantic = organizer.semanticDraft([{ id: state.model.entries[0].id, category: 'Skin', label: 'shadow' }]); assert.strictEqual(organizer.applySemanticDraft(state.model, semantic).entries[0].label, 'shadow');
  const dropped = organizer.acceptDroppedPngs([{ name: 'drop.png', base64: fs.readFileSync(source).toString('base64') }]); assert.strictEqual(organizer.stableReference(dropped), null, 'dropped bytes are live-session-only');
  assert.throws(() => organizer.acceptDroppedPngs([{ name: 'huge.png', base64: fs.readFileSync(source).toString('base64') }], 10), /64 MB safety limit/);
  const entries = state.model.entries.map(entry => ({ ...entry, category: entry.rgba[3] === 0 ? 'Transparency' : 'Clothing' })), plan = organizer.exportWritePlan(state, entries, 'Hero', root, { phase1RowGaps: false });
  assert(plan.writes.some(([filename]) => filename.endsWith('Hero.act'))); assert(plan.writes.some(([filename]) => filename.endsWith('_Indexed.png')));
  const ignored=organizer.exportCollectiveContractPlan(state,entries,[entries.at(-1).id],'HeroContract',root);assert(ignored.indexedImagesOmitted);assert(!ignored.writes.some(([filename])=>filename.endsWith('_Indexed.png')));assert(ignored.writes.some(([filename])=>filename.endsWith('_IGNORED_SOURCE_COLORS.json')));
} finally { fs.rmSync(root, { recursive: true, force: true }); }
console.log('Palette Workspace organizer extraction tests passed');
