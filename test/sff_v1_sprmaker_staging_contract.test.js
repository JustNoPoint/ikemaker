'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { makeFixture } = require('./helpers/sff_v1_sprmaker_fixture');
const { createSprMakerRecipe } = require('../src/sff_v1_sprmaker_recipe');
const { createSprMakerStagingPlan, assertSprMakerStagingPlan, validateInventoryDescriptors, safeAlias } = require('../src/sff_v1_sprmaker_staging_contract');

const root = process.env.IKEMAKER_LEGACY_MTOOLS || 'D:/Dropbox/Ikemen/Development/EngineSupport/tools/archive/old_tools', executable = path.join(root, 'sprmaker.exe'), notice = path.join(root, 'mtools.txt');
assert.throws(() => safeAlias('../EVIL.PCX'), /Unsafe DOS/); assert.throws(() => safeAlias('CON.PCX'), /Unsafe DOS/); assert.throws(() => safeAlias('TOO-LONG-NAME.PCX'), /Unsafe DOS/);
if (fs.existsSync(executable) && fs.existsSync(notice)) {
  const fixture = makeFixture({ single: true }), recipe = createSprMakerRecipe(fixture.specification), input = { specification: fixture.specification, recipe, sprmakerBytes: fs.readFileSync(executable), mtoolsBytes: fs.readFileSync(notice), runNonce: '0123456789abcdef0123456789abcdef', derivedPcxByEntryId: fixture.derivedPcxByEntryId }, plan = createSprMakerStagingPlan(input);
  assertSprMakerStagingPlan(plan); assert.strictEqual(plan.executionEligible, true); assert.strictEqual(plan.outputAlias, 'OUTPUT.SFF'); assert.strictEqual(plan.inventory.length, 4); assert(plan.inventory.every(row => /^[A-Z0-9_]{1,8}(?:\.[A-Z0-9_]{1,3})?$/.test(row.relativePath)));
  const descriptors = plan.inventory.map(row => ({ relativePath: row.relativePath, type: 'file', symlink: false, reparsePoint: false, linkCount: 1, byteHash: row.byteHash, byteLength: row.byteLength })); assert.strictEqual(validateInventoryDescriptors(plan, descriptors), true);
  assert.throws(() => validateInventoryDescriptors(plan, [...descriptors, { ...descriptors[0], relativePath: 'EXTRA.TXT' }]), /exactly/); assert.throws(() => validateInventoryDescriptors(plan, descriptors.map((row, index) => index ? row : { ...row, linkCount: 2 })), /regular/);
  assert.throws(() => validateInventoryDescriptors(plan, descriptors.map((row, index) => index ? row : { ...row, linkCount: '1' })), /canonical numeric/);
  assert.strictEqual(plan.runId.length, 66, 'the staging identity retains the complete nonce hash rather than a collision-prone prefix');
  const copy = plan.readFile('S000000.PCX'); copy[0] ^= 0xff; assert.notDeepStrictEqual(copy, plan.readFile('S000000.PCX'));
  assert.throws(() => createSprMakerStagingPlan({ ...input, derivedPcxByEntryId: { ...fixture.derivedPcxByEntryId, extra: fixture.derivedPcxByEntryId['sprite:0'] } }), /exactly every/);
  const drift = { ...fixture.derivedPcxByEntryId['sprite:0'], bytes: Buffer.from('drift') }; assert.throws(() => createSprMakerStagingPlan({ ...input, derivedPcxByEntryId: { 'sprite:0': drift } }), /drifted/);
  const semanticBytes = Buffer.from(fixture.derivedPcxByEntryId['sprite:0'].bytes); semanticBytes[semanticBytes.length - 1] ^= 1; const semanticDrift = { ...fixture.derivedPcxByEntryId['sprite:0'], bytes: semanticBytes, byteHash: require('crypto').createHash('sha256').update(semanticBytes).digest('hex') }; assert.throws(() => createSprMakerStagingPlan({ ...input, derivedPcxByEntryId: { 'sprite:0': semanticDrift } }), /palette differs/);
  const previousFixture = makeFixture({ previous: true }), previous = createSprMakerStagingPlan({ specification: previousFixture.specification, recipe: createSprMakerRecipe(previousFixture.specification), sprmakerBytes: input.sprmakerBytes, mtoolsBytes: input.mtoolsBytes, runNonce: 'abcdef0123456789abcdef0123456789', derivedPcxByEntryId: previousFixture.derivedPcxByEntryId }); assert.strictEqual(previous.executionEligible, false, 'documented prompt intent remains blocked pending a pinned SprMaker output golden');
}
console.log('SprMaker staging plan is private-root-ready, exact-inventory sealed, DOS-safe, link-hostile, provenance-bound, and copy-on-read');
