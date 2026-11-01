'use strict';

const assert = require('assert');
const { parseStateSource, stateDestinationContext, stateSymbolAt } = require('../src/state_transfer_model');

const zss = `[StateDef 200]
# changeState { value: 999; }
let text = "targetState { value: 998; }";
if time {
  changeState {
    value: 300;
  }
  targetState { value: -2; }
  helper(10), changeState { value: 400; }
  selfState { value: 500; }
  helper { stateNo: 600; }
  changeState { value: map(Dynamic); }
}
[StateDef 200]
[StateDef const(StateStand)]`;
const parsedZss = parseStateSource(zss, 'states.zss', 'zss');
assert.deepStrictEqual(parsedZss.declarations.map(item => item.value), [200, 200, null]);
assert.deepStrictEqual(parsedZss.transfers.map(item => [item.kind, item.literal, item.dynamic, item.redirected]), [
  ['changestate', 300, false, false], ['targetstate', -2, false, false], ['changestate', 400, false, true],
  ['selfstate', 500, false, false], ['helper', 600, false, false], ['changestate', null, true, false]
]);
assert.deepStrictEqual(parsedZss.transfers.filter(item => ['selfstate', 'helper'].includes(item.kind)).map(item => item.role), ['deferred-recipient-state', 'character-helper-state'], 'SelfState remains recipient-ambiguous while an unredirected Helper start belongs to this character runtime catalog');
const targetOffset = zss.indexOf('-2'), beforeTarget = zss.slice(0, targetOffset), targetLine = (beforeTarget.match(/\n/g) || []).length, targetColumn = targetOffset - beforeTarget.lastIndexOf('\n') - 1;
assert.strictEqual(stateSymbolAt(zss, 'states.zss', 'zss', targetLine, targetColumn), null, 'negative destinations are never exact navigation symbols');
const positiveOffset = zss.indexOf('300'), beforePositive = zss.slice(0, positiveOffset), positiveLine = (beforePositive.match(/\n/g) || []).length, positiveColumn = positiveOffset - beforePositive.lastIndexOf('\n') - 1;
assert.strictEqual(stateSymbolAt(zss, 'states.zss', 'zss', positiveLine, positiveColumn).value, 300);
const helperOffset=zss.indexOf('600'),beforeHelper=zss.slice(0,helperOffset),helperLine=(beforeHelper.match(/\n/g)||[]).length,helperColumn=helperOffset-beforeHelper.lastIndexOf('\n')-1;
assert.strictEqual(stateSymbolAt(zss,'states.zss','zss',helperLine,helperColumn).value,600,'an unredirected Helper start is an exact character-catalog reference');
const completionText = '[StateDef 1]\nchangeState {\n  value: 3\n}';
assert.deepStrictEqual(stateDestinationContext(completionText, 'states.zss', 'zss', 2, 10), { grammar: 'zss', controller: 'changestate', line: 2, start: 9, end: 10, prefix: '3' });
const wholeToken = '[StateDef 1]\nchangeState {\n  value: 300;\n}';
assert.deepStrictEqual(stateDestinationContext(wholeToken, 'states.zss', 'zss', 2, 10), { grammar: 'zss', controller: 'changestate', line: 2, start: 9, end: 12, prefix: '3' }, 'completion replaces the whole exact literal even when invoked mid-token');
assert.deepStrictEqual(stateDestinationContext('[StateDef 1]\nchangeState {\n  value: \n}', 'states.zss', 'zss', 2, 9), { grammar: 'zss', controller: 'changestate', line: 2, start: 9, end: 9, prefix: '' }, 'an empty recognized destination field accepts guarded completion when the controller is structurally closed');
assert.strictEqual(stateDestinationContext('changeState {\n value: map(next);\n}', 'x.zss', 'zss', 1, 10), null);
assert.strictEqual(stateDestinationContext('helper {\n stateNo: 60;\n}', 'x.zss', 'zss', 1, 11).controller,'helper','Helper starting-state fields receive the same guarded catalog completion');
assert.strictEqual(stateDestinationContext('selfState {\n value: 60;\n}', 'x.zss', 'zss', 1, 9),null,'SelfState stays excluded because the runtime recipient may own another character catalog');
const fixedSelf='[StateDef -2]\nselfState {\n value: 60;\n}';
assert.strictEqual(stateDestinationContext(fixedSelf,'x.zss','zss',2,9).controller,'selfstate','SelfState inside -2 uses the proven executor-own character catalog');
assert.strictEqual(stateSymbolAt(fixedSelf,'x.zss','zss',2,9).value,60,'the same proven -2 SelfState destination is navigable');
const runState='[StateDef 200]\nrunState { value: 201; }\nrunState { value: 202; playerno: 2; }\nhelper(1), runState { value: 203; }';
const runCapabilities={enabledCapabilities:['zss.run-state']};
const runTransfers=parseStateSource(runState,'x.zss','zss',runCapabilities).transfers.filter(item=>item.kind==='runstate');
assert.deepStrictEqual(runTransfers.map(item=>[item.literal,item.compileOwner,item.playerNoOverride,item.redirected]),[[201,'recipient-current-player',false,false],[202,'explicit-playerno',true,false],[203,'recipient-current-player',false,true]]);
assert.strictEqual(stateDestinationContext(runState,'x.zss','zss',1,20,{capabilities:runCapabilities}).controller,'runstate','unredirected RunState without playerno uses the current character catalog');
assert.strictEqual(stateDestinationContext(runState,'x.zss','zss',2,20,{capabilities:runCapabilities}),null,'RunState with playerno does not guess another character catalog');
assert.strictEqual(stateSymbolAt(runState,'x.zss','zss',1,20,{capabilities:runCapabilities}).value,201,'safe RunState destinations participate in exact navigation');
assert.strictEqual(stateDestinationContext(runState,'x.zss','zss',1,20),null,'stable 1.0 capability defaults do not expose RunState navigation');

