'use strict';
const assert = require('assert');
const { hash } = require('../src/mutation_safety');
const { buildAirActionUsageSnapshot, validateAirActionUsageAuthority, validateAirExpressionTargetAuthority, validateCollisionSourceAuthority, MAX_USES_PER_ACTION, MAX_USES_TOTAL } = require('../src/air_action_usage_authority');

const defPath = 'C:/chars/Hero/Hero.def', airPath = 'C:/chars/Hero/Hero.air';
const air = `[Begin Action 200]\n0,0,0,0,1\n[Begin Action 201]\n0,1,0,0,1\n`;
const cns = `[StateDef 200]\r\ntype = S\r\nanim = 200 ; exact default\r\n[State 200, change]\r\ntype = ChangeAnim\r\nvalue = 201 ; exact change\r\n[State 200, ignored]\r\ntype = ChangeAnim2\r\nvalue = 200\r\n`;
const zss = `[StateDef 201; anim: 201]\nif true {\n  ChangeAnim {\n    value: 200;\n  }\n}\n# ChangeAnim { value: 201; }\n`;
function context(overrides = {}) {
  const sources = overrides.sources || [
    { available: true, dirty: false, filename: 'C:/chars/Hero/a.cns', syntax: 'cns', text: cns, sourceHash: hash(cns) },
    { available: true, dirty: false, filename: 'C:/chars/Hero/b.zss', syntax: 'zss', text: zss, sourceHash: hash(zss) }
  ];
  let serial = 0;
  return { defPath, defText: '[Files]\nanim = Hero.air\nst = a.cns\nst1 = b.zss\n', defDirty: false, airPath, airText: air, assignedSources: sources.map(item => item.filename), sources, inventoryComplete: true, generation: 7, token: () => (++serial).toString(16).padStart(48, '0'), ...overrides };
}

const built = buildAirActionUsageSnapshot(context());
assert.strictEqual(built.complete, true);
assert.deepStrictEqual(built.publicUses.items.map(item => [item.action, item.kind]), [[200, 'default'], [201, 'changeanim'], [200, 'changeanim2'], [201, 'default'], [200, 'changeanim']]);
assert.strictEqual(built.publicUses.occurrences.length, 5);
assert(built.publicUses.occurrences.every(item => item.status === 'exact' && item.scope === 'state'), 'the shared inventory retains typed exact occurrences before route projection');
assert.ok(built.publicUses.items.some(item => item.file === 'a.cns' && item.kind === 'default' && item.line === 2));
assert.ok(built.publicUses.items.some(item => item.file === 'a.cns' && item.kind === 'changeanim' && item.line === 3), 'CNS ChangeAnim opens its zero-based controller header line');
assert.ok(built.publicUses.items.some(item => item.file === 'b.zss' && item.kind === 'changeanim' && item.line === 2), 'ZSS ChangeAnim opens its zero-based controller header line');
assert.ok(Object.isFrozen(built.publicUses));
const authority = [...built.authorities.values()][0];
assert.ok(validateAirActionUsageAuthority(authority, context({ token: item => item.usageIdentity === authority.usageIdentity ? authority.route : '0'.repeat(48) })));
assert.strictEqual(validateAirActionUsageAuthority(authority, context({ airText: air.replace('Action 200', 'Action 202'), token: () => authority.route })), null);
assert.strictEqual(validateAirActionUsageAuthority({ ...authority, componentIdentity: 'forged-function' }, context({ token: () => authority.route })), null);
const targetBuilt = buildAirActionUsageSnapshot(context({ targetToken: item => hash(item.occurrenceId).slice(0, 48) })), target = [...targetBuilt.targetAuthorities.values()][0];
assert(target && validateAirExpressionTargetAuthority(target, context({ targetToken: item => item.occurrenceId === target.occurrenceId ? target.route : '0'.repeat(48) })), 'source-to-AIR target authority rebuilds from the same occurrence inventory');
assert.strictEqual(validateAirExpressionTargetAuthority(target, context({ generation: 8, targetToken: () => target.route })), null, 'target authority is generation-bound');
assert.strictEqual(validateAirExpressionTargetAuthority(target, context({ airText: air.replace('0,0,0,0,1', '0,9,0,0,1'), targetToken: () => target.route })), null, 'target authority is destination AIR-bound');
assert.strictEqual(buildAirActionUsageSnapshot(context({ sources: context().sources.map((item, index) => index ? item : { ...item, dirty: true }) })).complete, false);
assert.strictEqual(buildAirActionUsageSnapshot(context({ airText: air + `[Begin Action 200]\n0,2,0,0,1\n` })).publicUses.items.some(item => item.action === 200), false);

