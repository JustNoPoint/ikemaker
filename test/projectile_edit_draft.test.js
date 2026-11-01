'use strict';

const assert = require('assert');
const path = require('path');
const { hash } = require('../src/mutation_safety');
const { validValue, createProjectileEditDraft, previewProjectileEdit } = require('../src/projectile_edit_draft');

function component(text, syntax = 'cns') {
  const eol = text.includes('\r\n') ? '\r\n' : '\n', lines = text.split(/\r?\n/), startLine = 1;
  let endLine = lines.length - 1;
  while (endLine > startLine && lines[endLine] === '') endLine -= 1;
  const sourceText = lines.slice(startLine, endLine + 1).join(eol);
  return { kind: 'projectile', filename: path.resolve(`guarded-shot.${syntax}`), startLine, endLine, syntax, sourceText, sourceHash: hash(text), rangeHash: hash(sourceText) };
}

const cns = '[StateDef 200]\r\n[State 200, shot]\r\ntype = Projectile\r\nprojanim = 600 ; keep this comment\r\nprojhitanim = 601\r\nprojremanim = 602\r\nprojcancelanim = 603\r\npostype = P1\r\noffset = 12, -3\r\nvelocity = 4.5, 0\r\nremvelocity = 0, -1\r\naccel = 0, .2\r\nvelmul = 1, 1\r\nprojremovetime = -1\r\nprojremove = -2 ; nonzero remains authored\r\nprojhits = 3\r\nprojmisstime = 8\r\nprojpriority = 4\r\nprojscale = 1, 1\r\nprojsprpriority = -2\r\nProjAngle = 0\r\nProjLayerNo = -1\r\nProjEdgeBound = 40 ; preserve bound comment\r\nProjStageBound = 40\r\nProjHeightBound = -240, 0\r\nProjShadow = -1\r\nSuperMoveTime = -1\r\nPauseMoveTime = 0\r\nOwnPal = 2 ; preserve nonzero authored value\r\nRemapPal = 1, 2\r\nAfterImage.Time = 8\r\nDamage = 60, 4 ; keep contact comment\r\nPauseTime = 8, 11\r\nGuard.PauseTime = 7, 9\r\nGround.SlideTime = 14\r\nGround.HitTime = 15\r\nGuard.SlideTime = 12\r\nGuard.HitTime = 13\r\nAir.HitTime = 20\r\nGround.Velocity = -4.5, 0\r\nGuard.Velocity = -3.5\r\nAir.Velocity = -4, -7\r\nYAccel = .35\r\nGuard.CtrlTime = 10\r\nAirGuard.CtrlTime = 11\r\nAir.Juggle = 4\r\nNumHits = 2\r\ncustom = ifelse(var(1), 2, 3)\r\n';
const draft = createProjectileEditDraft(component(cns), cns);
assert(draft && Object.isFrozen(draft));
const pushTargets = ['airguard.velocity', 'ground.cornerpush.veloff', 'air.cornerpush.veloff', 'down.cornerpush.veloff', 'guard.cornerpush.veloff', 'airguard.cornerpush.veloff'];
const outcomeTargets = ['hitonce', 'kill', 'guard.kill', 'fall.kill', 'fall', 'air.fall', 'forcenofall', 'fall.recover', 'down.bounce'];
const responseTargets = ['fall.xvelocity', 'fall.yvelocity', 'down.velocity', 'fall.recovertime', 'fall.damage', 'down.hittime'];
const positionTargets = ['mindist', 'maxdist', 'snap', 'p1sprpriority', 'p2sprpriority', 'p1stateno', 'p2stateno'];
const policyTargets = ['p1facing', 'p1getp2facing', 'p2facing', 'p2getp1state', 'forcestand'];
const classificationTargets = ['attr', 'hitflag', 'guardflag', 'affectteam'];
const reactionTargets = ['animtype', 'air.animtype', 'fall.animtype', 'ground.type', 'air.type'];
const chainingTargets = ['priority', 'id', 'chainid', 'nochainid'];
const powerTargets = ['getpower', 'givepower'];
const presentationTargets = ['sparkno', 'guard.sparkno', 'sparkxy', 'hitsound', 'guardsound'];
const omittedTargets = [...pushTargets, ...outcomeTargets, ...responseTargets, ...positionTargets, ...policyTargets, ...classificationTargets, ...reactionTargets, ...chainingTargets, ...powerTargets, ...presentationTargets];
assert.deepStrictEqual(draft.fields.map(field => field.target), ['projanim', 'projhitanim', 'projremanim', 'projcancelanim', 'postype', 'offset', 'velocity', 'remvelocity', 'accel', 'velmul', 'projremovetime', 'projremove', 'projhits', 'projmisstime', 'projpriority', 'projscale', 'projsprpriority', 'projangle', 'projlayerno', 'projedgebound', 'projstagebound', 'projheightbound', 'projshadow', 'supermovetime', 'pausemovetime', 'ownpal', 'remappal', 'afterimage.time', 'damage', 'pausetime', 'guard.pausetime', 'ground.slidetime', 'ground.hittime', 'guard.slidetime', 'guard.hittime', 'air.hittime', 'ground.velocity', 'guard.velocity', 'air.velocity', 'yaccel', 'guard.ctrltime', 'airguard.ctrltime', 'air.juggle', 'numhits', ...omittedTargets]);
assert(draft.fields.filter(field => !omittedTargets.includes(field.target)).every(field => field.editable), 'all conservative authored fields in the comprehensive fixture are editable');
assert(omittedTargets.every(target => draft.fields.find(field => field.target === target).status === 'omitted'));
const preview = previewProjectileEdit(draft, cns, { projanim: '610', projhitanim: '611', projremanim: '612', projcancelanim: '613', postype: 'front', offset: '14, -4', velocity: '5, 0', remvelocity: '-1, 2', accel: '0, .25', velmul: '.95, 1', projremovetime: '30', projremove: '-7', projhits: '12', projmisstime: '18', projpriority: '10', projscale: '1.25, .8', projsprpriority: '6', projangle: '-22.5', projlayerno: '1', projedgebound: '-400', projstagebound: '1200', projheightbound: '-1000, 250', projshadow: '3', supermovetime: '45', pausemovetime: '-2', ownpal: '-3', remappal: '-1, 12', 'afterimage.time': '24', damage: '-120, 15', pausetime: '10, 14', 'guard.pausetime': '9, 12', 'ground.slidetime': '-140', 'ground.hittime': '150', 'guard.slidetime': '-12', 'guard.hittime': '130', 'air.hittime': '200', 'ground.velocity': '-5.25, .5', 'guard.velocity': '-4.25', 'air.velocity': '-5, -8.5', yaccel: '.4', 'guard.ctrltime': '-10', 'airguard.ctrltime': '12', 'air.juggle': '6', numhits: '3' });
assert.strictEqual(preview.status, 'ready');
assert.strictEqual(preview.replacements.length, 44);
assert(preview.sourceAfter.includes('projanim = 610 ; keep this comment'));
assert(preview.sourceAfter.includes('projhitanim = 611'));
assert(preview.sourceAfter.includes('projremanim = 612'));
assert(preview.sourceAfter.includes('projcancelanim = 613'));
assert(preview.sourceAfter.includes('remvelocity = -1, 2'));
assert(preview.sourceAfter.includes('velmul = .95, 1'));
assert(preview.sourceAfter.includes('projremove = -7 ; nonzero remains authored'));
assert(preview.sourceAfter.includes('projhits = 12'));
assert(preview.sourceAfter.includes('projmisstime = 18'));
assert(preview.sourceAfter.includes('projpriority = 10'));
assert(preview.sourceAfter.includes('projscale = 1.25, .8'));
assert(preview.sourceAfter.includes('projsprpriority = 6'));
assert(preview.sourceAfter.includes('ProjAngle = -22.5'),'authored CNS casing is preserved');
assert(preview.sourceAfter.includes('ProjLayerNo = 1'),'authored layer casing is preserved');
assert(preview.sourceAfter.includes('ProjEdgeBound = -400 ; preserve bound comment'));
assert(preview.sourceAfter.includes('ProjStageBound = 1200'));
assert(preview.sourceAfter.includes('ProjHeightBound = -1000, 250'));
assert(preview.sourceAfter.includes('ProjShadow = 3'));
assert(preview.sourceAfter.includes('SuperMoveTime = 45'));
assert(preview.sourceAfter.includes('PauseMoveTime = -2'));
assert(preview.sourceAfter.includes('OwnPal = -3 ; preserve nonzero authored value'));
assert(preview.sourceAfter.includes('RemapPal = -1, 12'));
assert(preview.sourceAfter.includes('AfterImage.Time = 24'),'dotted authored CNS casing is preserved');
assert(preview.sourceAfter.includes('Damage = -120, 15 ; keep contact comment'),'contact casing/comment survive a longer replacement');
assert(preview.sourceAfter.includes('PauseTime = 10, 14'));
assert(preview.sourceAfter.includes('Guard.PauseTime = 9, 12'),'dotted contact casing survives simultaneous length shifts');
assert(preview.sourceAfter.includes('Ground.SlideTime = -140'));
assert(preview.sourceAfter.includes('Ground.HitTime = 150'));
assert(preview.sourceAfter.includes('Guard.SlideTime = -12'));
assert(preview.sourceAfter.includes('Guard.HitTime = 130'));
assert(preview.sourceAfter.includes('Air.HitTime = 200'));
assert(preview.sourceAfter.includes('Ground.Velocity = -5.25, .5'));
assert(preview.sourceAfter.includes('Guard.Velocity = -4.25'));
assert(preview.sourceAfter.includes('Air.Velocity = -5, -8.5'));
assert(preview.sourceAfter.includes('YAccel = .4'));
assert(preview.sourceAfter.includes('Guard.CtrlTime = -10'));
assert(preview.sourceAfter.includes('AirGuard.CtrlTime = 12'));
assert(preview.sourceAfter.includes('Air.Juggle = 6'));
assert(preview.sourceAfter.includes('NumHits = 3'));
assert(preview.sourceAfter.includes('custom = ifelse(var(1), 2, 3)'));
assert(preview.sourceAfter.includes('\r\n'), 'CRLF and untouched bytes survive exact expression replacement');
assert.strictEqual(hash(preview.sourceAfter), preview.expectedSourceHash);
assert.strictEqual(previewProjectileEdit(draft, cns, Object.fromEntries(draft.fields.filter(field => field.editable).map(field => [field.target, field.expression]))).status, 'no-op');
assert.strictEqual(previewProjectileEdit(draft, cns.replace('custom =', 'custom2 ='), { projanim: '602' }), null, 'source drift invalidates the draft');
assert.strictEqual(previewProjectileEdit(draft, cns, { unknown: '1' }), null, 'unknown fields fail closed');

