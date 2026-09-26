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
const { SCREEN_LINKS, DOCS, html } = require('../src/help_workspace');
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
assert(page.includes('@media(max-width:700px)'));
assert(!/Uproar/i.test(page), 'public help must not expose private project material');

console.log('Help and Learning workspace tests passed');

// Exercise the actual image resolver used by the Help panel, including JPEG.
const path=require('path');
const helpApi=require('../src/help_workspace');
const helpPanel={webview:{asWebviewUri:uri=>({toString:()=> 'test-image:'+uri.fsPath}),onDidReceiveMessage(fn){helpPanel.receive=fn;}},onDidDispose(){}};
mockVscode.Uri={file:fsPath=>({fsPath})};mockVscode.window.createWebviewPanel=()=>helpPanel;
(async()=>{
 await helpApi.openHelp({extensionUri:{fsPath:path.resolve(__dirname,'..')}});
 assert(helpPanel.webview.html.includes('code-cohesion.jpg'),'new JPEG screenshot must resolve through the actual Help panel');
 assert(helpPanel.webview.html.includes('stage.png'),'existing PNG screenshots remain supported');
 assert(helpPanel.webview.html.includes('Viewer History Back can reopen'));
 assert(helpPanel.webview.html.includes('Content-Security-Policy'));
 const invoked=[];mockVscode.commands.executeCommand=async id=>invoked.push(id);
 await helpPanel.receive({type:'command',command:'workbench.action.closeWindow'});assert.equal(invoked.length,0);
 await helpPanel.receive({type:'command',command:SCREEN_LINKS[0][1]});assert.equal(invoked.length,1);
 require('../src/interface_mode').configure({workspace:{getConfiguration:()=>({get:()=> 'player'})}},{});
 await helpPanel.receive({type:'command',command:'ikemen.productionWorkflow.open'});assert.equal(invoked.length,1);
 await helpPanel.receive({type:'doc',filename:'not-listed.md'});assert.equal(invoked.length,1);
})().catch(error=>{console.error(error);process.exitCode=1;});

