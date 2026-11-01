'use strict';
const assert = require('assert');
const { balancedExpressionDelimiters, basicSyntaxIssues } = require('../src/basic_syntax_diagnostics');
const codes = (text, language = 'zss', options = {}) => basicSyntaxIssues(text, language, options).map(item => item.code);

const zss = `[StateDef 200]
hitDef{
 attr: S, NA;
 attr: S, SA;
 damage: 30, 0
}
let value := 1
break;
switch $value {
 default:
 default:
}
notAController{}
if MysteryTrigger(1) {}`;
const found = codes(zss, 'zss', { unknownTriggers: true });
for (const expected of ['duplicate-controller-parameter','missing-semicolon','loop-control-outside-loop','duplicate-switch-default','unknown-controller','unknown-trigger']) assert(found.includes(expected), `missing ${expected}`);
assert(!codes('while 1 {\n break;\n continue;\n}\nswitch 1 {\n default:\n break;\n}', 'zss').includes('loop-control-outside-loop'));
assert(!codes('hitDef{\n damage: 30, 0\n}', 'zss').includes('missing-semicolon'), 'final controller parameter may omit its semicolon');
assert(!codes('# " ignored\nlet text := "closed";', 'zss').includes('unterminated-string'));
assert(codes('[StateDef 1]\nif "open {}', 'zss').includes('unterminated-string'));
const cns = `[State 200, Hit]
type = HitDef
trigger1 = time = 0
trigger1 = animelem = 2
attr = S, NA
attr = S, SA`;
const cnsCodes = codes(cns, 'ikemen-cns');
assert.strictEqual(cnsCodes.filter(code => code === 'duplicate-controller-parameter').length, 1, 'repeated trigger lines remain legal');
assert(!codes('if MysteryTrigger(1) {}', 'zss').includes('unknown-trigger'), 'unsafe unknown-trigger rule is opt-in');
assert(!codes('notAController{}', 'zss', { enabled: false }).length, 'master switch disables the syntax checks');
assert(!codes('notAController{}', 'zss', { unknownControllers: false }).includes('unknown-controller'));
const nestedSwitch = `switch 1 {
 case 1:
  switch 2 {
   default:
  }
 default:
}`;
assert(!codes(nestedSwitch, 'zss').includes('duplicate-switch-default'), 'nested switch defaults belong only to the innermost switch');
assert(codes('switch 1 {\n default:\n default:\n}', 'zss').includes('duplicate-switch-default'));
assert(codes('notAController{}', 'zss', { ignoredNames: ['notAController'] }).every(code => code !== 'unknown-controller'));
assert(codes('notAController{}', 'zss', { ignoredNames: ['notAController', 'x'.repeat(200)] }).every(code => code !== 'unknown-controller'), 'invalid oversized ignored names cannot disturb valid bounded entries');
assert.deepStrictEqual(codes('x'.repeat(4 * 1024 * 1024 + 1), 'zss'), [], 'oversized diagnostic sources fail closed');

const halfOpenRange = '(hitDefAttr = SC, NA, SA, HA && stateNo != [3050, 3100) && moveContact)';
assert.deepStrictEqual(codes(`if ${halfOpenRange} { null{} }`, 'zss'), [], 'a half-open ZSS range is not mistaken for mismatched grouping punctuation');
assert.deepStrictEqual(codes(`trigger1 = ${halfOpenRange}`, 'ikemen-cns'), [], 'a half-open CNS range is not mistaken for mismatched grouping punctuation');
for (const range of ['[1, 2]', '[1, 2)', '(1, 2]', '(1, 2)']) {
  const expression = `stateNo = ${range}`;
  assert.strictEqual(balancedExpressionDelimiters(expression), true, `${expression} is a valid closed, open, or half-open interval`);
  assert.deepStrictEqual(codes(`if ${expression} { null{} }`, 'zss'), [], `${range} does not produce a ZSS syntax warning`);
  assert.deepStrictEqual(codes(`trigger1 = ${expression}`, 'ikemen-cns'), [], `${range} does not produce a CNS syntax warning`);
  assert(!codes(`let bounded := ${expression};`, 'zss').includes('missing-semicolon'), `${range} remains balanced in a terminated ZSS statement`);
  assert(codes(`let bounded := ${expression}`, 'zss').includes('missing-semicolon'), `${range} does not hide a real missing ZSS semicolon`);
}
assert.strictEqual(balancedExpressionDelimiters('stateNo = [floor(low, 1), ceil(high, 1))'), true, 'commas nested inside range-bound function calls do not disturb the interval delimiter');
assert.strictEqual(balancedExpressionDelimiters('foo(1, 2]'), false, 'a mismatched function-call delimiter is not reclassified as an interval');
assert.strictEqual(balancedExpressionDelimiters('[1 + 2)'), false, 'mixed delimiters without a range separator remain invalid');
assert.strictEqual(balancedExpressionDelimiters('(var(0] + 1)'), false, 'a genuine nested delimiter mismatch remains invalid');
assert(codes('let outside := stateNo != [3050, 3100)', 'zss').includes('missing-semicolon'), 'a valid half-open interval does not suppress an unrelated missing-semicolon diagnostic');
console.log('Basic syntax diagnostics stay bounded, configurable, and conservative');
