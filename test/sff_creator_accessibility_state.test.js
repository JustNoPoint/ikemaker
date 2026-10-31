'use strict';

const assert = require('assert');
const Module = require('module');

const original = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return {
    Uri: { file: fsPath => ({ fsPath, toString: () => `file:///${String(fsPath).replace(/\\/g, '/')}` }), parse: value => ({ fsPath: String(value).replace(/^file:\/\/\//, '') }) },
    ViewColumn: { Active: 1 },
    workspace: { workspaceFolders: [], getConfiguration: () => ({ get: (_name, fallback) => fallback }) },
    window: {}
  };
  return original.call(this, request, parent, main);
};
const creator = require('../src/sff_creator_workspace');
Module._load = original;

const empty = creator.creatorSourceActionAvailability();
assert.strictEqual(empty.previewAxis.disabled, true);
assert.match(empty.previewAxis.reason, /Mark exactly one source/);
assert.strictEqual(empty.remove.disabled, true);
assert.match(empty.remove.reason, /Mark one or more sources/);
assert.strictEqual(empty.clear.disabled, true);
assert.match(empty.sourceNext.reason, /last source page/i);

const first = creator.creatorSourceActionAvailability({
  sourceIds: ['a', 'b', 'c'], selectedIds: ['a'], readyIds: ['a', 'b'], staleIds: [], pageIds: ['a', 'b'], page: 0, pageCount: 2
});
assert.strictEqual(first.previewAxis.disabled, false, 'one marked source enables exact preview');
assert.strictEqual(first.up.disabled, true, 'the first source cannot move above the archive start');
assert.match(first.up.reason, /already as high/);
assert.strictEqual(first.down.disabled, false, 'a source can move past an unmarked neighbor');
assert.strictEqual(first.relinkSource.disabled, true, 'a current source does not expose a misleading relink action');
assert.match(first.relinkSource.reason, /current/);
assert.strictEqual(first.suggestAxes.disabled, false, 'one ready source enables reviewed axis suggestions');
assert.strictEqual(first.sourceNext.disabled, false, 'another filtered page enables Next');
assert.strictEqual(first.unmarkShown.disabled, false, 'a visible mark enables Unmark Shown');

const crossBlock = creator.creatorSourceActionAvailability({
  sourceIds: ['a', 'b', 'c', 'd'], selectedIds: ['b', 'c'], readyIds: ['b', 'c'], staleIds: ['c'], pageIds: ['c', 'd'], page: 1, pageCount: 2
});
assert.strictEqual(crossBlock.up.disabled, false);
assert.strictEqual(crossBlock.down.disabled, false);
assert.strictEqual(crossBlock.copyAxis.disabled, false, 'two marked sources with a ready first source enable Copy Axis');
assert.strictEqual(crossBlock.relinkSource.disabled, true);
assert.match(crossBlock.relinkSource.reason, /exactly one/);
assert.strictEqual(crossBlock.sourcePrev.disabled, false);
assert.strictEqual(crossBlock.sourceNext.disabled, true);

const conflicted = creator.creatorSourceActionAvailability({
  sourceIds: ['a', 'b'], selectedIds: ['a', 'b'], readyIds: ['a'], staleIds: ['b'], pageIds: ['a', 'b']
});
assert.strictEqual(conflicted.suggestAxes.disabled, true);
assert.match(conflicted.suggestAxes.reason, /Resolve every marked source conflict/);

assert.strictEqual(creator.creatorNeedsPaletteHandoffAvailability({ paletteMode: 'image' }).disabled, true);
assert.match(creator.creatorNeedsPaletteHandoffAvailability({ paletteMode: 'needs-palette' }).reason, /existing reviewed SFF target/);
assert.match(creator.creatorNeedsPaletteHandoffAvailability({ paletteMode: 'needs-palette', targetPath: 'active.sff' }).reason, /at least one source/);
assert.match(creator.creatorNeedsPaletteHandoffAvailability({ paletteMode: 'needs-palette', targetPath: 'active.sff', sourceCount: 1, targetStale: true }).reason, /changed after review/);
assert.strictEqual(creator.creatorNeedsPaletteHandoffAvailability({ paletteMode: 'needs-palette', targetPath: 'active.sff', sourceCount: 1 }).disabled, false);

const draft = creator.defaultDraft();
const markup = creator.html({ draft, plan: { rows: [], ready: [], conflicts: [], skipped: [] }, applyState: { enabled: false, reason: 'Choose at least one PNG source.' } });
assert(markup.includes('function refreshCreatorSourceAvailability(pageIds,pageCount)'), 'the generated client consumes the tested source-action availability model');
assert(markup.includes("control.setAttribute('aria-description',state.reason)"), 'disabled controls expose the actionable reason programmatically');
assert(markup.includes('refreshCreatorSourceAvailability(page.map(item=>item.source.id),pageCount)'), 'source selection and rerender synchronize every dependent control');
assert(markup.includes('aria-label="Group override for '), 'list-row numeric and select overrides receive source-specific accessible names');
assert(markup.includes('id="writerComparisonDialog" aria-labelledby="writerComparisonTitle"'), 'writer comparison dialog has an accessible name');
assert(markup.includes('id="spritePreviewDialog" aria-labelledby="spritePreviewTitle"'), 'sprite preview dialog has an accessible name');
assert(markup.includes("dialog.setAttribute('aria-labelledby','sourceAuditionTitle')"), 'dynamic audition dialog has an accessible name');
assert(markup.includes('aria-label="Axis-aligned preview of the marked source sequence"'), 'audition canvas describes its visual purpose');
assert(markup.includes('id="sourceAuditionStatus" class="muted" role="status" aria-live="polite"'), 'audition changes are announced');
assert(markup.includes("setCreatorControlAvailability('writerComparisonBuiltIn'"), 'writer candidate buttons use actionable availability instead of unexplained disabling');
assert(markup.includes('Review and bind these exact validated candidates'), 'an enabled but not-yet-bound writer test explains its next action');
assert(markup.includes("setCreatorControlAvailability('openNeedsPalette'"), 'Needs Palette handoff exposes exact mode, target, source, and stale-target prerequisites');
assert(markup.includes('id="targetSummary" role="status" aria-live="polite"'), 'target changes are announced without moving focus');
assert(markup.includes('id="sourceFilterStatus" class="muted" role="status" aria-live="polite"'), 'filter result counts are announced without moving focus');
assert(markup.includes('id="temporaryPaletteStatus" class="muted" role="status" aria-live="polite"'), 'temporary-palette state is announced without moving focus');
assert(!creator.register.toString().includes("if (message.type === 'openNeedsPalette') throw"), 'the reviewed Needs Palette host route is not shadowed by an unconditional throw');

const fillStart = markup.indexOf('const capabilityHonestyFill=fill;');
const fillEnd = markup.indexOf('const baseRenderReview=', fillStart);
assert(fillStart > 0 && fillEnd > fillStart, 'generated capability-honesty fill wrapper is present');
const emittedFill = markup.slice(fillStart, fillEnd);
const needsOption = { disabled: true, textContent: '' }, openNeedsPalette = { disabled: true },creatorHeading={textContent:'SFF Creator · Add Sprites'};
const fillResult = Function('paletteMode', 'draft', 'tilingMethod', 'paletteModeStatus', 'syncNeedsPaletteHandoff', 'openNeedsPalette', 'fill','document', `${emittedFill};fill();return{option:paletteMode.querySelector(),openNeedsPalette,tilingMethod,paletteModeStatus,creatorHeading:document.querySelector()};`)(
  { querySelector: () => needsOption },
  { configuration: { paletteMode: 'needs-palette' } },
  { options: [{ value: 'single-palette' }, { value: 'automatic-tiles' }, { value: 'reviewed-tiles' }] },
  { className: '', textContent: '' },
  () => { openNeedsPalette.disabled = creator.creatorNeedsPaletteHandoffAvailability({ paletteMode: 'needs-palette', targetPath: 'active.sff', sourceCount: 1 }).disabled; },
  openNeedsPalette,
  () => { openNeedsPalette.disabled = true; },
  {querySelector:()=>creatorHeading}
);
assert.strictEqual(fillResult.option.disabled, false, 'final emitted fill keeps the supported Palette Workshop handoff selectable');
assert.strictEqual(fillResult.openNeedsPalette.disabled, false, 'final emitted fill ordering restores exact handoff availability after earlier fill/render work');
assert(fillResult.tilingMethod.options.every(option => option.disabled === false && /Record preference:/.test(option.textContent)), 'method choices are labeled as retained preferences rather than promised Palette Workshop operations');
assert.match(fillResult.paletteModeStatus.textContent, /this Needs Palette handoff does not perform color reduction or tiling/);
assert.match(fillResult.paletteModeStatus.textContent, /manual-reduction tools remain available/,'the route limitation does not hide Palette Workshop’s separate collective-source reduction tools');
assert.match(fillResult.paletteModeStatus.textContent, /already indexed PNG|True Color/,'the unsupported boundary provides usable alternatives before handoff');
assert.match(fillResult.openNeedsPalette.textContent,/Review-Only/,'the handoff button names its review-only destination');
assert.strictEqual(fillResult.creatorHeading.textContent,'SFF Creator','the shared Creator heading is not hardcoded to Add Sprites');

console.log('SFF Creator actionable source states, labels, dialogs, comparison guidance, and Needs Palette route passed');
