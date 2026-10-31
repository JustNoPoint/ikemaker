'use strict';

const assert = require('assert');
const Module = require('module');
const original = Module._load;
const mockVscode={ window: {}, commands: {}, ViewColumn: { Active: -1 } };
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return mockVscode;
  if(request==='./viewer_group')return {trackViewerPanel:p=>p,preferredViewerColumn:()=>1,revealInViewerGroup:()=>{}};
  return original.call(this, request, parent, main);
};
const { SCREEN_LINKS, DOCS, helpToolbarModel, html } = require('../src/help_workspace');
const { MESSAGE_TYPE } = require('../src/universal_toolbar_webview');
Module._load = original;

require('../src/interface_mode').configure({workspace:{getConfiguration:()=>({get:()=> 'workspace'})}},{});
const page = html();
const packageJson = require('../package.json');
const declared = new Set(packageJson.contributes.commands.map((item) => item.command));
assert(SCREEN_LINKS.length >= 10, 'help must bridge the major creation screens');
assert(DOCS.length >= 5, 'help must expose the bundled offline guides');
for (const [, command] of SCREEN_LINKS) {
  assert(page.includes(`data-command="${command}"`), `missing screen bridge ${command}`);
  assert(declared.has(command), `help links to undeclared command ${command}`);
}
for (const [, filename] of DOCS) assert(page.includes(`data-doc="${filename}"`), `missing offline document ${filename}`);
for (const label of ['Start Here', 'Screen Guide', 'MUGEN → IKEMEN', 'Offline Docs', 'Compatibility']) assert(page.includes(label));
assert(page.includes('Learning mode'));assert(page.includes('data-ikemen-mode-style'));assert(page.includes('ikemenModeVisibilityChanged'));
for(const [,command]of SCREEN_LINKS)assert(page.includes('data-run-command="'+command+'"'),'mode rules apply to the complete screen card');
assert(page.includes('reviewed and incremental'));
assert(page.includes('IKEMEN GO 1.0'));
assert(page.includes('MUGEN remains supported'));
assert(page.includes('AIR / Clsn context'),'Move Lab help explains the explicit assigned-action catalog');
assert(page.includes('Selection and summaries are read-only'),'Move Lab help preserves specialist mutation ownership');
assert(page.includes('Constants are optional'),'the optional constants integration is not presented as universal policy');
assert(page.includes('@media(max-width:700px)'));
assert.strictEqual((page.match(/data-universal-slot=/g)||[]).length,29,'Help composes every canonical universal slot');
assert.strictEqual((page.match(/ikemaker-universal-toolbar__group"/g)||[]).length,4,'universal actions wrap only as four whole groups');
assert(page.includes('width:27px')&&page.includes('height:27px')&&page.includes('flex-wrap:wrap')&&page.includes('overflow-x:hidden'));
assert(page.includes('role="tablist" aria-label="Help sections"')&&page.includes('role="tab" aria-selected="true"')&&page.includes('role="tabpanel" aria-labelledby="helpTab-start"'),'Help sections expose complete tab semantics');
assert(page.includes("event.key==='ArrowRight'")&&page.includes("event.key==='Home'")&&page.includes("event.key==='End'"),'Help tabs provide Arrow/Home/End keyboard navigation');
assert(page.includes('id="helpActionStatus"')&&page.includes("type==='helpActionState'"),'Help exposes host-action progress and completion through a polite live region');
assert(page.includes('data-help-command=')&&page.includes("globalThis.ikemenModeVisibilityChanged")&&page.includes("getComputedStyle(control).display!=='none'"),'Help universal actions track live mode visibility and pending state');
assert(page.includes('No screens match. Change or clear the search.'),'an empty Screen Guide search has an actionable result');
assert(page.includes("dialog.addEventListener('close'")&&page.includes('lastDialogTrigger')&&page.includes('aria-modal="true"'),'screenshot review restores focus through a named modal dialog');
const imagePage=html({imageUri:()=> 'test.png'});assert(imagePage.includes('<img')&&imagePage.includes('alt="" loading="lazy"'),'screenshot images inside named buttons are decorative instead of duplicating speech');
assert(page.includes('Save — unavailable:'),'unavailable Help actions remain visible with reasons');
assert(!page.includes('snd.element.'),'specialist controls never enter Help universal chrome');
assert(!page.includes('nav{display:flex'),'Help tab styling cannot leak into universal nav');
assert.strictEqual((page.match(/acquireVsCodeApi\(\)/g)||[]).length,1,'Help and universal toolbar share one VS Code API acquisition');
assert(!/Uproar/i.test(page), 'public help must not expose private project material');
require('../src/interface_mode').configure({workspace:{getConfiguration:()=>({get:()=> 'player'})}},{});const playerToolbar=helpToolbarModel();for(const id of ['new','open','project','actions-search']){const slot=playerToolbar.slots.find(item=>item.id===id);assert.strictEqual(slot.enabled,false,`${id} must respect Player-mode admission`);assert.match(slot.reason,/current IKEMaker mode/)}require('../src/interface_mode').configure({workspace:{getConfiguration:()=>({get:()=> 'workspace'})}},{});for(const id of ['new','open','project','actions-search'])assert.strictEqual(helpToolbarModel().slots.find(item=>item.id===id).enabled,true,`${id} must return in Workspace mode`);

console.log('Help and Learning workspace tests passed');

// Exercise the actual image resolver used by the Help panel, including JPEG.
const path=require('path');
const helpApi=require('../src/help_workspace');
const helpPanel={messages:[],disposers:[],webview:{asWebviewUri:uri=>({toString:()=> 'test-image:'+uri.fsPath}),onDidReceiveMessage(fn){helpPanel.receive=fn;},postMessage(message){helpPanel.messages.push(message);return true;}},onDidDispose(fn){helpPanel.disposers.push(fn);},dispose(){for(const fn of helpPanel.disposers)fn();}};
mockVscode.Uri={file:fsPath=>({fsPath})};mockVscode.window.createWebviewPanel=()=>helpPanel;
(async()=>{
 await helpApi.openHelp({extensionUri:{fsPath:path.resolve(__dirname,'..')}});
 assert(helpPanel.webview.html.includes('code-cohesion.jpg'),'new JPEG screenshot must resolve through the actual Help panel');
 assert(helpPanel.webview.html.includes('stage.png'),'existing PNG screenshots remain supported');
 assert(helpPanel.webview.html.includes('Viewer History Back can reopen'));
 assert(helpPanel.webview.html.includes('Content-Security-Policy'));
 const invoked=[];mockVscode.commands.executeCommand=async id=>invoked.push(id);
 await helpPanel.receive({type:MESSAGE_TYPE,slotId:'project',command:'workbench.action.deleteFile'});assert.equal(invoked.length,0,'forged universal envelopes fail closed');
 await helpPanel.receive({type:MESSAGE_TYPE,slotId:'project'});assert.deepStrictEqual(invoked,['ikemen.projectManager.open']);
 await helpPanel.receive({type:'command',command:'workbench.action.closeWindow'});assert.equal(invoked.length,1);
 assert.deepStrictEqual(invoked,['ikemen.projectManager.open']);
 await helpPanel.receive({type:'command',command:SCREEN_LINKS[0][1]});assert.equal(invoked.length,2);
 require('../src/interface_mode').configure({workspace:{getConfiguration:()=>({get:()=> 'player'})}},{});
 await helpPanel.receive({type:'command',command:'ikemen.productionWorkflow.open'});assert.equal(invoked.length,2);
 await helpPanel.receive({type:'doc',filename:'not-listed.md'});assert.equal(invoked.length,2);
 require('../src/interface_mode').configure({workspace:{getConfiguration:()=>({get:()=> 'workspace'})}},{});
 await helpPanel.receive({type:'doc',filename:'README.md'});assert.strictEqual(invoked.at(-1),'markdown.showPreview','an exact bundled document opens through the reviewed preview route');
 let release;const held=new Promise(resolve=>{release=resolve});mockVscode.commands.executeCommand=async id=>{invoked.push(id);if(id==='ikemen.character.open')await held;};
 const firstAction=helpPanel.receive({type:'command',command:'ikemen.character.open'});await new Promise(resolve=>setImmediate(resolve));
 await helpPanel.receive({type:'command',command:'ikemen.file.createNew'});assert.strictEqual(invoked.filter(id=>id==='ikemen.character.open').length,1);assert.strictEqual(invoked.filter(id=>id==='ikemen.file.createNew').length,0,'overlapping Help destinations are rejected instead of queued');
 await helpPanel.receive({type:MESSAGE_TYPE,slotId:'project'});assert.strictEqual(invoked.filter(id=>id==='ikemen.projectManager.open').length,1,'universal actions share the synchronous Help lane with body actions');
 await helpPanel.receive({type:'command',command:'ikemen.file.createNew',extra:true});assert.strictEqual(invoked.filter(id=>id==='ikemen.file.createNew').length,0,'extra-field body messages fail closed');
 release();await firstAction;assert(helpPanel.messages.some(message=>message.type==='helpActionState'&&message.busy===true));assert(helpPanel.messages.some(message=>message.type==='helpActionState'&&message.busy===false&&/opened/.test(message.status)),'Help publishes terminal action state');
 let releaseUniversal;const heldUniversal=new Promise(resolve=>{releaseUniversal=resolve});mockVscode.commands.executeCommand=async id=>{invoked.push(id);if(id==='ikemen.projectManager.open')await heldUniversal;};const projectsBefore=invoked.filter(id=>id==='ikemen.projectManager.open').length,opensBefore=invoked.filter(id=>id==='workbench.action.files.openFile').length;const universalFirst=helpPanel.receive({type:MESSAGE_TYPE,slotId:'project'});await new Promise(resolve=>setImmediate(resolve));await helpPanel.receive({type:MESSAGE_TYPE,slotId:'open'});assert.strictEqual(invoked.filter(id=>id==='ikemen.projectManager.open').length,projectsBefore+1);assert.strictEqual(invoked.filter(id=>id==='workbench.action.files.openFile').length,opensBefore,'overlapping universal actions are rejected before the shared dispatcher queue');const messagesBeforeDispose=helpPanel.messages.length;helpPanel.dispose();releaseUniversal();await universalFirst;assert.strictEqual(helpPanel.messages.length,messagesBeforeDispose,'disposed Help cannot publish a late universal completion');
})().catch(error=>{console.error(error);process.exitCode=1;});

