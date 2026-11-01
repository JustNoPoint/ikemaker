'use strict';

const assert = require('assert');
const { handleDestinationKey, applyDestinationVisibility } = require('../src/authoring_navigation_model');

const ids = ['a','b','c','d','e','f','g'];
function runKey(currentId, key, modifiers = {}) {
  const effects = [];
  const handled = handleDestinationKey(ids, currentId, { key, ...modifiers }, {
    preventDefault: () => effects.push('prevent'),
    rememberSourceView: () => effects.push('remember'),
    activate: (id) => effects.push(`activate:${id}`)
  });
  return { handled, effects };
}

for (const modifiers of [{altKey:true},{ctrlKey:true},{metaKey:true},{shiftKey:true}]) {
  assert.deepStrictEqual(runKey('c','ArrowRight',modifiers),{handled:false,effects:[]},'modified keys neither prevent nor dispatch');
}
for (const [current,key] of [['a','ArrowLeft'],['g','ArrowRight'],['a','Home'],['g','End'],['c','ArrowDown']]) {
  assert.deepStrictEqual(runKey(current,key),{handled:false,effects:[]},'boundaries and unrelated keys neither prevent nor dispatch');
}
assert.deepStrictEqual(runKey('c','ArrowRight'),{handled:true,effects:['prevent','remember','activate:d']},'handled movement remembers before exactly one exact activation');
assert.deepStrictEqual(runKey('c','Enter'),{handled:true,effects:['prevent','remember','activate:c']},'Enter activates the focused exact id');
assert.deepStrictEqual(runKey('c',' '),{handled:true,effects:['prevent','remember','activate:c']},'Space activates the focused exact id');
assert.strictEqual(handleDestinationKey(Array.from({length:513},(_,index)=>String(index)),'0',{key:'Enter'},{activate(){throw new Error('must not activate');}}),false,'client controller is bounded');

function buttons(mode, log) {
  return ids.slice(0,3).map((id) => ({
    dataset:{ id }, mode, tabIndex:id === 'a' ? 0 : -1,
    scrollIntoView:(options)=>log.push(`${mode}:scroll:${id}:${options.block}:${options.inline}`),
    focus:(options)=>log.push(`${mode}:focus:${id}:${options.preventScroll}`)
  }));
}

for (const mode of ['tabs','cards']) {
  const log = [], destinations = buttons(mode,log);
  assert.deepStrictEqual(applyDestinationVisibility(destinations,'b',''),{revealed:true,focused:false});
  assert.deepStrictEqual(log,[`${mode}:scroll:b:nearest:nearest`],`${mode} canonical pointer/slider/arrow selection reveals without focus`);
  assert.strictEqual(destinations[0].tabIndex,0,'non-keyboard reveal preserves the server-selected roving tab stop');
}

for (const route of ['pointer','slider','arrow']) {
  const log=[];
  applyDestinationVisibility(buttons(route,log),'c','');
  assert.deepStrictEqual(log,[`${route}:scroll:c:nearest:nearest`],`${route} uses the same canonical visibility behavior`);
}

const keyboardLog=[], keyboardButtons=buttons('keyboard',keyboardLog);
assert.deepStrictEqual(applyDestinationVisibility(keyboardButtons,'c','c'),{revealed:true,focused:true});
assert.deepStrictEqual(keyboardLog,['keyboard:scroll:c:nearest:nearest','keyboard:focus:c:true'],'keyboard visibility scrolls before no-scroll focus');
assert.deepStrictEqual(keyboardButtons.map((item)=>item.tabIndex),[-1,-1,0],'keyboard focus establishes exactly one roving tab stop');
const staleLog=[];
assert.deepStrictEqual(applyDestinationVisibility(buttons('stale',staleLog),'unknown','unknown'),{revealed:false,focused:false});
assert.deepStrictEqual(staleLog,[],'unknown host ids fail closed');

console.log('Authoring navigation client handles Tabs/Cards keys, canonical reveal and keyboard-only focus');
