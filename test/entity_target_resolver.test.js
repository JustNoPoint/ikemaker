'use strict';

const assert = require('assert');
const path = require('path');
const { resolveEntityTargets, targetsStillCurrent } = require('../src/entity_target_resolver');

function fakeFs(records) {
  const normalized = new Map(Object.entries(records).map(([filename, value]) => [path.resolve(filename).toLowerCase(), value]));
  return {
    statSync(filename) { const record=normalized.get(path.resolve(filename).toLowerCase());if(!record)throw new Error('ENOENT');return{size:Buffer.byteLength(record.text||''),mtimeMs:record.modifiedMs||1,isFile:()=>record.file!==false}; },
    readFileSync(filename) { const record=normalized.get(path.resolve(filename).toLowerCase());if(!record)throw new Error('ENOENT');return record.text; },
    existsSync(filename) { return normalized.has(path.resolve(filename).toLowerCase()); }
  };
}

const normal=path.resolve('C:/game/chars/Ryu/normal.def'),alternate=path.resolve('C:/game/chars/Ryu/alternate.def');
const files={
  [normal]:{modifiedMs:11,text:'[Files]\nsprite = normal.sff\nanim = normal.air\nsound = normal.snd\ncns = normal.cns\nst0 = normal.zss\nstcommon = common.zss\n'},
  [alternate]:{modifiedMs:12,text:'[Files]\nsprite = alternate.sff\nanim = alternate.air\nsound = alternate.snd\ncns = alternate.cns\n'},
  'C:/game/chars/Ryu/normal.sff':{text:'sff'},'C:/game/chars/Ryu/normal.air':{text:'air'},'C:/game/chars/Ryu/normal.snd':{text:'snd'},'C:/game/chars/Ryu/normal.cns':{text:'cns'},'C:/game/chars/Ryu/normal.zss':{text:'zss'},'C:/game/data/common.zss':{text:'zss'},
  'C:/game/chars/Ryu/alternate.sff':{text:'sff'},'C:/game/chars/Ryu/alternate.air':{text:'air'},'C:/game/chars/Ryu/alternate.snd':{text:'snd'},'C:/game/chars/Ryu/alternate.cns':{text:'cns'}
},fs=fakeFs(files);
const a=resolveEntityTargets({kind:'character',identity:'normal',ownerFile:normal},{fs}),b=resolveEntityTargets({kind:'character',identity:'alternate',ownerFile:alternate},{fs});
assert.strictEqual(a.sff.filename,path.resolve('C:/game/chars/Ryu/normal.sff'));
assert.strictEqual(b.sff.filename,path.resolve('C:/game/chars/Ryu/alternate.sff'),'same-folder DEF variants resolve only their own exact assignments');
assert(a.code.some(item=>item.filename.endsWith('normal.zss'))&&a.code.some(item=>item.filename===normal),'coding targets retain the exact owner and its assigned sources');
assert(a.code.some(item=>item.filename===path.resolve('C:/game/data/common.zss')),'exact code resolution follows the engine-aware STCommon search instead of inventing a character-local path');
assert(Object.isFrozen(a)&&Object.isFrozen(a.sff)&&Object.isFrozen(a.code));
assert.strictEqual(targetsStillCurrent(a,{fs}),true);
files[normal].modifiedMs=99;
const changed=fakeFs(files);
assert.strictEqual(targetsStillCurrent(a,{fs:changed}),false,'adapter validation rejects a changed exact owner snapshot');
const dirty=resolveEntityTargets({kind:'character',identity:'dirty',ownerFile:normal},{fs,readOwnerText:()=>({text:files[alternate].text,version:7})});
assert.strictEqual(dirty.sff.filename,path.resolve('C:/game/chars/Ryu/alternate.sff'),'an exact open dirty DEF projection takes precedence over stale disk assignments');
assert.strictEqual(dirty.ownerRevision.open,true);assert.strictEqual(targetsStillCurrent(dirty,{fs,readOwnerText:()=>({text:files[alternate].text,version:7})}),true);
assert.strictEqual(targetsStillCurrent(dirty,{fs,readOwnerText:()=>({text:files[normal].text,version:8})}),false,'dirty owner validation is hash-bound');
const missing=resolveEntityTargets({kind:'character',identity:'missing',ownerFile:path.resolve('C:/game/chars/Ryu/missing.def')},{fs:fakeFs({'C:/game/chars/Ryu/missing.def':{text:'[Files]\nanim = missing.air'}})});
assert.strictEqual(missing.sff.available,false);assert.strictEqual(missing.air.available,false);
const stage=resolveEntityTargets({kind:'stage',identity:'stage',ownerFile:path.resolve('C:/game/stages/arena.def')},{fs:fakeFs({'C:/game/stages/arena.def':{text:'[Camera]'}})});
assert.strictEqual(stage.stage.available,true);assert.deepStrictEqual(stage.code,[path.resolve('C:/game/stages/arena.def')]);
console.log('Exact entity target resolution keeps same-folder DEF variants separate and validates immutable owner snapshots');
