'use strict';

const assert = require('assert');
const path = require('path');
const model = require('../src/character_scale_review_model');

const constants = (x,y,extra='') => `[Data]\nlife = 1000\n[Size]\nxscale = ${x}\nyscale = ${y}\n${extra}`;
const oldEvidence=model.parseScaleEvidence(constants(1,1),path.resolve('old.cns'));
const newEvidence=model.parseScaleEvidence(constants(2,.5,'proj.doscale = 1\n'),path.resolve('new.cns'));
assert.strictEqual(oldEvidence.status,'ready');
assert.strictEqual(newEvidence.status,'ready');
assert.match(model.parseScaleEvidence('[Size]\nxscale=1\nxscale=2\nyscale=1',path.resolve('bad.cns')).reason,/duplicated/);
const transition={...model.scaleTransition(oldEvidence,newEvidence),projDoScale:true};
assert.deepStrictEqual(transition.ratio,[2,.5]);
assert.deepStrictEqual(model.parseLocalcoord('[Info]\nlocalcoord = 640, 360'),[640,360]);

const source=`[State 100, body spark]\ntype = Explod\npostype = P1\npos = 10, -20\nscale = 1, 1\n\n[State 100, UI]\ntype = Explod\nspace = screen\npos = 20, 30\nscale = const(size.xscale), const(size.yscale)\n\n[State 100, child]\ntype = Helper\npostype = P1\npos = 4, -8\n\n[State 100, shot]\ntype = Projectile\npostype = P1\noffset = 12, -6\nprojscale = 1, 1\nprojclsnscale = 1, 1\nvelocity = 3, -2\n`;
const sourcePath=path.resolve('states.cns');
const first=model.analyzeSource({sourcePath,text:source,transition,owners:[path.resolve('a.def'),path.resolve('b.def')]});
assert(first.findings.every(item=>item.owners.length===2),'shared owners remain visible');
const effects=[...new Set(first.findings.map(item=>item.effectId))],policies=Object.fromEntries(effects.map(id=>[id,'follow']));
const reviewed=model.analyzeSource({sourcePath,text:source,transition,policies,owners:[path.resolve('a.def')]});
const find=(controller,field)=>reviewed.findings.find(item=>item.controller===controller&&item.field===field);
assert.strictEqual(find('explod','pos').classification,'proposed');
assert.strictEqual(find('explod','pos').patch.replacement,'20, -10');
assert(reviewed.findings.some(item=>item.controller==='explod'&&item.field==='scale'&&item.classification==='already-compensated'),'scale-aware expression is excluded');
assert(reviewed.findings.some(item=>item.controller==='explod'&&item.field==='pos'&&item.attachment.kind==='screen'&&item.classification==='intentionally-unchanged'),'screen placement is unchanged');
assert.strictEqual(find('helper','size.xscale/yscale').classification,'already-compensated');
assert.strictEqual(find('projectile','projscale').classification,'already-compensated','proj.doscale avoids double multiplication');
assert.strictEqual(find('projectile','velocity').classification,'gameplay-review');
assert(model.analyzeSource({sourcePath,text:source,transition:{...transition,localcoordChanged:true},policies}).findings.every(item=>item.classification==='already-compensated'||item.classification==='unresolved'||item.classification==='gameplay-review'),'simultaneous localcoord drift blocks simple rewrites');
const gameplayId=find('projectile','velocity').id;
const withGameplay=model.analyzeSource({sourcePath,text:source,transition,policies,includeGameplay:true,gameplaySelections:{[gameplayId]:true}});
assert.strictEqual(withGameplay.findings.find(item=>item.id===gameplayId).classification,'unresolved');
assert.match(withGameplay.findings.find(item=>item.id===gameplayId).reason,/manual-only/);
const collisionId=find('projectile','projclsnscale').id;
assert.strictEqual(model.analyzeSource({sourcePath,text:source,transition,policies,includeGameplay:true,gameplaySelections:{[collisionId]:true}}).findings.find(item=>item.id===collisionId).classification,'proposed');
const sizeOnly={...policies,[find('projectile','velocity').effectId]:'size'};
assert.strictEqual(model.analyzeSource({sourcePath,text:source,transition,policies:sizeOnly,includeGameplay:true,gameplaySelections:{[collisionId]:true}}).findings.find(item=>item.id===collisionId).classification,'proposed');

