'use strict';
const assert = require('assert');
const { buildAirReferenceSummary } = require('../src/air_reference_summary');

const uses={available:true,items:[{action:0,omitted:2},{action:1}],occurrences:[{action:0,status:'exact'},{action:0,status:'dynamic'},{action:2,status:'missing'}],issues:[]};
const collisions={available:true,items:[{relation:'same-state',relatedActions:[0]},{relation:'conditional/dynamic',relatedActions:[0,1]},{relation:'global/shared',relatedActions:[]},{relation:'unresolved',relatedActions:[]}],perActionOmitted:{}};
assert.deepStrictEqual({...buildAirReferenceSummary(uses,collisions,0)},{available:true,action:0,exact:1,unresolved:1,sameState:1,conditional:1,animationOmitted:2,collisionOmitted:0,uncertainWholeCharacter:2,empty:false});
assert.strictEqual(buildAirReferenceSummary(uses,collisions,3).empty,true);
assert.strictEqual(buildAirReferenceSummary({...uses,available:false,reason:'Dirty source'},collisions,0).reason,'Dirty source');
assert.strictEqual(buildAirReferenceSummary({...uses,issues:[{action:0,reason:'Duplicate Action'}]},collisions,0).reason,'Duplicate Action');
assert.strictEqual(buildAirReferenceSummary(uses,collisions,null).available,false);
assert.strictEqual(buildAirReferenceSummary(uses,collisions,1).sameState,0,'whole-character rows and another Action are never attributed to the selection');
const many={available:true,items:Array.from({length:300},(_,index)=>({relation:index%2?'conditional/dynamic':'same-state',relatedActions:[7]})),perActionOmitted:{7:44}};const bounded=buildAirReferenceSummary({available:true,items:[],occurrences:[],issues:[]},many,7);assert.strictEqual(bounded.sameState+bounded.conditional+bounded.collisionOmitted,300,'bounded relation counts plus omitted equal the deterministic source-order total');assert.strictEqual(bounded.sameState,128);assert.strictEqual(bounded.conditional,128);
console.log('AIR compact reference summary keeps animation and conservative collision relations separate');
