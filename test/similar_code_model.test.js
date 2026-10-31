'use strict';

const assert=require('assert');
const path=require('path');
const {buildSimilarCodeProjection,dependencySummary,normalizedIntentAliases}=require('../src/similar_code_model');

const root=path.resolve('C:/game/chars/Ryu');
const files=[
  {filename:path.join(root,'normals.zss'),text:`[StateDef 200; type: S; moveType: A; physics: S]\nif moveContact {\n  call CommitHit(1);\n}\nhitDef{damage: 30; ground.velocity: -4, 0}\nchangeState{value: 0}\n\n[StateDef 210; type: S; moveType: A; physics: S]\nhelper{id: 12; stateNo: 1200}\n`},
  {filename:path.join(root,'crouch.zss'),text:`[StateDef 400; type: C; moveType: A; physics: C]\nif moveContact {\n  call CommitHit(2);\n}\nhitDef{damage: 25; ground.velocity: -3, 0}\nchangeState{value: 0}\n`},
  {filename:path.join(root,'movement.zss'),text:`[StateDef 20; type: S; moveType: I; physics: S]\nvelSet{x: 4}\nif command = "holdfwd" {\n  changeState{value: 20}\n}\n`}
];

const projection=buildSimilarCodeProjection({documents:files,activeSource:{filename:files[0].filename,line:0}});
assert(projection.seed&&projection.seed.label.includes('200'),'cursor resolves the smallest comparable owning block');
assert(projection.note.includes('static structural similarity'),'provider labels scores as static assistance rather than proof');
assert(projection.items.length>0,'a structurally related project block is found');
assert.strictEqual(path.basename(projection.items[0].source.filename),'crouch.zss','the matching attack state ranks above unrelated movement/helper states');
assert(projection.items[0].description.includes('% structural similarity'));
assert(projection.seed.excerpt.includes('[StateDef 200')&&projection.items[0].excerpt.includes('[StateDef 400'),'comparison excerpts keep the current and chosen blocks visible without writing either source');
assert(projection.items[0].detail.includes('functions: CommitHit')&&projection.items[0].detail.includes('states: 0'),'literal dependencies remain visible for expert review');
assert(projection.items[0].comparison.includes('lines:')||projection.items[0].comparison.includes('No literal dependency'),'comparison reports meaningful static differences without claiming behavior');
assert(/^[a-f0-9]{64}$/.test(projection.items[0].source.fingerprint),'source navigation carries a full content fingerprint');
assert.strictEqual(projection.items[0].adaptation.mutationAllowed,false,'Similar Code exposes a dependency review without adding a second source mutation owner');
assert(projection.items[0].adaptation.rows.some(row=>row.kind==='functions'&&row.status==='already-matched'),'matching dependencies are retained as exact reviewed evidence');
assert(projection.items[0].adaptation.blockers.some(value=>/Engine compatibility/.test(value)),'unproven engine compatibility blocks adaptation insertion');

const empty=buildSimilarCodeProjection({documents:files,activeSource:{filename:path.join(root,'other.zss'),line:0}});
assert(empty.items.every(item=>item.status==='intent match'),'without an active admitted seed, only deterministic intent examples remain and no structural score is invented');
assert(empty.note.includes('native editor cursor')&&empty.note.includes('Intent matches'),'an unrelated editor keeps intent discovery but explains how to enable structural comparison');

