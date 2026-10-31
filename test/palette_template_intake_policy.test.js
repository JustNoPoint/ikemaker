'use strict';

const assert=require('assert');
const policy=require('../src/palette_template_intake_policy');
const H=letter=>letter.repeat(64);
const primary={filename:'primary.png',byteHash:H('a'),width:320,height:240,indexed:true,indexPlaneHash:H('b'),paletteHash:H('c'),authorityHash:H('d'),zoneDocumentHash:H('e'),templateId:'ryu-primary'};
const truecolor={filename:'artist-palette.png',byteHash:H('f'),width:320,height:240,indexed:false,templateId:'ryu-primary'};
const derived=policy.normalize({mode:'derived-palette',primary,submission:truecolor});
assert.strictEqual(derived.route,'overlay-recovery');
assert.deepStrictEqual(derived.allowedActions,['recover-with-template-overlay','reject']);
assert.strictEqual(derived.combineWithPrimary,false);
assert.strictEqual(derived.primaryWritable,false);
const recovered=policy.decide(derived,derived.reviewHash,'recover-with-template-overlay');
assert.strictEqual(recovered.status,'recovery-review');
assert.throws(()=>policy.promotionPlan(recovered,recovered.reviewHash,{explicitlyApproved:true,candidate:{...truecolor,indexed:true,indexPlaneHash:H('1'),paletteHash:H('2')},zoneDocumentHash:H('3')}),/derived palette submission cannot replace/);

const resized=policy.normalize({mode:'derived-palette',primary,submission:{...truecolor,width:321}});
assert.strictEqual(resized.route,'manual-align-or-reject');
assert.deepStrictEqual(resized.allowedActions,['manually-align-overlay','reject']);

const indexedCandidate={filename:'new-template.png',byteHash:H('4'),width:480,height:320,indexed:true,indexPlaneHash:H('5'),paletteHash:H('6')};
const expansion=policy.normalize({mode:'template-expansion',primary,submission:indexedCandidate});
assert.strictEqual(expansion.route,'overlay-expansion-review');
assert.deepStrictEqual(expansion.allowedActions,['review-isolated-expansion','reject']);
const reviewedExpansion=policy.decide(expansion,expansion.reviewHash,'review-isolated-expansion');
const expansionPlan=policy.promotionPlan(reviewedExpansion,reviewedExpansion.reviewHash,{explicitlyApproved:true,candidate:indexedCandidate,zoneDocumentHash:H('7')});
assert.strictEqual(expansionPlan.adoption,'explicit-reviewed-primary-update');
assert.strictEqual(expansionPlan.archiveOldPrimary,true);
assert.strictEqual(expansionPlan.combineWithPrimary,false);
const candidate=policy.normalize({mode:'new-template-candidate',primary,submission:indexedCandidate});
assert.strictEqual(candidate.route,'review-indexed-candidate');
assert.deepStrictEqual(candidate.allowedActions,['review-isolated-candidate','reject']);
const reviewed=policy.decide(candidate,candidate.reviewHash,'review-isolated-candidate');
assert.throws(()=>policy.promotionPlan(reviewed,reviewed.reviewHash,{candidate:indexedCandidate,zoneDocumentHash:H('7')}),/explicit final approval/);
const promotion=policy.promotionPlan(reviewed,reviewed.reviewHash,{explicitlyApproved:true,candidate:indexedCandidate,zoneDocumentHash:H('7')});
assert.strictEqual(promotion.archiveOldPrimary,true);
assert.strictEqual(promotion.combineWithPrimary,false);
assert.strictEqual(promotion.adoption,'explicit-reviewed-replacement');

const rawCandidate=policy.normalize({mode:'new-template-candidate',primary,submission:{...truecolor,filename:'new-truecolor.png',width:640,height:480}});
assert.strictEqual(rawCandidate.route,'manual-repair-or-reject');
assert.deepStrictEqual(rawCandidate.allowedActions,['repair-manually','reject']);
const rejected=policy.decide(rawCandidate,rawCandidate.reviewHash,'reject');
assert.strictEqual(rejected.status,'rejected');
assert.throws(()=>policy.promotionPlan(rejected,rejected.reviewHash,{explicitlyApproved:true,candidate:indexedCandidate,zoneDocumentHash:H('7')}),/before promotion/);

const noZones=policy.normalize({mode:'derived-palette',primary:{...primary,zoneDocumentHash:''},submission:truecolor});
assert.throws(()=>policy.decide(noZones,noZones.reviewHash,'recover-with-template-overlay'),/layout metadata/);
assert.throws(()=>policy.decide(derived,H('9'),'recover-with-template-overlay'),/changed before/);
console.log('Palette template intake authority, derivative overlay, isolated candidate, repair-or-reject, and explicit archived replacement policy tests passed');
