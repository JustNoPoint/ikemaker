'use strict';

const assert = require('assert');
const { buildAdaptationReview, chooseSubstitution, recheckAdaptationReview } = require('../src/similar_code_adaptation');

const fp = value => String(value).repeat(64).slice(0, 64);
const review = buildAdaptationReview({
  currentSource:{ filename:'C:/game/chars/Ryu/current.zss', line:10, endLine:20, fingerprint:fp('a') },
  referenceSource:{ filename:'C:/game/chars/Ryu/reference.zss', line:30, endLine:40, fingerprint:fp('b') },
  currentLanguage:'zss', referenceLanguage:'zss', target:{ channel:'stable', version:'1.0', capabilityFingerprint:fp('c') },
  currentDependencies:{ states:['200'], commands:['punch'], maps:['Move.Mode'], helpers:['100'] },
  referenceDependencies:{ states:['400'], commands:['punch'], maps:['Enemy.Mode'], helpers:['map(HelperId)'], sounds:['2, 4'] }
});
assert.strictEqual(review.mutationAllowed,false,'the first adaptation slice is a zero-write dependency review');
assert.strictEqual(review.rows.find(row=>row.kind==='commands').status,'already-matched');
assert.strictEqual(review.rows.find(row=>row.kind==='states').status,'needs-selection');
assert.strictEqual(review.rows.find(row=>row.kind==='helpers').status,'dynamic-unresolved');
assert.strictEqual(review.rows.find(row=>row.kind==='sounds').status,'unresolved');
assert(review.blockers.some(value=>/Engine compatibility has not been proven/.test(value)),'review cannot be promoted to insertion without exact target proof');
const stateRow=review.rows.find(row=>row.kind==='states'),chosen=chooseSubstitution(review,stateRow.id,'200');
assert.strictEqual(chosen.rows.find(row=>row.id===stateRow.id).status,'reviewed-substitution');
assert.strictEqual(chosen.rows.find(row=>row.id===stateRow.id).selectedValue,'200');
assert.throws(()=>chooseSubstitution(review,stateRow.id,'999'),/exact same-kind/,'the webview cannot inject an arbitrary replacement');
const dynamicRow=review.rows.find(row=>row.kind==='helpers');assert.throws(()=>chooseSubstitution(review,dynamicRow.id,'100'),/Dynamic dependency/);
assert.throws(()=>chooseSubstitution({...review,rows:review.rows.map(row=>row.id===stateRow.id?{...row,alternatives:['999']}:row)},stateRow.id,'999'),/invalid or stale/,'a forged 64-hex review identity cannot authorize altered rows');
assert.strictEqual(recheckAdaptationReview(review,{currentFingerprint:fp('a'),referenceFingerprint:fp('b')}).current,true);
assert.strictEqual(recheckAdaptationReview(review,{currentFingerprint:fp('d'),referenceFingerprint:fp('b')}).current,false,'either source revision invalidates the draft');
assert.throws(()=>buildAdaptationReview({currentSource:{filename:'x',line:0,fingerprint:'bad'},referenceSource:{filename:'y',line:0,fingerprint:fp('b')}}),/fingerprint/);
const huge=buildAdaptationReview({currentSource:{filename:'x',line:0,fingerprint:fp('a')},referenceSource:{filename:'y',line:0,fingerprint:fp('b')},currentLanguage:'zss',referenceLanguage:'zss',currentDependencies:{maps:Array.from({length:32},(_,i)=>`Current.${i}.${'x'.repeat(450)}`)},referenceDependencies:{maps:Array.from({length:32},(_,i)=>`Reference.${i}.${'y'.repeat(450)}`)}});assert(huge.omittedCount>0&&huge.note.includes('128 KiB'));assert(Buffer.byteLength(JSON.stringify(huge.rows),'utf8')<=128*1024,'review-local aggregate stays beneath its own budget before entering the shared browser model');
console.log('Similar Code adaptation review is bounded, exact-source, explicit, and zero-write');
