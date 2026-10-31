'use strict';
const assert=require('assert'),path=require('path');
const {missingFileIssues}=require('../src/def_file_diagnostics');
const filename=path.resolve('character','Ryu.def'),source='[Info]\nname = "Ryu"\n[Files]\nsprite = Sf6Ryu.sff\nst = code/normal.zss ; exact source\ncmd = "input.cmd"\nnotes = generated.jnp\nignored = dynamic, list\n[Map]\nFake = missing.txt\n',existing=new Set([path.resolve('character','Sf6Ryu.sff').toLowerCase(),path.resolve('character','input.cmd').toLowerCase()]);
const issues=missingFileIssues(source,filename,target=>existing.has(path.resolve(target).toLowerCase()));
assert.deepStrictEqual(issues.map(item=>[item.line,item.code,item.severity]),[[4,'missing-def-file','error'],[6,'missing-def-file','error']],'only exact missing scalar [Files] assignments are diagnosed');
assert(issues[0].message.includes('code/normal.zss')&&issues.every(item=>item.help.includes('will not create')),'diagnostics preserve the authored relative path and state the no-write boundary');
assert.deepStrictEqual(missingFileIssues(source,'not-a-def.txt',()=>false),[],'non-DEF documents are ignored');
console.log('Character DEF missing-file diagnostics are exact, bounded, and non-mutating');
