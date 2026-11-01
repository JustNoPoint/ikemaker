'use strict';

const assert=require('assert');
const placement=require('../src/palette_template_placement_draft');

let draft=placement.create({authorityHash:'a'.repeat(64),topologyCandidateHash:'b'.repeat(64),sourceWidth:16,sourceHeight:8,indexes:[9,4],decisions:[{index:4,mode:'new-zone',zoneId:'body',zoneName:'Body',rect:{x:16,y:0,width:2,height:2},manualConfirmed:true}]});
assert.deepStrictEqual(draft.indexes,[4,9]);
assert.strictEqual(draft.activeIndex,4);
assert.strictEqual(draft.decisions[0].zoneName,'Body');
assert.deepStrictEqual(draft.decisions[1].rect,{x:17,y:0,width:1,height:1});
const firstHash=draft.draftHash;
draft=placement.revise(draft,firstHash,9,{mode:'existing-zone',zoneId:'body',rect:{x:18,y:1,width:3,height:2},insertAt:1,manualConfirmed:true});
assert.strictEqual(draft.decisions[1].mode,'existing-zone');
assert.throws(()=>placement.revise(draft,firstHash,9,{mode:'defer'}),/changed before this edit/,'stale UI edits fail closed');
draft=placement.navigate(draft,draft.draftHash,'next');assert.strictEqual(draft.activeIndex,4);
draft=placement.activate(draft,draft.draftHash,9);assert.strictEqual(draft.activeIndex,9);
draft=placement.nudge(draft,draft.draftHash,{direction:'right'});assert.strictEqual(draft.decisions.find(item=>item.index===9).rect.x,19);
draft=placement.nudge(draft,draft.draftHash,{direction:'down',resize:true,amount:2});assert.strictEqual(draft.decisions.find(item=>item.index===9).rect.height,4);
const restored=placement.normalize(JSON.parse(JSON.stringify(draft)));assert.strictEqual(restored.draftHash,draft.draftHash,'partial placement survives serialization/reload exactly');
assert.strictEqual(placement.assertBinding(restored,{authorityHash:'a'.repeat(64),topologyCandidateHash:'b'.repeat(64),indexes:[4,9]}).draftHash,restored.draftHash);
assert.throws(()=>placement.assertBinding(restored,{authorityHash:'a'.repeat(64),topologyCandidateHash:'c'.repeat(64),indexes:[4,9]}),/topology changed/,'same new-index set cannot silently rebind a retained placement to a different topology');
assert.throws(()=>placement.assertBinding(restored,{authorityHash:'d'.repeat(64),topologyCandidateHash:'b'.repeat(64),indexes:[4,9]}),/different indexed template authority/);
const decisions=placement.reviewedDecisions(restored);assert.deepStrictEqual(decisions.map(item=>item.index),[4,9]);
const deferred=placement.revise(restored,restored.draftHash,9,{mode:'defer',reason:'Need artist review'});assert.match(placement.reviewedDecisions(deferred)[1].reason,/artist/);
const tampered=JSON.parse(JSON.stringify(restored));tampered.decisions[0].rect.x++;assert.throws(()=>placement.normalize(tampered),/changed after review/);
assert.throws(()=>placement.create({authorityHash:'a'.repeat(64),sourceWidth:1,sourceHeight:1,indexes:[0]}),/1 through 255/);

console.log('Palette template placement retained draft, CAS, navigation, keyboard move/resize, defer, and reload tests passed');
