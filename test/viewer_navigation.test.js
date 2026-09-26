'use strict';
const assert = require('assert');
const {fitSprite, referenceAt} = require('../src/viewer_navigation');

for (const sprite of [
  {width:57,height:103,axisX:26,axisY:101},
  {width:200,height:263,axisX:94,axisY:148},
  {width:8000,height:6000,axisX:-200,axisY:9000},
  {width:1,height:1,axisX:300,axisY:-300}
]) {
  const width=700,height=400,fit=fitSprite(sprite,width,height);
  const left=width/2+fit.x-sprite.axisX*fit.scale,top=height/2+fit.y-sprite.axisY*fit.scale;
  assert(left >= 39.999 && top >= 39.999, 'Fit must include the upper and left image edges');
  assert(left+sprite.width*fit.scale <= width-39.999 && top+sprite.height*fit.scale <= height-39.999, 'Fit must include the lower and right edges');
  assert(Math.abs(left+sprite.width*fit.scale/2-width/2)<1e-6);
  assert(Math.abs(top+sprite.height*fit.scale/2-height/2)<1e-6);
}
assert.deepStrictEqual(referenceAt('changeAnim {\n value: 200;\n}',1),{kind:'air',prefix:'',group:200,number:undefined});
assert.deepStrictEqual(referenceAt('[State 0]\ntype = PlaySnd\nvalue = 3, 4',2),{kind:'snd',prefix:'',group:3,number:4});
assert.deepStrictEqual(referenceAt('hitsound = S2, 1',0),{kind:'snd',prefix:'S',group:2,number:1});
assert.strictEqual(referenceAt('hitsound = 2, 1',0).prefix,'f');
assert.strictEqual(referenceAt('sparkno = 7000',0).prefix,'f');
assert.strictEqual(referenceAt('anim: fx_8010;',0).prefix,'fx_');
assert.strictEqual(referenceAt('anim: const(normal.lp.moveID);',0).expression,'const(normal.lp.moveID)');
assert.deepStrictEqual(referenceAt('[Begin Action 100]\n2,3,0,0,5',1),{kind:'sff',group:2,number:3});
assert.strictEqual(referenceAt('; anim: 300;',0),null);
assert.strictEqual(referenceAt('changeAnim {\nvalue: 200 + var(0);\n}',1).expression,'200 + var(0)');
assert.strictEqual(referenceAt('velSet {\nvalue: 200;\n}',1),null);
console.log('Viewer reference parsing and SFF fit bounds tests passed');

const {locateOrigin}=require('../src/viewer_navigation');
const origin={line:1,text:'value: 200;'};
assert.strictEqual(locateOrigin('changeAnim {\nvalue: 200;\n}',origin),1);
assert.strictEqual(locateOrigin('; inserted\nchangeAnim {\nvalue: 200;\n}',origin),2);
assert.strictEqual(locateOrigin('changed\nvalue: 201;',origin),-1);
assert.strictEqual(locateOrigin('value: 200;\nother\nvalue: 200;',origin),-1);