const zss = '[StateDef 200]\nprojectile {\n  projanim: 700; // keep\n  projhitanim: 701;\n  projremanim: 702;\n  projcancelanim: 703;\n  postype: p2;\n  offset: 2, -4;\n  velocity: 5, 0;\n  remvelocity: 0, 0;\n  accel: 0, .2;\n  velmul: 1, 1;\n  projremovetime: -1;\n  projremove: 1;\n  projhits: 2;\n  projmisstime: 5;\n  projpriority: 3;\n  projscale: 1, 1;\n  projsprpriority: 3;\n  projangle: 0;\n  projlayerno: -1;\n  projedgebound: 40; // keep bound\n  projstagebound: 40;\n  projheightbound: -240, 0;\n  projshadow: -1;\n  supermovetime: -1;\n  pausemovetime: 0;\n  ownpal: 2; // keep nonzero\n  remappal: 1, 2;\n  afterimage.time: 8;\n  damage: 50, 5;\n  pausetime: 7, 8;\n  guard.pausetime: 6, 7;\n  ground.slidetime: 10;\n  ground.hittime: 11;\n  guard.slidetime: 8;\n  guard.hittime: 9;\n  air.hittime: 14;\n  ground.velocity: -4;\n  guard.velocity: -3;\n  air.velocity: -4, -7;\n  yaccel: .35;\n  guard.ctrltime: 10;\n  airguard.ctrltime: 11;\n  air.juggle: 4;\n  numhits: 2;\n  custom: map(Shot.Speed);\n}\n';
const zssDraft = createProjectileEditDraft(component(zss, 'zss'), zss);
const zssPreview = previewProjectileEdit(zssDraft, zss, { velocity: '-2.5, .75', projedgebound: '-120', projstagebound: '2048', projheightbound: '-1000, 360', projshadow: '4', supermovetime: '40', pausemovetime: '-3', ownpal: '7', remappal: '-1, 22', 'afterimage.time': '32', damage: '75, 0', pausetime: '9, 10', 'guard.pausetime': '8, 9', 'ground.slidetime': '12', 'ground.hittime': '13', 'guard.slidetime': '10', 'guard.hittime': '11', 'air.hittime': '16', 'ground.velocity': '-5', 'guard.velocity': '-4', 'air.velocity': '-5, -8', yaccel: '.4', 'guard.ctrltime': '12', 'airguard.ctrltime': '13', 'air.juggle': '5', numhits: '3' });
assert(zssPreview.sourceAfter.includes('velocity: -2.5, .75;'));
assert(zssPreview.sourceAfter.includes('// keep'));
assert(zssPreview.sourceAfter.includes('projedgebound: -120; // keep bound'));
assert(zssPreview.sourceAfter.includes('projstagebound: 2048;'));
assert(zssPreview.sourceAfter.includes('projheightbound: -1000, 360;'));
assert(zssPreview.sourceAfter.includes('projshadow: 4;'));
assert(zssPreview.sourceAfter.includes('supermovetime: 40;'));
assert(zssPreview.sourceAfter.includes('pausemovetime: -3;'));
assert(zssPreview.sourceAfter.includes('ownpal: 7; // keep nonzero'));
assert(zssPreview.sourceAfter.includes('remappal: -1, 22;'));
assert(zssPreview.sourceAfter.includes('afterimage.time: 32;'));
assert(zssPreview.sourceAfter.includes('damage: 75, 0;'));
assert(zssPreview.sourceAfter.includes('pausetime: 9, 10;'));
assert(zssPreview.sourceAfter.includes('guard.pausetime: 8, 9;'));
assert(zssPreview.sourceAfter.includes('ground.slidetime: 12;'));
assert(zssPreview.sourceAfter.includes('ground.hittime: 13;'));
assert(zssPreview.sourceAfter.includes('guard.slidetime: 10;'));
assert(zssPreview.sourceAfter.includes('guard.hittime: 11;'));
assert(zssPreview.sourceAfter.includes('air.hittime: 16;'));
assert(zssPreview.sourceAfter.includes('ground.velocity: -5;'),'one-value ground velocity arity is preserved');
assert(zssPreview.sourceAfter.includes('guard.velocity: -4;'));
assert(zssPreview.sourceAfter.includes('air.velocity: -5, -8;'));
assert(zssPreview.sourceAfter.includes('yaccel: .4;'));
assert(zssPreview.sourceAfter.includes('guard.ctrltime: 12;'));
assert(zssPreview.sourceAfter.includes('airguard.ctrltime: 13;'));
assert(zssPreview.sourceAfter.includes('air.juggle: 5;'));
assert(zssPreview.sourceAfter.includes('numhits: 3;'));
assert.strictEqual(previewProjectileEdit(zssDraft, zss, { 'ground.velocity': '-5, 0' }), null, 'ground velocity cannot infer a missing authored axis');
assert(zssPreview.sourceAfter.includes('custom: map(Shot.Speed);'));

