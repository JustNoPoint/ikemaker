'use strict';

const assert=require('assert');
const crypto=require('crypto');
const path=require('path');
const {collectRecords}=require('../src/analyzer');
const {buildProjectSymbolCatalog}=require('../src/project_symbol_catalog');
const {buildResourceLifecycleProjection,validateResourceLifecycleRoute,LIMITS}=require('../src/resource_lifecycle_projection');
const {projectDataProjection,buildAuthoringBrowserModel}=require('../src/authoring_browser_model');

const owner=path.resolve('characters/Ryu/Ryu.def'),zss=path.resolve('characters/Ryu/main.zss'),cns=path.resolve('characters/Ryu/legacy.cns');
const zssText=`[StateDef 9000]
[Function Spawn()]
root, helper { id: 7; stateNo: 9000 }
parent, numHelper(7);
helper(map(Owner)), explod { id: 7; removeTime: 20 }
p2, numExplod(7);
projectile { projID: 7; projHits: 1 }
target(map(Target)), projHitTime(7);
helper { id: map(Dynamic); stateNo: map(State) }
# helper { id: 999 }
let label := "explod { id: 998 }";
`;
const cnsText=`[StateDef 200]
[State 200, helper]
type = Helper
id = 8
stateno = 9000
[State 200, remove]
type = RemoveExplod
id = 7
trigger1 = root, NumExplod(7)
; type = Projectile
; projid = 997
`;
const files=[{filename:zss,text:zssText},{filename:cns,text:cnsText}],catalog=buildProjectSymbolCatalog(files,{assignedFiles:[zss,cns],ownerIdentity:owner}),projection=buildResourceLifecycleProjection(catalog,{contextOwnerIdentity:owner});

assert.strictEqual(projection.status,'ready');
assert(Object.isFrozen(projection)&&Object.isFrozen(projection.items)&&projection.items.every(Object.isFrozen),'the shared lifecycle DTO is deeply immutable');
assert(projection.items.filter(item=>item.resourceId==='7').map(item=>item.namespace).sort().join(',')==='explod,helper,projectile','equal numeric IDs remain separate across resource namespaces');
const helper=projection.items.find(item=>item.namespace==='helper'&&item.resourceId==='7'),explod=projection.items.find(item=>item.namespace==='explod'&&item.resourceId==='7'),projectile=projection.items.find(item=>item.namespace==='projectile'&&item.resourceId==='7');
assert.deepStrictEqual(helper.roles,['creation','reference']);assert(helper.stateStarts.some(item=>item.state==='9000'&&item.status==='resolved'),'literal Helper start StateDef relationships reuse the catalog resolution');
assert.deepStrictEqual(helper.sites.map(site=>site.recipient.expression),['root','parent'],'authored root and parent recipients remain distinct and source ordered');
assert(explod.sites.some(site=>site.recipient.expression==='helper(map(Owner))'&&site.recipient.dynamic),'parameterized recipient expressions remain authored and unresolved');
assert(explod.sites.some(site=>site.recipient.expression==='p2'),'P2 remains authored recipient context rather than inferred runtime selection');
assert(projectile.sites.some(site=>site.recipient.expression==='target(map(Target))'&&site.recipient.dynamic),'dynamic Target recipient context remains unresolved');
const dynamic=projection.items.find(item=>item.namespace==='helper'&&item.resourceId==='map(Dynamic)');assert(dynamic&&!dynamic.literal&&/dynamic ID unresolved/.test(dynamic.status),'dynamic resource IDs remain visible but unresolved');
assert(projection.items.some(item=>item.namespace==='helper'&&item.resourceId==='map(Owner)'),'the balanced resource-call scanner preserves the complete nested ZSS ID expression');
assert(!projection.items.some(item=>item.resourceId==='998'||item.resourceId==='999'),'comments and quoted strings do not fabricate resource sites');
assert(projection.items.some(item=>item.namespace==='helper'&&item.resourceId==='8'&&item.sites[0].owner.name==='200'),'CNS/ST and ZSS lifecycle sites use the same analyzer/catalog projection');

const crossOwner=buildResourceLifecycleProjection(catalog,{contextOwnerIdentity:path.resolve('characters/Ken/Ken.def')});assert.strictEqual(crossOwner.status,'unavailable');assert.strictEqual(crossOwner.items.length,0,'cross-character lifecycle projection fails closed');
const relabeled=buildResourceLifecycleProjection(catalog,{ownerIdentity:path.resolve('characters/Ken/Ken.def'),contextOwnerIdentity:path.resolve('characters/Ken/Ken.def')});assert.strictEqual(relabeled.status,'unavailable');assert.strictEqual(relabeled.items.length,0,'a caller cannot relabel one owner catalog as another character');
const route=helper.sites[0].source;assert(validateResourceLifecycleRoute(route,catalog,owner).available,'an unchanged exact assigned source route validates');
const stale={...catalog,sources:{...catalog.sources,[zss.toLowerCase()]:{...catalog.sources[zss.toLowerCase()],hash:'0'.repeat(64)}}};assert.strictEqual(validateResourceLifecycleRoute(route,stale,owner).available,false,'a changed source fingerprint rejects reveal');

