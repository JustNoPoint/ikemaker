'use strict';
const assert=require('assert');
const {maskedSource,callOccurrences,callAtOffset,argumentPositionAt,replacementPlan}=require('../src/trigger_call_context');

const names=new Set(['EnvShakeVar','Clamp','Atan2']);
const source=`changeState{\n  trigger: EnvShakeVar(ampl) > 0 && stateNo != [3050, 3100);\n  value: Clamp(Atan2(y, x), -1, 1); # EnvShakeVar(time)\n  note: "EnvShakeVar(freq)";\n}`;
const calls=callOccurrences(source,names,'zss');
assert.deepStrictEqual(calls.map(call=>call.name),['EnvShakeVar','Clamp','Atan2'],'only real calls are discovered; comments and strings remain inert');
const env=calls[0];assert.strictEqual(env.arguments.length,1);assert.strictEqual(env.arguments[0].text,'ampl');
assert.strictEqual(callAtOffset(source,names,source.indexOf('ampl')+1,'zss').name,'EnvShakeVar');
const nested=callAtOffset(source,names,source.indexOf('y, x')+1,'zss');assert.strictEqual(nested.name,'Atan2','the innermost exact call owns a cursor inside nested arguments');
assert.strictEqual(argumentPositionAt(nested,source.indexOf('x')),1);
const plan=replacementPlan(source,env,{position:0},'dir');assert.strictEqual(plan.preview,'EnvShakeVar(dir)');
assert.strictEqual(source.slice(0,plan.start)+plan.value+source.slice(plan.end),source.replace('EnvShakeVar(ampl)','EnvShakeVar(dir)'));
const halfOpen='Clamp(stateNo != [3050, 3100), 0, 1)';const half=callOccurrences(halfOpen,names,'zss')[0];assert.strictEqual(half.arguments.length,3,'half-open range punctuation is not misdiagnosed as a call boundary');
assert.strictEqual(maskedSource('; EnvShakeVar(time)\nEnvShakeVar(freq)','ikemen-cns').includes('time'),false,'CNS semicolon comments are masked');
assert.strictEqual(callAtOffset('EnvShakeVar(time) + EnvShakeVar(freq)',names,18,'zss'),null,'line fallback rejects an ambiguous line');
console.log('Trigger-call context resolves exact nested calls, preserves half-open ranges, and produces bounded replacement plans');
