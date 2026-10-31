'use strict';

const assert=require('assert');
const path=require('path');
const {createBrowserRegistry}=require('../src/authoring_browser_registry');
const {createAuthoringBrowserWorkspace,MESSAGE_TYPES}=require('../src/authoring_browser_workspace');

const empty={};for(const id of ['code-navigator','project-data','recipes','similar-code','controllers','problems'])empty[id]={read:()=>({items:[]})};
(async()=>{
  const intents=[],root=path.resolve('fixtures','block-workspace'),filename=path.join(root,'fighter.zss'),workspace=createAuthoringBrowserWorkspace({registry:createBrowserRegistry(empty),onIntent:intent=>intents.push(intent)});
  await workspace.open({identity:'ryu',root,files:[filename]});
  const authority=()=>({contextEpoch:workspace.snapshot().contextEpoch,generation:workspace.snapshot().generation});
  const explanation={schema:'ikemaker.current-block-explanation',version:1,ok:true,id:'a'.repeat(64),filename,fingerprint:'b'.repeat(64),node:{kind:'state',title:'State <script>alert(1)</script>',purpose:'State purpose',startLine:2,endLine:8},structure:{counts:{controller:1},conditions:[{id:'condition',line:3,label:'if & ready'}],actions:[{id:'action',line:4,kind:'controller',label:'ChangeState'}]},dependencies:[{id:'dependency',label:'StateDef',value:'201',status:'resolution unknown'}],diagnostics:[{id:'diagnostic',severity:'Error',code:'missing-state',message:'Missing <201>',meaning:'No exact declaration.',steps:['Review & confirm.'],source:{filename,line:4,endLine:4,fingerprint:'b'.repeat(64)}}],catalogComplete:false,note:'Static only.'};
  assert.strictEqual(workspace.showBlockExplanation(explanation,{contextEpoch:9,generation:9}),false,'foreign authority cannot install an explanation');
  assert.strictEqual(workspace.showBlockExplanation(explanation,authority()),true);
  const html=workspace.html();assert(html.includes('Explain Current Block')&&html.includes('Why might this not run?')&&html.includes('&lt;script&gt;alert(1)&lt;/script&gt;')&&!html.includes('<script>alert(1)</script>'),'the bounded child view escapes hostile authored and diagnostic text');
  const stale=workspace.snapshot().generation-1;
  assert.strictEqual(workspace.handleMessage({type:'open-block-explanation-source',generation:stale,routeId:'diagnostic'}),false,'stale generation cannot replay an old route');
  assert.strictEqual(workspace.handleMessage({type:'open-block-explanation-source',generation:workspace.snapshot().generation,routeId:'forged'}),false,'forged route IDs fail closed');
  const opened=workspace.handleMessage({type:'open-block-explanation-source',generation:workspace.snapshot().generation,routeId:'diagnostic'});assert.strictEqual(opened.type,'open-block-explanation-source');assert.strictEqual(opened.source.filename,filename);assert.strictEqual(opened.source.fingerprint,'b'.repeat(64));
  assert.strictEqual(workspace.handleMessage({type:'open-block-explanation-source',generation:workspace.snapshot().generation,routeId:'diagnostic'}),false,'a consumed route ID cannot be replayed from the same rendered model');
  assert.strictEqual(workspace.handleMessage({type:'open-block-explanation-source',generation:workspace.snapshot().generation,routeId:'diagnostic',source:{filename:'forged'}}),false,'the webview cannot inject a source route');
  assert.strictEqual(workspace.handleMessage({type:'write-current-block',generation:workspace.snapshot().generation}),false);assert(!MESSAGE_TYPES.some(type=>/write|apply|save|generate|delete/.test(type)),'current-block view has no mutation message');
  workspace.setCapability({nightlyStringsEnabled:true,target:{channel:'nightly',commit:'c'.repeat(40)}});assert.strictEqual(workspace.snapshot().blockExplanation,null,'target capability change revokes the prior explanation');
  assert.strictEqual(workspace.showBlockExplanation(explanation,authority()),true);await workspace.open({identity:'ken',root,files:[path.join(root,'ken.zss')]});assert.strictEqual(workspace.snapshot().blockExplanation,null,'context rebinding revokes the prior explanation');
  assert(intents.some(intent=>intent.type==='open-block-explanation-source'));
  console.log('Coding Assistance current-block child view rejects stale/forged routes, escapes text, revokes target/context state, and exposes no mutation surface');
})().catch(error=>{console.error(error);process.exitCode=1;});
