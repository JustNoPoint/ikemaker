'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemen-player-palette-route-'));
const defPath = path.join(root, 'Ryu.def'), sffPath = path.join(root, 'Ryu.sff'), actPath = path.join(root, 'Ryu-02.act');
fs.writeFileSync(defPath, '[Files]\nsprite = Ryu.sff\n'); fs.writeFileSync(sffPath, 'fixture'); fs.writeFileSync(actPath, Buffer.alloc(768, 1));

function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};}
let panelHandler, staged, commands = [], information = 'Finish Color Update', inputs = ['1', '2'],updateGate=null,updates=0,events=[],stageError=false,errors=[];
const panel = { webview: { html: '', cspSource: 'fixture', messages:[], onDidReceiveMessage(handler) { panelHandler = handler; }, postMessage(message) { panel.lastMessage = message;this.messages.push(message);return true; } }, dispose() { panel.disposed = true; } };
const vscode = {
  ConfigurationTarget: { Global: 1 }, ViewColumn: { Active: 1 }, Uri: { file: (fsPath) => ({ fsPath }) },
  workspace: { getConfiguration: () => ({ get: () => 'reversed', update: async () => {updates+=1;events.push('setting');if(updateGate)await updateGate.promise;} }) },
  window: {
    showQuickPick: async (items) => items.find((item) => item.newSlot),
    showInputBox: async () => inputs.shift(),
    createWebviewPanel: () => panel,
    showInformationMessage: async () => information,showErrorMessage:message=>errors.push(message),showWarningMessage:message=>errors.push(message)
  },
  commands: { executeCommand: async (...args) => commands.push(args) }
};
const archive = { buffer: Buffer.from('fixture'), palettes: [{ group: 1, number: 1, colors: 256, dataSize: 768, index: 0 }], sprites: [{ group: 0, number: 0, colorDepth: 8, paletteIndex: 0 }] };
const original = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return vscode;
  if (request === './sff_reader') return { readSff: () => archive, actRgba: () => Array.from({ length: 256 }, (_, i) => [i, 0, 0, 255]), spriteDataUri: (_archive, _sprite, colors) => `preview:${colors?.[0]?.[0] ?? 'current'}` };
  if (request === './palette_library') return { pngPaletteRgba: () => [] };
  if (request === './palette_plan') return { stagePalette: (...args) => { events.push('stage');if(stageError)throw new Error('forced stage failure');staged = args; return { filename: 'plan.json' }; } };
  if (request === './viewer_group') return { preferredViewerColumn: () => 1, trackViewerPanel: (value) => value };
  if (request === './webview_policy') return { protect: (value) => value };
  if (request === './mutation_safety') return { hash: buffer => Buffer.from(buffer).toString('hex'), transactionalWrite() {}, optionsFromConfig: () => ({}) };
  return original.call(this, request, parent, main);
};
const flow = require('../src/roster_palette_flow');
Module._load = original;

(async () => {
  await flow.routeRosterPalette(defPath, actPath);
  assert(panel.webview.html.includes('Preview new color 1,2'));
  assert(panel.webview.html.includes('id="flowStatus"')&&panel.webview.html.includes('role="status" aria-live="polite"'));assert(panel.webview.html.includes('alt="Current character color preview"')&&panel.webview.html.includes('alt="Proposed new character color preview"'));assert(panel.webview.html.includes('@media(max-width:720px)')&&panel.webview.html.includes('requestId:++requestId'));assert.doesNotThrow(()=>new Function(panel.webview.html.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]));
  assert(panel.webview.html.includes('Reversed Photoshop method (255 → 0)'));
  assert(panel.webview.html.includes('flipTable" type="checkbox" checked'), 'remembered reversed order should be visible before staging');
  await panelHandler({ type: 'preview', requestId:1, flipTable: true, rememberOrder: false });
  assert.strictEqual(panel.lastMessage.after, 'preview:255', 'preview should use the selected reversed table');
  await panelHandler({ type: 'apply', requestId:2, flipTable: true, rememberOrder: false });
  assert.strictEqual(staged[5].tableOrder, 'reversed', 'staged plan must preserve the selected ACT order through the build');
  assert.deepStrictEqual(commands.at(-1), ['ikemen.palettePlayer.finishStaged', { fsPath: sffPath }]);
  assert(!commands.some(([command]) => command === 'sff.openViewer' || command === 'ikemen.paletteImport.open'));

  staged = undefined; commands = []; inputs = ['1', '3']; information = 'Later'; panel.disposed = false;
  await flow.routeRosterPalette(defPath, actPath); await panelHandler({ type: 'cancel' });
  assert.strictEqual(staged, undefined, 'canceling the new-color preview must not stage a plan');
  assert.strictEqual(commands.length, 0, 'canceling must not escape to a broader authoring command');

  staged=undefined;commands=[];events=[];inputs=['1','4'];panel.disposed=false;updateGate=deferred();await flow.routeRosterPalette(defPath,actPath);const pending=panelHandler({type:'apply',requestId:3,flipTable:true,rememberOrder:true});await Promise.resolve();await Promise.resolve();assert(staged,'the primary reviewed plan is staged before optional preference persistence begins');assert.deepStrictEqual(events.slice(0,2),['stage','setting']);assert.strictEqual(await panelHandler({type:'apply',requestId:4,flipTable:true,rememberOrder:true}),false,'duplicate Add Color is rejected while post-success preference work is pending');assert(panel.webview.messages.some(message=>message.type==='flowBusy'&&/Wait/.test(message.status)));updateGate.resolve();assert(await pending);updateGate=null;assert.strictEqual(updates,1,'ACT order persists only after a successful primary stage');

  staged=undefined;events=[];commands=[];inputs=['1','5'];stageError=true;const updatesBeforeFailure=updates;await flow.routeRosterPalette(defPath,actPath);assert.strictEqual(await panelHandler({type:'apply',requestId:5,flipTable:true,rememberOrder:true}),false);stageError=false;assert.strictEqual(staged,undefined);assert.strictEqual(updates,updatesBeforeFailure,'failed primary staging cannot change the ACT-order preference');assert(errors.some(message=>/forced stage failure/.test(message)));

  staged=undefined;events=[];inputs=['1','6'];await flow.routeRosterPalette(defPath,actPath);fs.writeFileSync(actPath,Buffer.alloc(768,2));assert.strictEqual(await panelHandler({type:'apply',requestId:6,flipTable:false,rememberOrder:false}),false);assert.strictEqual(staged,undefined,'a changed palette source cannot be staged from stale preview colors');assert(errors.some(message=>/palette source changed/.test(message)));fs.writeFileSync(actPath,Buffer.alloc(768,1));

  staged=undefined;events=[];inputs=['1','7'];await flow.routeRosterPalette(defPath,actPath);fs.writeFileSync(sffPath,'changed SFF inventory');assert.strictEqual(await panelHandler({type:'apply',requestId:7,flipTable:false,rememberOrder:false}),false);assert.strictEqual(staged,undefined,'a changed SFF cannot use stale occupied-slot evidence');assert(errors.some(message=>/SFF changed/.test(message)));fs.writeFileSync(sffPath,'fixture');
  fs.rmSync(root, { recursive: true, force: true });
  console.log('Player new-palette route preserves ACT order, stages only after approval, and never opens broad SFF tools');
})().catch((error) => { fs.rmSync(root, { recursive: true, force: true }); console.error(error); process.exitCode = 1; });
