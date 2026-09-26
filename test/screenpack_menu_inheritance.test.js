 'use strict';
const assert=require('assert');
const {parseDef}=require('../src/def_model');
const {screenpackModel}=require('../src/screenpack_model');
const model=screenpackModel(parseDef('[Info]\nlocalcoord = 320,240\n[Title Info]\nmenu.pos = 159,165\nmenu.item.font = 4,0,0\nmenu.item.font.scale = 0.8,0.8\nmenu.item.active.font = 5,0,0\nmenu.item.active.font.scale = 1,1\n'));
const elements=model.screens[0].elements;
assert.deepStrictEqual(elements.map(x=>x.name),['menu','menu.item']);
assert.deepStrictEqual(elements[0].position,[159,165]);
assert.strictEqual(elements[1].font,'4,0,0');
assert.strictEqual(elements[1].properties['active.font'],'5,0,0');
assert.deepStrictEqual(elements[1].scale,[0.8,0.8]);
console.log('Screenpack menu grouping tests passed');

const root=screenpackModel(parseDef('[Select Info]\n pos=119,20\np1.name.font=5,0,1\np1.name.done.font=5,0,1\n')).screens[0].elements;
assert.strictEqual(root[0].base,'');
assert.deepStrictEqual(root.map(x=>x.name),['select info','p1.name']);
assert.strictEqual(root[1].properties['done.font'],'5,0,1');