const guarded = '[StateDef 200]\nprojectile {\n  projanim: map(Shot.Anim);\n  postype: p1;\n  offset: 1, 2;\n  velocity: 3, 4;\n  velocity: 5, 6;\n  projedgebound: 40;\n  projedgebound: 80;\n  projstagebound: map(StageBound);\n  projheightbound: -240.5, 0;\n  custom: 1;\n}\n';
const guardedDraft = createProjectileEditDraft(component(guarded, 'zss'), guarded);
assert.strictEqual(guardedDraft.fields.find(field => field.target === 'projanim').status, 'dynamic');
assert.strictEqual(guardedDraft.fields.find(field => field.target === 'velocity').status, 'duplicate');
assert.strictEqual(guardedDraft.fields.find(field => field.target === 'accel').status, 'omitted');
assert.strictEqual(guardedDraft.fields.find(field => field.target === 'projedgebound').status, 'duplicate');
assert.strictEqual(guardedDraft.fields.find(field => field.target === 'projstagebound').status, 'dynamic');
assert.strictEqual(guardedDraft.fields.find(field => field.target === 'projheightbound').status, 'dynamic');
assert.strictEqual(previewProjectileEdit(guardedDraft, guarded, { projanim: '800' }), null);
assert.strictEqual(previewProjectileEdit(guardedDraft, guarded, { velocity: '7, 8' }), null);
assert.strictEqual(previewProjectileEdit(guardedDraft, guarded, { accel: '0, 1' }), null);
assert.strictEqual(previewProjectileEdit(guardedDraft, guarded, { projedgebound: '-40' }), null);
assert.strictEqual(previewProjectileEdit(guardedDraft, guarded, { projstagebound: '400' }), null);
assert.strictEqual(previewProjectileEdit(guardedDraft, guarded, { projheightbound: '-240, 0' }), null);

const guardedRendering = '[StateDef 200]\nprojectile {\n  projshadow: map(Shadow);\n  supermovetime: 30;\n  supermovetime: 40;\n  pausemovetime: 1.5;\n  ownpal: ifelse(var(1), 1, 0);\n  remappal: 1, 2;\n  remappal: 1, 3;\n  afterimage.time: map(TrailTime);\n}\n';
const guardedRenderingDraft = createProjectileEditDraft(component(guardedRendering, 'zss'), guardedRendering);
for (const target of ['projshadow', 'pausemovetime', 'ownpal', 'afterimage.time']) assert.strictEqual(guardedRenderingDraft.fields.find(field => field.target === target).status, 'dynamic');
for (const target of ['supermovetime', 'remappal']) assert.strictEqual(guardedRenderingDraft.fields.find(field => field.target === target).status, 'duplicate');
for (const target of ['projshadow', 'supermovetime', 'pausemovetime', 'ownpal', 'remappal', 'afterimage.time']) assert.strictEqual(previewProjectileEdit(guardedRenderingDraft, guardedRendering, { [target]: target === 'remappal' ? '2, 3' : '2' }), null);

const guardedContact = '[StateDef 200]\nprojectile {\n  damage: 60, var(1);\n  pausetime: 8, 9;\n  pausetime: 9, 10;\n  guard.pausetime: 7.5, 8;\n}\n';
const guardedContactDraft = createProjectileEditDraft(component(guardedContact, 'zss'), guardedContact);
assert.strictEqual(guardedContactDraft.fields.find(field => field.target === 'damage').status, 'dynamic');
assert.strictEqual(guardedContactDraft.fields.find(field => field.target === 'pausetime').status, 'duplicate');
assert.strictEqual(guardedContactDraft.fields.find(field => field.target === 'guard.pausetime').status, 'dynamic');
for (const target of ['damage', 'pausetime', 'guard.pausetime']) assert.strictEqual(previewProjectileEdit(guardedContactDraft, guardedContact, { [target]: '1, 2' }), null);

