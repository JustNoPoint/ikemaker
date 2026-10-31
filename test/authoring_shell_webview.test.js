'use strict';
const assert = require('assert');
const { SPECIALIST_ACTION_IDS } = require('../src/viewer_toolbar_contract');
const { adapt } = require('../src/universal_toolbar_adapter');
const { createNavigationState } = require('../src/authoring_navigation_model');
const { renderAuthoringShellHtml, acceptAuthoringShellMessage, validatedAuthoringShellMessage, visualLaunchRoute, MESSAGE_TYPES } = require('../src/authoring_shell_webview');

const toolbar = adapt('code.authoring-workspace', { help:{ enabled:true, dispatch:'help.open' } });
const navigation = createNavigationState({ mode:'tabs', currentId:'source', items:[{id:'visual',label:'Visual Overview'},{id:'source',label:'Focused Source'},{id:'qa',label:'QA'}] });
const html = renderAuthoringShellHtml({ toolbar, navigation, viewMode:'split' }, { nonce:'fixture' });
assert.strictEqual((html.match(/data-universal-slot=/g)||[]).length, 29);
assert.strictEqual((html.match(/ikemaker-universal-toolbar__group"/g)||[]).length,4);
assert.strictEqual((html.match(/acquireVsCodeApi\(\)/g)||[]).length,1);
assert(html.includes('overflow:hidden')); assert(html.includes('overflow:visible!important'));
assert(html.includes('width:27px')&&html.includes('height:27px'));
assert(!html.includes('data-dispatch'),'universal toolbar markup never contains executable dispatch identities');
assert(html.includes('Visual')); assert(html.includes('Source')); assert(html.includes('Split')); assert(html.includes('Open Full Text'));
assert(html.includes('Tabs')); assert(!html.includes('data-mode="list"')); assert(html.includes('Cards'));
assert.strictEqual((html.match(/data-message="organize-navigation"/g)||[]).length,1); assert(html.includes('Organize tabs…'));
assert(html.includes('Previous authoring destination')); assert(html.includes('Next authoring destination'));
assert(html.includes('2 of 3 · Focused Source')); assert(html.includes('datalist id="destination-names"'));
assert(/destination-strip[\s\S]*Previous authoring destination[\s\S]*destination-tabs[\s\S]*Next authoring destination/.test(html), 'arrows flank the fixed code-file tab row');
assert(!html.includes('>Apply to Native Document<') && !html.includes('>Discard Draft<'), 'live document editing has no draft-application controls');
assert(!html.includes('command.workbench.action.files.save"')&&!html.includes('command.workbench.action.files.saveAs"'),'code chrome has no generic active-editor Save bypass');
assert(html.includes('Native-document-backed editor'),'the webview states its exact authority without claiming native-editor parity');
assert(!html.includes('apply-source')&&!html.includes('save-source')&&!html.includes('discard-source'),'obsolete hidden draft routes are absent from the client protocol');
assert.strictEqual(validatedAuthoringShellMessage({type:'set-navigation-mode',mode:'list'}),null,'List is browser-only');
assert.strictEqual(validatedAuthoringShellMessage({type:'set-navigation-mode',mode:'cards'}).mode,'cards');
assert.strictEqual(validatedAuthoringShellMessage({type:'set-view-mode',mode:'source',extra:true}),null,'extra message fields fail closed');
assert.strictEqual(validatedAuthoringShellMessage({type:'select-navigation',index:0,id:'both'}),null,'ambiguous navigation payloads fail closed');
assert.strictEqual(validatedAuthoringShellMessage({type:'select-navigation',id:'source',status:{unavailable:false}}),null,'webview traffic cannot author destination status');
assert.strictEqual(validatedAuthoringShellMessage({type:'activate-navigation',id:'source'}).id,'source');
assert.deepStrictEqual(validatedAuthoringShellMessage({type:'organize-navigation'}),{type:'organize-navigation'});
assert.strictEqual(validatedAuthoringShellMessage({type:'organize-navigation',id:'forged'}),null);
const handId=`hand-${'a'.repeat(32)}`;
assert.deepStrictEqual(validatedAuthoringShellMessage({type:'toggle-navigation-hand',id:handId}),{type:'toggle-navigation-hand',id:handId});
for(const id of ['states-code','hand-short',`hand-${'g'.repeat(32)}`,`${handId} `])assert.strictEqual(validatedAuthoringShellMessage({type:'toggle-navigation-hand',id}),null,'forged and reserved hand IDs fail closed');
assert.strictEqual(validatedAuthoringShellMessage({type:'edit-source',text:'x',revision:1,generation:1}).text,'x');
assert.strictEqual(validatedAuthoringShellMessage({type:'edit-source',text:'x',revision:1,generation:1,save:true}),null);
const editorView={type:'remember-source-view',generation:2,documentId:'c:/ryu/normal.zss',selectionStart:2,selectionEnd:7,selectionDirection:'forward',scrollTop:90,scrollLeft:4,focused:true};
assert.deepStrictEqual(validatedAuthoringShellMessage(editorView),editorView);
assert.strictEqual(validatedAuthoringShellMessage({...editorView,text:'forged source'}),null,'presentation reports cannot contain source text');
assert.strictEqual(validatedAuthoringShellMessage({...editorView,documentId:''}),null);
assert.strictEqual(validatedAuthoringShellMessage({...editorView,selectionEnd:1}),null);
assert(html.includes('aria-live="polite"')); assert(html.includes(':focus-visible'));
assert(html.includes('aria-controls="source-pane"')); assert(html.includes('role="tabpanel" aria-labelledby="authoring-destination-1"'));
assert(html.includes("key === 'ArrowLeft'")&&html.includes("key === 'PageUp'")&&html.includes("key === 'PageDown'"));
assert(html.includes('handleDestinationKey(navigationIds,tab.dataset.id,event'),'Tabs and Cards share the executable key controller');
assert(html.includes('applyDestinationVisibility(navigationButtons,revealNavigationId,focusNavigationId)'),'host-issued reveal and keyboard-only focus are applied through one controller');
const universalMarkup = /<nav class="ikemaker-universal-toolbar"[\s\S]*?<\/nav>/.exec(html)?.[0] || '';
for (const action of SPECIALIST_ACTION_IDS) assert(!universalMarkup.includes(action));
assert.deepStrictEqual(MESSAGE_TYPES.includes('save'), false);
let received; assert(acceptAuthoringShellMessage({type:'open-full-text'}, {'open-full-text':message=>{received=message;}})); assert.strictEqual(received.type,'open-full-text');
assert.strictEqual(acceptAuthoringShellMessage({type:'save'}, {save(){}}), false);
assert.throws(() => renderAuthoringShellHtml({ toolbar:{ ...toolbar, slots:toolbar.slots.slice(1) }, navigation }), /29 canonical slots/);
const unsafe = { slots:toolbar.slots.map((slot) => slot.id === 'help' ? {...slot,dispatch:SPECIALIST_ACTION_IDS[0]} : slot) };
assert.throws(() => renderAuthoringShellHtml({toolbar:{...toolbar,...unsafe},navigation}), /Specialist action/);
const groupedNavigation = createNavigationState({ mode:'cards', currentId:'a', items:[{id:'a',title:'normal.zss',kind:'zss'},{id:'b',title:'input.cmd',kind:'cmd'}], groups:[{id:'code',label:'States & Code',type:'auto',itemIds:['a']},{id:'commands',label:'Commands & Input',type:'auto',itemIds:['b']}] });
const nestedHtml = renderAuthoringShellHtml({ toolbar, navigation:groupedNavigation, viewMode:'visual', source:{ kind:'code-structure', root:{ children:[{kind:'state',title:'State 200',startLine:0,children:[{kind:'controller',title:'HitDef',startLine:3,children:[]}]}] } } }, {nonce:'fixture'});
assert.strictEqual((nestedHtml.match(/data-message="organize-navigation"/g)||[]).length,1,'Organize tabs occupies the same invariant header position in Cards');
assert(nestedHtml.includes('destination-card-group')); assert(nestedHtml.includes('States &amp; Code')); assert(nestedHtml.includes('Commands &amp; Input'));
assert(nestedHtml.includes('role="group" aria-labelledby="destination-group-0"')); assert(nestedHtml.includes('aria-current="page"'));
assert(!nestedHtml.includes('class="destination-cards" role="tablist"'),'Cards use grouped navigation semantics rather than pretending to be tabs');
assert(nestedHtml.includes('id="source-pane" role="region"')&&!nestedHtml.includes('id="source-pane" role="tabpanel"'),'Cards expose a labeled region rather than tabpanel semantics');
assert(nestedHtml.includes('[aria-current="page"]'));
assert(nestedHtml.includes('<details class="code-branch')); assert(nestedHtml.includes('HitDef')); assert(nestedHtml.includes('data-line="3"'), 'nested code can be collapsed while retaining exact source access');
const customCards=createNavigationState({mode:'cards',currentId:'c',items:[{id:'a',title:'a'},{id:'b',title:'b'},{id:'c',title:'c'}],customGroups:[{id:handId,label:'Hand',itemIds:['a','b']}],collapsedHandIds:[handId]});
const customHtml=renderAuthoringShellHtml({toolbar,navigation:customCards},{nonce:'fixture'});
assert(customHtml.includes('data-message="toggle-navigation-hand"')&&customHtml.includes(`data-hand-id="${handId}"`)&&customHtml.includes('aria-expanded="false"')&&!customHtml.includes('data-id="a"'),'an inactive collapsed custom hand renders a compact inline toggle');
assert(customHtml.includes('navigationIds=[&quot;')===false&&customHtml.includes('navigationIds=["a","b","c"]'),'canonical keyboard IDs are embedded independently from currently rendered card buttons');
const activeCustomHtml=renderAuthoringShellHtml({toolbar,navigation:createNavigationState({...customCards,currentId:'a'})},{nonce:'fixture'});
assert(activeCustomHtml.includes('aria-expanded="true"')&&activeCustomHtml.includes('data-id="a"'),'the current member forces a collapsed hand to render expanded so reveal and focus have one exact target');

const routes = [
  ['air','character','fighter.air','air.openAnimationPreview','Open AIR Animation Preview'],
  ['def','stage','stage.def','ikemen.stage.openWorkspace','Open Stage Workspace'],
  ['def','screenpack','system.def','ikemen.ui.openWorkspace','Open Screenpack Workspace'],
  ['def','roster','select.def','ikemen.selectDef.openWorkspace','Open Roster Manager'],
  ['def','character','hero.def','ikemen.characterDependencies.open','Open Character Dependencies']
];
for(const [kind,role,filename,command,label] of routes){
  const model={toolbar,navigation,viewMode:'visual',classification:{kind,role},source:{kind:'launch-card',filename,title:'Visual source',message:'Uses its existing owner.'}};
  assert.deepStrictEqual(visualLaunchRoute(model).command,command);
  const launchHtml=renderAuthoringShellHtml(model,{nonce:'fixture'});
  assert(launchHtml.includes('data-message="launch-visual"')); assert(launchHtml.includes(`data-route-command="${command}"`)); assert(launchHtml.includes(label)); assert(launchHtml.includes('Open Full Text'));
  let intent; assert(acceptAuthoringShellMessage({type:'launch-visual',command,filename,kind,role},{'launch-visual':value=>{intent=value;}}));
  assert.deepStrictEqual(intent,{type:'launch-visual',command,filename,kind,role});
}
assert.strictEqual(acceptAuthoringShellMessage({type:'launch-visual',command:'workbench.action.deleteFile',filename:'hero.def',kind:'def',role:'character'},{'launch-visual':()=>{}}),false,'launch messages must match the role/kind allowlist');
console.log('Authoring shell renders fixed universal chrome, accessible discrete navigation and an allowlisted no-write bridge');
