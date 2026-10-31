'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const handoffs = require('../src/sff_needs_palette_handoff');
const { PaletteWorkspaceService } = require('../src/palette_workspace_service');
const { presentationSession } = require('../src/palette_workspace_view');
const { encodeIndexedPng } = require('../src/palette_indexed_png');
const { createSffBuildSpecification } = require('../src/sff_build_specification');
const { createSffV21Png8Bytes } = require('../src/sff_v21_png8_writer');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const colors = Array.from({ length: 256 }, (_, index) => [index, index, index, index ? 255 : 0]);

function targetBytes(png, pixels) {
  const spec = createSffBuildSpecification({ planId: 'needs-palette-handoff', sourceRoot: 'input', target: { archiveIdentity: 'active.sff', archiveFingerprint: null, sffVersion: '2.1' }, requirements: ['sff-v2.1','preserve-authored-physical-order','immutable-source-snapshots','candidate-before-adoption','sprite-png8','embedded-palettes'], sprites: [{ entryId: 'sprite:0', group: 0, number: 0, axisX: 0, axisY: 0, colorDepth: 8, format: 'png8', compression: 'png8', paletteId: 'palette:0', duplicatePolicy: 'preserve-separate', crop: { mode: 'none', axisDeltaX: 0, axisDeltaY: 0 }, source: { relativePath: 'sprite.png', byteHash: sha(png), decodedHash: sha(pixels), width: 2, height: 2 } }], palettes: [{ entryId: 'palette:0', group: 1, number: 1, colors, tableOrder: 'sff', duplicatePolicy: 'preserve-separate', source: { relativePath: 'sprite.png', byteHash: sha(png), decodedHash: sha(pixels), width: 2, height: 2 } }], decisions: [], options: { shared: { fullRebuild: true }, backends: {} } });
  return createSffV21Png8Bytes(spec, { sources: new Map([['sprite.png', png]]) });
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-needs-palette-'));
try {
  const pixels = Buffer.from([0, 1, 2, 1]), png = encodeIndexedPng({ width: 2, height: 2 }, pixels, colors), source = path.join(root, 'sprite.png'), target = path.join(root, 'active.sff'), sff = targetBytes(png, pixels);
  fs.writeFileSync(source, png); fs.writeFileSync(target, sff);
  const retained = handoffs.create({ target: { path: target, hash: sha(sff), bytes: sff.length, version: '2.1' }, sources: [{ path: source, hash: sha(png), bytes: png.length, width: 2, height: 2, bitDepth: 8, colorType: 3 }], tilingMethod: 'automatic-tiles', returnContext: { command: 'sff.openAddSprites', targetPath: target } });
  const creatorRetained = handoffs.create({ target: { path: target, hash: sha(sff), bytes: sff.length, version: '2.1' }, sources: [{ path: source, hash: sha(png), bytes: png.length, width: 2, height: 2, bitDepth: 8, colorType: 3 }], tilingMethod: 'reviewed-tiles', returnContext: { command: 'sff.openCreator', targetPath: target } });
  assert.strictEqual(creatorRetained.tilingMethod, 'reviewed-tiles', 'Creator-selected method is sealed into the exact Palette Workshop handoff');
  assert.strictEqual(creatorRetained.returnContext.command, 'sff.openCreator', 'Palette Workshop returns to the exact Creator route');
  assert.strictEqual(handoffs.revalidate(retained).sources[0].filename, source);
  let saved = {}; const storage = { get(_key, fallback) { return Object.keys(saved).length ? saved : fallback; }, update(_key, value) { saved = JSON.parse(JSON.stringify(value)); } }, service = new PaletteWorkspaceService(storage); service.open(target);
  const adopted = handoffs.adopt(service, target, retained);
  assert.strictEqual(adopted.context.needsPaletteHandoff.tilingMethod, 'automatic-tiles');
  assert.strictEqual(adopted.context.returnContext.command, 'sff.openAddSprites');
  assert.strictEqual(adopted.context.section, 'sources-preflight');
  assert.strictEqual(handoffs.clear(service, target).context.needsPaletteHandoff, null, 'ordinary entry clears the live handoff');
  handoffs.adopt(service, target, retained);
  const restored = new PaletteWorkspaceService(storage).open(target);
  assert.strictEqual(restored.context.needsPaletteHandoff, null, 'restart never republishes a retained handoff without fresh revalidation');
  assert.strictEqual(restored.context.returnContext, null, 'restart clears the stale handoff return route too');
  const many = { ...adopted, context: { ...adopted.context, needsPaletteHandoff: { ...retained, sources: Array.from({ length: 500 }, (_, index) => ({ ...retained.sources[0], filename: `C:\\very-long-folder-${'x'.repeat(180)}\\sprite-${index}.png` })) } } }, presented = presentationSession(many).context.needsPaletteHandoff;
  assert.strictEqual(presented.sources.length, 75); assert.strictEqual(presented.omittedSourceCount, 425); assert(!JSON.stringify(presented).includes('very-long-folder'), 'webview DTO omits full host paths');
  fs.writeFileSync(source, Buffer.concat([png, Buffer.from([0])]));
  assert.throws(() => handoffs.revalidate(retained), /changed after Add Sprites review/);
  const view = fs.readFileSync(path.join(__dirname, '..', 'src', 'palette_workspace_view.js'), 'utf8');
  const creatorPresentation=presentationSession({...adopted,context:{...adopted.context,needsPaletteHandoff:creatorRetained}}).context.needsPaletteHandoff;
  assert.strictEqual(creatorPresentation.originLabel,'Advanced SFF Creator','the receiver names the exact Creator owner instead of hardcoding Add Sprites');
  assert.strictEqual(creatorPresentation.returnLabel,'Return to Advanced SFF Creator');
  assert.strictEqual(creatorPresentation.tilingMethod,'reviewed-tiles','the receiver retains the exact Creator preference without claiming it was performed');
  assert.match(view, /Needs Palette · review-only handoff from/);
  assert.match(view, /Unavailable in this build:/);
  assert.match(view, /does not reduce colors, create automatic tiles, or author tile boundaries/);
  assert.match(view, /Usable alternatives:/);
  assert.match(view, /Return to Add Sprites/);
  const creator = fs.readFileSync(path.join(__dirname, '..', 'src', 'sff_creator_workspace.js'), 'utf8');
  assert.match(creator, /Needs Palette \(review-only handoff\)/, 'Creator advertises only the supported reviewed handoff');
  assert.match(creator, /this Needs Palette handoff does not perform color reduction or tiling/, 'unsupported reduction and tiling boundary is explicit before handoff without denying separate Workshop tools');
  assert.match(creator, /manual-reduction tools remain available/, 'Creator preserves discoverability of Palette Workshop’s separate reviewed collective-source tools');
  assert.match(creator, /Open Review-Only Needs Palette Handoff/, 'Creator labels the receiver as review-only');
  assert.match(creator, /'SFF Creator'/, 'Creator window title is not hardcoded to Add Sprites');
  assert.match(creator, /kind:'sff-needs-palette',handoff/, 'Creator dispatches the sealed selected-mode handoff to Palette Workshop');
  console.log('Needs Palette sealed Creator/Add Sprites handoff, adoption, stale-source rejection, and capability-honest UI tests passed');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
