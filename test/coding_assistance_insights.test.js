'use strict';
const assert=require('assert'),crypto=require('crypto'),fs=require('fs'),os=require('os'),path=require('path');
const insights=require('../src/coding_assistance_insights');
const sha=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-insights-')),owner=path.join(root,'fighter.def'),source=path.join(root,'states.zss'),legacy=path.join(root,'legacy.cns');
const text=`// explod { pos: 999, 999; }
[StateDef 100]
if time = 0 {
  changeState { value: 200; }
}
[StateDef 200]
if time = 0 {
  map(Mode) := 1;
  helper {
    name: "Shot";
    id: 200;
    stateNo: 201;
    pos: 10, -20;
    postype: p1;
  }
  targetBind { pos: 4, -2; }
  playSnd { value: 1, 2; }
  changeState { value: 210; }
}
[StateDef 210]
if time > 30 { destroySelf {} }
[StateDef 900]
if time = 0 { changeState { value: 901; } }
[StateDef 901]
`;
const cns=`[StateDef 300]

[State 300, Trigger groups]
type = ChangeState
value = 301
triggerall = time = 0
trigger1 = moveContact
trigger1 = alive
trigger2 = time > 5
`;
fs.writeFileSync(owner,'[Info]\nlocalcoord = 640, 480\n[Files]\nstates = states.zss\n');fs.writeFileSync(source,text);fs.writeFileSync(legacy,cns);
const unsaved=text+'\n# unsaved\n',document={fileName:source,isClosed:false,isDirty:true,version:3,getText:()=>unsaved},vscode={workspace:{textDocuments:[document]},window:{activeTextEditor:{document,selection:{active:{line:7,character:3}}}}},scenario={name:'Corner whiff',checks:['facing','whiff','wall'],launchMode:'training',result:'not-run',ownerDef:owner,sourcePath:source,sourceHash:sha(unsaved),sourceLine:7};
const projection=insights.buildCodingAssistanceInsights(vscode,{files:[source,legacy],ownerDef:owner},{codingScenarios:[scenario],conditionValues:{time:0,moveContact:1,alive:1}}),byId=id=>projection.children.find(group=>group.id===id);
assert.strictEqual(projection.children.length,10);for(const id of ['condition-inspector','value-origin','change-impact','event-timeline','coordinate-attachment','local-map','worked-example','semantic-change','scenarios','resource-lifetime'])assert(byId(id),id);
assert(byId('condition-inspector').children.some(item=>/time = 0/.test(item.label)));
assert(!projection.children.flatMap(group=>group.children).some(item=>/999/.test(item.label)),'comments are masked');
assert(byId('value-origin').children.some(item=>/maps\.Mode/.test(item.label)&&item.source.fingerprint),'map origin must come from the indexed catalog with a revision');
assert(byId('change-impact').children.some(item=>item.status==='exact-scope'&&/StateDef 200/.test(item.label)),'impact must identify the parser-owned scope');
assert(byId('change-impact').children.some(item=>/200 ← 100/.test(item.label)),'impact must include the indexed incoming transition');
assert(byId('change-impact').children.some(item=>/200 → 210/.test(item.label)),'impact must include the indexed outgoing transition');
assert(byId('change-impact').children.some(item=>/helpers\./.test(item.label)),'impact must include scope-owned resources');
assert(byId('local-map').children.some(item=>/200 ← 100/.test(item.label)));
assert(!byId('local-map').children.some(item=>/901/.test(item.label)),'local map must not append unrelated whole-project transitions');
assert(byId('event-timeline').children.some(item=>/resources.*helper/i.test(item.label)&&item.source.fingerprint),'timeline uses source-linked indexed events');
assert(byId('event-timeline').children.some(item=>item.description.startsWith('state-time')),'timeline distinguishes authored state time');
const coordinate=byId('coordinate-attachment').children.find(item=>/helper/.test(item.label));assert(coordinate);assert.match(coordinate.label,/body attachment/);assert.match(coordinate.detail,/Trajectory space owner-relative/);assert(coordinate.source.fingerprint);
assert.match(coordinate.detail,/localcoord 640×480 from the exact owning DEF/);
const targetCoordinate=byId('coordinate-attachment').children.find(item=>/targetbind/.test(item.label));assert(targetCoordinate);assert.match(targetCoordinate.label,/opponent attachment/);assert.match(targetCoordinate.detail,/runtime-dependent/);
assert.strictEqual(coordinate.assistantAction.id,'open-coordinate-tools','coordinate evidence carries an explicit exact-source spatial/scale handoff');
const worked=byId('worked-example').children;assert(worked.some(item=>item.assistantAction?.id==='focus-similar-code'));assert(worked.some(item=>item.assistantAction?.id==='open-example-templates'));assert(worked.some(item=>item.assistantAction?.id==='open-recipe-library'),'worked examples connect Similar Code, templates, and reusable recipe ingredients');
assert(byId('semantic-change').children.some(item=>item.status==='unsaved-native-buffer'&&item.assistantAction?.id==='open-native-diff'),'semantic summary has an explicit native diff handoff');
assert.strictEqual(byId('scenarios').children.find(item=>item.label.startsWith('Corner whiff ·')).status,'not-run','unchanged exact scenario source must not be marked stale');
assert.match(byId('scenarios').children.find(item=>item.label.startsWith('Corner whiff ·')).detail,/ikemen\.authoring\.launchScenarioOwner/,'saved scenario exposes the exact-owner reviewed launch route');
const gameScenario=insights.scenarioItems({codingScenarios:[{...scenario,name:'Story check',launchMode:'game'}]},[{filename:source,fingerprint:scenario.sourceHash}],owner)[0];assert.match(gameScenario.detail,/without preselecting.*select this owner manually/i,'normal-game scenarios never claim exact-owner preselection');
assert(byId('resource-lifetime').children.some(item=>/helper 200/.test(item.label)&&item.source.fingerprint));
assert(byId('resource-lifetime').children.every(item=>/not proof of a runtime leak/i.test(item.detail)));
assert.deepStrictEqual(insights.evaluateCondition('time = 0 && moveContact',{time:0,moveContact:1}).status,'true');assert.strictEqual(insights.evaluateCondition('time = 0 && unknown',{time:0}).status,'unknown');
assert.strictEqual(insights.evaluateCondition(' flag ',{flag:{}}).status,'unknown','objects must not become true through JavaScript truthiness');
assert.strictEqual(insights.evaluateCondition('flag',{flag:[]}).status,'unknown','arrays must remain unsupported');
assert.strictEqual(insights.evaluateCondition('flag',{flag:null}).status,'unknown','null must remain unsupported');
assert.strictEqual(insights.evaluateCondition('flag',{flag:'false'}).status,'unknown','strings must not impersonate boolean values');
assert.strictEqual(insights.evaluateCondition('value > 0',{value:Number.NaN}).status,'unknown','NaN must remain unsupported');
assert.strictEqual(insights.evaluateCondition('value > 0',{value:Number.POSITIVE_INFINITY}).status,'unknown','infinite numbers must remain unsupported');
assert.strictEqual(insights.evaluateCondition(' time = 0 ',{time:0}).status,'true','surrounding whitespace must not make a supported direct expression unknown');
assert.strictEqual(insights.evaluateCondition('flag',{flag:false}).status,'false','explicit booleans remain supported');

