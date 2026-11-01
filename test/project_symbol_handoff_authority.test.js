'use strict';

const assert = require('assert');
const path = require('path');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function(request,parent,main){if(request==='vscode')return{workspace:{textDocuments:[]}};return originalLoad.call(this,request,parent,main);};
const { hash } = require('../src/mutation_safety');
const { buildProjectSymbolCatalog } = require('../src/project_symbol_catalog');
const { compactProjectKnowledge } = require('../src/move_lab_component_model');
const authority = require('../src/project_symbol_handoff_authority');
Module._load = originalLoad;

const defPath = path.resolve('fixture/Hero.def'), sourcePath = path.resolve('fixture/Hero.zss');
const sourceText = '[Constants]\nTuning.Speed = 4\n[StateDef 200]\nmap(Game.Mode) := 1;\nroot, var(3) := const(Tuning.Speed);\nvelSet { x: 0; }\nvelSet { y: 0; }\nif AnimTime = 0 || AnimTime = 1 {}\nif AnimLoopCount > 0 {}\nRunState { state: 100; }\nCustomController { value: 1; }\n# AnimLoopCount, RunState, CustomController, and map(Commented.Out) do not count\nlet note := "AnimLoopCount RunState CustomController";';
const componentText = sourceText.split('\n').slice(2).join('\n');
const component = { kind:'state', syntax:'zss', filename:sourcePath, startLine:2, endLine:12, text:componentText, sourceHash:hash(sourceText), rangeHash:hash(componentText), stableId:'state-200', signature:'200', reference:{defPath} };
const defText = '[Files]\nst = Hero.zss\n', capabilities = { nightlyStringsEnabled:false, enabledCapabilities:[], target:{channel:'stable',version:'1.0'} };
const catalog = buildProjectSymbolCatalog([{filename:sourcePath,text:sourceText}], { assignedFiles:[sourcePath], ownerIdentity:defPath, resolved:true });
const compact = compactProjectKnowledge(catalog, null);
assert.strictEqual(authority.catalogFingerprint(compact), authority.catalogFingerprint(catalog), 'the bounded browser DTO and independently rebuilt assigned catalog share one exact fingerprint');
const snapshot = authority.buildProjectSymbolSnapshot(compact, { capabilities });
let serial=0;const context={defPath,defText,defDirty:false,sourceText,generation:4,capabilities,token:()=> (++serial).toString(16).padStart(48,'0')};
const built=authority.buildProjectSymbolAuthorities(component,snapshot,context);
assert.strictEqual(built.publicLinks.available,true);
assert.deepStrictEqual(built.publicLinks.items.map(item=>[item.category,item.name]),[['maps','Game.Mode'],['variables','var(3)'],['controllers','VelSet'],['triggers','AnimTime'],['constants','Tuning.Speed']]);
assert(!built.publicLinks.items.some(item=>item.name.includes('Commented')),'comments and non-catalog text never receive authority');
assert(!built.publicLinks.items.some(item=>item.name==='CustomController'),'unknown controller names remain unresolved knowledge and never receive bundled documentation authority');
const compactVel=compact.entries.find(item=>item.category==='controllers'&&item.name==='VelSet');assert(compactVel&&compactVel.sites.length===2&&compactVel.sites.every(site=>site.catalogMatch===true),'repeated exact bundled controllers share one row while retaining each selected site');
const compactLoop=compact.entries.find(item=>item.category==='triggers'&&item.name==='AnimLoopCount');assert(compactLoop&&compactLoop.sites.length===1,'repeated names in comments and strings never become trigger sites');assert.strictEqual(compactLoop.sites[0].metadata.visibilityCapabilityId,'animation.loop-count-trigger','the whitelisted bundled trigger capability survives the compact shared snapshot');
const compactRunState=compact.entries.find(item=>item.category==='controllers'&&item.name==='RunState');assert(compactRunState&&compactRunState.sites.length===1&&compactRunState.sites[0].catalogMatch===true);assert.strictEqual(compactRunState.sites[0].metadata.visibilityCapabilityId,'zss.run-state','the bundled controller capability survives the same compact snapshot');
const route=[...built.authorities.values()][0];
assert(authority.validateProjectSymbolAuthority(route,component,snapshot,{...context,token:()=>route.route}));
assert(authority.validateProjectSymbolTarget(route,catalog,capabilities,defText),'the target independently matches the bound assigned catalog item');
assert.strictEqual(authority.validateProjectSymbolTarget({...route,name:'game.mode'},catalog,capabilities,defText),null,'display-name casing cannot forge item identity');
assert.strictEqual(authority.validateProjectSymbolAuthority(route,component,authority.buildProjectSymbolSnapshot(compact,{capabilities:{...capabilities,target:{channel:'nightly',buildId:'other'}}}),{...context,capabilities:{...capabilities,target:{channel:'nightly',buildId:'other'}},token:()=>route.route}),null,'engine target changes revoke routes');
assert.strictEqual(authority.buildProjectSymbolAuthorities(component,snapshot,{...context,defDirty:true}).publicLinks.available,false,'dirty owner DEF fails closed');
const gatedLinks=cap=>authority.buildProjectSymbolAuthorities(component,authority.buildProjectSymbolSnapshot(compact,{capabilities:cap}),{...context,capabilities:cap}).publicLinks.items;
for(const [label,cap] of [
  ['Stable with an enabled capability',{nightlyStringsEnabled:false,enabledCapabilities:['animation.loop-count-trigger'],target:{channel:'stable',version:'1.0'}}],
  ['Stable with the legacy Nightly flag',{nightlyStringsEnabled:true,enabledCapabilities:[],target:{channel:'stable',version:'1.0'}}],
  ['Stable with contradictory Nightly evidence',{nightlyStringsEnabled:true,enabledCapabilities:['animation.loop-count-trigger'],target:{channel:'stable',version:'1.0'}}],
  ['an ownerless target',{nightlyStringsEnabled:true,enabledCapabilities:['animation.loop-count-trigger'],target:{}}],
  ['Nightly without the capability',{nightlyStringsEnabled:true,enabledCapabilities:[],target:{channel:'nightly',buildId:'verified'}}]
])assert(!gatedLinks(cap).some(item=>item.name==='AnimLoopCount'),`${label} omits a capability-gated trigger occurrence`);
const nightly={nightlyStringsEnabled:true,enabledCapabilities:['animation.loop-count-trigger'],target:{channel:'nightly',buildId:'verified'}};assert(gatedLinks(nightly).some(item=>item.name==='AnimLoopCount'),'the exact verified Nightly with the exact capability may expose the gated trigger occurrence');
for(const [label,cap] of [
  ['Stable with controller capability',{nightlyStringsEnabled:false,enabledCapabilities:['zss.run-state'],target:{channel:'stable',version:'1.0'}}],
  ['Stable with legacy Nightly flag',{nightlyStringsEnabled:true,enabledCapabilities:[],target:{channel:'stable',version:'1.0'}}],
  ['contradictory Stable controller evidence',{nightlyStringsEnabled:true,enabledCapabilities:['zss.run-state'],target:{channel:'stable',version:'1.0'}}],
  ['ownerless controller evidence',{nightlyStringsEnabled:true,enabledCapabilities:['zss.run-state'],target:{}}],
  ['Nightly without controller capability',{nightlyStringsEnabled:true,enabledCapabilities:[],target:{channel:'nightly',buildId:'verified'}}]
])assert(!gatedLinks(cap).some(item=>item.name==='RunState'),`${label} omits a capability-gated controller occurrence`);
const runNightly={nightlyStringsEnabled:true,enabledCapabilities:['zss.run-state'],target:{channel:'nightly',buildId:'verified'}};assert(gatedLinks(runNightly).some(item=>item.name==='RunState'),'the exact verified Nightly with the exact controller capability exposes RunState documentation');