for (const syntax of ['cns', 'zss']) {
  const separator = syntax === 'cns' ? ' = ' : ': ', end = syntax === 'cns' ? '' : ';', open = syntax === 'cns' ? '[State 200, push]\ntype = Projectile\n' : 'projectile {\n', close = syntax === 'cns' ? '' : '}\n';
  const authored = [
    ['AirGuard.Velocity', '-3, -6'], ['Ground.CornerPush.VelOff', '-4'], ['Air.CornerPush.VelOff', '-3'],
    ['Down.CornerPush.VelOff', '-2'], ['Guard.CornerPush.VelOff', '-1'], ['AirGuard.CornerPush.VelOff', '-.5']
  ];
  const comment = syntax === 'cns' ? ' ; keep push' : ' // keep push';
  const text = '[StateDef 200]\n' + open + authored.map(([name, value], index) => `  ${name}${separator}${value}${end}${index === 0 ? comment : ''}\n`).join('') + close;
  const pushDraft = createProjectileEditDraft(component(text, syntax), text);
  assert(pushTargets.every(target => pushDraft.fields.find(field => field.target === target).editable), `${syntax} push literals are independently editable`);
  const values = { 'airguard.velocity': '-4.5, -7', 'ground.cornerpush.veloff': '-5', 'air.cornerpush.veloff': '-4', 'down.cornerpush.veloff': '-3', 'guard.cornerpush.veloff': '-2', 'airguard.cornerpush.veloff': '-1' };
  const pushPreview = previewProjectileEdit(pushDraft, text, values);
  assert(pushPreview && pushPreview.replacements.length === 6);
  assert(pushPreview.sourceAfter.includes('AirGuard.Velocity' + separator + '-4.5, -7' + end + comment));
  assert(pushPreview.sourceAfter.includes('AirGuard.CornerPush.VelOff' + separator + '-1' + end));
}

const invalidPush = '[StateDef 200]\nprojectile {\n  airguard.velocity: -3, map(Y);\n  ground.cornerpush.veloff: -4, 0;\n  air.cornerpush.veloff: Infinity;\n  down.cornerpush.veloff: -2;\n  down.cornerpush.veloff: -3;\n}\n';
const invalidPushDraft = createProjectileEditDraft(component(invalidPush, 'zss'), invalidPush);
for (const target of ['airguard.velocity', 'ground.cornerpush.veloff', 'air.cornerpush.veloff', 'down.cornerpush.veloff']) assert(!invalidPushDraft.fields.find(field => field.target === target).editable);
for (const target of pushTargets) assert.strictEqual(previewProjectileEdit(invalidPushDraft, invalidPush, { [target]: target === 'airguard.velocity' ? '-4, -7' : '-4' }), null);

for (const syntax of ['cns', 'zss']) {
  const separator = syntax === 'cns' ? ' = ' : ': ', end = syntax === 'cns' ? '' : ';', open = syntax === 'cns' ? '[State 200, outcome]\nType = Projectile\n' : 'projectile {\n', close = syntax === 'cns' ? '' : '}\n', comment = syntax === 'cns' ? ' ; keep outcome' : ' // keep outcome';
  const authored = [['HitOnce', '2'], ['Kill', '-1'], ['Guard.Kill', '3'], ['Fall.Kill', '4'], ['Fall', '5'], ['Air.Fall', '6'], ['ForceNoFall', '7'], ['Fall.Recover', '8'], ['Down.Bounce', '9']];
  const text = '[StateDef 200]\n' + open + authored.map(([name, value], index) => `  ${name}${separator}${value}${end}${index === 0 ? comment : ''}\n`).join('') + close;
  const outcomeDraft = createProjectileEditDraft(component(text, syntax), text);
  assert(outcomeTargets.every(target => outcomeDraft.fields.find(field => field.target === target).editable), `${syntax} outcome integers are independently editable`);
  const values = Object.fromEntries(outcomeTargets.map((target, index) => [target, String(index - 5)]));
  const outcomePreview = previewProjectileEdit(outcomeDraft, text, values);
  assert(outcomePreview && outcomePreview.replacements.length === 9);
  assert(outcomePreview.sourceAfter.includes('HitOnce' + separator + '-5' + end + comment),'authored nonzero/negative outcome is preserved exactly');
  assert(outcomePreview.sourceAfter.includes('Down.Bounce' + separator + '3' + end));
}

const invalidOutcome = '[StateDef 200]\nprojectile {\n  hitonce: ifelse(var(1), 1, 0);\n  kill: 1.5;\n  guard.kill: 1;\n  guard.kill: 0;\n}\n';
const invalidOutcomeDraft = createProjectileEditDraft(component(invalidOutcome, 'zss'), invalidOutcome);
for (const target of ['hitonce', 'kill', 'guard.kill']) assert(!invalidOutcomeDraft.fields.find(field => field.target === target).editable);
for (const target of outcomeTargets) assert.strictEqual(previewProjectileEdit(invalidOutcomeDraft, invalidOutcome, { [target]: '-2' }), null);

for (const syntax of ['cns', 'zss']) {
  const separator = syntax === 'cns' ? ' = ' : ': ', end = syntax === 'cns' ? '' : ';', open = syntax === 'cns' ? '[State 200, response]\nType = Projectile\n' : 'projectile {\n', close = syntax === 'cns' ? '' : '}\n', comment = syntax === 'cns' ? ' ; keep response' : ' // keep response';
  const authored = [['Fall.XVelocity', '-2.5'], ['Fall.YVelocity', '-6'], ['Down.Velocity', '-3, -4'], ['Fall.RecoverTime', '30'], ['Fall.Damage', '10'], ['Down.HitTime', '20']];
  const text = '[StateDef 200]\n' + open + authored.map(([name, value], index) => `  ${name}${separator}${value}${end}${index === 0 ? comment : ''}\n`).join('') + close;
  const responseDraft = createProjectileEditDraft(component(text, syntax), text);
  assert(responseTargets.every(target => responseDraft.fields.find(field => field.target === target).editable), `${syntax} classic response values are independently editable`);
  const values = { 'fall.xvelocity': '-3.25', 'fall.yvelocity': '-7.5', 'down.velocity': '-4, -5', 'fall.recovertime': '45', 'fall.damage': '-12', 'down.hittime': '24' };
  const responsePreview = previewProjectileEdit(responseDraft, text, values);
  assert(responsePreview && responsePreview.replacements.length === 6);
  assert(responsePreview.sourceAfter.includes('Fall.XVelocity' + separator + '-3.25' + end + comment));
  assert(responsePreview.sourceAfter.includes('Down.HitTime' + separator + '24' + end));
}

const invalidResponse = '[StateDef 200]\nprojectile {\n  fall.xvelocity: map(X);\n  fall.yvelocity: -6, 0;\n  down.velocity: -3;\n  fall.recovertime: 1.5;\n  fall.damage: 10;\n  fall.damage: 11;\n}\n';
const invalidResponseDraft = createProjectileEditDraft(component(invalidResponse, 'zss'), invalidResponse);
for (const target of ['fall.xvelocity', 'fall.yvelocity', 'down.velocity', 'fall.recovertime', 'fall.damage']) assert(!invalidResponseDraft.fields.find(field => field.target === target).editable);
for (const target of responseTargets) assert.strictEqual(previewProjectileEdit(invalidResponseDraft, invalidResponse, { [target]: target === 'down.velocity' ? '-4, -5' : '-4' }), null);

