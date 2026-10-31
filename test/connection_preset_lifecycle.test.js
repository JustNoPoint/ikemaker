'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { pathToFileURL, fileURLToPath } = require('url');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'connection-lifecycle-'));
const a = path.join(root, 'A.def'), b = path.join(root, 'B.def');
for (const [file, name] of [[a, 'Alpha'], [b, 'Beta']]) fs.writeFileSync(file, `[Info]\nname = ${name}\n[Files]\n`, 'utf8');

function uriFile(filename) {
  const fsPath = path.resolve(filename);
  return { fsPath, scheme:'file', toString:() => pathToFileURL(fsPath).toString() };
}
function uriParse(value) { return uriFile(fileURLToPath(value)); }
function makePanel() {
  const disposeListeners = [], viewListeners = [], receiveListeners = [];
  return {
    active:true, disposed:false, revealed:false, title:'',
    webview:{ cspSource:'test:', options:{}, html:'', postMessage:async()=>true, onDidReceiveMessage(fn){receiveListeners.push(fn);return{dispose(){}};} },
    onDidDispose(fn){disposeListeners.push(fn);return{dispose(){}};},
    onDidChangeViewState(fn){viewListeners.push(fn);return{dispose(){}};},
    reveal(){this.revealed=true;this.active=true;for(const listener of viewListeners)listener({webviewPanel:this});},
    dispose(){if(this.disposed)return;this.disposed=true;for(const listener of disposeListeners)listener();}
  };
}

const panels = [], contexts = new WeakMap();
function contextFor(panel) {
  if (!contexts.has(panel)) {
    let state = { identity:`context-${panels.indexOf(panel)}`, revision:1, selectionRevision:0, activeSurfaceId:null, selection:null };
    contexts.set(panel, { snapshot:() => ({...state}), update(changes={}) { state={...state,...changes,revision:state.revision+1,selectionRevision:state.selectionRevision+(Object.prototype.hasOwnProperty.call(changes,'selection')?1:0)}; return {...state}; } });
  }
  return contexts.get(panel);
}

let chooserOverride;
const vscode = {
  Uri:{ file:uriFile, parse:uriParse }, ViewColumn:{Active:1},
  workspace:{ textDocuments:[], onDidChangeTextDocument:()=>({dispose(){}}), onDidSaveTextDocument:()=>({dispose(){}}), onDidCloseTextDocument:()=>({dispose(){}}) },
  window:{ createWebviewPanel(){const panel=makePanel();panels.push(panel);return panel;}, showErrorMessage(){} },
  commands:{ executeCommand:async()=>true }
};

const originalLoad = Module._load;
const workspacePath = require.resolve('../src/character_dependency_workspace');
Module._load = function(request, parent, main) {
  if (request === 'vscode') return vscode;
  if (request === './character_picker') return { chooseCharacterDef:async input => {
    if (chooserOverride !== undefined) { const chosen=chooserOverride; chooserOverride=undefined; return chosen; }
    return input?.fsPath || input || null;
  } };
  if (request === './authoring_context_registry') return { registerAuthoringPanel:panel => ({panel}), getContextModel:entry => contextFor(entry.panel) };
  if (request === './viewer_group') return { preferredViewerColumn:()=>1, trackViewerPanel:panel=>panel, revealInViewerGroup:panel=>panel.reveal() };
  if (request === './viewer_navigation') return { openViewerSource:async()=>true, currentPoint:()=>({}), acknowledgeRestore:()=>true, registerSourcePanel(){} };
  if (request === './viewer_close') return { support(){}, prepare:async()=>true, clientScript:()=>'' };
  if (request === './webview_policy') return { protect:value=>value };
  return originalLoad.call(this, request, parent, main);
};

(async() => {
  let workspace;
  try {
    delete require.cache[workspacePath];
    workspace = require('../src/character_dependency_workspace');
    assert.strictEqual(typeof workspace.openCharacterDependencyWorkspace, 'function', 'test uses the real exported opener');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(workspace, 'populate'), false, 'retired populate rebind is not reintroduced');

    const panelA = await workspace.openCharacterDependencyWorkspace(uriFile(a));
    assert(panelA && panels.length === 1);
    const equivalentA = a.replace(/A\.def$/, 'a.DEF');
    assert.strictEqual(await workspace.openCharacterDependencyWorkspace(uriFile(equivalentA)), panelA, 'canonical/case-equivalent A reuses its keyed panel');
    assert.strictEqual(panelA.revealed, true, 'reused A is revealed');
    assert.strictEqual(panels.length, 1);

    const panelB = await workspace.openCharacterDependencyWorkspace(uriFile(b));
    assert(panelB && panelB !== panelA, 'distinct B receives an independent keyed panel');
    assert.strictEqual(panels.length, 2);
    assert.strictEqual(await workspace.openCharacterDependencyWorkspace(uriFile(b)), panelB, 'B remains reusable');
    assert.strictEqual(panelA.disposed, false, 'opening or reusing B does not mutate/dispose A');

    panelA.dispose();
    const reopenedA = await workspace.openCharacterDependencyWorkspace(uriFile(a));
    assert(reopenedA && reopenedA !== panelA, 'disposed A reopens as a new keyed owner');
    assert.strictEqual(panels.length, 3);
    assert.strictEqual(await workspace.openCharacterDependencyWorkspace(uriFile(b)), panelB, 'B remains reusable after A is disposed/reopened');

    chooserOverride = null;
    const beforeCancel = panels.length;
    assert.strictEqual(await workspace.openCharacterDependencyWorkspace(), null, 'chooser cancellation returns null');
    assert.strictEqual(panels.length, beforeCancel, 'chooser cancellation creates no panel');

    console.log('Character dependency opener preserves persistent keyed reuse, independent roots, disposal/reopen, and chooser cancellation');
  } finally {
    try { workspace?._resetForTests?.(); } catch (_) {}
    delete require.cache[workspacePath];
    Module._load = originalLoad;
    fs.rmSync(root, {recursive:true,force:true});
  }
})().catch(error => { console.error(error); process.exitCode=1; });