const dynamic = cns.replace('anim = 200', 'anim = var(0)').replace('value = 201', 'value = 200 + 1');
const dynamicSnapshot = buildAirActionUsageSnapshot(context({ assignedSources: ['C:/chars/Hero/a.cns'], sources: [{ available: true, dirty: false, filename: 'C:/chars/Hero/a.cns', syntax: 'cns', text: dynamic, sourceHash: hash(dynamic) }] })).publicUses;
assert.strictEqual(dynamicSnapshot.items.length, 1, 'the unrelated exact ChangeAnim2 remains navigable');
assert.deepStrictEqual(dynamicSnapshot.occurrences.map(item => [item.kind, item.status, item.action]), [['default', 'unresolved', null], ['changeanim', 'unresolved', null], ['changeanim2', 'exact', 200]], 'dynamic recognized fields remain visible as unresolved while independent ChangeAnim2 stays exact');

const custom = `[StateDef 220]\n; @customstate\n[State 220, recipient]\ntype = ChangeAnim\nvalue = 200\n[State 220, owner]\ntype = ChangeAnim2\nvalue = 201\n`;
const customUses = buildAirActionUsageSnapshot(context({ assignedSources: ['C:/chars/Hero/custom.cns'], sources: [{ available: true, dirty: false, filename: 'C:/chars/Hero/custom.cns', syntax: 'cns', text: custom, sourceHash: hash(custom) }] })).publicUses;
assert.deepStrictEqual(customUses.occurrences.map(item => [item.kind, item.status]), [['changeanim', 'unresolved'], ['changeanim2', 'exact']], 'custom-state ChangeAnim fails closed while ChangeAnim2 retains proven state-owner AIR semantics');

const explodText = `[StateDef 230]\nExplod { anim: 200; spriteplayerno: 2; } Explod { anim: S201; }\n`;
const explodSnapshot = buildAirActionUsageSnapshot(context({ assignedSources: ['C:/chars/Hero/fx.zss'], sources: [{ available: true, dirty: false, filename: 'C:/chars/Hero/fx.zss', syntax: 'zss', text: explodText, sourceHash: hash(explodText) }], targetToken: () => 'e'.repeat(48) }));
assert.deepStrictEqual(explodSnapshot.publicUses.occurrences.map(item => [item.kind, item.status, item.action]), [['explod-anim', 'exact', 200], ['explod-anim', 'unresolved', null]], 'only unprefixed Explod creation animation is exact in B2');
assert.match(explodSnapshot.publicUses.occurrences[0].warning, /sprite owner: runtime-selected/);
assert.match(explodSnapshot.publicUses.occurrences[1].reason, /prefix/i);
const explodRoute = [...explodSnapshot.targetAuthorities.values()][0];
assert(explodRoute && explodRoute.kind === 'explod-anim' && explodRoute.controllerHash && explodRoute.expressionHash, 'Explod navigation binds its controller and exact expression evidence');
const twinExplods='[StateDef 232]\nExplod { anim: 200; } Explod { anim: 200; }\n',twinSnapshot=buildAirActionUsageSnapshot(context({assignedSources:['C:/chars/Hero/twins.zss'],sources:[{available:true,dirty:false,filename:'C:/chars/Hero/twins.zss',syntax:'zss',text:twinExplods,sourceHash:hash(twinExplods)}]}));
assert.strictEqual(twinSnapshot.publicUses.items.length,2);assert.strictEqual(new Set(twinSnapshot.publicUses.items.map(item=>item.id)).size,2,'same-line Explods retain distinct public occurrence identities');assert.strictEqual(new Set(twinSnapshot.publicUses.items.map(item=>item.route)).size,2,'same-line Explods retain independent one-use source routes');
const customExplod = `[StateDef 231]\n# @customstate\nExplod { anim: 200; }\n`;
assert.strictEqual(buildAirActionUsageSnapshot(context({ assignedSources: ['C:/chars/Hero/custom-fx.zss'], sources: [{ available: true, dirty: false, filename: 'C:/chars/Hero/custom-fx.zss', syntax: 'zss', text: customExplod, sourceHash: hash(customExplod) }] })).publicUses.occurrences[0].status, 'unresolved');

