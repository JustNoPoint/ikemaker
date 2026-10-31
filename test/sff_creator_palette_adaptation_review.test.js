'use strict';

const assert = require('assert');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const workflow = require('../src/sff_unmatched_color_workflow');
const { paletteFingerprint } = require('../src/palette_master');
const { normalizeDocument, sha: registryHash } = require('../src/palette_replacement_rule_store');
const review = require('../src/sff_creator_palette_adaptation_review');

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const colors = Array.from({ length: 256 }, (_, index) => [120 + (index % 100), 80, 40, 255]);
colors[0] = [0, 0, 0, 0]; colors[1] = [10, 10, 10, 255]; colors[2] = [20, 10, 10, 255]; colors[3] = [15, 15, 10, 255];
const masterFingerprint = paletteFingerprint(colors).toLowerCase(), pixels = Buffer.from([14, 15, 10, 255, 14, 15, 10, 255]), sourceHash = 'b'.repeat(64), decodedPixelHash = sha(pixels);
const scan = workflow.scan({ masterColors: colors, masterFingerprint, masterVersion: 'sff:1,0', alphaPolicy: 'exact-alpha', conversionProfile: 'indexed-exact-v1', sources: [{ id: 'frame-0', order: 0, width: 2, height: 1, rgba: pixels, sourceHash, decodedPixelHash }] });
const documentBody = { schema: 'ikemaker.palette-replacement-rules', version: 1, revision: 0, rules: [] }, document = normalizeDocument({ ...documentBody, documentHash: registryHash(documentBody) });
const binding = { creatorGeneration: 4, draftRevision: 9, targetIdentity: path.join(os.tmpdir(), 'Ryu.sff'), targetHash: 'a'.repeat(64), master: { physicalIndex: 2, colors, fingerprint: masterFingerprint, version: 'sff:1,0' }, sources: [{ id: 'frame-0', hash: sourceHash, decodedPixelHash }], scan, registry: { byteHash: 'c'.repeat(64), document }, scope: { kind: 'character', id: 'Ryu' }, conversionProfile: 'indexed-exact-v1', alphaPolicy: 'exact-alpha' };

let serial = 0;
const authority = new review.PaletteAdaptationReviewAuthority({ token: () => (++serial).toString(16).padStart(48, '0') });
const publicReview = authority.begin(binding);
assert.strictEqual(publicReview.rows.length, 1);
assert.strictEqual(publicReview.policy.automaticAcceptance, false);
assert(!JSON.stringify(publicReview).includes(scan.issues[0].issueId), 'public review uses opaque row IDs rather than internal issue IDs');
assert(publicReview.rows[0].candidates.every(candidate => /^[0-9a-f]{48}$/.test(candidate.candidateId)));
assert.strictEqual(publicReview.rows[0].suggestedCandidateId, publicReview.rows[0].candidates[0].candidateId);

const row = publicReview.rows[0], candidate = row.candidates[0];
const accepted = authority.accept({ reviewId: publicReview.reviewId, actionId: publicReview.actionId, selections: [{ rowId: row.rowId, candidateId: candidate.candidateId }] }, binding);
review.verifyAcceptance(accepted); review.revalidateAcceptance(accepted, binding);
const resolved = review.applyAcceptanceToDecisions(accepted, binding);
assert.strictEqual(resolved.ready, true);
assert.strictEqual(Object.values(resolved.decisions)[0].kind, 'map-index');
assert.strictEqual(Object.values(resolved.decisions)[0].includedOccurrenceIndexes.length, 2);
assert.throws(() => authority.accept({ reviewId: publicReview.reviewId, actionId: publicReview.actionId, selections: [{ rowId: row.rowId, candidateId: candidate.candidateId }] }, binding), /expired|already used/, 'acceptance is single-use');

const staleReview = authority.begin(binding), staleRow = staleReview.rows[0];
assert.throws(() => authority.accept({ reviewId: staleReview.reviewId, actionId: staleReview.actionId, selections: [{ rowId: staleRow.rowId, candidateId: staleRow.candidates[0].candidateId }] }, { ...binding, draftRevision: 10 }), /changed.*Nothing was accepted/);
assert.throws(() => authority.accept({ reviewId: staleReview.reviewId, actionId: staleReview.actionId, selections: [{ rowId: staleRow.rowId, candidateId: staleRow.candidates[0].candidateId }] }, binding), /expired|already used/, 'failed stale acceptance consumes authority');

const mismatched = authority.begin(binding), mismatchRow = mismatched.rows[0];
assert.throws(() => authority.accept({ reviewId: mismatched.reviewId, actionId: mismatched.actionId, selections: [{ rowId: mismatchRow.rowId, candidateId: 'f'.repeat(48) }] }, binding), /authority expired/);

const tampered = JSON.parse(JSON.stringify(accepted)); tampered.resolutionPatch.decisions[Object.keys(tampered.resolutionPatch.decisions)[0]].destinationIndex = 9;
assert.throws(() => review.verifyAcceptance(tampered), /changed after host review/);
assert.throws(() => review.revalidateAcceptance(accepted, { ...binding, targetHash: 'd'.repeat(64) }), /changed after nearest-color acceptance/);

console.log('SFF Creator nearest-color review authority is explicit, opaque, single-use, stale-safe, and map-index only');
