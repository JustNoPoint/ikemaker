'use strict';

const assert = require('assert');
const { analyzeZss } = require('../src/analyzer');

function codes(source) { return analyzeZss(source).issues.map(issue => issue.code); }

const missing = codes(`[StateDef 9000]\n# @customstate controller=attacker\nchangeAnim {\n  value: 5000;\n}\nexplod {\n  anim: 6000;\n}\n`);
assert.strictEqual(missing.filter(code => code === 'customstate-anim-owner').length, 2);

assert(!codes(`[StateDef 9000]\n# @customstate controller=attacker\nchangeAnim {\n  value: 5000;\n  animPlayerNo: playerNo;\n}\n`).includes('customstate-anim-owner'));
assert(!codes(`[StateDef 9000]\nchangeAnim { value: 5000; }\n`).includes('customstate-anim-owner'), 'ordinary self-owned animation is not guessed to be custom-state work');

assert(codes(`[StateDef 9000]\n# @customstate controller=attacker\nchangeAnim2 { value: 5000; }\n`).includes('customstate-anim-owner-exception'));
assert(!codes(`[StateDef 9000]\n# @customstate controller=attacker\n# @anim-owner-exception reviewed legacy owner route\nchangeAnim2 { value: 5000; }\n`).includes('customstate-anim-owner-exception'));
assert(!codes(`[StateDef 9000]\n# @customstate controller=attacker\nchangeAnim { animPlayerNo: playerNo; value: 5000; }\n[StateDef 0]\nchangeAnim { value: 0; }\n`).includes('customstate-anim-owner'));

console.log('Custom-state animation ownership diagnostics require explicit project context and never guess the owner');
