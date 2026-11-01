'use strict';
const assert=require('assert'),life=require('../src/palette_workshop_ab_lifecycle').runtime();
let staleRestores=0;const first=life.begin();life.register(first,()=>{staleRestores+=1});assert.strictEqual(life.current(first),true);
const emptyRerender=life.begin();assert.strictEqual(life.current(first),false,'a later render invalidates the prior animation loop before payload checks');assert.strictEqual(life.current(emptyRerender),true);life.restore();assert.strictEqual(staleRestores,0,'a no-A/B rerender clears the detached hold restoration callback');
console.log('Palette Workshop A/B lifecycle invalidates detached animation and hold callbacks on every render');
