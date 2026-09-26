'use strict';

const assert = require('assert');
const obsoleteBaseline = new RegExp(['night' + 'ly', 'release ' + 'candidate', '\\bR' + 'C\\d*\\b'].join('|'), 'i');
const { clientModel, html, DOCS_URL, WIKI_URL } = require('../src/code_structure_workspace');
const { flatten } = require('../src/code_structure_model');

const text = `[StateDef 200]
hitDef{
  attr: S, NA;
  damage: 30, 0;
  ground.velocity: -4, 0;
}
`;
const document = { languageId: 'zss', fileName: 'normals.zss', uri: { toString: () => 'file:///normals.zss' }, getText: () => text };
const model = clientModel(document), hitDef = flatten(model).find((item) => item.kind === 'controller' && item.title.toLowerCase() === 'hitdef');
assert.strictEqual(model.experience, 'learning');
assert.strictEqual(clientModel(document, 'advanced').experience, 'advanced');
assert.ok(hitDef, 'HitDef controller should be recognized');
assert.deepStrictEqual(hitDef.usedParams.map((item) => item.toLowerCase()), ['attr', 'damage', 'ground.velocity']);
assert.ok(hitDef.doc.params.some((item) => item.name.toLowerCase() === 'attr'));
assert.match(hitDef.doc.params.find((item) => item.name === 'damage').description, /damage/i);
assert.strictEqual(hitDef.doc.params.find((item) => item.name === 'attr').required, true);
assert.strictEqual(hitDef.doc.params.find((item) => item.name === 'damage').placeholder, 'hit_damage, guard_damage');
assert.ok(hitDef.doc.params.some((item) => item.name === 'ground.velocity'));
assert.strictEqual(hitDef.doc.url, undefined, 'Controller reference should not depend on an online URL');
const page = html(model);
assert.ok(page.includes('id="onlineDocs"'));
assert.ok(page.includes('id="wiki"'));
assert.ok(page.includes('id="controllerDocs"'));
assert.ok(page.includes('Controller documentation (offline)'));
assert.ok(page.includes('insertOption'));
assert.ok(page.includes('click any unused option'));
assert.ok(page.includes('Online Docs'));
assert.ok(page.includes('id="experience"'));
assert.ok(page.includes('IKEMEN 1.0'));
assert.ok(page.includes('ZSS authoring path'));
assert.ok(page.includes('id="languagePath" open'));
assert.ok(!obsoleteBaseline.test(page));
assert.ok(!page.includes('controllerDocsLink'));
assert.ok(!page.includes('Offline docs'));
assert.ok(DOCS_URL.startsWith('https://'));
assert.ok(WIKI_URL.includes('github.com/ikemen-engine/Ikemen-GO/wiki'));

const cnsText = `[Statedef 200]\ntype = S\nmovetype = A\nphysics = S\n[State 200, Hit]\ntype = HitDef\ntrigger1 = AnimElem = 2\nattr = S, NA\ndamage = 30, 0\n`;
const cnsDocument = { languageId: 'ikemen-cns', fileName: 'normals.cns', uri: { toString: () => 'file:///normals.cns' }, getText: () => cnsText };
const cnsModel = clientModel(cnsDocument, 'advanced');
assert.strictEqual(cnsModel.language, 'cns');
const cnsHitDef = flatten(cnsModel).find((item) => item.kind === 'controller' && item.title.toLowerCase() === 'hitdef');
assert.ok(cnsHitDef);
assert.deepStrictEqual(cnsHitDef.usedParams.map((item) => item.toLowerCase()), ['attr', 'damage']);
assert.ok(cnsHitDef.doc.params.some((item) => item.name === 'damage'));
assert.ok(html(cnsModel).includes('"language":"cns"'));
assert.ok(html(cnsModel).includes('CNS → ZSS concept bridge'));
assert.ok(!html(cnsModel).includes('id="languagePath" open'));

console.log('Visual code structure workspace tests passed');

// Execute the native reveal helper and ensure its source visit carries its panel.
const fs=require('fs'),path=require('path'),vm=require('vm');
const workspaceSource=fs.readFileSync(path.join(__dirname,'../src/code_structure_workspace.js'),'utf8');
const revealBody=workspaceSource.match(/async function reveal\([^]*?\n\}/)[0];
const visits=[],panel={};
const navigation={currentPoint:(filename,kind,message,panel)=>({filename,kind,panel}),openViewerSource:async(...args)=>{visits.push(args);return true;}};
(async()=>{
 const ok=await vm.runInNewContext(revealBody+';reveal({},document,4,panel)',{document,panel,require:name=>{assert.equal(name,'./viewer_navigation');return navigation;}});
 assert.equal(ok,true);assert.equal(visits[0][0],'normals.zss');assert.equal(visits[0][1],4);assert.equal(visits[0][2].kind,'code');assert.equal(visits[0][2].panel,panel);
})().catch(error=>{console.error(error);process.exitCode=1;});

// Rebinding the singleton panel updates its owner identity before publishing.
const bindBody=workspaceSource.match(/function bindSession\([^]*?\n\}/)[0];
const events=[],session={panel:{webview:{postMessage:m=>events.push(['model',m.model])}}};
vm.runInNewContext(bindBody+';bindSession({},session,document)',{session,document,supported:()=>true,experienceFor:()=> 'learning',title:()=> 'test',clientModel:()=> 'new owner model',require:()=>({registerSourcePanel:(panel,filename)=>events.push(['owner',filename])})});
assert.equal(events[0][0],'owner');assert.equal(events[0][1],document.fileName);assert.equal(events[1][0],'model');
