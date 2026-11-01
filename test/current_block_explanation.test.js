'use strict';

const assert=require('assert');
const path=require('path');
const crypto=require('crypto');
const {buildCurrentBlockExplanation,boundedCatalogMembership,LIMITS}=require('../src/current_block_explanation');

const filename=path.resolve('fixtures','current-block','fighter.zss');
const text=`[StateDef 200]
if command = "secret-command" {
  ChangeState {
    value: 201;
  }
}

[Function Check(value)]
while value {
  call MissingFunction(value);
}
`;
const hash=crypto.createHash('sha256').update(text).digest('hex');
const catalog={complete:true,known:{functions:['Check'],states:['200'],commands:[]}};
const diagnostics=[
  {startLine:0,endLine:2,severity:'Error',code:'unsupported-nightly-string',message:'Unsupported <nightly> value'},
  {startLine:99,endLine:99,severity:'Warning',code:'outside',message:'outside'}
];

const controller=buildCurrentBlockExplanation({filename,text,line:3,version:7,fingerprint:hash,catalog,diagnostics,target:{channel:'stable',version:'1.0'},nightlyStringsEnabled:false});
assert(controller.ok&&controller.node.kind==='controller','the smallest supported nested block owns the explanation');
assert(!JSON.stringify(controller).includes('secret-command'),'authored string literal contents never enter the explanation projection');
assert.strictEqual(controller.nightlyStringsEnabled,false);
assert(controller.diagnostics.some(item=>item.code==='unsupported-nightly-string'),'stable retains the precise authored compatibility Problem intersecting the block');
assert(!controller.diagnostics.some(item=>item.code==='outside'),'non-intersecting diagnostics are omitted');

const loop=buildCurrentBlockExplanation({filename,text,line:9,version:7,catalog,diagnostics:[],target:{channel:'nightly',commit:'a'.repeat(40)},nightlyStringsEnabled:true});
assert(loop.ok&&loop.node.kind==='loop');
assert(loop.dependencies.some(item=>item.kind==='functions'&&item.value==='MissingFunction'&&item.unresolved),'complete assigned catalog permits a bounded unresolved literal reference');
const unknown=buildCurrentBlockExplanation({filename,text,line:9,version:7,catalog:{complete:false,known:{}},diagnostics:[]});
assert(unknown.dependencies.some(item=>item.value==='MissingFunction'&&!item.unresolved&&/unknown/.test(item.status)),'incomplete catalog labels resolution unknown instead of claiming a missing reference');

const cns=buildCurrentBlockExplanation({filename:path.resolve('fighter.cns'),text:'[StateDef 10]\n[State 10, Stop]\ntype = VelSet\ntriggerall = 0\nx = 0\n',line:3,version:1,catalog:{complete:false},diagnostics:[]});
assert(cns.ok&&cns.node.kind==='condition','CNS trigger line resolves to the smallest condition');
const lua=buildCurrentBlockExplanation({filename:path.resolve('screen.lua'),text:'function menu()\n  if ready then\n    return true\n  end\nend\n',line:1,version:1,catalog:{complete:false},diagnostics:[]});
assert(lua.ok&&lua.node.kind==='condition','Lua conditional blocks are supported without inventing gameplay reachability');

assert.strictEqual(buildCurrentBlockExplanation({filename,text,line:200}).ok,false,'no containing supported block fails closed');
assert.strictEqual(buildCurrentBlockExplanation({filename,text:'x'.repeat(LIMITS.sourceBytes+1),line:0}).ok,false,'oversized source fails closed');
assert.strictEqual(buildCurrentBlockExplanation({filename,text,line:0,fingerprint:'0'.repeat(64)}).ok,false,'stale source fingerprint fails closed');
assert.throws(()=>buildCurrentBlockExplanation({filename,text:'[StateDef 1]\n',line:0,catalog:{complete:false},diagnostics:Array.from({length:256},()=>({line:0,code:'x',message:'m'.repeat(2048)}))}),/128 KiB|projection limit/);
assert.strictEqual(buildCurrentBlockExplanation({filename,text:`[StateDef 1]\n${'if 1 {\n'.repeat(129)}${'}\n'.repeat(129)}`,line:0,catalog:{complete:false},diagnostics:[]}).ok,false,'hostile nesting fails closed before recursive structure flattening');
assert.strictEqual(buildCurrentBlockExplanation({filename,text:`[StateDef 1]\n${'value := 1; if 1 {\n'.repeat(129)}${'}\n'.repeat(129)}`,line:0,catalog:{complete:false},diagnostics:[]}).ok,false,'ZSS semicolon-separated statements cannot bypass the hostile nesting guard');
const incompleteDiagnostics=buildCurrentBlockExplanation({filename,text,line:3,catalog:{complete:false},diagnostics:[],diagnosticsComplete:false,diagnosticsOmittedCount:7});
assert.strictEqual(incompleteDiagnostics.diagnosticsComplete,false);assert(/incomplete/.test(incompleteDiagnostics.note)&&!/No confirmed local blocker/.test(incompleteDiagnostics.note),'bounded diagnostic omission never produces a clean claim');
const boundedCatalog=boundedCatalogMembership(Array.from({length:4097},(_,index)=>({category:'functions',declarations:1,name:`Fn${index}`})),true);
assert.strictEqual(boundedCatalog.complete,false,'catalog declaration truncation makes resolution incomplete');assert.strictEqual(boundedCatalog.known.functions.length,4096);

console.log('current block explanation resolves bounded nested structure, evidence, diagnostics, capability privacy, and fail-closed limits');