const collisionText='[StateDef 250; anim: 200]\nOverrideClsn { group: Clsn1; index: 0; rect: -2,-3,4,5; }\nif time > 0 { TransformClsn { scale: 1, 2; group: 2; index: map(Box); pivot: 0,0; } }\n',collisionSource={available:true,dirty:false,filename:'C:/chars/Hero/collision.zss',syntax:'zss',text:collisionText,sourceHash:hash(collisionText),version:4},collisionContext=context({assignedSources:[collisionSource.filename],sources:[collisionSource],collisionCapabilities:{indexed:true,status:'supported',fingerprint:'nightly-cap'},collisionToken:item=>item.kind==='overrideclsn'?'d'.repeat(48):'f'.repeat(48)}),collisionSnapshot=buildAirActionUsageSnapshot(collisionContext);
assert.strictEqual(collisionSnapshot.publicCollisions.total,2);assert.deepStrictEqual(collisionSnapshot.publicCollisions.items.map(item=>[item.kind,item.relation,item.relatedActions]),[['overrideclsn','same-state',[200]],['transformclsn','conditional/dynamic',[200]]]);assert.strictEqual(collisionSnapshot.publicCollisions.relationTotals['proven-explicit'],0);assert.strictEqual(collisionSnapshot.publicCollisions.items[1].fields.find(item=>item.key==='pivot').compatibility,'nightly');
const collisionAuthority=collisionSnapshot.collisionAuthorities.get('d'.repeat(48));assert(collisionAuthority&&validateCollisionSourceAuthority(collisionAuthority,collisionContext));assert.strictEqual(validateCollisionSourceAuthority(collisionAuthority,{...collisionContext,generation:8}),null);
const stableCollision=buildAirActionUsageSnapshot({...collisionContext,collisionCapabilities:{indexed:false,status:'unsupported',fingerprint:'stable-cap'}}).publicCollisions.items[1];assert.strictEqual(stableCollision.compatibility,'stable-1.0');assert.strictEqual(stableCollision.fields.find(item=>item.key==='pivot').compatibility,'unsupported-on-stable');
const cnsArityText='[StateDef 253]\nanim = 200\n[State 253, scalar]\ntype = TransformClsn\nscale = 2\npivot = 4\n',cnsAritySource={available:true,dirty:false,filename:'C:/chars/Hero/collision-arity.cns',syntax:'cns',text:cnsArityText,sourceHash:hash(cnsArityText)},cnsArityContext=context({assignedSources:[cnsAritySource.filename],sources:[cnsAritySource],collisionCapabilities:{indexed:true,status:'supported',fingerprint:'nightly-cap'}}),cnsArityItem=buildAirActionUsageSnapshot(cnsArityContext).publicCollisions.items[0];assert.strictEqual(cnsArityItem.relation,'same-state','CNS scalar scale and one-coordinate pivot remain static');assert.strictEqual(cnsArityItem.fields.find(item=>item.key==='scale').compatibility,'stable');assert.strictEqual(cnsArityItem.fields.find(item=>item.key==='pivot').expression,'4','CNS pivot raw evidence is preserved');assert.strictEqual(cnsArityItem.fields.find(item=>item.key==='pivot').compatibility,'nightly');
const unknownCollision=buildAirActionUsageSnapshot({...collisionContext,collisionCapabilities:{status:'unknown',fingerprint:'unknown-cap'}}).publicCollisions.items[1];assert.strictEqual(unknownCollision.compatibility,'unresolved');assert.strictEqual(unknownCollision.fields.find(item=>item.key==='pivot').compatibility,'unresolved');
const functionCollision='[Function Shared()]\nOverrideClsn { rect: 0,0,1,1; }\n',functionCollisionSource={available:true,dirty:false,filename:'C:/chars/Hero/shared.zss',syntax:'zss',text:functionCollision,sourceHash:hash(functionCollision)};assert.strictEqual(buildAirActionUsageSnapshot(context({assignedSources:[functionCollisionSource.filename],sources:[functionCollisionSource]})).publicCollisions.items[0].relation,'global/shared');
const negativeCollision='[StateDef -2; anim: 200]\nOverrideClsn { rect: 0,0,1,1; }\n',negativeCollisionSource={available:true,dirty:false,filename:'C:/chars/Hero/global.zss',syntax:'zss',text:negativeCollision,sourceHash:hash(negativeCollision)};assert.strictEqual(buildAirActionUsageSnapshot(context({assignedSources:[negativeCollisionSource.filename],sources:[negativeCollisionSource]})).publicCollisions.items[0].relation,'global/shared');
for(const formatted of ['[ StateDef -2; anim: 200]\nOverrideClsn { group: Clsn1; rect: 0,0,1,1; }\n','[sTaTeDeF -3]\n[State -3,x]\ntype=OverrideClsn\ngroup=Clsn2\nrect=0,0,1,1\n']){const syntax=formatted.includes('{')?'zss':'cns',formattedSource={available:true,dirty:false,filename:`C:/chars/Hero/formatted.${syntax}`,syntax,text:formatted,sourceHash:hash(formatted)},item=buildAirActionUsageSnapshot(context({assignedSources:[formattedSource.filename],sources:[formattedSource]})).publicCollisions.items[0];assert.strictEqual(item.relation,'global/shared','parsed negative StateDef signature controls global/shared classification');}
const redirectedCollision='[StateDef 252; anim: 200]\nroot, OverrideClsn { rect: 0,0,1,1; }\n',redirectedCollisionSource={available:true,dirty:false,filename:'C:/chars/Hero/redirected.zss',syntax:'zss',text:redirectedCollision,sourceHash:hash(redirectedCollision)},redirectedSnapshot=buildAirActionUsageSnapshot(context({assignedSources:[redirectedCollisionSource.filename],sources:[redirectedCollisionSource],collisionToken:()=> '9'.repeat(48)}));assert.strictEqual(redirectedSnapshot.publicCollisions.items[0].relation,'unresolved');assert.strictEqual(redirectedSnapshot.publicCollisions.items[0].route,'9'.repeat(48),'runtime-owner uncertainty does not discard exact source navigation');
const unrelatedCollision='[StateDef 251]\nOverrideClsn { rect: 0,0,1,1; }\n',unrelatedCollisionSource={available:true,dirty:false,filename:'C:/chars/Hero/unrelated.zss',syntax:'zss',text:unrelatedCollision,sourceHash:hash(unrelatedCollision)};const unrelatedItem=buildAirActionUsageSnapshot(context({assignedSources:[unrelatedCollisionSource.filename],sources:[unrelatedCollisionSource]})).publicCollisions.items[0];assert.strictEqual(unrelatedItem.relation,'unresolved');assert.deepStrictEqual(unrelatedItem.relatedActions,[],'StateDef number and nearby placement never fabricate an Action relationship');
const manyCollisions=`[StateDef 260; anim: 200]\n${Array.from({length:MAX_USES_PER_ACTION+2},()=> 'OverrideClsn { rect: 0,0,1,1; }').join('\n')}\n`,manyCollisionSource={available:true,dirty:false,filename:'C:/chars/Hero/many-collision.zss',syntax:'zss',text:manyCollisions,sourceHash:hash(manyCollisions)},manyCollisionSnapshot=buildAirActionUsageSnapshot(context({assignedSources:[manyCollisionSource.filename],sources:[manyCollisionSource]}));assert.strictEqual(manyCollisionSnapshot.publicCollisions.perActionOmitted['200'],2,'selected-Action collision projection declares rows beyond the shared 256 display bound');
const overflowCollisions=`[StateDef 270; anim: 200]\n${Array.from({length:MAX_USES_TOTAL},()=> 'OverrideClsn { rect: 0,0,1,1; }').join('\n')}\n`,overflowCollisionSource={available:true,dirty:false,filename:'C:/chars/Hero/overflow-collision.zss',syntax:'zss',text:overflowCollisions,sourceHash:hash(overflowCollisions)};assert.strictEqual(buildAirActionUsageSnapshot(context({assignedSources:[overflowCollisionSource.filename],sources:[overflowCollisionSource]})).complete,false,'collisions share the combined 4096 occurrence cap instead of bypassing it');