const guarded = parseStateSource(`[StateDef 8]
changeState { value: 10; redirectID: 1; }
changeState {
 value: 11
 value: 12
}
hitDef { p1StateNo: 20; p2StateNo: 21; }
function Shared() {
 targetState { value: -4; }
}`, 'guarded.zss', 'zss');
assert.strictEqual(guarded.transfers[0].redirected, true, 'an in-body redirectID makes the transfer redirected');
assert.strictEqual(guarded.transfers[1].ambiguous, true, 'repeated destination fields fail closed');
assert.deepStrictEqual(guarded.transfers.filter(item => item.role === 'deferred-hit-state').map(item => item.field), ['p1stateno', 'p2stateno']);
assert.strictEqual(guarded.transfers.at(-1).owner.kind, 'function');
assert.strictEqual(guarded.transfers.at(-1).compileOwner, 'unknown');
const owners = parseStateSource(`[StateDef 200]
targetState { value: 700; }
targetState { value: -2; }
[StateDef -2]
targetState { value: 701; }
function Later() { targetState { value: 702; } }`, 'owners.zss', 'zss').transfers.filter(item => item.kind === 'targetstate');
assert.deepStrictEqual(owners.map(item => [item.owner.kind, item.owner.value ?? null, item.literal, item.compileOwner]), [
  ['statedef', 200, 700, 'current-state-owner'],
  ['statedef', 200, -2, 'current-state-owner'],
  ['statedef', -2, 701, 'executor-own/own-player'],
  ['function', null, 702, 'unknown']
], 'TargetState ownership comes from the exact containing StateDef, never its destination literal');
const fixedTargetOffset=owners.find(item=>item.compileOwner==='executor-own/own-player');
assert.strictEqual(fixedTargetOffset.literal,701,'StateDef -2 TargetState retains its executor-own catalog authority');

