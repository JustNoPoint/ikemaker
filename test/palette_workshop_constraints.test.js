'use strict';

const assert = require('assert');
const { explainPaletteAction } = require('../src/palette_workshop_constraints');

const locked = explainPaletteAction({ action: 'edit', index: 0, lockedIndexes: [0], spriteColorDepth: 8, preserveAlpha: true });
assert.strictEqual(locked.allowed, false);
assert.strictEqual(locked.primary.code, 'LOCKED_INDEX');
assert.deepStrictEqual(locked.advisories.map(item => item.code), ['RUNTIME_REMAP_UNKNOWN', 'INDEX_ZERO_CONVENTION', 'ALPHA_PRESERVED']);

const truecolor = explainPaletteAction({ action: 'edit', index: 5, lockedIndexes: [], spriteColorDepth: 32 });
assert.strictEqual(truecolor.allowed, true, 'a preview limitation never becomes an edit prohibition');
assert.strictEqual(truecolor.limitations[0].code, 'TRUECOLOR_PREVIEW');

const linked = explainPaletteAction({ action: 'transfer', index: 7, lockedIndexes: [], spriteColorDepth: 8, linkedPalette: true, ownerPhysicalIndex: 3, renderedEvidence: { resource: { filename: 'Ryu.sff', byteHash: 'a'.repeat(64) }, sprite: { physicalIndex: 4, group: 200, number: 0 }, authoredPalettePhysicalIndex: 0, previewPalettePhysicalIndex: 2, ownerChain: [2, 3] } });
assert.strictEqual(linked.allowed, false);
assert.strictEqual(linked.redirects[0].code, 'LINKED_PALETTE_OWNER');
assert.match(linked.primary.message, /physical palette 3/);
assert.strictEqual(linked.evidence.effectiveOwnerPhysicalIndex, 3);
assert.strictEqual(linked.evidence.previewOverride, true);
assert(linked.advisories.some(item => item.code === 'PREVIEW_PALETTE_OVERRIDE'));
assert(linked.advisories.some(item => item.code === 'RUNTIME_REMAP_UNKNOWN'), 'unknown runtime RemapPal stays explicit instead of being promoted to preview truth');
assert.deepStrictEqual(linked.routes.find(item => item.id === 'select-palette-owner'), { id: 'select-palette-owner', label: 'Select stored owner 3', physicalIndex: 3 });
const linkedInspect = explainPaletteAction({ action: 'inspect', index: 7, linkedPalette: true, ownerPhysicalIndex: 3, spriteColorDepth: 8 });
assert.strictEqual(linkedInspect.allowed, true, 'inspection can explain a linked owner without claiming a mutation is safe');
const missingIdentity = explainPaletteAction({ action: 'inspect', index: 7, linkedPalette: true, ownerPhysicalIndex: null, spriteColorDepth: 8, renderedEvidence: { authoredPalettePhysicalIndex: null, previewPalettePhysicalIndex: 2, ownerChain: [null, '', false] } });
assert.strictEqual(missingIdentity.evidence.authoredPalettePhysicalIndex, null);
assert.strictEqual(missingIdentity.evidence.previewOverride, false, 'missing authored identity never invents a palette-0 override');
assert.deepStrictEqual(missingIdentity.evidence.ownerChain, []);
assert.strictEqual(missingIdentity.evidence.effectiveOwnerPhysicalIndex, 2);
assert(!missingIdentity.routes.some(item => item.id === 'select-palette-owner'), 'missing linked-owner evidence never invents a route to palette 0');
assert.match(missingIdentity.redirects[0].message, /resolve its stored owner/);

const stale = explainPaletteAction({ action: 'restore', index: 4, lockedIndexes: [], spriteColorDepth: 8, workspaceStale: true, candidateStale: true, conflictingWorkflow: 'unindexed swatch conflict' });
assert.deepStrictEqual(stale.blockers.map(item => item.code), ['STALE_WORKSPACE', 'STALE_CANDIDATE', 'ACTIVE_CONFLICT_REVIEW']);
assert.strictEqual(stale.primary.code, 'STALE_WORKSPACE');

const unresolved = explainPaletteAction({ action: 'edit', index: 2, lockedIndexes: [], spriteColorDepth: 8, ownershipResolved: false });
assert.strictEqual(unresolved.allowed, false);
assert.strictEqual(unresolved.primary.code, 'UNRESOLVED_OWNERSHIP');

const ready = explainPaletteAction({ action: 'edit', index: 9, lockedIndexes: [], spriteColorDepth: 8, preserveAlpha: false, renderedEvidence: { runtimeRemap: 'known' } });
assert.strictEqual(ready.allowed, true);
assert.strictEqual(ready.primary.code, 'READY');
assert(Object.isFrozen(ready) && Object.isFrozen(ready.primary) && Object.isFrozen(ready.blockers));

console.log('Palette Workshop structured action constraints passed');