const intentFile={filename:path.join(root,'once.zss'),text:'[StateDef 300]\n# safe authored note\nHitDef { hitOnce: 1; guardFlag: "PRIVATE_GUARD_VALUE" }\n'},intentProjection=buildSimilarCodeProjection({documents:[...files,intentFile],activeSource:{filename:files[0].filename,line:0},aliases:{'my single hit':'hitonce'},personalExamples:[{id:'pin-1',label:'My launch confirm',kind:'controller',status:'current',detail:'Original source block is unchanged.',filename:intentFile.filename,sourceLabel:'once.zss',text:'HitDef { guardFlag: "PRIVATE_PIN_VALUE" }',source:{filename:intentFile.filename,line:2,endLine:2,fingerprint:'a'.repeat(64)}}]});
const pinned=intentProjection.items.find(item=>item.kind==='personal-example'),intentRow=intentProjection.items.find(item=>item.aliases?.includes('my single hit'));
assert(pinned&&pinned.label==='My launch confirm'&&pinned.source,'owner-resolved personal labels join the existing Similar Code provider');assert(!JSON.stringify(pinned).includes('PRIVATE_PIN_VALUE'),'personal example previews mask literal string contents');
assert(intentRow&&intentRow.source&&intentRow.aliases.includes('hit once'),'built-in and custom intent phrases discover one admitted project block');assert(!JSON.stringify(intentRow).includes('PRIVATE_GUARD_VALUE'),'intent discovery metadata and previews mask literal strings');
const ambiguousIntent=buildSimilarCodeProjection({documents:[intentFile,{filename:path.join(root,'twice.zss'),text:intentFile.text}],aliases:{'my single hit':'hitonce'}});assert(ambiguousIntent.aliasCollisions.some(item=>item.phrase==='my single hit')&&!ambiguousIntent.items.some(item=>item.aliases?.includes('my single hit')),'ambiguous intent aliases stay visible but never create a source route');
const stalePin=buildSimilarCodeProjection({documents:files,personalExamples:[{id:'stale',label:'Old setup',kind:'state',status:'changed',detail:'Source changed.',filename:files[0].filename}]});const staleRow=stalePin.items.find(item=>item.label==='Old setup');assert(staleRow&&!staleRow.source&&!staleRow.excerpt,'changed personal examples remain visible but cannot open or compare as working references');
const saturatedText=Array.from({length:72},(_,index)=>`[StateDef ${1000+index}]\nif moveContact { call CommitHit(${index}); }\nhitDef { damage: ${20+index}; }`).join('\n'),saturatedFile={filename:path.join(root,'saturated.zss'),text:saturatedText},saturatedPin={id:'sat-pin',label:'Named saturation pin',kind:'state',status:'current',detail:'unchanged',filename:saturatedFile.filename,sourceLabel:'saturated.zss',text:'[StateDef 1001]',source:{filename:saturatedFile.filename,line:3,endLine:5,fingerprint:'c'.repeat(64)}},saturated=buildSimilarCodeProjection({documents:[saturatedFile,intentFile],activeSource:{filename:saturatedFile.filename,line:0},aliases:{'single saturated hit':'hitonce'},personalExamples:[saturatedPin]});
assert.strictEqual(saturated.items.length,48);assert(saturated.items.some(item=>item.label==='Named saturation pin')&&saturated.items.some(item=>item.aliases?.includes('single saturated hit')),'bounded structural saturation reserves discovery capacity for both a named pin and deterministic intent row');
const manyPins=Array.from({length:64},(_,index)=>({...saturatedPin,id:`many-${index}`,label:`Named pin ${index}`})),categorySaturation=buildSimilarCodeProjection({documents:[saturatedFile,intentFile],activeSource:{filename:saturatedFile.filename,line:0},aliases:{'single saturated hit':'hitonce'},personalExamples:manyPins});
assert(categorySaturation.items.some(item=>item.kind==='personal-example')&&categorySaturation.items.some(item=>item.aliases?.includes('single saturated hit')),'the bounded discovery intake reserves final capacity independently for personal pins and deterministic intent matches');
const sameRangePin={id:'same-range',label:'My named same-range pin',kind:'controller',status:'current',detail:'unchanged',filename:files[1].filename,sourceLabel:'crouch.zss',text:files[1].text.split(/\r?\n/).slice(2,5).join('\n'),source:{filename:files[1].filename,line:2,endLine:4,fingerprint:require('crypto').createHash('sha256').update(files[1].text).digest('hex')}},sameRange=buildSimilarCodeProjection({documents:files,activeSource:{filename:files[0].filename,line:0},personalExamples:[sameRangePin]});assert(sameRange.items.some(item=>item.label==='My named same-range pin'&&item.kind==='personal-example'),'same-range deduplication retains the user-defined personal label/status as a separate bookmark row');
const oversizedAlias=buildSimilarCodeProjection({documents:[intentFile],aliases:{'unsafe alias':'x'.repeat(513)}});assert(!oversizedAlias.items.some(item=>item.aliases?.includes('unsafe alias')),'oversized alias targets are rejected before matching');
const excessiveAliases={};for(let index=0;index<600;index+=1)excessiveAliases[`alias ${index}`]='hitonce';assert(!normalizedIntentAliases(excessiveAliases).some(item=>item.phrase==='alias 599'),'configured alias iteration stops at the 512-key intake bound without materializing the remainder');

const dependencies=dependencySummary('map(Hit Count) := call Commit(2); changeState{value: 300}; playSnd{value: 2, 4}; let speed = const(Move.Speed); if command = "punch" { helper{id: 20}; explod{id: 30}; projectile{projID: 40} }');
assert.deepStrictEqual(dependencies.functions,['Commit']);
assert.deepStrictEqual(dependencies.maps,['Hit Count']);
assert.deepStrictEqual(dependencies.states,['300']);
assert.deepStrictEqual(dependencies.sounds,['2, 4']);
assert.deepStrictEqual(dependencies.constants,['Move.Speed']);assert.deepStrictEqual(dependencies.commands,['punch']);assert.deepStrictEqual(dependencies.helpers,['20']);assert.deepStrictEqual(dependencies.explods,['30']);assert.deepStrictEqual(dependencies.projectiles,['40']);

console.log('Similar Code ranks bounded connected blocks and exposes reviewable dependencies');