const malformed = parseStateSource('[StateDef 1]\nchangeState {\n value: 99\n[StateDef 2]\nchangeState { value: 2; }', 'broken.zss', 'zss');
assert.strictEqual(malformed.transfers[0].malformed, true); assert.strictEqual(malformed.transfers[0].dynamic, true);
assert.strictEqual(stateDestinationContext('[StateDef 1]\nchangeState {\n value: 99', 'broken.zss', 'zss', 2, 10), null, 'unclosed controllers never authorize navigation or completion');
assert.strictEqual(malformed.transfers.at(-1).literal, 2, 'bounded recovery resumes at the next StateDef and preserves its structurally closed controller');
const nested = parseStateSource('[StateDef 3]\nif time { changeState { value: 3; } }\nchangeState { value: 4; }', 'nested.zss', 'zss');
assert.deepStrictEqual(nested.transfers.map(item => item.literal), [3, 4], 'balanced nested braces do not consume the following controller');
const outerOpen = parseStateSource('[StateDef 4]\nif time {\n changeState { value: 40; }', 'outer-open.zss', 'zss');
assert.strictEqual(outerOpen.transfers[0].structurallyInvalid, true); assert.strictEqual(outerOpen.transfers[0].literal, null, 'a balanced controller inside an unmatched enclosing block fails closed');
const outerClose = parseStateSource('[StateDef 5]\n}\nchangeState { value: 50; }', 'outer-close.zss', 'zss');
assert.strictEqual(outerClose.transfers[0].structurallyInvalid, true); assert.strictEqual(outerClose.transfers[0].literal, null, 'a controller after an unmatched close fails closed');
const trailingOpen = parseStateSource('[StateDef 51]\nchangeState { value: 51; }\nif time {', 'trailing-open.zss', 'zss');
assert.strictEqual(trailingOpen.transfers[0].structurallyInvalid, true); assert.strictEqual(trailingOpen.transfers[0].literal, null, 'a later unmatched open invalidates every transfer in the same trusted segment');
const trailingClose = parseStateSource('[StateDef 52]\nchangeState { value: 52; }\n}', 'trailing-close.zss', 'zss');
assert.strictEqual(trailingClose.transfers[0].structurallyInvalid, true); assert.strictEqual(trailingClose.transfers[0].literal, null, 'a later unmatched close invalidates every transfer in the same trusted segment');
const malformedFunction = parseStateSource('function Broken() {\n if time {\n changeState { value: 60; }\n[StateDef 6]\nchangeState { value: 61; }', 'function-recovery.zss', 'zss');
assert.strictEqual(malformedFunction.transfers[0].dynamic, true, 'unclosed function/if structure suppresses claims');
assert.strictEqual(malformedFunction.transfers.at(-1).literal, 61, 'a trusted top-level StateDef boundary restores structural authority');

const cns = `[Statedef 100]
[State 100, ignored]
type = Null
value = 700
; [StateDef 999]
[State 100, go]
type = ChangeState
value = 200
[State 100, target]
type = TargetState
value = -4
[State 100, self]
type = SelfState
value = 300
[State 100, spawn]
type = Helper
stateno = 400
[StateDef 100]`;
const parsedCns = parseStateSource(cns, 'states.cns', 'ikemen-cns');
assert.deepStrictEqual(parsedCns.declarations.map(item => item.value), [100, 100]);
assert.deepStrictEqual(parsedCns.transfers.map(item => [item.kind, item.literal]), [['changestate', 200], ['targetstate', -4], ['selfstate', 300], ['helper', 400]]);
const cnsContext = '[StateDef 0]\n[State 0]\ntype = TargetState\nvalue = 2';
assert.strictEqual(stateDestinationContext(cnsContext, 'x.cns', 'ikemen-cns', 3, 9).controller, 'targetstate');
const repeatedCns = parseStateSource('[StateDef 1]\n[State 1]\ntype=ChangeState\ntype=TargetState\nvalue=2', 'x.cns', 'ikemen-cns');
assert.strictEqual(repeatedCns.transfers[0].ambiguous, true, 'repeated controller type fields do not select the first value');

const largeCns = `${Array.from({ length: 25000 }, (_, index) => `; ordinary line ${index}`).join('\n')}\n[StateDef 900]\n[State 900]\ntype = ChangeState\nvalue = 901`;
const largeStarted = Date.now();
const parsedLargeCns = parseStateSource(largeCns, 'large.cns', 'ikemen-cns');
const largeElapsed = Date.now() - largeStarted;
assert.deepStrictEqual(parsedLargeCns.declarations.map(item => item.value), [900]);
assert.deepStrictEqual(parsedLargeCns.transfers.map(item => item.literal), [901]);
assert.ok(largeElapsed < 2000, `large multiline scan should remain linear (took ${largeElapsed} ms)`);

console.log('Grammar-specific StateDef transfer parser tests passed');
