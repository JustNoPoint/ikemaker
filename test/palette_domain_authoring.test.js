'use strict';

const assert = require('assert');
const model = require('../src/palette_domain_model');
const { hash } = require('../src/mutation_safety');
const { PaletteDomainAuthoring, LIMITS } = require('../src/palette_domain_authoring');

const colors = seed => Array.from({ length: 256 }, (_, index) => [seed, index, 0, index ? 255 : 0]);
const archive = (bytes = 'SFF-A', duplicate = false) => ({
  buffer: Buffer.from(bytes),
  palettes: [
    { index: 0, group: 1, number: 1, link: 0, colors: colors(1) },
    { index: 1, group: 1, number: 2, link: 0, colors: colors(2) },
    ...(duplicate ? [{ index: 2, group: 1, number: 1, link: 0, colors: colors(3) }] : [])
  ],
  sprites: [{ index: 0, group: 0, number: 0 }, { index: 1, group: 200, number: 0 }]
});
const archiveKey = 'chars/hero/hero.sff';
let document = model.applyOperation(model.emptyRegistry(), archiveKey, { kind: 'putRemapPalGroup', value: { id: 'remap-0001', name: 'Costumes', rangeMappings: ['1,1-1,2 -> 2,1-2,2'] } });
const snapshot = (doc = document, byte = 'a'.repeat(64)) => ({ readOnly: false, byteHash: byte, document: doc, archiveKey, archive: doc.archives[archiveKey] || model.emptyArchive() });
let tick = Date.parse('2026-10-22T12:00:00Z'), random = 0;
const authority = new PaletteDomainAuthoring({ now: () => tick, randomBytes: size => Buffer.alloc(size, ++random) });
const draft = {
  operation: 'putDomainTopology',
  domain: { name: 'Character', masterPalette: { group: 1, number: 1 }, paletteIds: [{ group: 1, number: 1 }, { group: 1, number: 2 }], spriteGroupIds: [0, 200], remapPalGroupIds: ['remap-0001'] },
  bindings: [{ spriteGroup: 0, remapPalGroupIds: ['remap-0001'], note: 'body' }, { spriteGroup: 200, remapPalGroupIds: [], note: 'effects' }]
};
const live = archive(), review = authority.preview({ filename: 'C:/game/hero.sff', archive: live, registrySnapshot: snapshot(), draft });
assert.strictEqual(review.metadataOnly, true); assert.strictEqual(review.activeSffChanged, false); assert.strictEqual(review.domain.masterPalette.group, 1); assert.strictEqual(review.details.spriteGroupCount, 2); assert.match(review.summary, /master 1,1/); assert.match(review.domain.id, /^domain-/);
const authorized = authority.consume(review.reviewToken, { filename: 'C:/game/hero.sff', archive: live, registrySnapshot: snapshot() });
assert.strictEqual(authorized.operation.kind, 'putDomainTopology'); assert.strictEqual(authorized.expected.revision, document.revision);
assert.throws(() => authority.consume(review.reviewToken, { filename: 'C:/game/hero.sff', archive: live, registrySnapshot: snapshot() }), /already used/);
const applied = model.applyOperation(document, archiveKey, authorized.operation), metadata = applied.archives[archiveKey], saved = metadata.domains[0];
assert.deepStrictEqual(saved.masterPalette, { group: 1, number: 1 }); assert.deepStrictEqual(saved.spriteGroupIds, [0, 200]); assert(metadata.remapPalGroups[0].domainIds.includes(saved.id)); assert.strictEqual(metadata.spriteGroupBindings.length, 2); assert(metadata.spriteGroupBindings.every(item => item.domainIds.includes(saved.id))); assert.strictEqual(metadata.lastReviewedInventoryHash, authorized.evidence.inventoryHash);