const cnsPath=path.resolve('fixture/Hero.cns'),cnsText='[Statedef 210]\n[State 210, End]\ntype = ChangeState\ntrigger1 = AnimTime = 0\ntrigger2 = AnimTime < 0\nvalue = 0\n; AnimTime in comments is ignored\ntext = "AnimTime"',cnsComponent={kind:'state',syntax:'cns',filename:cnsPath,startLine:0,endLine:7,text:cnsText,sourceHash:hash(cnsText),rangeHash:hash(cnsText),stableId:'state-210',signature:'210',reference:{defPath}},cnsCatalog=buildProjectSymbolCatalog([{filename:cnsPath,text:cnsText}],{assignedFiles:[cnsPath],ownerIdentity:defPath,resolved:true}),cnsCompact=compactProjectKnowledge(cnsCatalog,null),cnsSnapshot=authority.buildProjectSymbolSnapshot(cnsCompact,{capabilities});serial=0;
const cnsBuilt=authority.buildProjectSymbolAuthorities(cnsComponent,cnsSnapshot,{...context,sourceText:cnsText,token:()=> (++serial).toString(16).padStart(48,'0')}),cnsTrigger=cnsBuilt.publicLinks.items.find(item=>item.category==='triggers'&&item.name==='AnimTime'),cnsEntry=cnsSnapshot.entries[cnsTrigger.id];
assert(cnsTrigger,'a classic CNS trigger receives one compact documentation handoff');assert.strictEqual(cnsEntry.sites.filter(site=>site.line>=cnsComponent.startLine&&site.line<=cnsComponent.endLine).length,2,'repeated exact CNS trigger uses remain bound as two selected sites behind one compact row');
const cnsRoute=cnsBuilt.authorities.get(cnsTrigger.route);assert(authority.validateProjectSymbolTarget(cnsRoute,cnsCatalog,capabilities,defText),'the exact classic CNS trigger resolves in the existing Project Knowledge catalog');assert.strictEqual(authority.validateProjectSymbolTarget({...cnsRoute,category:'maps'},cnsCatalog,capabilities,defText),null,'a forged trigger category cannot adopt a same-name or foreign item');
const cnsController=cnsBuilt.publicLinks.items.find(item=>item.category==='controllers'&&item.name==='ChangeState'),cnsControllerEntry=cnsSnapshot.entries[cnsController.id];assert(cnsController&&cnsControllerEntry.sites.length===1&&cnsControllerEntry.sites[0].line===2,'the exact CNS type field receives one bundled controller documentation handoff');const cnsControllerRoute=cnsBuilt.authorities.get(cnsController.route);assert(authority.validateProjectSymbolTarget(cnsControllerRoute,cnsCatalog,capabilities,defText));assert.strictEqual(authority.validateProjectSymbolTarget({...cnsControllerRoute,name:'changestate'},cnsCatalog,capabilities,defText),null,'controller display-name casing is authority-bound');

