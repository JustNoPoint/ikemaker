'use strict';
const assert = require('assert');
const path = require('path');
const { createBrowserRegistry } = require('../src/authoring_browser_registry');
const { createAuthoringBrowserWorkspace, renderAuthoringBrowserHtml, flattenProviderRows, MESSAGE_TYPES, MAX_RENDERED_ROWS_PER_PROVIDER } = require('../src/authoring_browser_workspace');

function assertToolbar(value,label){assert.strictEqual((value.match(/data-universal-slot=/g)||[]).length,0,label+' delegates the one shared toolbar to Code Navigation');assert.strictEqual((value.match(/acquireVsCodeApi\(\)/g)||[]).length,1,label+' owns one assistance bridge');assert(value.includes('Coding Assistance'));assert(!value.includes('ikemaker-universal-toolbar')&&!value.includes('data-dispatch')&&!value.includes('snd.element.')&&!value.includes('provider-mutation'));}

(async () => {
  const intents=[], states=[], contexts=[], root=path.resolve('fixtures','authoring-browser');
  const registry=createBrowserRegistry({
    'code-navigator':{read:context=>{contexts.push(context);return {items:[{id:'state-200',label:'State 200',kind:'state',status:'ready',sourceLabel:'Ryu code',compatibility:'1.0+',aliases:['standing punch'],description:'Main attack state',source:{filename:'states.zss',line:12}},{id:'escape',label:'Escaped source',source:{filename:'../outside.zss'}}]};}},
    'project-data':{read:context=>{contexts.push(context);return {items:[
      {id:'hero.def',label:'Hero definition',description:'Assigned character',glossary:true,glossaryMetadataId:'c'.repeat(32),glossaryAnnotation:{id:'c'.repeat(32),description:'Character owner',aliases:['hero'],favorite:false}},
      {id:'worked-example-route',label:'Adapt from Similar Code',kind:'worked-example',assistantAction:{id:'focus-similar-code',label:'Open Similar Code'}},
      {id:'forged-action',label:'Untrusted action is inert',kind:'worked-example',assistantAction:{id:'execute-arbitrary-command',label:'Run anything'}},
      {id:'impact-root',label:'Indirect callers of AttackStart',kind:'impact-in',description:'2 calls away',children:[{id:'impact-site',label:'helpers.zss:24',kind:'site',source:{filename:'helpers.zss',line:23}}]}
    ]};}},
    recipes:{read:context=>{contexts.push(context);return {items:[{id:'recipe-normal',label:'Basic Normal Move',description:'Read-only recipe metadata'}]};}},
    'similar-code':{read:context=>{contexts.push(context);return {note:'Compared with State 200.',seed:{label:'State 200',excerpt:'[StateDef 200]\nhitDef{}'},items:[{id:'similar-400',label:'State 400',description:'Related crouching attack',comparison:'reference-only functions: CrouchCommit',excerpt:'[StateDef 400]\nhitDef{}',source:{filename:'crouch.zss',line:20},adaptation:{schema:'ikemaker.similar-code-adaptation-review',reviewId:'a'.repeat(64),mutationAllowed:false,status:'review-only-blocked',languageCompatible:true,rows:[{id:'dependency-state',kind:'states',referenceValue:'400',status:'needs-selection',alternatives:['200'],note:'Review.'}],blockers:['Engine compatibility has not been proven.']}}]};}},
    controllers:{read:context=>{contexts.push(context);throw new Error('controller index unavailable');}},
    problems:{read:context=>{contexts.push(context);return{items:[]};}}
  });
  const workspace=createAuthoringBrowserWorkspace({registry,onIntent:intent=>intents.push(intent),onState:state=>states.push(state)});
  assert.strictEqual(workspace.autoOpen,false); assert.strictEqual(workspace.snapshot().opened,false);
  assert.strictEqual(workspace.handleMessage({type:'write',value:'x'}),false);
  await assert.rejects(workspace.refresh(),/manual-open only/);
  const state=await workspace.open({character:'ryu',root}); assert.strictEqual(state.opened,true); assert.strictEqual(state.failures.length,1);
  const contextsAfterOpen=contexts.length;await workspace.refreshProviders(['problems']);assert.strictEqual(contexts.length,contextsAfterOpen+1,'targeted refresh invokes only its requested provider');assert.strictEqual(workspace.snapshot().providers.find(entry=>entry.id==='code-navigator').data.items[0].label,'State 200','targeted refresh retains unrelated provider results');
  const message=payload=>({...payload,generation:workspace.snapshot().generation});
  const html=workspace.html({nonce:'fixture'}); assertToolbar(html,'initial browser'); assert(html.includes('Code Navigator')); assert(html.includes('Project Data')); assert(html.includes('Similar Code')); assert(html.includes('Compared with State 200.')); assert(html.includes('Controllers')); assert(html.includes('Problems')); assert(html.includes('controller index unavailable')); assert(html.includes('available results remain visible'));
  assert(html.includes('ikemenPrepareClose')&&html.includes('ikemenCloseState'),'Coding Assistance participates in verified character-close checks');
  assert(html.includes('Conservative IKEMEN GO 1.0')&&html.includes('Nightly string tools hidden')&&html.includes('data-message="open-engine-targets"'),'the assistance browser explains conservative capability gating and links to reviewed targets');
  assert(!html.includes('data-message="toggle-string-flow"'),'the 1.0/conservative browser omits the unsupported String Flow section completely');
  assert(html.includes('data-message="toggle-glossary"'),'the compact authored-identifier glossary is available for every engine target');
  assert(html.includes('data-message="toggle-impact-paths"'),'bounded impact paths are available without adding another browser');
  assert(!html.includes('Indirect callers of AttackStart')&&!html.includes('helpers.zss:24'),'indirect paths stay compact and hidden in the normal browser');
  assert(html.includes('State 200')); assert(html.includes('Hero definition')); assert(html.includes('Basic Normal Move')); assert(!html.includes('<pre>'), 'provider DTOs render as actionable rows, not raw JSON');
  assert(html.includes('data-message="selection-intent"')); assert(html.includes('data-message="open-source-intent"')); assert(html.includes('data-provider-id="code-navigator"')); assert(html.includes('data-row-id='));
  assert.strictEqual((html.match(/<button type="button" data-message="selection-intent"/g)||[]).length,7); assert.strictEqual((html.match(/data-message="open-source-intent"/g)||[]).length,2,'only context-bound exact filenames get Open Source');
  assert(html.includes('data-message="assistant-action"')&&html.includes('Open Similar Code')&&html.includes("message.providerId!=='similar-code'"),'known assistant routes render and the client has a bounded Similar Code focus receiver');
  assert(html.includes('Category filter')&&html.includes('Status filter')&&html.includes('Source filter')&&html.includes('Compatibility filter'));
  assert(html.includes('role="tree"')&&html.includes('role="treeitem"')&&html.includes('tabindex="-1"'));
  assert(html.includes('vscode.setState')&&html.includes('vscode?.getState')&&html.includes('setSelectionRange')&&html.includes('window.scrollTo'),'rerenders preserve search focus, caret and scroll');
  assert(html.includes("event.key==='Home'")&&html.includes("event.key==='End'")&&html.includes("event.key==='ArrowDown'"),'bounded result navigation supports keyboard traversal');
  assert(!html.includes('docking_prototype')); assert(!html.includes('autoOpen:true'));
  const codeProvider=state.providers.find(item=>item.id==='code-navigator'), codeRows=flattenProviderRows(codeProvider.id,codeProvider.data,root), codeRow=codeRows[0];
  assert.strictEqual(codeRows[1].source,null,'relative traversal outside the bound context is rejected');
  assert.strictEqual(workspace.handleMessage(message({type:'selection-intent',providerId:'code-navigator',rowId:codeRow.rowId,selection:{id:'forged'}})),false,'extra message fields fail closed');
  const selection=workspace.handleMessage(message({type:'selection-intent',providerId:'code-navigator',rowId:codeRow.rowId})); assert.strictEqual(selection.type,'selection'); assert.strictEqual(selection.selection.id,'state-200');
  assert.strictEqual(workspace.handleMessage(message({type:'open-source-intent',providerId:'code-navigator',rowId:codeRow.rowId,source:{filename:'forged.zss'}})),false,'source DTO injection fails closed');
  const source=workspace.handleMessage(message({type:'open-source-intent',providerId:'code-navigator',rowId:codeRow.rowId})); assert.strictEqual(source.type,'open-source'); assert.strictEqual(source.source.filename,path.resolve(root,'states.zss')); assert.deepStrictEqual(intents,[selection,source]);
  const similarProvider=workspace.snapshot().providers.find(item=>item.id==='similar-code'),similarRow=flattenProviderRows(similarProvider.id,similarProvider.data,root)[0];
  assert.strictEqual(workspace.handleMessage(message({type:'compare-reference',providerId:'similar-code',rowId:'forged'})),false,'comparison cannot inject a result');
  assert.strictEqual(workspace.handleMessage(message({type:'compare-reference',providerId:'similar-code',rowId:similarRow.rowId})),true);
  assert(workspace.html({nonce:'fixture'}).includes('Dependency adaptation review')&&workspace.html({nonce:'fixture'}).includes('Review blockers')&&workspace.html().includes('Create Scratch Draft'),'comparison exposes the bounded zero-write dependency review and native-scratch handoff');
  assert(workspace.html().includes('Current block and working reference')&&workspace.html().includes('reference-only functions: CrouchCommit')&&workspace.html().includes('[StateDef 200]')&&workspace.html().includes('[StateDef 400]'),'comparison keeps meaningful differences and both bounded read-only blocks visible');
  assert.strictEqual(workspace.handleMessage(message({type:'create-adaptation-draft',providerId:'similar-code',rowId:'forged'})),false,'scratch draft creation cannot inject a comparison identity');
  const draftIntent=workspace.handleMessage(message({type:'create-adaptation-draft',providerId:'similar-code',rowId:similarRow.rowId}));assert.strictEqual(draftIntent.type,'create-adaptation-draft');assert.strictEqual(draftIntent.review.reviewId,'a'.repeat(64));assert(/^[a-f0-9]{64}$/.test(draftIntent.routeId),'scratch authority uses a host-issued workspace/generation-bound route');assert(!Object.prototype.hasOwnProperty.call(draftIntent,'text'),'literal reference content is not returned through webview intent metadata');
  assert(workspace.html().includes('Resume in Context')&&workspace.html().includes('mark-resume-context'),'the existing Coding Assistance surface owns compact resume controls without a new window');const markIntent=workspace.handleMessage(message({type:'mark-resume-context'}));assert.strictEqual(markIntent.type,'mark-resume-context');
  assert.strictEqual(workspace.setResumeContext({id:'m1',label:'Changed setup',status:'changed',detail:'Source changed.'}),true);assert(workspace.html().includes('Changed setup')&&workspace.html().includes('Source changed.')&&workspace.html().includes('data-message="resume-context" disabled'));assert.strictEqual(workspace.handleMessage(message({type:'resume-context'})),false,'a stale marker cannot emit navigation intent');
  workspace.setResumeContext({id:'m1',label:'Current setup',status:'current',detail:'Unchanged.',source:{filename:path.join(root,'states.zss'),line:12,fingerprint:'f'.repeat(64)}});const resumeIntent=workspace.handleMessage(message({type:'resume-context'}));assert.strictEqual(resumeIntent.type,'resume-context');const clearIntent=workspace.handleMessage(message({type:'clear-resume-context'}));assert.strictEqual(clearIntent.type,'clear-resume-context');assert.strictEqual(workspace.handleMessage(message({type:'clear-resume-context',id:'forged'})),false,'resume controls reject webview-supplied marker identity');
  assert.strictEqual(workspace.handleMessage(message({type:'escape'})),true);assert.strictEqual(workspace.snapshot().comparisonRowId,'');assert(!workspace.html().includes('Current block and working reference'),'Escape closes the local comparison before affecting search or child state');
  const glossaryProvider=workspace.snapshot().providers.find(item=>item.id==='project-data'),glossaryRow=flattenProviderRows(glossaryProvider.id,glossaryProvider.data,root).find(row=>row.glossaryAnnotation);
  const actionRows=flattenProviderRows(glossaryProvider.id,glossaryProvider.data,root),assistantRow=actionRows.find(row=>row.assistantAction),inertRow=actionRows.find(row=>row.id==='forged-action');assert.strictEqual(inertRow.assistantAction,null,'unknown backend action identifiers are not projected into the webview');assert.strictEqual(workspace.handleMessage(message({type:'assistant-action',providerId:'project-data',rowId:assistantRow.rowId,action:'forged'})),false,'the client cannot inject an action identifier');const assistantIntent=workspace.handleMessage(message({type:'assistant-action',providerId:'project-data',rowId:assistantRow.rowId}));assert.strictEqual(assistantIntent.type,'assistant-action');assert.strictEqual(assistantIntent.action,'focus-similar-code');assert.strictEqual(intents.at(-1),assistantIntent,'assistant action identity is recovered from the current host projection');
  const glossaryIntent=workspace.handleMessage(message({type:'edit-glossary',providerId:'project-data',rowId:glossaryRow.rowId}));assert.strictEqual(glossaryIntent.type,'edit-glossary');assert.strictEqual(glossaryIntent.metadataId,'c'.repeat(32));assert.strictEqual(glossaryIntent.annotation.description,'Character owner');
  const favoriteIntent=workspace.handleMessage(message({type:'toggle-glossary-favorite',providerId:'project-data',rowId:glossaryRow.rowId}));assert.strictEqual(favoriteIntent.type,'toggle-glossary-favorite');assert.strictEqual(favoriteIntent.metadataId,'c'.repeat(32));assert.strictEqual(workspace.handleMessage(message({type:'edit-glossary',providerId:'project-data',rowId:'forged'})),false,'glossary messages resolve only current host-projected opaque symbol identities');
  assert(workspace.html().includes('data-message="edit-glossary"')&&workspace.html().includes('data-message="toggle-glossary-favorite"'),'annotated glossary rows expose compact local metadata actions');
  assert.strictEqual(workspace.handleMessage(message({type:'toggle-glossary'})),true);assert.strictEqual(workspace.snapshot().filters.glossary,true);assert(workspace.html().includes('Hero definition')&&!workspace.html().includes('State 200'),'Identifier Glossary isolates authored Project Data vocabulary without opening another browser');assert.strictEqual(workspace.handleMessage(message({type:'toggle-glossary',enabled:true})),false,'the glossary route rejects webview-supplied scope decisions');assert.strictEqual(workspace.handleMessage(message({type:'escape'})),true);assert.strictEqual(workspace.snapshot().filters.glossary,false,'Escape leaves the compact glossary scope');
  assert.strictEqual(workspace.handleMessage(message({type:'toggle-impact-paths'})),true);assert.strictEqual(workspace.snapshot().filters.impactPaths,true);assert(workspace.html().includes('Indirect callers of AttackStart')&&workspace.html().includes('helpers.zss:24')&&!workspace.html().includes('Hero definition')&&!workspace.html().includes('State 200'),'Impact Paths isolates bounded relationships and preserves their exact source children');assert(workspace.html().includes('Open Source'),'inherited impact source sites retain navigation');assert.strictEqual(workspace.handleMessage(message({type:'toggle-impact-paths',enabled:true})),false,'the impact route rejects webview-supplied state');assert.strictEqual(workspace.handleMessage(message({type:'escape'})),true);assert.strictEqual(workspace.snapshot().filters.impactPaths,false,'Escape leaves the compact impact scope');
  workspace.setCapability({nightlyStringsEnabled:true,target:{buildId:'nightly-exact',version:'Nightly 2026-10-13',channel:'nightly',commit:'abcdef1234567890'}});
  assert(workspace.html().includes('Nightly 2026-10-13 · nightly · abcdef123456')&&workspace.html().includes('Nightly string tools enabled'),'the status uses the current exact capability profile');
  assert(workspace.html().includes('data-message="toggle-string-flow"'),'a verified supporting target exposes the bounded String Flow view');
  assert.strictEqual(workspace.handleMessage(message({type:'toggle-string-flow'})),true);assert.strictEqual(workspace.snapshot().filters.stringFlow,true);
  assert.strictEqual(workspace.snapshot().filters.impactPaths,false,'String Flow and Impact Paths remain mutually exclusive');
  assert(workspace.html().includes('String role filter'),'the role selector appears only inside the verified String Flow view');
  assert.strictEqual(workspace.handleMessage(message({type:'set-filter',name:'stringRole',value:'producer'})),true);assert.strictEqual(workspace.snapshot().filters.stringRole,'producer');
  assert.strictEqual(workspace.handleMessage(message({type:'set-filter',name:'stringRole',value:'logger consumer'})),true);assert.strictEqual(workspace.snapshot().filters.stringRole,'logger consumer','verified Nightly exposes the dedicated logger-sink role without adding another browser');
  assert.strictEqual(workspace.handleMessage(message({type:'set-filter',name:'stringRole',value:'forged role'})),false,'String Flow accepts only host-defined role values');
  assert.strictEqual(workspace.handleMessage(message({type:'toggle-string-flow',enabled:true})),false,'the String Flow switch rejects a webview-supplied capability decision');
  assert.strictEqual(workspace.handleMessage(message({type:'toggle-string-flow'})),true);assert.strictEqual(workspace.snapshot().filters.stringFlow,false);assert.strictEqual(workspace.snapshot().filters.stringRole,'','leaving String Flow clears its subordinate role filter');
  const engineIntent=workspace.handleMessage(message({type:'open-engine-targets'}));assert.strictEqual(engineIntent.type,'open-engine-targets');assert.strictEqual(intents.at(-1),engineIntent);
  assert.strictEqual(workspace.handleMessage(message({type:'open-engine-targets',target:'forged'})),false,'the engine-target route rejects webview-supplied target identity');
  const staleGeneration=workspace.snapshot().generation;await workspace.handleMessage(message({type:'refresh'}));
  assert.strictEqual(workspace.handleMessage({type:'search',generation:staleGeneration,query:'state'}),false,'stale generation messages fail closed');
  assert.strictEqual(workspace.handleMessage(message({type:'refresh',context:{root:path.resolve('forged')}})),false,'webview refresh cannot replace the host-bound context');
  assert(contexts.every(context=>context.root===root && context.character==='ryu'),'every provider refresh retains the original frozen host context');
  assert.strictEqual(workspace.handleMessage(message({type:'open-source-intent',providerId:'code-navigator',rowId:'forged'})),false,'messages cannot inject provider DTOs');
  assert.strictEqual(workspace.handleMessage({type:'save',value:'forbidden'}),false); assert(!MESSAGE_TYPES.some(type=>/write|save|apply|delete/.test(type)));
  workspace.handleMessage(message({type:'search',query:'standing punch'})); const filtered=workspace.html(); assertToolbar(filtered,'filtered browser'); assert(filtered.includes('State 200')); assert(!filtered.includes('Hero definition')); assert(filtered.includes('1 matching'),'aliases participate in discovery only');
  workspace.handleMessage(message({type:'set-filter',name:'category',value:'state'}));assert.strictEqual(workspace.snapshot().filters.category,'state');assert.strictEqual(workspace.handleMessage(message({type:'set-filter',name:'forged',value:'state'})),false);
  workspace.handleMessage(message({type:'set-browser-mode',mode:'cards'}));assert.strictEqual(workspace.snapshot().mode,'cards');assert(workspace.html().includes('cards-rows')&&workspace.html().includes('role="listbox"'));workspace.handleMessage(message({type:'open-child',child:'details'})); assert.strictEqual(workspace.snapshot().child,'details'); assertToolbar(workspace.html(),'child browser');
  assert.strictEqual(workspace.handleMessage(message({type:'escape'})),true); assert.strictEqual(workspace.snapshot().child,null); assert.strictEqual(workspace.snapshot().query,'standing punch'); assertToolbar(workspace.html(),'child-close browser');
  assert.strictEqual(workspace.handleMessage(message({type:'escape'})),true); assert.strictEqual(workspace.snapshot().query,''); assertToolbar(workspace.html(),'search-close browser'); assert.strictEqual(workspace.handleMessage(message({type:'escape'})),false);
  workspace.close(); assert.strictEqual(workspace.snapshot().opened,false); assert(states.length>=4);
  const compactRender=renderAuthoringBrowserHtml(state);
  assert(compactRender.includes('1 provider unavailable'));
  assert(compactRender.includes('html,body{max-width:100%;overflow-x:hidden}')&&compactRender.includes(':where(.bar,.tools,.tabs,.actions,.filters,.manage,.file-nav){flex-wrap:wrap'),'Coding Assistance consumes the shared narrow companion-browser contract without a root horizontal slider');
  const isolatedRender=renderAuthoringBrowserHtml({providers:[{id:'code-navigator',status:'ready',data:{items:[{id:'safe',label:'Safe render'}]}},{id:'controllers',status:'ready',data:{items:Array.from({length:5000},(_,index)=>({id:String(index),label:'x'}))}}]});
  assert(isolatedRender.includes('Safe render')&&isolatedRender.includes('Unavailable:'),'render bounds isolate an oversized provider without hiding safe providers');
  const largeRender=renderAuthoringBrowserHtml({providers:[{id:'code-navigator',status:'ready',data:{items:Array.from({length:MAX_RENDERED_ROWS_PER_PROVIDER+75},(_,index)=>({id:String(index),label:`State ${index}`}))}}]});
  assert.strictEqual((largeRender.match(/class="provider-row /g)||[]).length,MAX_RENDERED_ROWS_PER_PROVIDER,'large providers render a compact bounded page rather than thousands of DOM rows');
  assert(largeRender.includes(`showing first ${MAX_RENDERED_ROWS_PER_PROVIDER}`)&&largeRender.includes('update after Save or Refresh'),'the compact browser explains both refinement and refresh behavior');
  const stringFlowRender=renderAuthoringBrowserHtml({
    capability:{nightlyStringsEnabled:true,target:{version:'Supporting build'}},filters:{stringFlow:true},providers:[
      {id:'project-data',status:'ready',data:{items:[{id:'maps',label:'Maps',kind:'category',children:[
        {id:'music',label:'Music.Path',kind:'maps',stringFlow:true,stringFlowRoles:['runtime consumer'],children:[{id:'site',label:'music.zss:4',kind:'site'}]},
        {id:'damage',label:'Damage',kind:'maps'}
      ]}]}},
      {id:'code-navigator',status:'ready',data:{items:[{id:'state',label:'State 200'}]}}
    ]
  });
  assert(stringFlowRender.includes('Music.Path')&&stringFlowRender.includes('music.zss:4')&&!stringFlowRender.includes('Damage')&&!stringFlowRender.includes('State 200'),'String Flow isolates producers/consumers and inherits membership onto their exact source sites');
  const stringRoleRender=renderAuthoringBrowserHtml({capability:{nightlyStringsEnabled:true,target:{version:'Supporting build'}},filters:{stringFlow:true,stringRole:'producer'},providers:[{id:'project-data',status:'ready',data:{items:[{id:'maps',label:'Maps',kind:'category',children:[{id:'producer',label:'Produced.Label',kind:'maps',stringFlow:true,stringFlowRoles:['producer']},{id:'consumer',label:'Consumed.Label',kind:'maps',stringFlow:true,stringFlowRoles:['runtime consumer']}]}]}}]});
  assert(stringRoleRender.includes('Produced.Label')&&!stringRoleRender.includes('Consumed.Label'),'the subordinate role filter isolates one verified String Flow role');
  const glossaryRender=renderAuthoringBrowserHtml({filters:{glossary:true},providers:[{id:'project-data',status:'ready',data:{items:[{id:'locals',label:'Scoped locals',kind:'category',children:[{id:'phase',label:'phase',kind:'locals',glossary:true,children:[{id:'site',label:'moves.zss:8',kind:'site'}]},{id:'animtime',label:'AnimTime',kind:'triggers'}]}]}},{id:'recipes',status:'ready',data:{items:[{id:'recipe',label:'Recipe'}]}}]});
  assert(glossaryRender.includes('phase')&&glossaryRender.includes('moves.zss:8')&&!glossaryRender.includes('AnimTime')&&!glossaryRender.includes('Recipe'),'Identifier Glossary inherits authored membership onto exact source rows and suppresses unrelated providers');
  const impactRender=renderAuthoringBrowserHtml({filters:{impactPaths:true},contextRoot:root,providers:[{id:'project-data',status:'ready',data:{items:[{id:'function',label:'Function',kind:'functions',children:[{id:'impact',label:'Indirect dependency',kind:'impact-out',children:[{id:'site',label:'moves.zss:18',kind:'site',source:{filename:'moves.zss',line:17}}]}]}]}},{id:'recipes',status:'ready',data:{items:[{id:'recipe',label:'Recipe'}]}}]});
  assert(impactRender.includes('Indirect dependency')&&impactRender.includes('moves.zss:18')&&impactRender.includes('Open Source')&&!impactRender.includes('Function')&&!impactRender.includes('Recipe'),'Impact Paths inherits membership onto exact source rows and suppresses normal hierarchy rows');
  let failAfterGood=false;
  const retained=createAuthoringBrowserWorkspace({registry:createBrowserRegistry({
    'code-navigator':{read:()=>failAfterGood?Promise.reject(new Error('temporary parse failure')):{items:[{id:'kept',label:'Kept result'}]}},
    'project-data':{read:()=>({items:[]})},recipes:{read:()=>({items:[]})},'similar-code':{read:()=>({items:[]})},controllers:{read:()=>({items:[]})},problems:{read:()=>({items:[]})}
  })});
  await retained.open({root});failAfterGood=true;await retained.handleMessage({type:'refresh',generation:retained.snapshot().generation});
  const stale=retained.snapshot().providers.find(entry=>entry.id==='code-navigator');assert.strictEqual(stale.status,'stale');assert.strictEqual(stale.data.items[0].label,'Kept result');assert(retained.html().includes('Showing last-known-good results'));
  assert.strictEqual(retained.handleMessage({type:'search',generation:retained.snapshot().generation,query:'x'.repeat(600)}),false,'oversized searches fail closed');
  let resolveA,resolveB;const delayed=createAuthoringBrowserWorkspace({registry:createBrowserRegistry({
    'code-navigator':{read:context=>new Promise(resolve=>{const done=()=>resolve({items:[{id:context.character,label:`${context.character} only`,source:{filename:`${context.character}.zss`,line:0}}]});if(context.character==='A')resolveA=done;else resolveB=done;})},
    'project-data':{read:()=>({items:[]})},recipes:{read:()=>({items:[]})},'similar-code':{read:()=>({items:[]})},controllers:{read:()=>({items:[]})},problems:{read:()=>({items:[]})}
  })});
  const openA=delayed.open({character:'A',root}),openB=delayed.open({character:'B',root});resolveB();await openB;resolveA();await openA;
  assert(delayed.html().includes('B only')&&!delayed.html().includes('A only'),'a late older context refresh cannot overwrite the newest browser binding');
  assert.strictEqual(delayed.snapshot().contextEpoch,2,'context rebinding advances an authority epoch');
  const scoped=createAuthoringBrowserWorkspace({registry:createBrowserRegistry({
    'code-navigator':{read:context=>context.character==='Ryu'?{items:[{id:'ryu',label:'Ryu private row'}]}:Promise.reject(new Error('Ken parse failed'))},
    'project-data':{read:()=>({items:[]})},recipes:{read:()=>({items:[]})},'similar-code':{read:()=>({items:[]})},controllers:{read:()=>({items:[]})},problems:{read:()=>({items:[]})}
  })});
  await scoped.open({character:'Ryu',root,files:[path.join(root,'ryu.zss')]});assert(scoped.html().includes('Ryu private row'));
  await scoped.open({character:'Ken',root,files:[path.join(root,'ken.zss')]});assert(!scoped.html().includes('Ryu private row'),'last-known-good provider data never crosses a character/context binding');assert.strictEqual(scoped.snapshot().providers.find(entry=>entry.id==='code-navigator').status,'failed');
  console.log('Manual Authoring Browser hosts exact read-only providers, preserves partial results and emits only selection/source intents');
})().catch(error=>{console.error(error);process.exitCode=1;});
