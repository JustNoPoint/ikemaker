'use strict';
const assert=require('assert'),hold=require('../src/palette_workshop_ab_hold').runtime();
const control={setPointerCapture(id){this.capture=id}},states=[];hold.bind(control,()=>states.push('A'),()=>states.push('B'));
control.onkeydown({key:' ',preventDefault(){}});control.onblur();control.onkeyup({key:' ',preventDefault(){}});assert.deepStrictEqual(states,['A','B','B'],'keyboard focus loss restores B before a keyup delivered elsewhere');
states.length=0;control.onpointerdown({pointerId:7,preventDefault(){}});assert.strictEqual(control.capture,7);control.onpointercancel();assert.deepStrictEqual(states,['A','B'],'pointer cancellation restores B');
states.length=0;control.onpointerdown({pointerId:8,preventDefault(){}});control.onlostpointercapture();assert.deepStrictEqual(states,['A','B'],'lost capture restores B');
console.log('Palette Workshop A/B hold control restores the draft on keyboard focus loss and pointer cancellation');
