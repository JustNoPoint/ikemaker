'use strict';

const assert=require('assert');
const vm=require('vm');
const {clientScript}=require('../src/move_lab_direct_component');

const script=clientScript();
for(const required of ['data-projectile-state-route',"type:'openProjectileStateRoute'",'data-projectile-authored-value','syncProjectileExactLinks','Restore this authored value before exact source navigation.'])assert(script.includes(required),`missing Projectile exact-state client contract: ${required}`);
const start=script.indexOf('function syncProjectileExactLinks('),end=script.indexOf('\n function validReturn',start);assert(start>=0&&end>start);
const sandbox={};vm.runInNewContext(`${script.slice(start,end)}\nthis.syncProjectileExactLinks=syncProjectileExactLinks;`,sandbox);

function row(value,routes){
 const input={value},buttons=routes.map(([kind,route,title])=>({disabled:false,title,dataset:{[kind]:route}}));
 return{dataset:{projectileAuthoredValue:value},input,buttons,querySelector:()=>input,querySelectorAll:()=>buttons};
}
const stateRoute='a'.repeat(48),resourceRoute='b'.repeat(48),p1=row('500',[['projectileStateRoute',stateRoute,'Open State 500'],['projectileResourceRoute',resourceRoute,'Open related resource']]),p2=row('600',[['projectileStateRoute','c'.repeat(48),'Open State 600']]);
sandbox.syncProjectileExactLinks(p1);sandbox.syncProjectileExactLinks(p2);assert(p1.buttons.every(button=>!button.disabled));assert(!p2.buttons[0].disabled);
p1.input.value='501';sandbox.syncProjectileExactLinks(p1);assert(p1.buttons.every(button=>button.disabled),'one changed row disables both state and resource exact links');assert(!p2.buttons[0].disabled,'sibling state row remains independent');assert.strictEqual(p1.buttons[0].dataset.projectileStateRoute,stateRoute);assert.strictEqual(p1.buttons[1].dataset.projectileResourceRoute,resourceRoute);
p1.input.value='500';sandbox.syncProjectileExactLinks(p1);assert(p1.buttons.every(button=>!button.disabled));assert.strictEqual(p1.buttons[0].title,'Open State 500');assert.strictEqual(p1.buttons[1].title,'Open related resource');
console.log('Move Lab Projectile exact-link client keeps state/resource navigation row-local and authored-snapshot truthful');
