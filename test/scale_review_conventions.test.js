'use strict';
const assert=require('assert');
const conventions=require('../src/scale_review_conventions');
const spatial=require('../src/spatial_authoring_model');
const helper=require('../src/helper_authoring_model');
const state={value:{},get(key,fallback){return this.value[key]??fallback;},async update(key,value){this.value[key]=value;}};
const context={workspaceState:state};
(async()=>{await conventions.write(context,{explod:'follow',helper:'fixed',projectile:'invalid',unknown:'follow'});assert.deepStrictEqual({...conventions.read(context)},{explod:'follow',helper:'fixed'});assert.strictEqual(conventions.projection(context,'explod').appliesTo,'newly authored effects only');assert.strictEqual(conventions.projection(context,'explod').enforced,false);const explod=spatial.generateExplod(spatial.newExplod({scalePolicy:conventions.projection(context,'explod').policy})),spawn=helper.generateHelper(helper.newHelper({scalePolicy:conventions.projection(context,'helper').policy}));assert.match(explod.code,/scale convention: follow.*not runtime enforcement/i);assert.match(spawn.code,/scale convention: fixed.*not runtime enforcement/i);assert.strictEqual(spatial.newExplod().scalePolicy,'');assert.strictEqual(helper.newHelper().scalePolicy,'');console.log('Scale conventions are explicit, bounded, workspace-owned, and consumed only by new generation');})().catch(error=>{console.error(error);process.exitCode=1;});