const projectedFiles=files.map(file=>({...file,fingerprint:crypto.createHash('sha256').update(file.text).digest('hex')})),projectData=projectDataProjection(projectedFiles,[zss,cns],{contextIdentity:'opaque-browser-context',ownerDef:owner});
assert.strictEqual(JSON.stringify(projectData.resourceLifecycle.items),JSON.stringify(projection.items),'Project Data consumes the byte-identical shared lifecycle item DTO');
assert(validateResourceLifecycleRoute(projectData.resourceLifecycle.items[0].sites[0].source,catalog,owner).available,'real Project Data routes use the same admitted absolute owner DEF as their catalog');
const ownerlessBrowser=buildAuthoringBrowserModel({root:path.dirname(owner),documents:projectedFiles,assignedFiles:[zss,cns],contextIdentity:'opaque-only'});assert.strictEqual(ownerlessBrowser.providers['project-data'].resourceLifecycle.status,'unavailable','an opaque browser identity cannot manufacture character ownership');
const ownedBrowser=buildAuthoringBrowserModel({root:path.dirname(owner),documents:projectedFiles,assignedFiles:[zss,cns],contextIdentity:'opaque-only',ownerDef:owner});assert(validateResourceLifecycleRoute(ownedBrowser.providers['project-data'].resourceLifecycle.items[0].sites[0].source,catalog,owner).available,'Authoring Browser passes its admitted absolute owner DEF through to lifecycle source routes');
const stable=buildResourceLifecycleProjection(catalog,{contextOwnerIdentity:owner,target:{channel:'stable',version:'1.0'}}),nightly=buildResourceLifecycleProjection(catalog,{contextOwnerIdentity:owner,target:{channel:'nightly'},enabledCapabilities:['zss.runtime-strings']});assert.strictEqual(JSON.stringify(stable),JSON.stringify(nightly),'lifecycle projection exposes no Nightly string detail and is target-private by construction');

const masked=collectRecords('[StateDef 1]\n# numHelper(55)\nlet x := "numExplod(66)";\nnumProjID(77);',zss);assert.deepStrictEqual(masked.resources.map(item=>item.id),['77'],'the canonical analyzer masks ZSS comments and strings before lifecycle parsing');
const nestedLegacy=collectRecords('[StateDef 1]\n[State 1, check]\ntype = Null\ntrigger1 = NumHelper(map(Target))',cns);assert.strictEqual(nestedLegacy.resources[0].id,'map(Target)','the balanced resource-call scanner preserves complete nested CNS/ST ID expressions');
const idlessCatalog=buildProjectSymbolCatalog([{filename:zss,text:'[StateDef 1]\nhelper { stateNo: 2 }'}],{assignedFiles:[zss],ownerIdentity:owner}),idless=buildResourceLifecycleProjection(idlessCatalog,{contextOwnerIdentity:owner});assert(idless.items.some(item=>item.resourceId==='(id omitted)')&&!idless.complete&&idless.limitations.some(value=>/omit an ID/.test(value)),'ID-less creation sites remain visible and make completeness explicitly unresolved');
const tooManySources={...catalog,sources:Object.fromEntries(Array.from({length:LIMITS.files+1},(_,index)=>{const filename=path.resolve(`f${index}.zss`);return[filename.toLowerCase(),{filename,hash:'a'.repeat(64),bytes:1}];}))};assert.strictEqual(buildResourceLifecycleProjection(tooManySources,{contextOwnerIdentity:owner}).status,'unavailable','file admission bounds fail closed');
const oversizedSource={...catalog,sources:{[zss.toLowerCase()]:{filename:zss,hash:'a'.repeat(64),bytes:LIMITS.perSourceBytes+1}}};assert.strictEqual(buildResourceLifecycleProjection(oversizedSource,{contextOwnerIdentity:owner}).status,'unavailable','per-source byte admission bounds fail closed');
const oversizedProjectData=projectDataProjection([{filename:zss,text:' '.repeat(LIMITS.perSourceBytes+1),fingerprint:'b'.repeat(64)}],[zss],{ownerDef:owner});assert.strictEqual(oversizedProjectData.resourceLifecycle.status,'unavailable');assert.strictEqual(oversizedProjectData.count,0,'Project Data rejects an oversized lifecycle source before catalog parsing');
const aggregateProjectFiles=Array.from({length:5},(_,index)=>({filename:path.resolve(`characters/Ryu/aggregate-${index}.zss`),text:' '.repeat(3400000),fingerprint:String(index).padStart(64,'a')})),aggregateProjectData=projectDataProjection(aggregateProjectFiles,aggregateProjectFiles.map(item=>item.filename),{ownerDef:owner});assert.strictEqual(aggregateProjectData.resourceLifecycle.status,'unavailable');assert.strictEqual(aggregateProjectData.count,0,'Project Data rejects a greater-than-16-MiB aggregate before project-catalog parsing');

console.log('Resource lifecycle projection is shared, bounded, owner-scoped, source ordered, recipient-aware, and stale-safe');