const many = Array.from({ length: MAX_USES_PER_ACTION + 2 }, (_, index) => `[StateDef ${index}]\nanim = 200\n`).join('');
const bounded = buildAirActionUsageSnapshot(context({ assignedSources: ['C:/chars/Hero/many.cns'], sources: [{ available: true, dirty: false, filename: 'C:/chars/Hero/many.cns', syntax: 'cns', text: many, sourceHash: hash(many) }] }));
assert.strictEqual(bounded.publicUses.items.length, MAX_USES_PER_ACTION);
assert.strictEqual(bounded.publicUses.items[0].omitted, 2);
const functionOnly = `[Function fake]\nChangeAnim { value: 200; }\n`;
const functionSnapshot = buildAirActionUsageSnapshot(context({ assignedSources: ['C:/chars/Hero/fake.zss'], sources: [{ available: true, dirty: false, filename: 'C:/chars/Hero/fake.zss', syntax: 'zss', text: functionOnly, sourceHash: hash(functionOnly) }] })).publicUses;
assert.strictEqual(functionSnapshot.items.length, 0, 'a ZSS Function cannot impersonate a StateDef use');
assert.deepStrictEqual(functionSnapshot.occurrences.map(item => [item.scope, item.status, item.action]), [['function', 'unresolved', 200]], 'Function occurrences remain visible without inventing caller ownership');
const globalA = 'ChangeAnim { value: 200; }\n', globalB = 'ChangeAnim { value: 200; }\n';
const globalSources = [
  { available: true, dirty: false, filename: 'C:/chars/Hero/global-a.zss', syntax: 'zss', text: globalA, sourceHash: hash(globalA) },
  { available: true, dirty: false, filename: 'C:/chars/Hero/global-b.zss', syntax: 'zss', text: globalB, sourceHash: hash(globalB) }
];
const globalSnapshot = buildAirActionUsageSnapshot(context({ assignedSources: globalSources.map(item => item.filename), sources: globalSources })).publicUses;
assert.deepStrictEqual(globalSnapshot.occurrences.map(item => item.file), ['global-a.zss', 'global-b.zss']);
assert.deepStrictEqual(globalSnapshot.occurrences.map(item => item.sourcePath), globalSources.map(item => item.filename.replace(/\//g, require('path').sep)));
assert.strictEqual(new Set(globalSnapshot.occurrences.map(item => item.id)).size, 2, 'same-looking global occurrences in different files retain distinct source-backed identities');
assert.strictEqual(globalSnapshot.items.length, 0, 'unproven global occurrences never receive exact route authority');
const missing = cns.replace('anim = 200', 'anim = 999');
assert.strictEqual(buildAirActionUsageSnapshot(context({ assignedSources: ['C:/chars/Hero/a.cns'], sources: [{ available: true, dirty: false, filename: 'C:/chars/Hero/a.cns', syntax: 'cns', text: missing, sourceHash: hash(missing) }] })).publicUses.occurrences[0].status, 'missing', 'literal references to absent AIR actions remain visible as missing');
const overflow = Array.from({ length: MAX_USES_TOTAL + 1 }, (_, index) => `[StateDef ${index}]\nanim = 200\n`).join('');
assert.strictEqual(buildAirActionUsageSnapshot(context({ assignedSources: ['C:/chars/Hero/overflow.cns'], sources: [{ available: true, dirty: false, filename: 'C:/chars/Hero/overflow.cns', syntax: 'cns', text: overflow, sourceHash: hash(overflow) }] })).complete, false, 'global cardinality overflow fails closed instead of returning a partial exact inventory');

console.log('air_action_usage_authority tests passed');
