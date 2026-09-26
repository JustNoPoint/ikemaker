'use strict';

const assert = require('assert');
const { inspectZssText, inspectSources, findingsForFrame } = require('../src/zss_collision_inspector');

const source = [
  '[StateDef 200;', '  type: S;]', 'if anim = 200 && animElemNo(0) = 2 {',
  '  overrideClsn{', '    group: Clsn2;', '    index: 0;', '    rect: -10, -20, 10, 0;', '  }', '}',
  'hitDef{', '  p2clsncheck: Clsn1;', '  p2clsnrequire: Clsn2;', '  attack.depth: 4, 5;', '}',
  '', '[StateDef -4]', 'assertSpecial{flag: sizePushOnly}', 'helper{', '  clsnProxy: 1;', '  ownClsnScale: 1;', '}'
].join('\n');
const findings = inspectZssText(source, 'character.zss');

assert.strictEqual(findings.length, 4);
assert.deepStrictEqual(findings[0].actions, [200]);
assert.deepStrictEqual(findings[0].elements, [2]);
assert.strictEqual(findings[0].confidence, 'explicit');
assert(findings[0].details.includes('group: Clsn2'));
assert.strictEqual(findings[1].controller, 'HitDef');
assert.strictEqual(findings[1].confidence, 'inferred');
assert(findings[1].details.includes('p2clsncheck: Clsn1'));
assert.strictEqual(findings[2].confidence, 'shared');
assert.strictEqual(findings[3].controller, 'Helper');
assert.strictEqual(findingsForFrame(findings, 200, 2, false).length, 2);
assert.strictEqual(findingsForFrame(findings, 200, 1, false).length, 1);

const inferred = inspectZssText('[StateDef 410]\nplayerPush{value: 0}', 'normal.zss');
assert.strictEqual(inferred[0].confidence, 'inferred');
assert.deepStrictEqual(inferred[0].actions, [410]);

const ignored = inspectZssText('[StateDef 0]\nhitDef{damage: 10, 0}\nprojectile{projID: 2}', 'plain.zss');
assert.strictEqual(ignored.length, 1);
assert(ignored[0].details.includes('collision rule: no p2clsn override authored'));

const throughFunctions = inspectSources([
  { filename: 'shared.zss', text: '[Function SharedHit()]\nhitDef{p2clsncheck: Size}' },
  { filename: 'move.zss', text: '[Function Wrapper()]\ncall SharedHit();\n[StateDef 250]\ncall Wrapper();' }
]);
const reached = throughFunctions.find((item) => item.invocation && item.actions.includes(250));
assert(reached);
assert.strictEqual(reached.controller, 'HitDef');
assert.deepStrictEqual(reached.invocation.chain, ['Wrapper', 'SharedHit']);

console.log('ZSS collision inspector tests passed');
