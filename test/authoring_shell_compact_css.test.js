'use strict';

const assert = require('assert');
const { adapt } = require('../src/universal_toolbar_adapter');
const { createNavigationState } = require('../src/authoring_navigation_model');
const { AUTHORING_SHELL_CSS, renderAuthoringShellHtml } = require('../src/authoring_shell_webview');
const { SLOTS } = require('../src/viewer_toolbar_contract');

const toolbar = adapt('code.authoring-workspace', { help:{ enabled:true, dispatch:'help.open' } });
const items = [
  {id:'a',title:'A very long first source filename.zss',filename:'c:/very/long/A very long first source filename.zss',status:{unavailable:true,diagnostics:{known:true,error:2,warning:1}}},
  {id:'b',title:'Second source.cmd'},
  {id:'c',title:'Third source.def'}
];
const tabs = createNavigationState({mode:'tabs',items,currentId:'b'});
const cards = createNavigationState({mode:'cards',items,currentId:'b',groups:[{id:'sources',label:'States and connected source files',type:'custom',itemIds:['a','b','c']}]});

assert.strictEqual(typeof AUTHORING_SHELL_CSS,'string');
assert(AUTHORING_SHELL_CSS.includes('@media(max-width:400px)'));
assert(AUTHORING_SHELL_CSS.includes('#authoring-content[data-view-mode="split"]{grid-template-columns:minmax(0,1fr)}'),'compact Split stacks Visual then Source in DOM order');
assert(AUTHORING_SHELL_CSS.includes('#authoring-content[data-view-mode="split"] #source-pane{border-top:1px solid var(--vscode-panel-border);border-left:0}'),'compact Source uses a top separator without a left divider');
assert(AUTHORING_SHELL_CSS.includes('.destination-strip{display:grid;grid-template-columns:27px minmax(0,1fr) 27px'));
assert(AUTHORING_SHELL_CSS.includes('.destination-tabs button{min-width:0;max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'));
assert(AUTHORING_SHELL_CSS.includes('.destination-card-group h3{')&&!AUTHORING_SHELL_CSS.includes('.destination-card-group h3{display:none'),'compact Cards retain visible headings');
assert(AUTHORING_SHELL_CSS.includes('.destination-card-group>div{display:flex')&&AUTHORING_SHELL_CSS.includes('flex-wrap:wrap'));
assert(AUTHORING_SHELL_CSS.includes('#destination-position{min-width:0;max-width:50%')&&AUTHORING_SHELL_CSS.includes('#destination-position{width:100%;max-width:100%}'),'slider readout remains bounded and expands compactly without truncating its text');
assert(AUTHORING_SHELL_CSS.includes('#visual-pane,#source-pane,.source-status{min-width:0;max-width:100%;overflow-wrap:anywhere}'));
assert(AUTHORING_SHELL_CSS.includes('.conflict{min-width:0')&&AUTHORING_SHELL_CSS.includes('overflow-wrap:anywhere'));
assert(AUTHORING_SHELL_CSS.includes('#source-editor{display:block;width:100%;max-width:100%')&&AUTHORING_SHELL_CSS.includes('resize:vertical;overflow:auto'));
assert(AUTHORING_SHELL_CSS.includes('.ikemaker-universal-toolbar__group{max-width:100%;min-width:0;flex-wrap:wrap}'));
assert(AUTHORING_SHELL_CSS.includes('.authoring-toolbar .viewer-action-favorites-bar{display:flex;flex-wrap:wrap'));
assert(AUTHORING_SHELL_CSS.includes('@media(forced-colors:active)'));
for (const color of ['CanvasText','Canvas','ButtonText','ButtonFace','HighlightText','Highlight']) assert(AUTHORING_SHELL_CSS.includes(color),`forced colors use ${color}`);
assert(AUTHORING_SHELL_CSS.includes('button[aria-selected="true"],button[aria-current="page"],button[aria-pressed="true"]'));
assert(!/animation\s*:|transition\s*:|scroll-behavior\s*:\s*smooth/i.test(AUTHORING_SHELL_CSS),'the local shell adds no motion, transitions, or smooth scrolling');
assert(AUTHORING_SHELL_CSS.includes('scroll-behavior:auto'));
assert(!/overflow-x\s*:\s*(auto|scroll)/i.test(AUTHORING_SHELL_CSS),'the local shell never creates horizontal scrolling');
for (const selector of ['body','.ikemaker-universal-toolbar','.authoring-toolbar']) {
  const rule = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\{([^}]*)\\}`).exec(AUTHORING_SHELL_CSS)?.[1] || '';
  assert(!/overflow(?:-x)?\s*:\s*(hidden|clip)/i.test(rule),`${selector} must wrap rather than clip horizontal content`);
}
assert(AUTHORING_SHELL_CSS.includes('.authoring-toolbar .viewer-icon-row button{color:ButtonText!important;background:ButtonFace!important;border-color:ButtonText!important}'),'forced colors specifically outrank imported quick-icon colors');
assert(AUTHORING_SHELL_CSS.includes('.authoring-toolbar .viewer-icon-row button:is(:active,[aria-selected="true"],[aria-current="page"],[aria-pressed="true"])'),'quick-icon active and selected states use system colors');
assert(AUTHORING_SHELL_CSS.includes('.destination-status-chip{display:inline-block;max-width:100%')&&AUTHORING_SHELL_CSS.includes('.source-status,.destination-status-chip,.destination-hand-summary{color:ButtonText!important'),'status chips and hand summaries are bounded locally and receive explicit system colors');

for (const mode of ['visual','source','split']) {
  const html = renderAuthoringShellHtml({toolbar,navigation:tabs,viewMode:mode},{nonce:'compact'});
  assert(html.includes(`data-view-mode="${mode}"`));
  for (const label of ['Visual','Source','Split','Open Full Text']) assert(html.includes(label),`${label} remains available in ${mode}`);
  assert.strictEqual((html.match(/data-universal-slot=/g)||[]).length,SLOTS.length,'compact overrides preserve all universal toolbar slots');
  assert(html.includes('width:27px!important')&&html.includes('height:27px!important'),'shared quick icons retain their 27px contract');
  const importedToolbar=html.indexOf('.ikemaker-universal-toolbar{box-sizing:border-box;display:flex;align-items:center;align-content:flex-start;flex-wrap:wrap');
  const localVisible=html.lastIndexOf('.ikemaker-universal-toolbar{max-width:100%;min-width:0;flex-wrap:wrap;overflow-x:visible}');
  assert(importedToolbar>=0&&localVisible>importedToolbar,'the rendered Code Viewer keeps its local wrapping/visibility contract after the imported universal toolbar CSS');
  assert(html.lastIndexOf('.authoring-toolbar .viewer-icon-row button{color:ButtonText!important')>html.indexOf('.viewer-icon-row button{box-sizing:border-box!important'),'the local forced-color quick-icon override follows and outranks imported icon CSS');
}

const tabHtml=renderAuthoringShellHtml({toolbar,navigation:tabs,viewMode:'split'},{nonce:'tabs'});
assert(tabHtml.includes('class="destination-tabs" role="tablist"'));
assert(tabHtml.includes('2 of 3 · Second source.cmd'),'the full canonical position remains visible and polite');
assert(tabHtml.includes('id="destination-position" for="destination-slider" aria-live="polite"'));
const cardHtml=renderAuthoringShellHtml({toolbar,navigation:cards,viewMode:'split'},{nonce:'cards'});
assert(cardHtml.includes('class="destination-cards" role="navigation"'));
assert(cardHtml.includes('States and connected source files'));
assert(cardHtml.includes('role="group" aria-labelledby="destination-group-0"'));
assert(cardHtml.includes('Unavailable')&&cardHtml.includes('2 errors')&&cardHtml.includes('1 warning'),'320px-compatible Cards retain concise textual status rather than color-only cues');
assert(cardHtml.includes('3 files · 1 with problems'),'custom hands aggregate all members, including collapsed members, without another header row');

console.log('Authoring shell compact, wrapping and forced-color CSS contract passed');