const fixedPolicies={...policies,[find('explod','pos').effectId]:'fixed'};
const fixed=model.analyzeSource({sourcePath,text:source,transition,policies:fixedPolicies});
const fixedEffect=find('explod','pos').effectId;
assert(fixed.findings.some(item=>item.effectId===fixedEffect&&item.field==='pos'&&item.classification==='proposed'),'Keep Fixed Size preserves eligible position');
assert(fixed.findings.some(item=>item.effectId===fixedEffect&&item.field==='scale'&&item.classification==='intentionally-unchanged'),'Keep Fixed Size leaves size unchanged');

const review=model.createReview({defPath:path.resolve('fighter.def'),transition,sources:[{sourcePath,text:source,owners:[path.resolve('fighter.def')]}],policies});
const c=review.coverage;
assert.strictEqual(c.checked,c.proposed+c.alreadyCompensated+c.intentionallyUnchanged+c.unresolvedUnsupported+c.gameplayReview,'coverage categories account for every checked finding');
assert.strictEqual(c.complete,false);
const preview=model.previewForFinding(review.findings.find(item=>item.classification==='proposed'),transition,review.reviewHash);
assert.strictEqual(preview.writesFiles,false);
assert.strictEqual(preview.reviewHash,review.reviewHash);assert(preview.sourceHash);assert(preview.sourcePath);
assert(Object.isFrozen(preview));
const scopedReview=model.createReview({defPath:path.resolve('fighter.def'),transition,sources:[{sourcePath,text:source,owners:[path.resolve('fighter.def')]}],policies,includeGameplay:true,gameplaySelections:{[gameplayId]:true}});assert.strictEqual(scopedReview.gameplaySelections[gameplayId],true);assert.strictEqual(scopedReview.findings.find(item=>item.id===gameplayId).classification,'unresolved');

const zss=`explod {\n postype: P1;\n pos: 5, -3;\n scale: 1, 1;\n}\nbindToRoot { pos: 2, -4; }`;
const zssFirst=model.analyzeSource({sourcePath:path.resolve('states.zss'),text:zss,transition});
const zssPolicies=Object.fromEntries([...new Set(zssFirst.findings.map(item=>item.effectId))].map(id=>[id,'position']));
const zssReview=model.analyzeSource({sourcePath:path.resolve('states.zss'),text:zss,transition,policies:zssPolicies});
assert(zssReview.findings.some(item=>item.controller==='explod'&&item.field==='pos'&&item.classification==='proposed'));
assert(zssReview.findings.some(item=>item.controller==='bindtoroot'&&item.classification==='gameplay-review'));
const bind=zssReview.findings.find(item=>item.controller==='bindtoroot');const bindReview=model.analyzeSource({sourcePath:path.resolve('states.zss'),text:zss,transition,policies:zssPolicies,includeGameplay:true,gameplaySelections:{[bind.id]:true}});assert.strictEqual(bindReview.findings.find(item=>item.id===bind.id).classification,'unresolved');assert.match(bindReview.findings.find(item=>item.id===bind.id).reason,/manual-only/);assert.notStrictEqual(bind.attachment.confidence,'proven');
const duplicate='[State 0, duplicate]\ntype = Explod\npostype = P1\npos = 1, 2\npos = 3, 4\nscale = 1, 1\n';const duplicateFirst=model.analyzeSource({sourcePath,text:duplicate,transition}),duplicatePolicies=Object.fromEntries([...new Set(duplicateFirst.findings.map(item=>item.effectId))].map(id=>[id,'follow'])),duplicateReview=model.analyzeSource({sourcePath,text:duplicate,transition,policies:duplicatePolicies});const duplicatePos=duplicateReview.findings.find(item=>item.field==='pos');assert(duplicatePos);assert.strictEqual(duplicatePos.classification,'unresolved');assert.match(duplicatePos.reason,/duplicat/i);assert.strictEqual(duplicatePos.patch,null);assert.strictEqual(model.coverage(duplicateReview.findings).complete,false);
const falsePositive=`// explod { pos: 1, 2; scale: 1, 1; }\n/* helper { pos: 3, 4; } */\nlet note = "projectile { offset: 5, 6; }";`;
assert.strictEqual(model.analyzeSource({sourcePath:path.resolve('comments.zss'),text:falsePositive,transition,policies:{}}).findings.length,0,'comments and strings cannot create mutation candidates');

console.log('Character scale review policies, attachment evidence, compensation, gameplay separation, coverage, and preview contracts passed');
