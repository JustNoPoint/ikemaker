'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { reviewTemporaryPaletteCleanup, lifecycleRegistryPath, readLifecycleRegistry, mergeLifecycleRegistry } = require('../src/sff_placeholder_lifecycle');

const record = { lifecycleId: 'temp-beard-preview', paletteId: '9,1', ownerSpriteIds: ['sprite:20,0', 'sprite:20,1'], note: 'Temporary Ryu beard frames' };
let review = reviewTemporaryPaletteCleanup({ sprites: [
  { id: 'sprite:20,0', paletteId: '9,1', placeholderLifecycleId: 'temp-beard-preview' },
  { id: 'sprite:20,1', paletteId: '9,1', placeholderLifecycleId: 'temp-beard-preview' }
], temporaryPalettes: [record], removedSpriteIds: ['sprite:20,0'] });
assert.strictEqual(review.eligible.length, 0); assert.match(review.blocked[0].reasons[0], /1 owned placeholder/);
review = reviewTemporaryPaletteCleanup({ sprites: [
  { id: 'sprite:20,0', paletteId: '9,1', placeholderLifecycleId: 'temp-beard-preview' },
  { id: 'sprite:20,1', paletteId: '9,1', placeholderLifecycleId: 'temp-beard-preview' }
], temporaryPalettes: [record], removedSpriteIds: ['sprite:20,0', 'sprite:20,1'] });
assert.strictEqual(review.eligible[0].action, 'propose-delete', 'last placeholder removal creates a proposal rather than deleting automatically');
review = reviewTemporaryPaletteCleanup({ sprites: [
  { id: 'sprite:20,0', paletteId: '9,1', placeholderLifecycleId: 'temp-beard-preview' },
  { id: 'sprite:20,1', paletteId: '9,1', placeholderLifecycleId: 'temp-beard-preview' },
  { id: 'sprite:30,0', paletteId: '9,1', placeholderLifecycleId: '' }
], temporaryPalettes: [record], removedSpriteIds: ['sprite:20,0', 'sprite:20,1'] });
assert.match(review.blocked[0].reasons.join(' '), /unowned sprite reference/);
review = reviewTemporaryPaletteCleanup({ sprites: [], temporaryPalettes: [record], removedSpriteIds: record.ownerSpriteIds, unresolvedReferences: ['9,1'] });
assert.match(review.blocked[0].reasons.join(' '), /unresolved/);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-placeholder-registry-'));
try {
  fs.writeFileSync(path.join(root, 'Ikemen_GO.exe'), ''); const sff = path.join(root, 'chars', 'Ryu', 'Ryu.sff'); fs.mkdirSync(path.dirname(sff), { recursive: true }); fs.writeFileSync(sff, 'sff');
  const owned = { ...record, owners: record.ownerSpriteIds.map((entryId, index) => ({ ownerId: `owner-${index}`, entryId })) };
  const merged = mergeLifecycleRegistry(sff, [owned], { sourceSffHash: 'abc' }); fs.mkdirSync(path.dirname(lifecycleRegistryPath(sff)), { recursive: true }); fs.writeFileSync(lifecycleRegistryPath(sff), JSON.stringify(merged));
  assert.strictEqual(readLifecycleRegistry(sff).records[0].owners[0].ownerId, 'owner-0');
  assert.strictEqual(mergeLifecycleRegistry(sff, [], { removeLifecycleIds: [record.lifecycleId] }).records.length, 0);
} finally { fs.rmSync(root, { recursive: true, force: true }); }
console.log('Temporary SFF palettes are reference-counted by explicit placeholder ownership and only proposed for reviewed deletion');
