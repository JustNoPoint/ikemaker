'use strict';

const assert = require('assert');
const { PaletteSlotCompactionAuthority } = require('../src/palette_slot_compaction_authority');

let counter=0;const randomBytes=size=>Buffer.alloc(size,++counter);
const owner=new PaletteSlotCompactionAuthority(randomBytes),target='C:/project/fighter.sff';
owner.begin(target,{reviewHash:'first'});
const build=owner.issue(target,'build',3);
assert.strictEqual(owner.consume(target,'build',3,build).payload.reviewHash,'first');
assert.throws(()=>owner.consume(target,'build',3,build),/expired|already used/,'tokens are single use');

const old=owner.issue(target,'compare',4);
owner.begin(target,{reviewHash:'second'});
assert.throws(()=>owner.consume(target,'compare',4,old),/expired|already used/,'new preview revokes the old generation');
const compare=owner.issue(target,'compare',8);
assert.throws(()=>owner.consume(target,'compare',9,compare),/expired|already used/,'session revision drift consumes and rejects a stage route');

const adopt=owner.issue(target,'adopt',10);
assert.throws(()=>owner.consume('C:/project/other.sff','adopt',10,adopt),/expired|already used/,'tokens cannot cross targets');
const disposed=owner.issue(target,'adopt',10);owner.revoke(target);
assert.throws(()=>owner.consume(target,'adopt',10,disposed),/expired|already used/,'dispose/revoke invalidates authority');

console.log('palette slot compaction authority tests passed');