for (const syntax of ['cns', 'zss']) {
  const separator = syntax === 'cns' ? ' = ' : ': ', end = syntax === 'cns' ? '' : ';', open = syntax === 'cns' ? '[State 200, position]\nType = Projectile\n' : 'projectile {\n', close = syntax === 'cns' ? '' : '}\n', comment = syntax === 'cns' ? ' ; keep position' : ' // keep position';
  const authored = [['MinDist', '-30, -20'], ['MaxDist', '40, 50'], ['Snap', '5, -10'], ['P1SprPriority', '3'], ['P2SprPriority', '-2'], ['P1StateNo', '5000'], ['P2StateNo', '5100']];
  const text = '[StateDef 200]\n' + open + authored.map(([name, value], index) => `  ${name}${separator}${value}${end}${index === 0 ? comment : ''}\n`).join('') + close;
  const positionDraft = createProjectileEditDraft(component(text, syntax), text);
  assert(positionTargets.every(target => positionDraft.fields.find(field => field.target === target).editable), `${syntax} position/state literals are independently editable`);
  const values = { mindist: '-35, -25', maxdist: '45, 55', snap: '6, -12', p1sprpriority: '4', p2sprpriority: '-3', p1stateno: '5001', p2stateno: '5101' };
  const positionPreview = previewProjectileEdit(positionDraft, text, values);
  assert(positionPreview && positionPreview.replacements.length === 7);
  assert(positionPreview.sourceAfter.includes('MinDist' + separator + '-35, -25' + end + comment));
  assert(positionPreview.sourceAfter.includes('P2StateNo' + separator + '5101' + end));
}

const invalidPosition = '[StateDef 200]\nprojectile {\n  mindist: -30;\n  maxdist: 40, map(Y);\n  snap: 5, -10, 0;\n  p1sprpriority: 1.5;\n  p2stateno: 5100;\n  p2stateno: 5101;\n}\n';
const invalidPositionDraft = createProjectileEditDraft(component(invalidPosition, 'zss'), invalidPosition);
for (const target of ['mindist', 'maxdist', 'snap', 'p1sprpriority', 'p2stateno']) assert(!invalidPositionDraft.fields.find(field => field.target === target).editable);
for (const target of positionTargets) assert.strictEqual(previewProjectileEdit(invalidPositionDraft, invalidPosition, { [target]: ['mindist', 'maxdist', 'snap'].includes(target) ? '1, 2' : '1' }), null);

for (const syntax of ['cns', 'zss']) {
  const separator = syntax === 'cns' ? ' = ' : ': ', end = syntax === 'cns' ? '' : ';', open = syntax === 'cns' ? '[State 200, policy]\nType = Projectile\n' : 'projectile {\n', close = syntax === 'cns' ? '' : '}\n', comment = syntax === 'cns' ? ' ; keep policy' : ' // keep policy';
  const authored = [['P1Facing', '-1'], ['P1GetP2Facing', '2'], ['P2Facing', '-3'], ['P2GetP1State', '4'], ['ForceStand', '-5']];
  const text = '[StateDef 200]\n' + open + authored.map(([name, value], index) => `  ${name}${separator}${value}${end}${index === 0 ? comment : ''}\n`).join('') + close;
  const policyDraft = createProjectileEditDraft(component(text, syntax), text);
  assert(policyTargets.every(target => policyDraft.fields.find(field => field.target === target).editable), `${syntax} facing/state policy integers are independently editable`);
  const values = { p1facing: '-6', p1getp2facing: '7', p2facing: '-8', p2getp1state: '9', forcestand: '-10' };
  const policyPreview = previewProjectileEdit(policyDraft, text, values);
  assert(policyPreview && policyPreview.replacements.length === 5);
  assert(policyPreview.sourceAfter.includes('P1Facing' + separator + '-6' + end + comment));
  assert(policyPreview.sourceAfter.includes('ForceStand' + separator + '-10' + end));
}

const invalidPolicy = '[StateDef 200]\nprojectile {\n  p1facing: map(Facing);\n  p1getp2facing: 1.5;\n  p2facing: 1, 0;\n  p2getp1state: 1;\n  p2getp1state: 0;\n}\n';
const invalidPolicyDraft = createProjectileEditDraft(component(invalidPolicy, 'zss'), invalidPolicy);
for (const target of ['p1facing', 'p1getp2facing', 'p2facing', 'p2getp1state']) assert(!invalidPolicyDraft.fields.find(field => field.target === target).editable);
for (const target of policyTargets) assert.strictEqual(previewProjectileEdit(invalidPolicyDraft, invalidPolicy, { [target]: '-2' }), null);

for (const syntax of ['cns', 'zss']) {
  const separator = syntax === 'cns' ? ' = ' : ': ', end = syntax === 'cns' ? '' : ';', open = syntax === 'cns' ? '[State 200, classification]\nType = Projectile\n' : 'projectile {\n', close = syntax === 'cns' ? '' : '}\n', comment = syntax === 'cns' ? ' ; keep classification' : ' // keep classification';
  const authored = [['Attr', 'S, NA'], ['HitFlag', 'MAF+'], ['GuardFlag', 'HL'], ['AffectTeam', 'E']];
  const text = '[StateDef 200]\n' + open + authored.map(([name, value], index) => `  ${name}${separator}${value}${end}${index === 0 ? comment : ''}\n`).join('') + close;
  const classificationDraft = createProjectileEditDraft(component(text, syntax), text);
  assert(classificationTargets.every(target => classificationDraft.fields.find(field => field.target === target).editable), `${syntax} attack classification literals are independently editable`);
  const values = { attr: 'a, HP', hitflag: 'hLd-', guardflag: 'mA', affectteam: 'f' };
  const classificationPreview = previewProjectileEdit(classificationDraft, text, values);
  assert(classificationPreview && classificationPreview.replacements.length === 4);
  assert(classificationPreview.sourceAfter.includes('Attr' + separator + 'a, HP' + end + comment),'classification casing and authored surroundings are preserved');
  assert(classificationPreview.sourceAfter.includes('HitFlag' + separator + 'hLd-' + end),'flag casing and order are preserved');
  assert(classificationPreview.sourceAfter.includes('AffectTeam' + separator + 'f' + end));
}

const invalidClassification = '[StateDef 200]\nprojectile {\n  attr: map(Type);\n  hitflag: MA+-;\n  guardflag: HL;\n  guardflag: MA;\n  affectteam: "E";\n}\n';
const invalidClassificationDraft = createProjectileEditDraft(component(invalidClassification, 'zss'), invalidClassification);
for (const target of classificationTargets) assert(!invalidClassificationDraft.fields.find(field => field.target === target).editable);
for (const target of classificationTargets) assert.strictEqual(previewProjectileEdit(invalidClassificationDraft, invalidClassification, { [target]: target === 'attr' ? 'S, NA' : target === 'affectteam' ? 'E' : 'MA' }), null);

