'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { encodeRgbaPng } = require('../src/palette_collective_model');
const { paletteFingerprint } = require('../src/palette_master');
const { PaletteReplacementRuleStore, normalizeRule } = require('../src/palette_replacement_rule_store');
const workflow = require('../src/sff_unmatched_color_workflow');
const review = require('../src/sff_creator_replacement_rule_review');
const manifestModel = require('../src/sff_resolved_image_manifest');

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const colors = Array.from({ length: 256 }, (_, index) => index === 7 ? [192, 0, 0, 255] : [index, index, index, 255]), fingerprint = paletteFingerprint(colors).toLowerCase(), bytes = encodeRgbaPng(1, 1, Buffer.from([200, 1, 2, 255])), sourceHash = hash(bytes), scope = { kind: 'character', id: 'Ryu' };
const scan = workflow.scan({ masterColors: colors, masterFingerprint: fingerprint, masterVersion: 'sff:1,0', alphaPolicy: 'exact-alpha', conversionProfile: 'indexed-exact-v1', sources: [{ id: 'frame-0', bytes, sourceHash }] });
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-manifest-rules-'));

try {
  const store = new PaletteReplacementRuleStore(root), rule = normalizeRule({ id: 'rule-red-001', enabled: true, scope, sourceRgba: [200, 1, 2, 255], destinationIndex: 7, destinationRgba: colors[7], masterFingerprint: fingerprint, masterVersion: 'sff:1,0', alphaPolicy: 'exact-alpha', conversionProfile: 'indexed-exact-v1', sourceHashes: [sourceHash], exclusions: [], reason: 'Reviewed red', createdAt: '2026-10-22T12:00:00.000Z', updatedAt: '2026-10-22T12:00:00.000Z' }), saved = store.upsert(store.read().byteHash, rule), binding = { creatorGeneration: 1, draftRevision: 2, targetIdentity: path.join(root, 'Ryu.sff'), targetHash: 'a'.repeat(64), master: { physicalIndex: 0, colors, fingerprint, version: 'sff:1,0' }, sources: [{ id: 'frame-0', hash: sourceHash, decodedPixelHash: scan.sourceEvidence[0].decodedPixelHash }], scan, registry: { byteHash: saved.byteHash, document: saved.document }, scope, conversionProfile: scan.conversionProfile, alphaPolicy: scan.alphaPolicy };
  let serial = 0; const authority = new review.ReplacementRuleReviewAuthority({ token: () => (++serial).toString(16).padStart(48, '0') }), publicReview = authority.begin(binding), acceptance = authority.accept({ reviewId: publicReview.reviewId, actionId: publicReview.actions.find(action => action.kind === 'accept-all').actionId }, binding), resolution = review.applyAcceptanceToDecisions(acceptance, binding);
  const manifest = manifestModel.create({ scan, resolution, sources: [{ id: 'frame-0', bytes, sourceHash, plannedIdentity: '0,0' }], masterColors: colors, sffVersion: '2.1', replacementRuleAcceptance: acceptance, replacementRuleBinding: binding });
  manifestModel.verify(manifest); assert.deepStrictEqual(manifest.evidence.appliedRuleIds, [rule.id]); assert.deepStrictEqual(manifest.evidence.replacements[0].ruleIds, [rule.id]); assert.deepStrictEqual(manifestModel.revalidateReplacementRules(manifest, binding).appliedRuleIds, [rule.id]);
  assert.throws(() => manifestModel.backendInputs(manifest), /require fresh/); assert.strictEqual(manifestModel.backendInputs(manifest, binding).builtIn.manifestHash, manifest.manifestHash);
  assert.throws(() => manifestModel.create({ scan, resolution, sources: [{ id: 'frame-0', bytes, sourceHash }], masterColors: colors, sffVersion: '2.1' }), /host acceptance/);
  assert.throws(() => manifestModel.revalidateReplacementRules(manifest, { ...binding, creatorGeneration: 2 }), /changed after manifest creation/);
  const changedBytes = Buffer.from(bytes); changedBytes[changedBytes.length - 1] ^= 1; assert.throws(() => manifestModel.create({ scan, resolution, sources: [{ id: 'frame-0', bytes: changedBytes, sourceHash }], masterColors: colors, sffVersion: '2.1', replacementRuleAcceptance: acceptance, replacementRuleBinding: binding }), /changed after color review/);
  const tampered = { ...manifest, evidence: { ...manifest.evidence, appliedRuleIds: ['fake-rule'] } }; assert.throws(() => manifestModel.verify(tampered), /changed after review/);
} finally { fs.rmSync(root, { recursive: true, force: true }); }

console.log('Resolved-image manifest retains and revalidates exact saved-rule provenance and rejects unsigned rule decisions');
