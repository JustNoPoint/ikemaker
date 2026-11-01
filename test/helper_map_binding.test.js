'use strict';
const assert=require('assert');
const {hash}=require('../src/mutation_safety');
const {existingBindings,planHelperMapInitializer}=require('../src/helper_map_binding');
const entry={id:'maps\0mode',category:'maps',name:'Mode',assigned:true,status:'read / write'};
const component=(syntax,text)=>({kind:'helper',syntax,stableId:'helper-1',sourceHash:hash('file'),rangeHash:hash(text),sourceText:text});

const zss='helper{\r\n\tname: "Core"; # keep\r\n\tid: 7000;\r\n}';
const add=planHelperMapInitializer(component('zss',zss),entry,{mode:'add',value:'const(Data.Scale)'});
assert(Object.isFrozen(add)&&Object.isFrozen(add.bindingsAfter));
assert.strictEqual(add.operation,'add');assert.strictEqual(add.receiver,'spawned Helper map');
assert.match(add.after,/id: 7000;\r\n\tmap\.Mode: const\(Data\.Scale\);\r\n}/);assert.match(add.after,/# keep/);assert(!add.after.includes('\n')||add.after.includes('\r\n'));

const current='helper { name: "Core"; map.Mode: 1; id: 7000 }';
const replace=planHelperMapInitializer(component('zss',current),entry,{mode:'replace',value:'2 + map(Bonus)'});
assert.strictEqual(replace.operation,'replace');assert.strictEqual(replace.after,'helper { name: "Core"; map.Mode: 2 + map(Bonus); id: 7000 }');
assert.throws(()=>planHelperMapInitializer(component('zss',current),entry,{mode:'add',value:'2'}),/Explicitly choose Replace/);

const cns='[State Core]\n; preserve\ntype = Helper\ntrigger1 = time = 0\nid = 7000';
const cnsAdd=planHelperMapInitializer(component('cns',cns),entry,{mode:'add',value:'2'});assert.match(cnsAdd.after,/id = 7000\nmap\.Mode = 2$/);assert.match(cnsAdd.after,/; preserve/);
const cnsCurrent='[State Core]\r\ntype = Helper\r\nmap.mode = 1 ; keep this\r\nid = 7000';
const cnsReplace=planHelperMapInitializer(component('cns',cnsCurrent),entry,{mode:'replace',value:'3'});assert.strictEqual(cnsReplace.after,'[State Core]\r\ntype = Helper\r\nmap.mode = 3 ; keep this\r\nid = 7000');
assert.deepStrictEqual(existingBindings(cnsReplace.after,'cns').map(item=>[item.name,item.value]),[['mode','3']]);

for(const text of ['helper{map.Mode:1;map.mode:2}','helper{if time { map.Mode: 1; }}','helper{'])assert.throws(()=>planHelperMapInitializer(component('zss',text),entry,{mode:text.includes('map.')?'replace':'add',value:'1'}),/duplicate|ambiguous|isolate/i);
assert.throws(()=>planHelperMapInitializer(component('cns','[State]\ntype=Helper\ntype=Helper'),entry,{mode:'add',value:'1'}),/isolate/);
assert.throws(()=>planHelperMapInitializer(component('zss',zss),entry,{mode:'add',value:'"nightly"'}),/Nightly/);
assert.throws(()=>planHelperMapInitializer(component('zss',zss),entry,{mode:'add',value:'1\n2'}),/control-free/);
for(const value of ['1; id: 999','1} destroySelf{} #','helper{id:2}','notNumeric','1 // escape','1 /* escape */','1 := 2','(1 + 2'])assert.throws(()=>planHelperMapInitializer(component('zss',zss),entry,{mode:'add',value}),/expression|parentheses|numeric/i,value);
for(const value of ['1; id = 999','1\r\ntype = DestroySelf','helper{id:2}','notNumeric','1 /* escape */','1 = 2'])assert.throws(()=>planHelperMapInitializer(component('cns',cns),entry,{mode:'add',value}),/expression|control|numeric/i,value);
assert.throws(()=>planHelperMapInitializer({...component('zss',zss),rangeHash:'stale'},entry,{mode:'add',value:'1'}),/stale/);
assert.throws(()=>planHelperMapInitializer(component('zss',zss),{...entry,assigned:false},{mode:'add',value:'1'}),/exact assigned/);
console.log('Helper map initializer plans preserve exact controllers and reject ambiguous or unverified authoring');