for (const syntax of ['cns', 'zss']) {
  const separator = syntax === 'cns' ? ' = ' : ': ', end = syntax === 'cns' ? '' : ';', open = syntax === 'cns' ? '[State 200, reactions]\nType = Projectile\n' : 'projectile {\n', close = syntax === 'cns' ? '' : '}\n', comment = syntax === 'cns' ? ' ; keep reaction' : ' // keep reaction';
  const authored = [['AnimType', 'Light'], ['Air.AnimType', 'Medium'], ['Fall.AnimType', 'DiagUp'], ['Ground.Type', 'High'], ['Air.Type', 'Trip']];
  const text = '[StateDef 200]\n' + open + authored.map(([name, value], index) => `  ${name}${separator}${value}${end}${index === 0 ? comment : ''}\n`).join('') + close;
  const reactionDraft = createProjectileEditDraft(component(text, syntax), text);
  assert(reactionTargets.every(target => reactionDraft.fields.find(field => field.target === target).editable), `${syntax} hit-reaction enums are independently editable`);
  const values = { animtype: 'hArD', 'air.animtype': 'Back', 'fall.animtype': 'uP', 'ground.type': 'lOw', 'air.type': 'None' };
  const reactionPreview = previewProjectileEdit(reactionDraft, text, values);
  assert(reactionPreview && reactionPreview.replacements.length === 5);
  assert(reactionPreview.sourceAfter.includes('AnimType' + separator + 'hArD' + end + comment),'reaction casing and source surroundings are preserved');
  assert(reactionPreview.sourceAfter.includes('Air.Type' + separator + 'None' + end));
}

const invalidReaction = '[StateDef 200]\nprojectile {\n  animtype: Lightweight;\n  air.animtype: "Hard";\n  fall.animtype: map(Type);\n  ground.type: HighLow;\n  air.type: High;\n  air.type: Low;\n}\n';
const invalidReactionDraft = createProjectileEditDraft(component(invalidReaction, 'zss'), invalidReaction);
for (const target of reactionTargets) assert(!invalidReactionDraft.fields.find(field => field.target === target).editable);
for (const target of reactionTargets) assert.strictEqual(previewProjectileEdit(invalidReactionDraft, invalidReaction, { [target]: target.endsWith('.type') ? 'High' : 'Hard' }), null);

for (const syntax of ['cns', 'zss']) {
  const separator = syntax === 'cns' ? ' = ' : ': ', end = syntax === 'cns' ? '' : ';', open = syntax === 'cns' ? '[State 200, chaining]\nType = Projectile\n' : 'projectile {\n', close = syntax === 'cns' ? '' : '}\n', comment = syntax === 'cns' ? ' ; keep chaining' : ' // keep chaining';
  const authored = [['Priority', '4, Hit'], ['ID', '100'], ['ChainID', '-1'], ['NoChainID', '200, -1']];
  const text = '[StateDef 200]\n' + open + authored.map(([name, value], index) => `  ${name}${separator}${value}${end}${index === 0 ? comment : ''}\n`).join('') + close;
  const chainingDraft = createProjectileEditDraft(component(text, syntax), text);
  assert(chainingTargets.every(target => chainingDraft.fields.find(field => field.target === target).editable), `${syntax} priority/chaining literals are independently editable`);
  const values = { priority: '7, dOdGe', id: '+12345', chainid: '900', nochainid: '-1, 300' };
  const chainingPreview = previewProjectileEdit(chainingDraft, text, values);
  assert(chainingPreview && chainingPreview.replacements.length === 4);
  assert(chainingPreview.sourceAfter.includes('Priority' + separator + '7, dOdGe' + end + comment),'priority enum casing and source surroundings are preserved');
  assert(chainingPreview.sourceAfter.includes('NoChainID' + separator + '-1, 300' + end),'simultaneous length shifts preserve following authored fields');
  assert.strictEqual(previewProjectileEdit(chainingDraft, text, { priority: '7' }), null,'priority arity is preserved');
  assert.strictEqual(previewProjectileEdit(chainingDraft, text, { nochainid: '300' }), null,'nochainID arity is preserved');
}

const invalidChaining = '[StateDef 200]\nprojectile {\n  priority: 8, Hit;\n  id: 0;\n  chainID: map(ID);\n  nochainID: 100, 200, 300;\n  nochainID: -1;\n}\n';
const invalidChainingDraft = createProjectileEditDraft(component(invalidChaining, 'zss'), invalidChaining);
for (const target of chainingTargets) assert(!invalidChainingDraft.fields.find(field => field.target === target).editable);
for (const target of chainingTargets) assert.strictEqual(previewProjectileEdit(invalidChainingDraft, invalidChaining, { [target]: target === 'priority' ? '4, Hit' : '100' }), null);

for (const syntax of ['cns', 'zss']) {
  const separator = syntax === 'cns' ? ' = ' : ': ', end = syntax === 'cns' ? '' : ';', open = syntax === 'cns' ? '[State 200, power]\nType = Projectile\n' : 'projectile {\n', close = syntax === 'cns' ? '' : '}\n', comment = syntax === 'cns' ? ' ; keep power' : ' // keep power';
  const text = '[StateDef 200]\n' + open + `  GetPower${separator}100${end}${comment}\n  GivePower${separator}-50, 25${end}\n` + close;
  const powerDraft = createProjectileEditDraft(component(text, syntax), text);
  assert(powerTargets.every(target => powerDraft.fields.find(field => field.target === target).editable), `${syntax} power-transfer literals are independently editable`);
  const powerPreview = previewProjectileEdit(powerDraft, text, { getpower: '+12345', givepower: '-500, +250' });
  assert(powerPreview && powerPreview.replacements.length === 2);
  assert(powerPreview.sourceAfter.includes('GetPower' + separator + '+12345' + end + comment));
  assert(powerPreview.sourceAfter.includes('GivePower' + separator + '-500, +250' + end));
  assert.strictEqual(previewProjectileEdit(powerDraft, text, { getpower: '100, 50' }), null,'getpower arity is preserved');
  assert.strictEqual(previewProjectileEdit(powerDraft, text, { givepower: '50' }), null,'givepower arity is preserved');
}

const invalidPower = '[StateDef 200]\nprojectile {\n  getpower: map(Power);\n  givepower: 10, 20, 30;\n  givepower: 40;\n}\n';
const invalidPowerDraft = createProjectileEditDraft(component(invalidPower, 'zss'), invalidPower);
for (const target of powerTargets) assert(!invalidPowerDraft.fields.find(field => field.target === target).editable);
for (const target of powerTargets) assert.strictEqual(previewProjectileEdit(invalidPowerDraft, invalidPower, { [target]: '100' }), null);

