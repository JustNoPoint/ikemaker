'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const planes = new Map();
const originalLoad = Module._load;
Module._load = function(request, parent, main) {
  if (request === './sff_reader' && /palette_useful_animation_model/.test(parent?.filename || '')) return { spriteIndexPlane: (_archive, sprite) => ({ width: sprite.width, height: sprite.height, indices: Buffer.from(planes.get(sprite.index)), sourcePhysicalIndex: sprite.index }) };
  return originalLoad.call(this, request, parent, main);
};

try {
  const model = require('../src/palette_useful_animation_model');
  const sprites = [
    { index: 0, group: 0, number: 0, width: 2, height: 2, colorDepth: 8 },
    { index: 1, group: 0, number: 1, width: 2, height: 2, colorDepth: 8 },
    { index: 2, group: 0, number: 2, width: 2, height: 2, colorDepth: 32 }
  ];
  planes.set(0, [3,3,3,0]); planes.set(1, [3,4,4,0]);
  const archive = { sprites };
  const actions = [
    { number: 10, line: 20, frames: [{group:0,index:0},{group:0,index:0},{group:0,index:1}] },
    { number: 11, line: 30, frames: [{group:0,index:1},{group:0,index:1}] },
    { number: 12, line: 40, frames: [{group:0,index:2}] }
  ];
  const result = model.discover({ archive, actions, indexes: [3] });
  assert.strictEqual(result.available, true);
  assert.strictEqual(result.suggestions[0].actionNumber, 10);
  assert.strictEqual(result.suggestions[0].matchingPixels, 4, 'primary score counts each distinct sprite once even when frames repeat');
  assert.strictEqual(result.suggestions[0].distinctSprites, 2);
  assert.strictEqual(result.suggestions[0].matchingFrames, 3, 'authored matching frames remain truthful tie-break evidence');
  assert.strictEqual(result.skipped.truecolor, 1);
  const ambiguous=model.discover({archive,actions:[
    {number:10,line:2,frames:[{group:0,index:1}]},
    {number:10,line:20,shadowedDuplicate:true,frames:[{group:0,index:0},{group:0,index:0}]},
    {number:11,line:30,frames:[{group:0,index:1}]}
  ],indexes:[3]});
  assert.strictEqual(ambiguous.suggestions.some(item=>item.actionNumber===10),false,'duplicate-number AIR action families never receive actionable routes');
  assert.strictEqual(ambiguous.skipped.duplicateActions,2,'every ambiguous declaration is disclosed');
  const group = model.discover({ archive, actions, indexes: [3,4] });
  assert.strictEqual(group.suggestions[0].matchingPixels, 6, 'an exact named-group membership can score several palette indexes');
  assert.match(model.discover({archive,actions,indexes:[0]}).reason,/Transparent index 0/);
  assert.throws(()=>model.discover({archive,actions,indexes:[3],limits:{maximumFrames:2}}),/frame discovery limit/);
  assert.throws(()=>model.discover({archive,actions,indexes:[3],limits:{maximumDecodedPixels:3}}),/complete AIR scan/);
  assert.throws(()=>model.preflightAirText('[Begin Action 1]\n0,0,0,0,1\n0,0,0,0,1',{...model.LIMITS,maximumFrames:1}),/frame discovery limit/,'AIR counts are bounded before parsing');
  const fallback=model.discoverSprites({archive,indexes:[4]});
  assert.strictEqual(fallback.suggestions[0].kind,'sprite');
  assert.deepStrictEqual(fallback.suggestions[0].thumbnailSprite,{physicalIndex:1,group:0,number:1});
  const one=model.binding({sffPath:'hero.sff',sffHash:'a',defPath:'hero.def',defHash:'b',airPath:'hero.air',airHash:'c',assignmentHash:'z',palette:{physicalIndex:0},colorsHash:'d',scopeHash:result.scopeHash,suggestions:result.suggestions});
  const changed=model.binding({sffPath:'hero.sff',sffHash:'a',defPath:'hero.def',defHash:'b',airPath:'other.air',airHash:'c',assignmentHash:'y',palette:{physicalIndex:0},colorsHash:'d',scopeHash:result.scopeHash,suggestions:result.suggestions});
  assert.notStrictEqual(one,changed,'same-size AIR changes invalidate the opaque result binding');
  assert.throws(()=>model.discoverSprites({archive:{sprites:Array.from({length:model.LIMITS.maximumDistinctSprites+1},(_,index)=>({index,group:0,number:index,width:1,height:1,colorDepth:8}))},indexes:[3]}),/no partial result was labelled strongest/);

  const controller=fs.readFileSync(path.join(__dirname,'../src/palette_workspace_controller.js'),'utf8'),view=fs.readFileSync(path.join(__dirname,'../src/palette_workspace_view.js'),'utf8');
  assert.match(controller,/associatedDefs\(sffPath\).*owners\.length!==1/s,'ambiguous character ownership fails closed');
  assert.match(controller,/isDirty.*Save or revert/s,'dirty exact DEF or AIR authority is rejected');
  assert.match(controller,/fresh\.binding!==retained\.binding/,'each selection revalidates the complete opaque result binding');
  assert.match(controller,/state\.usefulPreview=\{palettePhysicalIndex:fresh\.palette\.physicalIndex,sffHash:fresh\.sffHash,defPath:fresh\.defPath,defHash:fresh\.defHash,assignmentHash:fresh\.assignmentHash/,'adopted animation retains the exact owner and assignment authority needed by the next live render');
  assert.match(controller,/assignment\.def\.filename!==retained\.defPath\|\|assignmentHash!==retained\.assignmentHash/,'a byte-identical alternate owner cannot inherit preview authority');
  assert.match(controller,/this\.targets\.get\(key\)!==state\)return true;const check=this\.usefulSearch/,'closing Palette Workshop during AIR open prevents delayed action selection');
  assert.match(controller,/duplicate-number AIR action declaration\(s\) were excluded/,'duplicate action-number ambiguity is visible');
  assert.match(controller,/bytes\.length>maximumBytes/,'actual post-read bytes are bounded before parsing');
  assert.match(controller,/state\.usefulSearch=null;/,'live context changes revoke old result routes');
  assert.doesNotMatch(controller.slice(controller.indexOf('usefulSearch(state)'),controller.indexOf('postLive(state')),/(?:writeFileSync|transactionalWrite|clipboard)/,'discovery performs no writes');
  assert.match(view,/Find useful animation/);
  assert.match(view,/aria-live=\\?"polite\\?"/);
  assert.match(view,/\.useful-animation-list\{display:grid;grid-template-columns:1fr/,'suggestions stay single-column in narrow browser viewers');
  console.log('Palette useful-animation discovery is bounded, deterministic, evidence-labelled, narrow, and read-only');
} finally {
  Module._load = originalLoad;
}
