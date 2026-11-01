'use strict';

const assert = require('assert');
const { hash } = require('../src/mutation_safety');
const { buildAirActionUsageSnapshot } = require('../src/air_action_usage_authority');
const { resolveSelectedAnimationOccurrence, consumeAnimationTargetRoute } = require('../src/air_expression_navigation');

const sourcePath = 'C:/chars/Hero/main.zss';
const sourceText = '[StateDef 200; anim: 200]\nChangeAnim { value: 201; } ChangeAnim2 { value: 202; }\n';
const sourceHash = hash(sourceText);
let targetSerial = 0;
const snapshot = buildAirActionUsageSnapshot({ defPath: 'C:/chars/Hero/Hero.def', defText: '[Files]\nanim = Hero.air\nst = main.zss\n', defDirty: false, airPath: 'C:/chars/Hero/Hero.air', airText: '[Begin Action 200]\n0,0,0,0,1\n[Begin Action 201]\n0,0,0,0,1\n[Begin Action 202]\n0,0,0,0,1\n', assignedSources: [sourcePath], sources: [{ available: true, dirty: false, filename: sourcePath, syntax: 'zss', text: sourceText, sourceHash }], inventoryComplete: true, generation: 2, token: () => 'a'.repeat(48), targetToken: () => (++targetSerial).toString(16).padStart(48, '0') });
const starts = [sourceText.indexOf('200', sourceText.indexOf('anim:')), sourceText.indexOf('201'), sourceText.indexOf('202')];
for (const [index, value] of ['200', '201', '202'].entries()) {
  const start = starts[index], caret = resolveSelectedAnimationOccurrence(snapshot, { sourcePath, sourceText, sourceHash, selectionStart: start, selectionEnd: start });
  assert(caret.available && caret.exact && caret.occurrence.action === Number(value) && caret.occurrence.targetRoute, `${value} resolves only from its exact expression span`);
  const selected = resolveSelectedAnimationOccurrence(snapshot, { sourcePath, sourceText, sourceHash, selectionStart: start, selectionEnd: start + value.length });
  assert(selected.available && selected.occurrence.action === Number(value));
}
const field = sourceText.indexOf('value');
assert.strictEqual(resolveSelectedAnimationOccurrence(snapshot, { sourcePath, sourceText, sourceHash, selectionStart: field, selectionEnd: field }).available, false, 'controller field names are not animation targets');
assert.strictEqual(resolveSelectedAnimationOccurrence(snapshot, { sourcePath, sourceText, sourceHash, selectionStart: starts[1], selectionEnd: starts[2] + 3 }).available, false, 'a selection crossing recognized fields is rejected');
assert.strictEqual(resolveSelectedAnimationOccurrence(snapshot, { sourcePath, sourceText: sourceText + '# changed', sourceHash, selectionStart: starts[0], selectionEnd: starts[0] }).available, false, 'stale source hashes fail closed');
assert.strictEqual(resolveSelectedAnimationOccurrence(snapshot, { sourcePath: 'C:/chars/Hero/other.zss', sourceText, sourceHash, selectionStart: starts[0], selectionEnd: starts[0] }).available, false, 'a foreign source cannot borrow an occurrence span');
const explodText='[StateDef 240]\nExplod { anim: 202; }\n',explodHash=hash(explodText),explodStart=explodText.indexOf('202'),explodSnapshot=buildAirActionUsageSnapshot({defPath:'C:/chars/Hero/Hero.def',defText:'[Files]\nanim = Hero.air\nst = main.zss\n',defDirty:false,airPath:'C:/chars/Hero/Hero.air',airText:'[Begin Action 202]\n0,0,0,0,1\n',assignedSources:[sourcePath],sources:[{available:true,dirty:false,filename:sourcePath,syntax:'zss',text:explodText,sourceHash:explodHash}],inventoryComplete:true,generation:3,targetToken:()=> 'c'.repeat(48)});
const explodSelection=resolveSelectedAnimationOccurrence(explodSnapshot,{sourcePath,sourceText:explodText,sourceHash:explodHash,selectionStart:explodStart,selectionEnd:explodStart});
assert(explodSelection.available&&explodSelection.exact&&explodSelection.occurrence.kind==='explod-anim'&&explodSelection.occurrence.action===202,'the existing selected-expression command reaches exact Explod anim values without a semantic fork');
const prefixedText='[StateDef 241]\nExplod { anim: "S", 202; }\n',prefixedHash=hash(prefixedText),prefixedSnapshot=buildAirActionUsageSnapshot({defPath:'C:/chars/Hero/Hero.def',defText:'[Files]\nanim = Hero.air\nst = main.zss\n',defDirty:false,airPath:'C:/chars/Hero/Hero.air',airText:'[Begin Action 202]\n0,0,0,0,1\n',assignedSources:[sourcePath],sources:[{available:true,dirty:false,filename:sourcePath,syntax:'zss',text:prefixedText,sourceHash:prefixedHash}],inventoryComplete:true,generation:3});
const prefixed=prefixedSnapshot.publicUses.occurrences[0],comma=prefixedText.indexOf(','),quote=prefixedText.indexOf('"');assert.strictEqual(prefixed.expression,'"S", 202');assert.strictEqual(prefixed.expressionStart,quote);assert.strictEqual(prefixed.status,'unresolved');assert.strictEqual(prefixed.targetRoute,'');assert(resolveSelectedAnimationOccurrence(prefixedSnapshot,{sourcePath,sourceText:prefixedText,sourceHash:prefixedHash,selectionStart:comma,selectionEnd:comma}).available,'the complete authored unresolved prefix expression remains selectable outside its quoted lexical exclusion');assert.strictEqual(resolveSelectedAnimationOccurrence(prefixedSnapshot,{sourcePath,sourceText:prefixedText,sourceHash:prefixedHash,selectionStart:quote+1,selectionEnd:quote+1}).available,false,'B1 complete quoted-region exclusion remains intact inside the authored prefix');
const quotedText='[StateDef 200]\nChangeAnim { value: ifelse(foo, "20 1", 202); }\n',quotedHash=hash(quotedText),quotedSnapshot=buildAirActionUsageSnapshot({defPath:'C:/chars/Hero/Hero.def',defText:'[Files]\nanim = Hero.air\nst = main.zss\n',defDirty:false,airPath:'C:/chars/Hero/Hero.air',airText:'[Begin Action 200]\n0,0,0,0,1\n',assignedSources:[sourcePath],sources:[{available:true,dirty:false,filename:sourcePath,syntax:'zss',text:quotedText,sourceHash:quotedHash}],inventoryComplete:true,generation:4});
const quotedDigits=quotedText.indexOf('20 1'),quotedSpace=quotedText.indexOf(' ',quotedDigits),functionName=quotedText.indexOf('ifelse');
assert.strictEqual(resolveSelectedAnimationOccurrence(quotedSnapshot,{sourcePath,sourceText:quotedText,sourceHash:quotedHash,selectionStart:quotedDigits,selectionEnd:quotedDigits}).available,false,'a caret inside a quoted string cannot select its containing dynamic animation expression');
assert.strictEqual(resolveSelectedAnimationOccurrence(quotedSnapshot,{sourcePath,sourceText:quotedText,sourceHash:quotedHash,selectionStart:quotedSpace,selectionEnd:quotedSpace}).available,false,'whitespace inside a quoted string remains part of the excluded string region');
assert(resolveSelectedAnimationOccurrence(quotedSnapshot,{sourcePath,sourceText:quotedText,sourceHash:quotedHash,selectionStart:functionName,selectionEnd:functionName}).available,'the recognized dynamic expression remains available outside excluded string spans');
const replaySnapshot = buildAirActionUsageSnapshot({ defPath: 'C:/chars/Hero/Hero.def', defText: '[Files]\nanim = Hero.air\nst = main.zss\n', defDirty: false, airPath: 'C:/chars/Hero/Hero.air', airText: '[Begin Action 200]\n0,0,0,0,1\n', assignedSources: [sourcePath], sources: [{ available: true, dirty: false, filename: sourcePath, syntax: 'zss', text: '[StateDef 200; anim: 200]\n', sourceHash: hash('[StateDef 200; anim: 200]\n') }], inventoryComplete: true, generation: 3, targetToken: () => 'b'.repeat(48) });
assert(consumeAnimationTargetRoute(replaySnapshot, 'b'.repeat(48)), 'a minted target route can be consumed once');
assert.strictEqual(consumeAnimationTargetRoute(replaySnapshot, 'b'.repeat(48)), null, 'replayed target routes fail closed');
console.log('AIR expression hit-testing is exact-span, source-bound and fail-closed');
