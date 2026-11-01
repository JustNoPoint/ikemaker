'use strict';

const assert=require('assert'),path=require('path');
const {exactStateSources}=require('../src/exact_state_sources');
const def=path.resolve('C:/chars/Hero/Hero.def'),text='[Files]\ncmd = Hero.cmd\ncns = constants.cns\nst = states.cns\nst0 = normals.zss\nstcommon = common1.cns\nanim = Hero.air\n';
const sources=exactStateSources(def,text,{existsSync:()=>false});
assert.deepStrictEqual(sources.map(item=>path.basename(item)),['states.cns','normals.zss','common1.cns']);
assert(!sources.some(item=>/Hero\.cmd|constants\.cns/i.test(item)),'command and constants assignments are not admitted as exact state sources');
assert.deepStrictEqual(exactStateSources(def,'[Info]\nname = Hero\n'),[]);
console.log('Exact state-source authority admits only current st/stN/stcommon assignments');
