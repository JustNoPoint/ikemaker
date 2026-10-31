'use strict';
const assert = require('assert');
const { analyzeZss, defMapCapabilityIssues, defMapValueIssues, typedConstantIssues } = require('../src/analyzer');

const source = `[Constants]\nDisplay.Name = "Ryu"\n[Function Label(prefix) result]\n  let result := "Ready";\n  map(DisplayMode) := "training";\n  call Render("HUD");\n[StateDef 1]\n  call Label("P1");\n`;
const stable = analyzeZss(source, { capabilities: { enabledCapabilities: [] } }).issues.filter(item => item.code === 'unsupported-nightly-string');
assert(stable.length >= 5, 'stable target reports every positively identified runtime-string contract');
assert(stable.every(item => item.severity === 'error' && item.help.includes('will not change the target')));
assert(stable.some(item => item.message.includes('Constant Display.Name')));
assert(stable.some(item => item.message.includes('Scoped local result')));
assert(stable.some(item => item.message.includes('Map DisplayMode')));
assert(stable.some(item => item.message.includes('Function call Render')));
assert(stable.some(item => item.message.includes('Function call Label')));
const nightly = analyzeZss(source, { capabilities: { enabledCapabilities: ['zss.runtime-strings'] } }).issues.filter(item => item.code === 'unsupported-nightly-string');
assert.deepStrictEqual(nightly, [], 'verified supporting Nightly clears only its compatibility diagnostic');
assert.deepStrictEqual(analyzeZss(source).issues.filter(item => item.code === 'unsupported-nightly-string'), [], 'callers without engine-target authority do not guess compatibility');
assert.deepStrictEqual(analyzeZss('# map(Fake) := "comment";\nlet number := 1;\n', { capabilities: { enabledCapabilities: [] } }).issues.filter(item => item.code === 'unsupported-nightly-string'), [], 'comments and numeric source do not fabricate string diagnostics');
const stableFlags=analyzeZss('let mode := TeamMode;\nif Physics = S {}\ncall Show(PrevMoveType);\nlet attack := HitDefAttr;\nlet p2move := P2MoveType;\nlet state := StateType;\nlet reversal := ReversalDefAttr;\nlet received := GetHitVar(attr);\nlet guarded := GetHitVar(guardflag);\nlet activeHit := HitDefVar(hitflag);\nlet activeGuard := HitDefVar(guardflag);\nif GetHitVar(attr) = HitDefAttr {}\nif HitDefVar(hitflag) = "HAF" {}\n[StateDef 20; movetype: A; statetype: S; physics: N]\n# PrevStateType\n',{capabilities:{enabledCapabilities:[]}}).issues.filter(item=>item.code==='unsupported-nightly-string');
assert.deepStrictEqual(stableFlags.map(item=>item.line),[0,2,3,4,5,6,7,8,9,10,11],'all exact bare string-return flag forms are reported; explicit comparisons, StateDef fields, and comments stay valid');
assert(stableFlags.some(item=>item.message.includes('GetHitVar(attr)'))&&stableFlags.some(item=>item.message.includes('HitDefVar(hitflag)')),'parameterized flag triggers identify the exact string-return form');
assert.deepStrictEqual(analyzeZss('let mode := TeamMode;\ncall Show(PrevMoveType);\n',{capabilities:{enabledCapabilities:['zss.runtime-strings']}}).issues.filter(item=>item.code==='unsupported-nightly-string'),[],'verified Nightly permits bare flag string returns');
const mapAdd=analyzeZss('[StateDef 200]\nmap(Label) := "Ready";\nmap(Label) += 1;\nroot, map(Label) += 1;\n',{capabilities:{enabledCapabilities:['zss.runtime-strings']}}).issues.filter(item=>item.code==='string-map-add');
assert.strictEqual(mapAdd.length,1,'string MapAdd is rejected only for the exact same runtime owner with positive string evidence');
assert.strictEqual(mapAdd[0].line,2);
const stringOperandAdd=analyzeZss('[StateDef 200]\nmap(NewLabel) += "Ready";\nroot, map(OtherLabel) += "Go";\n',{capabilities:{enabledCapabilities:['zss.runtime-strings']}}).issues.filter(item=>item.code==='string-map-add');
assert.deepStrictEqual(stringOperandAdd.map(item=>item.line),[1,2],'a directly authored string add is rejected even when no earlier map value is known');
assert(stringOperandAdd.every(item=>item.message.includes('adds a string value')));
assert.deepStrictEqual(analyzeZss('[StateDef 200]\nmap(Count) := 1;\nmap(Count) += 1;\n',{capabilities:{enabledCapabilities:['zss.runtime-strings']}}).issues.filter(item=>item.code==='string-map-add'),[],'numeric MapAdd remains valid');
const stableCommandExpressions=analyzeZss('if command = map(SelectedCommand) {}\nif SelfCommand != $commandName {}\nif command = "holdfwd" {}\n# command = map(Commented)\nlet note := "command = map(Text)";\n',{capabilities:{enabledCapabilities:[]}}).issues.filter(item=>item.code==='unsupported-nightly-command-expression');
assert.deepStrictEqual(stableCommandExpressions.map(item=>item.line),[0,1],'stable target reports only explicit map/local dynamic command operands');
assert.deepStrictEqual(analyzeZss('if command = map(SelectedCommand) {}\nif SelfCommand != $commandName {}\n',{capabilities:{enabledCapabilities:['command.nightly-expressions']}}).issues.filter(item=>item.code==='unsupported-nightly-command-expression'),[],'exact supporting command-expression capability clears the compatibility diagnostic');
assert.deepStrictEqual(analyzeZss('if command = map(SelectedCommand) {}').issues.filter(item=>item.code==='unsupported-nightly-command-expression'),[],'target-less callers do not guess dynamic command compatibility');
const redirectedCommand='if root, Command = "holdfwd" {}\nif parent, SelfCommand = map(SelectedCommand) {}\n# if p2, Command = "commented" {}\nlet note := "root, Command = hidden";\n';assert.deepStrictEqual(analyzeZss(redirectedCommand,{capabilities:{enabledCapabilities:[]}}).issues.filter(item=>item.code==='nightly-command-redirect-bug'),[],'stable targets are outside the affected Nightly command-expression path');const olderRedirectIssues=analyzeZss(redirectedCommand,{capabilities:{enabledCapabilities:['command.nightly-expressions']}}).issues.filter(item=>item.code==='nightly-command-redirect-bug');assert.deepStrictEqual(olderRedirectIssues.map(item=>item.line),[0,1],'the affected older Nightly reports exact redirected Command and SelfCommand uses without reading comments or strings');assert(olderRedirectIssues.every(item=>item.severity==='warning'),'the version-specific engine behavior is reported for review without claiming the source itself is invalid');assert.deepStrictEqual(analyzeZss(redirectedCommand,{capabilities:{enabledCapabilities:['command.nightly-expressions','command.redirected-expression-fix']}}).issues.filter(item=>item.code==='nightly-command-redirect-bug'),[],'the exact verified fix capability clears redirected command warnings');assert.deepStrictEqual(analyzeZss(redirectedCommand).issues.filter(item=>item.code==='nightly-command-redirect-bug'),[],'target-less analysis does not guess the affected Nightly');
const controllerSource=`[StateDef 200]
PlaySnd {
  value: ifelse(map(UseCommon), "F", "S"), 200, 0
}
Explod {
  anim: $animPrefix, 200
}
Helper {
  name: map(HelperName)
}
HitDef {
  hitsound: 200, 0
  guardsound: "F", 6, 0
}
`;
const stablePositions=analyzeZss(controllerSource,{capabilities:{enabledCapabilities:[]}}).issues.filter(item=>item.code==='unsupported-nightly-string-position');
assert.deepStrictEqual(stablePositions.map(item=>item.line),[2,5,8,12],'stable target reports only positively identified dynamic controller string positions');
assert(stablePositions.every(item=>item.help.includes('will not')));
assert.deepStrictEqual(analyzeZss(controllerSource,{capabilities:{enabledCapabilities:['zss.runtime-strings']}}).issues.filter(item=>item.code==='unsupported-nightly-string-position'),[],'verified runtime-string target accepts dynamic controller string positions');
assert.deepStrictEqual(analyzeZss(controllerSource).issues.filter(item=>item.code==='unsupported-nightly-string-position'),[],'target-less analysis does not guess controller compatibility');
const expandedControllerStrings=`[StateDef 200]
Dialogue { text0: map(Dialogue.Line) }
ForceFeedback { waveform: $wave }
MapSet { map: map(Target.Name); value: 1 }
HitDef { attr: map(Hit.Attribute); hitflag: $hitFlags }
SaveFile { path: map(Save.Path) }
ShaderSet { name: map(Render.Shader) }
`;
const olderTargetExpanded=analyzeZss(expandedControllerStrings,{capabilities:{enabledCapabilities:['zss.runtime-strings']}}).issues.filter(item=>item.code==='unsupported-expanded-string-expression');assert.deepStrictEqual(olderTargetExpanded.map(item=>item.line),[1,2,3,4,4,5,6],'the earlier runtime-string Nightly still reports every newly expanded controller string position, including ShaderSet and two fields on one controller line');assert.deepStrictEqual(analyzeZss(expandedControllerStrings,{capabilities:{enabledCapabilities:['zss.runtime-strings','zss.expanded-string-expressions']}}).issues.filter(item=>item.code==='unsupported-expanded-string-expression'),[],'the exact descendant capability clears expanded controller string diagnostics');assert.deepStrictEqual(analyzeZss(expandedControllerStrings).issues.filter(item=>item.code==='unsupported-expanded-string-expression'),[],'target-less analysis does not guess expanded string compatibility');
const expandedTriggerStrings='if HitDefAttr = map(Expected.Attr) {}\nif ReversalDefAttr != $counterAttr {}\nif GetHitVar(guardflag) = call GuardFlags() {}\nif HitDefVar(hitflag) = "MAF" {}\nif ProjVar(20, 0, attr) = map(Projectile.Attr) {}\nif GetHitVar(damage) = map(Numeric.Value) {}\n';const olderTriggerIssues=analyzeZss(expandedTriggerStrings,{capabilities:{enabledCapabilities:['zss.runtime-strings']}}).issues.filter(item=>item.code==='unsupported-expanded-string-expression');assert.deepStrictEqual(olderTriggerIssues.map(item=>item.line),[0,1,2,3,4],'older targets report only exact attr/flag string-expression comparisons and ignore unrelated numeric parameters');assert.deepStrictEqual(analyzeZss(expandedTriggerStrings,{capabilities:{enabledCapabilities:['zss.runtime-strings','zss.expanded-string-expressions']}}).issues.filter(item=>item.code==='unsupported-expanded-string-expression'),[],'the exact descendant capability clears dynamic attr/flag comparison diagnostics');
const depthSource=`[StateDef 200]
let top := StageVar(camera.zboundtop);
let ordinary := StageVar(camera.boundleft);
ModifyStageVar {
  camera.ztension: 24
  camera.zautocenter: true
}
# StageVar(camera.zboundbot)
`;
const stableDepth=analyzeZss(depthSource,{capabilities:{enabledCapabilities:[]}}).issues.filter(item=>item.code==='unsupported-nightly-depth-camera');
assert.deepStrictEqual(stableDepth.map(item=>item.line),[1],'specialized stable diagnostic reports exact Z-camera trigger fields');
assert.deepStrictEqual(analyzeZss(depthSource,{capabilities:{enabledCapabilities:[]}}).issues.filter(item=>item.code==='unsupported-engine-capability').map(item=>item.line),[4,5],'catalog-driven diagnostics report exact ModifyStageVar Z-camera fields');
assert.deepStrictEqual(analyzeZss(depthSource,{capabilities:{enabledCapabilities:['stage.depth-camera']}}).issues.filter(item=>item.code==='unsupported-nightly-depth-camera'),[],'verified Z-depth camera capability clears its compatibility diagnostic');
assert.deepStrictEqual(analyzeZss(depthSource).issues.filter(item=>item.code==='unsupported-nightly-depth-camera'),[],'target-less analysis does not guess Z-camera compatibility');
const gatedControllerSource=`[StateDef 200]
Storyboard {
  path: "data/intro.def"
  pos: 10, 20
}
ModifyStoryboard {
  id: 4
}
RunState {
  value: 300
}
HitBy {
  value: SCA, AA
  clsn.index: 2
}
DepthBound {
  value: true
}
`;
const stableCatalogIssues=analyzeZss(gatedControllerSource,{capabilities:{enabledCapabilities:[]}}).issues.filter(item=>item.code==='unsupported-engine-capability');
assert.deepStrictEqual(stableCatalogIssues.map(item=>item.line),[3,5,8,13,15],'catalog-driven diagnostics cover gated nested parameters and whole controllers without duplicating their fields');
assert.deepStrictEqual(analyzeZss(gatedControllerSource,{capabilities:{enabledCapabilities:['storyboard.runtime-controls','zss.run-state','collision.indexed-controls','stage.depth-camera']}}).issues.filter(item=>item.code==='unsupported-engine-capability'),[],'exact supporting capabilities clear only their catalog diagnostics');
assert.deepStrictEqual(analyzeZss(gatedControllerSource).issues.filter(item=>item.code==='unsupported-engine-capability'),[],'target-less analysis does not guess catalog capability compatibility');
const gatedTriggerSource='[StateDef 200]\nif InRunState {}\nlet rate := BGMVar(sampleRate);\nlet channelRate := SoundVar(2, sampleRate);\nlet ordinary := SoundVar(2, volume);\ncall InRunState();\n# InRunState BGMVar(sampleRate)\n';
assert.deepStrictEqual(analyzeZss(gatedTriggerSource,{capabilities:{enabledCapabilities:[]}}).issues.filter(item=>item.code==='unsupported-engine-capability').map(item=>item.line),[1,2,3],'whole trigger and exact sample-rate parameters are guarded for stable targets without flagging ordinary parameters or authored calls');
assert.deepStrictEqual(analyzeZss(gatedTriggerSource,{capabilities:{enabledCapabilities:['zss.run-state','audio.sample-rate-query']}}).issues.filter(item=>item.code==='unsupported-engine-capability'),[],'supporting RunState and audio-query capabilities clear their exact trigger diagnostics');
assert.deepStrictEqual(analyzeZss(gatedTriggerSource).issues.filter(item=>item.code==='unsupported-engine-capability'),[],'target-less analysis does not guess trigger capability compatibility');
const defMap='[Info]\nname = "Ryu"\n[Map]\nMode = "training"\nRounds = 2\n';assert.deepStrictEqual(defMapCapabilityIssues(defMap,{enabledCapabilities:[]},'Ryu.def').map(item=>item.line),[3],'stable target reports only the positively identified string-valued DEF map default');assert.deepStrictEqual(defMapCapabilityIssues(defMap,{enabledCapabilities:['def.auto-typed-maps','zss.runtime-strings']},'Ryu.def'),[],'the exact paired DEF-map and runtime-string capabilities clear the compatibility finding');assert.deepStrictEqual(defMapCapabilityIssues(defMap,null,'Ryu.def'),[],'target-less DEF analysis does not guess compatibility');
const typedDefMap='[Map]\nGood = "value"\nGoEscape = "\\x41"\nInteger = -2\nFloat = .5e2\nBad = unquoted\nBroken = "unterminated\n[Info]\nname = unquoted but outside Map\n';assert.deepStrictEqual(defMapValueIssues(typedDefMap,{enabledCapabilities:['def.auto-typed-maps']}).map(item=>item.line),[5,6],'typed DEF validation reports only nonliteral and unterminated map defaults while accepting source-compatible quoted escapes');assert.deepStrictEqual(defMapValueIssues(typedDefMap,{enabledCapabilities:[]}),[],'targets without verified auto-typed DEF maps keep legacy value handling silent');assert.deepStrictEqual(defMapValueIssues(typedDefMap,null),[],'target-less DEF analysis does not guess value syntax');
const typedConstants='[Constants]\nLabel = "training"\nCount = 2\nScale = .5e1\nBad = value + 1\nBroken = "unterminated\n[Data]\nlife = value + 1\n';assert.deepStrictEqual(typedConstantIssues(typedConstants,{enabledCapabilities:[]},{legacy:true}).map(item=>item.line),[1],'stable targets report only the positively identified string constant');assert.deepStrictEqual(typedConstantIssues(typedConstants,{enabledCapabilities:['zss.runtime-strings']},{legacy:true}).map(item=>item.line),[4,5],'verified Nightly validates exact auto-typed constant literals');assert.deepStrictEqual(typedConstantIssues(typedConstants,null,{legacy:true}),[],'target-less constant analysis does not guess compatibility or value syntax');assert.deepStrictEqual(analyzeZss(typedConstants,{capabilities:{enabledCapabilities:['zss.runtime-strings']}}).issues.filter(item=>item.code==='invalid-typed-constant-value').map(item=>item.line),[4,5],'native ZSS analysis includes auto-typed constant value validation');
const shaderSource=`[StateDef 200]
let stageShader := StageVar(shadow.shader);
let explodShader := ExplodVar(10, 0, shader);
let projShader := ProjVar(20, 0, shader);
ModifyBGCtrl {
  shader.name: "water"
  shader.param15: 0.5
}
ModifyStageVar {
  reflection.shader.tex2.spr: 1, 0
  shadow.shader.param0: 1.0
}
AfterImage {
  shader.param14: 0.75
}
Explod {
  afterimage.shader.param3: 1.0
}
`;
const stableShader=analyzeZss(shaderSource,{capabilities:{enabledCapabilities:[]}}).issues;
assert.deepStrictEqual(stableShader.filter(item=>item.code==='unsupported-nightly-shader-surface').map(item=>item.line),[1,2,3],'stable target reports exact shader-name trigger parameters');
assert.deepStrictEqual(stableShader.filter(item=>item.code==='unsupported-engine-capability').map(item=>item.line),[5,6,9,10,13,16],'catalog and bounded param-family guards report expanded shader controller fields');
assert.deepStrictEqual(analyzeZss(shaderSource,{capabilities:{enabledCapabilities:['render.expanded-shaders']}}).issues.filter(item=>['unsupported-nightly-shader-surface','unsupported-engine-capability'].includes(item.code)),[],'verified expanded-shader target clears its exact compatibility diagnostics');
console.log('Nightly runtime-string diagnostics are exact-target gated and positive-syntax only');
