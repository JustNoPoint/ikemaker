'use strict';
const assert = require('assert');
const model = require('../src/workspace_preset_model');

const preset = model.relativeFiles({ name: 'Ryu Coding', files: [{ file: 'D:\\Game\\chars\\Ryu\\Ryu.def', group: 2, active: true }] }, 'D:\\Game');
assert.equal(preset.id, 'ryu-coding'); assert.equal(preset.files[0].file, 'chars/Ryu/Ryu.def'); assert.equal(preset.files[0].group, 2);
const restored = model.resolveFiles(preset, 'D:\\Game'); assert(restored.files[0].file.toLowerCase().endsWith('chars\\ryu\\ryu.def'));
let store = model.upsert({}, preset); assert.equal(store.presets.length, 1); store = model.upsert(store, { ...preset, name: 'Updated' }); assert.equal(store.presets[0].name, 'Updated');
assert.equal(model.remove(store, 'ryu-coding').presets.length, 0);
console.log('Workspace preset model tests passed');

const typed=model.relativeFiles({name:'Animation',files:[{file:'D:\\Game\\chars\\Ryu\\Ryu.air',kind:'air',reference:{group:200,frameIndex:1,file:'D:\\Game\\chars\\Ryu\\Ryu.cmd'},archiveContext:{ownerDef:'D:\\Game\\chars\\Ryu\\Ryu.def',prefix:'f'},group:50}]},'D:\\Game');
const moved=model.resolveFiles(typed,'E:\\Moved');
assert.equal(moved.files[0].kind,'air');assert.equal(moved.files[0].group,9);
assert.equal(moved.files[0].reference.group,200);
assert.equal(moved.files[0].reference.file,'E:\\Moved\\chars\\Ryu\\Ryu.cmd');
assert.equal(moved.files[0].archiveContext.ownerDef,'E:\\Moved\\chars\\Ryu\\Ryu.def');
assert.equal(model.normalizeFile({file:'legacy.air'}).kind,'auto');
assert.equal(model.normalizeFile({file:'source.air',kind:'text'}).kind,'text');

const health=model.relativeFiles({name:'Health',files:[{file:'D:\\Game\\hero.def',kind:'character_health',reference:{extraFiles:['D:\\Game\\extra.zss'],findings:[{file:'D:\\Game\\extra.zss',line:4}],file:'D:\\Game\\extra.zss'}}]},'D:\\Game');
const healthMoved=model.resolveFiles(health,'E:\\Moved');assert.equal(healthMoved.files[0].reference.extraFiles[0],'E:\\Moved\\extra.zss');assert.equal(healthMoved.files[0].reference.findings[0].file,'E:\\Moved\\extra.zss');