assert.throws(() => authority.preview({ filename: 'C:/game/hero.sff', archive: live, registrySnapshot: snapshot(), draft: { ...draft, domain: { ...draft.domain, masterPalette: null } } }), /Master palette/);
assert.throws(() => authority.preview({ filename: 'C:/game/hero.sff', archive: live, registrySnapshot: snapshot(), draft: { ...draft, domain: { ...draft.domain, masterPalette: { group: 9, number: 9 } } } }), /exactly one/);
assert.throws(() => authority.preview({ filename: 'C:/game/hero.sff', archive: archive('SFF-A', true), registrySnapshot: snapshot(), draft }), /exactly one/);
assert.throws(() => authority.preview({ filename: 'C:/game/hero.sff', archive: live, registrySnapshot: snapshot(), draft: { ...draft, domain: { ...draft.domain, spriteGroupIds: [999] }, bindings: [{ spriteGroup: 999 }] } }), /does not exist/);
assert.throws(() => authority.preview({ filename: 'C:/game/hero.sff', archive: live, registrySnapshot: snapshot(), draft: { ...draft, domain: { ...draft.domain, spriteGroupIds: [] }, bindings: [] } }), /at least one exact live sprite group/, 'guided master-domain authoring cannot create an unbound metadata island');
assert.throws(() => authority.preview({ filename: 'C:/game/hero.sff', archive: live, registrySnapshot: snapshot(), draft: { ...draft, bindings: [{ spriteGroup: 0 }] } }), /same exact groups/);
assert.throws(() => authority.preview({ filename: 'C:/game/hero.sff', archive: live, registrySnapshot: snapshot(), draft: { operation: 'unknown', domain: {} } }), /Unsupported/);
assert.throws(() => authority.preview({ filename: 'C:/game/hero.sff', archive: live, registrySnapshot: snapshot(), draft: { operation: 'putDomainTopology', domain: { ...draft.domain, paletteIds: Array(LIMITS.palettes + 1).fill({ group: 1, number: 1 }) }, bindings: draft.bindings } }), /at most/);

const staleSff = authority.preview({ filename: 'C:/game/hero.sff', archive: live, registrySnapshot: snapshot(), draft });
assert.throws(() => authority.consume(staleSff.reviewToken, { filename: 'C:/game/hero.sff', archive: archive('SFF-B'), registrySnapshot: snapshot() }), /SFF changed/);
const staleMetadata = authority.preview({ filename: 'C:/game/hero.sff', archive: live, registrySnapshot: snapshot(), draft });
assert.throws(() => authority.consume(staleMetadata.reviewToken, { filename: 'C:/game/hero.sff', archive: live, registrySnapshot: snapshot(document, 'b'.repeat(64)) }), /metadata changed/);
const expired = authority.preview({ filename: 'C:/game/hero.sff', archive: live, registrySnapshot: snapshot(), draft }); tick += LIMITS.reviewAgeMs + 1;
assert.throws(() => authority.consume(expired.reviewToken, { filename: 'C:/game/hero.sff', archive: live, registrySnapshot: snapshot() }), /expired/);

document = applied; tick += 1;
const deleteReview = authority.preview({ filename: 'C:/game/hero.sff', archive: live, registrySnapshot: snapshot(document, 'c'.repeat(64)), draft: { operation: 'deleteDomain', domain: { id: saved.id }, bindings: [] } });
assert.strictEqual(deleteReview.details.action, 'delete'); assert(deleteReview.details.cascadeReferences.length >= 2, 'delete preview exposes every metadata cascade before authorization'); assert(deleteReview.warnings.some(item => item.code === 'metadata-cascade'));
const deletion = authority.consume(deleteReview.reviewToken, { filename: 'C:/game/hero.sff', archive: live, registrySnapshot: snapshot(document, 'c'.repeat(64)) });
const deleted = model.applyOperation(document, archiveKey, deletion.operation); assert.strictEqual(deleted.archives[archiveKey].domains.length, 0); assert.deepStrictEqual(deleted.archives[archiveKey].remapPalGroups[0].domainIds, []);

assert.strictEqual(hash(live.buffer), review.evidence.sffHash, 'authoring evidence binds the exact decoded SFF bytes');

const firstOfTwo = authority.preview({ filename: 'C:/game/hero.sff', archive: live, registrySnapshot: snapshot(document, 'c'.repeat(64)), draft: { ...draft, domain: { ...draft.domain, id: saved.id } } }), secondOfTwo = authority.preview({ filename: 'C:/game/hero.sff', archive: live, registrySnapshot: snapshot(document, 'c'.repeat(64)), draft: { ...draft, domain: { ...draft.domain, id: saved.id, description: 'newer review' } } });
assert.throws(() => authority.consume(firstOfTwo.reviewToken, { filename: 'C:/game/hero.sff', archive: live, registrySnapshot: snapshot(document, 'c'.repeat(64)) }), /already used|unavailable/, 'a newer preview revokes every older token for the same exact target');
assert.strictEqual(authority.revoke('C:/game/hero.sff'), 1); assert.throws(() => authority.consume(secondOfTwo.reviewToken, { filename: 'C:/game/hero.sff', archive: live, registrySnapshot: snapshot(document, 'c'.repeat(64)) }), /already used|unavailable/, 'panel disposal/context refresh can explicitly revoke retained authority');
console.log('Palette domain topology preview, single-use authority, strict live binding, and atomic model tests passed');