const floodText='[StateDef 1]\n'+Array.from({length:authority.MAX_VISIBLE_ROUTES+1},(_,index)=>`map(Value.${index}) := ${index};`).join('\n'),floodComponent={...component,startLine:0,endLine:authority.MAX_VISIBLE_ROUTES+1,text:floodText,sourceHash:hash(floodText),rangeHash:hash(floodText),stableId:'state-flood',signature:'1'},floodCatalog=buildProjectSymbolCatalog([{filename:sourcePath,text:floodText}],{assignedFiles:[sourcePath],ownerIdentity:defPath,resolved:true}),floodSnapshot=authority.buildProjectSymbolSnapshot(floodCatalog,{capabilities});serial=0;
const bounded=authority.buildProjectSymbolAuthorities(floodComponent,floodSnapshot,{...context,sourceText:floodText,token:()=> (++serial).toString(16).padStart(48,'0')});
assert.strictEqual(bounded.publicLinks.items.length,authority.MAX_VISIBLE_ROUTES);assert.strictEqual(bounded.publicLinks.omitted,1);assert.strictEqual(bounded.authorities.size,authority.MAX_VISIBLE_ROUTES,'route memory is bounded per selected block');

console.log('Exact selected-block Project Symbols authority is bounded, capability-bound, and independently target-validatable');
