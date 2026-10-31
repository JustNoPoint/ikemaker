'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemen-palette-replace-safety-'));
const defPath = path.join(root, 'Ryu.def'), sffPath = path.join(root, 'Ryu.sff'), actPath = path.join(root, 'Ryu.act');
fs.writeFileSync(defPath, '[Files]\nsprite = Ryu.sff\n');
fs.writeFileSync(sffPath, 'fixture');
fs.writeFileSync(actPath, Buffer.alloc(768, 1));

function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};}
let handler, answer, updates = 0, writes = 0, warning, warningGate=null, errors=[],disposeListeners=[],writeError=false;
const archive = {
  buffer: Buffer.from('fixture'),
  palettes: [{ group: 1, number: 1, colors: 256, dataSize: 768, index: 0 }],
  sprites: [{ group: 0, number: 0, colorDepth: 8, paletteIndex: 0 }]
};
const panel = {
  webview: { cspSource: 'fixture', html: '', messages:[], onDidReceiveMessage(callback) { handler = callback; }, postMessage(message) { this.messages.push(message);return true; } },
  onDidDispose(callback){disposeListeners.push(callback);},dispose() {for(const callback of disposeListeners.splice(0))callback();}
};
const vscode = {
  ConfigurationTarget: { Global: 1 }, ViewColumn: { Active: 1 }, Uri: { file: (fsPath) => ({ fsPath }) },
  workspace: { getConfiguration: () => ({ get: () => 'index', update: async () => { updates += 1; } }) },
  window: {
    createWebviewPanel: () => panel,
    showWarningMessage: async (...args) => { warning = args;if(warningGate)await warningGate.promise;return answer; },
    showInformationMessage() {},showErrorMessage:message=>errors.push(message)
  }
};
const original = Module._load;
Module._load = function patched(request, parent, main) {
  if (request === 'vscode') return vscode;
  if (request === './sff_reader') return { readSff: () => archive, actRgba: () => Array.from({ length: 256 }, (_, index) => [index, index, index, 255]), spriteDataUri: () => 'preview' };
  if (request === './palette_editor') return {
    paletteRole: () => 'Player color',
    paletteReplacementPlan: () => ({ changedCount: 12 }),
    bufferWithPaletteReplacement: () => ({ buffer: Buffer.from('changed') }),
    reversePaletteRgb: (colors) => colors.slice().reverse()
  };
  if (request === './palette_selection_operations') return { applyPreset: (colors) => colors };
  if (request === './viewer_group') return { preferredViewerColumn: () => 1, trackViewerPanel: (value) => value };
  if (request === './webview_policy') return { protect: (value) => value };
  if (request === './mutation_safety') return { hash: buffer => Buffer.from(buffer).toString('hex'), optionsFromConfig: () => ({}), transactionalWrite: () => {if(writeError)throw new Error('forced write failure');writes += 1;} };
  return original.call(this, request, parent, main);
};
const { openRosterPaletteFlow } = require('../src/roster_palette_flow');
Module._load = original;

(async () => {
  await openRosterPaletteFlow(defPath, actPath, 0);
  assert(panel.webview.html.includes('Replace Existing Palette'));
  assert(panel.webview.html.includes('id="flowStatus"')&&panel.webview.html.includes('role="status" aria-live="polite"'));assert(panel.webview.html.includes('alt="Character using the existing palette"')&&panel.webview.html.includes('alt="Character using the proposed replacement palette"'));assert(panel.webview.html.includes('requestId:++requestId')&&panel.webview.html.includes('event.data.requestId!==requestId'));assert.doesNotThrow(()=>new Function(panel.webview.html.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]));
  await handler({ type: 'preview', requestId:1, paletteIndex: 0, flipTable: true, rememberOrder: true, preset: 'none' });
  assert.strictEqual(updates, 0, 'preview must not save the ACT-order preference');
  assert.strictEqual(writes, 0, 'preview must not write the SFF');
  await handler({ type: 'cancel' });
  assert.strictEqual(updates, 0, 'cancel must not save the ACT-order preference');
  assert.strictEqual(writes, 0, 'cancel must not write the SFF');

  await openRosterPaletteFlow(defPath, actPath, 0);
  answer = undefined;
  await handler({ type: 'apply', requestId:2, paletteIndex: 0, flipTable: true, rememberOrder: true, preset: 'none' });
  assert.deepStrictEqual(warning.slice(2), ['Replace Palette'], 'the destructive action must be replacement-specific');
  assert.strictEqual(updates, 0, 'declining replacement must not save the ACT-order preference');
  assert.strictEqual(writes, 0, 'declining replacement must not write the SFF');

  answer = 'Replace Palette';
  await handler({ type: 'apply', requestId:3, paletteIndex: 0, flipTable: true, rememberOrder: true, preset: 'none' });
  assert.strictEqual(updates, 1, 'the confirmed replacement may save the chosen ACT order');
  assert.strictEqual(writes, 1, 'the confirmed replacement must perform exactly one transactional SFF write');

  await openRosterPaletteFlow(defPath, actPath, 0);answer='Replace Palette';warningGate=deferred();const writesBeforeCancel=writes,pending=handler({type:'apply',requestId:4,paletteIndex:0,flipTable:false,rememberOrder:false,preset:'none'});await Promise.resolve();await Promise.resolve();assert.strictEqual(await handler({type:'apply',requestId:5,paletteIndex:0,flipTable:false,rememberOrder:false,preset:'none'}),false,'duplicate Apply is rejected while the exact modal review is pending');assert(panel.webview.messages.some(message=>message.type==='flowBusy'&&/Wait/.test(message.status)),'overlap has an actionable visible reason');await handler({type:'cancel'});warningGate.resolve();assert.strictEqual(await pending,false,'Cancel invalidates the suspended confirmation owner');warningGate=null;assert.strictEqual(writes,writesBeforeCancel,'a confirmation cannot write after its panel was cancelled and disposed');

  await openRosterPaletteFlow(defPath,actPath,0);warningGate=deferred();const writesBeforeChange=writes,changed=handler({type:'apply',requestId:6,paletteIndex:0,flipTable:false,rememberOrder:false,preset:'none'});await Promise.resolve();fs.writeFileSync(sffPath,'changed while modal open');warningGate.resolve();assert.strictEqual(await changed,false);warningGate=null;assert.strictEqual(writes,writesBeforeChange,'a changed SFF cannot be overwritten from a stale pre-confirmation preview');assert(errors.some(message=>/changed while the replacement confirmation was open/.test(message)));

  fs.writeFileSync(sffPath,'fixture');await openRosterPaletteFlow(defPath,actPath,0);writeError=true;const updatesBeforeWriteFailure=updates,writesBeforeFailure=writes;assert.strictEqual(await handler({type:'apply',requestId:7,paletteIndex:0,flipTable:true,rememberOrder:true,preset:'none'}),false);writeError=false;assert.strictEqual(writes,writesBeforeFailure);assert.strictEqual(updates,updatesBeforeWriteFailure,'failed primary replacement cannot persist an ACT-order preference');assert(errors.some(message=>/forced write failure/.test(message)));
  fs.rmSync(root, { recursive: true, force: true });
  console.log('Palette replacement preview/cancel/decline are non-writing; confirmed Replace Palette writes once');
})().catch((error) => { fs.rmSync(root, { recursive: true, force: true }); console.error(error); process.exitCode = 1; });
