'use strict';

const MUTATIONS = new Set(['edit', 'restore', 'paste', 'randomize', 'transfer', 'revert']);

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

function index(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number < 256 ? number : 0;
}

function item(code, message, detail = '') {
  return freeze({ code, message, detail: String(detail || '') });
}

function physical(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}
function renderedEvidence(value = {}) {
  const ownerChain = [...new Set((value.ownerChain || []).map(physical).filter(item => item !== null))].slice(0, 256);
  const authoredPalettePhysicalIndex = physical(value.authoredPalettePhysicalIndex), previewPalettePhysicalIndex = physical(value.previewPalettePhysicalIndex);
  return freeze({
    resource: { filename: String(value.resource?.filename || ''), byteHash: String(value.resource?.byteHash || '') },
    sprite: { physicalIndex: physical(value.sprite?.physicalIndex), group: physical(value.sprite?.group), number: physical(value.sprite?.number) },
    authoredPalettePhysicalIndex,
    previewPalettePhysicalIndex,
    previewOverride: authoredPalettePhysicalIndex !== null && previewPalettePhysicalIndex !== null && authoredPalettePhysicalIndex !== previewPalettePhysicalIndex,
    ownerChain,
    effectiveOwnerPhysicalIndex: ownerChain.at(-1) ?? previewPalettePhysicalIndex,
    runtimeRemap: value.runtimeRemap === 'known' ? 'known' : 'unknown'
  });
}

function explainPaletteAction(input = {}) {
  const action = String(input.action || 'edit'), activeIndex = index(input.index), mutating = MUTATIONS.has(action);
  const blockers = [], redirects = [], limitations = [], advisories = [], routes = [], evidence = renderedEvidence(input.renderedEvidence);
  if (input.workspaceStale || input.applyAllowed === false) { blockers.push(item('STALE_WORKSPACE', 'Reload the changed SFF or restore the retained draft before editing.')); routes.push(freeze({ id: 'reload-workspace', label: 'Review changed resource' })); }
  if (input.candidateStale) { blockers.push(item('STALE_CANDIDATE', 'Reload this exact palette candidate as new evidence or restore the prior draft.')); routes.push(freeze({ id: 'review-candidate', label: 'Open candidate recovery' })); }
  if (input.conflictingWorkflow) { blockers.push(item('ACTIVE_CONFLICT_REVIEW', 'Finish or cancel the active palette conflict review before editing.', input.conflictingWorkflow)); routes.push(freeze({ id: 'review-conflict', label: 'Open conflict review' })); }
  if (input.ownershipResolved === false) blockers.push(item('UNRESOLVED_OWNERSHIP', 'The stored palette owner is unresolved, so a safe edit target cannot be proven.'));
  if ((input.lockedIndexes || []).map(Number).includes(activeIndex)) blockers.push(item('LOCKED_INDEX', `Palette index ${activeIndex} is locked. Unlock it or choose another index.`));
  if (input.linkedPalette) {
    const owner = physical(input.ownerPhysicalIndex);
    const known = owner !== null;
    redirects.push(item('LINKED_PALETTE_OWNER', known ? `This palette shares stored colors with physical palette ${owner}. Edit that owner or explicitly materialize a copy.` : 'This palette is linked; resolve its stored owner before editing.'));
    if (known) routes.push(freeze({ id: 'select-palette-owner', label: `Select stored owner ${owner}`, physicalIndex: owner }));
    if (mutating) blockers.push(item('LINKED_PALETTE_REQUIRES_OWNER', known ? `Mutation must target physical palette ${owner} or a reviewed materialized copy.` : 'Mutation requires a proven stored palette owner.'));
  }
  if (![5, 8].includes(Number(input.spriteColorDepth))) limitations.push(item('TRUECOLOR_PREVIEW', 'The selected sprite is truecolor, so indexed focus and pixel-to-index picking are unavailable. Palette editing remains separate.'));
  if (evidence.previewOverride) advisories.push(item('PREVIEW_PALETTE_OVERRIDE', `The preview uses physical palette ${evidence.previewPalettePhysicalIndex} instead of the sprite-authored palette ${evidence.authoredPalettePhysicalIndex}.`));
  if (evidence.runtimeRemap === 'unknown') { advisories.push(item('RUNTIME_REMAP_UNKNOWN', 'Runtime RemapPal selection is not proven by this static preview.')); routes.push(freeze({ id: 'review-remap-context', label: 'Review domains / RemapPal' })); }
  if (activeIndex === 0) advisories.push(item('INDEX_ZERO_CONVENTION', 'Index 0 is conventionally transparent; change or unlock it only when that is intentional.'));
  if (input.preserveAlpha !== false) advisories.push(item('ALPHA_PRESERVED', 'RGB edits preserve the current alpha value.'));
  const allowed = !mutating || blockers.length === 0;
  const primary = blockers[0] || redirects[0] || limitations[0] || advisories[0] || item('READY', 'This action is available for the exact selected palette index.');
  return freeze({ version: 1, action, index: activeIndex, mutating, allowed, primary, blockers, redirects, limitations, advisories, evidence, routes });
}

module.exports = { MUTATIONS, renderedEvidence, explainPaletteAction };