for (const syntax of ['cns', 'zss']) {
  const separator = syntax === 'cns' ? ' = ' : ': ', end = syntax === 'cns' ? '' : ';', open = syntax === 'cns' ? '[State 200, presentation]\nType = Projectile\n' : 'projectile {\n', close = syntax === 'cns' ? '' : '}\n', comment = syntax === 'cns' ? ' ; keep presentation' : ' // keep presentation';
  const authored = [['SparkNo', 'S7000'], ['Guard.SparkNo', '-1'], ['SparkXY', '-10, 20'], ['HitSound', 'S1, 0'], ['GuardSound', '2, -1']];
  const text = '[StateDef 200]\n' + open + authored.map(([name, value], index) => `  ${name}${separator}${value}${end}${index === 0 ? comment : ''}\n`).join('') + close;
  const presentationDraft = createProjectileEditDraft(component(text, syntax), text);
  assert(presentationTargets.every(target => presentationDraft.fields.find(field => field.target === target).editable), `${syntax} hit-presentation literals are independently editable`);
  const values = { sparkno: 's7100', 'guard.sparkno': 'S-2', sparkxy: '-15, +25', hitsound: 's10, 20', guardsound: '-3, +4' };
  const presentationPreview = previewProjectileEdit(presentationDraft, text, values);
  assert(presentationPreview && presentationPreview.replacements.length === 5);
  assert(presentationPreview.sourceAfter.includes('SparkNo' + separator + 's7100' + end + comment),'S-prefix casing and source surroundings are preserved');
  assert(presentationPreview.sourceAfter.includes('HitSound' + separator + 's10, 20' + end));
  assert(presentationPreview.sourceAfter.includes('GuardSound' + separator + '-3, +4' + end));
}

const invalidPresentation = '[StateDef 200]\nprojectile {\n  sparkno: SS7000;\n  guard.sparkno: "S7001";\n  sparkxy: 10;\n  hitsound: 1, S0;\n  guardsound: map(Group), 0;\n  guardsound: 2, 0;\n}\n';
const invalidPresentationDraft = createProjectileEditDraft(component(invalidPresentation, 'zss'), invalidPresentation);
for (const target of presentationTargets) assert(!invalidPresentationDraft.fields.find(field => field.target === target).editable);
for (const target of presentationTargets) assert.strictEqual(previewProjectileEdit(invalidPresentationDraft, invalidPresentation, { [target]: target === 'sparkxy' ? '0, 0' : target.endsWith('sound') ? '1, 0' : '7000' }), null);

