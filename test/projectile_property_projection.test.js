'use strict';

const assert=require('assert');
const path=require('path');
const {hash}=require('../src/mutation_safety');
const {GROUPS,FIELD_ORIGIN,projectProjectileProperties}=require('../src/projectile_property_projection');

function component(text,syntax='cns'){
 const lines=text.split(/\r?\n/),startLine=1;let endLine=lines.length-1;while(endLine>startLine&&lines[endLine]==='')endLine--;const sourceText=lines.slice(startLine,endLine+1).join(text.includes('\r\n')?'\r\n':'\n');return{kind:'projectile',filename:path.resolve(`shot.${syntax}`),startLine,endLine,syntax,sourceText,sourceHash:hash(text),rangeHash:hash(sourceText)};
}

const cns='[StateDef 200]\r\n[State 200, shot]\r\ntype = Projectile\r\nprojid = 7\r\nprojanim = 600 ; exact\r\nprojhitanim = ifelse(var(1), 601, 602)\r\nprojremanim = 603\r\nprojcancelanim = 604\r\noffset = 12, -3\r\nvelocity = 4.5, 0\r\nprojpriority = 4\r\nprojsprpriority = -2\r\nprojlayerno = 1\r\nProjShadow = -1\r\nSuperMoveTime = ifelse(var(1), 30, 0)\r\nPauseMoveTime = 12\r\nOwnPal = 1\r\nRemapPal = 1, var(20)\r\nAfterImage.Time = 8\r\ncustomOption = "projanim = 999"\r\n';
const projected=projectProjectileProperties(component(cns),cns);
assert.strictEqual(projected.status,'ready');
assert.deepStrictEqual(projected.groups.map(group=>group.id),['identity','animations','motion','geometry','rendering','lifecycle']);
assert.strictEqual(projected.groups.find(group=>group.id==='rendering').label,'Rendering, palette, and pause behavior');
assert.deepStrictEqual(projected.fields.filter(field=>field.animation).map(field=>field.name),['projanim','projhitanim','projremanim','projcancelanim'],'the four animation roles remain distinct');
assert.strictEqual(projected.fields.find(field=>field.name==='projanim').value,600);
assert.strictEqual(projected.fields.find(field=>field.name==='projhitanim').status,'dynamic');
assert.strictEqual(projected.fields.find(field=>field.name==='projremove').status,'omitted','omitted fields are explicit and receive no default');
assert.strictEqual(projected.fields.find(field=>field.name==='projpriority').expression,'4');
assert.strictEqual(projected.fields.find(field=>field.name==='projsprpriority').expression,'-2','contact priority and sprite priority namespaces never collapse');
assert.strictEqual(projected.fields.find(field=>field.name==='projlayerno').expression,'1');
assert.strictEqual(projected.fields.find(field=>field.name==='projlayerno').origin,'ikemen-extension');
assert.strictEqual(projected.fields.find(field=>field.name==='projlayerno').compatibilityLabel,'IKEMEN extension · Stable 1.0');
assert.strictEqual(projected.fields.find(field=>field.name==='projanim').origin,'classic');
assert.strictEqual(projected.fields.find(field=>field.name==='projanim').compatibilityLabel,'Classic MUGEN / IKEMEN');
assert.strictEqual(projected.fields.find(field=>field.name==='projshadow').authoredName,'ProjShadow');
assert.strictEqual(projected.fields.find(field=>field.name==='projshadow').expression,'-1');
assert.strictEqual(projected.fields.find(field=>field.name==='supermovetime').expression,'ifelse(var(1), 30, 0)');
assert.strictEqual(projected.fields.find(field=>field.name==='supermovetime').status,'dynamic');
assert.strictEqual(projected.fields.find(field=>field.name==='pausemovetime').expression,'12');
assert.strictEqual(projected.fields.find(field=>field.name==='ownpal').expression,'1');
assert.strictEqual(projected.fields.find(field=>field.name==='remappal').expression,'1, var(20)');
assert.strictEqual(projected.fields.find(field=>field.name==='afterimage.time').authoredName,'AfterImage.Time');
for(const name of ['projshadow','supermovetime','pausemovetime','ownpal','remappal','afterimage.time']){
 assert.strictEqual(projected.fields.find(field=>field.name===name).origin,'classic');
 assert.strictEqual(projected.fields.find(field=>field.name===name).compatibilityLabel,'Classic MUGEN / IKEMEN');
}
assert.strictEqual(projected.unknown.length,1);assert.strictEqual(projected.unknown[0].name,'customOption');

const duplicate=cns.replace('projanim = 600 ; exact','projanim = 600\r\nprojanim = 601');
assert.strictEqual(projectProjectileProperties(component(duplicate),duplicate).fields.find(field=>field.name==='projanim').status,'duplicate');
const stale={...component(cns),rangeHash:'stale'};assert.strictEqual(projectProjectileProperties(stale,cns).status,'unavailable');

const zss='[StateDef 200]\nprojectile {\n  projid: 8;\n  projanim: 700; // exact\n  projhitanim: map(Shot.HitAnim);\n  projremanim: 701;\n  projcancelanim: 702;\n  postype: p1;\n  offset: 2, -4;\n  velocity: 5, 0;\n  remvelocity: 0, 0;\n  accel: 0, .2;\n  velmul: 1, 1;\n  projscale: 1, 1;\n  projangle: 0;\n  projsprpriority: 3;\n  projlayerno: -1;\n  projshadow: -1;\n  supermovetime: 30;\n  pausemovetime: 12;\n  ownpal: 1;\n  remappal: 1, 2;\n  afterimage.time: 8;\n  projremove: 1;\n  projremovetime: -1;\n  projhits: 2;\n  projmisstime: 5;\n  projpriority: 3;\n  projedgebound: 40;\n  projstagebound: 40;\n  projheightbound: -240, 0;\n}\n';
const zssProjection=projectProjectileProperties(component(zss,'zss'),zss);
assert.strictEqual(zssProjection.status,'ready');assert.strictEqual(zssProjection.fields.find(field=>field.name==='projanim').value,700);assert.strictEqual(zssProjection.fields.find(field=>field.name==='projhitanim').status,'dynamic');assert.strictEqual(zssProjection.unknown.length,0);
assert(!/nightly|capabilit|engineTarget/i.test(JSON.stringify(zssProjection)),'raw projection is Stable/Nightly-neutral');
assert.strictEqual(zssProjection.fields.find(field=>field.name==='afterimage.time').expression,'8');
const catalog=require('../data/sctrl.json'),metadata=catalog.find(controller=>String(controller.name).toLowerCase()==='projectile'),metadataFields=new Set((metadata.params||[]).map(param=>String(param.name).toLowerCase()));
for(const name of GROUPS.flatMap(group=>group.fields)){assert(metadataFields.has(name),`${name} is bound to local authoritative Projectile metadata`);assert(FIELD_ORIGIN[name],`${name} has explicit provenance`);}
assert.deepStrictEqual([...new Set(zssProjection.fields.filter(field=>field.origin==='ikemen-extension').map(field=>field.name))],['projangle','projlayerno']);
console.log('Projectile authored-property projection is bounded, exact, read-only, and namespace-safe');
