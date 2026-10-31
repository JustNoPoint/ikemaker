'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const triggers=require('../data/triggers.json');
const {hoverModel}=require('../src/language_intelligence');
const {pickerItems,parameterLabels}=require('../src/trigger_expression_picker');
const entry=triggers.find(item=>item.name==='EnvShakeVar');
assert.strictEqual(entry.kind,'trigger');
assert.match(entry.arguments,/\bdir\b/);
assert.deepStrictEqual(parameterLabels(entry),['param_name']);
const item=pickerItems(triggers).find(item=>item.label==='EnvShakeVar');
assert.strictEqual(item.template,'EnvShakeVar(${1:param_name})');
assert.match(item.detail,/time, freq, ampl, dir/);
assert.match(item.detail,/base shake direction in degrees as a float/);
const hover=hoverModel({word:'EnvShakeVar',text:'trigger1 = EnvShakeVar(dir)',line:0,languageId:'cns',experience:'learning',triggers});
assert(hover&&/\bdir\b/.test(hover.summary+' '+hover.explanation));
for(const file of ['wiki-source/Triggers-(new).md','wiki/Triggers-(new).html','merged/triggers.html']){
 const text=fs.readFileSync(path.join(__dirname,'../data/offline-docs/reference',file),'utf8');
 assert.match(text,/Valid values are: time, freq, ampl, dir/);
 assert.match(text,/EnvShakeVar\(dir\)/);
 assert.match(text,/OC_ex2_envshakevar_dir/);
 assert.match(text,/PushF\(sys\.envShake\.dir\)/);
 for(const revision of ['81c6da71d689625e20db79586815b695da00dd6d','ee4791bcd5e2f4bcb16ef9d584e001fb4a7eedfc'])assert(text.includes(revision));
}
console.log('EnvShakeVar dir metadata, hover, insertion and offline reference checks passed');
