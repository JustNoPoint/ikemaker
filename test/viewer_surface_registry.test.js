'use strict';

const assert = require('assert');
const { SURFACES, byViewType } = require('../src/viewer_surface_registry');
const { CAPABILITIES, validateCapability } = require('../src/viewer_source_capability');

assert(Object.isFrozen(SURFACES), 'surface registry must be immutable');
assert(SURFACES.length > 40, 'surface registry must cover the full persistent viewer family, not a sample');
assert.strictEqual(new Set(SURFACES.map((surface) => surface.id)).size, SURFACES.length, 'surface IDs must be unique');

const viewTypes = byViewType();
assert(viewTypes.size >= SURFACES.length, 'every surface must expose at least one unique view type');
for (const surface of SURFACES) {
  assert(Array.isArray(surface.ownerModules) && surface.ownerModules.length, `${surface.id} requires ownerModules`);
  assert(Object.isFrozen(surface.ownerModules), `${surface.id} ownerModules must be immutable`);
  assert.strictEqual(surface.ownerModule, undefined, `${surface.id} must not expose the lossy ownerModule field`);
  assert(surface.kind, `${surface.id} requires kind`);
  assert(surface.family, `${surface.id} requires family`);
  assert(surface.lifecycle, `${surface.id} requires lifecycle`);
  assert(surface.authoringContext, `${surface.id} requires authoringContext`);
  assert(['required', 'planned', 'excluded'].includes(surface.toolbarPolicy), `${surface.id} has unsupported toolbar policy`);
  assert(surface.specialistControlsOwner, `${surface.id} requires specialist-controls owner`);
  assert(CAPABILITIES[surface.sourceCapabilityId], `${surface.id} requires a registered source capability`);
  validateCapability(CAPABILITIES[surface.sourceCapabilityId]);
  if (surface.toolbarPolicy === 'excluded') { assert(surface.exclusionReason, `${surface.id} needs exclusion reason`); assert.strictEqual(surface.toolbarContractId, ''); }
  else { assert(surface.migrationReason, `${surface.id} needs migration reason`); assert.strictEqual(surface.toolbarContractId, 'universal-v1'); }
}

assert.strictEqual(viewTypes.get('ikemenSndViewer').id, 'snd.viewer');
assert.strictEqual(viewTypes.get('ikemenAirWorkspace').sourceCapabilityId, 'planned.exact-document');
assert.strictEqual(viewTypes.get('ikemenAirTransferBrowser').id, 'air.transfer-browser');
assert.strictEqual(viewTypes.get('ikemenSffViewer').sourceCapabilityId, 'planned.manifest');
assert.strictEqual(viewTypes.get('ikemenPaletteWorkspace').id, 'palette.workspace');
assert.strictEqual(viewTypes.get('ikemenVisualAuthoringBrowser').id, 'companion.visual-authoring-browser');
assert.strictEqual(viewTypes.get('ikemenLayeredPsdWorkspace').id, 'visual.layered-psd');
assert.strictEqual(viewTypes.has('ikemenPaletteImportAssistant'), false, 'retired palette import panel is not advertised as a live surface');
assert.strictEqual(viewTypes.has('ikemenPaletteIndexOrganizer'), false, 'retired palette organizer panel is not advertised as a live surface');
assert.strictEqual(viewTypes.get('ikemen.tools').toolbarPolicy, 'excluded');

console.log('Viewer surface registry tests passed');