const cnsDocument={fileName:legacy,isClosed:false,isDirty:false,version:1,getText:()=>cns},cnsProjection=insights.buildCodingAssistanceInsights({workspace:{textDocuments:[cnsDocument]},window:{activeTextEditor:{document:cnsDocument,selection:{active:{line:5,character:4}}}}},{files:[source,legacy],ownerDef:owner},{conditionValues:{time:0,moveContact:1,alive:1}}),cnsConditions=cnsProjection.children.find(group=>group.id==='condition-inspector').children;
assert(cnsConditions.some(item=>/triggerall/.test(item.label)&&/Required guard ANDed/.test(item.description)));
assert.strictEqual(cnsConditions.filter(item=>/trigger1/.test(item.label)).length,2);
assert(cnsConditions.filter(item=>/trigger1/.test(item.label)).every(item=>/one AND group/.test(item.description)));
assert(cnsConditions.some(item=>/trigger2/.test(item.label)&&/OR alternatives/.test(item.description)));

const pkg=JSON.parse(fs.readFileSync(path.join(__dirname,'..','package.json'),'utf8')),extension=fs.readFileSync(path.join(__dirname,'..','src','extension.js'),'utf8');
for(const command of ['ikemen.authoring.saveScenario','ikemen.authoring.recordScenarioResult','ikemen.authoring.launchScenario','ikemen.authoring.setConditionValues']){assert(pkg.activationEvents.includes(`onCommand:${command}`));assert(pkg.contributes.commands.some(item=>item.command===command));assert((pkg.contributes.menus['ikemen.text.project']||[]).some(item=>item.command===command));}
assert.match(extension,/buildCodingAssistanceInsights/);assert.match(extension,/coding_assistance_insights'\)\.register/);

const secondOwner=path.join(root,'other.def'),sharedSource=path.join(root,'shared.zss');fs.writeFileSync(secondOwner,'[Files]\nstates = shared.zss\n');fs.writeFileSync(sharedSource,'[StateDef 1]\n');
const contextA={type:'character',ownerDef:owner,root,files:[owner,source]},contextB={type:'character',ownerDef:secondOwner,root,files:[secondOwner,sharedSource]},registry={openContexts:()=>[contextA,contextB],currentContext:()=>contextA,contextOwnsFile:(entry,filename)=>(entry.files||[]).some(item=>path.resolve(item).toLowerCase()===path.resolve(filename).toLowerCase())||path.resolve(filename).toLowerCase().startsWith(path.resolve(entry.root).toLowerCase()+path.sep)};
assert.strictEqual(insights.exactCharacterContext(source,registry),contextA,'active exact character context owns its assigned source');
assert.strictEqual(insights.exactCharacterContext(sharedSource,registry),contextB,'exact assigned source wins over a broad shared root');
const storage={value:{schema:insights.CONDITION_SCHEMA,version:2,byOwner:{[path.resolve(owner).toLowerCase()]:{time:7},[path.resolve(secondOwner).toLowerCase()]:{time:9}}},workspaceState:{get(){return this.owner.value;},owner:null}};storage.workspaceState.owner=storage;
assert.deepStrictEqual(insights.conditionValues(storage,owner),{time:7});assert.deepStrictEqual(insights.conditionValues(storage,secondOwner),{time:9},'Condition Inspector assumptions are character-scoped');
const filtered=insights.scenarioItems({codingScenarios:[scenario,{...scenario,name:'Other owner',ownerDef:secondOwner}]},[{filename:source,fingerprint:scenario.sourceHash}],owner);assert.strictEqual(filtered.length,1);assert.match(filtered[0].label,/fighter\.def/,'same-named scenarios remain visibly owner-labelled');
fs.rmSync(root,{recursive:true,force:true});
console.log('Ten coding-insight groups use parser/catalog/spatial/lifecycle evidence with owner-scoped scenarios, supplied values, localcoord, timing, and menu reachability');
