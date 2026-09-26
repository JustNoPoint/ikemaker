'use strict';

const assert = require('assert');
const path = require('path');
const { convertCnsToZss, conditionFor, characterConversionPlan, updateDefStateReferences } = require('../src/cns_to_zss');
const catalog = require('../data/sctrl.json');

assert.strictEqual(conditionFor([
  { normalized: 'triggerall', value: 'roundState = 2' },
  { normalized: 'trigger1', value: 'time = 0' },
  { normalized: 'trigger1', value: 'ctrl' },
  { normalized: 'trigger2', value: 'animTime = 0' }
]), '(roundState = 2) && (((time = 0) && (ctrl)) || (animTime = 0))');

const source = `; preserved file comment
[StateDef 200]
type = S
movetype = A
physics = S
anim = 200

[State 200, Hit]
type = HitDef
triggerall = roundState = 2
trigger1 = AnimElem = 2
trigger1 = MoveContact = 0
trigger2 = time = 5
ignorehitpause = 1
persistent = 0
attr = S, NA
damage = 30, 0

[State 200, End]
type = ChangeState
trigger1 = AnimTime = 0
value = 0
ctrl = 1
`;
const converted = convertCnsToZss(source, { catalog });
assert.strictEqual(converted.canWrite, true);
assert.strictEqual(converted.stateCount, 1);
assert.strictEqual(converted.controllerCount, 2);
assert.match(converted.text, /# preserved file comment/);
assert.match(converted.text, /\[StateDef 200; type: S; moveType: A; physics: S; anim: 200;\]/);
assert.match(converted.text, /ignoreHitPause \{/);
assert.match(converted.text, /persistent\(0\) if/);
assert.match(converted.text, /hitDef\{/);
assert.match(converted.text, /damage: 30, 0;/);
assert.match(converted.text, /changeState\{/);

const constants = convertCnsToZss('[Data]\nlife = 1000\n[Size]\nxscale = 1\n', { catalog });
assert.strictEqual(constants.canWrite, false);
assert(constants.findings.some((item) => item.code === 'omitted-non-state-section'));
assert(constants.findings.some((item) => item.code === 'no-statedef'));

const defPath = path.join('C:', 'game', 'chars', 'Ryu', 'Ryu.def');
const defText = '[Files]\nst = states/normal.cns ; keep\nst1 = "states/already.zss"\ncns = constants.cns\n';
const plan = characterConversionPlan(defText, defPath, (filename) => {
  assert(filename.endsWith(path.join('states', 'normal.cns')));
  return source;
}, catalog);
assert.strictEqual(plan.files.length, 1);
assert.strictEqual(plan.canWrite, true);
const nextDef = updateDefStateReferences(defText, plan.files);
assert.match(nextDef, /st = states\/normal\.zss ; keep/);
assert.match(nextDef, /st1 = "states\/already\.zss"/);
assert.match(nextDef, /cns = constants\.cns/);

const duplicate = convertCnsToZss('[StateDef 1]\ntype=S\n[State 1]\ntype=VelSet\ntrigger1=1\nx=1\nx=2\n', { catalog });
assert(duplicate.findings.some((item) => item.code === 'duplicate-parameter'));

const shorthand = convertCnsToZss('[StateDef 2]\n[State 2]\ntype=VarSet\ntrigger1=time=0\nvar(2)=command="holdfwd"\n', { catalog });
assert.match(shorthand.text, /v: 2;/);
assert.match(shorthand.text, /value: command="holdfwd";/);
assert(!shorthand.findings.some((item) => item.code === 'continued-expression'));

const malformedTrigger = convertCnsToZss('[StateDef 3]\n[State 3]\ntype=ChangeState\ntriggerA=1\nvalue=0\n', { catalog });
assert.strictEqual(malformedTrigger.canWrite, false);
assert(malformedTrigger.findings.some((item) => item.code === 'malformed-trigger-name'));

console.log('CNS-to-ZSS conversion model tests passed');
