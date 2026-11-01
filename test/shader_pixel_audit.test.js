'use strict';

const assert=require('assert');
const {createShaderProject,setSafeguard}=require('../src/shader_workshop_model');
const {auditShaderPixels,MAX_AUDIT_PIXELS}=require('../src/shader_pixel_audit');
const source=Uint8Array.from([10,20,30,255, 40,50,60,128, 0,0,0,0, 70,80,90,255]);
let report=auditShaderPixels(createShaderProject({id:'audit',now:1}),source,source,2,2);assert(report.passed);assert(report.rules.every(rule=>rule.status==='passed'));
const changed=Uint8Array.from(source);changed[0]=11;changed[7]=64;changed.set([1,2,3,255],8);
report=auditShaderPixels(createShaderProject({id:'audit',now:1}),source,changed,2,2);assert(!report.passed);
const byId=Object.fromEntries(report.rules.map(rule=>[rule.id,rule]));assert.strictEqual(byId.preservePaletteColors.violations,1);assert.strictEqual(byId.preservePartialAlpha.violations,1);assert.strictEqual(byId.preserveTransparentPixels.violations,1);assert.strictEqual(byId.preserveSpriteSilhouette.violations,1);assert.deepStrictEqual(byId.preservePaletteColors.samples[0].source,[10,20,30,255]);
const relaxed=setSafeguard(createShaderProject({id:'audit',now:1}),'preservePaletteColors',false,2),rgbOnly=Uint8Array.from(source);rgbOnly[0]=99;report=auditShaderPixels(relaxed,source,rgbOnly,2,2);assert(report.passed);assert.strictEqual(report.rules.find(rule=>rule.id==='preservePaletteColors').status,'advisory');
assert.throws(()=>auditShaderPixels(relaxed,new Uint8Array(4),new Uint8Array(4),MAX_AUDIT_PIXELS+1,1),/dimensions/);assert.throws(()=>auditShaderPixels(relaxed,new Uint8Array(3),new Uint8Array(4),1,1),/Source pixels/);
console.log('Shader pixel audit verifies palette RGB, transparency, partial alpha, and silhouette on bounded RGBA frames');
