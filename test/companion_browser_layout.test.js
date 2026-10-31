'use strict';

const assert = require('assert');
const { MINIMUM_BROWSER_WIDTH, style, clientScript, createMinimumWidthController } = require('../src/companion_browser_layout');

const css = style();
for (const marker of ['html,body{max-width:100%;overflow-x:hidden}', 'min-width:0;max-width:100%', 'flex-wrap:wrap', 'white-space:normal', 'overflow-wrap:break-word', '.path-token', 'overflow-wrap:anywhere']) assert(css.includes(marker), `missing companion-browser narrow layout marker: ${marker}`);
assert(!css.includes('*{min-width:0}'), 'fixed icon and range controls must not be crushed by a global min-width rule');
assert(css.includes('#actionControls){flex-shrink:0}'), 'browser navigation and control rows must never collapse into a thin inaccessible strip');
assert(clientScript().includes(`const minimum=${MINIMUM_BROWSER_WIDTH}`) && clientScript().includes("type:'companionBrowserViewport'") && clientScript().includes("type:'companionBrowserReady'"), 'every companion browser must report its real viewport and renderer readiness against one shared minimum');
(async()=>{
  const commands=[],messages=[],panel={viewColumn:2,reveal(){},webview:{postMessage(message){messages.push(message);}}},controller=createMinimumWidthController(panel,{executeCommand(command){commands.push(command);}});
  assert.strictEqual(await controller.handle({type:'other'}),false);
  assert.strictEqual(await controller.handle({type:'companionBrowserViewport',width:360,minimum:MINIMUM_BROWSER_WIDTH}),true);
  assert.deepStrictEqual(commands,['workbench.action.increaseViewWidth']);
  assert(messages.some(message=>message.type==='companionBrowserMeasure'),'the host asks for a fresh measurement after each bounded resize attempt');
  await controller.handle({type:'companionBrowserViewport',width:MINIMUM_BROWSER_WIDTH,minimum:MINIMUM_BROWSER_WIDTH});
  const values=new Map(),floatingCommands=[],storage={get:key=>values.get(key),update(key,value){values.set(key,value);}},clock={value:1000},floating=createMinimumWidthController(panel,{executeCommand(command){floatingCommands.push(command);}},undefined,{floatingOnly:true,storage,preferenceKey:'browser.air',now:()=>clock.value});
  await floating.handle({type:'companionBrowserViewport',width:1000,minimum:MINIMUM_BROWSER_WIDTH});
  assert.deepStrictEqual(floatingCommands,[],'an embedded browser is not resized before it is floated');
  floating.beginOpening();
  await floating.handle({type:'companionBrowserViewport',width:1000,minimum:MINIMUM_BROWSER_WIDTH});
  assert.strictEqual(floatingCommands.at(-1),'workbench.action.decreaseViewWidth','a first-use floating browser shrinks toward the shared minimum');
  await floating.handle({type:'companionBrowserViewport',width:MINIMUM_BROWSER_WIDTH,minimum:MINIMUM_BROWSER_WIDTH});
  await floating.handle({type:'companionBrowserViewport',width:600,minimum:MINIMUM_BROWSER_WIDTH});
  assert.strictEqual(values.get('browser.air'),600,'the first deliberate resize after opening is remembered without requiring another resize event');
  clock.value+=500;
  await floating.handle({type:'companionBrowserViewport',width:720,minimum:MINIMUM_BROWSER_WIDTH});
  assert.strictEqual(values.get('browser.air'),720,'a later user resize becomes that browser’s remembered width');
  const reopened=createMinimumWidthController(panel,{executeCommand(){}},undefined,{floatingOnly:true,storage,preferenceKey:'browser.air'});reopened.beginOpening();
  assert.strictEqual(reopened.target(),720,'later openings target the width chosen by the user');
  const nativeDeltas=[],native=createMinimumWidthController(panel,{executeCommand(command){throw new Error('editor width fallback must not run')}} ,undefined,{floatingOnly:true,resizeNative:async delta=>nativeDeltas.push(delta)});native.beginOpening();await native.handle({type:'companionBrowserViewport',width:1000,minimum:MINIMUM_BROWSER_WIDTH});assert.deepStrictEqual(nativeDeltas,[MINIMUM_BROWSER_WIDTH-1000],'floating auxiliary windows resize through the native window adapter rather than an ineffective one-group editor-width command');
  console.log('Shared companion-browser contract opens narrow, preserves controls, and remembers deliberate user resizing');
})().catch(error=>{console.error(error);process.exitCode=1});
