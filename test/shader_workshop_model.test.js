'use strict';

const assert = require('assert');
const {
  SCHEMA, SAFEGUARD_DEFINITIONS, PRESETS, defaultSafeguards, createShaderProject,
  setSafeguard, selectPreset, safeguardConflicts, buildAiShaderBrief,
  reviewGeneratedCandidate, normalizeGraph, graphSafeguardConflicts, replaceGraph, serializeShaderProject, parseShaderProject
} = require('../src/shader_workshop_model');

const defaults=defaultSafeguards();
assert.strictEqual(defaults.preservePaletteColors,true);
assert.strictEqual(defaults.preserveTransparentPixels,true);
assert.notStrictEqual(SAFEGUARD_DEFINITIONS.find(item=>item.id==='preservePaletteColors'),SAFEGUARD_DEFINITIONS.find(item=>item.id==='preserveTransparentPixels'),'palette and transparent-pixel protections are separate settings');

let project=createShaderProject({id:'ryu-charge',name:'Ryu Charge',targetKind:'sprite',now:100});
assert.strictEqual(project.schema,SCHEMA);assert.strictEqual(project.engineIndependent,true);assert.strictEqual(project.presetId,'passthrough');
project=setSafeguard(project,'preservePaletteColors',false,101);
assert.strictEqual(project.safeguards.preservePaletteColors,false);assert.strictEqual(project.safeguards.preserveTransparentPixels,true,'changing palette protection never changes transparency protection');
project=setSafeguard(project,'preservePaletteColors',true,102);
project=selectPreset(project,'outline',103);
assert.deepStrictEqual(safeguardConflicts(project).map(item=>item.safeguardId),['preserveTransparentPixels','preserveSpriteSilhouette','preventColorBleeding']);
assert.throws(()=>selectPreset(project,'crt'),/does not support/);

const brief=buildAiShaderBrief(project,'Pulsing blue outline while charging',{variations:9,assetSummary:{width:128,height:96,animated:true,indexed:true,path:'private/ryu.png',pixels:'forbidden'}});
assert.strictEqual(brief.variations,3);assert.strictEqual(brief.safeguards.preservePaletteColors,true);assert.strictEqual(brief.safeguards.preserveTransparentPixels,true);
assert.strictEqual(brief.includesSourcePixels,false);assert.strictEqual(brief.includesProjectFiles,false);assert.deepStrictEqual(Object.keys(brief.assetSummary),['width','height','animated','indexed']);assert(!JSON.stringify(brief).includes('private/ryu.png')&&!JSON.stringify(brief).includes('forbidden'));

const generated={id:'proposal-a',label:'Balanced outline',description:'Generated proposal',conflicts:['preserveTransparentPixels','preserveSpriteSilhouette','forged-setting']};
const blocked=reviewGeneratedCandidate(project,generated);
assert.strictEqual(blocked.accepted,false);assert.strictEqual(blocked.requiresExplicitOverride,true);assert.deepStrictEqual(blocked.proposedSafeguardChanges,[],'AI output never changes safeguards');
const partial=reviewGeneratedCandidate(project,generated,['preserveTransparentPixels']);assert.strictEqual(partial.accepted,false);
const approved=reviewGeneratedCandidate(project,generated,['preserveTransparentPixels','preserveSpriteSilhouette']);assert.strictEqual(approved.accepted,true);

const tint=selectPreset(project,'palette-tint',104);assert.deepStrictEqual(safeguardConflicts(tint).map(item=>item.safeguardId),['preservePaletteColors','preserveIndexedPaletteBehavior']);
assert(PRESETS.some(item=>item.id==='passthrough')&&PRESETS.some(item=>item.id==='pixelate'));

const graph=normalizeGraph({nodes:[{id:'source',type:'source-color',x:10,y:20},{id:'mix',type:'mix',label:'Charge color'},{id:'bad',type:'arbitrary-code'},{id:'mix',type:'number'}],edges:[{from:'source',to:'mix',output:'rgba',input:'a'},{from:'source',to:'missing'},{from:'mix',to:'mix'}]});
assert.deepStrictEqual(graph.nodes.map(item=>item.id),['source','mix']);assert.strictEqual(graph.edges.length,1,'graph keeps only bounded edges between admitted nodes');
const graphProject=replaceGraph(project,graph,104);assert.strictEqual(graphProject.mode,'graph');assert.deepStrictEqual(graphSafeguardConflicts(graphProject).map(item=>item.safeguardId),['preservePaletteColors','preserveIndexedPaletteBehavior']);

const roundTrip=parseShaderProject(serializeShaderProject(setSafeguard(graphProject,'preserveTransparentPixels',false,105)));
assert.strictEqual(roundTrip.id,'ryu-charge');assert.strictEqual(roundTrip.safeguards.preservePaletteColors,true);assert.strictEqual(roundTrip.safeguards.preserveTransparentPixels,false);
assert.deepStrictEqual(roundTrip.graph,graph,'reviewed visual graph survives portable project persistence');
assert.throws(()=>parseShaderProject(JSON.stringify({schema:'forged'})),/Unsupported/);
assert.throws(()=>setSafeguard(project,'forged',false),/Unknown/);

console.log('Shader Workshop preserves independent host-owned safeguards across presets, AI proposals, and project persistence');
