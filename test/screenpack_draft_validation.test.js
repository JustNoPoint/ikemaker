'use strict';
const assert=require('assert'),Module=require('module');
const original=Module._load;
Module._load=function(request,parent,main){if(request==='vscode')return{workspace:{getConfiguration:()=>({get:(_key,fallback)=>fallback})}};return original.call(this,request,parent,main);};
const {safeScreenpackDraft}=require('../src/screenpack_workspace');
Module._load=original;
const hash='a'.repeat(64),valid=()=>({sourceHash:hash,overrides:{'0:0':[12,-3.5]},grid:{gridRows:2,gridColumns:3,gridX:0,gridY:0,cellW:20,cellH:30,spaceX:1,spaceY:2}});
assert.deepEqual(safeScreenpackDraft(valid()),valid());
for(const mutate of [
  value=>value.extra=true,
  value=>value.sourceHash='short',
  value=>value.grid.extra=1,
  value=>value.grid.gridRows=0,
  value=>value.grid.gridColumns=1001,
  value=>value.grid.cellW=0,
  value=>value.grid.cellH=1000001,
  value=>value.overrides['10000:0']=[1,2],
  value=>value.overrides['0:0']=[10000001,2],
  value=>value.overrides['0:0'].extra=3,
]){const value=valid();mutate(value);assert.equal(safeScreenpackDraft(value),null);}
const inherited=Object.create({sourceHash:hash});inherited.overrides={};inherited.grid={};assert.equal(safeScreenpackDraft(inherited),null);
const nested=valid();nested.grid=Object.create({extra:true});Object.assign(nested.grid,valid().grid);assert.equal(safeScreenpackDraft(nested),null);
const oversize=valid();oversize.overrides={};for(let index=0;index<2001;index++)oversize.overrides[`${index}:0`]=[0,0];assert.equal(safeScreenpackDraft(oversize),null);
assert(safeScreenpackDraft(valid()),'a rejection must not poison the next valid draft');
assert.deepEqual(safeScreenpackDraft({sourceHash:hash,overrides:{},grid:{}}),{sourceHash:hash,overrides:{},grid:{}});
console.log('Screenpack draft schema rejects malformed, inherited, extra and oversized values then recovers');
