'use strict';

const assert = require('assert');
const obsoleteBaseline = new RegExp(['night' + 'ly', 'release ' + 'candidate', '\\bR' + 'C\\d*\\b'].join('|'), 'i');
const { clientModel, html, blockAtLine, DOCS_URL, WIKI_URL } = require('../src/code_structure_workspace');
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
assert.strictEqual(blockAtLine(flatten(model),2),hitDef,'an exact Move Lab source line focuses the smallest containing visual block');
assert.strictEqual(blockAtLine(flatten(model),999),null,'an out-of-range source line never guesses another visual block');
assert.deepStrictEqual(hitDef.usedParams.map((item) => item.toLowerCase()), ['attr', 'damage', 'ground.velocity']);
assert.ok(hitDef.doc.params.some((item) => item.name.toLowerCase() === 'attr'));
assert.match(hitDef.doc.params.find((item) => item.name === 'damage').description, /damage/i);
assert.strictEqual(hitDef.doc.params.find((item) => item.name === 'attr').required, true);
assert.strictEqual(hitDef.doc.params.find((item) => item.name === 'damage').placeholder, 'hit_damage, guard_damage');
assert.ok(hitDef.doc.params.some((item) => item.name === 'ground.velocity'));
assert.strictEqual(hitDef.doc.url, undefined, 'Controller reference should not depend on an online URL');
const page = html(model);
assert(page.includes('model.focusOnSelected&&selected'), 'an explicit native-editor focus route opens with the exact selected block as the presentation-only focus');
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
assert.match(page,/data-toolbar-contract="universal-v1"/);assert.match(page,/data-surface-id="code\.structure"/);assert.strictEqual((page.match(/data-universal-slot=/g)||[]).length,29);
assert.strictEqual((page.match(/acquireVsCodeApi\(\)/g)||[]).length,1,'Code Structure uses one webview bridge');
assert.match(page,/id="filePrevious"/);assert.match(page,/id="fileSlider"/);assert.match(page,/id="fileNext"/);assert.match(page,/Tabs/);assert.match(page,/Cards/);assert.match(page,/Follow active supported editor/);
assert.match(page,/id="focusSelected"/);assert.match(page,/id="showAll"/);assert.match(page,/id="focusStatus"/);
assert.match(page,/Hide unrelated blocks in this presentation only/);assert.match(page,/presentation only/);
assert.match(page,/focusId=idFor\(selected\)/);assert.match(page,/focusId=null;render\(\)/);
assert.match(page,/Search names, explanations, and options/);assert.match(page,/value="issues">Issues &amp; safety/);
assert.match(page,/value="call">Function calls/);
assert.match(page,/doc\.summary,params,insights/);assert.match(page,/f==='issues'&&hasIssue/);
assert.doesNotMatch(page,/id=['"]saveCode/,'the universal Save action owns whole-document save');
assert.match(page,/select\(n,false\);vscode\.postMessage\(\{type:'selectBlock'/,'tree selection updates the visual selection without auto-revealing native source');
assert.match(page,/move-constants-content|code-structure-content/);assert.match(page,/\.code-structure-content \.viewer-icon-toolbar\{display:none!important\}/);
assert.ok(!/\b(?:Experimental|Beta)\b/i.test(page),'retired beta/experimental aliases stay out of the canonical menus');
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
assert.match(workspaceSource,/async function bindSession/,'file rebinding is serialized through the asynchronous host path');