for (const value of ['p1', 'P2', 'front', 'back', 'left', 'right']) assert(validValue('postype', value));
for (const value of ['enemy', 'p1, 2', 'p1; evil']) assert(!validValue('postype', value));
assert(validValue('projremovetime', '-1'));
for (const target of ['projanim', 'projhitanim', 'projremanim', 'projcancelanim']) assert(validValue(target, '700'));
assert(!validValue('projhitanim', 'ifelse(var(1), 701, 702)'));
assert(!validValue('projanim', 'ifelse(var(1), 1, 2)'));
assert(!validValue('offset', '1, map(x)'));
assert(validValue('remvelocity', '-1.5, .25'));
assert(validValue('velmul', '1, 0.95'));
assert(!validValue('remvelocity', '1'));
assert(!validValue('velmul', '1, map(x)'));
for (const target of ['projremove', 'projhits', 'projmisstime', 'projpriority']) assert(validValue(target, '-12'));
assert(validValue('projremove', '9'), 'nonzero true values are preserved rather than normalized');
assert(!validValue('projhits', '2.5'));
assert(!validValue('projpriority', 'ifelse(var(1), 3, 4)'));
for (const target of ['projedgebound', 'projstagebound']) {
  assert(validValue(target, '-400'));
  assert(!validValue(target, '40.5'));
  assert(!validValue(target, 'map(Bound)'));
}
assert(validValue('projheightbound', '-240, 0'));
for (const value of ['-240', '-240.5, 0', '-240, map(High)', '-240, 0, 240']) assert(!validValue('projheightbound', value));
for (const target of ['projshadow', 'supermovetime', 'pausemovetime', 'ownpal', 'afterimage.time']) {
  assert(validValue(target, '-12'));
  assert(!validValue(target, '1.5'));
  assert(!validValue(target, 'map(Value)'));
}
assert(validValue('ownpal', '7'),'nonzero ownpal values are preserved rather than normalized');
assert(validValue('remappal', '-1, 12'));
for (const value of ['1', '1.5, 2', '1, map(Pal)', '1, 2, 3']) assert(!validValue('remappal', value));
for (const target of ['damage', 'pausetime', 'guard.pausetime']) {
  assert(validValue(target, '-12, 24'));
  for (const value of ['1', '1.5, 2', '1, var(2)', '1, 2, 3']) assert(!validValue(target, value));
}
for (const target of ['ground.slidetime', 'ground.hittime', 'guard.slidetime', 'guard.hittime', 'air.hittime']) {
  assert(validValue(target, '-12'));
  for (const value of ['1.5', 'var(1)', '1, 2']) assert(!validValue(target, value));
}
assert(validValue('ground.velocity', '-4'));
assert(validValue('ground.velocity', '-4, .5'));
for (const value of ['-4, 0, 1', 'map(Vel)', 'Infinity']) assert(!validValue('ground.velocity', value));
for (const target of ['guard.velocity', 'yaccel']) {
  assert(validValue(target, '-3.5'));
  for (const value of ['-3, 0', 'var(1)', 'NaN']) assert(!validValue(target, value));
}
assert(validValue('air.velocity', '-4, -7'));
for (const value of ['-4', '-4, -7, 0', 'map(X), -7']) assert(!validValue('air.velocity', value));
const overflowingScalar = '9'.repeat(4096), overflowingPair = '9'.repeat(2000) + ', ' + '8'.repeat(2000);
assert(!Number.isFinite(Number(overflowingScalar)) && !Number.isFinite(Number(overflowingPair.split(',')[0])));
assert(!validValue('ground.velocity', overflowingScalar));
assert(!validValue('ground.velocity', overflowingPair));
assert(!validValue('guard.velocity', overflowingScalar));
assert(!validValue('air.velocity', overflowingPair));
assert(!validValue('yaccel', overflowingScalar));
for (const target of ['guard.ctrltime', 'airguard.ctrltime', 'air.juggle', 'numhits']) {
  assert(validValue(target, '-12'));
  for (const value of ['1.5', 'var(1)', '1, 2', '999999999999999999999999']) assert(!validValue(target, value));
}
assert(validValue('airguard.velocity', '-4, -7'));
for (const value of ['-4', '-4, -7, 0', '-4, map(Y)', overflowingPair]) assert(!validValue('airguard.velocity', value));
for (const target of pushTargets.filter(target => target !== 'airguard.velocity')) {
  assert(validValue(target, '-3.5'));
  for (const value of ['-3, 0', 'map(Push)', 'Infinity', overflowingScalar]) assert(!validValue(target, value));
}
for (const target of outcomeTargets) {
  assert(validValue(target, '-7'),'outcome flags preserve signed nonzero integers');
  for (const value of ['1.5', 'var(1)', '1, 0', '999999999999999999999999']) assert(!validValue(target, value));
}
assert.strictEqual(validValue('down.recover', '1'), false, 'Stable IKEMEN down.recover remains outside the classic edit slice');
for (const target of ['fall.xvelocity', 'fall.yvelocity']) {
  assert(validValue(target, '-3.5'));
  for (const value of ['-3, 0', 'map(Vel)', 'Infinity', overflowingScalar]) assert(!validValue(target, value));
}
assert(validValue('down.velocity', '-3, -4'));
for (const value of ['-3', '-3, -4, 0', 'map(X), -4', overflowingPair]) assert(!validValue('down.velocity', value));
for (const target of ['fall.recovertime', 'fall.damage', 'down.hittime']) {
  assert(validValue(target, '-12'));
  for (const value of ['1.5', 'var(1)', '1, 2', '999999999999999999999999']) assert(!validValue(target, value));
}
for (const target of ['fall.zvelocity', 'down.recovertime']) assert.strictEqual(validValue(target, '1'), false, `${target} remains outside the classic response edit slice`);
for (const target of ['mindist', 'maxdist', 'snap']) {
  assert(validValue(target, '-2.5, 3.5'));
  for (const value of ['-2.5', '-2, 3, 4', 'map(X), 3', overflowingPair]) assert(!validValue(target, value));
}
for (const target of ['p1sprpriority', 'p2sprpriority', 'p1stateno', 'p2stateno']) {
  assert(validValue(target, '-12'));
  for (const value of ['1.5', 'var(1)', '1, 2', '999999999999999999999999']) assert(!validValue(target, value));
}
for (const target of policyTargets) {
  assert(validValue(target, '-7'),'facing/state policy preserves signed nonzero integers');
  for (const value of ['1.5', 'var(1)', '1, 0', '999999999999999999999999']) assert(!validValue(target, value));
}
for (const target of ['forcecrouch', 'teamside']) assert.strictEqual(validValue(target, '1'), false, `${target} remains deferred pending IKEMEN provenance`);
for (const value of ['S, NA', 'c, st', 'A,hp']) assert(validValue('attr', value));
for (const value of ['S', 'S, N', 'S, NX', 'S, NA, A', 'map(Attr)', '"S, NA"']) assert(!validValue('attr', value));
for (const value of ['MAF+', 'hLd-', 'A']) assert(validValue('hitflag', value));
for (const value of ['FD', 'MA+-', '+MA', 'MAX', 'MMA', '"MA"', 'map(Flags)']) assert(!validValue('hitflag', value));
for (const value of ['HL', 'mA', 'A']) assert(validValue('guardflag', value));
for (const value of ['', 'F', 'HL+', 'HH', '"HL"', 'map(Guard)']) assert(!validValue('guardflag', value));
for (const value of ['B', 'e', 'F']) assert(validValue('affectteam', value));
for (const value of ['P', 'BE', '"E"', 'map(Team)']) assert(!validValue('affectteam', value));
for (const target of ['animtype', 'air.animtype', 'fall.animtype']) {
  for (const value of ['Light', 'medium', 'HARD', 'Back', 'Up', 'DiagUp']) assert(validValue(target, value));
  for (const value of ['Lightweight', 'Diag', 'Hard+', '"Hard"', 'map(Type)']) assert(!validValue(target, value));
}
for (const target of ['ground.type', 'air.type']) {
  for (const value of ['High', 'low', 'TRIP', 'None']) assert(validValue(target, value));
  for (const value of ['HighLow', 'Back', 'None+', '"High"', 'map(Type)']) assert(!validValue(target, value));
}
for (const value of ['1', '7', '1, Hit', '4, miss', '7, DODGE']) assert(validValue('priority', value));
for (const value of ['0', '8', '1, Block', '1, Hit, Miss', '"4, Hit"', 'map(Priority)']) assert(!validValue('priority', value));
for (const value of ['1', '+12345']) assert(validValue('id', value));
for (const value of ['-1', '0', '1.5', '999999999999999999999999', 'map(ID)']) assert(!validValue('id', value));
for (const value of ['-1', '1', '+12345']) assert(validValue('chainid', value));
for (const value of ['0', '-2', '1.5', '999999999999999999999999', 'map(ID)']) assert(!validValue('chainid', value));
for (const value of ['-1', '1', '+5', '-1, 300', '200, -1']) assert(validValue('nochainid', value));
for (const value of ['0', '-2', '1, 0', '1, 2, 3', '999999999999999999999999', 'map(ID)']) assert(!validValue('nochainid', value));
for (const target of powerTargets) {
  for (const value of ['0', '-100', '+250', '-100, 50', '+10, -20']) assert(validValue(target, value));
  for (const value of ['1.5', '1, 2.5', '1, 2, 3', 'map(Power)', '999999999999999999999999']) assert(!validValue(target, value));
}
for (const target of ['sparkno', 'guard.sparkno']) {
  for (const value of ['7000', '-1', '+2', 'S7001', 's-2']) assert(validValue(target, value));
  for (const value of ['SS7000', '7000S', 'S', '1.5', '"S7000"', 'map(Spark)', '999999999999999999999999']) assert(!validValue(target, value));
}
for (const value of ['0, 0', '-10, +20']) assert(validValue('sparkxy', value));
for (const value of ['0', '0, 0, 0', 'S0, 0', 'map(X), 0', '999999999999999999999999, 0']) assert(!validValue('sparkxy', value));
for (const target of ['hitsound', 'guardsound']) {
  for (const value of ['1, 0', '-1, +2', 'S1, 0', 's-1, 2']) assert(validValue(target, value));
  for (const value of ['1', '1, 0, 2', 'SS1, 0', '1, S0', '"S1, 0"', 'map(Group), 0', '999999999999999999999999, 0']) assert(!validValue(target, value));
}
assert(validValue('projscale', '1.25, .75'));
assert(!validValue('projscale', '1'));
assert(validValue('projsprpriority', '-9'));
assert(!validValue('projsprpriority', '1.5'));
assert(validValue('projangle', '-22.5'));
for(const value of ['-1', '0', '1']) assert(validValue('projlayerno', value));
for(const value of ['2', '-2', '1.0', 'ifelse(var(1), 1, 0)']) assert(!validValue('projlayerno', value));
for(const value of ['Infinity', 'NaN', '1e3', 'map(Angle)']) assert(!validValue('projangle', value));
assert.strictEqual(createProjectileEditDraft({ ...component(cns), rangeHash: 'stale' }, cns), null);
assert.strictEqual(createProjectileEditDraft({ ...component(cns), kind: 'explod' }, cns), null);

console.log('Projectile exact edit planner preserves source bytes and locks omitted, duplicate, dynamic, stale, and invalid fields');
