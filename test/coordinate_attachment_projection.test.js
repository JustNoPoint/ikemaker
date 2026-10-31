'use strict';
const assert=require('assert');
const path=require('path');
const {buildCoordinateAttachmentProjection}=require('../src/coordinate_attachment_projection');

const root=path.resolve('fixture-character'),owner=path.join(root,'fighter.def'),zss=path.join(root,'states.zss'),cns=path.join(root,'legacy.cns');
const model=buildCoordinateAttachmentProjection([
  {filename:zss,text:'[StateDef 200]\nif time = 0 {\n  explod {\n    id: 20;\n    space: screen;\n    pos: 12, 24;\n    scale: 1, 1;\n  }\n}\n'},
  {filename:cns,text:'[StateDef 300]\n\n[State 300, Bind]\ntype = BindToParent\npos = 3, -4\ntime = 1\n'}
],{ownerIdentity:owner,localCoord:[640,480],capabilityState:'stable'});
assert.strictEqual(model.status,'ready');
assert.strictEqual(model.items.length,2);
const screen=model.items.find(item=>item.controller==='explod'),binding=model.items.find(item=>item.controller==='bindtoparent');
assert.strictEqual(screen.attachment.kind,'screen');
assert.strictEqual(screen.trajectory.coordinateSpace,'screen');
assert.deepStrictEqual(screen.trajectory.localCoord,[640,480]);
assert.strictEqual(screen.coordinate.position.expression,'12, 24');
assert.strictEqual(binding.attachment.confidence,'runtime-owner-unresolved');
assert.strictEqual(binding.trajectory.owner.reviewed,false);
assert.strictEqual(binding.source.ownerIdentity,owner);
assert.throws(()=>model.items.push({}),TypeError);
const unresolved=buildCoordinateAttachmentProjection([{filename:zss,text:'[StateDef 1]\nhelper { id: 2; pos: 1, 2; }'}]);
assert.strictEqual(unresolved.status,'incomplete');
assert.match(unresolved.limitations.join(' '),/ownership is unavailable/i);
const unresolvedLocalcoord=buildCoordinateAttachmentProjection([{filename:zss,text:'[StateDef 1]\nhelper { id: 2; pos: 1, 2; }'}],{ownerIdentity:owner});
assert.strictEqual(unresolvedLocalcoord.status,'incomplete');
assert.match(unresolvedLocalcoord.limitations.join(' '),/localcoord is unresolved/i);
console.log('Coordinate/attachment projection reuses scale evidence and trajectory normalization with explicit unresolved ownership');
