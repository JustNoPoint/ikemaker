'use strict';
const assert = require('assert');
const { parseExplodAnimationReferences } = require('../src/explod_animation_reference_authority');

const cns = parseExplodAnimationReferences('[StateDef 1]\r\n[State 1, fx]\r\ntype = Explod\r\nanim = 007 ; note\r\nspriteplayerno = 2\r\n', 'cns')[0];
assert.strictEqual(cns.action, 7); assert.strictEqual(cns.available, true); assert.match(cns.warning, /sprite owner/); assert.strictEqual(cns.expression, '007');
const zss = parseExplodAnimationReferences('[StateDef 1]\nExplod { anim: 20; spriteplayerno: 2; }\n', 'zss')[0];
assert.strictEqual(zss.action, 20); assert.strictEqual(zss.available, true); assert.strictEqual(zss.expression, '20');
for (const [expression, reason] of [['-1', /no animation/], ['-2', /empty-valid/], ['-3', /Negative/], ['S10', /prefix/i], ['F 10', /prefix/i], ['1 + 2', /unprefixed/]]) {
  const item = parseExplodAnimationReferences(`[StateDef 1]\nExplod { anim: ${expression}; }`, 'zss')[0]; assert.strictEqual(item.available, false); assert.match(item.reason, reason);
}
for (const body of ['anim: 1; anim: 2;', 'anim: 1; animplayerno: 1;', 'anim: 1; redirectid: 2;']) assert.strictEqual(parseExplodAnimationReferences(`[StateDef 1]\nExplod { ${body} }`, 'zss')[0].available, false);
for(const prefix of ['root, ','root,\n','parent,\r\n','playerId(4),\n'])assert.strictEqual(parseExplodAnimationReferences(`[StateDef 1]\n${prefix}Explod { anim: 1; }`, 'zss')[0].available, false);
for(const [syntax,text] of [['zss','[StateDef 1]\nExplod { anim: "S", 10; }'],['cns','[StateDef 1]\n[State 1,x]\ntype=Explod\nanim = "S", 10']]){const item=parseExplodAnimationReferences(text,syntax)[0];assert.strictEqual(item.expression,'"S", 10');assert.strictEqual(text.slice(item.valueStart,item.valueEnd),'"S", 10');assert.strictEqual(item.available,false);assert.match(item.reason,/prefix/i);}
for(const expression of ['S 10','S + 10','map(FxPrefix), 10'])assert.match(parseExplodAnimationReferences(`[StateDef 1]\nExplod { anim: ${expression}; }`,'zss')[0].reason,/prefix/i);
assert.strictEqual(parseExplodAnimationReferences('[StateDef 1]\nModifyExplod { anim: 1; }', 'zss').length, 0);
assert.strictEqual(parseExplodAnimationReferences('[StateDef 1]\n# Explod { anim: 9; }\nlet x = "Explod { anim: 8; }";', 'zss').length, 0);
console.log('Explod animation references preserve exact spans and conservative ownership/sentinel rules');
